/**
 * AES-256-GCM encryption helpers.
 * Key derived from SECRET_ENCRYPTION_KEY env var.
 *
 * Format: <iv_hex>:<authTag_hex>:<ciphertext_hex>
 */
import crypto from 'crypto';
import { config } from '../config';

const ALGO = 'aes-256-gcm';

function deriveKey(): Buffer {
  const raw = config.security.encryptionKey;
  if (!raw || raw.length < 16) {
    throw new Error('SECRET_ENCRYPTION_KEY missing or too short (need 32+ chars). Generate: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  }
  // SHA-256 derives a deterministic 32-byte key from any input length
  return crypto.createHash('sha256').update(raw).digest();
}

/** Encrypt plaintext. Returns "iv:tag:ciphertext" hex string. */
export function encrypt(plaintext: string): string {
  if (!plaintext) return '';
  const key = deriveKey();
  const iv = crypto.randomBytes(12); // GCM standard
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

/** Decrypt the format produced by encrypt(). Returns plaintext or '' on failure. */
export function decrypt(payload: string): string {
  if (!payload || !payload.includes(':')) return '';
  try {
    const [ivHex, tagHex, dataHex] = payload.split(':');
    if (!ivHex || !tagHex || !dataHex) return '';
    const key = deriveKey();
    const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const dec = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]);
    return dec.toString('utf8');
  } catch (err: any) {
    console.error('[CRYPTO] decrypt failed:', err.message);
    return '';
  }
}

/** Show "abcd…wxyz" preview without leaking the secret. */
export function preview(secret: string): string {
  if (!secret) return '(empty)';
  if (secret.length <= 8) return '••••';
  return secret.slice(0, 4) + '…' + secret.slice(-4);
}
