// ============================================================================
// Binance Spot REST API — HMAC-SHA256 signed requests
// Works from browser via Binance's CORS-enabled endpoints.
// In production this moves to artifacts/api-server/src/lib/binance.ts
// ============================================================================

export interface BinanceCredentials {
  apiKey: string;
  apiSecret: string;
  testnet?: boolean;
}

export interface BinanceBalance {
  asset: string;
  free: number;
  locked: number;
}

export interface BinanceOrderResult {
  orderId: number;
  symbol: string;
  status: string;
  side: string;
  type: string;
  price: string;
  origQty: string;
  executedQty: string;
  cummulativeQuoteQty: string;
  transactTime: number;
  error?: string;
}

export interface BinancePrice {
  symbol: string;
  price: number;
}

// ─── HMAC-SHA256 signature (Web Crypto API — works in browser) ─────

async function hmacSha256(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const msgData = encoder.encode(message);
  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function baseUrl(testnet: boolean): string {
  return testnet
    ? 'https://testnet.binance.vision/api/v3'
    : 'https://api.binance.com/api/v3';
}

// ─── Signed GET ────────────────────────────────────────────────────

async function signedGet(creds: BinanceCredentials, path: string, params: Record<string, string> = {}) {
  const ts = Date.now().toString();
  const qs = new URLSearchParams({ ...params, timestamp: ts }).toString();
  const sig = await hmacSha256(creds.apiSecret, qs);
  const url = `${baseUrl(!!creds.testnet)}${path}?${qs}&signature=${sig}`;
  const res = await fetch(url, {
    headers: { 'X-MBX-APIKEY': creds.apiKey },
    signal: AbortSignal.timeout(8000),
  });
  return res.json();
}

// ─── Signed POST ───────────────────────────────────────────────────

async function signedPost(creds: BinanceCredentials, path: string, params: Record<string, string>) {
  const ts = Date.now().toString();
  const qs = new URLSearchParams({ ...params, timestamp: ts }).toString();
  const sig = await hmacSha256(creds.apiSecret, qs);
  const body = `${qs}&signature=${sig}`;
  const res = await fetch(`${baseUrl(!!creds.testnet)}${path}`, {
    method: 'POST',
    headers: {
      'X-MBX-APIKEY': creds.apiKey,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
    signal: AbortSignal.timeout(8000),
  });
  return res.json();
}

// ─── Public API (no signature) ─────────────────────────────────────

export async function getLivePrice(symbol: string, testnet = false): Promise<number> {
  try {
    const url = `${baseUrl(testnet)}/ticker/price?symbol=${symbol}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const data = await res.json();
    return parseFloat(data.price);
  } catch {
    return 0;
  }
}

export async function getExchangeInfo(symbol: string, testnet = false) {
  try {
    const url = `${baseUrl(testnet)}/exchangeInfo?symbol=${symbol}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return res.json();
  } catch {
    return null;
  }
}

// ─── Validate API keys (test connectivity + permissions) ───────────

export async function validateApiKeys(creds: BinanceCredentials): Promise<{
  valid: boolean;
  canTrade: boolean;
  error?: string;
  accountType?: string;
}> {
  try {
    const data = await signedGet(creds, '/account');
    if (data.code) {
      return { valid: false, canTrade: false, error: `Binance error ${data.code}: ${data.msg}` };
    }
    const canTrade = data.canTrade === true;
    return { valid: true, canTrade, accountType: data.accountType || 'SPOT' };
  } catch (err: any) {
    return { valid: false, canTrade: false, error: err.message || 'Network error' };
  }
}

// ─── Get USDT free balance ─────────────────────────────────────────

export async function getUsdtBalance(creds: BinanceCredentials): Promise<number> {
  try {
    const data = await signedGet(creds, '/account');
    if (data.code) return 0;
    const usdt = (data.balances as BinanceBalance[]).find(b => b.asset === 'USDT');
    return usdt ? usdt.free : 0;
  } catch {
    return 0;
  }
}

// ─── Get all balances ──────────────────────────────────────────────

export async function getAllBalances(creds: BinanceCredentials): Promise<BinanceBalance[]> {
  try {
    const data = await signedGet(creds, '/account');
    if (data.code) return [];
    return (data.balances as any[])
      .filter(b => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0)
      .map(b => ({ asset: b.asset, free: parseFloat(b.free), locked: parseFloat(b.locked) }));
  } catch {
    return [];
  }
}

// ─── Get step size for symbol (quantity precision) ─────────────────

async function getLotSize(symbol: string, testnet: boolean): Promise<{ stepSize: number; minQty: number; minNotional: number }> {
  try {
    const info = await getExchangeInfo(symbol, testnet);
    const sym = info?.symbols?.find((s: any) => s.symbol === symbol);
    if (!sym) return { stepSize: 0.00001, minQty: 0.00001, minNotional: 10 };
    const lot = sym.filters?.find((f: any) => f.filterType === 'LOT_SIZE');
    const notional = sym.filters?.find((f: any) => f.filterType === 'MIN_NOTIONAL' || f.filterType === 'NOTIONAL');
    return {
      stepSize: parseFloat(lot?.stepSize || '0.00001'),
      minQty: parseFloat(lot?.minQty || '0.00001'),
      minNotional: parseFloat(notional?.minNotional || notional?.notional || '10'),
    };
  } catch {
    return { stepSize: 0.00001, minQty: 0.00001, minNotional: 10 };
  }
}

function floorToStep(value: number, step: number): number {
  if (step <= 0) return value;
  const precision = Math.round(-Math.log10(step));
  return parseFloat((Math.floor(value / step) * step).toFixed(precision));
}

// ─── Place MARKET BUY (quote amount — spends exactly X USDT) ──────

export async function placeMarketBuy(
  creds: BinanceCredentials,
  symbol: string,
  quoteUsdt: number
): Promise<BinanceOrderResult> {
  try {
    const params: Record<string, string> = {
      symbol,
      side: 'BUY',
      type: 'MARKET',
      quoteOrderQty: quoteUsdt.toFixed(2),
    };
    const data = await signedPost(creds, '/order', params);
    if (data.code) return { ...data, error: `${data.code}: ${data.msg}` } as BinanceOrderResult;
    return data as BinanceOrderResult;
  } catch (err: any) {
    return { orderId: 0, symbol, status: 'ERROR', side: 'BUY', type: 'MARKET', price: '0', origQty: '0', executedQty: '0', cummulativeQuoteQty: '0', transactTime: Date.now(), error: err.message } as BinanceOrderResult;
  }
}

// ─── Place LIMIT SELL (take profit order) ─────────────────────────

export async function placeLimitSell(
  creds: BinanceCredentials,
  symbol: string,
  qty: number,
  price: number
): Promise<BinanceOrderResult> {
  try {
    const { stepSize } = await getLotSize(symbol, !!creds.testnet);
    const adjustedQty = floorToStep(qty, stepSize);
    const pricePrecision = price > 10000 ? 2 : price > 100 ? 2 : price > 1 ? 4 : 6;
    const params: Record<string, string> = {
      symbol,
      side: 'SELL',
      type: 'LIMIT',
      timeInForce: 'GTC',
      quantity: adjustedQty.toString(),
      price: price.toFixed(pricePrecision),
    };
    const data = await signedPost(creds, '/order', params);
    if (data.code) return { ...data, error: `${data.code}: ${data.msg}` } as BinanceOrderResult;
    return data as BinanceOrderResult;
  } catch (err: any) {
    return { orderId: 0, symbol, status: 'ERROR', side: 'SELL', type: 'LIMIT', price: '0', origQty: '0', executedQty: '0', cummulativeQuoteQty: '0', transactTime: Date.now(), error: err.message } as BinanceOrderResult;
  }
}

// ─── Place STOP-LOSS LIMIT SELL ────────────────────────────────────

export async function placeStopLossSell(
  creds: BinanceCredentials,
  symbol: string,
  qty: number,
  stopPrice: number,
  limitPrice: number
): Promise<BinanceOrderResult> {
  try {
    const { stepSize } = await getLotSize(symbol, !!creds.testnet);
    const adjustedQty = floorToStep(qty, stepSize);
    const pricePrecision = stopPrice > 10000 ? 2 : stopPrice > 100 ? 2 : stopPrice > 1 ? 4 : 6;
    const params: Record<string, string> = {
      symbol,
      side: 'SELL',
      type: 'STOP_LOSS_LIMIT',
      timeInForce: 'GTC',
      quantity: adjustedQty.toString(),
      stopPrice: stopPrice.toFixed(pricePrecision),
      price: limitPrice.toFixed(pricePrecision), // slightly below stop
    };
    const data = await signedPost(creds, '/order', params);
    if (data.code) return { ...data, error: `${data.code}: ${data.msg}` } as BinanceOrderResult;
    return data as BinanceOrderResult;
  } catch (err: any) {
    return { orderId: 0, symbol, status: 'ERROR', side: 'SELL', type: 'STOP_LOSS_LIMIT', price: '0', origQty: '0', executedQty: '0', cummulativeQuoteQty: '0', transactTime: Date.now(), error: err.message } as BinanceOrderResult;
  }
}

// ─── Cancel an open order ──────────────────────────────────────────

export async function cancelOrder(
  creds: BinanceCredentials,
  symbol: string,
  orderId: number
): Promise<boolean> {
  try {
    const data = await signedPost(creds, '/order/cancel' as any, { symbol, orderId: orderId.toString() });
    return !data.code;
  } catch {
    return false;
  }
}

// ─── Get open orders for symbol ────────────────────────────────────

export async function getOpenOrders(creds: BinanceCredentials, symbol: string): Promise<any[]> {
  try {
    const data = await signedGet(creds, '/openOrders', { symbol });
    if (data.code) return [];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

// ─── Get order status ─────────────────────────────────────────────

export async function getOrderStatus(creds: BinanceCredentials, symbol: string, orderId: number): Promise<string> {
  try {
    const data = await signedGet(creds, '/order', { symbol, orderId: orderId.toString() });
    return data.status || 'UNKNOWN';
  } catch {
    return 'UNKNOWN';
  }
}
