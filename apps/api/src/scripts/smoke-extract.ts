/**
 * Manual smoke test for the two-pass Claude extractor.
 * Requires a real ANTHROPIC_API_KEY in .env. Run:
 *   pnpm --filter api exec tsx src/scripts/smoke-extract.ts
 */
import { extractRequirements } from '../ai/extractor.js';
import { log } from '../lib/logger.js';

const SAMPLE = `Project: Acme Online Store

Customers must be able to browse products by category and search by keyword.
They should be able to add items to a shopping cart and check out using a
credit card. If a customer forgets their password, they must be able to reset
it via a time-limited email link. Administrators need a dashboard to manage
inventory and view daily sales totals.`;

async function main(): Promise<void> {
  const result = await extractRequirements({
    documentText: SAMPLE,
    documentId: 'smoke-extract',
    onProgress: (stage, percent, tokens) => log.info('smoke_progress', { stage, percent, tokens }),
  });

  log.info('smoke_result', {
    documentType: result.documentType,
    epicCount: result.epics.length,
    storyCount: result.epics.reduce((n, e) => n + e.stories.length, 0),
    costUsd: result.costUsd,
    inputTokens: result.totalInputTokens,
    outputTokens: result.totalOutputTokens,
    cacheReadTokens: result.totalCacheReadTokens,
  });
  for (const epic of result.epics) {
    log.info('smoke_epic', { title: epic.title, priority: epic.priority, stories: epic.stories.length });
  }
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    log.error('smoke_failed', { error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  });
