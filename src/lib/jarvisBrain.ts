/**
 * Frontend JARVIS thin client — calls backend `/api/jarvis-ask`.
 *
 * IMPORTANT: The real brain (tools, LLM orchestration, trading, code injection,
 * memory, 24/7 monitor) lives in `backend/src/lib/jarvisBrain.ts`.
 *
 * This file used to contain duplicate brain logic. That was wrong:
 *   • Two brains drifted out of sync.
 *   • Browser tools executed without server's risk checks.
 *   • Conversation history split across browser tabs and server.
 *
 * Now this is a 30-line HTTP client. All intelligence happens server-side.
 */

import { backendApi, backendConfigured } from './backendApi';
import type { JarvisReply, ExecutedAction } from './jarvisTypes';

// Re-export so existing imports keep working
export type { JarvisReply, ExecutedAction } from './jarvisTypes';

/** Legacy context type kept only so existing component prop signatures don't break.
 *  The actual handlers inside are NEVER called anymore — backend has its own. */
export interface JarvisContext {
  // Stub fields preserved for backward compatibility only.
  getPortfolio?: () => any;
  getPrice?: (symbol: string) => Promise<number>;
  getIndicators?: (symbol: string, timeframe: string) => Promise<unknown>;
  placeTrade?: (p: any) => { ok: boolean; message: string };
  closePosition?: (symbol: string) => { ok: boolean; message: string };
  setAlert?: (a: { symbol: string; price: number; direction: 'above' | 'below' }) => void;
  getAlerts?: () => { symbol: string; price: number; direction: string }[];
  toggleBot?: (running: boolean) => void;
  emergencyStop?: () => string;
  navigate?: (page: string) => void;
  setSetting?: (key: string, value: any) => void;
  addCoin?: (ticker: string, timeframe: string, allocUsdt: number) => { ok: boolean; message: string };
  runBacktest?: (symbol: string) => { ok: boolean; message: string };
  onLog?: (msg: string) => void;
}

/** Persistent session id per browser so backend keeps conversation history per user. */
function getSessionId(): string {
  try {
    let sid = localStorage.getItem('quantum_mind_session_id');
    if (!sid) {
      sid = 's_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
      localStorage.setItem('quantum_mind_session_id', sid);
    }
    return sid;
  } catch {
    return 'default';
  }
}

/**
 * Send a message to JARVIS. Always routes through the backend.
 * Returns plain text reply + any tool actions the server executed.
 */
export async function askJarvis(userMessage: string, _ctx?: JarvisContext): Promise<JarvisReply> {
  if (!backendConfigured) {
    return {
      text: 'Backend not configured, sir. Set VITE_BACKEND_URL and VITE_ADMIN_TOKEN env vars on the frontend so I can reach my brain.',
      actions: [],
      raw: '',
    };
  }

  try {
    const sessionId = getSessionId();
    const resp = await backendApi.jarvis(userMessage, sessionId);
    return {
      text: resp.reply || 'Done, sir.',
      actions: (resp.actions || []) as ExecutedAction[],
      raw: resp.reply || '',
      confirmationRequired: resp.confirmationRequired,
    };
  } catch (err: any) {
    return {
      text: `My apologies, sir — the backend is unreachable (${err.message}). Check that the Render service is running and VITE_BACKEND_URL is correct.`,
      actions: [],
      raw: '',
    };
  }
}
