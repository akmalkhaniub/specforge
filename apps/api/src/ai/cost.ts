/**
 * Token cost calculator for Claude API usage.
 *
 * Prices are per million tokens (MTok) for the pinned Sonnet model. Update
 * these together with CLAUDE_MODEL and record the change in DECISIONS.md.
 */

/** Sonnet 4.5 pricing, USD per million tokens. */
const PRICING = {
  inputPerMTok: 3.0,
  outputPerMTok: 15.0,
  cacheReadPerMTok: 0.3,
  cacheWritePerMTok: 3.75,
} as const;

const ONE_MILLION = 1_000_000;

/** Token usage for a single (or accumulated) Claude call. */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  model: string;
}

/**
 * Computes the USD cost of a Claude call from its token usage.
 * Note: pricing currently assumes the pinned Sonnet model regardless of the
 * `model` field; extend with a per-model table if other models are introduced.
 * @returns Cost in USD (not rounded — round at display time).
 */
export function calculateCost(usage: TokenUsage): number {
  return (
    (usage.inputTokens / ONE_MILLION) * PRICING.inputPerMTok +
    (usage.outputTokens / ONE_MILLION) * PRICING.outputPerMTok +
    (usage.cacheReadTokens / ONE_MILLION) * PRICING.cacheReadPerMTok +
    (usage.cacheWriteTokens / ONE_MILLION) * PRICING.cacheWritePerMTok
  );
}
