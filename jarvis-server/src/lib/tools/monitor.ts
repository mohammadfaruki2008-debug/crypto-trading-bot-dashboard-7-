/**
 * Proactive market monitor — runs every 15min, fetches indicators,
 * asks Jarvis for a decision, auto-executes with risk checks.
 */
import { fetchPrice } from '../binance';
import { checkAlerts } from './alert';

let timer: NodeJS.Timeout | null = null;
let monitorSymbols: string[] = [];
let isRunning = false;
const cooldown = new Map<string, number>();
const COOLDOWN_MS = 2 * 60 * 60 * 1000;

// Late-bind to avoid circular dependency — set by jarvisBrain.ts
let askJarvisInternal: ((msg: string) => Promise<string>) | null = null;
export function setJarvisCallback(fn: (msg: string) => Promise<string>): void {
  askJarvisInternal = fn;
}

export function getMonitorStatus(): { running: boolean; symbols: string[]; nextCheckIn: string } {
  return {
    running: isRunning,
    symbols: monitorSymbols,
    nextCheckIn: timer ? '≤15 min' : 'stopped',
  };
}

export function startMonitor(symbols: string[]): string {
  stopMonitor();
  monitorSymbols = symbols.map(s => s.toUpperCase());
  isRunning = true;

  const tick = async () => {
    // Check price alerts
    const triggered = await checkAlerts();
    for (const a of triggered) {
      console.log(`[MONITOR] Alert triggered: ${a.symbol} ${a.direction} ${a.price}`);
    }

    // Scan each symbol
    for (const sym of monitorSymbols) {
      try {
        // Cooldown check
        const last = cooldown.get(sym) || 0;
        if (Date.now() - last < COOLDOWN_MS) continue;

        const price = await fetchPrice(sym);
        // Build a context prompt with real indicators
        const prompt = `PROACTIVE SCAN for ${sym}:
Current price: ${price} USDT.
Analyze this using available indicators and decide: should we BUY, SELL, or HOLD?
If BUY or SELL, emit the place_order tool with proper SL/TP.
If HOLD, explain briefly.`;

        if (askJarvisInternal) {
          const reply = await askJarvisInternal(prompt);
          console.log(`[MONITOR] ${sym}: ${reply.slice(0, 120)}`);
          // If a trade was executed, the tool handler will set the cooldown
          if (reply.includes('EXECUTED') || reply.includes('filled')) {
            cooldown.set(sym, Date.now());
          }
        }
      } catch (err: any) {
        console.error(`[MONITOR] ${sym} error:`, err.message);
      }
    }
  };

  tick(); // run immediately
  timer = setInterval(tick, 15 * 60 * 1000);

  return `Proactive monitor started on ${monitorSymbols.join(', ')} — scanning every 15 min`;
}

export function stopMonitor(): string {
  if (timer) { clearInterval(timer); timer = null; }
  isRunning = false;
  return 'Proactive monitor stopped';
}
