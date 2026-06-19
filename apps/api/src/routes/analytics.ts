/**
 * Analytics routes for the token-economics dashboard. All queries are scoped to
 * an org via the projects join. Numeric aggregates are cast to ::float so they
 * arrive as JS numbers, not strings.
 */
import { zValidator } from '@hono/zod-validator';
import type {
  AnalyticsOverview,
  CostEstimate,
  CostTierName,
  ExtractionAnalyticsRow,
  ModelUsage,
  TokenUsageByDay,
} from '@specforge/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import { sql } from '../db/client.js';
import { getAuth } from '../middleware/auth.js';

export const analytics = new Hono();

/** Heuristics for the cost estimator. */
const AVG_CHARS_PER_PAGE = 3000;
const AVG_TOKENS_PER_CHAR = 0.25;
/** Structured extraction output is roughly a quarter of input volume. */
const OUTPUT_TO_INPUT_RATIO = 0.25;

/** Per-tier pricing, USD per million tokens. */
const TIER_PRICING: Record<CostTierName, { input: number; output: number }> = {
  haiku: { input: 0.8, output: 4 },
  sonnet: { input: 3, output: 15 },
  opus: { input: 15, output: 75 },
};

// GET /api/analytics/overview
analytics.get('/overview', async (c) => {
    const { orgId } = getAuth(c);
    const [row] = await sql<AnalyticsOverview[]>`
      WITH jobs AS (
        SELECT ej.*
        FROM extraction_jobs ej
        JOIN documents d ON ej.document_id = d.id
        JOIN projects p ON d.project_id = p.id
        WHERE p.org_id = ${orgId}
      )
      SELECT
        (SELECT COUNT(*)::int FROM jobs) AS total_documents,
        COALESCE((SELECT SUM(cost_usd) FROM jobs), 0)::float AS total_cost_usd,
        COALESCE((SELECT AVG(cost_usd) FROM jobs WHERE status = 'complete'), 0)::float AS avg_cost_per_document,
        COALESCE((SELECT COUNT(*) FROM epics e JOIN projects p ON e.project_id = p.id
                  WHERE p.org_id = ${orgId} AND e.deleted_at IS NULL), 0)::int AS total_epics,
        COALESCE((SELECT COUNT(*) FROM stories s JOIN epics e ON s.epic_id = e.id
                  JOIN projects p ON e.project_id = p.id
                  WHERE p.org_id = ${orgId} AND s.deleted_at IS NULL), 0)::int AS total_stories,
        COALESCE((SELECT AVG(latency_ms) FROM jobs WHERE latency_ms IS NOT NULL), 0)::float / 1000 AS avg_extraction_time_seconds,
        COALESCE(
          (SELECT SUM(cache_read_tokens)::float / NULLIF(SUM(prompt_tokens), 0) * 100 FROM jobs),
          0
        )::float AS cache_hit_rate
    `;
    return c.json(row);
  },
);

// GET /api/analytics/timeline?days=30
analytics.get(
  '/timeline',
  zValidator('query', z.object({ days: z.coerce.number().int().positive().max(365).default(30) })),
  async (c) => {
    const { days } = c.req.valid('query');
    const { orgId } = getAuth(c);
    const rows = await sql<TokenUsageByDay[]>`
      SELECT
        to_char(date_trunc('day', ej.created_at), 'YYYY-MM-DD') AS date,
        COUNT(*)::int AS documents_processed,
        COALESCE(SUM(ej.cost_usd), 0)::float AS cost_usd,
        COALESCE(AVG(ej.prompt_tokens + ej.completion_tokens), 0)::float AS avg_tokens
      FROM extraction_jobs ej
      JOIN documents d ON ej.document_id = d.id
      JOIN projects p ON d.project_id = p.id
      WHERE p.org_id = ${orgId}
        AND ej.created_at >= now() - (${days} || ' days')::interval
      GROUP BY 1
      ORDER BY 1 ASC
    `;
    return c.json(rows);
  },
);

// GET /api/analytics/by_model
analytics.get('/by_model', async (c) => {
    const { orgId } = getAuth(c);
    const rows = await sql<ModelUsage[]>`
      SELECT
        COALESCE(ej.model, 'unknown') AS model,
        COUNT(*)::int AS total_calls,
        COALESCE(SUM(ej.prompt_tokens + ej.completion_tokens), 0)::int AS total_tokens,
        COALESCE(SUM(ej.cost_usd), 0)::float AS total_cost_usd,
        COALESCE(AVG(ej.latency_ms), 0)::float AS avg_latency_ms
      FROM extraction_jobs ej
      JOIN documents d ON ej.document_id = d.id
      JOIN projects p ON d.project_id = p.id
      WHERE p.org_id = ${orgId} AND ej.model IS NOT NULL
      GROUP BY ej.model
      ORDER BY total_cost_usd DESC
    `;
    return c.json(rows);
  },
);

// POST /api/analytics/cost-estimate
analytics.post(
  '/cost-estimate',
  zValidator(
    'json',
    z.object({
      docsPerMonth: z.number().int().positive().max(1_000_000),
      avgPagesPerDoc: z.number().positive().max(1000),
    }),
  ),
  (c) => {
    const { docsPerMonth, avgPagesPerDoc } = c.req.valid('json');
    const estimatedInputTokens = Math.round(
      docsPerMonth * avgPagesPerDoc * AVG_CHARS_PER_PAGE * AVG_TOKENS_PER_CHAR,
    );
    const estimatedOutputTokens = Math.round(estimatedInputTokens * OUTPUT_TO_INPUT_RATIO);

    const tiers = (Object.keys(TIER_PRICING) as CostTierName[]).map((tier) => {
      const price = TIER_PRICING[tier];
      const inputCostUsd = (estimatedInputTokens / 1_000_000) * price.input;
      const outputCostUsd = (estimatedOutputTokens / 1_000_000) * price.output;
      return { tier, inputCostUsd, outputCostUsd, monthlyCostUsd: inputCostUsd + outputCostUsd };
    });

    // Sonnet is the project's primary/recommended model.
    const estimate: CostEstimate = {
      docsPerMonth,
      avgPagesPerDoc,
      estimatedInputTokens,
      estimatedOutputTokens,
      tiers,
      recommended: 'sonnet',
    };
    return c.json(estimate);
  },
);

// GET /api/analytics/jobs?orgId=&limit=20  — recent extraction jobs
analytics.get(
  '/jobs',
  zValidator('query', z.object({ limit: z.coerce.number().int().positive().max(100).default(20) })),
  async (c) => {
    const { limit } = c.req.valid('query');
    const { orgId } = getAuth(c);
    const rows = await sql<ExtractionAnalyticsRow[]>`
      SELECT id, document_id, status, model,
             prompt_tokens, completion_tokens, cache_read_tokens, cache_write_tokens,
             cost_usd::float AS cost_usd, latency_ms, error, created_at, completed_at,
             filename, mime_type, size_bytes, project_id, project_name, org_id,
             epic_count::int AS epic_count, story_count::int AS story_count
      FROM extraction_analytics
      WHERE org_id = ${orgId}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    return c.json(rows);
  },
);
