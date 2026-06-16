/**
 * Frontend Backend API Client
 * Single source of truth for all backend communication.
 */
const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8080';
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
    return await res.json();
  } catch (error) {
    console.error(`[API Error] ${path}:`, error);
    return { success: false, error: 'Network error' };
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
