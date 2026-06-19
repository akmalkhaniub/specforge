/**
 * Pinned model versions and the Anthropic/OpenAI client singletons.
 *
 * Model versions are PINNED, never aliases. Changing either requires running
 * the eval set and recording the new version in DECISIONS.md (see project docs).
 */
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { env } from '../config/env.js';
import { LLMError } from '../lib/errors.js';

/** Pinned Claude model (Sonnet) for complex extraction and chat. */
export const CLAUDE_MODEL = 'claude-sonnet-4-5-20250929';

/** Pinned Haiku model — cheap classification and simple-document extraction. */
export const HAIKU_MODEL = 'claude-haiku-4-5-20251001';

/** Pinned OpenAI embeddings model (1536 dimensions). */
export const EMBEDDINGS_MODEL = 'text-embedding-3-small';

/** Embedding dimensionality — must match the vector(1536) DB columns. */
export const EMBEDDING_DIMENSIONS = 1536;

let anthropicClient: Anthropic | undefined;
let openaiClient: OpenAI | undefined;

/**
 * Returns the Anthropic client, constructing it on first use.
 * @throws LLMError if ANTHROPIC_API_KEY is not configured.
 */
export function getAnthropic(): Anthropic {
  if (!anthropicClient) {
    if (!env.ANTHROPIC_API_KEY) {
      throw new LLMError('ANTHROPIC_API_KEY is not configured', {});
    }
    anthropicClient = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }
  return anthropicClient;
}

/**
 * Returns the OpenAI client (embeddings only), constructing it on first use.
 * @throws LLMError if OPENAI_API_KEY is not configured.
 */
export function getOpenAI(): OpenAI {
  if (!openaiClient) {
    if (!env.OPENAI_API_KEY) {
      throw new LLMError('OPENAI_API_KEY is not configured', {});
    }
    openaiClient = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }
  return openaiClient;
}
