import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LLMError, ValidationError } from '../src/lib/errors.js';
import { CLAUDE_MODEL } from '../src/ai/models.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const multiPageFixture = JSON.parse(
  readFileSync(resolve(__dirname, 'fixtures/multi-page-spec.json'), 'utf-8'),
) as {
  documentText: string;
  pass1: Record<string, unknown>;
  pass2ByEpicTitle: Record<string, Record<string, unknown>>;
};

const malformedFixture = JSON.parse(
  readFileSync(resolve(__dirname, 'fixtures/malformed-and-edge.json'), 'utf-8'),
) as {
  malformedPass1: Record<string, unknown>;
  repairedPass1: Record<string, unknown>;
  malformedStories: Record<string, unknown>;
  edgeCaseStories: Record<string, unknown>;
};

const createMock = vi.fn();

vi.mock('../src/ai/models.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/ai/models.js')>();
  return {
    ...actual,
    getAnthropic: () => ({
      messages: {
        create: createMock,
      },
    }),
  };
});

const { extractRequirements } = await import('../src/ai/extractor.js');

function toolUseResponse(
  toolName: string,
  input: unknown,
  usage = {
    input_tokens: 1000,
    output_tokens: 250,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  },
) {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: CLAUDE_MODEL,
    stop_reason: 'tool_use',
    content: [
      {
        type: 'tool_use',
        id: 'toolu_1',
        name: toolName,
        input,
      },
    ],
    usage,
  };
}

describe('extractRequirements (offline fixture suite)', () => {
  beforeEach(() => {
    createMock.mockReset();
  });

  it('extracts multi-page specs across Pass 1 and Pass 2 with cache & cost tracking', async () => {
    createMock
      .mockResolvedValueOnce(
        toolUseResponse('extract_epics', multiPageFixture.pass1, {
          input_tokens: 2000,
          output_tokens: 400,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 1500,
        }),
      )
      .mockResolvedValueOnce(
        toolUseResponse(
          'extract_stories',
          multiPageFixture.pass2ByEpicTitle['Tokenized Payment Checkout'],
          {
            input_tokens: 500,
            output_tokens: 300,
            cache_read_input_tokens: 1500,
            cache_creation_input_tokens: 0,
          },
        ),
      )
      .mockResolvedValueOnce(
        toolUseResponse(
          'extract_stories',
          multiPageFixture.pass2ByEpicTitle['Immutable Compliance Ledger'],
          {
            input_tokens: 500,
            output_tokens: 250,
            cache_read_input_tokens: 1500,
            cache_creation_input_tokens: 0,
          },
        ),
      );

    const progressUpdates: Array<{ stage: string; percent: number }> = [];
    const result = await extractRequirements({
      documentText: multiPageFixture.documentText,
      documentId: 'doc-multipage-1',
      onProgress: (stage, percent) => {
        progressUpdates.push({ stage, percent });
      },
    });

    expect(createMock).toHaveBeenCalledTimes(3);
    expect(result.documentType).toBe('PRD');
    expect(result.epics).toHaveLength(2);
    expect(result.epics[0]?.stories).toHaveLength(1);
    expect(result.epics[1]?.stories).toHaveLength(1);
    expect(result.validationRetries).toBe(0);
    expect(result.totalInputTokens).toBe(3000);
    expect(result.totalOutputTokens).toBe(950);
    expect(result.totalCacheReadTokens).toBe(3000);
    expect(result.totalCacheWriteTokens).toBe(1500);
    expect(result.costUsd).toBeGreaterThan(0);
    expect(progressUpdates.map((p) => p.percent)).toEqual([25, 55, 80]);
  });

  it('retries once on malformed Zod output and bills both attempts', async () => {
    createMock
      // Pass 1 attempt 1: invalid schema
      .mockResolvedValueOnce(
        toolUseResponse('extract_epics', malformedFixture.malformedPass1, {
          input_tokens: 1000,
          output_tokens: 100,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        }),
      )
      // Pass 1 attempt 2: repaired
      .mockResolvedValueOnce(
        toolUseResponse('extract_epics', malformedFixture.repairedPass1, {
          input_tokens: 1200,
          output_tokens: 150,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        }),
      )
      // Pass 2: edge-case story with empty acceptance criteria array
      .mockResolvedValueOnce(
        toolUseResponse('extract_stories', malformedFixture.edgeCaseStories, {
          input_tokens: 800,
          output_tokens: 200,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        }),
      );

    const result = await extractRequirements({
      documentText: 'Retry edge-case PRD text.',
      documentId: 'doc-retry-1',
      onProgress: () => {},
    });

    expect(createMock).toHaveBeenCalledTimes(3);
    expect(result.validationRetries).toBe(1);
    expect(result.epics).toHaveLength(1);
    expect(result.epics[0]?.title).toBe('Resilient Webhook Delivery');
    expect(result.epics[0]?.stories[0]?.acceptance_criteria).toEqual([]);
    expect(result.totalInputTokens).toBe(3000);
    expect(result.totalOutputTokens).toBe(450);
  });

  it('throws ValidationError when Pass 2 output still fails Zod after retry', async () => {
    createMock
      .mockResolvedValueOnce(toolUseResponse('extract_epics', malformedFixture.repairedPass1))
      .mockResolvedValueOnce(toolUseResponse('extract_stories', malformedFixture.malformedStories))
      .mockResolvedValueOnce(toolUseResponse('extract_stories', malformedFixture.malformedStories));

    await expect(
      extractRequirements({
        documentText: 'Bad story points test.',
        documentId: 'doc-fail-val',
        onProgress: () => {},
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws LLMError when Claude returns no tool_use block', async () => {
    createMock.mockResolvedValueOnce({
      id: 'msg_no_tool',
      type: 'message',
      role: 'assistant',
      model: CLAUDE_MODEL,
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'I cannot extract that.' }],
      usage: { input_tokens: 100, output_tokens: 20 },
    });

    await expect(
      extractRequirements({
        documentText: 'No tool block test.',
        documentId: 'doc-no-tool',
        onProgress: () => {},
      }),
    ).rejects.toBeInstanceOf(LLMError);
  });
});
