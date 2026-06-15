// ============================================================================
// Webhook Receiver — polls a configurable endpoint for pending alerts.
// 
// Real production flow:
//   TradingView → POST /api/webhook (Express server)
//   This poller  → GET  /api/webhook/pending (Express server, returns queue)
//
// The Express server receives the POST, validates the secret, stores in DB,
// this frontend polls every 10s and processes them.
//
// Until the API server is deployed, mock mode returns empty (no-op).
// ============================================================================

export interface WebhookAlert {
  id: string;
  timestamp: string;
  payload: {
    action: string;
    ticker: string;
    price: number;
    sl: number;
    tp1: number;
    tp2: number;
    tp3: number;
    secret: string;
    tf?: string;
    tqi?: number;
  };
}

// ─── Configuration ─────────────────────────────────────────────────

let _apiBase = '';
let _secret = '';
let _enabled = false;

export function configureWebhook(apiBaseUrl: string, secret: string, enabled: boolean) {
  _apiBase = apiBaseUrl.replace(/\/$/, '');
  _secret = secret;
  _enabled = enabled;
}

// ─── Poll for pending alerts ───────────────────────────────────────
// Express server should expose GET /api/webhook/pending
// Returns: { alerts: WebhookAlert[] }
// After consumption, POST /api/webhook/ack with { ids: string[] }

export async function pollPendingAlerts(): Promise<WebhookAlert[]> {
  if (!_enabled || !_apiBase) return [];
  try {
    const res = await fetch(`${_apiBase}/api/webhook/pending`, {
      headers: { 'X-Webhook-Secret': _secret },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.alerts) ? data.alerts : [];
  } catch {
    return [];
  }
}

// ─── Acknowledge processed alerts (remove from queue) ─────────────

export async function ackAlerts(ids: string[]): Promise<void> {
  if (!_enabled || !_apiBase || ids.length === 0) return;
  try {
    await fetch(`${_apiBase}/api/webhook/ack`, {
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

// ─── Test connectivity to the API server ──────────────────────────

export async function testWebhookServer(apiBaseUrl: string): Promise<{
  reachable: boolean;
  error?: string;
}> {
  try {
    const res = await fetch(`${apiBaseUrl.replace(/\/$/, '')}/api/health`, {
      signal: AbortSignal.timeout(5000),
    });
    return { reachable: res.ok };
  } catch (err: any) {
    return { reachable: false, error: err.message };
  }
}
