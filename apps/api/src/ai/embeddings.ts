/**
 * OpenAI embeddings (text-embedding-3-small, 1536 dims).
 *
 * Gated by the EMBEDDINGS_ENABLED feature flag at the call sites that populate
 * the database; these functions themselves require a configured OpenAI key and
 * will throw via getOpenAI() if invoked without one.
 */
import { LLMError } from '../lib/errors.js';
import { log } from '../lib/logger.js';
import { EMBEDDINGS_MODEL, EMBEDDING_DIMENSIONS, getOpenAI } from './models.js';

const BATCH_SIZE = 100;
const BATCH_DELAY_MS = 100;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generates an embedding for a single piece of text.
 * @throws LLMError if the API call fails or returns an unexpected shape.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const [vector] = await generateBatchEmbeddings([text]);
  if (!vector) throw new LLMError('Embedding API returned no vector', { model: EMBEDDINGS_MODEL });
  return vector;
}

/**
 * Generates embeddings for many texts, batched in groups of 100 with a short
 * delay between batches to stay within rate limits. Order is preserved.
 * @throws LLMError if any batch fails or returns the wrong number of vectors.
 */
export async function generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const client = getOpenAI();
  const out: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const started = Date.now();
    try {
      const res = await client.embeddings.create({
        model: EMBEDDINGS_MODEL,
        input: batch,
        dimensions: EMBEDDING_DIMENSIONS,
      });
      if (res.data.length !== batch.length) {
        throw new LLMError('Embedding count mismatch', {
          expected: batch.length,
          received: res.data.length,
        });
      }
      for (const item of res.data) out.push(item.embedding);
      log.info('embeddings_batch', {
        model: EMBEDDINGS_MODEL,
        count: batch.length,
        latencyMs: Date.now() - started,
      });
    } catch (err) {
      if (err instanceof LLMError) throw err;
      throw new LLMError('Embedding API call failed', { model: EMBEDDINGS_MODEL }, { cause: err });
    }
    if (i + BATCH_SIZE < texts.length) await delay(BATCH_DELAY_MS);
  }

  return out;
}
