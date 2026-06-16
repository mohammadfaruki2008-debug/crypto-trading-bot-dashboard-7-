/**
 * Price alerts — monitored continuously by the 24/7 loop.
 */
import { fetchPrice } from '../binance';
import { readJson, writeJson, appendJson } from '../storage';

export interface PriceAlert {
  id: string;
  symbol: string;
  price: number;
  direction: 'above' | 'below';
  createdAt: string;
  triggered: boolean;
  triggeredAt?: string;
  note?: string;
}

const FILE = 'alerts.json';

export function setAlert(symbol: string, price: number, direction: 'above' | 'below', note?: string): PriceAlert {
  const alert: PriceAlert = {
    id: `alert_${Date.now()}`,
    symbol: symbol.toUpperCase(),
    price,
    direction,
    createdAt: new Date().toISOString(),
    triggered: false,
    note,
  };
  const list = readJson<PriceAlert[]>(FILE, []);
  list.push(alert);
  writeJson(FILE, list);
  return alert;
}

export function getAlerts(includeTriggered = false): PriceAlert[] {
  const list = readJson<PriceAlert[]>(FILE, []);
  return includeTriggered ? list : list.filter(a => !a.triggered);
}

export function removeAlert(id: string): boolean {
  const list = readJson<PriceAlert[]>(FILE, []);
  const idx = list.findIndex(a => a.id === id);
  if (idx < 0) return false;
  list.splice(idx, 1);
  writeJson(FILE, list);
  return true;
}

export async function checkAlerts(): Promise<PriceAlert[]> {
  const all = readJson<PriceAlert[]>(FILE, []);
  const active = all.filter(a => !a.triggered);
  if (active.length === 0) return [];

  const symbols = [...new Set(active.map(a => a.symbol))];
  const prices: Record<string, number> = {};
  for (const s of symbols) {
    prices[s] = await fetchPrice(s);
  }

  const triggered: PriceAlert[] = [];
  for (const a of active) {
    const p = prices[a.symbol];
    if (!p) continue;
    const hit = (a.direction === 'above' && p >= a.price) || (a.direction === 'below' && p <= a.price);
    if (hit) {
      a.triggered = true;
      a.triggeredAt = new Date().toISOString();
      triggered.push(a);
      appendJson('alert-log.json', { ...a, currentPrice: p });
    }
  }
  if (triggered.length > 0) writeJson(FILE, all);
  return triggered;
}
