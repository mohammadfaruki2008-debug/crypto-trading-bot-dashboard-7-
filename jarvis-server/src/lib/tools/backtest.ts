/**
 * Backtest tool — vectorized simulation on real Binance historical klines.
 * No external library required — fetches candles and simulates bar-by-bar.
 */

interface BacktestConfig {
  symbol: string;
  startDate: string;    // ISO date
  endDate: string;
  riskPerTradePct: number;
  slPct: number;        // e.g. 2 = 2% below entry
  tpPct: number;        // e.g. 4 = 4% above entry
  signalFn?: 'sma_cross' | 'rsi_oversold' | 'custom';
}

interface BacktestResult {
  ok: boolean;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalReturnPct: number;
  sharpeRatio: number;
  maxDrawdownPct: number;
  profitFactor: number;
  message: string;
}

interface Candle { time: number; open: number; high: number; low: number; close: number; volume: number; }

async function fetchHistoricalCandles(symbol: string, interval: string, startTime: number, endTime: number): Promise<Candle[]> {
  const all: Candle[] = [];
  let cursor = startTime;
  while (cursor < endTime) {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&startTime=${cursor}&endTime=${endTime}&limit=1000`;
    const res = await fetch(url);
    const raw: any[] = await res.json();
    if (!Array.isArray(raw) || raw.length === 0) break;
    for (const k of raw) {
      all.push({ time: k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] });
    }
    cursor = raw[raw.length - 1][0] + 1;
    await new Promise(r => setTimeout(r, 200)); // rate limit
  }
  return all;
}

function sma(arr: number[], len: number): number[] {
  const out = new Array(arr.length).fill(NaN);
  for (let i = len - 1; i < arr.length; i++) {
    let s = 0; for (let j = i - len + 1; j <= i; j++) s += arr[j];
    out[i] = s / len;
  }
  return out;
}

function rsi(closes: number[], len: number): number[] {
  const out = new Array(closes.length).fill(NaN);
  let avgG = 0, avgL = 0;
  for (let i = 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    const g = Math.max(d, 0), l = Math.max(-d, 0);
    if (i <= len) { avgG += g / len; avgL += l / len; }
    else { avgG = (avgG * (len - 1) + g) / len; avgL = (avgL * (len - 1) + l) / len; }
    if (i >= len) out[i] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  }
  return out;
}

export async function runBacktest(config: BacktestConfig): Promise<BacktestResult> {
  const { symbol, startDate, endDate, slPct = 2, tpPct = 4 } = config;
  const startMs = new Date(startDate).getTime();
  const endMs = new Date(endDate).getTime();

  if (endMs <= startMs) return { ok: false, trades: 0, wins: 0, losses: 0, winRate: 0, totalReturnPct: 0, sharpeRatio: 0, maxDrawdownPct: 0, profitFactor: 0, message: 'Invalid date range' };

  const candles = await fetchHistoricalCandles(symbol, '1h', startMs, endMs);
  if (candles.length < 50) return { ok: false, trades: 0, wins: 0, losses: 0, winRate: 0, totalReturnPct: 0, sharpeRatio: 0, maxDrawdownPct: 0, profitFactor: 0, message: `Only ${candles.length} candles — need ≥50` };

  const closes = candles.map(c => c.close);
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const rsi14 = rsi(closes, 14);

  // Generate signals
  const signals: boolean[] = candles.map((_, i) => {
    if (config.signalFn === 'rsi_oversold') return rsi14[i] < 30 && rsi14[i - 1] >= 30;
    // default: SMA 20/50 cross
    return i > 0 && !isNaN(sma20[i]) && !isNaN(sma50[i]) && sma20[i - 1] <= sma50[i - 1] && sma20[i] > sma50[i];
  });

  // Simulate
  const returns: number[] = [];
  let equity = 10000, peak = 10000, maxDD = 0, cooldown = 0;

  for (let i = 50; i < candles.length - 10; i++) {
    if (cooldown > 0) { cooldown--; continue; }
    if (!signals[i]) continue;

    const entry = candles[i].close;
    const sl = entry * (1 - slPct / 100);
    const tp = entry * (1 + tpPct / 100);
    let result = 0;

    for (let j = i + 1; j < Math.min(candles.length, i + 100); j++) {
      if (candles[j].low <= sl) { result = -slPct; break; }
      if (candles[j].high >= tp) { result = tpPct; break; }
    }

    const pnl = equity * (result / 100);
    equity += pnl;
    returns.push(result / 100);
    peak = Math.max(peak, equity);
    const dd = ((peak - equity) / peak) * 100;
    maxDD = Math.max(maxDD, dd);
    cooldown = 5;
  }

  const trades = returns.length;
  const wins = returns.filter(r => r > 0).length;
  const losses = trades - wins;
  const mean = returns.reduce((a, b) => a + b, 0) / (trades || 1);
  const sd = Math.sqrt(returns.reduce((a, r) => a + (r - mean) ** 2, 0) / (trades || 1));
  const grossWin = returns.filter(r => r > 0).reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(returns.filter(r => r < 0).reduce((a, b) => a + b, 0));

  return {
    ok: true,
    trades,
    wins,
    losses,
    winRate: trades > 0 ? (wins / trades) * 100 : 0,
    totalReturnPct: ((equity - 10000) / 10000) * 100,
    sharpeRatio: sd > 0 ? (mean / sd) * Math.sqrt(252) : 0,
    maxDrawdownPct: maxDD,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin,
    message: `Backtest ${symbol} ${startDate}→${endDate}: ${trades} trades, ${(wins / (trades || 1) * 100).toFixed(1)}% WR, ${((equity - 10000) / 100).toFixed(1)}% return, max DD ${maxDD.toFixed(1)}%`,
  };
}
