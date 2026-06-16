import { getAccountBalance } from './binance';
import { readJson } from './storage';

/**
 * JARVIS Direct Backend Brain Engine
 */
export async function askJarvis(userMessage: string): Promise<string> {
  const input = userMessage.toLowerCase();

  try {
    // 📊 ১. পোর্টফোলিও/ব্যালেন্স চেক করার ডিরেক্ট লজিক
    if (input.includes('balance') || input.includes('portfolio') || input.includes('asset')) {
      console.log('🤖 [JARVIS BRAIN] Direct Balance Execution...');
      try {
        const balance = await getAccountBalance();
        return `Sir, I have directly queried the Binance secure node. Your current available balance is exactly **${balance.freeUsdt} USDT**.`;
      } catch (err: any) {
        return `My apologies, sir. I tried to pull your balance directly from the engine, but it failed: ${err.message}`;
      }
    }

    // 🛰️ ২. মনিটর/বট স্ট্যাটাস চেক করার ডিরেক্ট লজিক
    if (input.includes('status') || input.includes('monitor') || input.includes('bot')) {
      console.log('🤖 [JARVIS BRAIN] Direct Monitor Check...');
      const logs = readJson('monitor_log.json', []);
      const activeStatus = logs && logs.length > 0 ? "Actively running and scanning markets 24/7." : "In idle status, waiting for configurations.";
      return `Sir, the autonomous trading core is currently: **${activeStatus}**`;
    }

    // 🚀 ৩. যদি এপিআই কী থাকে, তবে সরাসরি গুগল বা ওপেনআই-তে হিট করার ব্যাকআপ
    if (process.env.GEMINI_API_KEY) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `You are JARVIS, an elite trading assistant. Answer shortly. User says: ${userMessage}` }] }]
          })
        });
        const data = await res.json() as any;
        return data.candidates[0].content.parts[0].text;
      } catch (e) {}
    }

    // 💬 ৪. ডিফল্ট ইন্টেলিজেন্ট চ্যাট রেসপন্স (যদি এপিআই কী না থাকে বা থার্ড পার্টি ফেইল করে)
    if (input.includes('hello') || input.includes('hey') || input.includes('hi')) {
      return "Hello, sir. JARVIS is online and connected directly to the core backend engine. How may I assist your trades today?";
    }

    if (input.includes('help') || input.includes('command')) {
      return "Sir, you can ask me to: \n1. *'Check my balance'* (Direct Binance pull) \n2. *'Check bot status'* (Direct log analysis).";
    }

    return `System node acknowledged, sir. I am currently running inside the main backend core. To unlock full open-ended conversation, please inject a GEMINI_API_KEY inside Render env. However, my trading commands are fully operational.`;

  } catch (error: any) {
    console.error('[JARVIS BRAIN INTERNAL ERROR]:', error.message);
    return "My apologies, sir. An internal neural spike occurred in my core backend compiler.";
  }
}