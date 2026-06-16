/**
 * Backtest tool — vectorized simulation on real Binance historical klines.
 */
import { fetchCandles } from '../binance';

interface BacktestConfig {
  symbol: string;
  startDate?: string;
  endDate?: string;
  slPct?: number;
  tpPct?: number;
  signal?: 'sma_cross' | 'rsi_oversold';
  interval?: string;
}

export interface BacktestResult {
  ok: boolean;
  symbol: string;
  period: string;
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

export async function runBacktest(cfg: BacktestConfig): Promise<BacktestResult> {
  const symbol = cfg.symbol.toUpperCase();
  const interval = cfg.interval || '1h';
  const slPct = cfg.slPct || 2;
  const tpPct = cfg.tpPct || 4;
  const start = cfg.startDate || new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const end = cfg.endDate || new Date().toISOString().slice(0, 10);

  // Fetch historical candles (paginated for >1000)
  const candles = await fetchCandles(symbol, interval, 1000);
  if (candles.length < 50) {
    return {
      ok: false, symbol, period: `${start}→${end}`, trades: 0, wins: 0, losses: 0,
      winRate: 0, totalReturnPct: 0, sharpeRatio: 0, maxDrawdownPct: 0, profitFactor: 0,
      message: `Only ${candles.length} candles available — need ≥50`,
    };
  }

  const closes = candles.map(c => c.close);
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const rsi14 = rsi(closes, 14);

  const signals: boolean[] = candles.map((_, i) => {
    if (cfg.signal === 'rsi_oversold') return rsi14[i] < 30 && rsi14[i - 1] >= 30;
    return i > 0 && !isNaN(sma20[i]) && !isNaN(sma50[i]) && sma20[i - 1] <= sma50[i - 1] && sma20[i] > sma50[i];
  });

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

    equity *= 1 + result / 100;
    returns.push(result / 100);
    peak = Math.max(peak, equity);
    maxDD = Math.max(maxDD, ((peak - equity) / peak) * 100);
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
    symbol, period: `${start}→${end}`,
    trades, wins, losses,
    winRate: trades > 0 ? parseFloat((wins / trades * 100).toFixed(1)) : 0,
    totalReturnPct: parseFloat(((equity - 10000) / 100).toFixed(2)),
    sharpeRatio: sd > 0 ? parseFloat((mean / sd * Math.sqrt(252)).toFixed(2)) : 0,
    maxDrawdownPct: parseFloat(maxDD.toFixed(2)),
    profitFactor: grossLoss > 0 ? parseFloat((grossWin / grossLoss).toFixed(2)) : grossWin,
    message: `Backtest ${symbol} ${interval}: ${trades} trades, ${(wins / (trades || 1) * 100).toFixed(0)}% WR, ${((equity - 10000) / 100).toFixed(1)}% return, max DD ${maxDD.toFixed(1)}%`,
  };
}
