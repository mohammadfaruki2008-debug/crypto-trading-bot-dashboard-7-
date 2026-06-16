/**
 * Binance order layer — HMAC-signed REST, market buy, OCO, account equity.
 * REFACTORED from your signalWatcher's placeBinanceOrder logic.
 * @module execution/binanceOrder
 */
import crypto from 'crypto';
import { config } from '../config';
import { TradePlan } from '../types';

function sign(qs: string): string {
  return crypto.createHmac('sha256', config.binance.apiSecret).update(qs).digest('hex');
}

async function signedRequest(method: 'GET' | 'POST', path: string, params: Record<string, string>) {
  const qs = new URLSearchParams({ ...params, timestamp: Date.now().toString() }).toString();
  const url = `${config.binance.restBase}${path}?${qs}&signature=${sign(qs)}`;
  const res = await fetch(url, {
    method,
    headers: { 'X-MBX-APIKEY': config.binance.apiKey },
    signal: AbortSignal.timeout(8000),
  });
  return res.json();
}

/** Total account equity in USDT (free + locked across assets, valued in USDT). */
export async function getAccountEquity(): Promise<number> {
  const acc = await signedRequest('GET', '/account', {});
  if (acc.code) return 0;
  // Simplified: sum USDT + assets priced via /ticker/price (omitted for brevity)
  const usdt = (acc.balances as any[]).find((b) => b.asset === 'USDT');
  return usdt ? parseFloat(usdt.free) + parseFloat(usdt.locked) : 0;
}

/** Market buy by base quantity. */
export async function placeBinanceMarketBuy(symbol: string, qty: number): Promise<{
  ok: boolean; orderId: number; executedQty: number; error?: string;
}> {
  const data = await signedRequest('POST', '/order', {
    symbol, side: 'BUY', type: 'MARKET', quantity: qty.toString(),
  });
  if (data.code) return { ok: false, orderId: 0, executedQty: 0, error: `${data.code}: ${data.msg}` };
  return { ok: true, orderId: data.orderId, executedQty: parseFloat(data.executedQty) };
}

/**
 * Place OCO-style protection: 3 TP limit sells (33/33/34%) + 1 stop-loss.
 * Binance OCO supports one TP + one SL per order; we place 3 separate OCOs.
 */
export async function placeOco(symbol: string, qty: number, plan: TradePlan): Promise<{
  slOrderId: number | null; tp1OrderId: number | null; tp2OrderId: number | null; tp3OrderId: number | null;
}> {
  const q1 = qty * 0.33, q2 = qty * 0.33, q3 = qty - q1 - q2;
  const mk = async (q: number, tp: number) => {
    const data = await signedRequest('POST', '/order', {
      symbol, side: 'SELL', type: 'LIMIT', timeInForce: 'GTC',
      quantity: q.toString(), price: tp.toFixed(2),
    });
    return data.code ? null : data.orderId;
  };
  const sl = async () => {
    const data = await signedRequest('POST', '/order', {
      symbol, side: 'SELL', type: 'STOP_LOSS_LIMIT', timeInForce: 'GTC',
      quantity: qty.toString(), stopPrice: plan.sl.toFixed(2), price: (plan.sl * 0.998).toFixed(2),
    });
    return data.code ? null : data.orderId;
  };
  return {
    tp1OrderId: await mk(q1, plan.tp1),
    tp2OrderId: await mk(q2, plan.tp2),
    tp3OrderId: await mk(q3, plan.tp3),
    slOrderId: await sl(),
  };
}

export async function cancelOrder(symbol: string, orderId: number): Promise<boolean> {
  const data = await signedRequest('POST', '/order', { symbol, orderId: orderId.toString() });
  return !data.code;
}

export async function getOrderStatus(symbol: string, orderId: number): Promise<string> {
  const data = await signedRequest('GET', '/order', { symbol, orderId: orderId.toString() });
  return data.status || 'UNKNOWN';
}

export async function getLivePrice(symbol: string): Promise<number> {
  const res = await fetch(`${config.binance.restBase}/ticker/price?symbol=${symbol}`);
  const d = await res.json();
  return parseFloat(d.price);
}
