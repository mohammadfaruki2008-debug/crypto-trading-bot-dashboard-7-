/**
 * Binance Spot REST API client.
 * All HMAC-SHA256 signing happens HERE on the server. Browser never touches keys.
 * Credentials loaded dynamically from settingsStore (DB-persisted, encrypted).
 */
import crypto from 'crypto';
import { loadBinanceCredentials } from './settingsStore';

const MAINNET = 'https://api.binance.com/api/v3';
const TESTNET = 'https://testnet.binance.vision/api/v3';

async function getBase(): Promise<{ base: string; apiKey: string; apiSecret: string } | null> {
  const creds = await loadBinanceCredentials();
  if (!creds) return null;
  return {
    base: creds.testnet ? TESTNET : MAINNET,
    apiKey: creds.apiKey,
    apiSecret: creds.apiSecret,
  };
}

/** Public market data — works without keys, uses mainnet by default. */
async function publicGet(path: string, params: Record<string, string> = {}): Promise<any> {
  // Public endpoints use mainnet regardless (more reliable for price data)
  const creds = await loadBinanceCredentials();
  const base = creds?.testnet ? TESTNET : MAINNET;
  const qs = new URLSearchParams(params).toString();
  const url = `${base}${path}${qs ? '?' + qs : ''}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    return res.json();
  } catch (err: any) {
    return { code: -1, msg: err.message };
  }
}

async function signedRequest(method: 'GET' | 'POST' | 'DELETE', path: string, params: Record<string, string> = {}): Promise<any> {
  const ctx = await getBase();
  if (!ctx) {
    return { code: -1, msg: 'Binance keys not configured. Go to Settings → save your API keys.' };
  }
  const qs = new URLSearchParams({ ...params, timestamp: Date.now().toString(), recvWindow: '10000' }).toString();
  const sig = crypto.createHmac('sha256', ctx.apiSecret).update(qs).digest('hex');
  const url = `${ctx.base}${path}?${qs}&signature=${sig}`;
  try {
    const res = await fetch(url, {
      method,
      headers: { 'X-MBX-APIKEY': ctx.apiKey },
      signal: AbortSignal.timeout(10000),
    });
    return res.json();
  } catch (err: any) {
    return { code: -1, msg: err.message };
  }
}

/* ───────── Public market data ───────── */

export async function fetchPrice(symbol: string): Promise<number> {
  const d = await publicGet('/ticker/price', { symbol: symbol.toUpperCase() });
  return parseFloat(d?.price || '0');
}

export async function fetch24h(symbol: string): Promise<any> {
  return publicGet('/ticker/24hr', { symbol: symbol.toUpperCase() });
}

export interface Candle { time: number; open: number; high: number; low: number; close: number; volume: number; }

export async function fetchCandles(symbol: string, interval = '1h', limit = 500): Promise<Candle[]> {
  const data = await publicGet('/klines', { symbol: symbol.toUpperCase(), interval, limit: String(limit) });
  if (!Array.isArray(data)) return [];
  return data.map((k: any[]) => ({ time: k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] }));
}

/* ───────── Symbol filters (cached 1h) ───────── */

const lotCache: Record<string, { stepSize: number; minQty: number; minNotional: number; tickSize: number; ts: number }> = {};

export async function getLotSize(symbol: string): Promise<{ stepSize: number; minQty: number; minNotional: number; tickSize: number }> {
  const cached = lotCache[symbol];
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
  lotCache[symbol] = info;
  return info;
}

function floorToStep(v: number, step: number): number {
  if (step <= 0) return v;
  const prec = Math.max(0, Math.round(-Math.log10(step)));
  return parseFloat((Math.floor(v / step) * step).toFixed(prec));
}

function priceToTick(v: number, tick: number): string {
  const prec = Math.max(0, Math.round(-Math.log10(tick)));
  return (Math.round(v / tick) * tick).toFixed(prec);
}

/* ───────── Signed (account / trading) ───────── */

export async function getAccountInfo(): Promise<any> {
  return signedRequest('GET', '/account');
}

export async function getOpenOrders(symbol?: string): Promise<any[]> {
  const data = await signedRequest('GET', '/openOrders', symbol ? { symbol: symbol.toUpperCase() } : {});
  return Array.isArray(data) ? data : [];
}

export async function getOrderStatus(symbol: string, orderId: number): Promise<string> {
  const d = await signedRequest('GET', '/order', { symbol: symbol.toUpperCase(), orderId: String(orderId) });
  return d?.status || 'UNKNOWN';
}

export async function cancelOrder(symbol: string, orderId: number): Promise<boolean> {
  const d = await signedRequest('DELETE', '/order', { symbol: symbol.toUpperCase(), orderId: String(orderId) });
  return !d?.code;
}

export async function cancelAllOrders(symbol: string): Promise<number> {
  const d = await signedRequest('DELETE', '/openOrders', { symbol: symbol.toUpperCase() });
  return Array.isArray(d) ? d.length : 0;
}

export interface BuyResult {
  ok: boolean; orderId?: number; executedQty?: number; spentUsdt?: number; avgPrice?: number; error?: string;
}

export async function marketBuy(symbol: string, quoteUsdt: number): Promise<BuyResult> {
  const d = await signedRequest('POST', '/order', {
    symbol: symbol.toUpperCase(), side: 'BUY', type: 'MARKET', quoteOrderQty: quoteUsdt.toFixed(2),
  });
  if (d?.code) return { ok: false, error: `${d.code}: ${d.msg}` };
  const qty = parseFloat(d.executedQty || '0'); const spent = parseFloat(d.cummulativeQuoteQty || '0');
  return { ok: true, orderId: d.orderId, executedQty: qty, spentUsdt: spent, avgPrice: qty > 0 ? spent / qty : 0 };
}

export async function marketSell(symbol: string, qty: number): Promise<BuyResult> {
  const { stepSize } = await getLotSize(symbol);
  const adj = floorToStep(qty, stepSize);
  const d = await signedRequest('POST', '/order', {
    symbol: symbol.toUpperCase(), side: 'SELL', type: 'MARKET', quantity: String(adj),
  });
  if (d?.code) return { ok: false, error: `${d.code}: ${d.msg}` };
  const q = parseFloat(d.executedQty || '0'); const rec = parseFloat(d.cummulativeQuoteQty || '0');
  return { ok: true, orderId: d.orderId, executedQty: q, spentUsdt: rec, avgPrice: q > 0 ? rec / q : 0 };
}

export async function limitSell(symbol: string, qty: number, price: number): Promise<{ ok: boolean; orderId?: number; error?: string }> {
  const { stepSize, tickSize } = await getLotSize(symbol);
  const d = await signedRequest('POST', '/order', {
    symbol: symbol.toUpperCase(), side: 'SELL', type: 'LIMIT', timeInForce: 'GTC',
    quantity: String(floorToStep(qty, stepSize)), price: priceToTick(price, tickSize),
  });
  if (d?.code) return { ok: false, error: `${d.code}: ${d.msg}` };
  return { ok: true, orderId: d.orderId };
}

export async function stopLossSell(symbol: string, qty: number, stopPrice: number, limitPrice: number): Promise<{ ok: boolean; orderId?: number; error?: string }> {
  const { stepSize, tickSize } = await getLotSize(symbol);
  const d = await signedRequest('POST', '/order', {
    symbol: symbol.toUpperCase(), side: 'SELL', type: 'STOP_LOSS_LIMIT', timeInForce: 'GTC',
    quantity: String(floorToStep(qty, stepSize)),
    stopPrice: priceToTick(stopPrice, tickSize),
    price: priceToTick(limitPrice, tickSize),
  });
  if (d?.code) return { ok: false, error: `${d.code}: ${d.msg}` };
  return { ok: true, orderId: d.orderId };
}

export async function validateKeys(): Promise<{ valid: boolean; canTrade: boolean; error?: string }> {
  const d = await getAccountInfo();
  if (d?.code) return { valid: false, canTrade: false, error: `${d.code}: ${d.msg}` };
  return { valid: true, canTrade: d.canTrade === true };
}
