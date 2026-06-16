/**
 * Supabase client — for RAG knowledge base / self-learning memory.
 * Gracefully no-ops if SUPABASE_URL / SUPABASE_ANON_KEY are not set.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || '';

let _client: SupabaseClient | null = null;

if (SUPABASE_URL && SUPABASE_KEY) {
  try {
    _client = createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log('[SUPABASE] Client initialized');
  } catch (err: any) {
    console.warn('[SUPABASE] Init failed:', err.message);
  }
} else {
  console.warn('[SUPABASE] Not configured — RAG memory disabled (set SUPABASE_URL + SUPABASE_ANON_KEY to enable)');
}

/** Stub client that no-ops .from().insert() / .select() so trade.ts never crashes. */
const stub: any = {
  from: () => ({
    insert: async () => ({ data: null, error: null }),
    select: async () => ({ data: [], error: null }),
    rpc: async () => ({ data: [], error: null }),
  }),
  rpc: async () => ({ data: [], error: null }),
};

export const supabase: SupabaseClient | any = _client || stub;
