/**
 * Squeeze Momentum (LazyBear) — REFACTORED from your existing quadEngine.ts.
 * Paste your validated `calcSqueeze()` body verbatim.
 * @module indicators/squeeze
 */
import { Candle, SqueezeResult } from '../types';

export function analyzeSqueeze(candles: Candle[]): SqueezeResult {
  // PASTE calcSqueeze(candles) body — returns { sqzVal, sqzOn, sqzOff }.
  // Then derive fired flags exactly as in quadEngine:
  //   sqzFiredBullish = sqzOff && sqzVal>0 && sqzVal>sqzVal[-1]
  //   sqzFiredBearish = sqzOff && sqzVal<0 && sqzVal<sqzVal[-1]
  throw new Error('analyzeSqueeze: paste calcSqueeze body from quadEngine.ts');
}
