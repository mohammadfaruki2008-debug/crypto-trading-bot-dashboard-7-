/**
 * Central configuration + encrypted API key loader.
 * @module config
 */
import crypto from 'crypto';

/** Decrypt an AES-256-GCM value produced by the encrypt() helper. */
export function decrypt(payload: string, keyHex: string): string {
  const [ivHex, tagHex, dataHex] = payload.split(':');
  const key = Buffer.from(keyHex, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return decipher.update(Buffer.from(dataHex, 'hex')).toString('utf8') + decipher.final('utf8');
}

/** Encrypt a secret at rest (AES-256-GCM). */
export function encrypt(plain: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '';

export const config = {
  binance: {
    apiKey: process.env.BINANCE_API_KEY_ENC
      ? decrypt(process.env.BINANCE_API_KEY_ENC, ENCRYPTION_KEY)
      : process.env.BINANCE_API_KEY || '',
    apiSecret: process.env.BINANCE_API_SECRET_ENC
      ? decrypt(process.env.BINANCE_API_SECRET_ENC, ENCRYPTION_KEY)
      : process.env.BINANCE_API_SECRET || '',
    testnet: process.env.BINANCE_TESTNET === 'true',
    restBase: process.env.BINANCE_TESTNET === 'true'
      ? 'https://testnet.binance.vision/api/v3'
      : 'https://api.binance.com/api/v3',
  },
  ml: {
    serviceUrl: process.env.ML_SERVICE_URL || 'http://ml:8000',
    minConfidence: Number(process.env.ML_MIN_CONFIDENCE || 0.6),
  },
  ensemble: {
    entryThreshold: Number(process.env.ENTRY_THRESHOLD || 65),
    reweightEveryTrades: 50,
  },
  risk: {
    riskPerTradePct: 1.0,
    dailyLossLimitPct: 3.0,
    weeklyLossLimitPct: 5.0,
    maxDrawdownPct: 20.0,
    correlationThreshold: 0.7,
  },
  symbols: (process.env.SYMBOLS || 'BTCUSDT,ETHUSDT,SOLUSDT').split(','),
  timeframe: process.env.TIMEFRAME || '1h',
  loopIntervalMs: Number(process.env.LOOP_INTERVAL_MS || 30000),
  db: { url: process.env.DATABASE_URL || '' },
  redis: { url: process.env.REDIS_URL || 'redis://redis:6379' },
};
