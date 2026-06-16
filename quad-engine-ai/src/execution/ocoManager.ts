/**
 * OCO Manager — monitors open trades, trails SL.
 *   +1R profit → SL to breakeven
 *   +2R profit → trail SL using the SuperTrend line
 * @module execution/ocoManager
 */
import { OpenTrade, SATSResult, Candle } from '../types';
import { getOrderStatus, getLivePrice, cancelOrder, placeOco } from './binanceOrder';

export async function monitorAndTrail(
  trade: OpenTrade,
  candles: Candle[],
  sats: SATSResult
): Promise<{ closed: boolean; status: OpenTrade['status']; realizedR: number }> {
  const i = candles.length - 1;
  const price = await getLivePrice(trade.symbol);
  const risk = trade.entry - trade.sl;
  if (risk <= 0) return { closed: false, status: 'open', realizedR: 0 };

  const rMultiple = (price - trade.entry) / risk;

  // TP3 fill → fully closed
  if (trade.tp3OrderId && (await getOrderStatus(trade.symbol, trade.tp3OrderId)) === 'FILLED') {
    return { closed: true, status: 'closed_tp', realizedR: (trade.tp3 - trade.entry) / risk };
  }
  // SL hit
  if (price <= trade.sl) {
    return { closed: true, status: 'closed_sl', realizedR: (trade.sl - trade.entry) / risk };
  }

  // +1R → breakeven
  if (!trade.slMovedToBreakeven && rMultiple >= 1) {
    if (trade.slOrderId) await cancelOrder(trade.symbol, trade.slOrderId);
    trade.sl = trade.entry;
    trade.slMovedToBreakeven = true;
    // re-place protective SL at breakeven for remaining qty (simplified)
    await placeOco(trade.symbol, trade.qty * 0.67, { ...trade, sl: trade.entry });
    console.info(`[TRAIL] ${trade.symbol} SL → breakeven`);
  }

  // +2R → trail SuperTrend
  if (rMultiple >= 2 && sats.stTrend[i] === 1) {
    const stLevel = sats.stLine[i];
    if (stLevel > trade.sl) {
      if (trade.slOrderId) await cancelOrder(trade.symbol, trade.slOrderId);
      trade.sl = stLevel;
      trade.slTrailingSuperTrend = true;
      await placeOco(trade.symbol, trade.qty * 0.34, { ...trade, sl: stLevel });
      console.info(`[TRAIL] ${trade.symbol} SL → SuperTrend ${stLevel.toFixed(2)}`);
    }
  }

  return { closed: false, status: 'open', realizedR: 0 };
}
