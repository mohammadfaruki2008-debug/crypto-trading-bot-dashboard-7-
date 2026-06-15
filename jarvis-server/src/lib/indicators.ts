/**
 * Technical indicators — RSI, MACD, SuperTrend on Binance candles.
 */
import { fetchPrice } from './binance';

interface Candle { time: number; open: number; high: number; low: number; close: number; volume: number; }

async function fetchCandles(symbol: string, interval = '1h', limit = 200): Promise<Candle[]> {
  try {
    const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
    const raw: any[] = await res.json();
    return raw.map(k => ({ time: k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] }));
  } catch { return []; }
}

function rma(arr: number[], len: number): number[] {
  const out = new Array(arr.length).fill(NaN);
  let prev = NaN, seed = 0, count = 0;
  for (let i = 0; i < arr.length; i++) {
    if (isNaN(arr[i])) continue;
    if (isNaN(prev)) {
      seed += arr[i]; count++;
      if (count === len) { prev = seed / len; out[i] = prev; }
    } else { prev = (prev * (len - 1) + arr[i]) / len; out[i] = prev; }
  }
  return out;
}

function ema(arr: number[], len: number): number[] {
  const k = 2 / (len + 1);
  const out = new Array(arr.length).fill(NaN);
  let prev = NaN, seed = 0, count = 0;
  for (let i = 0; i < arr.length; i++) {
    if (isNaN(prev)) {
      seed += arr[i]; count++;
      if (count === len) { prev = seed / len; out[i] = prev; }
    } else { prev = arr[i] * k + prev * (1 - k); out[i] = prev; }
  }
  return out;
}

export async function getRSI(symbol: string, period = 14): Promise<number> {
  const candles = await fetchCandles(symbol);
  if (candles.length < period + 1) return 50;
  const closes = candles.map(c => c.close);
  const gains: number[] = [0]; const losses: number[] = [0];
  for (let i = 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gains.push(Math.max(d, 0)); losses.push(Math.max(-d, 0));
  }
  const ag = rma(gains, period); const al = rma(losses, period);
  const last = ag.length - 1;
  if (al[last] === 0) return 100;
  return 100 - 100 / (1 + ag[last] / al[last]);
}

export async function getMACD(symbol: string): Promise<{ macd: number; signal: number; histogram: number }> {
  const candles = await fetchCandles(symbol);
  if (candles.length < 26) return { macd: 0, signal: 0, histogram: 0 };
  const closes = candles.map(c => c.close);
  const fast = ema(closes, 12); const slow = ema(closes, 26);
  const macdLine = fast.map((v, i) => isNaN(v) || isNaN(slow[i]) ? NaN : v - slow[i]);
  const signal = ema(macdLine, 9);
  const last = macdLine.length - 1;
  return { macd: macdLine[last] || 0, signal: signal[last] || 0, histogram: (macdLine[last] || 0) - (signal[last] || 0) };
}

export async function getSuperTrend(symbol: string, atrLen = 14, mult = 2): Promise<{ trend: 1 | -1; line: number }> {
  const candles = await fetchCandles(symbol);
  if (candles.length < atrLen + 1) return { trend: 1, line: 0 };
  // ATR
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i], pc = candles[i - 1].close;
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc)));
  }
  const atr = rma(trs, atrLen);
  let trend: 1 | -1 = 1; let upper = 0, lower = 0;
  for (let i = atrLen; i < candles.length; i++) {
    const c = candles[i]; const hl2 = (c.high + c.low) / 2; const a = atr[i - 1] || 0;
    const upBasic = hl2 + mult * a; const loBasic = hl2 - mult * a;
    lower = candles[i - 1].close > lower ? Math.max(loBasic, lower) : loBasic;
    upper = candles[i - 1].close < upper ? Math.min(upBasic, upper) : upBasic;
    if (trend === -1 && c.close > upper) trend = 1;
    else if (trend === 1 && c.close < lower) trend = -1;
  }
  return { trend, line: trend === 1 ? lower : upper };
}

// Re-export so jarvisBrain's tools can import from here
export { fetchPrice };
