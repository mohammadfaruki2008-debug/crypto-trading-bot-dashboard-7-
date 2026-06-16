/**
 * Autonomous 24/7 monitor — the heart of the bot.
 * Runs continuously, scans symbols, makes trade decisions via JARVIS,
 * checks alerts, updates open trade statuses, enforces risk limits.
 */
import { fetchPrice, getOrderStatus } from '../binance';
import { getFullAnalysis } from '../indicators';
import { checkAlerts } from './alert';
import { getOpenTrades, recordPnl } from './trade';
import { saveKnowledge } from '../knowledgeEngine';
import { config } from '../../config';

let timer: NodeJS.Timeout | null = null;
let isRunning = false;
let lastTickAt: string | null = null;
let tickCount = 0;
const signalCooldown = new Map<string, number>();
const SIGNAL_COOLDOWN_MS = config.monitor.cooldownHours * 60 * 60 * 1000;

// Late-bound JARVIS callback to avoid circular import
let askJarvisCallback: ((msg: string) => Promise<{ text: string; actions: any[] }>) | null = null;
export function setJarvisCallback(fn: (msg: string) => Promise<{ text: string; actions: any[] }>): void {
  askJarvisCallback = fn;
}

export interface MonitorStatus {
  running: boolean;
  symbols: string[];
  intervalMin: number;
  lastTickAt: string | null;
  tickCount: number;
  nextTickIn: string;
}

export function getMonitorStatus(): MonitorStatus {
  let nextTickIn = 'stopped';
  if (isRunning && lastTickAt) {
    const elapsed = Date.now() - new Date(lastTickAt).getTime();
    const remaining = Math.max(0, config.monitor.intervalMin * 60000 - elapsed);
    nextTickIn = `${Math.ceil(remaining / 60000)} min`;
  }
  return {
    running: isRunning,
    symbols: config.monitor.symbols,
    intervalMin: config.monitor.intervalMin,
    lastTickAt,
    tickCount,
    nextTickIn,
  };
}

async function monitorTradeStatus(): Promise<void> {
  const open = getOpenTrades();
  for (const trade of open) {
    try {
      // Check TP3 (full close)
      if (trade.tp3OrderId) {
        const status = await getOrderStatus(trade.symbol, trade.tp3OrderId);
        if (status === 'FILLED') {
          const pnl = ((trade.tp3 - trade.entryPrice) / trade.entryPrice) * trade.spentUsdt;
          recordPnl(trade.id, pnl, 'closed_tp');
          console.log(`[MONITOR] ${trade.symbol} TP3 FILLED — PnL +${pnl.toFixed(2)} USDT`);
          continue;
        }
      }
      // Check SL hit (price-based fallback)
      if (trade.sl > 0) {
        const live = await fetchPrice(trade.symbol);
        if (live > 0 && live <= trade.sl) {
          const pnl = ((trade.sl - trade.entryPrice) / trade.entryPrice) * trade.spentUsdt;
          recordPnl(trade.id, pnl, 'closed_sl');
          console.log(`[MONITOR] ${trade.symbol} SL hit — PnL ${pnl.toFixed(2)} USDT`);
        }
      }
    } catch (err: any) {
      console.warn(`[MONITOR] Status check failed for ${trade.symbol}:`, err.message);
    }
  }
}

async function scanAndDecide(): Promise<void> {
  for (const sym of config.monitor.symbols) {
    try {
      // Cooldown: don't act twice on same symbol within 2h
      const last = signalCooldown.get(sym) || 0;
      if (Date.now() - last < SIGNAL_COOLDOWN_MS) continue;

      // Already have open position?
      const open = getOpenTrades();
      if (open.some(t => t.symbol === sym)) continue;

      // Get analysis
      const analysis = await getFullAnalysis(sym, '1h');

      // Build prompt for JARVIS
      const prompt = `[AUTONOMOUS SCAN — ${sym} on 1h]
Price: ${analysis.price}
RSI(14): ${analysis.rsi}
MACD: ${analysis.macd.macd.toFixed(4)} signal ${analysis.macd.signal.toFixed(4)} hist ${analysis.macd.histogram.toFixed(4)} (${analysis.macd.trend})
SuperTrend: ${analysis.supertrend.trend === 1 ? 'BULLISH' : 'BEARISH'} line ${analysis.supertrend.line.toFixed(2)} ATR ${analysis.supertrend.atr.toFixed(2)}

Analyze and decide: BUY, HOLD, or SKIP.
If BUY, emit place_order with realistic SL/TP based on the ATR.
If HOLD or SKIP, just reply briefly. Do NOT trade on weak signals.`;

      if (askJarvisCallback) {
        const reply = await askJarvisCallback(prompt);
        // If a place_order action was executed, mark cooldown
        const orderAction = reply.actions?.find((a: any) => a.action === 'place_order' && a.result?.ok);
        if (orderAction) {
          signalCooldown.set(sym, Date.now());
          console.log(`[MONITOR] ✅ ${sym} trade executed — ${orderAction.result.message}`);
          saveKnowledge(`Autonomous trade: ${sym} @ ${analysis.price} | RSI ${analysis.rsi} MACD ${analysis.macd.trend}`, {
            type: 'autonomous_trade', symbol: sym, analysis,
          });
        } else {
          console.log(`[MONITOR] ⚪ ${sym}: ${reply.text.slice(0, 100)}`);
        }
      }
    } catch (err: any) {
      console.error(`[MONITOR] ${sym} error:`, err.message);
    }
  }
}

async function tick(): Promise<void> {
  tickCount++;
  lastTickAt = new Date().toISOString();
  console.log(`\n[MONITOR] 🔄 Tick #${tickCount} @ ${lastTickAt}`);

  try {
    // 1. Check price alerts
    const triggered = await checkAlerts();
    for (const a of triggered) {
      console.log(`[MONITOR] 🔔 Alert: ${a.symbol} ${a.direction} ${a.price} HIT`);
    }

    // 2. Monitor open trade statuses (TP/SL fills)
    await monitorTradeStatus();

    // 3. Scan symbols + decide via JARVIS
    await scanAndDecide();

    console.log(`[MONITOR] ✅ Tick complete. Next in ${config.monitor.intervalMin} min.`);
  } catch (err: any) {
    console.error('[MONITOR] Tick error:', err.message);
  }
}

export function startMonitor(symbols?: string[]): string {
  if (symbols && symbols.length > 0) {
    config.monitor.symbols = symbols.map(s => s.toUpperCase());
  }
  if (isRunning) {
    return `Monitor already running on ${config.monitor.symbols.join(', ')}`;
  }
  isRunning = true;
  console.log(`[MONITOR] 🚀 Starting on ${config.monitor.symbols.join(', ')} every ${config.monitor.intervalMin}min`);
  tick(); // immediate first tick
  timer = setInterval(tick, config.monitor.intervalMin * 60 * 1000);
  return `Monitor started on ${config.monitor.symbols.join(', ')} (every ${config.monitor.intervalMin}min)`;
}

export function stopMonitor(): string {
  if (timer) clearInterval(timer);
  timer = null;
  isRunning = false;
  console.log('[MONITOR] 🛑 Stopped');
  return 'Monitor stopped';
}
