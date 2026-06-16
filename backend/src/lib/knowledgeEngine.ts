/**
 * Knowledge base — Supabase pgvector if available, local JSON otherwise.
 */
import { supabase, supabaseEnabled } from './supabaseClient';
import { readJson, writeJson } from './storage';

interface Entry { id: string; ts: string; content: string; embedding: number[]; metadata: Record<string, any>; }
const FILE = 'knowledge.json';

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

export async function saveKnowledge(content: string, metadata: Record<string, any> = {}): Promise<void> {
  const entry: Entry = {
    id: `k_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    ts: new Date().toISOString(), content,
    embedding: getEmbedding(content), metadata,
  };
  if (supabaseEnabled) {
    try {
      const { error } = await supabase.from('knowledge_base').insert({ content, embedding: entry.embedding, metadata });
      if (!error) return;
    } catch { /* fall through */ }
  }
  const list = readJson<Entry[]>(FILE, []);
  list.push(entry);
  while (list.length > 1000) list.shift();
  writeJson(FILE, list);
}

export async function searchKnowledge(query: string, topK = 5): Promise<{ content: string; score: number }[]> {
  const qv = getEmbedding(query);
  if (supabaseEnabled) {
    try {
      const { data, error } = await supabase.rpc('match_knowledge', { query_embedding: qv, match_count: topK });
      if (!error && Array.isArray(data) && data.length > 0) {
        return data.map((d: any) => ({ content: d.content, score: d.similarity || 1 }));
      }
    } catch { /* fall through */ }
  }
  const list = readJson<Entry[]>(FILE, []);
  return list
    .map(e => ({ content: e.content, score: cosine(qv, e.embedding) }))
    .filter(x => x.score > 0.05)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
