import crypto from 'crypto';
import { getDecryptedCreds } from './settingsStore';

export async function getAccountBalance() {
  const creds = await getDecryptedCreds();
  if (!creds) throw new Error('No API credentials found');

  const timestamp = Date.now();
  const query = `timestamp=${timestamp}`;
  const signature = crypto.createHmac('sha256', creds.secretKey).update(query).digest('hex');
  
  const url = `https://api.binance.com/api/v3/account?${query}&signature=${signature}`;
  const res = await fetch(url, { headers: { 'X-MBX-APIKEY': creds.apiKey } });
  const data = await res.json();

  if (data.code) throw new Error(`Binance Error: ${data.msg}`);
  
  const usdt = data.balances.find((b: any) => b.asset === 'USDT');
  return { freeUsdt: usdt ? parseFloat(usdt.free) : 0 };
}

export async function executeTrade(symbol: string, usdtAmount: number) {
  const creds = await getDecryptedCreds();
  if (!creds) throw new Error('No API credentials found');

  const timestamp = Date.now();
  const params = new URLSearchParams({
    symbol, side: 'BUY', type: 'MARKET', quoteOrderQty: usdtAmount.toFixed(2), timestamp: timestamp.toString()
  });
  const signature = crypto.createHmac('sha256', creds.secretKey).update(params.toString()).digest('hex');
  
  const url = `https://api.binance.com/api/v3/order?${params.toString()}&signature=${signature}`;
  const res = await fetch(url, { method: 'POST', headers: { 'X-MBX-APIKEY': creds.apiKey } });
  
  const data = await res.json();
  if (data.code) throw new Error(`Trade Failed: ${data.msg}`);
  return data;
}
