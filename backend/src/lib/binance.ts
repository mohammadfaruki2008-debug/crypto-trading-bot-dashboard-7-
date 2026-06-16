/**
 * Binance Spot REST API client — HMAC-SHA256 signed.
 * Handles market buy/sell, OCO (TP/SL), account, klines.
 */
import crypto from 'crypto';
import { config } from '../config';

const BASE = config.binance.restBase;

function sign(qs: string): string {
  return crypto.createHmac('sha256', config.binance.apiSecret).update(qs).digest('hex');
}

async function publicGet(path: string, params: Record<string, string> = {}): Promise<any> {
  const qs = new URLSearchParams(params).toString();
  const url = `${BASE}${path}${qs ? '?' + qs : ''}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    return res.json();
  } catch (err: any) {
    return { code: -1, msg: err.message };
  }
}

async function signedRequest(method: 'GET' | 'POST' | 'DELETE', path: string, params: Record<string, string> = {}): Promise<any> {
  if (!config.binance.apiKey || !config.binance.apiSecret) {
    return { code: -1, msg: 'Binance API keys not configured on server' };
  }
  const qs = new URLSearchParams({ ...params, timestamp: Date.now().toString(), recvWindow: '10000' }).toString();
  const sig = sign(qs);
  const url = `${BASE}${path}?${qs}&signature=${sig}`;
  try {
    const res = await fetch(url, {
      method,
      headers: { 'X-MBX-APIKEY': config.binance.apiKey },
      signal: AbortSignal.timeout(10000),
    });
    return res.json();
  } catch (err: any) {
    return { code: -1, msg: err.message };
  }
}

/* ───────────── Public endpoints ───────────── */

export async function fetchPrice(symbol: string): Promise<number> {
  const data = await publicGet('/ticker/price', { symbol: symbol.toUpperCase() });
  return parseFloat(data?.price || '0');
}

export async function fetch24hStats(symbol: string): Promise<any> {
  return publicGet('/ticker/24hr', { symbol: symbol.toUpperCase() });
}

export interface Candle {
  time: number; open: number; high: number; low: number; close: number; volume: number;
}

export async function fetchCandles(symbol: string, interval: string = '1h', limit: number = 500): Promise<Candle[]> {
  const data = await publicGet('/klines', { symbol: symbol.toUpperCase(), interval, limit: limit.toString() });
  if (!Array.isArray(data)) return [];
  return data.map((k: any[]) => ({
    time: k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5],
  }));
}

/* ───────────── Symbol info / lot-size precision ───────────── */

const exchangeInfoCache: Record<string, { stepSize: number; minQty: number; minNotional: number; tickSize: number; ts: number }> = {};

export async function getLotSize(symbol: string): Promise<{ stepSize: number; minQty: number; minNotional: number; tickSize: number }> {
  const cached = exchangeInfoCache[symbol];
  if (cached && Date.now() - cached.ts < 3600000) return cached;

  const data = await publicGet('/exchangeInfo', { symbol: symbol.toUpperCase() });
  const sym = data?.symbols?.[0];
  const lot = sym?.filters?.find((f: any) => f.filterType === 'LOT_SIZE');
  const price = sym?.filters?.find((f: any) => f.filterType === 'PRICE_FILTER');
  const notional = sym?.filters?.find((f: any) => f.filterType === 'MIN_NOTIONAL' || f.filterType === 'NOTIONAL');

  const info = {
    stepSize: parseFloat(lot?.stepSize || '0.00001'),
    minQty: parseFloat(lot?.minQty || '0.00001'),
    minNotional: parseFloat(notional?.minNotional || notional?.notional || '10'),
    tickSize: parseFloat(price?.tickSize || '0.01'),
    ts: Date.now(),
  };
  exchangeInfoCache[symbol] = info;
  return info;
}

function floorToStep(value: number, step: number): number {
  if (step <= 0) return value;
  const precision = Math.max(0, Math.round(-Math.log10(step)));
  return parseFloat((Math.floor(value / step) * step).toFixed(precision));
}

function priceToTick(value: number, tick: number): string {
  const precision = Math.max(0, Math.round(-Math.log10(tick)));
  return (Math.round(value / tick) * tick).toFixed(precision);
}

/* ───────────── Signed (trading) endpoints ───────────── */

export async function getAccountInfo(): Promise<any> {
  return signedRequest('GET', '/account');
}

export async function getOpenOrders(symbol?: string): Promise<any[]> {
  const params = symbol ? { symbol: symbol.toUpperCase() } : {};
  const data = await signedRequest('GET', '/openOrders', params);
  return Array.isArray(data) ? data : [];
}

export async function getOrderStatus(symbol: string, orderId: number): Promise<string> {
  const data = await signedRequest('GET', '/order', { symbol: symbol.toUpperCase(), orderId: orderId.toString() });
  return data?.status || 'UNKNOWN';
}

export async function cancelOrder(symbol: string, orderId: number): Promise<boolean> {
  const data = await signedRequest('DELETE', '/order', { symbol: symbol.toUpperCase(), orderId: orderId.toString() });
  return !data?.code;
}

export async function cancelAllOrders(symbol: string): Promise<number> {
  const data = await signedRequest('DELETE', '/openOrders', { symbol: symbol.toUpperCase() });
  return Array.isArray(data) ? data.length : 0;
}

/* ───────────── Order placement ───────────── */

export interface BuyResult {
  ok: boolean;
  orderId?: number;
  executedQty?: number;
  spentUsdt?: number;
  avgPrice?: number;
  error?: string;
}

/** Market BUY using quoteOrderQty (spend exactly X USDT). */
export async function marketBuy(symbol: string, quoteUsdt: number): Promise<BuyResult> {
  const data = await signedRequest('POST', '/order', {
    symbol: symbol.toUpperCase(),
    side: 'BUY',
    type: 'MARKET',
    quoteOrderQty: quoteUsdt.toFixed(2),
  });
  if (data?.code) return { ok: false, error: `${data.code}: ${data.msg}` };
  const executedQty = parseFloat(data.executedQty || '0');
  const spent = parseFloat(data.cummulativeQuoteQty || '0');
  return {
    ok: true,
    orderId: data.orderId,
    executedQty,
    spentUsdt: spent,
    avgPrice: executedQty > 0 ? spent / executedQty : 0,
  };
}

/** Market SELL by base qty (sell exactly X tokens). */
export async function marketSell(symbol: string, qty: number): Promise<BuyResult> {
  const { stepSize } = await getLotSize(symbol);
  const adj = floorToStep(qty, stepSize);
  const data = await signedRequest('POST', '/order', {
    symbol: symbol.toUpperCase(),
    side: 'SELL',
    type: 'MARKET',
    quantity: adj.toString(),
  });
  if (data?.code) return { ok: false, error: `${data.code}: ${data.msg}` };
  const executedQty = parseFloat(data.executedQty || '0');
  const received = parseFloat(data.cummulativeQuoteQty || '0');
  return {
    ok: true,
    orderId: data.orderId,
    executedQty,
    spentUsdt: received,
    avgPrice: executedQty > 0 ? received / executedQty : 0,
  };
}

/** Limit SELL (used for take-profit). */
export async function limitSell(symbol: string, qty: number, price: number): Promise<{ ok: boolean; orderId?: number; error?: string }> {
  const { stepSize, tickSize } = await getLotSize(symbol);
  const adjQty = floorToStep(qty, stepSize);
  const adjPrice = priceToTick(price, tickSize);
  const data = await signedRequest('POST', '/order', {
    symbol: symbol.toUpperCase(),
    side: 'SELL',
    type: 'LIMIT',
    timeInForce: 'GTC',
    quantity: adjQty.toString(),
    price: adjPrice,
  });
  if (data?.code) return { ok: false, error: `${data.code}: ${data.msg}` };
  return { ok: true, orderId: data.orderId };
}

/** Stop-loss LIMIT sell. */
export async function stopLossSell(symbol: string, qty: number, stopPrice: number, limitPrice: number): Promise<{ ok: boolean; orderId?: number; error?: string }> {
  const { stepSize, tickSize } = await getLotSize(symbol);
  const adjQty = floorToStep(qty, stepSize);
  const stopAdj = priceToTick(stopPrice, tickSize);
  const limitAdj = priceToTick(limitPrice, tickSize);
  const data = await signedRequest('POST', '/order', {
    symbol: symbol.toUpperCase(),
    side: 'SELL',
    type: 'STOP_LOSS_LIMIT',
    timeInForce: 'GTC',
    quantity: adjQty.toString(),
    stopPrice: stopAdj,
    price: limitAdj,
  });
  if (data?.code) return { ok: false, error: `${data.code}: ${data.msg}` };
  return { ok: true, orderId: data.orderId };
}

/** Validate API keys. */
export async function validateKeys(): Promise<{ valid: boolean; canTrade: boolean; error?: string }> {
  const data = await getAccountInfo();
  if (data?.code) return { valid: false, canTrade: false, error: `${data.code}: ${data.msg}` };
  return { valid: true, canTrade: data.canTrade === true };
}
