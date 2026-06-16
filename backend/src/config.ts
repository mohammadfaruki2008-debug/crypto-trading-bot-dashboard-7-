import dotenv from 'dotenv';
dotenv.config();

// 🛠️ মেইন কনফিগ অবজেক্ট তৈরি
export const config = {
  port: process.env.PORT || 8080,
  nodeEnv: process.env.NODE_ENV || 'development',
  adminToken: process.env.ADMIN_TOKEN || 'default_dev_token',
  frontendUrl: process.env.FRONTEND_URL || '*', // 👈 server.ts এর জন্য যোগ করা হয়েছে

  supabase: {
    url: process.env.SUPABASE_URL || '',
    anonKey: process.env.SUPABASE_ANON_KEY || '',
  },
  
  ai: {
    workerUrl: process.env.AI_WORKER_URL || 'https://quantum-mind.mohammadfaruki2008.workers.dev/',
  },

  // 🤖 jarvisBrain.ts এর জন্য ব্যাকআপ ইম্পোর্ট পাথ
  jarvis: {
    workerUrl: process.env.AI_WORKER_URL || 'https://quantum-mind.mohammadfaruki2008.workers.dev/',
  },
  
  trading: {
    watchlist: (process.env.WATCHLIST || 'BTCUSDT,ETHUSDT,SOLUSDT').split(','),
    scanIntervalMs: 60 * 1000, // 60 seconds
    cooldownMs: 4 * 60 * 60 * 1000, // 4 hours
    riskPerTradePct: Number(process.env.RISK_PER_TRADE_PCT) || 1, // 👈 trade.ts এর জন্য যোগ করা হয়েছে
  },

  // 📊 monitor.ts এবং server.ts এর জন্য মনিটর সেটিংস
  monitor: {
    autoStart: process.env.MONITOR_AUTOSTART === 'true',
    symbols: (process.env.MONITOR_SYMBOLS || 'BTCUSDT,ETHUSDT,SOLUSDT').split(','),
  },

  // 🔑 বিন্যান্স সিক্রেট চাবি (monitor.ts এর টাইপস্ক্রিপ্ট এরর দূর করার জন্য)
  binance: {
    apiKey: process.env.BINANCE_API_KEY || '',
    apiSecret: process.env.BINANCE_API_SECRET || '',
  }
};

// 📢 ব্যানার প্রিন্ট ফাংশন (server.ts এর জন্য এক্সপোর্ট করা হয়েছে)
export const printBanner = () => {
  console.log('====================================');
  console.log('🤖 QUANTUM MIND MONOLITH ENGINE ACTIVE');
  console.log('====================================');
};

// 🔄 Default export দেওয়া হলো যেন server.ts কোনো ঝামেলা ছাড়াই সরাসরি রিড করতে পারে
export default config;