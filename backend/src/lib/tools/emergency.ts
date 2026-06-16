/**
 * Emergency stop — cancel all orders + market-sell all non-stablecoin balances + halt monitor.
 */
import { getAccountInfo, getOpenOrders, cancelAllOrders, marketSell } from '../binance';
import { saveKnowledge } from '../knowledgeEngine';
import { appendJson } from '../storage';
import { stopMonitor } from './monitor';

export async function emergencyStop(): Promise<{ ok: boolean; message: string; cancelledOrders: number; soldSymbols: string[] }> {
  let cancelled = 0; const sold: string[] = [];

  try {
    stopMonitor();
    const acc = await getAccountInfo();
    if (acc?.code) return { ok: false, message: `Binance: ${acc.msg}`, cancelledOrders: 0, soldSymbols: [] };

    const stable = ['USDT', 'USDC', 'BUSD', 'DAI', 'TUSD'];
    const holdings = (acc.balances as any[])
      .filter(b => parseFloat(b.free) > 0)
      .filter(b => !stable.includes(b.asset));

    for (const h of holdings) {
      const sym = h.asset + 'USDT';
      try {
        const orders = await getOpenOrders(sym);
        if (orders.length > 0) cancelled += await cancelAllOrders(sym);
      } catch { /* skip */ }
    }

    for (const h of holdings) {
      const sym = h.asset + 'USDT';
      const qty = parseFloat(h.free);
      if (qty <= 0) continue;
      try {
        const r = await marketSell(sym, qty);
        if (r.ok) sold.push(sym);
      } catch { /* skip */ }
    }

    const msg = `🛑 EMERGENCY STOP. ${cancelled} orders cancelled. ${sold.length} positions liquidated: ${sold.join(', ') || 'none'}. Monitor halted.`;
    saveKnowledge(msg, { type: 'emergency_stop' });
    appendJson('emergency-log.json', { ts: new Date().toISOString(), cancelled, sold });
    return { ok: true, message: msg, cancelledOrders: cancelled, soldSymbols: sold };
  } catch (err: any) {
    return { ok: false, message: `Emergency stop error: ${err.message}`, cancelledOrders: cancelled, soldSymbols: sold };
  }
}
