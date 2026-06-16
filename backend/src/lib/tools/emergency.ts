/**
 * Emergency stop — cancel all orders, market-sell all holdings, halt monitor.
 */
import { getAccountInfo, getOpenOrders, cancelAllOrders, marketSell } from '../binance';
import { saveKnowledge } from '../knowledgeEngine';
import { appendJson } from '../storage';
import { stopMonitor } from './monitor';

export async function emergencyStop(): Promise<{
  ok: boolean;
  message: string;
  cancelledOrders: number;
  soldSymbols: string[];
}> {
  let cancelled = 0;
  const sold: string[] = [];

  try {
    // 1. Stop monitor first
    stopMonitor();

    // 2. Get account
    const account = await getAccountInfo();
    if (account?.code) {
      return { ok: false, message: `Binance error: ${account.msg}`, cancelledOrders: 0, soldSymbols: [] };
    }

    // 3. Collect symbols with non-zero balances (excluding stablecoins)
    const stablecoins = ['USDT', 'USDC', 'BUSD', 'DAI', 'TUSD'];
    const holdings = (account.balances as any[])
      .filter(b => parseFloat(b.free) > 0)
      .filter(b => !stablecoins.includes(b.asset));

    // 4. Cancel all open orders per symbol
    for (const h of holdings) {
      const sym = h.asset + 'USDT';
      try {
        const orders = await getOpenOrders(sym);
        if (orders.length > 0) {
          const n = await cancelAllOrders(sym);
          cancelled += n;
        }
      } catch { /* skip */ }
    }

    // 5. Market-sell all non-stablecoin balances
    for (const h of holdings) {
      const sym = h.asset + 'USDT';
      const qty = parseFloat(h.free);
      if (qty <= 0) continue;
      try {
        const res = await marketSell(sym, qty);
        if (res.ok) sold.push(sym);
      } catch { /* skip non-tradeable */ }
    }

    const msg = `🛑 EMERGENCY STOP executed. ${cancelled} orders cancelled. ${sold.length} positions liquidated: ${sold.join(', ') || 'none'}. Monitor halted.`;
    saveKnowledge(msg, { type: 'emergency_stop', timestamp: new Date().toISOString() });
    appendJson('emergency-log.json', { ts: new Date().toISOString(), cancelled, sold });

    return { ok: true, message: msg, cancelledOrders: cancelled, soldSymbols: sold };
  } catch (err: any) {
    return { ok: false, message: `Emergency stop error: ${err.message}`, cancelledOrders: cancelled, soldSymbols: sold };
  }
}
