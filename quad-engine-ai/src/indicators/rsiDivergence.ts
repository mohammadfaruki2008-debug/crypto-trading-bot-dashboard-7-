/**
 * RSI Divergence Pro (Regular + Hidden) — faithful port of
 * "RSI Divergence Pro (@darshakssc)" Pine v6.
 *
 * Tracks the LAST 2 RSI pivots (high & low) and compares price vs RSI with
 * configurable min-distance + min-RSI-difference filters — exactly like the
 * source script (not the generic divergence used before).
 *
 * @module indicators/rsiDivergence
 */
import { Candle, RsiDivergenceResult } from '../types';

function rma(arr: number[], len: number): number[] {
  const out = new Array(arr.length).fill(NaN);
  let prev = NaN, seed = 0, count = 0;
  for (let i = 0; i < arr.length; i++) {
    if (isNaN(arr[i])) continue;
    if (isNaN(prev)) {
      seed += arr[i]; count++;
      if (count === len) { prev = seed / len; out[i] = prev; }
    } else {
      prev = (prev * (len - 1) + arr[i]) / len;
      out[i] = prev;
    }
  }
  return out;
}

function rsiSeries(closes: number[], len: number): number[] {
  const gains = new Array(closes.length).fill(0);
  const losses = new Array(closes.length).fill(0);
  for (let i = 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gains[i] = Math.max(d, 0);
    losses[i] = Math.max(-d, 0);
  }
  const ag = rma(gains, len), al = rma(losses, len);
  return ag.map((g, i) => (isNaN(g) || isNaN(al[i]) ? NaN : al[i] === 0 ? 100 : 100 - 100 / (1 + g / al[i])));
}

/** ta.pivotlow(series, left, right) → value at the pivot bar, else NaN. */
function pivotLow(series: number[], left: number, right: number, i: number): number {
  const p = i - right;
  if (p - left < 0 || i >= series.length) return NaN;
  const v = series[p];
  if (isNaN(v)) return NaN;
  for (let j = p - left; j <= p + right; j++) {
    if (j === p) continue;
    if (isNaN(series[j]) || series[j] < v) return NaN;
  }
  return v;
}
function pivotHigh(series: number[], left: number, right: number, i: number): number {
  const p = i - right;
  if (p - left < 0 || i >= series.length) return NaN;
  const v = series[p];
  if (isNaN(v)) return NaN;
  for (let j = p - left; j <= p + right; j++) {
    if (j === p) continue;
    if (isNaN(series[j]) || series[j] > v) return NaN;
  }
  return v;
}

export function analyzeRsiDivergence(
  candles: Candle[],
  rsiLength = 14,
  leftBars = 2,
  rightBars = 2,
  minDistBars = 5,
  minRsiDiff = 2.0
): RsiDivergenceResult {
  const n = candles.length;
  const closes = candles.map((c) => c.close);
  const lows = candles.map((c) => c.low);
  const highs = candles.map((c) => c.high);
  const rsi = rsiSeries(closes, rsiLength);

  const regularBullish = new Array(n).fill(false);
  const regularBearish = new Array(n).fill(false);
  const hiddenBullish = new Array(n).fill(false);
  const hiddenBearish = new Array(n).fill(false);

  // Track last 2 low pivots and last 2 high pivots (price + rsi + bar) — like the var declarations in source
  let lowBar1 = NaN, lowBar2 = NaN, lowPrice1 = NaN, lowPrice2 = NaN, lowRsi1 = NaN, lowRsi2 = NaN;
  let highBar1 = NaN, highBar2 = NaN, highPrice1 = NaN, highPrice2 = NaN, highRsi1 = NaN, highRsi2 = NaN;

  const distOK = (b1: number, b2: number) => !isNaN(b1) && !isNaN(b2) && b1 - b2 >= minDistBars;

  for (let i = 0; i < n; i++) {
    const pLow = pivotLow(rsi, leftBars, rightBars, i);
    const pHigh = pivotHigh(rsi, leftBars, rightBars, i);

    // Update low pivots (price pivot AND rsi pivot present at same bar in source —
    // here rsi pivot drives it; price taken at low[rightBars])
    if (!isNaN(pLow)) {
      const pivotBarLow = i - rightBars;
      lowBar2 = lowBar1; lowPrice2 = lowPrice1; lowRsi2 = lowRsi1;
      lowBar1 = pivotBarLow; lowPrice1 = lows[pivotBarLow]; lowRsi1 = rsi[pivotBarLow];

      if (distOK(lowBar1, lowBar2) && !isNaN(lowPrice2) && !isNaN(lowRsi2)) {
        const diff = Math.abs(lowRsi1 - lowRsi2);
        // Regular bullish: price lower-low, rsi higher-low
        if (lowPrice1 < lowPrice2 && lowRsi1 > lowRsi2 && diff >= minRsiDiff) regularBullish[pivotBarLow] = true;
        // Hidden bullish: price higher-low, rsi lower-low
        if (lowPrice1 > lowPrice2 && lowRsi1 < lowRsi2 && diff >= minRsiDiff) hiddenBullish[pivotBarLow] = true;
      }
    }

    // Update high pivots
    if (!isNaN(pHigh)) {
      const pivotBarHigh = i - rightBars;
      highBar2 = highBar1; highPrice2 = highPrice1; highRsi2 = highRsi1;
      highBar1 = pivotBarHigh; highPrice1 = highs[pivotBarHigh]; highRsi1 = rsi[pivotBarHigh];

      if (distOK(highBar1, highBar2) && !isNaN(highPrice2) && !isNaN(highRsi2)) {
        const diff = Math.abs(highRsi1 - highRsi2);
        // Regular bearish: price higher-high, rsi lower-high
        if (highPrice1 > highPrice2 && highRsi1 < highRsi2 && diff >= minRsiDiff) regularBearish[pivotBarHigh] = true;
        // Hidden bearish: price lower-high, rsi higher-high
        if (highPrice1 < highPrice2 && highRsi1 > highRsi2 && diff >= minRsiDiff) hiddenBearish[pivotBarHigh] = true;
      }
    }
  }

  return { rsi, regularBullish, regularBearish, hiddenBullish, hiddenBearish };
}
