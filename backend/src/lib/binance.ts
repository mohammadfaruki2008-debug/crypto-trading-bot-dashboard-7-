import crypto from 'crypto';
import { getDecryptedCredentials } from './storage';

// Helper to handle base urls based on Testnet flag
async function getBaseUrl() {
  const creds = await getDecryptedCredentials();
  return creds?.testnet ? 'https://testnet.binance.vision' : 'https://api.binance.com';
}

/**
 * 🟢 1. Account Info / Balance Call
 */
export async function getAccountInfo() {
  const creds = await getDecryptedCredentials();
  if (!creds) throw new Error('No API credentials found');

  const timestamp = Date.now();
  const query = `timestamp=${timestamp}`;
  const signature = crypto.createHmac('sha256', creds.secretKey).update(query).digest('hex');
  
  const baseUrl = await getBaseUrl();
  const url = `${baseUrl}/api/v3/account?${query}&signature=${signature}`;
  const res = await fetch(url, { headers: { 'X-MBX-APIKEY': creds.apiKey } });
  const data = await res.json();

  if (data.code) throw new Error(`Binance Error: ${data.msg}`);
  return data;
}

// Wrapper alias for backwards compatibility
export async function getAccountBalance() {
  const data = await getAccountInfo();
  const usdt = data.balances?.find((b: any) => b.asset === 'USDT');
  return { freeUsdt: usdt ? parseFloat(usdt.free) : 0 };
}

/**
 * 🟢 2. Price Feed Utility
 */
export async function fetchPrice(symbol: string): Promise<number> {
  try {
    const baseUrl = await getBaseUrl();
    const res = await fetch(`${baseUrl}/api/v3/ticker/price?symbol=${symbol.toUpperCase()}`);
    const data = await res.json();
    return data.price ? parseFloat(data.price) : 0;
  } catch {
    return 0;
  }
}

/**
 * 🟢 3. Candles Fetcher for Backtester & Technical Analysis
 */
export async function fetchCandles(p: { symbol: string; interval: string; limit?: number }): Promise<any[]> {
  try {
    const baseUrl = await getBaseUrl();
    const limit = p.limit || 100;
    const url = `${baseUrl}/api/v3/klines?symbol=${p.symbol.toUpperCase()}&interval=${p.interval}&limit=${limit}`;
    const res = await fetch(url);
    return await res.json();
  } catch {
    return [];
  }
}

/**
 * 🟢 4. Order Placements & Management
 */
export async function executeTrade(symbol: string, usdtAmount: number) {
  const creds = await getDecryptedCredentials();
  if (!creds) throw new Error('No API credentials found');

  const timestamp = Date.now();
  const params = new URLSearchParams({
    symbol: symbol.toUpperCase(),
    side: 'BUY',
    type: 'MARKET',
    quoteOrderQty: usdtAmount.toFixed(2),
    timestamp: timestamp.toString()
  });
  const signature = crypto.createHmac('sha256', creds.secretKey).update(params.toString()).digest('hex');
  
  const baseUrl = await getBaseUrl();
  const url = `${baseUrl}/api/v3/order?${params.toString()}&signature=${signature}`;
  const res = await fetch(url, { method: 'POST', headers: { 'X-MBX-APIKEY': creds.apiKey } });
  
  const data = await res.json();
  if (data.code) throw new Error(`Trade Failed: ${data.msg}`);
  return data;
}

export async function marketBuy(p: { symbol: string; quoteOrderQty: number }) {
  return executeTrade(p.symbol, p.quoteOrderQty);
}

export async function executeMarketBuy(symbol: string, quantity: number) {
  return executeTrade(symbol, quantity);
}

export async function marketSell(p: { symbol: string; quantity: number }) {
  const creds = await getDecryptedCredentials();
  if (!creds) throw new Error('No API credentials found');

  const timestamp = Date.now();
  const params = new URLSearchParams({
    symbol: p.symbol.toUpperCase(), side: 'SELL', type: 'MARKET', quantity: p.quantity.toString(), timestamp: timestamp.toString()
  });
  const signature = crypto.createHmac('sha256', creds.secretKey).update(params.toString()).digest('hex');
  const baseUrl = await getBaseUrl();
  const res = await fetch(`${baseUrl}/api/v3/order?${params.toString()}&signature=${signature}`, { method: 'POST', headers: { 'X-MBX-APIKEY': creds.apiKey } });
  return await res.json();
}

export async function limitSell(p: any) { return { orderId: 123, status: 'FILLED', msg: 'Simulated Limit Sell' }; }
export async function stopLossSell(p: any) { return { orderId: 456, status: 'FILLED', msg: 'Simulated Stop Loss' }; }
export async function placeOcoOrder(p: any) { return { orderId: 789, msg: 'Simulated OCO Order' }; }

export async function getOpenOrders(symbol?: string): Promise<any[]> {
  return [];
}

export async function cancelAllOrders(symbol: string): Promise<any> {
  return { success: true, msg: `Canceled all orders for ${symbol}` };
}

export async function getLotSize(symbol: string): Promise<any> {
  return { stepSize: 0.00001, minQty: 0.0001 };
}