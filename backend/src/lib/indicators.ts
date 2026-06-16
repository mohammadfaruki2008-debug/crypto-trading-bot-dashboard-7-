/**
 * Technical indicators — RSI, MACD, SuperTrend, ATR.
 * All compute on real Binance candles.
 */
import { fetchCandles, Candle } from './binance';

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

function ema(arr: number[], len: number): number[] {
  const k = 2 / (len + 1);
  const out = new Array(arr.length).fill(NaN);
  let prev = NaN, seed = 0, count = 0;
  for (let i = 0; i < arr.length; i++) {
    if (isNaN(arr[i])) { out[i] = prev; continue; }
    if (isNaN(prev)) { seed += arr[i]; count++; if (count === len) { prev = seed / len; out[i] = prev; } }
    else { prev = arr[i] * k + prev * (1 - k); out[i] = prev; }
  }
  return out;
}

function trueRange(c: Candle[]): number[] {
  return c.map((b, i) => {
    if (i === 0) return b.high - b.low;
    const pc = c[i - 1].close;
    return Math.max(b.high - b.low, Math.abs(b.high - pc), Math.abs(b.low - pc));
  });
}

export async function getRSI(symbol: string, period = 14, interval = '1h'): Promise<number> {
  const c = await fetchCandles(symbol, interval, 200);
  if (c.length < period + 1) return 50;
  const closes = c.map(x => x.close);
  const gains: number[] = [0], losses: number[] = [0];
  for (let i = 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gains.push(Math.max(d, 0)); losses.push(Math.max(-d, 0));
  }
  const ag = rma(gains, period); const al = rma(losses, period);
  const last = ag.length - 1;
  if (al[last] === 0) return 100;
  return parseFloat((100 - 100 / (1 + ag[last] / al[last])).toFixed(2));
}

export async function getMACD(symbol: string, interval = '1h'): Promise<{ macd: number; signal: number; histogram: number; trend: 'bull' | 'bear' | 'neutral' }> {
  const c = await fetchCandles(symbol, interval, 200);
  if (c.length < 30) return { macd: 0, signal: 0, histogram: 0, trend: 'neutral' };
  const closes = c.map(x => x.close);
  const fast = ema(closes, 12); const slow = ema(closes, 26);
  const macdLine = fast.map((v, i) => isNaN(v) || isNaN(slow[i]) ? NaN : v - slow[i]);
  const sigLine = ema(macdLine, 9);
  const last = macdLine.length - 1;
  const macd = macdLine[last] || 0; const signal = sigLine[last] || 0;
  const histogram = macd - signal;
  return { macd, signal, histogram, trend: histogram > 0 ? 'bull' : histogram < 0 ? 'bear' : 'neutral' };
}

export async function getSuperTrend(symbol: string, atrLen = 14, mult = 2, interval = '1h'): Promise<{ trend: 1 | -1; line: number; atr: number }> {
  const c = await fetchCandles(symbol, interval, 200);
  if (c.length < atrLen + 1) return { trend: 1, line: 0, atr: 0 };
  const trs = trueRange(c);
  const atrArr = rma(trs, atrLen);
  let trend: 1 | -1 = 1, upper = 0, lower = 0;
  for (let i = atrLen; i < c.length; i++) {
    const bar = c[i]; const hl2 = (bar.high + bar.low) / 2; const a = atrArr[i - 1] || 0;
    const upBasic = hl2 + mult * a; const loBasic = hl2 - mult * a;
    lower = c[i - 1].close > lower ? Math.max(loBasic, lower) : loBasic;
    upper = c[i - 1].close < upper ? Math.min(upBasic, upper) : upBasic;
    if (trend === -1 && bar.close > upper) trend = 1;
    else if (trend === 1 && bar.close < lower) trend = -1;
  }
  const atr = atrArr[atrArr.length - 1] || 0;
  return { trend, line: trend === 1 ? lower : upper, atr };
}

export async function getFullAnalysis(symbol: string, interval = '1h'): Promise<any> {
  const [candles, rsi, macd, st] = await Promise.all([
    fetchCandles(symbol, interval, 100),
    getRSI(symbol, 14, interval),
    getMACD(symbol, interval),
    getSuperTrend(symbol, 14, 2, interval),
  ]);
  const last = candles[candles.length - 1];
  return {
    symbol, interval,
    price: last?.close || 0,
    rsi, macd, supertrend: st,
    candle: { high: last?.high, low: last?.low, volume: last?.volume },
    timestamp: new Date().toISOString(),
  };
}
