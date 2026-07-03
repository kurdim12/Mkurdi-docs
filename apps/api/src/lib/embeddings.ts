import type { Env } from '../types';
import { normalizeArabic } from './chunker';

// LOCKED: @cf/baai/bge-m3, 1024 dims, cosine. Changing this means re-embedding everything.
const EMBED_MODEL = '@cf/baai/bge-m3';
const BATCH_SIZE = 20;

interface EmbeddingOutput {
  data?: number[][];
  embeddings?: number[][];
}

async function runEmbedding(env: Env, texts: string[]): Promise<number[][]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = (await env.AI.run(EMBED_MODEL as any, { text: texts })) as EmbeddingOutput;
  const vectors = res.data ?? res.embeddings;
  if (!vectors || vectors.length !== texts.length) {
    throw new Error(
      `Embedding failure: expected ${texts.length} vectors, got ${vectors?.length ?? 0}`
    );
  }
  return vectors;
}

/** Embed chunk texts (normalized Arabic for embedding input only), batches of 20. */
export async function embedChunks(env: Env, texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE).map(normalizeArabic);
    out.push(...(await runEmbedding(env, batch)));
  }
  return out;
}

export async function embedQuery(env: Env, q: string): Promise<number[]> {
  const [v] = await runEmbedding(env, [normalizeArabic(q)]);
  if (!v) throw new Error('Embedding failure: empty query vector');
  return v;
}
