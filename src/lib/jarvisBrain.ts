/**
 * Frontend JARVIS Brain (Thin HTTP Client)
 * Forwards all chat messages to the backend, which processes them with real AI.
 */
import { backendApi } from './backendApi';
import { JarvisReply } from './jarvisTypes';

export async function askJarvis(userMessage: string): Promise<JarvisReply> {
  try {
    const res = await backendApi.askJarvis(userMessage);
    
    if (res.error) {
      return { text: `Sir, I encountered an error: ${res.error}`, actions: [] };
    }
    
    return {
      text: res.reply || "I didn't catch that, sir.",
      actions: []
    };
  } catch (error: any) {
    return { text: "My apologies, sir. I cannot connect to the backend server.", actions: [] };
  }
}
