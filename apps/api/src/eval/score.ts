/**
 * Pure scoring utilities for extraction evals. No API calls — deterministic and
 * unit-testable. Matches predicted epic titles against a golden set using
 * word-overlap (Jaccard) similarity, then computes recall / precision / F1.
 */

const STOPWORDS = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'for', 'to', 'with', 'in', 'on']);

/** Normalises a title into a set of significant lowercase word tokens. */
function tokens(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 1 && !STOPWORDS.has(w)),
  );
}

/** Jaccard similarity between two titles' token sets (0..1). */
export function titleSimilarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * A predicted title "matches" an expected one above this token-overlap. Epic
 * titles are short (2–4 significant words), so a single shared key word over a
 * differing modifier (e.g. "Password Recovery" vs "Password Reset") is a real
 * match — hence 0.3 rather than a stricter cutoff.
 */
export const MATCH_THRESHOLD = 0.3;

/** Result of scoring one document's extraction. */
export interface DocScore {
  recall: number;
  precision: number;
  f1: number;
  matched: number;
  expected: number;
  predicted: number;
}

/**
 * Scores predicted epic titles against expected ones via greedy best-match.
 * Each expected/predicted title is used at most once.
 */
export function scoreEpics(predicted: string[], expected: string[]): DocScore {
  const usedPred = new Set<number>();
  let matched = 0;

  for (const exp of expected) {
    let bestIdx = -1;
    let bestSim = MATCH_THRESHOLD;
    predicted.forEach((pred, i) => {
      if (usedPred.has(i)) return;
      const sim = titleSimilarity(exp, pred);
      if (sim >= bestSim) {
        bestSim = sim;
        bestIdx = i;
      }
    });
    if (bestIdx >= 0) {
      usedPred.add(bestIdx);
      matched += 1;
    }
  }

  const recall = expected.length === 0 ? 1 : matched / expected.length;
  const precision = predicted.length === 0 ? 0 : matched / predicted.length;
  const f1 = recall + precision === 0 ? 0 : (2 * recall * precision) / (recall + precision);
  return { recall, precision, f1, matched, expected: expected.length, predicted: predicted.length };
}

/** Averages F1 across per-document scores. */
export function aggregateF1(scores: DocScore[]): number {
  if (scores.length === 0) return 0;
  return scores.reduce((sum, s) => sum + s.f1, 0) / scores.length;
}
