/**
 * Binance Spot REST API client — HMAC-SHA256 signed requests.
 */
import crypto from 'crypto';

const API_KEY = process.env.BINANCE_API_KEY || '';
const API_SECRET = process.env.BINANCE_SECRET || '';
const TESTNET = process.env.BINANCE_TESTNET === 'true';
const BASE = TESTNET ? 'https://testnet.binance.vision/api/v3' : 'https://api.binance.com/api/v3';

function sign(qs: string): string {
  return crypto.createHmac('sha256', API_SECRET).update(qs).digest('hex');
}

/** Fetch live spot price for a symbol (public, no signature). */
export async function fetchPrice(symbol: string): Promise<number> {
  try {
    const res = await fetch(`${BASE}/ticker/price?symbol=${symbol.toUpperCase()}`);
    if (!res.ok) return 0;
    const data: any = await res.json();
    return parseFloat(data.price || '0');
  } catch {
    return 0;
  }
}

/** Place a signed Binance order. */
export async function placeBinanceOrder(params: Record<string, string>): Promise<any> {
  if (!API_KEY || !API_SECRET) {
    return { code: -1, msg: 'BINANCE_API_KEY/SECRET not configured on server' };
  }
  const qs = new URLSearchParams({ ...params, timestamp: Date.now().toString() }).toString();
  const url = `${BASE}/order?${qs}&signature=${sign(qs)}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'X-MBX-APIKEY': API_KEY },
    });
    return res.json();
  } catch (err: any) {
    return { code: -1, msg: err.message };
  }
}

/** Generic signed GET (used by account, openOrders, etc.). */
export async function signedGet(path: string, params: Record<string, string> = {}): Promise<any> {
  if (!API_KEY || !API_SECRET) {
    return { code: -1, msg: 'BINANCE_API_KEY/SECRET not configured' };
  }
  const qs = new URLSearchParams({ ...params, timestamp: Date.now().toString() }).toString();
  const url = `${BASE}${path}?${qs}&signature=${sign(qs)}`;
  try {
    const res = await fetch(url, { headers: { 'X-MBX-APIKEY': API_KEY } });
    return res.json();
  } catch (err: any) {
    return { code: -1, msg: err.message };
  }
}
