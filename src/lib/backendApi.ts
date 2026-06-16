/**
 * Backend API client.
 *
 * SECURITY: The browser NEVER calls Binance directly with API keys.
 * All Binance operations route through the backend, which holds the keys
 * server-side and signs requests there.
 *
 * Configure via Netlify/Render env vars:
 *   VITE_BACKEND_URL — e.g. https://quantum-mind-backend.onrender.com
 *   VITE_ADMIN_TOKEN — the same ADMIN_TOKEN set on the backend
 */

const BACKEND = (import.meta as any).env?.VITE_BACKEND_URL || '';
const ADMIN_TOKEN = (import.meta as any).env?.VITE_ADMIN_TOKEN || '';

export const backendConfigured = Boolean(BACKEND);

interface Opts {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: any;
  auth?: boolean;
}

async function call<T = any>(path: string, opts: Opts = {}): Promise<T> {
  if (!BACKEND) throw new Error('Backend not configured. Set VITE_BACKEND_URL.');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.auth) headers['X-Admin-Token'] = ADMIN_TOKEN;
  const res = await fetch(`${BACKEND}${path}`, {
    method: opts.method || 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

/* ─── Public (no auth) ─── */
export const backendApi = {
  health: () => call('/health'),
  price: (symbol: string) => call<{ symbol: string; price: number }>(`/api/price/${symbol}`),
  candles: (symbol: string, interval = '1h', limit = 300) =>
    call<{ candles: any[] }>(`/api/candles/${symbol}?interval=${interval}&limit=${limit}`),
  analysis: (symbol: string, interval = '1h') =>
    call(`/api/analysis/${symbol}?interval=${interval}`),
  jarvisStatus: () => call('/api/jarvis-status'),

  /* ─── Settings (encrypted Binance creds in DB) ─── */
  settingsStatus: () => call<{ configured: boolean; testnet: boolean; source: string; preview: string; updatedAt?: string }>('/api/settings/status', { auth: true }),
  saveSettings: (params: { apiKey: string; apiSecret: string; testnet: boolean }) =>
    call<{ ok: boolean; message: string }>('/api/settings/save', { method: 'POST', body: params, auth: true }),
  testSettings: () => call<{ valid: boolean; canTrade: boolean; testnet: boolean; configured: boolean; preview: string; error?: string }>('/api/settings/test', { method: 'POST', auth: true }),
  deleteSettings: () => call<{ ok: boolean; message: string }>('/api/settings', { method: 'DELETE', auth: true }),

  /* ─── Protected (requires admin token) ─── */
  validateBinance: () => call('/api/validate-binance', { auth: true }),
  portfolio: () => call('/api/portfolio', { auth: true }),
  trades: (status?: 'open' | 'closed_tp' | 'closed_sl' | 'closed_manual') =>
    call(status ? `/api/trades?status=${status}` : '/api/trades', { auth: true }),
  openTrades: () => call('/api/trades/open', { auth: true }),
  stats: () => call('/api/stats', { auth: true }),

  trade: (params: { symbol: string; quoteUsdt?: number; sl?: number; tp1?: number; tp2?: number; tp3?: number; reasoning?: string }) =>
    call('/api/trade', { method: 'POST', body: params, auth: true }),
  emergencyStop: () => call('/api/emergency-stop', { method: 'POST', auth: true }),

  alerts: () => call('/api/alerts', { auth: true }),
  setAlert: (symbol: string, price: number, direction: 'above' | 'below', note?: string) =>
    call('/api/alerts', { method: 'POST', body: { symbol, price, direction, note }, auth: true }),
  removeAlert: (id: string) => call(`/api/alerts/${id}`, { method: 'DELETE', auth: true }),

  monitorStart: (symbols?: string[]) =>
    call('/api/monitor-start', { method: 'POST', body: { symbols }, auth: true }),
  monitorStop: () => call('/api/monitor-stop', { method: 'POST', auth: true }),

  jarvis: (message: string, sessionId?: string) =>
    call<{ reply: string; actions: any[]; confirmationRequired: boolean }>(
      '/api/jarvis-ask', { method: 'POST', body: { message, sessionId }, auth: true }
    ),
  jarvisApprove: (approved: boolean) =>
    call('/api/jarvis-approve', { method: 'POST', body: { approved }, auth: true }),
};
