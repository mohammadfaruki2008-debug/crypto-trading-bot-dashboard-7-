/**
 * Persistent Storage Module
 * Saves and retrieves encrypted API keys and general JSON app logs/data.
 * Fallback mechanism added to dynamically pull keys from process.env if local JSON is unwritten.
 */
import fs from 'fs';
import path from 'path';

const DATA_FILE = path.join(process.cwd(), 'data.json');
const DATA_DIR = path.join(process.cwd(), 'data');

export interface EncryptedSettings {
  encryptedApiKey: string;
  encryptedSecretKey: string;
  testnet: boolean;
  updatedAt: string;
}

export interface DecryptedSettings {
  apiKey: string;
  secretKey: string;
  testnet: boolean;
}

function readData(): any {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (error) {
    console.error('[Storage] Read error:', error);
  }
  return {};
}

function writeData(data: any): void {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('[Storage] Write error:', error);
  }
}

/**
 * Saves encrypted credentials to the local data.json file.
 */
export function saveEncryptedCredentials(encryptedApiKey: string, encryptedSecretKey: string, testnet: boolean): void {
  const data = readData();
  data.binance = {
    encryptedApiKey,
    encryptedSecretKey,
    testnet,
    updatedAt: new Date().toISOString()
  };
  writeData(data);
  console.log('[Storage] ✅ Encrypted credentials saved successfully.');
}

/**
 * Retrieves and decrypts credentials for the trading engine.
 * Includes automatic .env fallback for stateless Render servers.
 */
export function getDecryptedCredentials(): DecryptedSettings | null {
  const data = readData();
  
  // ১. ড্যাশবোর্ডে ফাইল সেভ করা থাকলে প্রথমে ওটা ট্রাই করবে
  if (data.binance) {
    try {
      const { decrypt } = require('./crypto');
      const apiKey = decrypt(data.binance.encryptedApiKey);
      const secretKey = decrypt(data.binance.encryptedSecretKey);
      
      if (apiKey && secretKey) {
        return {
          apiKey,
          secretKey,
          testnet: data.binance.testnet
        };
      }
    } catch (err) {
      console.error('[Storage] Decryption failed, attempting .env fallback...');
    }
  }
  
  // ২. ⚠️ রেন্ডার ব্যাকআপ: data.json খালি থাকলে সরাসরি রেন্ডারের Environment Variables থেকে কী নেবে
  if (process.env.BINANCE_API_KEY && process.env.BINANCE_API_SECRET) {
    return {
      apiKey: process.env.BINANCE_API_KEY,
      secretKey: process.env.BINANCE_API_SECRET,
      testnet: process.env.BINANCE_USE_TESTNET === 'true' || true
    };
  }
  
  return null;
}

export function getDecryptedCreds() {
  return getDecryptedCredentials();
}

/**
 * 🟢 Synchronous JSON Engines — Handles application data logging and watchlist history
 */
export function readJson<T = any>(filename: string, ...args: any[]): T {
  const fallback = args[0] !== undefined ? args[0] : ([] as any);
  try {
    const targetPath = path.join(DATA_DIR, filename);
    if (!fs.existsSync(targetPath)) return fallback;
    const raw = fs.readFileSync(targetPath, 'utf8');
    return JSON.parse(raw || '[]') || fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(filename: string, data: any, ...args: any[]): void {
  try {
    const targetPath = path.join(DATA_DIR, filename);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {}
}

export function appendJson(filename: string, item: any, ...args: any[]): void {
  try {
    const data = readJson<any[]>(filename);
    data.push({ ...item, id: item.id || `id_${Math.random().toString(36).substring(2, 9)}`, timestamp: Date.now() });
    writeJson(filename, data);
  } catch (e) {}
}