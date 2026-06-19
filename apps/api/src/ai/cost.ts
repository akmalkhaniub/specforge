/**
 * Token cost calculator for Claude API usage.
 *
 * Prices are per million tokens (MTok). With model routing we may bill Haiku,
 * Sonnet, or Opus, so cost is looked up per model (matched by family in the
 * model id). Cache read ≈ 0.1× input, cache write ≈ 1.25× input.
 */

interface ModelPricing {
  inputPerMTok: number;
  outputPerMTok: number;
  cacheReadPerMTok: number;
  cacheWritePerMTok: number;
}

/** Per-family pricing, USD per million tokens. */
const PRICING: Record<'haiku' | 'sonnet' | 'opus', ModelPricing> = {
  haiku: { inputPerMTok: 1.0, outputPerMTok: 5.0, cacheReadPerMTok: 0.1, cacheWritePerMTok: 1.25 },
  sonnet: { inputPerMTok: 3.0, outputPerMTok: 15.0, cacheReadPerMTok: 0.3, cacheWritePerMTok: 3.75 },
  opus: { inputPerMTok: 15.0, outputPerMTok: 75.0, cacheReadPerMTok: 1.5, cacheWritePerMTok: 18.75 },
};

const ONE_MILLION = 1_000_000;

/** Resolves the pricing family from a model id; defaults to Sonnet. */
function pricingFor(model: string): ModelPricing {
  if (model.includes('haiku')) return PRICING.haiku;
  if (model.includes('opus')) return PRICING.opus;
  return PRICING.sonnet;
}

/** Token usage for a single (or accumulated) Claude call. */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  model: string;
}

/**
 * Computes the USD cost of a Claude call from its token usage and model.
 * @returns Cost in USD (not rounded — round at display time).
 */
export function calculateCost(usage: TokenUsage): number {
  const p = pricingFor(usage.model);
  return (
    (usage.inputTokens / ONE_MILLION) * p.inputPerMTok +
    (usage.outputTokens / ONE_MILLION) * p.outputPerMTok +
    (usage.cacheReadTokens / ONE_MILLION) * p.cacheReadPerMTok +
    (usage.cacheWriteTokens / ONE_MILLION) * p.cacheWritePerMTok
  );
}
