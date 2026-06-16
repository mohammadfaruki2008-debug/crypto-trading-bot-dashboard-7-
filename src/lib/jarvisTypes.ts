/**
 * Shared JARVIS types — used by the frontend chat UI ONLY.
 *
 * The real JARVIS brain lives in backend/src/lib/jarvisBrain.ts.
 * The browser is a thin chat client; it does NOT run AI tools or hold logic.
 */

export interface ExecutedAction {
  action: string;
  params: Record<string, unknown>;
  result: { ok: boolean; message: string; data?: unknown };
}

export interface JarvisReply {
  text: string;
  actions: ExecutedAction[];
  raw: string;
  confirmationRequired?: boolean;
}
