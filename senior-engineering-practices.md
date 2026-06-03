# Senior Engineering Practices
## A Guide for Writing a Technical Blog Post

> Research notes covering ADRs, RFCs, runbooks, post-mortems, and the
> full set of practices that distinguish senior from staff/principal engineers.
> Written from the perspective of a practising engineer, not a textbook.

---

## The Core Idea Worth Leading With

There is one habit that separates senior engineers from staff and principal
engineers more than any technical skill: **writing things down at decision
time, not after the fact.**

Junior engineers live in the present — the code works, ship it.
Senior engineers live slightly in the future — the code works, but who will
be debugging this at 2am six months from now, and what do they need?

Every practice in this document is an answer to that question.

---

## 1. ADR — Architectural Decision Record

### What it is
A short document capturing a single architectural decision permanently.
Not a design doc. Not a meeting note. A record of one specific choice,
the context that made it necessary, and the alternatives that were rejected.

### Why it matters
Every non-trivial codebase is full of decisions that look wrong to a
new engineer until they understand the constraints that existed at the time.
Without ADRs, those constraints live only in the heads of the people who
were there. When those people leave, the decisions get relitigated — often
badly, because the new team doesn't know about the landmines.

### Format
```
## ADR-001: [Decision Title]

**Status:** Accepted | Proposed | Deprecated | Superseded by ADR-00X
**Date:** YYYY-MM-DD

### Context
What problem were we solving? What constraints existed?
What made this decision necessary or urgent?

### Decision
What did we choose? One clear sentence, then elaboration.

### Alternatives Considered
| Option | Why Rejected |
|--------|-------------|
| Option A | ... |
| Option B | ... |

### Consequences
What does this choice enable?
What does it foreclose?
What technical debt does it create?
When should we revisit this decision?
```

### Where to store them
`docs/decisions/` in the repo. Numbered sequentially. Versioned with the
code they describe. Never in Confluence or Notion where they'll be
separated from the codebase.

### The habit
Write it at decision time. A decision made without an ADR is a decision
that will be relitigated in six months by someone who wasn't in the room.

### Real example
**ADR-005: Cloud Run over nginx + PM2**

*Context:* We needed a deployment target for the Hono API. The team has
prior experience with nginx + PM2 on VMs. However, we are deploying to
GCP and the API has bursty, unpredictable traffic patterns from AI extraction jobs.

*Decision:* Deploy to Cloud Run.

*Alternatives:*
- nginx + PM2 on a GCE VM: works, but requires SSH access, manual scaling,
  process management overhead, and SSL cert renewal automation. The right
  call in 2018, not in 2025.
- GKE (Kubernetes): over-engineered for a single-service API at this stage.
  Adds significant operational complexity for no benefit at current scale.
- Cloud Functions: too constrained for a long-running SSE streaming endpoint.

*Consequences:* Zero-ops deployment, autoscales to zero (cost savings),
built-in HTTPS and load balancing. Tradeoff: cold starts on first request
after idle period (mitigated with min-instances=1 in production).

---

## 2. RFC — Request for Comments

### What it is
A written proposal for a significant technical decision, circulated for
feedback *before* building. The goal is not consensus — it is surfacing
objections when they are cheap to address.

### Origin
The term comes from the IETF process that built the internet — every major
internet protocol (TCP, HTTP, DNS) was defined as an RFC that the community
could comment on. Amazon, Google, Rust, React, and most serious engineering
orgs have internal RFC processes.

### When to write one
- The decision affects more than one team
- It is hard or expensive to reverse
- It introduces a new dependency or changes a public API
- Reasonable engineers would disagree about the right approach

### Format
```
## RFC: [Proposal Title]

**Author:** [your name]
**Date:** YYYY-MM-DD
**Status:** Draft | Under Review | Accepted | Rejected

### Problem Statement
What are we trying to solve? Why does it matter now?

### Proposed Solution
What are you proposing? Be specific. Include diagrams if helpful.

### Alternatives Considered
What else did you consider? Why are you not proposing those?

### Open Questions
What are you unsure about? What do you need reviewers to help decide?

### Migration / Rollout Plan
How will this be implemented? What is the phasing?

### Success Criteria
How will we know this worked?
```

### The difference between an RFC and an ADR
An RFC is written *before* the decision to gather input.
An ADR is written *at* or *after* the decision to record it.
A good RFC often becomes the context section of the resulting ADR.

---

## 3. Runbook

### What it is
A step-by-step document for operating a system. Written for
"3am you who just got paged and cannot think straight."

### The test
Your runbook passes if someone who did not build the system can
respond to an incident using only the runbook, without calling you.

### Structure
```
## Runbook: [System or Incident Name]

### Overview
What does this system do? What does healthy look like?

### Architecture
One diagram. The deployable components and how they connect.

### Common Operations
#### Deploy a new version
1. Step one
2. Step two
...

#### Roll back a deployment
...

#### Restart a crashed worker
...

### Alert Responses
#### Alert: extraction_job_failure_rate > 5%
Meaning: More than 5% of extraction jobs are failing in the last 10 minutes.
Likely causes:
  1. Claude API outage — check status.anthropic.com
  2. Database connection pool exhausted — check pg_stat_activity
  3. Redis memory pressure — check Redis memory usage
Steps:
  1. Check the error field in extraction_jobs for the most recent failures
  2. ...

### Escalation
Who to call if the runbook does not resolve the issue.
```

### The senior engineer mindset
Runbooks are not bureaucracy. They are the answer to "what happens when
I go on holiday and something breaks?" Every alert in your monitoring
system should have a corresponding runbook entry.

---

## 4. Post-Mortem (Incident Report)

### What it is
A written analysis of a production incident. Covers what happened,
why it happened, and what will prevent it happening again.

The most important word: **blameless.** The goal is fixing the system,
not finding who to blame. People make mistakes. Systems that allow
mistakes to cause outages are the problem, not the people.

### Format
```
## Post-Mortem: [Incident Title]

**Date:** YYYY-MM-DD
**Severity:** P1 | P2 | P3
**Duration:** X hours Y minutes
**Impact:** [number of users affected, revenue impact if known]
**Author:** [who wrote this]
**Reviewers:** [who reviewed it]

### Summary
Two or three sentences. What happened, how long it lasted, what the impact was.

### Timeline
| Time (UTC) | Event |
|-----------|-------|
| 14:32 | Alert fires: extraction_job_failure_rate > 5% |
| 14:35 | Engineer acknowledges alert |
| 14:41 | Root cause identified: model version alias changed |
| 14:48 | Hotfix deployed: pinned model version |
| 14:52 | Error rate returns to baseline |

### Root Cause
What actually caused the incident? Go deep — "Claude API returned errors"
is not a root cause. "We used a model alias (claude-sonnet-latest) instead
of a pinned version (claude-sonnet-4-5-20251022), and the alias was updated
to a new model version that behaves differently on our extraction prompts"
is a root cause.

### Contributing Factors
What made this incident worse or harder to detect?
- No monitoring on extraction accuracy (only on error rate)
- Model version not logged in extraction_jobs table
- No eval suite running in CI

### What Went Well
- Alert fired within 3 minutes of the failure rate spiking
- Rollback procedure was documented in the runbook
- On-call engineer had context from previous similar incident

### Action Items
| Action | Owner | Due Date | Status |
|--------|-------|----------|--------|
| Pin all Claude model versions, never use aliases | @akmal | 2025-01-20 | Done |
| Add model_version to extraction_jobs logging | @akmal | 2025-01-20 | Done |
| Add accuracy monitoring to extraction pipeline | @akmal | 2025-01-27 | In progress |
| Run eval suite on every deployment | @akmal | 2025-02-03 | Planned |

### Lessons Learned
What did this incident teach us about the system?
What would we do differently if designing this from scratch?
```

### Real story worth including in a blog
A production RAG platform saw answer quality drop from 87% to 61% overnight.
No code deployments had happened. Root cause: a model alias used in production
(`claude-3-5-sonnet-latest`) was updated by Anthropic to point to a new model
version that was more conservative about making assertions. This broke the
extraction prompt patterns.

The fix took 7 minutes once identified. The detection took 4 hours because
there was no accuracy monitoring — only latency and error rate monitoring.

**Lesson:** AI systems need accuracy monitoring, not just uptime monitoring.
A system that returns wrong answers with 100% uptime is not a healthy system.

---

## 5. Structured Logging

### What it is
Every log line is a JSON object with consistent, queryable fields.
Not prose. Not `console.log("job started")`. A structured event.

### The difference
```javascript
// Unstructured — useless in production
console.log("Extraction started for job abc123")

// Structured — queryable, alertable, dashboardable
console.log(JSON.stringify({
  level: "info",
  event: "extraction_started",
  jobId: "abc123",
  documentId: "doc456",
  projectId: "proj789",
  model: "claude-sonnet-4-5-20251022",
  timestamp: new Date().toISOString(),
  service: "specforge-api",
  version: "1.4.2"
}))
```

### Why it matters
Structured logs are queryable. In GCP Logging, Datadog, or CloudWatch,
you can write:
```
event="extraction_complete" AND model="claude-sonnet-4-5-20251022"
| stats avg(latency_ms), sum(cost_usd) by project_id
```

Unstructured logs require grep, awk, and prayer.

### What to log for an AI pipeline
Every Claude API call should emit a log with:
- model (pinned version string)
- input_tokens, output_tokens, cache_read_tokens
- latency_ms
- cost_usd (calculated)
- extraction_pass (1 or 2)
- validation_result (pass | fail | retry)
- job_id, document_id, project_id

This is how you answer "why did costs spike on Tuesday" in 2 minutes
instead of 2 hours.

---

## 6. Feature Flags

### What it is
Separating code deployment from feature release. A feature flag is a
conditional in your code that enables functionality only when a flag is
turned on — for a specific user, a percentage of traffic, or everyone.

### Why it matters
Deploy fearlessly. If the new extraction model behaves unexpectedly,
turn off the flag — no rollback, no hotfix. This is the practice behind
"we deploy 50 times a day" at large tech companies.

### Types
- **Release flags:** hide incomplete features (the classic use case)
- **Experiment flags:** A/B test two implementations
- **Ops flags:** kill switches for expensive operations
  (e.g. "disable Opus-tier extraction if costs exceed $X/hour")
- **Permission flags:** enable features for specific users or orgs

### Simple implementation
For a small product like SpecForge, a database table is enough:
```sql
CREATE TABLE feature_flags (
  key text PRIMARY KEY,
  enabled boolean DEFAULT false,
  enabled_for_orgs text[] DEFAULT '{}',
  description text,
  updated_at timestamptz DEFAULT now()
);
```

Then: `SELECT enabled FROM feature_flags WHERE key = 'opus_extraction'`

Production tools: LaunchDarkly (managed, expensive), Unleash (self-hosted,
free), GrowthBook (open source, good for experiments).

---

## 7. SLOs — Service Level Objectives

### What it is
An explicit, measurable agreement about the reliability you are targeting.
Not "the system should be fast." Not "we want good uptime."

A real SLO:
> "p99 latency on POST /api/documents/upload will be under 2 seconds.
> Extraction job completion will be under 120 seconds for documents
> under 50 pages. Availability (successful requests / total requests)
> will be 99.5% measured over a rolling 30-day window."

### The error budget
If your SLO is 99.5% availability, you have a 0.5% error budget per month
— about 3.6 hours of downtime. When you are spending your error budget
faster than expected, you stop shipping features and fix reliability.
When you have budget to spare, you can take risks.

This is the practice that turns "reliability vs velocity" from a tension
into a managed tradeoff.

### SLIs (Service Level Indicators)
The metrics you actually measure to evaluate your SLO:
- **Availability:** (successful requests) / (total requests)
- **Latency:** p50, p95, p99 of response times
- **Error rate:** 5xx responses / total responses
- **Freshness:** for AI systems — how recently was the model evaluated?
- **Quality:** for AI systems — accuracy on the eval set over time

### Why senior engineers care about this
Anyone can make a system fast in development. SLOs force you to define
"fast enough" and "reliable enough" in production — and to build the
monitoring that proves you are meeting them.

---

## 8. The Observability Trinity

### Logs, metrics, traces — why you need all three

**Logs** answer: what happened?
Structured log events with context. The record of what the system did.

**Metrics** answer: how much, how often, how fast?
Numbers aggregated over time. CPU usage, request rate, error rate,
token cost per hour. Queryable and graphable. Not queryable for individual events.

**Traces** answer: where did the time go?
A trace follows a single request through every service it touches,
recording how long each step took. For an extraction pipeline:
HTTP request → BullMQ enqueue → MinIO download → mammoth parse →
Claude API pass 1 → Claude API pass 2 → pgvector embed → postgres write.
A trace shows you which step is the bottleneck.

### For an AI pipeline specifically
The standard observability trinity needs an extra dimension: **AI quality.**
Logs, metrics, and traces tell you if the system is working.
They do not tell you if the system is working *correctly*.

Add:
- Accuracy metrics from your eval set, tracked over time
- Extraction quality scores (confidence averages per model version)
- Model version tracking (know which Claude version produced each output)
- Alert on accuracy *drops*, not just error rate spikes

This is the gap that caused the post-mortem example above. The system was
"working" — requests succeeded, latency was normal — but it was returning
wrong answers. Traditional observability was blind to this.

---

## 9. Definition of Done

### What it is
An explicit checklist that defines when a task is truly complete.
Not "I pushed the code." Not "it works on my machine."

### A practical DoD for a Staff engineer
```
A feature is Done when:

Code
  [ ] Passes all existing tests
  [ ] New tests written for new behaviour
  [ ] TypeScript strict — zero 'any' types
  [ ] Code reviewed by at least one peer

Observability
  [ ] Structured logs added for new events
  [ ] New failure modes have alerts
  [ ] Dashboards updated if new metrics introduced

Documentation
  [ ] ADR written if a significant decision was made
  [ ] Runbook updated if operations changed
  [ ] API docs updated if endpoints changed
  [ ] CHANGELOG.md entry added

Operations
  [ ] Feature flagged if not ready for all users
  [ ] Rollback plan documented if high risk
  [ ] Performance tested if in a hot path
```

### Why this matters
The Definition of Done converts implicit expectations into explicit ones.
It prevents the situation where "it works" ships without logging, without
alerts, and without documentation — and then breaks at 2am with no way
to diagnose it.

---

## 10. The Practices Summarised

| Practice | Written when | Lives where | Purpose |
|---|---|---|---|
| ADR | At decision time | `docs/decisions/` in repo | Record why the codebase is the way it is |
| RFC | Before deciding | Notion / Google Docs / PR | Surface objections before building |
| Runbook | When system goes live | `docs/runbooks/` in repo | Enable others to operate the system |
| Post-mortem | After an incident | `docs/incidents/` in repo | Fix the system, not the person |
| Structured logging | As code is written | Code + log aggregator | Make production debuggable |
| Feature flags | Before risky releases | Database or flag service | Separate deploy from release |
| SLOs | When defining reliability | Monitoring system + doc | Turn reliability into a managed tradeoff |
| Observability | As system is built | Dashboards + alerts | Know if the system is healthy |
| Definition of Done | As team norms | Team wiki or PR template | Convert implicit expectations to explicit |

---

## Blog Post Angles Worth Considering

**Angle 1: The 2am Test**
"Write every document, log line, and alert as if you will be woken up at 2am
to debug the system, six months from now, having forgotten everything about it."
Use this as the throughline connecting all the practices.

**Angle 2: AI systems need a new kind of observability**
The post-mortem story is a good hook. Traditional observability (uptime,
latency, error rate) is blind to AI quality degradation. This is a genuinely
new problem the industry is still figuring out. Accuracy monitoring,
eval sets in CI, model version pinning — these are the practices that
fill the gap.

**Angle 3: The practices as a progression**
Frame it as a journey: what a junior engineer does vs a senior vs a staff.
Junior: code works, ship it. Senior: code works, is it observable?
Staff: code works, is it observable, operable, and documented for someone
who wasn't here when it was built?

**Angle 4: The cost of not doing this**
Each practice exists because someone had a painful experience without it.
ADRs exist because someone joined a team and spent a month relitigating a
decision. Post-mortems exist because blame-culture prevented teams from
fixing systemic issues. Use the war stories as section openers.

---

## Quotes Worth Including

*"The most important skill for a senior engineer is not technical — it is
the ability to make decisions that are understandable to the engineers who
inherit them."*

*"An alert without a runbook is a notification that something is broken
and you are on your own."*

*"Blameless post-mortems are not about being nice to people who made mistakes.
They are about acknowledging that if the system allowed a human mistake to
cause an outage, the system has a design flaw — and design flaws are fixable."*

*"A feature flag is an apology to your future self."*
