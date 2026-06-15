// ============================================================================
// Trading Engine — full execution lifecycle
// Buy → place SL/TP orders → monitor fills → trail SL → close
// ============================================================================

import {
  BinanceCredentials,
  placeMarketBuy,
  placeLimitSell,
  placeStopLossSell,
  cancelOrder,
  getOrderStatus,
  getLivePrice,
} from './binanceApi';

export interface TradeSignal {
  ticker: string;
  price: number;
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number;
  quoteUsdt: number;
  source: string;
  confFactor?: number;
}

export interface OpenTradeState {
  positionId: string;
  symbol: string;
  entryPrice: number;
  qty: number;                  // base units acquired
  quoteSpent: number;           // USDT spent
  initialSl: number;
  currentSl: number;
  slOrderId: number | null;
  tp1: number;
  tp2: number;
  tp3: number;
  tp1OrderId: number | null;
  tp2OrderId: number | null;
  tp3OrderId: number | null;
  tp1Filled: boolean;
  tp2Filled: boolean;
  tp3Filled: boolean;
  slMovedToBreakeven: boolean;
  slMovedToTp1: boolean;
  openedAt: string;
  source: string;
}

export type TradeLog = {
  level: 'info' | 'success' | 'warn' | 'error';
  message: string;
};

// ─── Execute a full buy + place SL/TP orders ──────────────────────

export async function executeTradingSignal(
  creds: BinanceCredentials,
  signal: TradeSignal,
  _autoBreakeven: boolean,
  _trailSlToTp1: boolean,
  logs: TradeLog[]
): Promise<{ ok: boolean; trade?: OpenTradeState; error?: string }> {

  const log = (level: TradeLog['level'], msg: string) => {
    logs.push({ level, message: `[${signal.ticker}] ${msg}` });
  };

  try {
    // 1. Market Buy
    log('info', `Placing MARKET BUY for ${signal.quoteUsdt.toFixed(2)} USDT at ~${signal.price}`);
    const buyResult = await placeMarketBuy(creds, signal.ticker, signal.quoteUsdt);

    if (buyResult.error || buyResult.status === 'ERROR') {
      log('error', `Market buy failed: ${buyResult.error}`);
      return { ok: false, error: buyResult.error };
    }

    const executedQty = parseFloat(buyResult.executedQty);
    const spentUsdt = parseFloat(buyResult.cummulativeQuoteQty);
    const avgPrice = executedQty > 0 ? spentUsdt / executedQty : signal.price;

    log('success', `Buy filled — qty: ${executedQty}, avg price: ${avgPrice.toFixed(2)}, spent: ${spentUsdt.toFixed(2)} USDT`);

    // Split for 3 TP tiers: 33% / 33% / 34%
    const tp1Qty = executedQty * 0.33;
    const tp2Qty = executedQty * 0.33;
    const tp3Qty = executedQty - tp1Qty - tp2Qty;
    const allQty = executedQty;

    // 2. TP1 LIMIT SELL order (33%)
    let tp1OrderId: number | null = null;
    const tp1Res = await placeLimitSell(creds, signal.ticker, tp1Qty, signal.tp1);
    if (!tp1Res.error) {
      tp1OrderId = tp1Res.orderId;
      log('info', `TP1 LIMIT SELL placed — id: ${tp1OrderId}, qty: ${tp1Qty.toFixed(6)}, price: ${signal.tp1}`);
    } else {
      log('warn', `TP1 order failed: ${tp1Res.error}`);
    }

    // 3. TP2 LIMIT SELL order (33%)
    let tp2OrderId: number | null = null;
    const tp2Res = await placeLimitSell(creds, signal.ticker, tp2Qty, signal.tp2);
    if (!tp2Res.error) {
      tp2OrderId = tp2Res.orderId;
      log('info', `TP2 LIMIT SELL placed — id: ${tp2OrderId}, qty: ${tp2Qty.toFixed(6)}, price: ${signal.tp2}`);
    } else {
      log('warn', `TP2 order failed: ${tp2Res.error}`);
    }

    // 4. TP3 LIMIT SELL order (34%)
    let tp3OrderId: number | null = null;
    const tp3Res = await placeLimitSell(creds, signal.ticker, tp3Qty, signal.tp3);
    if (!tp3Res.error) {
      tp3OrderId = tp3Res.orderId;
      log('info', `TP3 LIMIT SELL placed — id: ${tp3OrderId}, qty: ${tp3Qty.toFixed(6)}, price: ${signal.tp3}`);
    } else {
      log('warn', `TP3 order failed: ${tp3Res.error}`);
    }

    // 5. Initial STOP-LOSS order (full qty)
    let slOrderId: number | null = null;
    const slLimit = signal.sl * 0.998; // 0.2% below stop for limit fill
    const slRes = await placeStopLossSell(creds, signal.ticker, allQty, signal.sl, slLimit);
    if (!slRes.error) {
      slOrderId = slRes.orderId;
      log('info', `SL STOP-LOSS placed — id: ${slOrderId}, stop: ${signal.sl}, limit: ${slLimit.toFixed(2)}`);
    } else {
      log('warn', `SL order failed (will monitor manually): ${slRes.error}`);
    }

    const trade: OpenTradeState = {
      positionId: `pos_${Date.now()}`,
      symbol: signal.ticker,
      entryPrice: avgPrice,
      qty: executedQty,
      quoteSpent: spentUsdt,
      initialSl: signal.sl,
      currentSl: signal.sl,
      slOrderId,
      tp1: signal.tp1,
      tp2: signal.tp2,
      tp3: signal.tp3,
      tp1OrderId,
      tp2OrderId,
      tp3OrderId,
      tp1Filled: false,
      tp2Filled: false,
      tp3Filled: false,
      slMovedToBreakeven: false,
      slMovedToTp1: false,
      openedAt: new Date().toISOString(),
      source: signal.source,
    };

    log('success', `Trade fully initialized — orderId: ${buyResult.orderId}. SL/TP orders active on Binance.`);
    return { ok: true, trade };

  } catch (err: any) {
    log('error', `Unexpected execution error: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

// ─── 30s Monitor Loop — check TP fills, trail SL ──────────────────

export async function monitorTrade(
  creds: BinanceCredentials,
  trade: OpenTradeState,
  autoBreakeven: boolean,
  trailSlToTp1: boolean,
  logs: TradeLog[]
): Promise<{ updated: OpenTradeState; closed: boolean; pnlUsdt: number }> {

  const log = (level: TradeLog['level'], msg: string) =>
    logs.push({ level, message: `[MONITOR][${trade.symbol}] ${msg}` });

  let t = { ...trade };
  let pnlUsdt = 0;

  try {
    // Check TP1
    if (!t.tp1Filled && t.tp1OrderId) {
      const status = await getOrderStatus(creds, t.symbol, t.tp1OrderId);
      if (status === 'FILLED') {
        t.tp1Filled = true;
        log('success', `TP1 FILLED at ${t.tp1}!`);

        // Move SL to breakeven
        if (autoBreakeven && !t.slMovedToBreakeven && t.slOrderId) {
          await cancelOrder(creds, t.symbol, t.slOrderId);
          const remaining = t.qty * 0.67;
          const newSlLimit = t.entryPrice * 0.998;
          const newSlRes = await placeStopLossSell(creds, t.symbol, remaining, t.entryPrice, newSlLimit);
          if (!newSlRes.error) {
            t.slOrderId = newSlRes.orderId;
            t.currentSl = t.entryPrice;
            t.slMovedToBreakeven = true;
            log('success', `SL trailed to BREAKEVEN (${t.entryPrice})`);
          }
        }
      }
    }

    // Check TP2
    if (!t.tp2Filled && t.tp2OrderId) {
      const status = await getOrderStatus(creds, t.symbol, t.tp2OrderId);
      if (status === 'FILLED') {
        t.tp2Filled = true;
        log('success', `TP2 FILLED at ${t.tp2}!`);

        // Move SL to TP1
        if (trailSlToTp1 && !t.slMovedToTp1 && t.slOrderId) {
          await cancelOrder(creds, t.symbol, t.slOrderId);
          const remaining = t.qty * 0.34;
          const newSlLimit = t.tp1 * 0.998;
          const newSlRes = await placeStopLossSell(creds, t.symbol, remaining, t.tp1, newSlLimit);
          if (!newSlRes.error) {
            t.slOrderId = newSlRes.orderId;
            t.currentSl = t.tp1;
            t.slMovedToTp1 = true;
            log('success', `SL trailed to TP1 level (${t.tp1})`);
          }
        }
      }
    }

    // Check TP3 — full close
    if (!t.tp3Filled && t.tp3OrderId) {
      const status = await getOrderStatus(creds, t.symbol, t.tp3OrderId);
      if (status === 'FILLED') {
        t.tp3Filled = true;
        log('success', `TP3 FILLED at ${t.tp3}! Position fully closed.`);
        pnlUsdt = ((t.tp1 * 0.33 + t.tp2 * 0.33 + t.tp3 * 0.34) / t.entryPrice - 1) * t.quoteSpent;
        return { updated: t, closed: true, pnlUsdt };
      }
    }

    // Check SL hit — live price vs SL level
    const livePrice = await getLivePrice(t.symbol, !!creds.testnet);
    if (livePrice > 0 && livePrice <= t.currentSl) {
      log('warn', `Stop-loss hit! Live: ${livePrice}, SL: ${t.currentSl}`);
      pnlUsdt = ((t.currentSl - t.entryPrice) / t.entryPrice) * t.quoteSpent;
      return { updated: t, closed: true, pnlUsdt };
    }

  } catch (err: any) {
    log('error', `Monitor error: ${err.message}`);
  }

  return { updated: t, closed: false, pnlUsdt: 0 };
}
