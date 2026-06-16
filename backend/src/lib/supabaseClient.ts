import { createClient, SupabaseClient } from '@supabase/supabase-js';
import config from '../config'; // config.ts এর নতুন ডিফোল্ট ইম্পোর্টকে সাপোর্ট করবে

const supabaseUrl = config.supabase?.url || '';
const supabaseAnonKey = config.supabase?.anonKey || '';

// 🟢 ১. knowledgeEngine.ts এই বুলিয়ানটি খুঁজছে (এক্সপোর্ট করা হলো)
export const supabaseEnabled = Boolean(supabaseUrl && supabaseAnonKey);

// 🟢 ২. সুপাবেস ক্লায়েন্ট ইনস্ট্যান্স সরাসরি এক্সপোর্ট করা হলো
export const supabase: SupabaseClient = supabaseEnabled
  ? createClient(supabaseUrl, supabaseAnonKey)
  : (null as any);

// 🔄 ৩. আপনার আগের getSupabase() ফাংশনটিরও ব্যাকআপ রাখা হলো যেন অন্য কোড না ভাঙে
export function getSupabase(): SupabaseClient {
  if (!supabaseEnabled) {
    throw new Error('Supabase URL and Anon Key are required in backend .env');
  }
  return supabase;
}