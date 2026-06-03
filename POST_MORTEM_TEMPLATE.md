# Post-Mortem: Extraction Accuracy Regression (Model Alias Drift)

> This is a filled-in example post-mortem, usable as a template for future
> incidents. Replace the scenario with your own; keep the structure. Blameless:
> we fix systems, not people.

**Status:** Resolved
**Severity:** SEV-2 (degraded quality, no outage)
**Authors:** On-call Engineer
**Date of incident:** 2026-05-18 → 2026-05-20
**Date of write-up:** 2026-05-21

---

## Summary

Over ~48 hours, extraction quality dropped from ~85% to ~55% (measured against our
eval set after the fact). There was **no error-rate or latency increase** —
extractions succeeded, but produced fewer and shallower epics. A customer reported
"the results got worse," not our monitoring. Root cause: a Claude model **alias**
(rather than a pinned version) had been introduced in a refactor; the provider
rolled the alias to a newer model that is more conservative about inferring
requirements, yielding fewer epics per document.

---

## Impact

- All extractions between **2026-05-18 ~09:00** and **2026-05-20 ~14:30** were
  lower quality (≈40 documents across 6 customers).
- No data loss; no downtime. Cost per document actually *dropped* slightly (fewer
  output tokens), which masked the change in cost monitoring.
- One customer escalated; trust impact.

---

## Timeline (UTC)

| Time | Event |
|---|---|
| 05-15 16:00 | Refactor PR merged: `models.ts` changed `CLAUDE_MODEL` to a sonnet **alias** during a "tidy-up". Eval set not run (not in CI). |
| 05-18 09:00 | Provider rolls the alias to a newer model version. Quality silently changes. |
| 05-18–05-20 | ~40 extractions run at degraded quality. No alerts fire. |
| 05-20 13:55 | Customer reports "extractions are missing obvious epics." |
| 05-20 14:10 | On-call reproduces on a known document; far fewer epics than a week ago. |
| 05-20 14:20 | Logs inspected — `model` field shows an alias, not a pinned version; output tokens down ~35%. |
| 05-20 14:30 | Hotfix: pin `CLAUDE_MODEL` back to the previously-validated version; deploy. |
| 05-20 14:45 | Eval set run against the pinned version — accuracy back to ~85%. Incident mitigated. |
| 05-21 | Post-mortem; action items filed. |

---

## Root cause analysis (5 whys)

1. **Why did quality drop?** The model behind our calls changed to a more
   conservative version.
2. **Why did the model change?** We referenced a model **alias**, and the provider
   updated what the alias points to.
3. **Why were we using an alias?** A refactor replaced the pinned version string
   with an alias, believing it was equivalent.
4. **Why wasn't that caught in review/CI?** The eval set is run manually and was
   not part of CI; reviewers had no signal that model behaviour could change.
5. **Why didn't monitoring catch the drift?** We monitor error rate, latency, and
   cost — none of which moved. We had **no automated accuracy metric** and **no
   alert on model-version changes**, and the `model` field, while logged, was not
   surfaced on a dashboard.

**Root cause:** absence of guardrails around model identity — alias instead of a
pinned version, no eval gate in CI, and no observability on model version or output
quality.

---

## Contributing factors

- Eval set not wired into CI (manual, last run 3 weeks prior).
- No accuracy/quality monitoring in production.
- Model **alias** used instead of a pinned version (violates our own standard).
- `model` was logged but not alerted on or dashboarded.
- Cost *decreased*, so the one adjacent metric we had pointed the wrong way.

---

## What went well

- A customer felt comfortable reporting subjective quality — short feedback loop.
- Once identified, the fix was a one-line pin + redeploy; rollback was fast.
- Structured logs included the `model` field, which made diagnosis quick once we
  looked.

---

## Action items

| # | Action | Owner | Due |
|---|--------|-------|-----|
| 1 | Add a CI check that fails the build if `CLAUDE_MODEL`/`EMBEDDINGS_MODEL` is not a pinned version (regex: no aliases) | Platform | 2026-05-28 |
| 2 | Run the eval set in CI on any change touching `apps/api/src/ai/**`; block merge below baseline accuracy | AI | 2026-06-04 |
| 3 | Emit a daily accuracy metric from a canary document set; alert on >10% drop | AI | 2026-06-11 |
| 4 | Add `model_version` to the analytics dashboard; alert when a new value appears | Platform | 2026-06-04 |
| 5 | Add an alert on epics-per-document moving >2σ from trailing baseline | AI | 2026-06-11 |
| 6 | Document model-upgrade procedure in `DECISIONS.md` (eval → pin → record) | AI | 2026-05-28 |
| 7 | Add a pre-merge checklist item: "model version pinned & eval run?" | All | 2026-05-23 |

---

## Lessons learned

1. **Pin everything that can change underneath you.** An alias is a silent
   dependency on someone else's release schedule. Pin the version; upgrade
   deliberately behind an eval gate.
2. **Monitor the metric that defines the product.** For an AI extraction product
   that metric is *quality*, not just uptime/latency/cost. We were blind to the one
   thing that mattered, and a proxy metric (cost) actively misled us.
3. **Log it *and* surface it.** The `model` field was in the logs the whole time.
   Data you don't alert on or dashboard is data you find only after a customer does.
