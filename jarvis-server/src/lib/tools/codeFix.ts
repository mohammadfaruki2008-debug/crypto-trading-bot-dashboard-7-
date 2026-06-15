/**
 * Code fix tool — TRUE file system read/write for self-healing code.
 * Safety: only allows paths within the project root, requires explicit approval.
 */
import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = process.cwd();

/** Pending code fix awaiting user approval. */
let pendingFix: { filePath: string; newCode: string; reasoning: string } | null = null;

/** Validate that the path is within the project and not in node_modules/.env/etc. */
function validatePath(filePath: string): { ok: boolean; absPath: string; error?: string } {
  const absPath = path.resolve(PROJECT_ROOT, filePath);

  // Must be within project root
  if (!absPath.startsWith(PROJECT_ROOT)) {
    return { ok: false, absPath, error: 'Path escapes project root — blocked for security' };
  }

  // Block dangerous paths
  const blocked = ['node_modules', '.env', '.git', 'package-lock', 'dist/'];
  for (const b of blocked) {
    if (absPath.includes(b)) {
      return { ok: false, absPath, error: `Writing to ${b} is blocked for security` };
    }
  }

  return { ok: true, absPath };
}

/**
 * Stage a code fix for approval. Does NOT write yet — just stores it.
 * The server route will return confirmationRequired=true to the frontend.
 */
export function stageCodeFix(filePath: string, newCode: string, reasoning: string): {
  ok: boolean;
  message: string;
  confirmationRequired: boolean;
} {
  const validation = validatePath(filePath);
  if (!validation.ok) {
    return { ok: false, message: validation.error!, confirmationRequired: false };
  }

  pendingFix = { filePath: validation.absPath, newCode, reasoning };

  return {
    ok: true,
    message: `Code fix prepared for \`${filePath}\`. Operator security confirmation required before applying.`,
    confirmationRequired: true,
  };
}

/**
 * Apply the pending code fix after user approval.
 * Creates a backup of the original file first.
 */
export function applyPendingCodeFix(): { ok: boolean; message: string } {
  if (!pendingFix) {
    return { ok: false, message: 'No pending code fix to apply' };
  }

  const { filePath, newCode, reasoning } = pendingFix;

  try {
    // Create backup
    if (fs.existsSync(filePath)) {
      const backup = filePath + '.bak.' + Date.now();
      fs.copyFileSync(filePath, backup);
    }

    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write the new code
    fs.writeFileSync(filePath, newCode, 'utf-8');

    pendingFix = null;

    return {
      ok: true,
      message: `Code successfully written to \`${path.relative(PROJECT_ROOT, filePath)}\`. Reason: ${reasoning}`,
    };
  } catch (err: any) {
    pendingFix = null;
    return { ok: false, message: `File write failed: ${err.message}` };
  }
}

/** Reject the pending code fix. */
export function rejectPendingCodeFix(): { ok: boolean; message: string } {
  if (!pendingFix) return { ok: false, message: 'No pending fix' };
  const file = pendingFix.filePath;
  pendingFix = null;
  return { ok: true, message: `Code fix for ${path.relative(PROJECT_ROOT, file)} rejected by Operator` };
}

/** Check if there's a pending fix awaiting approval. */
export function getPendingFix(): typeof pendingFix {
  return pendingFix;
}
