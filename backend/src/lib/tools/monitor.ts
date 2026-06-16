import { analyzeMarket } from '../indicators';
import { executeTrade, getAccountBalance } from '../binance';
import { config } from '../../config';

let monitorInterval: NodeJS.Timeout | null = null;
let isRunning = false;

async function scanCycle() {
  console.log('🛰️ [AUTONOMOUS] Scanning markets...');
  try {
    const balance = await getAccountBalance();
    for (const symbol of config.trading.watchlist) {
      const analysis = await analyzeMarket(symbol);
      // Add real trade logic here based on analysis.signal
    }
  } catch (error: any) {
    console.error('[Monitor Error]', error.message);
  }
}

export function startMonitor() {
  if (isRunning) return;
  isRunning = true;
  console.log('🟢 [AUTONOMOUS] JARVIS 24/7 Monitor ACTIVATED.');
  scanCycle();
  monitorInterval = setInterval(scanCycle, config.trading.scanIntervalMs);
}

export function stopMonitor() {
  if (monitorInterval) clearInterval(monitorInterval);
  isRunning = false;
  console.log('🔴 [AUTONOMOUS] JARVIS Monitor DEACTIVATED.');
}

export function getMonitorStatus() {
  return { running: isRunning };
}
