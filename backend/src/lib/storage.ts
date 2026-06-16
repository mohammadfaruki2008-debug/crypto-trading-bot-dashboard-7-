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
 */
export function getDecryptedCredentials(): DecryptedSettings | null {
  const data = readData();
  if (!data.binance) return null;
  
  try {
    // Dynamic import to break circular dependency with crypto helper
    const { decrypt } = require('./crypto');
    const apiKey = decrypt(data.binance.encryptedApiKey);
    const secretKey = decrypt(data.binance.encryptedSecretKey);
    
    if (!apiKey || !secretKey) {
      console.error('[Storage] Failed to decrypt credentials or they are missing.');
      return null;
    }
    
    return {
      apiKey,
      secretKey,
      testnet: data.binance.testnet
    };
  } catch (err) {
    console.error('[Storage] Decryption runtime error:', err);
    return null;
  }
}

// 🔄 Alias function to avoid import errors across files
export function getDecryptedCreds() {
  return getDecryptedCredentials();
}

/**
 * 🟢 Generic JSON Helpers required by knowledgeEngine, alerts, and trades
 */
export async function readJson(filename: string): Promise<any[]> {
  try {
    const targetPath = path.join(DATA_DIR, filename);
    if (!fs.existsSync(targetPath)) return [];
    const raw = fs.readFileSync(targetPath, 'utf8');
    return JSON.parse(raw || '[]');
  } catch {
    return [];
  }
}

export async function writeJson(filename: string, data: any): Promise<void> {
  try {
    const targetPath = path.join(DATA_DIR, filename);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {}
}

export async function appendJson(filename: string, item: any): Promise<void> {
  try {
    const data = await readJson(filename);
    data.push({ ...item, id: item.id || `id_${Math.random().toString(36).substring(2, 9)}`, timestamp: Date.now() });
    await writeJson(filename, data);
  } catch (e) {}
}