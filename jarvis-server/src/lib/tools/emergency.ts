/**
 * Emergency stop — closes all open Binance orders + stops the monitor.
 */
import crypto from 'crypto';
import { stopMonitor } from './monitor';

const API_KEY = process.env.BINANCE_API_KEY || '';
const API_SECRET = process.env.BINANCE_SECRET || '';
const BASE = process.env.BINANCE_TESTNET === 'true'
  ? 'https://testnet.binance.vision/api/v3'
  : 'https://api.binance.com/api/v3';

async function signedRequest(method: string, path: string, params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams({ ...params, timestamp: Date.now().toString() }).toString();
  const sig = crypto.createHmac('sha256', API_SECRET).update(qs).digest('hex');
  const url = `${BASE}${path}?${qs}&signature=${sig}`;
  const res = await fetch(url, { method, headers: { 'X-MBX-APIKEY': API_KEY } });
  return res.json();
}

export async function emergencyStop(): Promise<{ ok: boolean; message: string; cancelledOrders: number }> {
  let cancelled = 0;

  try {
    // 1. Stop proactive monitor
    stopMonitor();

    // 2. Cancel all open orders across all symbols
    const account = await signedRequest('GET', '/account', {});
    if (account.code) return { ok: false, message: `API error: ${account.msg}`, cancelledOrders: 0 };

    const symbols = (account.balances as any[])
      .filter(b => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0)
      .filter(b => b.asset !== 'USDT' && b.asset !== 'BNB')
      .map(b => b.asset + 'USDT');

    for (const sym of symbols) {
      try {
        const orders = await signedRequest('GET', '/openOrders', { symbol: sym });
        if (Array.isArray(orders)) {
          for (const order of orders) {
            await signedRequest('DELETE', '/order', { symbol: sym, orderId: order.orderId.toString() });
            cancelled++;
          }
        }
      } catch { /* skip symbol */ }
    }

    // 3. Market-sell non-USDT holdings (emergency liquidation)
    for (const sym of symbols) {
      try {
        const balance = (account.balances as any[]).find(b => b.asset === sym.replace('USDT', ''));
        const free = parseFloat(balance?.free || '0');
        if (free > 0) {
          await signedRequest('POST', '/order', { symbol: sym, side: 'SELL', type: 'MARKET', quantity: free.toString() });
        }
      } catch { /* some symbols may not be sellable */ }
    }

    return {
      ok: true,
      message: `🛑 EMERGENCY STOP executed. ${cancelled} orders cancelled. All holdings market-sold. Monitor halted.`,
      cancelledOrders: cancelled,
    };
  } catch (err: any) {
    return { ok: false, message: `Emergency stop error: ${err.message}`, cancelledOrders: cancelled };
  }
}
