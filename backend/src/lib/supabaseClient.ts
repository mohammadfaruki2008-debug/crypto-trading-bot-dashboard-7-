/**
 * Supabase client — graceful no-op stub when not configured.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config';

let _client: SupabaseClient | null = null;

if (config.supabase.url && config.supabase.anonKey) {
  try {
    _client = createClient(config.supabase.url, config.supabase.anonKey);
    console.log('[SUPABASE] ✅ Connected');
  } catch (err: any) {
    console.warn('[SUPABASE] init failed:', err.message);
  }
} else {
  console.log('[SUPABASE] ⚪ Not configured (using local JSON fallback)');
}

const stub: any = {
  from: () => ({
    insert: async () => ({ data: null, error: null }),
    select: () => ({ data: [], error: null, eq: () => stub.from(), order: () => stub.from(), limit: () => ({ data: [], error: null }) }),
  }),
  rpc: async () => ({ data: [], error: null }),
};

export const supabase: SupabaseClient | any = _client || stub;
export const supabaseEnabled = !!_client;
