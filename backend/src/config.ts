import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: process.env.PORT || 8080,
  nodeEnv: process.env.NODE_ENV || 'development',
  adminToken: process.env.ADMIN_TOKEN || 'default_dev_token',
  
  supabase: {
    url: process.env.SUPABASE_URL || '',
    anonKey: process.env.SUPABASE_ANON_KEY || '',
  },
  
  ai: {
    workerUrl: process.env.AI_WORKER_URL || 'https://quantum-mind.mohammadfaruki2008.workers.dev/',
  },
  
  trading: {
    watchlist: (process.env.WATCHLIST || 'BTCUSDT,ETHUSDT,SOLUSDT').split(','),
    scanIntervalMs: 60 * 1000, // 60 seconds
    cooldownMs: 4 * 60 * 60 * 1000, // 4 hours
  },
};
