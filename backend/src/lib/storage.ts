/**
 * Lightweight JSON file storage for trades, alerts, logs, knowledge.
 * Used when Supabase is not configured (zero-config mode).
 */
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve(process.cwd(), 'data');

function ensureDir(): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function readJson<T>(filename: string, fallback: T): T {
  ensureDir();
  const fp = path.join(DATA_DIR, filename);
  try {
    if (!fs.existsSync(fp)) return fallback;
    return JSON.parse(fs.readFileSync(fp, 'utf-8'));
  } catch {
    return fallback;
  }
}

export function writeJson(filename: string, data: any): void {
  ensureDir();
  const fp = path.join(DATA_DIR, filename);
  try {
    fs.writeFileSync(fp, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err: any) {
    console.warn(`[STORAGE] writeJson failed for ${filename}:`, err.message);
  }
}

export function appendJson<T>(filename: string, entry: T, maxItems = 500): void {
  const list = readJson<T[]>(filename, []);
  list.push(entry);
  while (list.length > maxItems) list.shift();
  writeJson(filename, list);
}
