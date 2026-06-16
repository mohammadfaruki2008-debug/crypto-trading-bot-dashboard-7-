-- Supabase Schema for Quantum Mind Backend
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS bot_settings (
  id INT PRIMARY KEY DEFAULT 1,
  encrypted_api_key TEXT,
  encrypted_secret_key TEXT,
  testnet BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure only one row exists for settings (singleton)
INSERT INTO bot_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
