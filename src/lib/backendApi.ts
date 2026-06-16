/**
 * Frontend Backend API Client
 * Runtime Dynamic Routing — Completely immune to Vite build-time hardcoding.
 */

const ADMIN_TOKEN = 'dev_token';

// 🌐 রানটাইমে ব্রাউজারের কারেন্ট ইউআরএল চেক করার ডাইনামিক ফাংশন
function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    // যদি আপনি নিজের পিসিতে লোকালহোস্টে টেস্ট করেন (Vite Dev Server 5173 এ)
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:8080';
    }
  }
  // 🚀 রেন্ডার বা লাইভ সার্ভারে থাকলে কোনো ইউআরএল লাগবে না, রিলেটিভ পাথ হিসেবে রেন্ডারের নিজস্ব ডোমেইন নেবে
  return '';
}

async function request(path: string, method: 'GET' | 'POST' = 'GET', body?: any) {
  try {
    const baseUrl = getApiBaseUrl();
    
    // ডাইনামিক ইউআরএল তৈরি
    const res = await fetch(`${baseUrl}/api${path}`, {
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
    return { 
      success: false, 
      text: "My apologies, sir. I am unable to establish a secure link with the core engine.", 
      error: 'Network error' 
    };
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