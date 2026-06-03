/**
 * Streaming conversational requirements gathering.
 *
 * Streams Claude's reply token-by-token via onChunk. Exposes a
 * `requirements_complete` tool; if Claude calls it, the parsed PRD summary is
 * passed to onComplete so the caller can create a project + enqueue extraction.
 */
import type Anthropic from '@anthropic-ai/sdk';
import type { ChatMessage, PRDSummary } from '@specforge/shared';
import { ValidationError } from '../lib/errors.js';
import { log } from '../lib/logger.js';
import { calculateCost } from './cost.js';
import { CLAUDE_MODEL, getAnthropic } from './models.js';
import { CHAT_SYSTEM_PROMPT } from './prompts.js';
import { PRDSummarySchema, REQUIREMENTS_COMPLETE_INPUT_SCHEMA } from './schemas.js';

const MAX_TOKENS = 2048;

/** Parameters for {@link streamChat}. */
export interface StreamChatParams {
  messages: ChatMessage[];
  onChunk: (text: string) => void;
  onComplete: (message: string, requirementsComplete?: PRDSummary) => void;
}

/** Maps the snake_case tool input to the camelCase shared PRDSummary type. */
function toPRDSummary(input: unknown): PRDSummary {
  const parsed = PRDSummarySchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError('requirements_complete tool input invalid', {
      error: parsed.error.toString(),
    });
  }
  return {
    title: parsed.data.title,
    overview: parsed.data.overview,
    stakeholders: parsed.data.stakeholders,
    epicsOutline: parsed.data.epics_outline,
  };
}

/**
 * Runs one streamed assistant turn.
 * @throws LLMError if the Anthropic key is missing (via getAnthropic()).
 */
export async function streamChat(params: StreamChatParams): Promise<void> {
  const { messages, onChunk, onComplete } = params;
  const client = getAnthropic();
  const started = Date.now();

  const tools: Anthropic.Tool[] = [
    {
      name: 'requirements_complete',
      description:
        'Call when enough information has been gathered to summarise the project as a PRD.',
      input_schema: REQUIREMENTS_COMPLETE_INPUT_SCHEMA as unknown as Anthropic.Tool.InputSchema,
    },
  ];

  const stream = client.messages.stream({
    model: CLAUDE_MODEL,
    max_tokens: MAX_TOKENS,
    system: [
      { type: 'text', text: CHAT_SYSTEM_PROMPT.content, cache_control: { type: 'ephemeral' } },
    ],
    tools,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });

  stream.on('text', (text) => onChunk(text));

  const final = await stream.finalMessage();

  let assistantText = '';
  let prd: PRDSummary | undefined;
  for (const block of final.content) {
    if (block.type === 'text') assistantText += block.text;
    if (block.type === 'tool_use' && block.name === 'requirements_complete') {
      prd = toPRDSummary(block.input);
    }
  }

  const usage = {
    inputTokens: final.usage.input_tokens,
    outputTokens: final.usage.output_tokens,
    cacheReadTokens: final.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: final.usage.cache_creation_input_tokens ?? 0,
    model: CLAUDE_MODEL,
  };
  log.info('chat_call', {
    model: CLAUDE_MODEL,
    promptVersion: CHAT_SYSTEM_PROMPT.version,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheReadTokens: usage.cacheReadTokens,
    latencyMs: Date.now() - started,
    costUsd: calculateCost(usage),
    requirementsComplete: prd !== undefined,
  });

  onComplete(assistantText, prd);
}
