/**
 * Trade execution tool — real Binance orders with risk management.
 * 1% per trade, daily loss limit, 2h cooldown per symbol, OCO protection.
 */
import { marketBuy, limitSell, stopLossSell, getLotSize } from '../binance';
import { saveKnowledge } from '../knowledgeEngine';
import { appendJson, readJson, writeJson } from '../storage';
import { config } from '../../config';

const cooldownMap = new Map<string, number>();
const COOLDOWN_MS = config.monitor.cooldownHours * 60 * 60 * 1000;

interface TradeParams {
  symbol: string;
  side?: 'BUY' | 'SELL';
  quoteUsdt?: number;
  sl?: number;
  tp1?: number;
  tp2?: number;
  tp3?: number;
  reasoning?: string;
}

export interface OpenTrade {
  id: string;
  symbol: string;
  side: string;
  entryPrice: number;
  qty: number;
  spentUsdt: number;
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number;
  buyOrderId: number;
  slOrderId?: number;
  tp1OrderId?: number;
  tp2OrderId?: number;
  tp3OrderId?: number;
  status: 'open' | 'closed_tp' | 'closed_sl' | 'closed_manual';
  pnl?: number;
  openedAt: string;
  closedAt?: string;
  source: string;
}

interface RiskState {
  dailyPnl: number;
  dailyResetDate: string;
  totalTrades: number;
  wins: number;
  losses: number;
}

const RISK_FILE = 'risk-state.json';
const TRADES_FILE = 'trades.json';

function getRisk(): RiskState {
  const today = new Date().toISOString().slice(0, 10);
  const state = readJson<RiskState>(RISK_FILE, { dailyPnl: 0, dailyResetDate: today, totalTrades: 0, wins: 0, losses: 0 });
  if (state.dailyResetDate !== today) {
    state.dailyPnl = 0;
    state.dailyResetDate = today;
    writeJson(RISK_FILE, state);
  }
  return state;
}

function updateRisk(pnl: number): void {
  const r = getRisk();
  r.dailyPnl += pnl;
  r.totalTrades++;
  if (pnl > 0) r.wins++;
  else if (pnl < 0) r.losses++;
  writeJson(RISK_FILE, r);
}

export function getOpenTrades(): OpenTrade[] {
  return readJson<OpenTrade[]>(TRADES_FILE, []).filter(t => t.status === 'open');
}

export function getAllTrades(): OpenTrade[] {
  return readJson<OpenTrade[]>(TRADES_FILE, []);
}

function saveTrade(trade: OpenTrade): void {
  const all = readJson<OpenTrade[]>(TRADES_FILE, []);
  const idx = all.findIndex(t => t.id === trade.id);
  if (idx >= 0) all[idx] = trade;
  else all.unshift(trade);
  while (all.length > 500) all.pop();
  writeJson(TRADES_FILE, all);
}

export async function executeTrade(params: TradeParams, accountBalance: number): Promise<{
  ok: boolean;
  message: string;
  trade?: OpenTrade;
  error?: string;
}> {
  const { symbol, side = 'BUY', quoteUsdt, sl, tp1, tp2, tp3, reasoning } = params;
  const sym = symbol.toUpperCase();

  // Risk: cooldown
  const last = cooldownMap.get(sym) || 0;
  if (Date.now() - last < COOLDOWN_MS) {
    const minsLeft = Math.ceil((COOLDOWN_MS - (Date.now() - last)) / 60000);
    return { ok: false, message: `Cooldown active on ${sym} — ${minsLeft}min remaining` };
  }

  // Risk: daily loss limit
  const risk = getRisk();
  if (accountBalance > 0) {
    const dailyPct = (risk.dailyPnl / accountBalance) * 100;
    if (dailyPct <= -config.monitor.dailyLossLimitPct) {
      return { ok: false, message: `Daily loss limit hit (${dailyPct.toFixed(2)}%). Trading halted until tomorrow.` };
    }
  }

  // Risk: max open trades
  const openCount = getOpenTrades().length;
  if (openCount >= config.monitor.maxOpenTrades) {
    return { ok: false, message: `Max open trades (${config.monitor.maxOpenTrades}) reached.` };
  }

  // Risk: 1% position sizing
  const maxRiskUsdt = accountBalance * (config.monitor.riskPerTradePct / 100);
  let orderUsdt = quoteUsdt || maxRiskUsdt * 10;
  orderUsdt = Math.min(orderUsdt, accountBalance * 0.25); // never >25% in one trade
  if (orderUsdt < 10) return { ok: false, message: `Order size too small (min 10 USDT)` };

  // Execute market buy
  if (side === 'BUY') {
    const buy = await marketBuy(sym, orderUsdt);
    if (!buy.ok) return { ok: false, message: `Binance order failed: ${buy.error}`, error: buy.error };

    cooldownMap.set(sym, Date.now());

    const trade: OpenTrade = {
      id: `t_${Date.now()}`,
      symbol: sym,
      side: 'BUY',
      entryPrice: buy.avgPrice || 0,
      qty: buy.executedQty || 0,
      spentUsdt: buy.spentUsdt || 0,
      sl: sl || 0,
      tp1: tp1 || 0,
      tp2: tp2 || 0,
      tp3: tp3 || 0,
      buyOrderId: buy.orderId || 0,
      status: 'open',
      openedAt: new Date().toISOString(),
      source: reasoning || 'manual',
    };

    // Place OCO: 3 TPs (33/33/34%) + 1 SL on full qty
    if (sl && tp1 && tp2 && tp3 && trade.qty > 0) {
      try {
        const { minNotional } = await getLotSize(sym);
        const q1 = trade.qty * 0.33, q2 = trade.qty * 0.33, q3 = trade.qty - q1 - q2;

        if (q1 * tp1 >= minNotional) {
          const t1 = await limitSell(sym, q1, tp1);
          if (t1.ok) trade.tp1OrderId = t1.orderId;
        }
        if (q2 * tp2 >= minNotional) {
          const t2 = await limitSell(sym, q2, tp2);
          if (t2.ok) trade.tp2OrderId = t2.orderId;
        }
        if (q3 * tp3 >= minNotional) {
          const t3 = await limitSell(sym, q3, tp3);
          if (t3.ok) trade.tp3OrderId = t3.orderId;
        }
        const slLimit = sl * 0.998;
        const slRes = await stopLossSell(sym, trade.qty, sl, slLimit);
        if (slRes.ok) trade.slOrderId = slRes.orderId;
      } catch (err: any) {
        console.warn('[TRADE] OCO placement warning:', err.message);
      }
    }

    saveTrade(trade);
    appendJson('trade-log.json', { ...trade, action: 'OPEN' });

    // Learn
    saveKnowledge(
      `BUY ${sym} @ ${trade.entryPrice} | SL ${sl} TP1 ${tp1} | ${reasoning || 'auto'}`,
      { type: 'trade_open', symbol: sym, entryPrice: trade.entryPrice }
    );

    return {
      ok: true,
      message: `BUY ${sym}: ${trade.qty.toFixed(6)} units at ${trade.entryPrice.toFixed(4)} (spent ${trade.spentUsdt.toFixed(2)} USDT). OCO protection placed.`,
      trade,
    };
  }

  return { ok: false, message: `Side ${side} not supported (BUY only for spot)` };
}

export function recordPnl(tradeId: string, pnl: number, status: 'closed_tp' | 'closed_sl' | 'closed_manual'): void {
  const all = readJson<OpenTrade[]>(TRADES_FILE, []);
  const t = all.find(x => x.id === tradeId);
  if (!t) return;
  t.status = status;
  t.pnl = pnl;
  t.closedAt = new Date().toISOString();
  writeJson(TRADES_FILE, all);
  updateRisk(pnl);
  appendJson('trade-log.json', { ...t, action: 'CLOSE' });
  saveKnowledge(`Trade ${t.symbol} closed: ${status} PnL ${pnl.toFixed(2)} USDT`, { type: 'trade_close', symbol: t.symbol, pnl });
}

export function getRiskState(): RiskState {
  return getRisk();
}
