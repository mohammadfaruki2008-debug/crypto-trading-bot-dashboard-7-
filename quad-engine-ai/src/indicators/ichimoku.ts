/**
 * Ichimoku Trend Oscillator [Gabremoku] — faithful Pine v6 port.
 *
 * NOT a plain cloud indicator — this is a normalized TREND FORCE oscillator:
 *   force = tkSpread + priceVsCloud + cloudStructure  (ATR/cloud-normalized,
 *   EMA-smoothed, clamped ±100). Signals = zero-cross + momentum-shift.
 *
 * Output is mapped into the IchimokuResult interface plus the raw force fields.
 *
 * @module indicators/ichimoku
 */
import { Candle, IchimokuResult } from '../types';

function highest(arr: number[], len: number, i: number): number {
  if (i < len - 1) return NaN;
  let h = -Infinity;
  for (let j = i - len + 1; j <= i; j++) h = Math.max(h, arr[j]);
  return h;
}
function lowest(arr: number[], len: number, i: number): number {
  if (i < len - 1) return NaN;
  let l = Infinity;
  for (let j = i - len + 1; j <= i; j++) l = Math.min(l, arr[j]);
  return l;
}
function ema(src: number[], len: number): number[] {
  const k = 2 / (len + 1);
  const out = new Array(src.length).fill(NaN);
  let prev = NaN;
  for (let i = 0; i < src.length; i++) {
    if (isNaN(src[i])) { out[i] = prev; continue; }
    prev = isNaN(prev) ? src[i] : src[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}
function atr(candles: Candle[], len: number): number[] {
  const out = new Array(candles.length).fill(NaN);
  let prev = NaN;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const pc = i > 0 ? candles[i - 1].close : c.close;
    const tr = Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc));
    prev = isNaN(prev) ? tr : (prev * (len - 1) + tr) / len;
    out[i] = prev;
  }
  return out;
}
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

export interface IchimokuForce {
  force: number[];        // clamped ±100 EMA-smoothed force
  signalLine: number[];
  hist: number[];
  longSignal: boolean[];  // zero cross up
  shortSignal: boolean[]; // zero cross down
  bullShift: boolean[];
  bearShift: boolean[];
}

export function analyzeIchimoku(
  candles: Candle[],
  tenkanLen = 9,
  kijunLen = 26,
  senkouBLen = 52,
  forceSmoothLen = 5,
  forceScale = 100,
  neutralZone = 8,
  shiftThreshold = 12,
  mintick = 0.01
): IchimokuResult & IchimokuForce {
  const n = candles.length;
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const closes = candles.map((c) => c.close);

  const tenkan = new Array(n).fill(NaN);
  const kijun = new Array(n).fill(NaN);
  const senkouA = new Array(n).fill(NaN);
  const senkouB = new Array(n).fill(NaN);
  const chikou = new Array(n).fill(NaN);

  const donch = (len: number, i: number) => (highest(highs, len, i) + lowest(lows, len, i)) / 2;

  const tkSpreadRaw: number[] = new Array(n).fill(0);
  const priceCloudRaw: number[] = new Array(n).fill(0);
  const cloudStructRaw: number[] = new Array(n).fill(0);
  const atrBase = atr(candles, kijunLen);

  for (let i = 0; i < n; i++) {
    tenkan[i] = donch(tenkanLen, i);
    kijun[i] = donch(kijunLen, i);
    senkouA[i] = (tenkan[i] + kijun[i]) / 2;
    senkouB[i] = donch(senkouBLen, i);
    if (i - kijunLen >= 0) chikou[i - kijunLen] = closes[i];

    const cloudTop = Math.max(senkouA[i], senkouB[i]);
    const cloudBot = Math.min(senkouA[i], senkouB[i]);
    const cloudSize = Math.abs(senkouA[i] - senkouB[i]);
    const cloudBias = senkouA[i] > senkouB[i] ? 1 : senkouA[i] < senkouB[i] ? -1 : 0;
    const normBase = Math.max(atrBase[i] || mintick, cloudSize, mintick);
    const src = closes[i];

    tkSpreadRaw[i] = ((tenkan[i] - kijun[i]) / normBase) * forceScale;
    priceCloudRaw[i] =
      src > cloudTop ? ((src - cloudTop) / normBase) * (forceScale * 0.45) :
      src < cloudBot ? ((src - cloudBot) / normBase) * (forceScale * 0.45) : 0;
    cloudStructRaw[i] = cloudBias * ((cloudSize / normBase) * (forceScale * 0.30));
  }

  const rawForce = tkSpreadRaw.map((v, i) => clamp(v + priceCloudRaw[i] + cloudStructRaw[i], -forceScale, forceScale));
  const forceArr = ema(rawForce, forceSmoothLen).map((v) => clamp(v, -100, 100));
  const signalLine = ema(forceArr, Math.max(2, forceSmoothLen * 2));
  const hist = forceArr.map((v, i) => v - signalLine[i]);

  const longSignal = new Array(n).fill(false);
  const shortSignal = new Array(n).fill(false);
  const bullShift = new Array(n).fill(false);
  const bearShift = new Array(n).fill(false);

  // IchimokuResult interface fields
  const tkCrossBull = new Array(n).fill(false);
  const tkCrossBear = new Array(n).fill(false);
  const kumoBreakoutBull = new Array(n).fill(false);
  const kumoBreakoutBear = new Array(n).fill(false);
  const priceAboveKumo = new Array(n).fill(false);
  const priceBelowKumo = new Array(n).fill(false);

  for (let i = 1; i < n; i++) {
    // zero cross
    if (forceArr[i - 1] <= 0 && forceArr[i] > 0) longSignal[i] = true;
    if (forceArr[i - 1] >= 0 && forceArr[i] < 0) shortSignal[i] = true;
    const momShift = forceArr[i] - forceArr[i - 1];
    if (momShift > shiftThreshold && forceArr[i] > 0 && !longSignal[i]) bullShift[i] = true;
    if (momShift < -shiftThreshold && forceArr[i] < 0 && !shortSignal[i]) bearShift[i] = true;

    // cloud relations for the generic interface
    const cloudTop = Math.max(senkouA[i], senkouB[i]);
    const cloudBot = Math.min(senkouA[i], senkouB[i]);
    priceAboveKumo[i] = closes[i] > cloudTop;
    priceBelowKumo[i] = closes[i] < cloudBot;
    if (tenkan[i - 1] <= kijun[i - 1] && tenkan[i] > kijun[i]) tkCrossBull[i] = true;
    if (tenkan[i - 1] >= kijun[i - 1] && tenkan[i] < kijun[i]) tkCrossBear[i] = true;
    if (closes[i - 1] <= Math.max(senkouA[i - 1], senkouB[i - 1]) && closes[i] > cloudTop) kumoBreakoutBull[i] = true;
    if (closes[i - 1] >= Math.min(senkouA[i - 1], senkouB[i - 1]) && closes[i] < cloudBot) kumoBreakoutBear[i] = true;
  }

  void neutralZone; // retained for parity; states derive from force sign in ensemble

  return {
    tenkan, kijun, senkouA, senkouB, chikou,
    tkCrossBull, tkCrossBear, kumoBreakoutBull, kumoBreakoutBear,
    priceAboveKumo, priceBelowKumo,
    force: forceArr, signalLine, hist, longSignal, shortSignal, bullShift, bearShift,
  };
}
