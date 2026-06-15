/**
 * Price alert tool — stores alerts in memory, checks against live prices.
 */

export interface PriceAlert {
  id: string;
  symbol: string;
  price: number;
  direction: 'above' | 'below';
  createdAt: string;
  triggered: boolean;
}

const alerts: PriceAlert[] = [];

export function setAlert(symbol: string, price: number, direction: 'above' | 'below'): PriceAlert {
  const alert: PriceAlert = {
    id: `alert_${Date.now()}`,
    symbol: symbol.toUpperCase(),
    price,
    direction,
    createdAt: new Date().toISOString(),
    triggered: false,
  };
  alerts.push(alert);
  return alert;
}

export function getAlerts(): PriceAlert[] {
  return alerts.filter(a => !a.triggered);
}

export function removeAlert(id: string): boolean {
  const idx = alerts.findIndex(a => a.id === id);
  if (idx >= 0) { alerts.splice(idx, 1); return true; }
  return false;
}

/**
 * Check all active alerts against current prices.
 * Returns array of triggered alerts (and marks them as triggered).
 */
export async function checkAlerts(): Promise<PriceAlert[]> {
  const triggered: PriceAlert[] = [];
  const active = alerts.filter(a => !a.triggered);
  if (active.length === 0) return [];

  // Batch-fetch prices for unique symbols
  const symbols = [...new Set(active.map(a => a.symbol))];
  const prices: Record<string, number> = {};
  for (const sym of symbols) {
    try {
      const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${sym}`);
      const data = await res.json();
      prices[sym] = parseFloat(data.price);
    } catch { /* skip */ }
  }

  for (const alert of active) {
    const price = prices[alert.symbol];
    if (price == null) continue;
    if (alert.direction === 'above' && price >= alert.price) {
      alert.triggered = true;
      triggered.push(alert);
    } else if (alert.direction === 'below' && price <= alert.price) {
      alert.triggered = true;
      triggered.push(alert);
    }
  }

  return triggered;
}
