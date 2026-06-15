/**
 * Risk Manager — position sizing, loss limits, drawdown halt, correlation filter.
 * @module risk/riskManager
 */
import { AccountState, Candle } from '../types';
import { config } from '../config';

/**
 * Position size so that hitting SL loses exactly `riskPerTradePct` of equity.
 * @returns base-asset quantity to buy.
 */
export function computePositionSize(
  equityUsdt: number,
  entry: number,
  sl: number
): { qty: number; riskUsdt: number } {
  const riskUsdt = equityUsdt * (config.risk.riskPerTradePct / 100);
  const perUnitRisk = Math.abs(entry - sl);
  if (perUnitRisk <= 0) return { qty: 0, riskUsdt: 0 };
  const qty = riskUsdt / perUnitRisk;
  return { qty, riskUsdt };
}

/**
 * Check daily/weekly loss limits + max drawdown. Returns halt decision.
 */
export function checkRiskLimits(acc: AccountState): { halt: boolean; reason?: string } {
  const dayPnlPct = ((acc.equityUsdt - acc.dayStartEquity) / acc.dayStartEquity) * 100;
  const weekPnlPct = ((acc.equityUsdt - acc.weekStartEquity) / acc.weekStartEquity) * 100;
  const drawdownPct = ((acc.peakEquity - acc.equityUsdt) / acc.peakEquity) * 100;

  if (dayPnlPct <= -config.risk.dailyLossLimitPct)
    return { halt: true, reason: `Daily loss limit hit (${dayPnlPct.toFixed(2)}%)` };
  if (weekPnlPct <= -config.risk.weeklyLossLimitPct)
    return { halt: true, reason: `Weekly loss limit hit (${weekPnlPct.toFixed(2)}%)` };
  if (drawdownPct >= config.risk.maxDrawdownPct)
    return { halt: true, reason: `Max drawdown hit (${drawdownPct.toFixed(2)}%)` };

  return { halt: false };
}

/** Pearson correlation of two equal-length return series. */
function correlation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 10) return 0;
  const am = a.slice(-n), bm = b.slice(-n);
  const ma = am.reduce((x, y) => x + y, 0) / n;
  const mb = bm.reduce((x, y) => x + y, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    num += (am[i] - ma) * (bm[i] - mb);
    da += (am[i] - ma) ** 2;
    db += (bm[i] - mb) ** 2;
  }
  return da === 0 || db === 0 ? 0 : num / Math.sqrt(da * db);
}

/** Daily returns from candles. */
function returns(candles: Candle[]): number[] {
  const r: number[] = [];
  for (let i = 1; i < candles.length; i++) r.push((candles[i].close - candles[i - 1].close) / candles[i - 1].close);
  return r;
}

/**
 * Correlation filter: given the symbol we want to trade and the set of symbols
 * already having open trades, return false if a held symbol is correlated > 0.7
 * (so we only keep the strongest signal among correlated assets).
 */
export function passesCorrelationFilter(
  candidateSymbol: string,
  candidateStrength: number,
  candidateCandles: Candle[],
  openPositions: { symbol: string; strength: number; candles: Candle[] }[]
): boolean {
  const candR = returns(candidateCandles).slice(-30);
  for (const pos of openPositions) {
    if (pos.symbol === candidateSymbol) continue;
    const corr = Math.abs(correlation(candR, returns(pos.candles).slice(-30)));
    if (corr > config.risk.correlationThreshold && pos.strength >= candidateStrength) {
      return false; // an equally/more-correlated, stronger position already exists
    }
  }
  return true;
}
