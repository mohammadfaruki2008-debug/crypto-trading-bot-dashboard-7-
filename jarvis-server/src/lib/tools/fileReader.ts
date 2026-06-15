/**
 * File reader tool — reads any project file so Jarvis can analyze code.
 */
import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = process.cwd();

export function readProjectFile(filePath: string): { ok: boolean; content?: string; message: string } {
  const absPath = path.resolve(PROJECT_ROOT, filePath);

  if (!absPath.startsWith(PROJECT_ROOT)) {
    return { ok: false, message: 'Path escapes project root — blocked' };
  }

  if (absPath.includes('node_modules') || absPath.includes('.env')) {
    return { ok: false, message: 'Reading this path is blocked for security' };
  }

  if (!fs.existsSync(absPath)) {
    return { ok: false, message: `File not found: ${filePath}` };
  }

  try {
    const content = fs.readFileSync(absPath, 'utf-8');
    if (content.length > 50000) {
      return { ok: true, content: content.slice(0, 50000) + '\n\n// ... truncated (50KB limit)', message: `Read ${filePath} (truncated)` };
    }
    return { ok: true, content, message: `Read ${filePath} (${content.length} chars)` };
  } catch (err: any) {
    return { ok: false, message: `Read error: ${err.message}` };
  }
}
