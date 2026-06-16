import { getSupabase } from './supabaseClient';
import { decrypt, encrypt } from './crypto';

export interface ApiCreds {
  apiKey: string;
  secretKey: string;
  testnet: boolean;
}

export async function saveEncryptedCreds(apiKey: string, secretKey: string, testnet: boolean) {
  const supabase = getSupabase();
  const encKey = encrypt(apiKey);
  const encSecret = encrypt(secretKey);

  const { error } = await supabase
    .from('bot_settings')
    .upsert({ id: 1, encrypted_api_key: encKey, encrypted_secret_key: encSecret, testnet, updated_at: new Date().toISOString() });

  if (error) throw new Error('Failed to save credentials to DB');
}

export async function getDecryptedCreds(): Promise<ApiCreds | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from('bot_settings').select('*').eq('id', 1).single();

  if (error || !data) return null;

  return {
    apiKey: decrypt(data.encrypted_api_key),
    secretKey: decrypt(data.encrypted_secret_key),
    testnet: data.testnet,
  };
}
