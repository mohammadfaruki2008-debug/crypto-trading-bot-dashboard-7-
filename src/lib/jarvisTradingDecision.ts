// ============================================================================
// JARVIS Trading Decision Engine
// Combines QuadEngine + ExtraIndicators → JARVIS AI → final trade signal
// ============================================================================

import { askJarvis, JarvisContext } from './jarvisBrain';
import { MarketSnapshot, getMarketSnapshot, Candle } from './QuadEngine';

export interface TradeDecision {
  action: 'BUY' | 'SELL' | 'NOTHING';
  reasoning: string;         // JARVIS-এর ব্যাখ্যা
  entry: number | null;
  stopLoss: number | null;
  takeProfit1: number | null;
  takeProfit2: number | null;
  takeProfit3: number | null;
}

/**
 * Ask JARVIS to evaluate the current market snapshot and return a trading decision.
 * @param symbol    e.g. 'BTCUSDT'
 * @param timeframe e.g. '1h'
 * @param candles   Price candles (must contain at least 100 bars for indicators)
 * @param ctx       The dashboard's JarvisContext (needed for askJarvis)
 * @returns A TradeDecision with entry/sl/tp if action is BUY/SELL.
 */
export async function getTradingDecision(
  symbol: string,
  timeframe: string,
  candles: Candle[],
  ctx: JarvisContext
): Promise<TradeDecision> {
  // 1. Build the market snapshot
  const snapshot: MarketSnapshot = getMarketSnapshot(symbol, timeframe, candles);

  // 2. Create a prompt that forces JARVIS to output JSON-like structured answer
  const prompt = `You are JARVIS, an elite crypto trading AI. Analyze the following market data and decide: BUY, SELL, or NOTHING.

Market Data:
- Symbol: ${snapshot.symbol} (${snapshot.timeframe})
- Current Price: ${snapshot.price}
- SATS SuperTrend: ${snapshot.satsTrend === 1 ? 'Bullish' : 'Bearish'}
- Lorentzian Prediction: ${snapshot.lorePrediction} (Kernel Bullish: ${snapshot.loreKernelBullish})
- Squeeze: ${snapshot.sqzOn ? 'ON' : 'OFF'}, Squeeze Fired Bullish: ${snapshot.sqzFiredBullish}
- RSI: ${snapshot.rsi.toFixed(1)}
  Regular Bull Div: ${snapshot.rsiRegularBull}, Hidden Bull Div: ${snapshot.rsiHiddenBull}
  Regular Bear Div: ${snapshot.rsiRegularBear}, Hidden Bear Div: ${snapshot.rsiHiddenBear}
- Ichimoku Force: ${snapshot.ichiForce.toFixed(1)} (State: ${snapshot.ichiState})
- MACD: ${snapshot.macd.toFixed(4)}
  Bull Cross: ${snapshot.macdBullCross}, Bear Cross: ${snapshot.macdBearCross}
  Bull Divergence: ${snapshot.macdBullDiv}, Bear Divergence: ${snapshot.macdBearDiv}
- Volume Profile POC: ${snapshot.poc.toFixed(2)}, Price is ${snapshot.priceVsPoc} POC
- Smart Money Concepts: Trend ${snapshot.smcTrend}, BOS: ${snapshot.smcBOS}, CHoCH: ${snapshot.smcCHoCH}, In Order Block: ${snapshot.smcInOrderBlock}

Your task:
1. Decide whether to BUY, SELL, or do NOTHING.
2. If trading, provide exact levels:
   - Entry price
   - Stop-Loss
   - Take-Profit 1
   - Take-Profit 2
   - Take-Profit 3
3. Briefly explain your reasoning (max 2 sentences).

Reply ONLY with a JSON object in this exact format:
{
  "action": "BUY" | "SELL" | "NOTHING",
  "reasoning": "...",
  "entry": number,
  "stopLoss": number,
  "takeProfit1": number,
  "takeProfit2": number,
  "takeProfit3": number
}

Do NOT include any other text.`;

  // 3. Call JARVIS (this goes through our Cloudflare Worker → Groq/Gemini/SambaNova)
  const reply = await askJarvis(prompt, ctx);

  // 4. Parse JSON from JARVIS reply
  try {
    // JARVIS might wrap in ```json ... ```, so strip that
    const cleaned = reply.text.replace(/```json|```/g, '').trim();
    const decision = JSON.parse(cleaned) as TradeDecision;

    // Validate required fields
    if (!['BUY', 'SELL', 'NOTHING'].includes(decision.action)) {
      throw new Error('Invalid action');
    }
    return decision;
  } catch (err) {
    console.error('Failed to parse JARVIS decision:', reply.text);
    return {
      action: 'NOTHING',
      reasoning: 'JARVIS response could not be parsed.',
      entry: null,
      stopLoss: null,
      takeProfit1: null,
      takeProfit2: null,
      takeProfit3: null,
    };
  }
}
