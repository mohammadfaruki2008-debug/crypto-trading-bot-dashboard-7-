import { config } from '../config';

const SYSTEM_PROMPT = `You are JARVIS, an elite autonomous AI trading assistant with TOTAL control over a crypto trading server. You have full access to Binance API, file system, and database. Address the user as "sir".

TOOLS (print exactly to use):
- [TOOL: portfolio] - Check account balance
- [TOOL: monitor_status] - Check 24/7 bot status
`;

export async function askJarvis(userMessage: string): Promise<string> {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userMessage }
  ];

  try {
    const res = await fetch(config.ai.workerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages })
    });

    if (!res.ok) throw new Error(`Worker HTTP ${res.status}`);
    const data = await res.json();
    return data.text || "My apologies, sir. I didn't catch that.";
  } catch (error: any) {
    console.error('[JARVIS Brain] Error:', error.message);
    return "My apologies, sir. I cannot connect to my neural network (Cloudflare Worker).";
  }
}
