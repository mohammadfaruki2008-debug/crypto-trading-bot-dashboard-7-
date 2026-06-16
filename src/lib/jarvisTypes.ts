export interface ExecutedAction {
  action: string;
  params: Record<string, unknown>;
  result: { ok: boolean; message: string; data?: unknown };
}

export interface JarvisReply {
  text: string;
  actions: ExecutedAction[];
}
