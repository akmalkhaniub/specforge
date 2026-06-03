/**
 * Zod schemas for Claude's structured extraction output, plus the JSON Schemas
 * handed to the Anthropic tool-use API. The Zod schema is the validation source
 * of truth; the JSON Schema mirrors it for the model. Keep them in sync.
 */
import { z } from 'zod';

/** Fibonacci story-point scale accepted from the model. */
export const STORY_POINTS = [1, 2, 3, 5, 8, 13] as const;

/** A single epic as extracted by Claude (pass 1). */
export const EpicExtractionSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  priority: z.enum(['high', 'medium', 'low']),
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1),
});
export type EpicExtraction = z.infer<typeof EpicExtractionSchema>;

/** A single user story as extracted by Claude (pass 2). */
export const StoryExtractionSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  persona: z.string().min(1),
  acceptance_criteria: z.array(z.string().min(1)),
  priority: z.enum(['high', 'medium', 'low']),
  story_points: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(5),
    z.literal(8),
    z.literal(13),
  ]),
  confidence: z.number().min(0).max(1),
});
export type StoryExtraction = z.infer<typeof StoryExtractionSchema>;

/** Pass 1 tool output: all epics plus document-level metadata. */
export const ExtractionResultSchema = z.object({
  epics: z.array(EpicExtractionSchema),
  document_type: z.string(),
  extraction_notes: z.string(),
});
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

/** Pass 2 tool output: stories for one epic. */
export const StoriesResultSchema = z.object({
  stories: z.array(StoryExtractionSchema),
});
export type StoriesResult = z.infer<typeof StoriesResultSchema>;

/** PRD summary produced by the chat `requirements_complete` tool. */
export const PRDSummarySchema = z.object({
  title: z.string().min(1),
  overview: z.string().min(1),
  stakeholders: z.array(z.string()),
  epics_outline: z.array(z.object({ title: z.string(), description: z.string() })),
});
export type PRDSummaryToolInput = z.infer<typeof PRDSummarySchema>;

// --- JSON Schemas for Anthropic tool definitions ---

/** Tool input schema for pass 1 (extract_epics). */
export const EXTRACT_EPICS_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    epics: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          priority: { type: 'string', enum: ['high', 'medium', 'low'] },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          rationale: { type: 'string', description: 'Why this was identified as an epic' },
        },
        required: ['title', 'description', 'priority', 'confidence', 'rationale'],
      },
    },
    document_type: { type: 'string' },
    extraction_notes: { type: 'string' },
  },
  required: ['epics', 'document_type', 'extraction_notes'],
} as const;

/** Tool input schema for pass 2 (extract_stories). */
export const EXTRACT_STORIES_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    stories: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: {
            type: 'string',
            description: 'As a [persona], I want [action], so that [benefit]',
          },
          persona: { type: 'string' },
          acceptance_criteria: {
            type: 'array',
            items: { type: 'string' },
            description: 'Each in Given/When/Then format',
          },
          priority: { type: 'string', enum: ['high', 'medium', 'low'] },
          story_points: { type: 'integer', enum: [1, 2, 3, 5, 8, 13] },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
        },
        required: [
          'title',
          'description',
          'persona',
          'acceptance_criteria',
          'priority',
          'story_points',
          'confidence',
        ],
      },
    },
  },
  required: ['stories'],
} as const;

/** Tool input schema for the chat `requirements_complete` tool. */
export const REQUIREMENTS_COMPLETE_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    overview: { type: 'string' },
    stakeholders: { type: 'array', items: { type: 'string' } },
    epics_outline: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
        },
        required: ['title', 'description'],
      },
    },
  },
  required: ['title', 'overview', 'stakeholders', 'epics_outline'],
} as const;
