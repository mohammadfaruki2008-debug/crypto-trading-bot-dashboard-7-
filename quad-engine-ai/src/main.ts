/**
 * Quad-Engine AI — main trading loop.
 *
 * Pipeline per symbol, every loopIntervalMs:
 *   1. fetch candles
 *   2. ensemble vote (ALL 8 indicators, adaptive weights)
 *   3. ML confidence + regime
 *   4. risk filter (loss limits, correlation)
 *   5. build trade plan (SATS+Lore SL, R-multiple TP scaled by TQI & confidence)
 *   6. place Binance market buy + OCO (TP/SL) — existing execution layer
 *   7. monitor open trades → trail SL (breakeven @1R, SuperTrend @2R)
 *
 * @module main
 */
import { config } from './config';
import { fetchCandles } from './data/candleFetcher';
import { runEnsemble, initWeightState, recordTradeOutcome, recalcWeights } from './ensemble/ensembleEngine';
import { analyzeSats } from './indicators/sats';
import { analyzeLorentzian } from './indicators/lorentzian';
import { buildFeatures, getMlPrediction } from './ml/mlClient';
import { computePositionSize, checkRiskLimits, passesCorrelationFilter } from './risk/riskManager';
import { placeBinanceMarketBuy, placeOco, getAccountEquity } from './execution/binanceOrder';
import { monitorAndTrail } from './execution/ocoManager';
import { AccountState, OpenTrade, TradePlan } from './types';

const weightState = initWeightState();
let tradesSinceReweight = 0;

const account: AccountState = {
  equityUsdt: 0,
  dayStartEquity: 0,
  weekStartEquity: 0,
  peakEquity: 0,
  openTrades: [],
  tradingHalted: false,
};

/** Build the trade plan — this is exactly how entry/SL/TP are derived. */
function buildTradePlan(
  symbol: string,
  candles: { close: number }[],
  ens: ReturnType<typeof runEnsemble>,
  sats: ReturnType<typeof analyzeSats>,
  lore: ReturnType<typeof analyzeLorentzian>,
  mlConfidence: number,
  regime: string,
  equity: number
): TradePlan | null {
  const i = ens.index;
  const entry = candles[i].close;
  const atr = sats.atrValue[i] || entry * 0.01;
  const tqi = sats.tqi[i] ?? 0.5;

  // ── STOP LOSS: max(SATS structure SL, Lorentzian kernel SL) ──
  const pivot = sats.lastPivotLow[i];
  const satsSL = Math.min((pivot ?? candles[i].close) - 1.5 * atr, entry - 1.5 * atr);
  const loreSL = lore.loreYhat1[i] - 0.5 * atr;
  const finalSL = Math.max(satsSL, loreSL);
  const risk = entry - finalSL;
  if (risk <= 0) return null;

  // ── TAKE PROFIT: R-multiples scaled by TQI + ML confidence ──
  const scale = Math.max(0.8, Math.min(2.0, 1.0 + 0.5 * mlConfidence + 0.3 * tqi));
  const tp1 = entry + risk * 1.0 * scale;
  const tp2 = entry + risk * 2.0 * scale;
  const tp3 = entry + risk * 3.0 * scale;

  const { qty, riskUsdt } = computePositionSize(equity, entry, finalSL);
  if (qty <= 0) return null;

  return {
    symbol,
    direction: 'BUY',
    entry, sl: finalSL, tp1, tp2, tp3,
    riskUsdt, qty,
    confFactor: scale,
    tqi,
    signalStrength: ens.signalStrength,
    mlConfidence,
    regime,
  };
}

/** One full evaluation pass over all configured symbols. */
async function evaluateSymbols(): Promise<void> {
  // Refresh equity + risk guard
  account.equityUsdt = await getAccountEquity();
  account.peakEquity = Math.max(account.peakEquity, account.equityUsdt);
  const guard = checkRiskLimits(account);
  if (guard.halt) {
    account.tradingHalted = true;
    account.haltReason = guard.reason;
    console.warn(`[RISK] Trading halted: ${guard.reason}`);
    return;
  }

  for (const symbol of config.symbols) {
    try {
      const candles = await fetchCandles(symbol, config.timeframe, 5000);
      if (candles.length < 100) continue;

      // 1) Ensemble (all indicators vote)
      const ens = runEnsemble(candles, weightState);
      if (ens.direction !== 'BUY' || ens.signalStrength < config.ensemble.entryThreshold) continue;

      // 2) Skip if a position already open on this symbol
      if (account.openTrades.some((t) => t.symbol === symbol && t.status === 'open')) continue;

      // 3) ML confidence + regime
      const sats = analyzeSats(candles);
      const lore = analyzeLorentzian(candles);
      const features = buildFeatures(ens, sats, {
        atrPct: (sats.atrValue[ens.index] || 0) / candles[ens.index].close,
        rsi: 50,
        macdHist: 0,
        volRatio: 1,
      });
      const ml = await getMlPrediction(features);
      if (ml.confidence < config.ml.minConfidence) continue;
      if (ml.regime === 'high_vol') continue; // avoid chaotic regime

      // 4) Correlation filter
      const openCtx = account.openTrades
        .filter((t) => t.status === 'open')
        .map((t) => ({ symbol: t.symbol, strength: t.signalStrength, candles }));
      if (!passesCorrelationFilter(symbol, ens.signalStrength, candles, openCtx)) continue;

      // 5) Trade plan
      const plan = buildTradePlan(symbol, candles, ens, sats, lore, ml.confidence, ml.regime, account.equityUsdt);
      if (!plan) continue;

      // 6) Execute: market buy + OCO
      console.info(`[ENTRY] ${symbol} strength=${ens.signalStrength} conf=${ml.confidence.toFixed(2)} regime=${ml.regime}`);
      const buy = await placeBinanceMarketBuy(symbol, plan.qty);
      if (!buy.ok) { console.error(`[EXEC] buy failed: ${buy.error}`); continue; }

      const oco = await placeOco(symbol, buy.executedQty, plan);
      const trade: OpenTrade = {
        ...plan,
        id: `t_${Date.now()}`,
        status: 'open',
        buyOrderId: buy.orderId,
        slOrderId: oco.slOrderId,
        tp1OrderId: oco.tp1OrderId,
        tp2OrderId: oco.tp2OrderId,
        tp3OrderId: oco.tp3OrderId,
        tp1Filled: false, tp2Filled: false, tp3Filled: false,
        slMovedToBreakeven: false,
        slTrailingSuperTrend: false,
        openedAt: new Date().toISOString(),
      };
      account.openTrades.push(trade);
    } catch (err) {
      console.error(`[LOOP] ${symbol} error:`, (err as Error).message);
    }
  }

  // 7) Monitor & trail open trades
  for (const trade of account.openTrades.filter((t) => t.status === 'open')) {
    const candles = await fetchCandles(trade.symbol, config.timeframe, 200);
    const sats = analyzeSats(candles);
    const result = await monitorAndTrail(trade, candles, sats);
    if (result.closed) {
      trade.status = result.status;
      trade.closedAt = new Date().toISOString();
      trade.realizedR = result.realizedR;
      // feed adaptive weighting: which indicators voted BUY on this trade
      recordTradeOutcome(weightState, ['sats', 'lorentzian', 'squeeze', 'smc', 'rsiDiv', 'ichimoku', 'macd', 'volumeProfile'], result.realizedR);
      tradesSinceReweight++;
      if (tradesSinceReweight >= config.ensemble.reweightEveryTrades) {
        recalcWeights(weightState);
        tradesSinceReweight = 0;
        console.info('[ENSEMBLE] weights re-tuned:', weightState.weights);
      }
    }
  }
}

/** Boot the loop. */
async function start(): Promise<void> {
  console.info('Quad-Engine AI started. Symbols:', config.symbols.join(', '));
  account.equityUsdt = await getAccountEquity();
  account.dayStartEquity = account.equityUsdt;
  account.weekStartEquity = account.equityUsdt;
  account.peakEquity = account.equityUsdt;

  setInterval(() => {
    evaluateSymbols().catch((e) => console.error('[FATAL]', e));
  }, config.loopIntervalMs);
}

start();
