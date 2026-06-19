/**
 * Extraction eval runner. Runs the two-pass extractor on each golden case,
 * scores epic recall/precision/F1, prints a report, and exits non-zero if the
 * aggregate F1 falls below BASELINE_F1. Wired into CI to gate ai/** changes so
 * a model/prompt regression can't merge silently (see POST_MORTEM_TEMPLATE.md).
 *
 * Run: pnpm --filter api eval
 */
import { extractRequirements } from '../ai/extractor.js';
import { CLAUDE_MODEL } from '../ai/models.js';
import { log } from '../lib/logger.js';
import { EVAL_CASES } from './dataset.js';
import { aggregateF1, scoreEpics, type DocScore } from './score.js';

/** Minimum acceptable aggregate F1. Raise as the pipeline improves. */
const BASELINE_F1 = 0.7;

async function main(): Promise<void> {
  log.info('eval_started', { cases: EVAL_CASES.length, model: CLAUDE_MODEL, baselineF1: BASELINE_F1 });
  const scores: DocScore[] = [];
  let totalCost = 0;

  for (const c of EVAL_CASES) {
    const result = await extractRequirements({
      documentText: c.documentText,
      documentId: `eval-${c.name}`,
      onProgress: () => undefined,
    });
    totalCost += result.costUsd;
    const predictedTitles = result.epics.map((e) => e.title);
    const score = scoreEpics(predictedTitles, c.expectedEpics);
    scores.push(score);
    log.info('eval_case', {
      name: c.name,
      f1: Number(score.f1.toFixed(3)),
      recall: Number(score.recall.toFixed(3)),
      precision: Number(score.precision.toFixed(3)),
      matched: score.matched,
      expected: score.expected,
      predicted: score.predicted,
      predictedTitles,
    });
  }

  const f1 = aggregateF1(scores);
  const passed = f1 >= BASELINE_F1;
  log.info('eval_complete', {
    aggregateF1: Number(f1.toFixed(3)),
    baselineF1: BASELINE_F1,
    passed,
    totalCostUsd: Number(totalCost.toFixed(4)),
  });

  if (!passed) {
    log.error('eval_failed', { aggregateF1: Number(f1.toFixed(3)), baselineF1: BASELINE_F1 });
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err: unknown) => {
  log.error('eval_error', { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
