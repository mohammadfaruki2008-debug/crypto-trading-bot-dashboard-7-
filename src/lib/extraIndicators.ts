// ============================================================================
// Extra indicators for the Quantum Mind chart — faithful Pine ports:
//   • RSI Divergence Pro (@darshakssc)   — regular + hidden, last-2-pivot track
//   • Ichimoku Trend Oscillator (Gabremoku) — normalized ±100 force
//   • MACD + Divergence (Dynamic Filter) — osc pivots + valuewhen/_inRange
//   • Volume Profile (TheRealDrip2Rip)   — POC / VAH / VAL, body-prop split
// ============================================================================

import { Candle } from './quadEngine';

// ─── shared helpers ────────────────────────────────────────────────
function sma(src: number[], len: number): number[] {
  const out = new Array(src.length).fill(NaN);
  for (let i = len - 1; i < src.length; i++) {
    let s = 0, ok = true;
    for (let j = i - len + 1; j <= i; j++) { if (isNaN(src[j])) { ok = false; break; } s += src[j]; }
    if (ok) out[i] = s / len;
  }
  return out;
}
function ema(src: number[], len: number): number[] {
  const k = 2 / (len + 1);
  const out = new Array(src.length).fill(NaN);
  let prev = NaN, seed = 0, count = 0;
  for (let i = 0; i < src.length; i++) {
    if (isNaN(src[i])) { out[i] = prev; continue; }
    if (isNaN(prev)) { seed += src[i]; count++; if (count === len) { prev = seed / len; out[i] = prev; } }
    else { prev = src[i] * k + prev * (1 - k); out[i] = prev; }
  }
  return out;
}
function rma(arr: number[], len: number): number[] {
  const out = new Array(arr.length).fill(NaN);
  let prev = NaN, seed = 0, count = 0;
  for (let i = 0; i < arr.length; i++) {
    if (isNaN(arr[i])) continue;
    if (isNaN(prev)) { seed += arr[i]; count++; if (count === len) { prev = seed / len; out[i] = prev; } }
    else { prev = (prev * (len - 1) + arr[i]) / len; out[i] = prev; }
  }
  return out;
}
function stdev(src: number[], len: number): number[] {
  const m = sma(src, len);
  return src.map((_, i) => {
    if (isNaN(m[i])) return NaN;
    let s = 0;
    for (let j = i - len + 1; j <= i; j++) s += (src[j] - m[i]) ** 2;
    return Math.sqrt(s / len);
  });
}
function rsiSeries(closes: number[], len: number): number[] {
  const gains = new Array(closes.length).fill(0), losses = new Array(closes.length).fill(0);
  for (let i = 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gains[i] = Math.max(d, 0); losses[i] = Math.max(-d, 0);
  }
  const ag = rma(gains, len), al = rma(losses, len);
  return ag.map((g, i) => (isNaN(g) || isNaN(al[i]) ? NaN : al[i] === 0 ? 100 : 100 - 100 / (1 + g / al[i])));
}
function highest(arr: number[], len: number, i: number): number {
  if (i < len - 1) return NaN; let h = -Infinity;
  for (let j = i - len + 1; j <= i; j++) h = Math.max(h, arr[j]); return h;
}
function lowest(arr: number[], len: number, i: number): number {
  if (i < len - 1) return NaN; let l = Infinity;
  for (let j = i - len + 1; j <= i; j++) l = Math.min(l, arr[j]); return l;
}
function atrSeries(candles: Candle[], len: number): number[] {
  const out = new Array(candles.length).fill(NaN); let prev = NaN;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i]; const pc = i > 0 ? candles[i - 1].close : c.close;
    const tr = Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc));
    prev = isNaN(prev) ? tr : (prev * (len - 1) + tr) / len; out[i] = prev;
  }
  return out;
}
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const pivLow = (s: number[], l: number, r: number, i: number): boolean => {
  const p = i - r; if (p - l < 0 || i >= s.length || isNaN(s[p])) return false;
  for (let j = p - l; j <= p + r; j++) { if (j === p) continue; if (isNaN(s[j]) || s[j] < s[p]) return false; } return true;
};
const pivHigh = (s: number[], l: number, r: number, i: number): boolean => {
  const p = i - r; if (p - l < 0 || i >= s.length || isNaN(s[p])) return false;
  for (let j = p - l; j <= p + r; j++) { if (j === p) continue; if (isNaN(s[j]) || s[j] > s[p]) return false; } return true;
};

// ─── result type for the last bar ──────────────────────────────────
export interface ExtraIndicators {
  // RSI Divergence
  rsi: number;
  rsiRegularBull: boolean;
  rsiRegularBear: boolean;
  rsiHiddenBull: boolean;
  rsiHiddenBear: boolean;
  // Ichimoku force oscillator
  ichiForce: number;       // ±100
  ichiState: string;       // Bullish Expansion / Pressure / Neutral / ...
  ichiLong: boolean;
  ichiShort: boolean;
  // MACD
  macd: number;
  macdSignal: number;
  macdHist: number;
  macdBullCross: boolean;
  macdBearCross: boolean;
  macdBullDiv: boolean;
  macdBearDiv: boolean;
  // Volume Profile
  poc: number;
  vah: number;
  val: number;
  priceVsPoc: 'above' | 'below' | 'at';
  // Smart Money Concepts
  smcTrend: 'bullish' | 'bearish' | 'neutral';
  smcBOS: boolean;        // Break of Structure (recent)
  smcCHoCH: boolean;      // Change of Character (recent)
  smcInOrderBlock: boolean;
}

/** Compute all 4 extra indicators and return the LAST-bar snapshot. */
export function computeExtraIndicators(candles: Candle[]): ExtraIndicators {
  const n = candles.length;
  const last = n - 1;
  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);

  // ===== RSI Divergence Pro (@darshakssc) — FAITHFUL port =====
  // Source requires BOTH a price pivot AND an rsi pivot to be confirmed at the
  // SAME bar (`not na(pricePivotLow) and not na(rsiPivotLow)`). It then tracks
  // the last 2 such pivots and compares price vs rsi with minDist + minRsiDiff.
  const rsi = rsiSeries(closes, 14);
  const leftBars = 2, rightBars = 2, minDist = 5, minRsiDiff = 2.0;
  let lowBar1 = NaN, lowBar2 = NaN, lowP1 = NaN, lowP2 = NaN, lowR1 = NaN, lowR2 = NaN;
  let hiBar1 = NaN, hiBar2 = NaN, hiP1 = NaN, hiP2 = NaN, hiR1 = NaN, hiR2 = NaN;
  let rRegBull = false, rRegBear = false, rHidBull = false, rHidBear = false;
  for (let i = 0; i < n; i++) {
    // BOTH price(low) AND rsi must form a pivot low at the same bar
    const priceLowPiv = pivLow(lows, leftBars, rightBars, i);
    const rsiLowPiv = pivLow(rsi, leftBars, rightBars, i);
    if (priceLowPiv && rsiLowPiv) {
      const pb = i - rightBars;
      lowBar2 = lowBar1; lowP2 = lowP1; lowR2 = lowR1;
      lowBar1 = pb; lowP1 = lows[pb]; lowR1 = rsi[pb];
      if (!isNaN(lowBar2) && lowBar1 - lowBar2 >= minDist && !isNaN(lowP2) && Math.abs(lowR1 - lowR2) >= minRsiDiff) {
        const fresh = pb >= n - 8; // report only recently-confirmed divergence
        if (lowP1 < lowP2 && lowR1 > lowR2 && fresh) rRegBull = true;   // Regular Bullish: price LL, rsi HL
        if (lowP1 > lowP2 && lowR1 < lowR2 && fresh) rHidBull = true;   // Hidden Bullish: price HL, rsi LL
      }
    }
    // BOTH price(high) AND rsi must form a pivot high at the same bar
    const priceHighPiv = pivHigh(highs, leftBars, rightBars, i);
    const rsiHighPiv = pivHigh(rsi, leftBars, rightBars, i);
    if (priceHighPiv && rsiHighPiv) {
      const pb = i - rightBars;
      hiBar2 = hiBar1; hiP2 = hiP1; hiR2 = hiR1;
      hiBar1 = pb; hiP1 = highs[pb]; hiR1 = rsi[pb];
      if (!isNaN(hiBar2) && hiBar1 - hiBar2 >= minDist && !isNaN(hiP2) && Math.abs(hiR1 - hiR2) >= minRsiDiff) {
        const fresh = pb >= n - 8;
        if (hiP1 > hiP2 && hiR1 < hiR2 && fresh) rRegBear = true;       // Regular Bearish: price HH, rsi LH
        if (hiP1 < hiP2 && hiR1 > hiR2 && fresh) rHidBear = true;       // Hidden Bearish: price LH, rsi HH
      }
    }
  }

  // ===== Ichimoku Trend Oscillator (Gabremoku force) =====
  const tenkanLen = 9, kijunLen = 26, senkouBLen = 52, forceScale = 100, neutralZone = 8, forceSmoothLen = 5;
  const donch = (len: number, i: number) => (highest(highs, len, i) + lowest(lows, len, i)) / 2;
  const atrBase = atrSeries(candles, kijunLen);
  const rawForceArr = new Array(n).fill(0);
  let tkLast = 0, priceVsCloudLast = 0;
  for (let i = 0; i < n; i++) {
    const tenkan = donch(tenkanLen, i), kijun = donch(kijunLen, i);
    const senkouA = (tenkan + kijun) / 2, senkouB = donch(senkouBLen, i);
    const cloudTop = Math.max(senkouA, senkouB), cloudBot = Math.min(senkouA, senkouB);
    const cloudSize = Math.abs(senkouA - senkouB);
    const cloudBias = senkouA > senkouB ? 1 : senkouA < senkouB ? -1 : 0;
    const normBase = Math.max(atrBase[i] || 0.01, cloudSize, 0.01);
    const src = closes[i];
    const tkSpread = ((tenkan - kijun) / normBase) * forceScale;
    const priceCloud = src > cloudTop ? ((src - cloudTop) / normBase) * (forceScale * 0.45)
                     : src < cloudBot ? ((src - cloudBot) / normBase) * (forceScale * 0.45) : 0;
    const cloudStruct = cloudBias * ((cloudSize / normBase) * (forceScale * 0.30));
    rawForceArr[i] = clamp(tkSpread + priceCloud + cloudStruct, -forceScale, forceScale);
    if (i === last) {
      tkLast = tenkan > kijun ? 1 : tenkan < kijun ? -1 : 0;
      priceVsCloudLast = src > cloudTop ? 1 : src < cloudBot ? -1 : 0;
    }
  }
  const forceSmoothed = ema(rawForceArr, forceSmoothLen).map((v) => clamp(v, -100, 100));
  const ichiForce = forceSmoothed[last] || 0;
  const ichiPrev = forceSmoothed[last - 1] || 0;
  const ichiState =
    ichiForce > neutralZone && priceVsCloudLast >= 0 && tkLast > 0 ? 'Bullish Expansion' :
    ichiForce > neutralZone && tkLast > 0 ? 'Bullish Pressure' :
    ichiForce < -neutralZone && priceVsCloudLast <= 0 && tkLast < 0 ? 'Bearish Expansion' :
    ichiForce < -neutralZone && tkLast < 0 ? 'Bearish Pressure' : 'Neutral';
  const ichiLong = ichiPrev <= 0 && ichiForce > 0;
  const ichiShort = ichiPrev >= 0 && ichiForce < 0;

  // ===== MACD + Divergence (12,26,9 EMA, osc=MACD line) =====
  const fast = ema(closes, 12), slow = ema(closes, 26);
  const macdArr = fast.map((v, i) => (isNaN(v) || isNaN(slow[i]) ? NaN : v - slow[i]));
  const sigArr = ema(macdArr, 9);
  const histArr = macdArr.map((v, i) => (isNaN(v) || isNaN(sigArr[i]) ? NaN : v - sigArr[i]));
  void stdev; // band retained in backend; not drawn here
  const lbl = 2, lbr = 2, rMin = 2, rMax = 10;
  let lastPlBar = -1, lastPlOsc = NaN, lastPlLow = NaN;
  let lastPhBar = -1, lastPhOsc = NaN, lastPhHigh = NaN;
  let macdBullDiv = false, macdBearDiv = false;
  for (let i = 0; i < n; i++) {
    if (pivLow(macdArr, lbl, lbr, i)) {
      const p = i - lbr;
      if (lastPlBar >= 0) { const bars = p - lastPlBar; if (bars >= rMin && bars <= rMax && lows[p] < lastPlLow && macdArr[p] > lastPlOsc && p >= n - 8) macdBullDiv = true; }
      lastPlBar = p; lastPlOsc = macdArr[p]; lastPlLow = lows[p];
    }
    if (pivHigh(macdArr, lbl, lbr, i)) {
      const p = i - lbr;
      if (lastPhBar >= 0) { const bars = p - lastPhBar; if (bars >= rMin && bars <= rMax && highs[p] > lastPhHigh && macdArr[p] < lastPhOsc && p >= n - 8) macdBearDiv = true; }
      lastPhBar = p; lastPhOsc = macdArr[p]; lastPhHigh = highs[p];
    }
  }
  const macdBullCross = macdArr[last - 1] <= sigArr[last - 1] && macdArr[last] > sigArr[last];
  const macdBearCross = macdArr[last - 1] >= sigArr[last - 1] && macdArr[last] < sigArr[last];

  // ===== Volume Profile (bins=25, barsBack=100, body-prop split, 70% VA) =====
  const bins = 25, barsBack = Math.min(100, n);
  const slice = candles.slice(-barsBack);
  let minP = Infinity, maxP = -Infinity;
  for (const c of slice) { minP = Math.min(minP, c.low); maxP = Math.max(maxP, c.high); }
  let poc = 0, vah = 0, val = 0;
  if (maxP > minP) {
    const step = (maxP - minP) / bins;
    const totals = new Array(bins).fill(0);
    for (const c of slice) {
      const rng = c.high - c.low;
      if (rng > 0 && step > 0) {
        const sB = clamp(Math.floor((c.low - minP) / step), 0, bins - 1);
        const eB = clamp(Math.floor((c.high - minP) / step), 0, bins - 1);
        for (let b = sB; b <= eB; b++) {
          const binLo = minP + b * step, binHi = binLo + step;
          const overlap = Math.max(Math.min(c.high, binHi) - Math.max(c.low, binLo), 0);
          if (overlap > 0) totals[b] += c.volume * (overlap / rng);
        }
      }
    }
    let totalVol = 0, maxVol = 0, pocIdx = 0;
    for (let b = 0; b < bins; b++) { totalVol += totals[b]; if (totals[b] > maxVol) { maxVol = totals[b]; pocIdx = b; } }
    const target = totalVol * 0.7;
    let lo = pocIdx, hi = pocIdx, cum = totals[pocIdx];
    while (cum < target && (lo > 0 || hi < bins - 1)) {
      const lv = lo > 0 ? totals[lo - 1] : -1, rv = hi < bins - 1 ? totals[hi + 1] : -1;
      if (rv >= lv && hi < bins - 1) { hi++; cum += totals[hi]; } else if (lo > 0) { lo--; cum += totals[lo]; } else break;
    }
    poc = minP + (pocIdx + 0.5) * step;
    vah = minP + (hi + 1) * step;
    val = minP + lo * step;
  }
  const price = closes[last];
  const priceVsPoc: 'above' | 'below' | 'at' = price > poc ? 'above' : price < poc ? 'below' : 'at';

  // ===== Smart Money Concepts (market structure + BOS/CHoCH + OB) =====
  // Detect swing highs/lows with pivot strength, then derive trend from
  // sequence of higher-highs/lows vs lower-highs/lows. BOS = trend continues,
  // CHoCH = trend reverses. Order block = last opposite candle before an impulsive move.
  const swLen = 5;
  let smcTrend: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  let smcBOS = false;
  let smcCHoCH = false;
  let smcInOrderBlock = false;
  {
    // Leg-based structure detection. A swing point forms when a bar is the
    // highest(high,len) [bear leg end / swing high] or lowest(low,len) [bull
    // leg end / swing low]. This mirrors LuxAlgo's smcLeg(size) logic.
    const swingHighs: { idx: number; price: number }[] = [];
    const swingLows: { idx: number; price: number }[] = [];
    for (let i = swLen; i < n; i++) {
      let hh = -Infinity, ll = Infinity;
      for (let j = i - swLen; j < i; j++) { hh = Math.max(hh, highs[j]); ll = Math.min(ll, lows[j]); }
      const curHigh = highs[i - swLen], curLow = lows[i - swLen];
      if (curHigh > hh) swingHighs.push({ idx: i - swLen, price: curHigh });
      if (curLow < ll) swingLows.push({ idx: i - swLen, price: curLow });
    }
    if (swingHighs.length >= 2 && swingLows.length >= 2) {
      const sh1 = swingHighs[swingHighs.length - 2], sh2 = swingHighs[swingHighs.length - 1];
      const sl1 = swingLows[swingLows.length - 2], sl2 = swingLows[swingLows.length - 1];
      const HH = sh2.price > sh1.price, HL = sl2.price > sl1.price;
      const LH = sh2.price < sh1.price, LL = sl2.price < sl1.price;
      if (HH && HL) smcTrend = 'bullish';
      else if (LH && LL) smcTrend = 'bearish';
      else smcTrend = 'neutral';

      // BOS/CHoCH: scan forward from the most recent swing for a break
      const lastSwingHigh = sh2.price, lastSwingLow = sl2.price;
      const fromIdx = Math.max(sh2.idx, sl2.idx) + 1;
      for (let i = fromIdx; i < n; i++) {
        if (smcTrend === 'bullish') {
          if (closes[i] > lastSwingHigh) { smcBOS = true; break; }
          if (closes[i] < lastSwingLow) { smcCHoCH = true; break; }
        } else if (smcTrend === 'bearish') {
          if (closes[i] < lastSwingLow) { smcBOS = true; break; }
          if (closes[i] > lastSwingHigh) { smcCHoCH = true; break; }
        }
      }

      // Bullish Order Block: last DOWN candle before the most recent bull-leg start
      // — "inside OB" if current price trades back into its range
      const legStart = sl2.idx;
      for (let i = legStart - 1; i >= Math.max(0, legStart - 6); i--) {
        if (candles[i].close < candles[i].open) {
          if (price >= candles[i].low && price <= candles[i].high) smcInOrderBlock = true;
          break;
        }
      }
    }
  }

  return {
    rsi: parseFloat((rsi[last] || 50).toFixed(1)),
    rsiRegularBull: rRegBull, rsiRegularBear: rRegBear, rsiHiddenBull: rHidBull, rsiHiddenBear: rHidBear,
    ichiForce: parseFloat(ichiForce.toFixed(1)), ichiState, ichiLong, ichiShort,
    macd: parseFloat((macdArr[last] || 0).toFixed(price < 5 ? 5 : 2)),
    macdSignal: parseFloat((sigArr[last] || 0).toFixed(price < 5 ? 5 : 2)),
    macdHist: parseFloat((histArr[last] || 0).toFixed(price < 5 ? 5 : 2)),
    macdBullCross, macdBearCross, macdBullDiv, macdBearDiv,
    poc: parseFloat(poc.toFixed(price < 5 ? 4 : 2)),
    vah: parseFloat(vah.toFixed(price < 5 ? 4 : 2)),
    val: parseFloat(val.toFixed(price < 5 ? 4 : 2)),
    priceVsPoc,
    smcTrend,
    smcBOS,
    smcCHoCH,
    smcInOrderBlock,
  };
}
