/**
 * Central configuration — all env vars in one place.
 */
import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT) || 8080,
  env: process.env.NODE_ENV || 'development',
  frontendUrl: process.env.FRONTEND_URL || '*',

  binance: {
    apiKey: process.env.BINANCE_API_KEY || '',
    apiSecret: process.env.BINANCE_SECRET || '',
    testnet: process.env.BINANCE_TESTNET === 'true',
    restBase: process.env.BINANCE_TESTNET === 'true'
      ? 'https://testnet.binance.vision/api/v3'
      : 'https://api.binance.com/api/v3',
  },

  jarvis: {
    workerUrl: process.env.JARVIS_WORKER_URL || 'https://quantum-mind.mohammadfaruki2008.workers.dev/',
  },

  supabase: {
    url: process.env.SUPABASE_URL || '',
    anonKey: process.env.SUPABASE_ANON_KEY || '',
  },

  security: {
    webhookSecret: process.env.WEBHOOK_SECRET || 'change_me',
    adminToken: process.env.ADMIN_TOKEN || 'change_me',
  },

  monitor: {
    symbols: (process.env.MONITOR_SYMBOLS || 'BTCUSDT,ETHUSDT,SOLUSDT').split(',').map(s => s.trim()),
    intervalMin: Number(process.env.MONITOR_INTERVAL_MIN) || 15,
    autoStart: process.env.MONITOR_AUTOSTART === 'true',
    cooldownHours: 2,
    maxOpenTrades: 5,
    riskPerTradePct: 1,
    dailyLossLimitPct: 3,
  },
};

export function logConfig(): void {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧠 Quantum Mind Backend');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Env:            ${config.env}`);
  console.log(`Port:           ${config.port}`);
  console.log(`Frontend URL:   ${config.frontendUrl}`);
  console.log(`Binance mode:   ${config.binance.testnet ? '🧪 TESTNET' : '💰 MAINNET'}`);
  console.log(`Binance keys:   ${config.binance.apiKey ? '✅ set' : '❌ MISSING'}`);
  console.log(`Supabase:       ${config.supabase.url ? '✅ configured' : '⚪ disabled'}`);
  console.log(`JARVIS Worker:  ${config.jarvis.workerUrl}`);
  console.log(`Monitor:        ${config.monitor.symbols.join(', ')} every ${config.monitor.intervalMin}min`);
  console.log(`Auto-start:     ${config.monitor.autoStart ? '✅ yes' : '⚪ no'}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}
