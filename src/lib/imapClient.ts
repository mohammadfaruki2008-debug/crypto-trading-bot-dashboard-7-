// ============================================================================
// Gmail IMAP Signal Scraper — polls API server's IMAP endpoint.
//
// Real production flow:
//   Gmail inbox receives TradingView email alert
//   Express server (with imap npm package) polls Gmail every 30s
//   Parses subject/body for: BTCUSDT BUY / ETHUSDT SELL etc.
//   Stores parsed signals in DB
//   This frontend polls GET /api/imap/signals every 10s
//
// The Express server handles the actual IMAP TCP connection
// (browsers cannot connect to raw IMAP TCP sockets due to security restrictions).
//
// Parser is optimized for TradingView alert email subjects like:
//   "QUAD BUY | BTCUSDT | TF: 1H | Price: 65200 | SL: 63000 | TP1: 67000"
// ============================================================================

export interface ImapSignal {
  id: string;
  timestamp: string;
  subject: string;
  from: string;
  parsed: {
    action: 'buy' | 'sell' | null;
    ticker: string | null;
    price: number | null;
    sl: number | null;
    tp1: number | null;
    tp2: number | null;
    tp3: number | null;
  } | null;
}

// ─── Configuration ─────────────────────────────────────────────────

let _apiBase = '';
let _secret = '';
let _enabled = false;

export function configureImap(apiBaseUrl: string, secret: string, enabled: boolean) {
  _apiBase = apiBaseUrl.replace(/\/$/, '');
  _secret = secret;
  _enabled = enabled;
}

// ─── Poll parsed signals from the API server ──────────────────────

export async function pollImapSignals(): Promise<ImapSignal[]> {
  if (!_enabled || !_apiBase) return [];
  try {
    const res = await fetch(`${_apiBase}/api/imap/signals`, {
      headers: { 'X-Webhook-Secret': _secret },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.signals) ? data.signals : [];
  } catch {
    return [];
  }
}

// ─── Acknowledge processed signals ────────────────────────────────

export async function ackImapSignals(ids: string[]): Promise<void> {
  if (!_enabled || !_apiBase || ids.length === 0) return;
  try {
    await fetch(`${_apiBase}/api/imap/ack`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Secret': _secret,
      },
      body: JSON.stringify({ ids }),
      signal: AbortSignal.timeout(5000),
    });
  } catch { /* ignore */ }
}

// ─── Frontend-side email subject parser (for testing/preview) ─────
// The real parser runs on the Express server with full email body access.

export function parseAlertSubject(subject: string): ImapSignal['parsed'] {
  const s = subject.toUpperCase();

  const action: 'buy' | 'sell' | null =
    s.includes('BUY') ? 'buy' :
    s.includes('SELL') ? 'sell' :
    null;

  // Ticker: e.g. BTCUSDT, ETHUSDT
  const tickerMatch = s.match(/\b([A-Z]{2,10}USDT)\b/);
  const ticker = tickerMatch ? tickerMatch[1] : null;

  // Numbers after labels
  const extractNum = (label: string): number | null => {
    const re = new RegExp(`${label}[:\\s]+([\\d.]+)`, 'i');
    const m = subject.match(re);
    return m ? parseFloat(m[1]) : null;
  };

  return {
    action,
    ticker,
    price: extractNum('PRICE') ?? extractNum('ENTRY'),
    sl: extractNum('SL') ?? extractNum('STOP'),
    tp1: extractNum('TP1') ?? extractNum('TP 1'),
    tp2: extractNum('TP2') ?? extractNum('TP 2'),
    tp3: extractNum('TP3') ?? extractNum('TP 3'),
  };
}

// ─── Test IMAP server connectivity via API server ─────────────────

export async function testImapConnection(apiBaseUrl: string, secret: string): Promise<{
  connected: boolean;
  error?: string;
}> {
  try {
    const res = await fetch(`${apiBaseUrl.replace(/\/$/, '')}/api/imap/test`, {
      headers: { 'X-Webhook-Secret': secret },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { connected: false, error: `HTTP ${res.status}` };
    const data = await res.json();
    return { connected: data.connected === true, error: data.error };
  } catch (err: any) {
    return { connected: false, error: err.message };
  }
}
