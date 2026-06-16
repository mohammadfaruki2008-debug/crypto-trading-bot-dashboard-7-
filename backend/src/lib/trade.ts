/**
 * Trade Execution Engine with Risk Management
 */
import { getAccountBalance, executeMarketBuy, placeOcoOrder } from './binance';
import { config } from '../config';

export async function executeTradeWithRisk(symbol: string, slPrice: number, tpPrice: number) {
  const balance = await getAccountBalance();
  if (balance.freeUsdt < 15) {
    return { success: false, message: 'Insufficient balance (< 15 USDT).' };
  }

  // Calculate position size based on risk
  const tradeAmount = balance.freeUsdt * (config.trading.riskPerTradePct / 100);
  console.log(`[Trade] Executing ${symbol} with ${tradeAmount.toFixed(2)} USDT`);

  try {
    const buyResult = await executeMarketBuy(symbol, tradeAmount);
    const executedQty = parseFloat(buyResult.executedQty);

    if (executedQty > 0 && slPrice > 0 && tpPrice > 0) {
      await placeOcoOrder(symbol, executedQty, tpPrice, slPrice);
    }

    return { success: true, message: `Bought ${symbol} for ${tradeAmount.toFixed(2)} USDT. OCO placed.` };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}
