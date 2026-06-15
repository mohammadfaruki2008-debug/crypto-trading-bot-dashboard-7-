/**
 * Volume Profile + VAH/VAL/POC — faithful port of
 * "T_Volume Profile + VAH, VAL, and POC" Pine v5 (TheRealDrip2Rip).
 *
 * Matches the source exactly:
 *  - per-candle volume distributed ACROSS the bins its range spans (overlap-weighted)
 *  - buy/sell split by BODY PROPORTIONAL (bodyUp / bodySum)
 *  - POC = max total-volume bin
 *  - Value Area = expand from POC until vaPercent of volume captured
 *
 * @module indicators/volumeProfile
 */
import { Candle, VolumeProfileResult } from '../types';

const clampInt = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export function analyzeVolumeProfile(
  candles: Candle[],
  bins = 25,
  barsBack = 100,
  vaPercent = 70.0,
  splitMethod: 'Body Proportional' | 'Up/Down Candle' = 'Body Proportional'
): VolumeProfileResult & { buyVols: number[]; sellVols: number[] } {
  const barsToScan = Math.min(barsBack, candles.length);
  const slice = candles.slice(-barsToScan);
  if (slice.length === 0) {
    return { poc: 0, vah: 0, val: 0, bins: [], buyVols: [], sellVols: [] };
  }

  // Window price range
  let minP = Infinity, maxP = -Infinity;
  for (const c of slice) { minP = Math.min(minP, c.low); maxP = Math.max(maxP, c.high); }
  if (!(maxP > minP)) {
    return { poc: 0, vah: 0, val: 0, bins: [], buyVols: [], sellVols: [] };
  }
  const step = (maxP - minP) / bins;

  const buyVols = new Array(bins).fill(0);
  const sellVols = new Array(bins).fill(0);

  // Accumulate buy/sell per bin (overlap-weighted, body-proportional split)
  for (const c of slice) {
    const rng = c.high - c.low;
    let bullFrac = 0, bearFrac = 1;
    if (splitMethod === 'Up/Down Candle') {
      bullFrac = c.close >= c.open ? 1 : 0;
      bearFrac = 1 - bullFrac;
    } else {
      const bodyUp = Math.max(c.close - c.open, 0);
      const bodyDown = Math.max(c.open - c.close, 0);
      const bodySum = bodyUp + bodyDown;
      if (bodySum > 0) { bullFrac = bodyUp / bodySum; bearFrac = bodyDown / bodySum; }
      else { bullFrac = 0.5; bearFrac = 0.5; }
    }

    if (rng > 0 && step > 0) {
      const startBin = clampInt(Math.floor((c.low - minP) / step), 0, bins - 1);
      const endBin = clampInt(Math.floor((c.high - minP) / step), 0, bins - 1);
      for (let b = startBin; b <= endBin; b++) {
        const binLo = minP + b * step;
        const binHi = binLo + step;
        const overlap = Math.max(Math.min(c.high, binHi) - Math.max(c.low, binLo), 0);
        if (overlap > 0) {
          const vShare = c.volume * (overlap / rng);
          buyVols[b] += vShare * bullFrac;
          sellVols[b] += vShare * bearFrac;
        }
      }
    } else {
      const px = (c.high + c.low + c.close) / 3;
      const idx = clampInt(Math.floor((px - minP) / step), 0, bins - 1);
      buyVols[idx] += c.volume * bullFrac;
      sellVols[idx] += c.volume * bearFrac;
    }
  }

  // Totals + POC
  const totals = buyVols.map((b, i) => b + sellVols[i]);
  let totalVolSum = 0, maxVol = 0, pocIdx = 0;
  for (let b = 0; b < bins; b++) {
    totalVolSum += totals[b];
    if (totals[b] > maxVol) { maxVol = totals[b]; pocIdx = b; }
  }

  // Value area from POC
  const target = totalVolSum * (vaPercent / 100);
  let left = pocIdx, right = pocIdx, cum = totals[pocIdx];
  while (cum < target && (left > 0 || right < bins - 1)) {
    const leftVol = left > 0 ? totals[left - 1] : -1;
    const rightVol = right < bins - 1 ? totals[right + 1] : -1;
    if (rightVol >= leftVol && right < bins - 1) { right++; cum += totals[right]; }
    else if (left > 0) { left--; cum += totals[left]; }
    else break;
  }
  const val = minP + left * step;
  const vah = minP + (right + 1) * step;
  const poc = minP + (pocIdx + 0.5) * step;

  const binsOut = totals.map((v, b) => ({ price: minP + (b + 0.5) * step, volume: v }));

  return { poc, vah, val, bins: binsOut, buyVols, sellVols };
}
