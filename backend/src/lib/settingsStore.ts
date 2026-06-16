/**
 * Settings store — persistent encrypted storage for Binance API keys.
 *
 * Architecture:
 *   Frontend POST /api/settings/save → backend encrypts → DB (Supabase or local JSON)
 *   monitor.ts / trade.ts → loadBinanceCredentials() → in-memory cache → returns plaintext
 *
 * Cache is invalidated on save and on TTL expiry (60s).
 * Plaintext keys NEVER leave the backend.
 */
import { supabase, supabaseEnabled } from './supabaseClient';
import { readJson, writeJson } from './storage';
import { encrypt, decrypt, preview } from './crypto';
import { config } from '../config';

export interface BinanceCredentials {
  apiKey: string;
  apiSecret: string;
  testnet: boolean;
}

interface StoredSettings {
  binance_api_key_enc?: string;
  binance_api_secret_enc?: string;
  binance_testnet?: boolean;
  updated_at?: string;
}

const LOCAL_FILE = 'settings.json';
const TABLE = 'bot_settings';
const ROW_ID = 'singleton';
const CACHE_TTL_MS = 60 * 1000;

let _cache: { creds: BinanceCredentials | null; expiresAt: number } | null = null;

/* ───────── Storage backend ───────── */

async function readStored(): Promise<StoredSettings> {
  if (supabaseEnabled) {
    try {
      const { data, error } = await supabase
        .from(TABLE)
        .select('*')
        .eq('id', ROW_ID)
        .limit(1)
        .single();
      if (error) {
        // Table may not exist on first run — fall through to local
        if (error.code !== 'PGRST116') {
          console.warn('[SETTINGS] Supabase read warning:', error.message);
        }
      } else if (data) {
        return data as StoredSettings;
      }
    } catch (err: any) {
      console.warn('[SETTINGS] Supabase read failed:', err.message);
    }
  }
  return readJson<StoredSettings>(LOCAL_FILE, {});
}

async function writeStored(s: StoredSettings): Promise<void> {
  s.updated_at = new Date().toISOString();

  if (supabaseEnabled) {
    try {
      const { error } = await supabase
        .from(TABLE)
        .upsert({ id: ROW_ID, ...s }, { onConflict: 'id' });
      if (error) {
        console.warn('[SETTINGS] Supabase write failed, using local:', error.message);
        writeJson(LOCAL_FILE, s);
      } else {
        // Also mirror locally as backup
        writeJson(LOCAL_FILE, s);
        return;
      }
    } catch (err: any) {
      console.warn('[SETTINGS] Supabase write error:', err.message);
      writeJson(LOCAL_FILE, s);
    }
  } else {
    writeJson(LOCAL_FILE, s);
  }
}

/* ───────── Public API ───────── */

/**
 * Save Binance credentials. Encrypts before storing.
 * Plaintext keys are never written to disk or DB.
 */
export async function saveBinanceCredentials(creds: BinanceCredentials): Promise<{ ok: boolean; message: string }> {
  if (!creds.apiKey || !creds.apiSecret) {
    return { ok: false, message: 'apiKey and apiSecret required' };
  }
  if (creds.apiKey.length < 16 || creds.apiSecret.length < 16) {
    return { ok: false, message: 'Keys look too short — double-check' };
  }

  try {
    const stored: StoredSettings = {
      binance_api_key_enc: encrypt(creds.apiKey),
      binance_api_secret_enc: encrypt(creds.apiSecret),
      binance_testnet: !!creds.testnet,
    };
    await writeStored(stored);

    // Invalidate cache
    _cache = { creds, expiresAt: Date.now() + CACHE_TTL_MS };

    console.log(`[SETTINGS] ✅ Binance keys saved (key ${preview(creds.apiKey)}, ${creds.testnet ? 'TESTNET' : 'MAINNET'})`);
    return { ok: true, message: `Keys encrypted and saved (${creds.testnet ? 'testnet' : 'mainnet'})` };
  } catch (err: any) {
    console.error('[SETTINGS] save failed:', err.message);
    return { ok: false, message: `Save failed: ${err.message}` };
  }
}

/**
 * Load Binance credentials. Returns null if not configured.
 * Uses 60s in-memory cache. Falls back to .env if DB is empty.
 */
export async function loadBinanceCredentials(): Promise<BinanceCredentials | null> {
  // Cache hit
  if (_cache && _cache.expiresAt > Date.now()) {
    return _cache.creds;
  }

  try {
    const stored = await readStored();
    if (stored.binance_api_key_enc && stored.binance_api_secret_enc) {
      const apiKey = decrypt(stored.binance_api_key_enc);
      const apiSecret = decrypt(stored.binance_api_secret_enc);
      if (apiKey && apiSecret) {
        const creds: BinanceCredentials = {
          apiKey,
          apiSecret,
          testnet: stored.binance_testnet ?? config.binance.testnet,
        };
        _cache = { creds, expiresAt: Date.now() + CACHE_TTL_MS };
        return creds;
      }
    }
  } catch (err: any) {
    console.warn('[SETTINGS] load from DB failed:', err.message);
  }

  // Fallback to env vars (legacy / first-deploy bootstrap)
  if (config.binance.apiKey && config.binance.apiSecret) {
    const creds: BinanceCredentials = {
      apiKey: config.binance.apiKey,
      apiSecret: config.binance.apiSecret,
      testnet: config.binance.testnet,
    };
    _cache = { creds, expiresAt: Date.now() + CACHE_TTL_MS };
    return creds;
  }

  _cache = { creds: null, expiresAt: Date.now() + 5000 }; // short cache for missing
  return null;
}

/** Force cache refresh (called after save). */
export function invalidateCache(): void {
  _cache = null;
}

/** Public status — safe to expose (no secrets). */
export async function getSettingsStatus(): Promise<{
  configured: boolean;
  testnet: boolean;
  source: 'database' | 'env' | 'none';
  preview: string;
  updatedAt?: string;
}> {
  const stored = await readStored();
  if (stored.binance_api_key_enc) {
    const key = decrypt(stored.binance_api_key_enc);
    return {
      configured: !!key,
      testnet: stored.binance_testnet ?? true,
      source: 'database',
      preview: preview(key),
      updatedAt: stored.updated_at,
    };
  }
  if (config.binance.apiKey) {
    return {
      configured: true,
      testnet: config.binance.testnet,
      source: 'env',
      preview: preview(config.binance.apiKey),
    };
  }
  return { configured: false, testnet: config.binance.testnet, source: 'none', preview: '(empty)' };
}

/** Delete saved credentials (factory reset). */
export async function deleteBinanceCredentials(): Promise<{ ok: boolean; message: string }> {
  try {
    await writeStored({});
    _cache = null;
    return { ok: true, message: 'Saved keys deleted' };
  } catch (err: any) {
    return { ok: false, message: err.message };
  }
}
