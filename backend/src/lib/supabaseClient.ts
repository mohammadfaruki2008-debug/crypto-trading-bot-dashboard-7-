import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config';

// Initialize Singleton
let supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!supabase) {
    if (!config.supabase.url || !config.supabase.anonKey) {
      throw new Error('Supabase URL and Anon Key are required in backend .env');
    }
    supabase = createClient(config.supabase.url, config.supabase.anonKey);
  }
  return supabase;
}
