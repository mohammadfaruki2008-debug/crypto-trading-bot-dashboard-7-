/**
 * Code modification with mandatory operator approval.
 */
import fs from 'fs';
import path from 'path';
import { saveKnowledge } from '../knowledgeEngine';

const ROOT = process.cwd();
interface Pending { filePath: string; newCode: string; reasoning: string; stagedAt: string; }
let pending: Pending | null = null;

function validate(filePath: string): { ok: boolean; absPath: string; error?: string } {
  const abs = path.resolve(ROOT, filePath);
  if (!abs.startsWith(ROOT)) return { ok: false, absPath: abs, error: 'Path escapes project root' };
  const blocked = ['node_modules', '.env', '.git', 'package-lock', 'dist/', 'data/'];
  for (const b of blocked) if (abs.includes(b)) return { ok: false, absPath: abs, error: `${b} blocked` };
  return { ok: true, absPath: abs };
}

export function stageCodeFix(filePath: string, newCode: string, reasoning: string) {
  const v = validate(filePath);
  if (!v.ok) return { ok: false, message: v.error!, confirmationRequired: false };
  pending = { filePath: v.absPath, newCode, reasoning, stagedAt: new Date().toISOString() };
  return { ok: true, message: `Code staged for \`${filePath}\`. Operator approval required.`, confirmationRequired: true };
}

export function applyPendingCodeFix() {
  if (!pending) return { ok: false, message: 'No pending fix' };
  const { filePath, newCode, reasoning } = pending;
  try {
    if (fs.existsSync(filePath)) fs.copyFileSync(filePath, filePath + '.bak.' + Date.now());
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, newCode, 'utf-8');
    saveKnowledge(`Code applied to ${filePath}: ${reasoning}`, { type: 'code_fix', filePath });
    pending = null;
    return { ok: true, message: `✅ Written to \`${path.relative(ROOT, filePath)}\` (backup saved)` };
  } catch (err: any) {
    pending = null;
    return { ok: false, message: `Write failed: ${err.message}` };
  }
}

export function rejectPendingCodeFix() {
  if (!pending) return { ok: false, message: 'No pending fix' };
  pending = null;
  return { ok: true, message: 'Code fix rejected' };
}

export function getPendingFix() { return pending; }

export function readProjectFile(filePath: string) {
  const v = validate(filePath);
  if (!v.ok) return { ok: false, message: v.error! };
  if (!fs.existsSync(v.absPath)) return { ok: false, message: `Not found: ${filePath}` };
  try {
    const c = fs.readFileSync(v.absPath, 'utf-8');
    if (c.length > 50000) return { ok: true, content: c.slice(0, 50000) + '\n// truncated', message: 'truncated 50KB' };
    return { ok: true, content: c, message: `Read ${filePath}` };
  } catch (err: any) {
    return { ok: false, message: err.message };
  }
}
