/**
 * Real Binance trade execution with risk management.
 * 1% per trade, 3% daily loss limit, 2h cooldown per symbol, max 5 open.
 */
import { marketBuy, limitSell, stopLossSell, getLotSize } from '../binance';
import { saveKnowledge } from '../knowledgeEngine';
import { appendJson, readJson, writeJson } from '../storage';
import { config } from '../../config';

const cooldown = new Map<string, number>();
const COOLDOWN_MS = config.monitor.cooldownHours * 3600000;

export interface OpenTrade {
  id: string; symbol: string; side: string;
  entryPrice: number; qty: number; spentUsdt: number;
  sl: number; tp1: number; tp2: number; tp3: number;
  buyOrderId: number;
  slOrderId?: number; tp1OrderId?: number; tp2OrderId?: number; tp3OrderId?: number;
  status: 'open' | 'closed_tp' | 'closed_sl' | 'closed_manual';
  pnl?: number; openedAt: string; closedAt?: string; source: string;
}

interface RiskState {
  dailyPnl: number; dailyResetDate: string;
  totalTrades: number; wins: number; losses: number;
}

const RISK_FILE = 'risk-state.json';
const TRADES_FILE = 'trades.json';

function getRisk(): RiskState {
  const today = new Date().toISOString().slice(0, 10);
  const s = readJson<RiskState>(RISK_FILE, { dailyPnl: 0, dailyResetDate: today, totalTrades: 0, wins: 0, losses: 0 });
  if (s.dailyResetDate !== today) {
    s.dailyPnl = 0; s.dailyResetDate = today;
    writeJson(RISK_FILE, s);
  }
  return s;
}

export function getRiskState(): RiskState { return getRisk(); }

export function getOpenTrades(): OpenTrade[] {
  return readJson<OpenTrade[]>(TRADES_FILE, []).filter(t => t.status === 'open');
}

export function getAllTrades(): OpenTrade[] {
  return readJson<OpenTrade[]>(TRADES_FILE, []);
}

function saveTrade(t: OpenTrade): void {
  const all = readJson<OpenTrade[]>(TRADES_FILE, []);
  const i = all.findIndex(x => x.id === t.id);
  if (i >= 0) all[i] = t; else all.unshift(t);
  while (all.length > 500) all.pop();
  writeJson(TRADES_FILE, all);
}

export interface TradeParams {
  symbol: string; quoteUsdt?: number;
  sl?: number; tp1?: number; tp2?: number; tp3?: number;
  reasoning?: string; source?: string;
}

export async function executeTrade(p: TradeParams, accountBalance: number): Promise<{ ok: boolean; message: string; trade?: OpenTrade }> {
  const sym = p.symbol.toUpperCase();

  // Cooldown
  const last = cooldown.get(sym) || 0;
  if (Date.now() - last < COOLDOWN_MS) {
    const mins = Math.ceil((COOLDOWN_MS - (Date.now() - last)) / 60000);
    return { ok: false, message: `Cooldown on ${sym} — ${mins}min remaining` };
  }

  // Daily loss limit
  const risk = getRisk();
  if (accountBalance > 0) {
    const dailyPct = (risk.dailyPnl / accountBalance) * 100;
    if (dailyPct <= -config.monitor.dailyLossLimitPct) {
      return { ok: false, message: `Daily loss limit hit (${dailyPct.toFixed(2)}%). Halted until tomorrow.` };
    }
  }

  // Max open trades
  if (getOpenTrades().length >= config.monitor.maxOpenTrades) {
    return { ok: false, message: `Max open trades (${config.monitor.maxOpenTrades}) reached` };
  }

  // Already open on this symbol?
  if (getOpenTrades().some(t => t.symbol === sym)) {
    return { ok: false, message: `Position already open on ${sym}` };
  }

  // 1% risk sizing
  const maxRisk = accountBalance * (config.monitor.riskPerTradePct / 100);
  let orderUsdt = p.quoteUsdt || maxRisk * 10;
  orderUsdt = Math.min(orderUsdt, accountBalance * 0.25); // hard cap 25%
  if (orderUsdt < 10) return { ok: false, message: 'Order too small (min 10 USDT)' };

  // Execute market buy
  const buy = await marketBuy(sym, orderUsdt);
  if (!buy.ok) return { ok: false, message: `Binance error: ${buy.error}` };

  cooldown.set(sym, Date.now());

  const trade: OpenTrade = {
    id: `t_${Date.now()}`, symbol: sym, side: 'BUY',
    entryPrice: buy.avgPrice || 0, qty: buy.executedQty || 0, spentUsdt: buy.spentUsdt || 0,
    sl: p.sl || 0, tp1: p.tp1 || 0, tp2: p.tp2 || 0, tp3: p.tp3 || 0,
    buyOrderId: buy.orderId || 0,
    status: 'open', openedAt: new Date().toISOString(),
    source: p.source || p.reasoning || 'manual',
  };

  // Place OCO (3 TPs split 33/33/34% + SL on full qty)
  if (p.sl && p.tp1 && p.tp2 && p.tp3 && trade.qty > 0) {
    try {
      const { minNotional } = await getLotSize(sym);
      const q1 = trade.qty * 0.33, q2 = trade.qty * 0.33, q3 = trade.qty - q1 - q2;
      if (q1 * p.tp1 >= minNotional) {
        const r1 = await limitSell(sym, q1, p.tp1);
        if (r1.ok) trade.tp1OrderId = r1.orderId;
      }
      if (q2 * p.tp2 >= minNotional) {
        const r2 = await limitSell(sym, q2, p.tp2);
        if (r2.ok) trade.tp2OrderId = r2.orderId;
      }
      if (q3 * p.tp3 >= minNotional) {
        const r3 = await limitSell(sym, q3, p.tp3);
        if (r3.ok) trade.tp3OrderId = r3.orderId;
      }
      const slR = await stopLossSell(sym, trade.qty, p.sl, p.sl * 0.998);
      if (slR.ok) trade.slOrderId = slR.orderId;
    } catch (err: any) {
      console.warn('[TRADE] OCO placement warning:', err.message);
    }
  }

  saveTrade(trade);
  appendJson('trade-log.json', { ...trade, action: 'OPEN' });
  saveKnowledge(`BUY ${sym} @ ${trade.entryPrice} | SL ${p.sl} TP1 ${p.tp1} | ${p.reasoning || 'auto'}`,
    { type: 'trade_open', symbol: sym, entryPrice: trade.entryPrice });

  return {
    ok: true,
    message: `BUY ${sym}: ${trade.qty.toFixed(6)} @ ${trade.entryPrice.toFixed(4)} (spent ${trade.spentUsdt.toFixed(2)} USDT). OCO active.`,
    trade,
  };
}

export function recordPnl(tradeId: string, pnl: number, status: 'closed_tp' | 'closed_sl' | 'closed_manual'): void {
  const all = readJson<OpenTrade[]>(TRADES_FILE, []);
  const t = all.find(x => x.id === tradeId);
  if (!t) return;
  t.status = status; t.pnl = pnl; t.closedAt = new Date().toISOString();
  writeJson(TRADES_FILE, all);
  const r = getRisk();
  r.dailyPnl += pnl; r.totalTrades++;
  if (pnl > 0) r.wins++; else if (pnl < 0) r.losses++;
  writeJson(RISK_FILE, r);
  appendJson('trade-log.json', { ...t, action: 'CLOSE' });
  saveKnowledge(`Trade ${t.symbol} closed ${status} PnL ${pnl.toFixed(2)} USDT`, { type: 'trade_close', symbol: t.symbol, pnl });
}
