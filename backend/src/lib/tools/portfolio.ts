/**
 * Portfolio tool — real Binance account state.
 */
import { getAccountInfo, fetchPrice, getOpenOrders } from '../binance';
import { getOpenTrades, getRiskState } from './trade';

export interface PortfolioSnapshot {
  ok: boolean;
  totalUsdt: number;
  freeUsdt: number;
  lockedUsdt: number;
  assets: { asset: string; free: number; locked: number; usdtValue: number }[];
  openOrders: number;
  openTrades: number;
  dailyPnl: number;
  totalTrades: number;
  winRate: number;
  message: string;
  error?: string;
}

export async function getPortfolio(): Promise<PortfolioSnapshot> {
  const account = await getAccountInfo();
  if (account?.code) {
    return {
      ok: false, totalUsdt: 0, freeUsdt: 0, lockedUsdt: 0,
      assets: [], openOrders: 0, openTrades: 0,
      dailyPnl: 0, totalTrades: 0, winRate: 0,
      message: `Binance error: ${account.msg}`,
      error: account.msg,
    };
  }

  const balances = (account.balances as any[])
    .filter(b => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0)
    .map(b => ({ asset: b.asset, free: parseFloat(b.free), locked: parseFloat(b.locked), usdtValue: 0 }));

  let totalUsdt = 0;
  for (const b of balances) {
    if (b.asset === 'USDT') {
      b.usdtValue = b.free + b.locked;
    } else {
      const px = await fetchPrice(b.asset + 'USDT');
      b.usdtValue = (b.free + b.locked) * px;
    }
    totalUsdt += b.usdtValue;
  }

  const usdt = balances.find(b => b.asset === 'USDT');
  const freeUsdt = usdt?.free || 0;
  const lockedUsdt = usdt?.locked || 0;

  const orders = await getOpenOrders();
  const openTrades = getOpenTrades();
  const risk = getRiskState();
  const winRate = risk.totalTrades > 0 ? (risk.wins / risk.totalTrades) * 100 : 0;

  return {
    ok: true,
    totalUsdt: parseFloat(totalUsdt.toFixed(2)),
    freeUsdt: parseFloat(freeUsdt.toFixed(2)),
    lockedUsdt: parseFloat(lockedUsdt.toFixed(2)),
    assets: balances.filter(b => b.usdtValue > 1),
    openOrders: orders.length,
    openTrades: openTrades.length,
    dailyPnl: parseFloat(risk.dailyPnl.toFixed(2)),
    totalTrades: risk.totalTrades,
    winRate: parseFloat(winRate.toFixed(1)),
    message: `Portfolio: ${totalUsdt.toFixed(2)} USDT total, ${freeUsdt.toFixed(2)} free, ${openTrades.length} active trades, ${winRate.toFixed(0)}% WR (${risk.totalTrades} trades). Daily PnL: ${risk.dailyPnl.toFixed(2)} USDT.`,
  };
}
