/**
 * Two-pass Claude extraction pipeline.
 *
 * Pass 1 extracts epics from the full document. Pass 2 extracts user stories
 * for each epic. The two-pass split is deliberate: extraction accuracy degrades
 * on deeply nested schemas in a single call (see ADR-003). Each pass forces a
 * tool call, validates the result with Zod, and retries once on failure.
 *
 * The system prompt is sent with cache_control so repeated calls (pass 2 runs
 * once per epic) read it from cache rather than re-billing full input price.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env.js';
import { LLMError, ValidationError } from '../lib/errors.js';
import { log } from '../lib/logger.js';
import { classifyDocument } from './classifier.js';
import { calculateCost } from './cost.js';
import { CLAUDE_MODEL, HAIKU_MODEL, getAnthropic } from './models.js';
import { EXTRACTION_SYSTEM_PROMPT } from './prompts.js';
import {
  EXTRACT_EPICS_INPUT_SCHEMA,
  EXTRACT_STORIES_INPUT_SCHEMA,
  ExtractionResultSchema,
  StoriesResultSchema,
  type EpicExtraction,
  type StoryExtraction,
} from './schemas.js';

const MAX_TOKENS = 8192;

/** An epic plus the stories extracted for it in pass 2. */
export type EpicWithStories = EpicExtraction & { stories: StoryExtraction[] };

/** Aggregate result of a full extraction run. */
export interface ExtractionRunResult {
  epics: EpicWithStories[];
  documentType: string;
  extractionNotes: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheWriteTokens: number;
  costUsd: number;
  model: string;
  validationRetries: number;
}

/** Parameters for {@link extractRequirements}. */
export interface ExtractParams {
  documentText: string;
  documentId: string;
  onProgress: (stage: string, percent: number, tokensUsed: number) => void;
}

interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

function readUsage(message: Anthropic.Message): Usage {
  return {
    input: message.usage.input_tokens,
    output: message.usage.output_tokens,
    cacheRead: message.usage.cache_read_input_tokens ?? 0,
    cacheWrite: message.usage.cache_creation_input_tokens ?? 0,
  };
}

/** Extracts the first tool_use block's input, or throws if none is present. */
function getToolInput(message: Anthropic.Message, toolName: string, model: string): unknown {
  const block = message.content.find((b) => b.type === 'tool_use');
  if (!block || block.type !== 'tool_use') {
    throw new LLMError('Claude returned no tool_use block', {
      model,
      tool: toolName,
      stopReason: message.stop_reason,
    });
  }
  return block.input;
}

/**
 * Calls Claude forcing a specific tool, validates the result with the given Zod
 * schema, and retries once (appending the validation errors) on failure.
 */
async function callTool<T>(args: {
  client: Anthropic;
  toolName: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON Schema literal
  inputSchema: any;
  parse: (input: unknown) => { success: true; data: T } | { success: false; error: string };
  userContent: Anthropic.ContentBlockParam[];
  pass: number;
  model: string;
}): Promise<{ data: T; usage: Usage; retried: boolean }> {
  const { client, toolName, inputSchema, parse, userContent, pass, model } = args;

  const system: Anthropic.TextBlockParam[] = [
    {
      type: 'text',
      text: EXTRACTION_SYSTEM_PROMPT.content,
      cache_control: { type: 'ephemeral' },
    },
  ];
  const tools: Anthropic.Tool[] = [
    { name: toolName, description: `Return structured data for ${toolName}`, input_schema: inputSchema },
  ];

  const started = Date.now();
  const first = await client.messages.create({
    model,
    max_tokens: MAX_TOKENS,
    system,
    tools,
    tool_choice: { type: 'tool', name: toolName },
    messages: [{ role: 'user', content: userContent }],
  });
  const firstUsage = readUsage(first);
  log.info('claude_call', {
    pass,
    tool: toolName,
    model,
    promptVersion: EXTRACTION_SYSTEM_PROMPT.version,
    inputTokens: firstUsage.input,
    outputTokens: firstUsage.output,
    cacheReadTokens: firstUsage.cacheRead,
    cacheWriteTokens: firstUsage.cacheWrite,
    latencyMs: Date.now() - started,
  });

  const firstParsed = parse(getToolInput(first, toolName, model));
  if (firstParsed.success) {
    return { data: firstParsed.data, usage: firstUsage, retried: false };
  }

  // Retry once with the validation errors appended.
  log.warn('claude_validation_retry', { pass, tool: toolName, error: firstParsed.error });
  const retryStarted = Date.now();
  const second = await client.messages.create({
    model,
    max_tokens: MAX_TOKENS,
    system,
    tools,
    tool_choice: { type: 'tool', name: toolName },
    messages: [
      { role: 'user', content: userContent },
      {
        role: 'user',
        content: `Your previous response failed schema validation:\n${firstParsed.error}\nReturn corrected data via the ${toolName} tool.`,
      },
    ],
  });
  const secondUsage = readUsage(second);
  log.info('claude_call', {
    pass,
    tool: toolName,
    model,
    promptVersion: EXTRACTION_SYSTEM_PROMPT.version,
    inputTokens: secondUsage.input,
    outputTokens: secondUsage.output,
    cacheReadTokens: secondUsage.cacheRead,
    cacheWriteTokens: secondUsage.cacheWrite,
    latencyMs: Date.now() - retryStarted,
    validationRetries: 1,
  });

  const secondParsed = parse(getToolInput(second, toolName, model));
  if (!secondParsed.success) {
    throw new ValidationError('Claude output failed validation after retry', {
      pass,
      tool: toolName,
      error: secondParsed.error,
    });
  }

  // Token usage from both attempts must be billed.
  const usage: Usage = {
    input: firstUsage.input + secondUsage.input,
    output: firstUsage.output + secondUsage.output,
    cacheRead: firstUsage.cacheRead + secondUsage.cacheRead,
    cacheWrite: firstUsage.cacheWrite + secondUsage.cacheWrite,
  };
  return { data: secondParsed.data, usage, retried: true };
}

/**
 * Runs the full two-pass extraction.
 * @throws LLMError if Claude returns no tool_use block.
 * @throws ValidationError if output fails Zod validation after one retry.
 */
export async function extractRequirements(params: ExtractParams): Promise<ExtractionRunResult> {
  const { documentText, documentId, onProgress } = params;
  const client = getAnthropic();

  // Model routing: classify cheaply with Haiku and send simple documents to
  // Haiku for extraction; complex ones use Sonnet. Off by default (flagged).
  let extractionModel = CLAUDE_MODEL;
  let classifyCostUsd = 0;
  if (env.MODEL_ROUTING_ENABLED) {
    const classification = await classifyDocument(documentText);
    classifyCostUsd = classification.costUsd;
    extractionModel = classification.complexity === 'simple' ? HAIKU_MODEL : CLAUDE_MODEL;
    log.info('model_routed', {
      documentId,
      complexity: classification.complexity,
      documentType: classification.documentType,
      extractionModel,
    });
  }

  // The document is the bulk of every call's input and is identical across all
  // calls, so mark it as a cache breakpoint. Pass 1 writes the cache; pass 2
  // (one call per epic) reads it, cutting input cost ~10x on the cached portion.
  // Caching only applies above the model's minimum cacheable prefix (~1024
  // tokens), so it kicks in for real documents, not tiny samples.
  const docBlock: Anthropic.TextBlockParam = {
    type: 'text',
    text: `Document:\n\n${documentText}`,
    cache_control: { type: 'ephemeral' },
  };

  const totals: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  let validationRetries = 0;
  const accumulate = (u: Usage): void => {
    totals.input += u.input;
    totals.output += u.output;
    totals.cacheRead += u.cacheRead;
    totals.cacheWrite += u.cacheWrite;
  };
  const tokensSoFar = (): number => totals.input + totals.output;

  // --- PASS 1: epics ---
  onProgress('extracting_epics', 25, tokensSoFar());
  const pass1 = await callTool({
    client,
    toolName: 'extract_epics',
    inputSchema: EXTRACT_EPICS_INPUT_SCHEMA,
    parse: (input) => {
      const r = ExtractionResultSchema.safeParse(input);
      return r.success ? { success: true, data: r.data } : { success: false, error: r.error.toString() };
    },
    userContent: [docBlock, { type: 'text', text: 'Extract all epics from the document above.' }],
    pass: 1,
    model: extractionModel,
  });
  accumulate(pass1.usage);
  if (pass1.retried) validationRetries += 1;
  log.info('extraction_pass1_done', { documentId, epicCount: pass1.data.epics.length });

  // --- PASS 2: stories per epic ---
  const epics: EpicWithStories[] = [];
  const epicList = pass1.data.epics;
  for (let i = 0; i < epicList.length; i++) {
    const epic = epicList[i];
    if (!epic) continue;
    const result = await callTool({
      client,
      toolName: 'extract_stories',
      inputSchema: EXTRACT_STORIES_INPUT_SCHEMA,
      parse: (input) => {
        const r = StoriesResultSchema.safeParse(input);
        return r.success ? { success: true, data: r.data } : { success: false, error: r.error.toString() };
      },
      userContent: [
        docBlock,
        {
          type: 'text',
          text: `Extract user stories for this epic from the document above:\nEpic: ${epic.title}\n${epic.description}`,
        },
      ],
      pass: 2,
      model: extractionModel,
    });
    accumulate(result.usage);
    if (result.retried) validationRetries += 1;

    epics.push({ ...epic, stories: result.data.stories });

    // Spread pass-2 progress from 30% to 80% across the epics.
    const percent = 30 + Math.round(((i + 1) / epicList.length) * 50);
    onProgress('extracting_stories', percent, tokensSoFar());
  }

  const costUsd =
    classifyCostUsd +
    calculateCost({
      inputTokens: totals.input,
      outputTokens: totals.output,
      cacheReadTokens: totals.cacheRead,
      cacheWriteTokens: totals.cacheWrite,
      model: extractionModel,
    });

  log.info('extraction_complete', {
    documentId,
    epicCount: epics.length,
    storyCount: epics.reduce((n, e) => n + e.stories.length, 0),
    inputTokens: totals.input,
    outputTokens: totals.output,
    cacheReadTokens: totals.cacheRead,
    costUsd,
    validationRetries,
  });

  return {
    epics,
    documentType: pass1.data.document_type,
    extractionNotes: pass1.data.extraction_notes,
    totalInputTokens: totals.input,
    totalOutputTokens: totals.output,
    totalCacheReadTokens: totals.cacheRead,
    totalCacheWriteTokens: totals.cacheWrite,
    costUsd,
    model: extractionModel,
    validationRetries,
  };
}
