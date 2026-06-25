// ============================================================================
// QuadEngine.ts – Final version with safe number clamping helper
// ============================================================================

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface QuadBar extends Candle {
  stLine: number;
  stTrend: number;
  tqi: number;
  erValue: number;
  lorePrediction: number;
  loreSignal: number;
  loreIsBuySignal: boolean;
  loreIsSellSignal: boolean;
  loreIsNewBuySignal: boolean;
  loreIsNewSellSignal: boolean;
  loreYhat1: number;
  loreYhat2: number;
  loreIsBullishRate: boolean;
  loreIsBearishRate: boolean;
  loreIsBullishSmooth: boolean;
  loreIsBearishSmooth: boolean;
  loreKernelBullish: boolean;
  loreKernelBearish: boolean;
  sqzVal: number;
  sqzOn: boolean;
  sqzOff: boolean;
  sqzFiredBullish: boolean;
  sqzFiredBearish: boolean;
  comboBuy: boolean;
  comboSell: boolean;
  sl: number | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  tradeDir: number;
  hitTp1: boolean;
  hitTp2: boolean;
  hitTp3: boolean;
  hitSl: boolean;
  realizedR: number | null;
}

// ─── Safe number clamping helper (avoids TS overload ambiguity) ───
function clampNum(value: number, lower: number, upper: number): number {
  if (value < lower) return lower;
  if (value > upper) return upper;
  return value;
}

// ─── Helper Functions ───────────────────────────────────────────────────

function sma(arr: number[], period: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < arr.length; i++) {
    if (i < period - 1) { out.push(NaN); continue; }
    let s = 0;
    for (let j = i - period + 1; j <= i; j++) s += arr[j];
    out.push(s / period);
  }
  return out;
}

function ema(arr: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = NaN;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (isNaN(v)) { out.push(NaN); continue; }
    if (isNaN(prev)) {
      if (i < period - 1) { out.push(NaN); continue; }
      let s = 0, cnt = 0;
      for (let j = i - period + 1; j <= i; j++) {
        if (!isNaN(arr[j])) { s += arr[j]; cnt++; }
      }
      prev = cnt > 0 ? s / cnt : v;
      out.push(prev);
    } else {
      prev = v * k + prev * (1 - k);
      out.push(prev);
    }
  }
  return out;
}

function rma(arr: number[], period: number): number[] {
  const out: number[] = [];
  let prev = NaN;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (isNaN(v)) { out.push(NaN); continue; }
    if (isNaN(prev)) {
      if (i < period - 1) { out.push(NaN); continue; }
      let s = 0;
      for (let j = i - period + 1; j <= i; j++) s += arr[j];
      prev = s / period;
      out.push(prev);
    } else {
      prev = (prev * (period - 1) + v) / period;
      out.push(prev);
    }
  }
  return out;
}

function stdev(arr: number[], period: number): number[] {
  const smaArr = sma(arr, period);
  return arr.map((_, i) => {
    if (isNaN(smaArr[i]) || i < period - 1) return NaN;
    let s = 0;
    for (let j = i - period + 1; j <= i; j++) s += (arr[j] - smaArr[i]) ** 2;
    return Math.sqrt(s / period);
  });
}

function trueRange(highs: number[], lows: number[], closes: number[]): number[] {
  return highs.map((h, i) => {
    const hl = h - lows[i];
    if (i === 0) return hl;
    const hc = Math.abs(h - closes[i - 1]);
    const lc = Math.abs(lows[i] - closes[i - 1]);
    return Math.max(hl, hc, lc);
  });
}

function atrArr(highs: number[], lows: number[], closes: number[], period: number): number[] {
  return rma(trueRange(highs, lows, closes), period);
}

function highest(arr: number[], period: number): number[] {
  return arr.map((_, i) => {
    if (i < period - 1) return NaN;
    let h = -Infinity;
    for (let j = i - period + 1; j <= i; j++) h = Math.max(h, arr[j]);
    return h;
  });
}

function lowest(arr: number[], period: number): number[] {
  return arr.map((_, i) => {
    if (i < period - 1) return NaN;
    let l = Infinity;
    for (let j = i - period + 1; j <= i; j++) l = Math.min(l, arr[j]);
    return l;
  });
}

function rsiSeries(closes: number[], period: number): number[] {
  const gains: number[] = [0];
  const losses: number[] = [0];
  for (let i = 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gains.push(Math.max(d, 0));
    losses.push(Math.max(-d, 0));
  }
  const ag = rma(gains, period);
  const al = rma(losses, period);
  return ag.map((g, i) => {
    if (isNaN(g) || isNaN(al[i])) return NaN;
    return al[i] === 0 ? 100 : 100 - 100 / (1 + g / al[i]);
  });
}

function atrSeries(candles: Candle[], period: number): number[] {
  const out: number[] = [];
  let prev = NaN;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const pc = i > 0 ? candles[i - 1].close : c.close;
    const tr = Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc));
    prev = isNaN(prev) ? tr : (prev * (period - 1) + tr) / period;
    out.push(prev);
  }
  return out;
}

function rsi(closes: number[], period: number): number[] {
  return rsiSeries(closes, period);
}

function waveTrend(hlc3: number[], n1: number, n2: number): number[] {
  const e1 = ema(hlc3, n1);
  const d = hlc3.map((v, i) => isNaN(e1[i]) ? NaN : Math.abs(v - e1[i]));
  const e2 = ema(d, n1);
  const ci = hlc3.map((v, i) => {
    if (isNaN(e1[i]) || isNaN(e2[i]) || e2[i] === 0) return NaN;
    return (v - e1[i]) / (0.015 * e2[i]);
  });
  const wt1 = ema(ci, n2);
  const wt2 = sma(wt1, 4);
  return wt1.map((v, i) => (isNaN(v) || isNaN(wt2[i])) ? NaN : v - wt2[i]);
}

function cci(closes: number[], period: number): number[] {
  const smaC = sma(closes, period);
  return closes.map((c, i) => {
    if (isNaN(smaC[i]) || i < period - 1) return NaN;
    let md = 0;
    for (let j = i - period + 1; j <= i; j++) md += Math.abs(closes[j] - smaC[i]);
    md /= period;
    return md === 0 ? 0 : (c - smaC[i]) / (0.015 * md);
  });
}

function adx(highs: number[], lows: number[], closes: number[], period: number): number[] {
  const tr = trueRange(highs, lows, closes);
  const plusDM: number[] = [0];
  const minusDM: number[] = [0];
  for (let i = 1; i < highs.length; i++) {
    const up = highs[i] - highs[i - 1];
    const dn = lows[i - 1] - lows[i];
    plusDM.push(up > dn && up > 0 ? up : 0);
    minusDM.push(dn > up && dn > 0 ? dn : 0);
  }
  const sTR = rma(tr, period);
  const sPlusDM = rma(plusDM, period);
  const sMinusDM = rma(minusDM, period);
  const plusDI = sPlusDM.map((v, i) => (isNaN(sTR[i]) || sTR[i] === 0) ? NaN : 100 * v / sTR[i]);
  const minusDI = sMinusDM.map((v, i) => (isNaN(sTR[i]) || sTR[i] === 0) ? NaN : 100 * v / sTR[i]);
  const dx = plusDI.map((p, i) => {
    if (isNaN(p) || isNaN(minusDI[i])) return NaN;
    const s = p + minusDI[i];
    return s === 0 ? 0 : 100 * Math.abs(p - minusDI[i]) / s;
  });
  return rma(dx, period);
}

// ─── EXACT jdehorty/MLExtensions normalizations ─────────────────────

function normalizeHistoric(src: number[]): number[] {
  let hMin = 1e10;
  let hMax = -1e10;
  return src.map(v => {
    if (!isNaN(v)) {
      hMin = Math.min(v, hMin);
      hMax = Math.max(v, hMax);
    }
    if (isNaN(v)) return NaN;
    return (v - hMin) / Math.max(hMax - hMin, 1e-10);
  });
}

function nRsi(closes: number[], p1: number, p2: number = 1): number[] {
  let rsiArr = rsi(closes, p1);
  if (p2 > 1) rsiArr = ema(rsiArr, p2);
  return rsiArr.map(v => (isNaN(v) ? NaN : v / 100));
}

function nWt(hlc3: number[], n1: number, n2: number): number[] {
  return normalizeHistoric(waveTrend(hlc3, n1, n2));
}

function nCci(closes: number[], p1: number, p2: number = 1): number[] {
  let cciArr = cci(closes, p1);
  if (p2 > 1) cciArr = ema(cciArr, p2);
  return normalizeHistoric(cciArr);
}

function nAdx(highs: number[], lows: number[], closes: number[], len: number): number[] {
  const n = highs.length;
  const dx: number[] = new Array(n).fill(NaN);
  let trS = 0, smP = 0, smN = 0;
  for (let i = 0; i < n; i++) {
    const pc = i > 0 ? closes[i - 1] : 0;
    const ph = i > 0 ? highs[i - 1] : 0;
    const pl = i > 0 ? lows[i - 1] : 0;
    const tr = Math.max(highs[i] - lows[i], Math.abs(highs[i] - pc), Math.abs(lows[i] - pc));
    const dmP = highs[i] - ph > pl - lows[i] ? Math.max(highs[i] - ph, 0) : 0;
    const dmN = pl - lows[i] > highs[i] - ph ? Math.max(pl - lows[i], 0) : 0;
    trS = trS - trS / len + tr;
    smP = smP - smP / len + dmP;
    smN = smN - smN / len + dmN;
    const diP = (smP / trS) * 100;
    const diN = (smN / trS) * 100;
    const sum = diP + diN;
    dx[i] = !isFinite(sum) || sum === 0 ? NaN : (Math.abs(diP - diN) / sum) * 100;
  }
  const adxArr = rma(dx, len);
  return adxArr.map(v => (isNaN(v) ? NaN : clampNum(v / 100, 0, 1)));
}

function rescale(v: number, iLo: number, iHi: number, oLo: number, oHi: number): number {
  if (iHi === iLo) return oLo;
  const t = clampNum((v - iLo) / (iHi - iLo), 0, 1);
  return oLo + t * (oHi - oLo);
}

function linreg(arr: number[], period: number, offset = 0): number[] {
  return arr.map((_, i) => {
    if (i < period - 1) return NaN;
    let sX = 0, sY = 0, sXY = 0, sXX = 0;
    for (let j = 0; j < period; j++) {
      const x = j, y = arr[i - period + 1 + j];
      if (isNaN(y)) return NaN;
      sX += x; sY += y; sXY += x * y; sXX += x * x;
    }
    const denom = period * sXX - sX * sX;
    const slope = denom === 0 ? 0 : (period * sXY - sX * sY) / denom;
    const intercept = (sY - slope * sX) / period;
    return intercept + slope * (period - 1 - offset);
  });
}

function pivotLows(lows: number[], len: number): (number | null)[] {
  return lows.map((_, i) => {
    if (i < len * 2) return null;
    const pi = i - len;
    const pv = lows[pi];
    for (let j = pi - len; j <= pi + len; j++) {
      if (j === pi || j < 0 || j >= lows.length) continue;
      if (lows[j] < pv) return null;
    }
    return pv;
  });
}

function pivotHighs(highs: number[], len: number): (number | null)[] {
  return highs.map((_, i) => {
    if (i < len * 2) return null;
    const pi = i - len;
    const pv = highs[pi];
    for (let j = pi - len; j <= pi + len; j++) {
      if (j === pi || j < 0 || j >= highs.length) continue;
      if (highs[j] > pv) return null;
    }
    return pv;
  });
}

function pivLow(arr: number[], left: number, right: number, i: number): boolean {
  const p = i - right;
  if (p - left < 0 || i >= arr.length || isNaN(arr[p])) return false;
  for (let j = p - left; j <= p + right; j++) {
    if (j === p) continue;
    if (isNaN(arr[j]) || arr[j] < arr[p]) return false;
  }
  return true;
}

function pivHigh(arr: number[], left: number, right: number, i: number): boolean {
  const p = i - right;
  if (p - left < 0 || i >= arr.length || isNaN(arr[p])) return false;
  for (let j = p - left; j <= p + right; j++) {
    if (j === p) continue;
    if (isNaN(arr[j]) || arr[j] > arr[p]) return false;
  }
  return true;
}

function filterVolatility(tr: number[]): boolean[] {
  const historicalAtr = rma(tr, 10);
  return tr.map((v, i) => !isNaN(v) && !isNaN(historicalAtr[i]) && v > historicalAtr[i]);
}

function filterRegime(ohlc4: number[], threshold: number): boolean[] {
  const n = ohlc4.length;
  const result: boolean[] = new Array(n).fill(false);
  let prevValue1 = 0;
  for (let i = 0; i < n; i++) {
    if (i < 10) { result[i] = false; continue; }
    const value1 = 0.1 * (ohlc4[i] - ohlc4[i - 10]);
    const prev1 = prevValue1;
    const denom = Math.abs(value1 - prev1);
    let passes: boolean;
    if (denom === 0) passes = threshold <= 0;
    else passes = Math.abs(value1 + prev1) / denom >= threshold;
    result[i] = passes;
    prevValue1 = value1;
  }
  return result;
}

function filterAdx(highs: number[], lows: number[], closes: number[], period: number, threshold: number): boolean[] {
  const adxArr = adx(highs, lows, closes, period);
  return adxArr.map(v => !isNaN(v) && v > threshold);
}

function rationalQuadraticKernel(arr: number[], h: number, r: number, x: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < arr.length; i++) {
    let num = 0, den = 0;
    const start = Math.max(0, i - x + 1);
    for (let j = start; j <= i; j++) {
      const u = (i - j) / h;
      const w = Math.pow(1 + (u * u) / (2 * r), -r);
      const v = arr[j];
      if (!isNaN(v)) { num += w * v; den += w; }
    }
    out.push(den > 0 ? num / den : arr[i]);
  }
  return out;
}

function gaussianKernel(arr: number[], h: number, x: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < arr.length; i++) {
    let num = 0, den = 0;
    const start = Math.max(0, i - x + 1);
    for (let j = start; j <= i; j++) {
      const u = (i - j) / h;
      const w = Math.exp(-0.5 * u * u);
      const v = arr[j];
      if (!isNaN(v)) { num += w * v; den += w; }
    }
    out.push(den > 0 ? num / den : arr[i]);
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// SATS SuperTrend
// ═══════════════════════════════════════════════════════════════════════════

interface SATSResult {
  stLine: number[];
  stTrend: number[];
  tqi: number[];
  erValue: number[];
  atrValue: number[];
  lastPivotLow: (number | null)[];
  lastPivotHigh: (number | null)[];
  flipUp: boolean[];
  flipDown: boolean[];
  effectiveSlMult: number;
}

function calcSATS(candles: Candle[]): SATSResult {
  const n = candles.length;
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const closes = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume);

  const atrLen = 14, baseMult = 2.0, erLen = 20, atrBaselineLen = 100;
  const adaptStrength = 0.5, qualityStrength = 0.4, qualityCurve = 1.5;
  const asymStrength = 0.5, multSmoothAlpha = 0.15;
  const structLen = 20, momLen = 10, volLen = 20, pivotLen = 3;
  const wEr = 0.35, wVol = 0.20, wStruct = 0.25, wMom = 0.20;
  const wSum = wEr + wVol + wStruct + wMom;

  const rawAtr = atrArr(highs, lows, closes, atrLen);
  const atrBaseline = sma(rawAtr, atrBaselineLen);
  const volMean = sma(volumes, volLen);
  const volSd = stdev(volumes, volLen);

  const er: number[] = closes.map((c, i) => {
    if (i < erLen) return NaN;
    const change = Math.abs(c - closes[i - erLen]);
    let vol = 0;
    for (let j = i - erLen + 1; j <= i; j++) vol += Math.abs(closes[j] - closes[j - 1]);
    return vol === 0 ? 0 : change / vol;
  });

  const effAtr = rawAtr.map((v, i) => {
    if (isNaN(v)) return NaN;
    const erVal = isNaN(er[i]) ? 0.0 : er[i];
    return v * (0.5 + 0.5 * erVal);
  });

  const hiH = highest(highs, structLen);
  const loL = lowest(lows, structLen);

  const tqiArr: number[] = closes.map((c, i) => {
    const erV = isNaN(er[i]) ? 0 : clampNum(er[i], 0, 1);
    let tqiVol = 0.5;
    if (!isNaN(volMean[i]) && !isNaN(volSd[i]) && volSd[i] > 0) {
      const vz = (volumes[i] - volMean[i]) / volSd[i];
      tqiVol = clampNum(rescale(vz, -1, 2, 0, 1), 0, 1);
    } else if (!isNaN(atrBaseline[i]) && atrBaseline[i] > 0) {
      tqiVol = clampNum(rescale(rawAtr[i] / atrBaseline[i], 0.6, 1.8, 0, 1), 0, 1);
    }
    const hi = hiH[i], lo = loL[i];
    const range = isNaN(hi) || isNaN(lo) ? 0 : hi - lo;
    const pos = range === 0 ? 0.5 : (c - (isNaN(lo) ? c : lo)) / range;
    const tqiStruct = clampNum(Math.abs(pos - 0.5) * 2, 0, 1);
    let aligned = 0;
    if (i >= momLen) {
      const winChg = c - closes[i - momLen];
      for (let j = 0; j < momLen; j++) {
        const idx = i - j;
        if (idx < 1) continue;
        const bc = closes[idx] - closes[idx - 1];
        if ((winChg > 0 && bc > 0) || (winChg < 0 && bc < 0)) aligned++;
      }
    }
    const tqiMom = i >= momLen ? aligned / momLen : 0.5;
    const raw = (erV * wEr + tqiVol * wVol + tqiStruct * wStruct + tqiMom * wMom) / wSum;
    return clampNum(raw, 0, 1);
  });

  const pvL = pivotLows(lows, pivotLen);
  const pvH = pivotHighs(highs, pivotLen);
  const lastPivotLow: (number | null)[] = [];
  const lastPivotHigh: (number | null)[] = [];
  let lpl: number | null = null, lph: number | null = null;
  for (let i = 0; i < n; i++) {
    if (pvL[i] !== null) lpl = pvL[i];
    if (pvH[i] !== null) lph = pvH[i];
    lastPivotLow.push(lpl);
    lastPivotHigh.push(lph);
  }

  const stTrend: number[] = [];
  const stLine: number[] = [];
  const flipUpArr: boolean[] = [];
  const flipDownArr: boolean[] = [];
  let lowerBand = NaN, upperBand = NaN;
  let trend = 1;
  let activeMultSm = NaN, passiveMultSm = NaN;

  for (let i = 0; i < n; i++) {
    const tqi = tqiArr[i];
    const atr = effAtr[i];
    const src = closes[i];

    if (isNaN(atr)) {
      stTrend.push(trend); stLine.push(NaN);
      flipUpArr.push(false); flipDownArr.push(false);
      continue;
    }

    const erV = isNaN(er[i]) ? 0.5 : er[i];
    const legacyAdapt = 1.0 + adaptStrength * (0.5 - erV);
    const qualDev = Math.pow(1.0 - tqi, qualityCurve);
    const tqiMult = 1.0 - qualityStrength + qualityStrength * (0.6 + 0.8 * qualDev);
    const symMult = baseMult * legacyAdapt * tqiMult;

    const activeRaw = symMult * (1.0 - asymStrength * tqi * 0.3);
    const passiveRaw = symMult * (1.0 + asymStrength * tqi * 0.4);

    activeMultSm = isNaN(activeMultSm) ? activeRaw : activeMultSm * (1 - multSmoothAlpha) + activeRaw * multSmoothAlpha;
    passiveMultSm = isNaN(passiveMultSm) ? passiveRaw : passiveMultSm * (1 - multSmoothAlpha) + passiveRaw * multSmoothAlpha;

    const lowerMult = trend === 1 ? activeMultSm : passiveMultSm;
    const upperMult = trend === 1 ? passiveMultSm : activeMultSm;

    const lbRaw = src - lowerMult * atr;
    const ubRaw = src + upperMult * atr;

    const prevLower = lowerBand, prevUpper = upperBand;
    const prevClose = i > 0 ? closes[i - 1] : closes[i];

    if (isNaN(prevLower)) {
      lowerBand = lbRaw; upperBand = ubRaw;
    } else {
      lowerBand = prevClose > prevLower ? Math.max(lbRaw, prevLower) : lbRaw;
      upperBand = prevClose < prevUpper ? Math.min(ubRaw, prevUpper) : ubRaw;
    }

    const flipUp = trend === -1 && closes[i] > (isNaN(prevUpper) ? upperBand : prevUpper);
    const flipDown = trend === 1 && closes[i] < (isNaN(prevLower) ? lowerBand : prevLower);

    if (flipUp) trend = 1;
    else if (flipDown) trend = -1;

    stTrend.push(trend);
    stLine.push(trend === 1 ? lowerBand : upperBand);
    flipUpArr.push(flipUp);
    flipDownArr.push(flipDown);
  }

  return {
    stLine, stTrend, tqi: tqiArr, erValue: er,
    atrValue: effAtr, lastPivotLow, lastPivotHigh,
    flipUp: flipUpArr, flipDown: flipDownArr,
    effectiveSlMult: 1.5,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Lorentzian Classification – FRESH NEIGHBOUR SELECTION EVERY BAR
// ═══════════════════════════════════════════════════════════════════════════

function calcLorentzian(
  candles: Candle[],
  volFilter: boolean[],
  regimeFilter: boolean[],
  adxFilter: boolean[],
  loreUseKernelFilter: boolean,
  loreUseKernelSmooth: boolean,
  loreKernelH: number,
  loreKernelR: number,
  loreKernelX: number,
  loreKernelLag: number,
  loreUseEmaFilter: boolean,
  loreEmaPeriod: number,
  loreUseSmaFilter: boolean,
  loreSmaPeriod: number
): {
  lorePrediction: number[];
  loreSignal: number[];
  loreYhat1: number[];
  loreYhat2: number[];
  loreIsBullishRate: boolean[];
  loreIsBearishRate: boolean[];
  loreIsBullishSmooth: boolean[];
  loreIsBearishSmooth: boolean[];
  loreKernelBullish: boolean[];
  loreKernelBearish: boolean[];
  loreIsBuySignal: boolean[];
  loreIsSellSignal: boolean[];
  loreIsNewBuySignal: boolean[];
  loreIsNewSellSignal: boolean[];
} {
  const n = candles.length;
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const closes = candles.map(c => c.close);
  const hlc3 = closes.map((c, i) => (highs[i] + lows[i] + c) / 3);

  const neighborsCount = 8;
  const maxBarsBack = 2000;

  const f1 = nRsi(closes, 14, 1);
  const f2 = nWt(hlc3, 10, 11);
  const f3 = nCci(closes, 20, 1);
  const f4 = nAdx(highs, lows, closes, 20);
  const f5 = nRsi(closes, 9, 1);

  const labels: number[] = closes.map((c, i) => {
    if (i < 4) return 0;
    const c4 = closes[i - 4];
    if (c4 < c) return -1;
    if (c4 > c) return 1;
    return 0;
  });

  const lastBarIndex = n - 1;
  const maxBarsBackIndex = lastBarIndex >= maxBarsBack ? lastBarIndex - maxBarsBack : 0;

  const ema200 = loreUseEmaFilter ? ema(closes, loreEmaPeriod) : closes.slice();
  const sma200 = loreUseSmaFilter ? sma(closes, loreSmaPeriod) : closes.slice();

  const loreYhat1 = rationalQuadraticKernel(closes, loreKernelH, loreKernelR, loreKernelX);
  const loreYhat2 = gaussianKernel(closes, loreKernelH - loreKernelLag, loreKernelX);

  const lorePrediction: number[] = new Array(n).fill(0);
  const loreSignal: number[] = new Array(n).fill(0);
  const loreIsBuySignal: boolean[] = new Array(n).fill(false);
  const loreIsSellSignal: boolean[] = new Array(n).fill(false);
  const loreIsNewBuySignal: boolean[] = new Array(n).fill(false);
  const loreIsNewSellSignal: boolean[] = new Array(n).fill(false);
  const loreIsBullishRateArr: boolean[] = new Array(n).fill(false);
  const loreIsBearishRateArr: boolean[] = new Array(n).fill(false);
  const loreIsBullishSmoothArr: boolean[] = new Array(n).fill(false);
  const loreIsBearishSmoothArr: boolean[] = new Array(n).fill(false);
  const loreKernelBullishArr: boolean[] = new Array(n).fill(false);
  const loreKernelBearishArr: boolean[] = new Array(n).fill(false);

  let prevSignal = 0;

  for (let b = 0; b < n; b++) {
    const filterAll = volFilter[b] && regimeFilter[b] && adxFilter[b];

    if (b < maxBarsBackIndex) {
      lorePrediction[b] = 0;
      loreSignal[b] = prevSignal;
      continue;
    }

    const predictions: number[] = [];
    const distances: number[] = [];

    let loreLastDistance = -1.0;
    const sizeLoop = Math.min(maxBarsBack - 1, b);

    for (let i = 0; i <= sizeLoop; i++) {
      if (i % 4 === 0) continue;
      const d1 = Math.log(1 + Math.abs(f1[b] - f1[i]));
      const d2 = Math.log(1 + Math.abs(f2[b] - f2[i]));
      const d3 = Math.log(1 + Math.abs(f3[b] - f3[i]));
      const d4 = Math.log(1 + Math.abs(f4[b] - f4[i]));
      const d5 = Math.log(1 + Math.abs(f5[b] - f5[i]));
      if (isNaN(d1) || isNaN(d2) || isNaN(d3) || isNaN(d4) || isNaN(d5)) continue;
      const d = d1 + d2 + d3 + d4 + d5;
      if (d >= loreLastDistance) {
        loreLastDistance = d;
        distances.push(d);
        predictions.push(labels[i]);
        if (predictions.length > neighborsCount) {
          const quartileIdx = Math.round(neighborsCount * 3 / 4);
          if (quartileIdx < distances.length) {
            loreLastDistance = distances[quartileIdx];
          }
          distances.shift();
          predictions.shift();
        }
      }
    }

    const pred = predictions.reduce((a, v) => a + v, 0);
    lorePrediction[b] = pred;

    const isEmaUp = !loreUseEmaFilter || closes[b] > ema200[b];
    const isEmaDown = !loreUseEmaFilter || closes[b] < ema200[b];
    const isSmaUp = !loreUseSmaFilter || closes[b] > sma200[b];
    const isSmaDown = !loreUseSmaFilter || closes[b] < sma200[b];

    if (pred > 0 && filterAll) prevSignal = 1;
    else if (pred < 0 && filterAll) prevSignal = -1;
    loreSignal[b] = prevSignal;

    loreIsBuySignal[b] = loreSignal[b] === 1 && isEmaUp && isSmaUp;
    loreIsSellSignal[b] = loreSignal[b] === -1 && isEmaDown && isSmaDown;
    const signalChanged = b > 0 ? loreSignal[b] !== loreSignal[b - 1] : false;
    loreIsNewBuySignal[b] = loreIsBuySignal[b] && signalChanged;
    loreIsNewSellSignal[b] = loreIsSellSignal[b] && signalChanged;

    const wasBullishRate = b >= 2 ? loreYhat1[b - 2] < loreYhat1[b - 1] : false;
    const wasBearishRate = b >= 2 ? loreYhat1[b - 2] > loreYhat1[b - 1] : false;
    const isBullishRate = b >= 1 ? loreYhat1[b - 1] < loreYhat1[b] : false;
    const isBearishRate = b >= 1 ? loreYhat1[b - 1] > loreYhat1[b] : false;
    const isBullishSmooth = loreYhat2[b] >= loreYhat1[b];
    const isBearishSmooth = loreYhat2[b] <= loreYhat1[b];

    loreIsBullishRateArr[b] = isBullishRate;
    loreIsBearishRateArr[b] = isBearishRate;
    loreIsBullishSmoothArr[b] = isBullishSmooth;
    loreIsBearishSmoothArr[b] = isBearishSmooth;

    const kernelBullish = loreUseKernelFilter
      ? (loreUseKernelSmooth ? isBullishSmooth : isBullishRate)
      : true;
    const kernelBearish = loreUseKernelFilter
      ? (loreUseKernelSmooth ? isBearishSmooth : isBearishRate)
      : true;

    loreKernelBullishArr[b] = kernelBullish;
    loreKernelBearishArr[b] = kernelBearish;

    void wasBullishRate;
    void wasBearishRate;
  }

  return {
    lorePrediction,
    loreSignal,
    loreYhat1,
    loreYhat2,
    loreIsBullishRate: loreIsBullishRateArr,
    loreIsBearishRate: loreIsBearishRateArr,
    loreIsBullishSmooth: loreIsBullishSmoothArr,
    loreIsBearishSmooth: loreIsBearishSmoothArr,
    loreKernelBullish: loreKernelBullishArr,
    loreKernelBearish: loreKernelBearishArr,
    loreIsBuySignal,
    loreIsSellSignal,
    loreIsNewBuySignal,
    loreIsNewSellSignal,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Squeeze Momentum
// ═══════════════════════════════════════════════════════════════════════════

function calcSqueeze(candles: Candle[]): {
  sqzVal: number[]; sqzOn: boolean[]; sqzOff: boolean[]
} {
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);

  const bbLen = 20, bbMult = 2.0, kcLen = 20, kcMult = 1.5;
  const basis = sma(closes, bbLen);
  const sd = stdev(closes, bbLen);
  const upperBB = basis.map((b, i) => b + bbMult * sd[i]);
  const lowerBB = basis.map((b, i) => b - bbMult * sd[i]);

  const tr = trueRange(highs, lows, closes);
  const kcMa = sma(closes, kcLen);
  const trMa = sma(tr, kcLen);
  const upperKC = kcMa.map((m, i) => m + kcMult * trMa[i]);
  const lowerKC = kcMa.map((m, i) => m - kcMult * trMa[i]);

  const sqzOn = lowerBB.map((lb, i) => lb > lowerKC[i] && upperBB[i] < upperKC[i]);
  const sqzOff = lowerBB.map((lb, i) => lb < lowerKC[i] && upperBB[i] > upperKC[i]);

  const hiH = highest(highs, kcLen);
  const loL = lowest(lows, kcLen);
  const kcSma = sma(closes, kcLen);

  const sqzSrc = closes.map((c, i) => {
    if (isNaN(hiH[i]) || isNaN(loL[i]) || isNaN(kcSma[i])) return NaN;
    return c - ((hiH[i] + loL[i]) / 2 + kcSma[i]) / 2;
  });

  return { sqzVal: linreg(sqzSrc, kcLen, 0), sqzOn, sqzOff };
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Quad Engine
// ═══════════════════════════════════════════════════════════════════════════

export interface EngineSettings {
  loreUseKernelFilter?: boolean;
  loreUseKernelSmooth?: boolean;
  loreKernelH?: number;
  loreKernelR?: number;
  loreKernelX?: number;
  loreKernelLag?: number;
  loreUseEmaFilter?: boolean;
  loreEmaPeriod?: number;
  loreUseSmaFilter?: boolean;
  loreSmaPeriod?: number;
  loreUseAdxFilter?: boolean;
  loreAdxThreshold?: number;
  loreRegimeThreshold?: number;
}

const DEFAULT_SETTINGS: EngineSettings = {
  loreUseKernelFilter: true,
  loreUseKernelSmooth: true,
  loreKernelH: 8,
  loreKernelR: 8,
  loreKernelX: 25,
  loreKernelLag: 2,
  loreUseEmaFilter: false,
  loreEmaPeriod: 200,
  loreUseSmaFilter: false,
  loreSmaPeriod: 200,
  loreUseAdxFilter: false,
  loreAdxThreshold: 20,
  loreRegimeThreshold: -0.1,
};

export function runQuadEngine(candles: Candle[], userSettings: EngineSettings = {}): QuadBar[] {
  const s = { ...DEFAULT_SETTINGS, ...userSettings };
  const WARMUP_BARS = 60;
  if (candles.length < WARMUP_BARS) return [];

  const n = candles.length;
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const closes = candles.map(c => c.close);
  const ohlc4 = candles.map(c => (c.open + c.high + c.low + c.close) / 4);
  const tr = trueRange(highs, lows, closes);

  const volFilter = filterVolatility(tr);
  const regimeFilter = filterRegime(ohlc4, s.loreRegimeThreshold!);
  const adxFilter = s.loreUseAdxFilter! ? filterAdx(highs, lows, closes, 14, s.loreAdxThreshold!) : new Array(n).fill(true);

  const sats = calcSATS(candles);
  const lore = calcLorentzian(
    candles, volFilter, regimeFilter, adxFilter,
    s.loreUseKernelFilter!,
    s.loreUseKernelSmooth!,
    s.loreKernelH!,
    s.loreKernelR!,
    s.loreKernelX!,
    s.loreKernelLag!,
    s.loreUseEmaFilter!,
    s.loreEmaPeriod!,
    s.loreUseSmaFilter!,
    s.loreSmaPeriod!
  );
  const sqz = calcSqueeze(candles);

  const slMult = sats.effectiveSlMult;
  const tp1R = 1.0, tp2R = 2.0, tp3R = 3.0;

  const result: QuadBar[] = [];

  for (let i = 0; i < n; i++) {
    const trend = sats.stTrend[i];
    const flipUp = sats.flipUp[i];
    const flipDown = sats.flipDown[i];
    const pred = lore.lorePrediction[i];
    const isWarmedUp = i >= WARMUP_BARS;

    const loreSimpleBullish = pred > 0 && lore.loreKernelBullish[i];
    const loreSimpleBearish = pred < 0 && lore.loreKernelBearish[i];
    const prevLoreSimpleBullish = i > 0
      ? (lore.lorePrediction[i - 1] > 0 && lore.loreKernelBullish[i - 1])
      : false;
    const prevLoreSimpleBearish = i > 0
      ? (lore.lorePrediction[i - 1] < 0 && lore.loreKernelBearish[i - 1])
      : false;

    const satsConfirmedBuy = flipUp && isWarmedUp;
    const satsConfirmedSell = flipDown && isWarmedUp;

    const comboBuy =
      (satsConfirmedBuy && loreSimpleBullish) ||
      (trend === 1 && loreSimpleBullish && !prevLoreSimpleBullish);

    const comboSell =
      (satsConfirmedSell && loreSimpleBearish) ||
      (trend === -1 && loreSimpleBearish && !prevLoreSimpleBearish);

    let sl: number | null = null;
    let tp1: number | null = null, tp2: number | null = null, tp3: number | null = null;

    if (comboBuy || comboSell) {
      const entry = closes[i];
      const atr = isNaN(sats.atrValue[i]) ? 0 : sats.atrValue[i];
      const loreConf = Math.abs(pred);
      const confFactor = clampNum(1.0 + 0.5 * (loreConf / 10.0), 0.8, 1.5);
      const t1R = tp1R * confFactor, t2R = tp2R * confFactor, t3R = tp3R * confFactor;

      if (comboBuy) {
        const base = sats.lastPivotLow[i] ?? lows[i];
        const satsSL = Math.min(base - slMult * atr, entry - slMult * atr);
        const loreSL = lore.loreYhat1[i] - atr * 0.5;
        const combined = Math.max(satsSL, loreSL);
        sl = combined < entry ? combined : satsSL;
        let risk = entry - sl;
        if (risk <= 0) risk = atr;
        tp1 = entry + risk * t1R;
        tp2 = entry + risk * t2R;
        tp3 = entry + risk * t3R;
      } else {
        const base = sats.lastPivotHigh[i] ?? highs[i];
        const satsSL = Math.max(base + slMult * atr, entry + slMult * atr);
        const loreSL = lore.loreYhat1[i] + atr * 0.5;
        const combined = Math.min(satsSL, loreSL);
        sl = combined > entry ? combined : satsSL;
        let risk = sl - entry;
        if (risk <= 0) risk = atr;
        tp1 = entry - risk * t1R;
        tp2 = entry - risk * t2R;
        tp3 = entry - risk * t3R;
      }
    }

    const sqzFiredBullish = sqz.sqzOff[i] && sqz.sqzVal[i] > 0 && sqz.sqzVal[i] > (i > 0 ? sqz.sqzVal[i - 1] : 0);
    const sqzFiredBearish = sqz.sqzOff[i] && sqz.sqzVal[i] < 0 && sqz.sqzVal[i] < (i > 0 ? sqz.sqzVal[i - 1] : 0);

    result.push({
      time: candles[i].time,
      open: candles[i].open,
      high: candles[i].high,
      low: candles[i].low,
      close: candles[i].close,
      volume: candles[i].volume,
      stLine: isNaN(sats.stLine[i]) ? 0 : sats.stLine[i],
      stTrend: sats.stTrend[i],
      tqi: sats.tqi[i],
      erValue: isNaN(sats.erValue[i]) ? 0 : sats.erValue[i],
      lorePrediction: pred,
      loreSignal: lore.loreSignal[i],
      loreIsBuySignal: lore.loreIsBuySignal[i],
      loreIsSellSignal: lore.loreIsSellSignal[i],
      loreIsNewBuySignal: lore.loreIsNewBuySignal[i],
      loreIsNewSellSignal: lore.loreIsNewSellSignal[i],
      loreYhat1: lore.loreYhat1[i],
      loreYhat2: lore.loreYhat2[i],
      loreIsBullishRate: lore.loreIsBullishRate[i],
      loreIsBearishRate: lore.loreIsBearishRate[i],
      loreIsBullishSmooth: lore.loreIsBullishSmooth[i],
      loreIsBearishSmooth: lore.loreIsBearishSmooth[i],
      loreKernelBullish: lore.loreKernelBullish[i],
      loreKernelBearish: lore.loreKernelBearish[i],
      sqzVal: isNaN(sqz.sqzVal[i]) ? 0 : sqz.sqzVal[i],
      sqzOn: sqz.sqzOn[i],
      sqzOff: sqz.sqzOff[i],
      sqzFiredBullish,
      sqzFiredBearish,
      comboBuy,
      comboSell,
      sl, tp1, tp2, tp3,
      tradeDir: 0,
      hitTp1: false,
      hitTp2: false,
      hitTp3: false,
      hitSl: false,
      realizedR: null,
    });
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// UI ADAPTER LAYER
// ═══════════════════════════════════════════════════════════════════════════

const engineCache = new WeakMap<Candle[], QuadBar[]>();

function getEngineBars(candles: Candle[]): QuadBar[] {
  const cached = engineCache.get(candles);
  if (cached) return cached;
  const bars = runQuadEngine(candles);
  engineCache.set(candles, bars);
  return bars;
}

export interface QuadAnalysis {
  symbol: string;
  interval: string;
  lastPrice: number;
  candleCount: number;
  dataSource: 'binance_live' | 'simulated';

  satsTrend: 1 | -1;
  satsFlipRecent: boolean;
  supertrendLine: number;
  atr: number;
  tqi: number;

  lorePrediction: number;
  loreBullish: boolean;
  loreFlipRecent: boolean;

  squeezeOn: boolean;
  squeezeFiredBullish: boolean;

  comboBuy: boolean;
  comboSell: boolean;
  comboFresh: boolean;

  confFactor: number;
  entry: number;
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number;

  updatedAt: string;
}

export function analyzeQuad(
  symbol: string,
  interval: string,
  candles: Candle[],
  dataSource: 'binance_live' | 'simulated'
): QuadAnalysis {
  const bars = getEngineBars(candles);
  const n = bars.length;
  const last = bars[n - 1];

  const fmtDp = last.close < 5 ? 4 : 2;

  const loreSimpleBullish = last.lorePrediction > 0 && last.loreKernelBullish;
  const loreSimpleBearish = last.lorePrediction < 0 && last.loreKernelBearish;
  const stateBuy = last.stTrend === 1 && loreSimpleBullish;
  const stateSell = last.stTrend === -1 && loreSimpleBearish;

  let comboFresh = false;
  for (let i = Math.max(0, n - 3); i < n; i++) {
    if (bars[i].comboBuy || bars[i].comboSell) { comboFresh = true; break; }
  }

  const satsFlipRecent = n > 3 ? bars[n - 1].stTrend !== bars[n - 4].stTrend : false;
  const lorePrev = n > 3 ? bars[n - 4].lorePrediction : 0;
  const loreFlipRecent = Math.sign(last.lorePrediction) !== Math.sign(lorePrev);

  let planEntry = last.close;
  let planSl: number | null = null;
  let planTp1: number | null = null;
  let planTp2: number | null = null;
  let planTp3: number | null = null;
  for (let i = n - 1; i >= Math.max(0, n - 60); i--) {
    if ((bars[i].comboBuy || bars[i].comboSell) && bars[i].sl !== null) {
      planEntry = bars[i].close;
      planSl = bars[i].sl;
      planTp1 = bars[i].tp1;
      planTp2 = bars[i].tp2;
      planTp3 = bars[i].tp3;
      break;
    }
  }

  const loreConf = Math.abs(last.lorePrediction);
  const confFactor = clampNum(1.0 + 0.5 * (loreConf / 10.0), 0.8, 1.5);

  if (planSl === null) {
    const approxAtr = Math.abs(last.close - last.stLine) / 2 || last.close * 0.01;
    planSl = last.close - 1.5 * approxAtr;
    const risk = planEntry - planSl;
    planTp1 = planEntry + risk * 1.0 * confFactor;
    planTp2 = planEntry + risk * 2.0 * confFactor;
    planTp3 = planEntry + risk * 3.0 * confFactor;
  }

  const atrDisplay = planSl !== null ? Math.abs(planEntry - planSl) / 1.5 : 0;

  return {
    symbol,
    interval,
    lastPrice: last.close,
    candleCount: n,
    dataSource,
    satsTrend: last.stTrend === 1 ? 1 : -1,
    satsFlipRecent,
    supertrendLine: parseFloat(last.stLine.toFixed(fmtDp)),
    atr: parseFloat(atrDisplay.toFixed(last.close < 5 ? 5 : 2)),
    tqi: parseFloat(last.tqi.toFixed(2)),
    lorePrediction: last.lorePrediction,
    loreBullish: last.lorePrediction > 0,
    loreFlipRecent,
    squeezeOn: last.sqzOn,
    squeezeFiredBullish: last.sqzFiredBullish,
    comboBuy: stateBuy,
    comboSell: stateSell,
    comboFresh,
    confFactor: parseFloat(confFactor.toFixed(2)),
    entry: parseFloat(planEntry.toFixed(fmtDp)),
    sl: parseFloat((planSl as number).toFixed(fmtDp)),
    tp1: parseFloat((planTp1 as number).toFixed(fmtDp)),
    tp2: parseFloat((planTp2 as number).toFixed(fmtDp)),
    tp3: parseFloat((planTp3 as number).toFixed(fmtDp)),
    updatedAt: new Date().toISOString(),
  };
}

export interface QuadChartSeries {
  candles: Candle[];
  stLine: number[];
  trend: number[];
  lore: number[];
  markers: { index: number; type: 'buy' | 'sell'; price: number }[];
}

export function computeQuadSeries(candles: Candle[]): QuadChartSeries {
  const bars = getEngineBars(candles);

  const stLine = bars.map(b => b.stLine);
  const trend = bars.map(b => b.stTrend);
  const lore = bars.map(b => b.lorePrediction);

  const markers: { index: number; type: 'buy' | 'sell'; price: number }[] = [];
  bars.forEach((b, i) => {
    if (b.comboBuy) markers.push({ index: i, type: 'buy', price: b.low });
    else if (b.comboSell) markers.push({ index: i, type: 'sell', price: b.high });
  });

  return { candles: bars, stLine, trend, lore, markers };
}

export async function fetchKlines(
  symbol: string,
  interval: string,
  fallbackPrice: number,
  totalBars: number = 5000
): Promise<{ candles: Candle[]; source: 'binance_live' | 'simulated' }> {
  try {
    const all: Candle[] = [];
    let endTime: number | undefined = undefined;

    while (all.length < totalBars) {
      const limit = Math.min(1000, totalBars - all.length);
      const url =
        `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}` +
        (endTime !== undefined ? `&endTime=${endTime}` : '');
      const res = await fetch(url, { signal: AbortSignal.timeout(9000) });
      if (!res.ok) throw new Error('Binance kline HTTP ' + res.status);
      const raw = await res.json();
      if (!Array.isArray(raw) || raw.length === 0) break;

      const batch: Candle[] = raw.map((k: any[]) => ({
        time: k[0],
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
      }));

      all.unshift(...batch);
      endTime = batch[0].time - 1;
      if (raw.length < limit) break;
    }

    if (all.length < 60) throw new Error('insufficient candles');
    return { candles: all, source: 'binance_live' };
  } catch {
    const candles: Candle[] = [];
    let price = fallbackPrice * 0.96;
    const now = Date.now();
    const intervalMs = interval === '1h' ? 3600000 : interval === '4h' ? 14400000 : 900000;
    for (let i = 0; i < totalBars; i++) {
      const drift = 0.0002 + (Math.random() - 0.48) * 0.006;
      const open = price;
      const close = price * (1 + drift);
      const high = Math.max(open, close) * (1 + Math.random() * 0.0025);
      const low = Math.min(open, close) * (1 - Math.random() * 0.0025);
      candles.push({ time: now - (totalBars - i) * intervalMs, open, high, low, close, volume: 1000 + Math.random() * 5000 });
      price = close;
    }
    return { candles, source: 'simulated' };
  }
}

// ============================================================================
// Extra Indicators (RSI Div, Ichimoku, MACD Div, Volume Profile, SMC)
// ============================================================================

export interface ExtraIndicators {
  rsi: number;
  rsiRegularBull: boolean;
  rsiRegularBear: boolean;
  rsiHiddenBull: boolean;
  rsiHiddenBear: boolean;
  ichiForce: number;
  ichiState: string;
  ichiLong: boolean;
  ichiShort: boolean;
  macd: number;
  macdSignal: number;
  macdHist: number;
  macdBullCross: boolean;
  macdBearCross: boolean;
  macdBullDiv: boolean;
  macdBearDiv: boolean;
  poc: number;
  vah: number;
  val: number;
  priceVsPoc: 'above' | 'below' | 'at';
  smcTrend: string;
  smcBOS: boolean;
  smcCHoCH: boolean;
  smcInOrderBlock: boolean;
}

export function computeExtraIndicators(candles: Candle[]): ExtraIndicators {
  const n = candles.length;
  const last = n - 1;
  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);

  const rsiVal = rsiSeries(closes, 14);

  const leftBars = 2, rightBars = 2, minDist = 5, minRsiDiff = 2.0;
  let lowBar1 = NaN, lowBar2 = NaN, lowP1 = NaN, lowP2 = NaN, lowR1 = NaN, lowR2 = NaN;
  let hiBar1 = NaN, hiBar2 = NaN, hiP1 = NaN, hiP2 = NaN, hiR1 = NaN, hiR2 = NaN;
  let rRegBull = false, rRegBear = false, rHidBull = false, rHidBear = false;
  for (let i = 0; i < n; i++) {
    const priceLowPiv = pivLow(lows, leftBars, rightBars, i);
    const rsiLowPiv = pivLow(rsiVal, leftBars, rightBars, i);
    if (priceLowPiv && rsiLowPiv) {
      const pb = i - rightBars;
      lowBar2 = lowBar1; lowP2 = lowP1; lowR2 = lowR1;
      lowBar1 = pb; lowP1 = lows[pb]; lowR1 = rsiVal[pb];
      if (!isNaN(lowBar2) && lowBar1 - lowBar2 >= minDist && !isNaN(lowP2) && Math.abs(lowR1 - lowR2) >= minRsiDiff) {
        const fresh = pb >= n - 8;
        if (lowP1 < lowP2 && lowR1 > lowR2 && fresh) rRegBull = true;
        if (lowP1 > lowP2 && lowR1 < lowR2 && fresh) rHidBull = true;
      }
    }
    const priceHighPiv = pivHigh(highs, leftBars, rightBars, i);
    const rsiHighPiv = pivHigh(rsiVal, leftBars, rightBars, i);
    if (priceHighPiv && rsiHighPiv) {
      const pb = i - rightBars;
      hiBar2 = hiBar1; hiP2 = hiP1; hiR2 = hiR1;
      hiBar1 = pb; hiP1 = highs[pb]; hiR1 = rsiVal[pb];
      if (!isNaN(hiBar2) && hiBar1 - hiBar2 >= minDist && !isNaN(hiP2) && Math.abs(hiR1 - hiR2) >= minRsiDiff) {
        const fresh = pb >= n - 8;
        if (hiP1 > hiP2 && hiR1 < hiR2 && fresh) rRegBear = true;
        if (hiP1 < hiP2 && hiR1 > hiR2 && fresh) rHidBear = true;
      }
    }
  }

  const tenkanLen = 9, kijunLen = 26, senkouBLen = 52, forceScale = 100, neutralZone = 8, forceSmoothLen = 5;
  const donch = (len: number, i: number) => (highest(highs, len)[i] + lowest(lows, len)[i]) / 2;
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
    rawForceArr[i] = clampNum(tkSpread + priceCloud + cloudStruct, -forceScale, forceScale);
    if (i === last) {
      tkLast = tenkan > kijun ? 1 : tenkan < kijun ? -1 : 0;
      priceVsCloudLast = src > cloudTop ? 1 : src < cloudBot ? -1 : 0;
    }
  }
  const forceSmoothed = ema(rawForceArr, forceSmoothLen).map((v) => clampNum(v, -100, 100));
  const ichiForce = forceSmoothed[last] || 0;
  const ichiPrev = forceSmoothed[last - 1] || 0;
  const ichiState =
    ichiForce > neutralZone && priceVsCloudLast >= 0 && tkLast > 0 ? 'Bullish Expansion' :
    ichiForce > neutralZone && tkLast > 0 ? 'Bullish Pressure' :
    ichiForce < -neutralZone && priceVsCloudLast <= 0 && tkLast < 0 ? 'Bearish Expansion' :
    ichiForce < -neutralZone && tkLast < 0 ? 'Bearish Pressure' : 'Neutral';
  const ichiLong = ichiPrev <= 0 && ichiForce > 0;
  const ichiShort = ichiPrev >= 0 && ichiForce < 0;

  const fast = ema(closes, 12), slow = ema(closes, 26);
  const macdArr = fast.map((v, i) => (isNaN(v) || isNaN(slow[i]) ? NaN : v - slow[i]));
  const sigArr = ema(macdArr, 9);
  const histArr = macdArr.map((v, i) => (isNaN(v) || isNaN(sigArr[i]) ? NaN : v - sigArr[i]));
  const lbl = 2, lbr = 2, rMin = 3, rMax = 15;
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
        const sB = clampNum(Math.floor((c.low - minP) / step), 0, bins - 1);
        const eB = clampNum(Math.floor((c.high - minP) / step), 0, bins - 1);
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

  const swLen = 5;
  let smcTrend: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  let smcBOS = false;
  let smcCHoCH = false;
  let smcInOrderBlock = false;
  {
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
    rsi: parseFloat((rsiVal[last] || 50).toFixed(1)),
    rsiRegularBull: rRegBull, rsiRegularBear: rRegBear, rsiHiddenBull: rHidBull, rsiHiddenBear: rHidBear,
    ichiForce: parseFloat(ichiForce.toFixed(1)), ichiState,
    ichiLong, ichiShort,
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

// ============================================================================
// MARKET SNAPSHOT – for JARVIS AI trading decision
// ============================================================================

export interface MarketSnapshot {
  symbol: string;
  timeframe: string;
  price: number;
  satsTrend: number;
  lorePrediction: number;
  loreKernelBullish: boolean;
  sqzOn: boolean;
  sqzFiredBullish: boolean;
  comboBuy: boolean;
  comboSell: boolean;
  rsi: number;
  rsiRegularBull: boolean;
  rsiRegularBear: boolean;
  rsiHiddenBull: boolean;
  rsiHiddenBear: boolean;
  ichiForce: number;
  ichiState: string;
  macd: number;
  macdBullCross: boolean;
  macdBearCross: boolean;
  macdBullDiv: boolean;
  macdBearDiv: boolean;
  poc: number;
  priceVsPoc: 'above' | 'below' | 'at';
  smcTrend: string;
  smcBOS: boolean;
  smcCHoCH: boolean;
  smcInOrderBlock: boolean;
}

export function getMarketSnapshot(
  symbol: string,
  timeframe: string,
  candles: Candle[]
): MarketSnapshot {
  const analysis = analyzeQuad(symbol, timeframe, candles, 'binance_live');
  const extra = computeExtraIndicators(candles);

  return {
    symbol,
    timeframe,
    price: analysis.lastPrice,
    satsTrend: analysis.satsTrend,
    lorePrediction: analysis.lorePrediction,
    loreKernelBullish: analysis.loreBullish,
    sqzOn: analysis.squeezeOn,
    sqzFiredBullish: analysis.squeezeFiredBullish,
    comboBuy: analysis.comboBuy,
    comboSell: analysis.comboSell,
    rsi: extra.rsi,
    rsiRegularBull: extra.rsiRegularBull,
    rsiRegularBear: extra.rsiRegularBear,
    rsiHiddenBull: extra.rsiHiddenBull,
    rsiHiddenBear: extra.rsiHiddenBear,
    ichiForce: extra.ichiForce,
    ichiState: extra.ichiState,
    macd: extra.macd,
    macdBullCross: extra.macdBullCross,
    macdBearCross: extra.macdBearCross,
    macdBullDiv: extra.macdBullDiv,
    macdBearDiv: extra.macdBearDiv,
    poc: extra.poc,
    priceVsPoc: extra.priceVsPoc,
    smcTrend: extra.smcTrend,
    smcBOS: extra.smcBOS,
    smcCHoCH: extra.smcCHoCH,
    smcInOrderBlock: extra.smcInOrderBlock,
  };
}
