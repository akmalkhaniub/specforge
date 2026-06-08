# Changelog

All notable changes to SpecForge are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); the project is pre-1.0.

## [Unreleased]

### Added
- **Export**: download a project's epics/stories as Markdown, generic CSV, or
  Jira-import CSV (`GET /api/projects/:id/export?format=md|csv|jira`) + export
  buttons on the Project page.
- **Story editing**: `PATCH`/`DELETE /api/stories/:id` + inline edit (title,
  description, priority) on each story card.
- **Documents & re-extract**: list a project's documents, presigned download
  (`GET /api/documents/:id/download`), and re-run extraction
  (`POST /api/documents/:id/reprocess`) — surfaced in a Documents section on the
  Project page.

### Changed
- **Prompt caching**: the document text is now a `cache_control` content block,
  so pass-2 (per-epic) calls read it from cache instead of re-billing full input
  price. Verified: ~2.2k tokens/call served from cache on a multi-epic doc.

## [0.1.0] - 2026-06-04

Initial build — full vertical slice across all phases.

### Added
- **Monorepo** (pnpm workspaces): `apps/api`, `apps/web`, `packages/shared`.
- **Database**: PostgreSQL + pgvector schema (migrations 001–008), idempotent
  migration runner, seed (Acme org + 2 demo projects).
- **Storage**: MinIO `StorageClient` (upload/download/presign/delete/health) with
  typed `StorageError`.
- **Queue**: BullMQ extraction queue (concurrency 2, exponential backoff) + Redis
  pub/sub progress channel.
- **AI pipeline**: two-pass Claude extraction (epics → stories) with tool use,
  Zod validation + one retry, prompt caching, cost tracking, OpenAI embeddings
  (feature-flagged), and streaming chat with a `requirements_complete` tool.
- **API** (Hono): documents upload, jobs SSE + polling, projects (+ tenant-scoped
  pgvector search), epics CRUD (soft delete), chat stream, analytics
  (overview/timeline/by-model/jobs/cost-estimate), `/health` with per-dependency
  status.
- **Frontend** (React + Vite + Tailwind): Dashboard, Upload (+ live SSE progress),
  Project (search + epic/story accordions), Chat (streaming), Analytics
  (KPIs, charts, three-tier cost estimator, expandable jobs table).
- **Deployment**: multi-stage Dockerfiles, `cloudbuild.yaml`, `firebase.json`,
  `.gcloudignore`, Makefile targets.
- **Docs**: README, DECISIONS (5 ADRs), RUNBOOK, POST_MORTEM_TEMPLATE, progress
  tracker.

### Fixed (post-build, from live testing)
- **Model version**: pinned `CLAUDE_MODEL` corrected to `claude-sonnet-4-5-20250929`
  (the spec's `...20251022` does not exist and returned 404). Verified live:
  two-pass extraction produces ~5 epics / ~12 stories per sample doc.
- **Semantic search threshold**: lowered from `0.7` to `0.3`. With
  `text-embedding-3-small`, short query↔epic cosine similarity tops out ~0.5–0.6,
  so the 0.7 cutoff returned nothing; 0.3 surfaces relevant hits while filtering
  noise. Verified end-to-end (`smoke-e2e.ts`).

### Notes
- `@anthropic-ai/sdk` pinned to `0.100.1` (prompt-caching token fields are stable
  there; the spec's original `0.32.1` exposed them only under `beta`).
- `CLAUDE_MODEL` is pinned in `apps/api/src/ai/models.ts`; confirm against the
  current Sonnet release and run evals before the first production deploy (ADR-003).
- Live extraction/chat requires a real `ANTHROPIC_API_KEY`; semantic search
  additionally requires `OPENAI_API_KEY` + `EMBEDDINGS_ENABLED=true`.
