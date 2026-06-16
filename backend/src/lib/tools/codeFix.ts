/**
 * Code fix tool — staged file writes with security confirmation.
 */
import fs from 'fs';
import path from 'path';
import { saveKnowledge } from '../knowledgeEngine';

const PROJECT_ROOT = process.cwd();

interface PendingFix {
  filePath: string;
  newCode: string;
  reasoning: string;
  stagedAt: string;
}

let pending: PendingFix | null = null;

function validatePath(filePath: string): { ok: boolean; absPath: string; error?: string } {
  const absPath = path.resolve(PROJECT_ROOT, filePath);
  if (!absPath.startsWith(PROJECT_ROOT)) {
    return { ok: false, absPath, error: 'Path escapes project root — blocked' };
  }
  const blocked = ['node_modules', '.env', '.git', 'package-lock', 'dist/', 'data/'];
  for (const b of blocked) {
    if (absPath.includes(b)) return { ok: false, absPath, error: `Writing to ${b} is blocked` };
  }
  return { ok: true, absPath };
}

export function stageCodeFix(filePath: string, newCode: string, reasoning: string): {
  ok: boolean;
  message: string;
  confirmationRequired: boolean;
  pending?: PendingFix;
} {
  const v = validatePath(filePath);
  if (!v.ok) return { ok: false, message: v.error!, confirmationRequired: false };
  pending = { filePath: v.absPath, newCode, reasoning, stagedAt: new Date().toISOString() };
  return {
    ok: true,
    message: `Code fix staged for \`${filePath}\`. Awaiting operator security confirmation.`,
    confirmationRequired: true,
    pending,
  };
}

export function applyPendingCodeFix(): { ok: boolean; message: string } {
  if (!pending) return { ok: false, message: 'No pending code fix' };
  const { filePath, newCode, reasoning } = pending;
  try {
    if (fs.existsSync(filePath)) {
      fs.copyFileSync(filePath, filePath + '.bak.' + Date.now());
    }
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, newCode, 'utf-8');
    saveKnowledge(`Code change applied to ${filePath}: ${reasoning}`, { type: 'code_fix', filePath });
    pending = null;
    return { ok: true, message: `✅ Code written to \`${path.relative(PROJECT_ROOT, filePath)}\` (backup created). Reason: ${reasoning}` };
  } catch (err: any) {
    pending = null;
    return { ok: false, message: `File write failed: ${err.message}` };
  }
}

export function rejectPendingCodeFix(): { ok: boolean; message: string } {
  if (!pending) return { ok: false, message: 'No pending fix' };
  const file = pending.filePath;
  pending = null;
  return { ok: true, message: `Code fix for ${path.relative(PROJECT_ROOT, file)} rejected.` };
}

export function getPendingFix(): PendingFix | null {
  return pending;
}

export function readProjectFile(filePath: string): { ok: boolean; content?: string; message: string } {
  const v = validatePath(filePath);
  if (!v.ok) return { ok: false, message: v.error! };
  if (!fs.existsSync(v.absPath)) return { ok: false, message: `File not found: ${filePath}` };
  try {
    const content = fs.readFileSync(v.absPath, 'utf-8');
    if (content.length > 50000) {
      return { ok: true, content: content.slice(0, 50000) + '\n// ... truncated', message: `Read (truncated, 50KB)` };
    }
    return { ok: true, content, message: `Read ${filePath} (${content.length} chars)` };
  } catch (err: any) {
    return { ok: false, message: `Read error: ${err.message}` };
  }
}
