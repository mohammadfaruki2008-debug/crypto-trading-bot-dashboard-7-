/**
 * Portfolio tool — fetches REAL Binance account balances and open orders.
 */
import crypto from 'crypto';

const API_KEY = process.env.BINANCE_API_KEY || '';
const API_SECRET = process.env.BINANCE_SECRET || '';
const BASE = process.env.BINANCE_TESTNET === 'true'
  ? 'https://testnet.binance.vision/api/v3'
  : 'https://api.binance.com/api/v3';

async function signedGet(path: string, params: Record<string, string> = {}): Promise<any> {
  const qs = new URLSearchParams({ ...params, timestamp: Date.now().toString() }).toString();
  const sig = crypto.createHmac('sha256', API_SECRET).update(qs).digest('hex');
  const res = await fetch(`${BASE}${path}?${qs}&signature=${sig}`, {
    headers: { 'X-MBX-APIKEY': API_KEY },
  });
  return res.json();
}

export interface PortfolioSummary {
  ok: boolean;
  totalUsdt: number;
  freeUsdt: number;
  assets: { asset: string; free: number; locked: number; usdtValue: number }[];
  openOrders: number;
  message: string;
}

export async function getPortfolio(): Promise<PortfolioSummary> {
  try {
    const account = await signedGet('/account');
    if (account.code) return { ok: false, totalUsdt: 0, freeUsdt: 0, assets: [], openOrders: 0, message: `API error: ${account.msg}` };

    const balances = (account.balances as any[])
      .filter(b => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0)
      .map(b => ({ asset: b.asset, free: parseFloat(b.free), locked: parseFloat(b.locked), usdtValue: 0 }));

    // Estimate USDT values
    let totalUsdt = 0;
    for (const b of balances) {
      if (b.asset === 'USDT') { b.usdtValue = b.free + b.locked; }
      else {
        try {
          const ticker = await fetch(`${BASE}/ticker/price?symbol=${b.asset}USDT`);
          const data = await ticker.json();
          b.usdtValue = (b.free + b.locked) * parseFloat(data.price || '0');
        } catch { b.usdtValue = 0; }
      }
      totalUsdt += b.usdtValue;
    }

    const usdt = balances.find(b => b.asset === 'USDT');
    const freeUsdt = usdt ? usdt.free : 0;

    const orders = await signedGet('/openOrders');
    const openOrders = Array.isArray(orders) ? orders.length : 0;

    return {
      ok: true,
      totalUsdt: parseFloat(totalUsdt.toFixed(2)),
      freeUsdt: parseFloat(freeUsdt.toFixed(2)),
      assets: balances.filter(b => b.usdtValue > 1),
      openOrders,
      message: `Portfolio: ${totalUsdt.toFixed(2)} USDT total, ${freeUsdt.toFixed(2)} free, ${balances.length} assets, ${openOrders} open orders`,
    };
  } catch (err: any) {
    return { ok: false, totalUsdt: 0, freeUsdt: 0, assets: [], openOrders: 0, message: `Portfolio fetch error: ${err.message}` };
  }
}
