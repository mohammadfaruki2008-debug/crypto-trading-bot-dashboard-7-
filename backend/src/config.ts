import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: process.env.PORT || 8080,
  nodeEnv: process.env.NODE_ENV || 'development',
  adminToken: process.env.ADMIN_TOKEN || 'default_dev_token',
  frontendUrl: process.env.FRONTEND_URL || '*',

  supabase: {
    url: process.env.SUPABASE_URL || '',
    anonKey: process.env.SUPABASE_ANON_KEY || '',
  },
  
  ai: {
    workerUrl: process.env.AI_WORKER_URL || 'https://quantum-mind.mohammadfaruki2008.workers.dev/',
  },

  jarvis: {
    workerUrl: process.env.AI_WORKER_URL || 'https://quantum-mind.mohammadfaruki2008.workers.dev/',
  },
  
  trading: {
    watchlist: (process.env.WATCHLIST || 'BTCUSDT,ETHUSDT,SOLUSDT').split(','),
    scanIntervalMs: 60 * 1000, 
    cooldownMs: 4 * 60 * 60 * 1000, 
    riskPerTradePct: Number(process.env.RISK_PER_TRADE_PCT) || 1,
  },

  // 📊 trading rules এবং monitor.ts এর সব মিসিং ফিল্ড এখানে অ্যাড করা হয়েছে
  monitor: {
    autoStart: process.env.MONITOR_AUTOSTART === 'true',
    symbols: (process.env.MONITOR_SYMBOLS || 'BTCUSDT,ETHUSDT,SOLUSDT').split(','),
    cooldownHours: Number(process.env.COOLDOWN_HOURS) || 4,
    dailyLossLimitPct: Number(process.env.DAILY_LOSS_LIMIT_PCT) || 5,
    maxOpenTrades: Number(process.env.MAX_OPEN_TRADES) || 3,
    riskPerTradePct: Number(process.env.RISK_PER_TRADE_PCT) || 1,
  },

  binance: {
    apiKey: process.env.BINANCE_API_KEY || '',
    apiSecret: process.env.BINANCE_API_SECRET || '',
    testnet: process.env.BINANCE_USE_TESTNET === 'true' || true, // 👈 testnet প্রপার্টি ফিক্স
  }
};

export const printBanner = () => {
  console.log('🤖 QUANTUM MIND MONOLITH ENGINE ACTIVE');
};

export default config;