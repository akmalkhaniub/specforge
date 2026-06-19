/**
 * Retrieval-augmented answering over a project's extracted requirements.
 *
 * Retrieval (pgvector) happens in the route; this module takes the retrieved
 * context chunks and streams a grounded, cited answer from Claude. The model is
 * instructed to answer ONLY from the supplied context to avoid hallucination.
 */
import { log } from '../lib/logger.js';
import { calculateCost } from './cost.js';
import { CLAUDE_MODEL, getAnthropic } from './models.js';

/** A retrieved context chunk passed to the model. */
export interface RagContext {
  sourceType: string;
  sourceId: string;
  content: string;
}

/** Parameters for {@link streamAnswer}. */
export interface StreamAnswerParams {
  question: string;
  context: RagContext[];
  onChunk: (text: string) => void;
}

const RAG_SYSTEM_PROMPT = {
  version: 'rag-v1.0.0',
  content: `You answer questions about a software project's extracted requirements.
Use ONLY the numbered context items provided. Cite the items you use with their
number in square brackets, e.g. [1], [2]. If the answer is not in the context,
say "I couldn't find that in this project's requirements." Be concise.`,
} as const;

/** Streams a grounded answer; returns token usage and the answer text. */
export async function streamAnswer(
  params: StreamAnswerParams,
): Promise<{ answer: string; costUsd: number }> {
  const { question, context, onChunk } = params;
  const client = getAnthropic();
  const started = Date.now();

  const contextBlock = context
    .map((c, i) => `[${i + 1}] (${c.sourceType}) ${c.content}`)
    .join('\n\n');
  const userMessage = `Context:\n${contextBlock}\n\nQuestion: ${question}`;

  const stream = client.messages.stream({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    system: [{ type: 'text', text: RAG_SYSTEM_PROMPT.content, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userMessage }],
  });
  stream.on('text', (t) => onChunk(t));
  const final = await stream.finalMessage();

  let answer = '';
  for (const block of final.content) if (block.type === 'text') answer += block.text;

  const costUsd = calculateCost({
    inputTokens: final.usage.input_tokens,
    outputTokens: final.usage.output_tokens,
    cacheReadTokens: final.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: final.usage.cache_creation_input_tokens ?? 0,
    model: CLAUDE_MODEL,
  });
  log.info('rag_answer', {
    model: CLAUDE_MODEL,
    promptVersion: RAG_SYSTEM_PROMPT.version,
    contextItems: context.length,
    inputTokens: final.usage.input_tokens,
    outputTokens: final.usage.output_tokens,
    latencyMs: Date.now() - started,
    costUsd,
  });
  return { answer, costUsd };
}
