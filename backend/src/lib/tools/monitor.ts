/**
 * 24/7 AUTONOMOUS MONITOR — the true brain of the bot.
 *
 * This setInterval runs every MONITOR_INTERVAL_SEC seconds on the Render server.
 * It is COMPLETELY INDEPENDENT of any browser. As long as the backend Web Service
 * is running (Starter plan, no idle sleep), the bot scans markets and trades.
 *
 * Each tick:
 *   1. Check price alerts
 *   2. Verify TP/SL fills on open trades, record PnL
 *   3. Scan configured symbols, ask JARVIS for decision, auto-execute if BUY
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
const COOLDOWN_MS = config.monitor.cooldownHours * 3600000;

// Late-bind to break circular import with jarvisBrain
let askJarvisCallback: ((msg: string) => Promise<{ text: string; actions: any[] }>) | null = null;
export function setJarvisCallback(fn: (msg: string) => Promise<{ text: string; actions: any[] }>): void {
  askJarvisCallback = fn;
}

export interface MonitorStatus {
  running: boolean; symbols: string[]; intervalSec: number;
  lastTickAt: string | null; tickCount: number; nextTickIn: string;
}

export function getMonitorStatus(): MonitorStatus {
  let nextTickIn = 'stopped';
  if (isRunning && lastTickAt) {
    const elapsed = Date.now() - new Date(lastTickAt).getTime();
    const remain = Math.max(0, config.monitor.intervalSec * 1000 - elapsed);
    nextTickIn = `${Math.ceil(remain / 1000)}s`;
  }
  return {
    running: isRunning, symbols: config.monitor.symbols,
    intervalSec: config.monitor.intervalSec, lastTickAt, tickCount, nextTickIn,
  };
}

async function checkOpenTradeStatuses(): Promise<void> {
  const open = getOpenTrades();
  for (const t of open) {
    try {
      // TP3 fill = full close
      if (t.tp3OrderId) {
        const st = await getOrderStatus(t.symbol, t.tp3OrderId);
        if (st === 'FILLED') {
          const pnl = ((t.tp3 - t.entryPrice) / t.entryPrice) * t.spentUsdt;
          recordPnl(t.id, pnl, 'closed_tp');
          console.log(`[MONITOR] ✅ ${t.symbol} TP3 FILLED — PnL +${pnl.toFixed(2)} USDT`);
          continue;
        }
      }
      // SL fallback by price (in case STOP_LOSS_LIMIT didn't fire)
      if (t.sl > 0) {
        const live = await fetchPrice(t.symbol);
        if (live > 0 && live <= t.sl) {
          const pnl = ((t.sl - t.entryPrice) / t.entryPrice) * t.spentUsdt;
          recordPnl(t.id, pnl, 'closed_sl');
          console.log(`[MONITOR] 🛑 ${t.symbol} SL hit — PnL ${pnl.toFixed(2)} USDT`);
        }
      }
    } catch (err: any) {
      console.warn(`[MONITOR] status check ${t.symbol}:`, err.message);
    }
  }
}

async function scanAndDecide(): Promise<void> {
  for (const sym of config.monitor.symbols) {
    try {
      // Cooldown check
      const last = signalCooldown.get(sym) || 0;
      if (Date.now() - last < COOLDOWN_MS) continue;
      // Already open?
      if (getOpenTrades().some(t => t.symbol === sym)) continue;

      const a = await getFullAnalysis(sym, '1h');
      const prompt = `[AUTONOMOUS SCAN — ${sym} on 1h]
Price: ${a.price}
RSI(14): ${a.rsi}
MACD: ${a.macd.macd.toFixed(4)} / signal ${a.macd.signal.toFixed(4)} / hist ${a.macd.histogram.toFixed(4)} → ${a.macd.trend}
SuperTrend: ${a.supertrend.trend === 1 ? 'BULLISH' : 'BEARISH'} line ${a.supertrend.line.toFixed(2)} ATR ${a.supertrend.atr.toFixed(2)}

Decide: BUY (place_order with realistic SL/TP based on ATR), HOLD, or SKIP. Only trade on STRONG confluence.`;

      if (askJarvisCallback) {
        const reply = await askJarvisCallback(prompt);
        const orderAction = reply.actions?.find((x: any) => x.action === 'place_order' && x.result?.ok);
        if (orderAction) {
          signalCooldown.set(sym, Date.now());
          console.log(`[MONITOR] 🎯 ${sym} TRADE EXECUTED — ${orderAction.result.message}`);
          saveKnowledge(`Autonomous trade: ${sym} @ ${a.price} | RSI ${a.rsi} | MACD ${a.macd.trend}`,
            { type: 'autonomous_trade', symbol: sym, analysis: a });
        } else {
          console.log(`[MONITOR] ⚪ ${sym}: ${reply.text.slice(0, 80)}`);
        }
      }
    } catch (err: any) {
      console.error(`[MONITOR] scan ${sym}:`, err.message);
    }
  }
}

async function tick(): Promise<void> {
  tickCount++;
  lastTickAt = new Date().toISOString();
  console.log(`\n[MONITOR] 🔄 Tick #${tickCount} @ ${lastTickAt}`);
  try {
    const triggered = await checkAlerts();
    for (const a of triggered) console.log(`[MONITOR] 🔔 Alert HIT: ${a.symbol} ${a.direction} ${a.price}`);
    await checkOpenTradeStatuses();
    await scanAndDecide();
    console.log(`[MONITOR] ✅ Tick #${tickCount} done. Next in ${config.monitor.intervalSec}s.`);
  } catch (err: any) {
    console.error('[MONITOR] tick error:', err.message);
  }
}

export function startMonitor(symbols?: string[]): string {
  if (symbols && symbols.length > 0) {
    config.monitor.symbols = symbols.map(s => s.toUpperCase());
  }
  if (isRunning) return `Monitor already running on ${config.monitor.symbols.join(', ')}`;
  isRunning = true;
  console.log(`[MONITOR] 🚀 Starting on ${config.monitor.symbols.join(', ')} every ${config.monitor.intervalSec}s`);
  tick(); // immediate first tick
  timer = setInterval(tick, config.monitor.intervalSec * 1000);
  return `Monitor started on ${config.monitor.symbols.join(', ')} every ${config.monitor.intervalSec}s`;
}

export function stopMonitor(): string {
  if (timer) clearInterval(timer);
  timer = null; isRunning = false;
  console.log('[MONITOR] 🛑 Stopped');
  return 'Monitor stopped';
}
