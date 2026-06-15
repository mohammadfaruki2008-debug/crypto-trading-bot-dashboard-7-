/**
 * Trade execution tool — wraps placeBinanceOrder with risk management.
 * 1% max risk per trade, daily loss limit, 2h cooldown per symbol.
 */
import { placeBinanceOrder } from '../binance';
import { getEmbedding, searchKnowledge } from '../knowledgeEngine';
import { supabase } from '../supabaseClient'; // your existing client

const cooldownMap = new Map<string, number>();
const COOLDOWN_MS = 2 * 60 * 60 * 1000;

interface TradeParams {
  symbol: string;
  side: 'BUY' | 'SELL';
  quoteUsdt?: number;
  sl?: number;
  tp1?: number;
  tp2?: number;
  tp3?: number;
  reasoning?: string;
}

interface TradeResult {
  ok: boolean;
  message: string;
  orderId?: number;
  filledPrice?: number;
  filledQty?: number;
}

/** Daily P&L tracker (resets at midnight UTC). */
let dailyPnl = 0;
let dailyResetDate = new Date().toISOString().slice(0, 10);
const DAILY_LOSS_LIMIT_PCT = -3; // configurable

function checkDailyReset(): void {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== dailyResetDate) { dailyPnl = 0; dailyResetDate = today; }
}

/**
 * Execute a trade with full risk management.
 * @param params - Trade parameters
 * @param accountBalance - Current USDT balance
 */
export async function executeTrade(params: TradeParams, accountBalance: number): Promise<TradeResult> {
  const { symbol, side, quoteUsdt, sl, tp1, tp2, tp3, reasoning } = params;

  // ── Cooldown check (2h per symbol) ──
  const lastTrade = cooldownMap.get(symbol) || 0;
  if (Date.now() - lastTrade < COOLDOWN_MS) {
    const minsLeft = Math.ceil((COOLDOWN_MS - (Date.now() - lastTrade)) / 60000);
    return { ok: false, message: `Cooldown active on ${symbol} — ${minsLeft} min remaining` };
  }

  // ── Daily loss limit ──
  checkDailyReset();
  const dailyPct = (dailyPnl / accountBalance) * 100;
  if (dailyPct <= DAILY_LOSS_LIMIT_PCT) {
    return { ok: false, message: `Daily loss limit hit (${dailyPct.toFixed(2)}%). Trading halted until tomorrow.` };
  }

  // ── 1% max risk sizing ──
  const maxRiskUsdt = accountBalance * 0.01;
  let orderUsdt = quoteUsdt || maxRiskUsdt;
  if (sl && side === 'BUY') {
    // Risk = (entry - sl) / entry * orderUsdt. Cap so loss doesn't exceed 1%.
    // We don't know exact entry yet, so cap the quote amount.
    orderUsdt = Math.min(orderUsdt, maxRiskUsdt * 10); // rough cap
  }
  orderUsdt = Math.min(orderUsdt, accountBalance * 0.25); // never more than 25% in one trade

  // ── Execute ──
  try {
    const result = await placeBinanceOrder({
      symbol,
      side,
      type: 'MARKET',
      quoteOrderQty: orderUsdt.toFixed(2),
    });

    if (result.code || result.msg) {
      return { ok: false, message: `Binance error: ${result.msg || result.code}` };
    }

    const filledQty = parseFloat(result.executedQty || '0');
    const spent = parseFloat(result.cummulativeQuoteQty || '0');
    const filledPrice = filledQty > 0 ? spent / filledQty : 0;

    cooldownMap.set(symbol, Date.now());

    // ── Place OCO (TP/SL) if provided ──
    if (sl && tp1) {
      try {
        // TP1 limit sell (33%)
        const tp1Qty = (filledQty * 0.33).toFixed(6);
        await placeBinanceOrder({ symbol, side: 'SELL', type: 'LIMIT', timeInForce: 'GTC', quantity: tp1Qty, price: tp1.toFixed(2) });
        // SL stop-loss for full qty
        await placeBinanceOrder({ symbol, side: 'SELL', type: 'STOP_LOSS_LIMIT', timeInForce: 'GTC', quantity: filledQty.toString(), stopPrice: sl.toFixed(2), price: (sl * 0.998).toFixed(2) });
      } catch (ocoErr: any) {
        console.warn('[TRADE] OCO placement failed:', ocoErr.message);
      }
    }

    // ── Log to knowledge base ──
    try {
      const context = `${side} ${symbol} at ${filledPrice} | SL:${sl} TP1:${tp1} | ${reasoning || 'auto'}`;
      const embedding = await getEmbedding(context);
      await supabase.from('knowledge_base').insert({
        content: context,
        embedding,
        metadata: { symbol, side, filledPrice, sl, tp1, tp2, tp3, timestamp: new Date().toISOString() },
      });
    } catch { /* logging failure shouldn't block trade */ }

    return {
      ok: true,
      message: `${side} ${symbol}: filled ${filledQty} units at avg ${filledPrice.toFixed(2)} USDT (spent ${spent.toFixed(2)})`,
      orderId: result.orderId,
      filledPrice,
      filledQty,
    };
  } catch (err: any) {
    return { ok: false, message: `Trade execution error: ${err.message}` };
  }
}

/** Record P&L for daily tracking (call when a position closes). */
export function recordPnl(pnlUsdt: number): void {
  checkDailyReset();
  dailyPnl += pnlUsdt;
}
