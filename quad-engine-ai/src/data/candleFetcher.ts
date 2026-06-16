/**
 * Candle fetcher — chunked, rate-limit-aware Binance kline loader.
 * REFACTORED from your signalWatcher's fetchBinanceCandlesChunks.
 * @module data/candleFetcher
 */
import { Candle } from '../types';
import { config } from '../config';

/**
 * Fetch up to `total` candles via paginated 1000-bar requests so the
 * Lorentzian training pool matches what TradingView loads.
 */
export async function fetchCandles(symbol: string, interval: string, total = 5000): Promise<Candle[]> {
  const all: Candle[] = [];
  let endTime: number | undefined;

  while (all.length < total) {
    const limit = Math.min(1000, total - all.length);
    const url =
      `${config.binance.restBase}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}` +
      (endTime !== undefined ? `&endTime=${endTime}` : '');
    const res = await fetch(url, { signal: AbortSignal.timeout(9000) });
    if (!res.ok) throw new Error(`klines HTTP ${res.status}`);
    const raw = (await res.json()) as unknown[];
    if (!Array.isArray(raw) || raw.length === 0) break;
    const batch: Candle[] = (raw as any[][]).map((k) => ({
      time: k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5],
    }));
    all.unshift(...batch);
    endTime = batch[0].time - 1;
    if (raw.length < limit) break;
    await new Promise((r) => setTimeout(r, 250)); // respect rate limits
  }
  return all;
}
