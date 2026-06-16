-- ════════════════════════════════════════════════════════════════════
-- Quantum Mind — Supabase schema
-- Run this in the Supabase SQL Editor BEFORE first deploy.
-- (If you skip Supabase, the backend uses data/settings.json instead.)
-- ════════════════════════════════════════════════════════════════════

-- 1. Bot settings — singleton row, encrypted Binance creds
CREATE TABLE IF NOT EXISTS bot_settings (
    id                        TEXT PRIMARY KEY DEFAULT 'singleton',
    binance_api_key_enc       TEXT,
    binance_api_secret_enc    TEXT,
    binance_testnet           BOOLEAN DEFAULT TRUE,
    updated_at                TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Knowledge base — JARVIS self-learning memory (optional, pgvector required)
-- Skip this section if you don't want vector search.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS knowledge_base (
    id          BIGSERIAL PRIMARY KEY,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    content     TEXT NOT NULL,
    embedding   VECTOR(384),
    metadata    JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS knowledge_embedding_idx
  ON knowledge_base USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Cosine similarity search RPC used by knowledgeEngine.searchKnowledge()
CREATE OR REPLACE FUNCTION match_knowledge(
  query_embedding VECTOR(384),
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id BIGINT,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE SQL STABLE
AS $$
  SELECT
    knowledge_base.id,
    knowledge_base.content,
    knowledge_base.metadata,
    1 - (knowledge_base.embedding <=> query_embedding) AS similarity
  FROM knowledge_base
  WHERE knowledge_base.embedding IS NOT NULL
  ORDER BY knowledge_base.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- 3. Row-Level Security (RECOMMENDED for production)
-- The backend uses the anon key + service role.
-- Lock down direct browser access:
ALTER TABLE bot_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;

-- No public policies = no anonymous access. Backend uses service role to bypass.
-- (Make sure you set SUPABASE_SERVICE_ROLE_KEY if you want backend writes,
--  OR use the anon key with permissive policies below — testnet only.)

-- Permissive policies for development (REMOVE for production):
-- CREATE POLICY "anon_read"  ON bot_settings FOR SELECT USING (true);
-- CREATE POLICY "anon_write" ON bot_settings FOR ALL    USING (true);
