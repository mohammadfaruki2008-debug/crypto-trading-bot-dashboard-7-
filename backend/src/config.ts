/**
 * Centralized environment configuration. Validates required vars on boot.
 */
import 'dotenv/config';

function required(name: string, fallback?: string): string {
  const v = process.env[name] || fallback;
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function optional(name: string, fallback = ''): string {
  return process.env[name] || fallback;
}

function boolEnv(name: string, fallback = false): boolean {
  const v = process.env[name];
  if (v === undefined) return fallback;
  return v === 'true' || v === '1';
}

function numEnv(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number(v);
  return isNaN(n) ? fallback : n;
}

export const config = {
  port: numEnv('PORT', 8080),
  env: optional('NODE_ENV', 'development'),
  frontendUrl: optional('FRONTEND_URL', '*'),

  binance: {
    apiKey: optional('BINANCE_API_KEY'),
    apiSecret: optional('BINANCE_SECRET_KEY'),
    testnet: boolEnv('BINANCE_TESTNET', true),
    restBase: boolEnv('BINANCE_TESTNET', true)
      ? 'https://testnet.binance.vision/api/v3'
      : 'https://api.binance.com/api/v3',
  },

  jarvis: {
    workerUrl: optional('JARVIS_WORKER_URL', 'https://quantum-mind.mohammadfaruki2008.workers.dev/'),
  },

  supabase: {
    url: optional('SUPABASE_URL'),
    anonKey: optional('SUPABASE_ANON_KEY'),
  },

  security: {
    adminToken: required('ADMIN_TOKEN', 'dev_token_change_me'),
    webhookSecret: optional('WEBHOOK_SECRET', 'dev_webhook_change_me'),
    // Used to AES-256-GCM encrypt Binance keys at rest (DB / local JSON).
    encryptionKey: required('SECRET_ENCRYPTION_KEY', 'dev_encryption_key_change_me_use_32_random_bytes'),
  },

  monitor: {
    symbols: optional('MONITOR_SYMBOLS', 'BTCUSDT,ETHUSDT,SOLUSDT')
      .split(',').map(s => s.trim().toUpperCase()).filter(Boolean),
    intervalSec: numEnv('MONITOR_INTERVAL_SEC', 60),
    autoStart: boolEnv('MONITOR_AUTOSTART', true),
    cooldownHours: 2,
    maxOpenTrades: 5,
    riskPerTradePct: 1,
    dailyLossLimitPct: 3,
  },
};

export function printBanner(): void {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧠 QUANTUM MIND BACKEND v2.0');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Env:           ${config.env}`);
  console.log(`Port:          ${config.port}`);
  console.log(`Frontend URL:  ${config.frontendUrl}`);
  console.log(`Binance:       ${config.binance.testnet ? '🧪 TESTNET' : '💰 MAINNET'}`);
  console.log(`Binance keys:  ${config.binance.apiKey ? '✅ configured' : '❌ MISSING — trading disabled'}`);
  console.log(`Supabase:      ${config.supabase.url ? '✅ enabled' : '⚪ local-only storage'}`);
  console.log(`JARVIS proxy:  ${config.jarvis.workerUrl}`);
  console.log(`Monitor:       ${config.monitor.symbols.join(', ')}`);
  console.log(`Interval:      every ${config.monitor.intervalSec}s`);
  console.log(`Auto-start:    ${config.monitor.autoStart ? '✅' : '⚪'}`);
  console.log(`Admin token:   ${config.security.adminToken.slice(0, 6)}…${config.security.adminToken.slice(-4)}`);
  console.log(`Encryption:    ${config.security.encryptionKey.length >= 32 ? '✅ AES-256-GCM' : '⚠️ weak key — set SECRET_ENCRYPTION_KEY'}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}
