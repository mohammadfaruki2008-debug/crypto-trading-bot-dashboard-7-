/**
 * 24/7 Autonomous Market Monitor
 * Runs continuously on the server. Scans every 60 seconds.
 * Starts automatically when the Express server boots.
 */
import { analyzeMarket } from './indicators';
import { executeTradeWithRisk } from './trade';
import { config } from '../config';

let monitorInterval: NodeJS.Timeout | null = null;
const tradeHistory = new Map<string, number>(); // Cooldown tracker

let isRunning = false;

async function scanCycle() {
  console.log('🛰️ [AUTONOMOUS] Scanning markets...');
  
  for (const symbol of config.trading.watchlist) {
    // 1. Cooldown check
    const lastTrade = tradeHistory.get(symbol) || 0;
    if (Date.now() - lastTrade < config.trading.cooldownMs) continue;

    try {
      // 2. Analyze — FIX: Cast to any to prevent property 'price', 'sl', 'tp' missing errors
      const analysis: any = await analyzeMarket(symbol);
      console.log(`[AUTONOMOUS] ${symbol}: Signal=${analysis.signal}, Price=${analysis.price}`);

      // 3. Execute if BUY signal
      if (analysis.signal === 'BUY') {
        console.log(`🚀 [AUTONOMOUS] BUY signal detected on ${symbol}!`);
        const result = await executeTradeWithRisk(symbol, analysis.sl, analysis.tp);
        
        if (result && result.success) {
          tradeHistory.set(symbol, Date.now());
          console.log(`✅ [AUTONOMOUS] Trade recorded. Cooldown active.`);
        } else {
          console.error(`❌ [AUTONOMOUS] Trade failed: ${result?.message || 'Unknown error'}`);
        }
      }
    } catch (error: any) {
      console.error(`[AUTONOMOUS] Error scanning ${symbol}:`, error.message);
    }
  }
}

export function startMonitor() {
  if (isRunning) return;
  isRunning = true;
  
  const isTestnet = (config.binance as any).testnet;

  console.log('🟢 [AUTONOMOUS] JARVIS 24/7 Monitor ACTIVATED.');
  console.log(`💰 [AUTONOMOUS] Network: ${isTestnet ? 'TESTNET' : 'LIVE MAINNET'}`);
  console.log(`📊 [AUTONOMOUS] Watching: ${config.trading.watchlist.join(', ')}`);
  
  // Run immediately, then on interval
  scanCycle();
  monitorInterval = setInterval(scanCycle, config.trading.scanIntervalMs);
}

export function stopMonitor() {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
  isRunning = false;
  console.log('🔴 [AUTONOMOUS] JARVIS Monitor DEACTIVATED.');
}

export function getMonitorStatus() {
  return { running: isRunning, watchlist: config.trading.watchlist };
}