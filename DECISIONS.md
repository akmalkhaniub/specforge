# Architecture Decision Records

Decisions that are hard to reverse, non-obvious to a new engineer, or made under
constraints that might change. Newest considerations noted at the end of each.

---

## ADR-001: pgvector over a dedicated vector database

**Status:** Accepted
**Date:** 2026-06-04

### Context
Semantic search across extracted epics needs vector similarity, tenant-scoped to
`org_id`/`project_id`. Candidates: Pinecone, Qdrant, Weaviate, pgvector.

### Decision
Use **pgvector** inside the primary PostgreSQL instance. The deciding factor is
that filtered vector search composes with ordinary SQL `WHERE`/`JOIN` in one
query — the tenant filter (`WHERE org_id = $1 AND project_id = $2`) and the
distance ranking happen in the same transaction, against the same source of
truth.

### Alternatives considered
| Option | Why rejected |
|--------|--------------|
| Pinecone | Separate service + network hop; metadata filtering is weaker than SQL; another vendor + bill |
| Qdrant / Weaviate | Operationally heavier; introduces a second datastore to keep consistent with Postgres |
| In-memory / brute force | Doesn't scale; no persistence |

### Consequences
- One datastore to back up, migrate, and reason about; no dual-write consistency bugs.
- HNSW index gives sub-linear ANN search.
- **Revisit when:** ~10M vectors, or query p99 exceeds 200ms — at which point a
  dedicated vector store or partitioning is worth the operational cost.

---

## ADR-002: BullMQ over AWS SQS or Temporal

**Status:** Accepted
**Date:** 2026-06-04

### Context
Extraction takes 10–90s and cannot run inside a request. We need a durable queue
with retries and, crucially, **progress events** to drive the frontend SSE stream.

### Decision
Use **BullMQ on Redis**. Redis is already in the stack, so this adds zero new
infrastructure. BullMQ gives retries with backoff, concurrency control, and a job
lifecycle we already pair with a Redis pub/sub channel for progress.

### Alternatives considered
| Option | Why rejected |
|--------|--------------|
| AWS SQS | No native progress/events; ties us to AWS; visibility-timeout semantics are awkward for long jobs |
| Temporal | Correct for complex multi-step workflows, but operationally heavy for a 6-stage pipeline |
| In-process async | No durability; a crash loses in-flight extractions |

### Consequences
- Concurrency capped at **2** — Claude returns 429s above this on large docs.
- Progress is published to `progress:{jobId}` and also persisted on the job row,
  so the SSE stream has a polling fallback.
- **Revisit when:** the pipeline grows beyond ~5 sequential, independently
  retryable steps — Temporal's workflow guarantees would then earn their cost.

---

## ADR-003: Anthropic Claude over OpenAI GPT-4 for extraction

**Status:** Accepted
**Date:** 2026-06-04

### Context
The core task is reliable structured JSON from noisy real-world documents. Two
hard requirements: a large context window (a full BRD in one pass) and dependable
tool use for schema enforcement.

### Decision
Use **Claude (Sonnet) with tool use**, in a **two-pass** strategy (epics, then
stories per epic). The 200K context window fits whole documents; tool use is
reliable on our schemas; prompt caching makes the repeated system prompt cheap on
pass 2 (run once per epic). Two passes because a single deeply-nested
epics+stories schema measurably degrades accuracy.

### Alternatives considered
| Option | Why rejected |
|--------|--------------|
| OpenAI GPT-4o | Comparable quality, but we standardised on Claude for context size + tool-use reliability on nested schemas in testing |
| Single-pass Claude | Accuracy drops on the combined nested schema; harder to validate/retry granularly |
| Fine-tuned smaller model | Premature; no labelled dataset; loses generality across document types |

### Consequences
- Model version is **pinned** (`CLAUDE_MODEL` in `apps/api/src/ai/models.ts`) —
  never an alias. Upgrading requires running the eval set and recording the new
  version here.
- Every call validates with Zod and retries once with errors appended.
- **Note (2026-06):** the pinned version originated with the project spec. Before
  the first production deploy, confirm it against the current Sonnet release and
  run the eval set; bump deliberately if a newer pinned version wins on accuracy.
- **Revisit when:** another model beats Claude on our eval set by a material margin.

---

## ADR-004: Hono over Express or Fastify

**Status:** Accepted
**Date:** 2026-06-04

### Context
Node API framework selection. Requirements: TypeScript-first, clean SSE streaming
(job progress + chat), lightweight, modern, edge-portable.

### Decision
Use **Hono**. Native streaming via `hono/streaming`'s `streamSSE` is the deciding
factor — forwarding BullMQ progress and Claude chat tokens to the browser needs
clean streaming primitives. Express middleware chains handle SSE awkwardly. Hono
is also runtime-portable (Node today, edge later) and integrates `zValidator` for
typed request validation.

### Alternatives considered
| Option | Why rejected |
|--------|--------------|
| Express | Mature but SSE/streaming is clunky; types are bolt-on |
| Fastify | Good performance + schemas, but heavier plugin model; streaming less ergonomic than Hono |

### Consequences
- SSE routes are concise and cancellation-aware (clean up on `req.raw.signal` abort).
- Validation lives at the route boundary with `@hono/zod-validator`.
- **Revisit when:** we need a capability only available in a heavier framework's ecosystem.

---

## ADR-005: Cloud Run over nginx + PM2 on a VM

**Status:** Accepted
**Date:** 2026-06-04

### Context
Production deployment on GCP. The prior team pattern is nginx + PM2 on a GCE VM.
Evaluate continuing that vs managed containers.

### Decision
Deploy to **Cloud Run**. nginx + PM2 is valid but carries ongoing overhead: SSH
access, manual scaling, PM2 process config, SSL renewal automation, OS patching.
Cloud Run removes all of it — hand GCP a container, get HTTPS, load balancing, and
autoscaling, including **scale-to-zero** when idle (meaningful for a
portfolio/low-traffic service).

### Alternatives considered
| Option | Why rejected |
|--------|--------------|
| nginx + PM2 on GCE | Operational overhead (patching, SSL, scaling, SSH) with no offsetting benefit at this scale |
| GKE | Full Kubernetes is overkill for two services |
| Plain VM + systemd | Same maintenance burden as PM2 without the process-manager niceties |

### Consequences
- The container is the unit of deploy; the same image runs locally and in prod.
- Cold starts are mitigated with `min-instances=1` in production.
- Secrets come from Secret Manager, not env files or image layers.
- **Note:** nginx still appears in `apps/web/Dockerfile` purely as a static file
  server with SPA fallback — a different, valid use than a reverse proxy.
- **Revisit when:** we need sidecars, complex networking, or multi-service
  orchestration that justifies GKE.
