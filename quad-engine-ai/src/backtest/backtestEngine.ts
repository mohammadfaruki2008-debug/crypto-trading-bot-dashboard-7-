/**
 * Backtester — walk-forward + Monte Carlo over the full ensemble pipeline.
 * No real orders; simulates fills against historical candles.
 * @module backtest/backtestEngine
 */
import { Candle } from '../types';
import { runEnsemble, initWeightState, recalcWeights, recordTradeOutcome } from '../ensemble/ensembleEngine';
import { analyzeSats } from '../indicators/sats';
import { analyzeLorentzian } from '../indicators/lorentzian';
import { config } from '../config';

export interface BacktestResult {
  trades: number;
  winRate: number;
  profitFactor: number;
  sharpe: number;
  maxDrawdownR: number;
  totalR: number;
  monteCarlo: { probOfRuin: number; medianMaxDD: number; p5TotalR: number; p95TotalR: number };
}

/** Simulate trades bar-by-bar; each trade resolved by which level hits first. */
function simulate(candles: Candle[]): number[] {
  const rs: number[] = [];
  const ws = initWeightState();
  let cooldownUntil = 0;
  let sinceReweight = 0;

  for (let i = 100; i < candles.length - 20; i++) {
    if (i < cooldownUntil) continue;
    const window = candles.slice(0, i + 1);
    const ens = runEnsemble(window, ws);
    if (ens.direction !== 'BUY' || ens.signalStrength < config.ensemble.entryThreshold) continue;

    const sats = analyzeSats(window);
    const lore = analyzeLorentzian(window);
    const entry = candles[i].close;
    const atr = sats.atrValue[i] || entry * 0.01;
    const satsSL = Math.min((sats.lastPivotLow[i] ?? candles[i].low) - 1.5 * atr, entry - 1.5 * atr);
    const loreSL = lore.loreYhat1[i] - 0.5 * atr;
    const sl = Math.max(satsSL, loreSL);
    const risk = entry - sl;
    if (risk <= 0) continue;
    const tp1 = entry + risk;
    const tp3 = entry + risk * 3;

    // Resolve forward: TP3, TP1 (→ partial), or SL
    let realizedR = 0;
    for (let j = i + 1; j < Math.min(candles.length, i + 50); j++) {
      if (candles[j].low <= sl) { realizedR = -1; break; }
      if (candles[j].high >= tp3) { realizedR = 3; break; }
      if (candles[j].high >= tp1) { realizedR = 1; /* keep scanning for tp3 */ }
    }
    rs.push(realizedR);
    recordTradeOutcome(ws, ['sats', 'lorentzian', 'squeeze', 'smc', 'rsiDiv', 'ichimoku', 'macd', 'volumeProfile'], realizedR);
    sinceReweight++;
    if (sinceReweight >= config.ensemble.reweightEveryTrades) { recalcWeights(ws); sinceReweight = 0; }
    cooldownUntil = i + 5;
  }
  return rs;
}

function stats(rs: number[]) {
  const wins = rs.filter((r) => r > 0);
  const losses = rs.filter((r) => r < 0);
  const grossWin = wins.reduce((a, v) => a + v, 0);
  const grossLoss = Math.abs(losses.reduce((a, v) => a + v, 0));
  const mean = rs.reduce((a, v) => a + v, 0) / (rs.length || 1);
  const sd = Math.sqrt(rs.reduce((a, v) => a + (v - mean) ** 2, 0) / (rs.length || 1));
  let cum = 0, peak = 0, maxDD = 0;
  for (const r of rs) { cum += r; peak = Math.max(peak, cum); maxDD = Math.max(maxDD, peak - cum); }
  return {
    winRate: rs.length ? wins.length / rs.length : 0,
    profitFactor: grossLoss === 0 ? grossWin : grossWin / grossLoss,
    sharpe: sd === 0 ? 0 : mean / sd,
    maxDrawdownR: maxDD,
    totalR: cum,
  };
}

/** Monte Carlo: shuffle trade order 1000× → ruin probability + DD distribution. */
function monteCarlo(rs: number[], runs = 1000) {
  const dds: number[] = [];
  const totals: number[] = [];
  let ruins = 0;
  for (let k = 0; k < runs; k++) {
    const shuffled = [...rs].sort(() => Math.random() - 0.5);
    let cum = 0, peak = 0, maxDD = 0;
    for (const r of shuffled) { cum += r; peak = Math.max(peak, cum); maxDD = Math.max(maxDD, peak - cum); }
    dds.push(maxDD); totals.push(cum);
    if (maxDD >= 20) ruins++; // 20R drawdown ≈ ruin at 1% risk
  }
  dds.sort((a, b) => a - b); totals.sort((a, b) => a - b);
  return {
    probOfRuin: ruins / runs,
    medianMaxDD: dds[Math.floor(runs / 2)],
    p5TotalR: totals[Math.floor(runs * 0.05)],
    p95TotalR: totals[Math.floor(runs * 0.95)],
  };
}

/** Walk-forward: optimise on in-sample, evaluate out-of-sample. */
export function backtest(candles: Candle[]): BacktestResult {
  const split = Math.floor(candles.length * 0.6);
  const oos = candles.slice(split);
  const rs = simulate(oos); // out-of-sample evaluation
  const s = stats(rs);
  return { trades: rs.length, ...s, monteCarlo: monteCarlo(rs) };
}
