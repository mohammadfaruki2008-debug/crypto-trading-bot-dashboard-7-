/**
 * Knowledge engine — embeddings + vector search via Supabase pgvector.
 * Uses a lightweight hash-based embedding if HF_TOKEN not set.
 */
import { supabase } from './supabaseClient';

const HF_TOKEN = process.env.HF_TOKEN || '';

/** Generate embedding for text — uses Hugging Face if HF_TOKEN set, else local hash. */
export async function getEmbedding(text: string): Promise<number[]> {
  if (HF_TOKEN) {
    try {
      const res = await fetch('https://api-inference.huggingface.co/pipeline/feature-extraction/sentence-transformers/all-MiniLM-L6-v2', {
        method: 'POST',
        headers: { Authorization: `Bearer ${HF_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs: text }),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) return data as number[];
      }
    } catch { /* fall through */ }
  }
  // Local fallback: 384-dim hash-based embedding (matches MiniLM dim)
  const dim = 384;
  const v = new Array(dim).fill(0);
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2);
  for (const w of words) {
    let h = 0;
    for (let i = 0; i < w.length; i++) h = (h * 31 + w.charCodeAt(i)) >>> 0;
    v[h % dim] += 1;
  }
  const norm = Math.sqrt(v.reduce((a, b) => a + b * b, 0)) || 1;
  return v.map(x => x / norm);
}

/** Search the knowledge_base table for similar past decisions. */
export async function searchKnowledge(embedding: number[], topK = 5): Promise<any[]> {
  try {
    const { data, error } = await supabase.rpc('match_knowledge', {
      query_embedding: embedding,
      match_count: topK,
    });
    if (error) {
      console.warn('[KNOWLEDGE] RPC error (create the match_knowledge function in Supabase):', error.message);
      return [];
    }
    return data || [];
  } catch (err: any) {
    console.warn('[KNOWLEDGE] Search failed:', err.message);
    return [];
  }
}

/** Save a new entry to the knowledge base. */
export async function saveKnowledge(content: string, metadata: Record<string, any> = {}): Promise<boolean> {
  try {
    const embedding = await getEmbedding(content);
    const { error } = await supabase.from('knowledge_base').insert({ content, embedding, metadata });
    if (error) console.warn('[KNOWLEDGE] Save error:', error.message);
    return !error;
  } catch {
    return false;
  }
}
