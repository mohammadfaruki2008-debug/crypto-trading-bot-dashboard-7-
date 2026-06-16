/**
 * Persistent Storage Module
 * Saves and retrieves encrypted API keys from a local JSON file.
 * (Can be swapped for Supabase later, interface remains the same).
 */
import fs from 'fs';
import path from 'path';

const DATA_FILE = path.join(process.cwd(), 'data.json');

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
 * Saves encrypted credentials to the database/file.
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
  
  // Lazy load decrypt to avoid circular deps if needed
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
}
