/**
 * Knowledge base — RAG memory for JARVIS self-learning.
 * Uses Supabase pgvector if available, otherwise local JSON fallback.
 */
import { supabase, supabaseEnabled } from './supabaseClient';
import { readJson, writeJson } from './storage';

interface KnowledgeEntry {
  id: string;
  ts: string;
  content: string;
  embedding: number[];
  metadata: Record<string, any>;
}

const LOCAL_FILE = 'knowledge.json';

/** Hash-based fallback embedding (384-dim, like MiniLM). */
export function getEmbedding(text: string): number[] {
  const dim = 384;
  const v = new Array(dim).fill(0);
  const tokens = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length > 2);
  for (const t of tokens) {
    let h = 0;
    for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0;
    v[h % dim] += 1;
  }
  const norm = Math.sqrt(v.reduce((a, b) => a + b * b, 0)) || 1;
  return v.map(x => x / norm);
}

function cosine(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) s += a[i] * b[i];
  return s;
}

export async function saveKnowledge(content: string, metadata: Record<string, any> = {}): Promise<boolean> {
  const entry: KnowledgeEntry = {
    id: `k_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    ts: new Date().toISOString(),
    content,
    embedding: getEmbedding(content),
    metadata,
  };

  if (supabaseEnabled) {
    try {
      const { error } = await supabase.from('knowledge_base').insert({
        content: entry.content,
        embedding: entry.embedding,
        metadata: entry.metadata,
      });
      if (error) {
        console.warn('[KNOWLEDGE] Supabase save failed, using local:', error.message);
      } else {
        return true;
      }
    } catch (err: any) {
      console.warn('[KNOWLEDGE] Supabase error:', err.message);
    }
  }

  // Local fallback
  const list = readJson<KnowledgeEntry[]>(LOCAL_FILE, []);
  list.push(entry);
  while (list.length > 1000) list.shift();
  writeJson(LOCAL_FILE, list);
  return true;
}

export async function searchKnowledge(query: string, topK = 5): Promise<{ content: string; score: number; metadata: any }[]> {
  const queryEmb = getEmbedding(query);

  if (supabaseEnabled) {
    try {
      const { data, error } = await supabase.rpc('match_knowledge', {
        query_embedding: queryEmb,
        match_count: topK,
      });
      if (!error && Array.isArray(data) && data.length > 0) {
        return data.map((d: any) => ({ content: d.content, score: d.similarity || 1, metadata: d.metadata || {} }));
      }
    } catch { /* fall through */ }
  }

  // Local cosine search
  const list = readJson<KnowledgeEntry[]>(LOCAL_FILE, []);
  return list
    .map(e => ({ content: e.content, score: cosine(queryEmb, e.embedding), metadata: e.metadata }))
    .filter(x => x.score > 0.05)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
