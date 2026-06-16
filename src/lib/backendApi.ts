/**
 * Frontend Backend API Client
 * Single source of truth for all backend communication.
 * Automatically switches between Localhost and Render Live URL.
 */

// 🛠️ FIX: যদি লাইভ ডোমেইনে থাকে তবে রিলেটিভ পাথ ব্যবহার করবে, লোকালে থাকলে localhost:8080
const API_URL = (import.meta as any).env?.VITE_API_URL || 
  (typeof window !== 'undefined' && window.location.hostname === 'localhost' ? 'http://localhost:8080' : '');

const ADMIN_TOKEN = (import.meta as any).env?.VITE_ADMIN_TOKEN || 'dev_token';

async function request(path: string, method: 'GET' | 'POST' = 'GET', body?: any) {
  try {
    const res = await fetch(`${API_URL}/api${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    return await res.json();
  } catch (error) {
    console.error(`[API Error] ${path}:`, error);
    // UI যেন ক্র্যাশ না করে ক্রিস্টাল ক্লিয়ার এরর অবজেক্ট পাঠানো হলো
    return { success: false, text: "My apologies, sir. I encountered a network routing error.", error: 'Network error' };
  }
}

export const backendApi = {
  // Dashboard
  getPortfolio: () => request('/portfolio'),
  getEquityCurve: () => request('/equity'),
  
  // Trading & Monitor
  triggerTrade: (symbol: string) => request('/trade', 'POST', { symbol }),
  getMonitorStatus: () => request('/status'),
  
  // Settings
  saveApiKeys: (apiKey: string, secretKey: string, testnet: boolean) => 
    request('/settings/save', 'POST', { apiKey, secretKey, testnet }),
    
  // JARVIS
  askJarvis: (message: string) => request('/jarvis-ask', 'POST', { message }),
};