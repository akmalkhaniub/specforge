/**
 * Lightweight document classifier used for model routing. Runs on Haiku (cheap)
 * to decide whether a document is simple enough to extract with Haiku or needs
 * Sonnet. Only the first slice of the document is sent — classification doesn't
 * need the whole text.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { LLMError } from '../lib/errors.js';
import { log } from '../lib/logger.js';
import { calculateCost } from './cost.js';
import { getAnthropic, HAIKU_MODEL } from './models.js';

const CLASSIFY_SAMPLE_CHARS = 6000;

/** Classification result plus the cost of producing it. */
export interface Classification {
  complexity: 'simple' | 'complex';
  documentType: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
}

const CLASSIFY_TOOL_SCHEMA = {
  type: 'object',
  properties: {
    complexity: {
      type: 'string',
      enum: ['simple', 'complex'],
      description:
        'simple: short/clear/single-domain requirements. complex: long, ambiguous, multi-domain, or heavily technical.',
    },
    document_type: { type: 'string', description: 'e.g. BRD, PRD, RFP, meeting notes, user manual' },
  },
  required: ['complexity', 'document_type'],
} as const;

/**
 * Classifies a document's complexity and type using Haiku.
 * @throws LLMError if Claude returns no tool_use block.
 */
export async function classifyDocument(documentText: string): Promise<Classification> {
  const client = getAnthropic();
  const sample = documentText.slice(0, CLASSIFY_SAMPLE_CHARS);
  const started = Date.now();

  const message = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 256,
    tools: [
      {
        name: 'classify',
        description: 'Classify the document',
        input_schema: CLASSIFY_TOOL_SCHEMA as unknown as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: 'tool', name: 'classify' },
    messages: [{ role: 'user', content: `Classify this document:\n\n${sample}` }],
  });

  const block = message.content.find((b) => b.type === 'tool_use');
  if (!block || block.type !== 'tool_use') {
    throw new LLMError('Classifier returned no tool_use block', { model: HAIKU_MODEL });
  }
  const input = block.input as { complexity?: string; document_type?: string };
  const complexity = input.complexity === 'complex' ? 'complex' : 'simple';

  const costUsd = calculateCost({
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
    cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
    model: HAIKU_MODEL,
  });

  log.info('document_classified', {
    model: HAIKU_MODEL,
    complexity,
    documentType: input.document_type ?? 'unknown',
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
    latencyMs: Date.now() - started,
    costUsd,
  });

  return {
    complexity,
    documentType: input.document_type ?? 'unknown',
    costUsd,
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  };
}
