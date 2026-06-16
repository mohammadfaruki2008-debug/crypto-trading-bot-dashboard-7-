/**
 * Persistent Storage Module
 * Saves and retrieves encrypted API keys and general JSON app logs/data.
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

export function getDecryptedCredentials(): DecryptedSettings | null {
  const data = readData();
  if (!data.binance) return null;
  
  try {
    const { decrypt } = require('./crypto');
    const apiKey = decrypt(data.binance.encryptedApiKey);
    const secretKey = decrypt(data.binance.encryptedSecretKey);
    
    if (!apiKey || !secretKey) return null;
    
    return {
      apiKey,
      secretKey,
      testnet: data.binance.testnet
    };
  } catch (err) {
    return null;
  }
}

export function getDecryptedCreds() {
  return getDecryptedCredentials();
}

/**
 * 🟢 Synchronous JSON Engines — Rest Parameters (...) added to swallow any extra arguments
 */
export function readJson<T = any>(filename: string, ...args: any[]): T {
  // যদি ২য় আর্গুমেন্ট হিসেবে কোনো fallback/ডিফল্ট ডাটা পাঠানো হয়, তবে সেটি ধরবে, নতুবা খালি অ্যারে []
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