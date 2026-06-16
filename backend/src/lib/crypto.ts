import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const SECRET_KEY = process.env.SECRET_ENCRYPTION_KEY || ''; // 64 hex chars

function getKey(): Buffer {
  if (SECRET_KEY.length !== 64) {
    throw new Error('SECRET_ENCRYPTION_KEY must be 64 hex characters.');
  }
  return Buffer.from(SECRET_KEY, 'hex');
}

export function encrypt(text: string): string {
  if (!text) return '';
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decrypt(encryptedText: string): string {
  if (!encryptedText) return '';
  try {
    const [ivHex, authTagHex, encryptedData] = encryptedText.split(':');
    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('[Crypto] Decryption failed:', error);
    return '';
  }
}
