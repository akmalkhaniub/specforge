# SpecForge — Project Claude Code Context
# File location: ~/projects/specforge/CLAUDE.md
# Purpose: Project-specific context layered on top of ~/.claude/CLAUDE.md

---

## What This Project Is

AI-powered requirements extraction platform. Users upload PDF/DOCX documents
or describe their project conversationally. Claude extracts structured epics,
user stories, and acceptance criteria. Results are searchable via pgvector
semantic search. Token economics dashboard tracks AI cost per extraction.

Full build instructions: `specforge-claude-code-instructions.md`

---

## Monorepo Structure

```
specforge/
  apps/api/       Hono backend (Node.js + TypeScript)
  apps/web/       React frontend (Vite + TypeScript)
  packages/shared/ Shared types only — zero runtime deps
```

Package manager: **pnpm workspaces**
Run commands from repo root: `pnpm --filter api <cmd>` or `pnpm --filter web <cmd>`
Never run `npm` or `yarn` in this project.

---

## Local Services (docker-compose)

```
PostgreSQL:  localhost:5432  db=specforge user=specforge pass=specforge
Redis:       localhost:6379  (no auth in dev)
MinIO:       localhost:9000  user=minioadmin pass=minioadmin
MinIO UI:    localhost:9001
```

Start with: `make dev` (starts docker services + both apps in watch mode)
Migrations:  `make migrate`
Seed data:   `make seed`  (creates Acme Corp org + 2 demo projects)

---

## Key Files — Read Before Editing Related Code

```
packages/shared/src/types.ts     All shared types — source of truth for IDs,
                                 timestamps, domain models
apps/api/src/db/client.ts        Postgres singleton — use this, don't create new
apps/api/src/db/migrations/      SQL migration files — never modify, only add
apps/api/src/queue/types.ts      BullMQ job data + progress event types
apps/api/src/ai/schemas.ts       Zod schemas for extraction output
apps/api/src/ai/prompts.ts       Prompt versions — always log promptVersion
apps/api/src/storage/minio.ts    MinIO client singleton
apps/api/src/index.ts            App entry point + startup sequence
```

---

## Pinned Versions — Never Change Without Running Evals

```typescript
// apps/api/src/ai/extractor.ts
export const CLAUDE_MODEL = "claude-sonnet-4-5-20251022"
export const EMBEDDINGS_MODEL = "text-embedding-3-small"  // OpenAI, 1536 dims
```

Upgrading either of these requires:
1. Running the eval set (`pnpm --filter api eval`) against the new version
2. Accuracy must meet or exceed current baseline before merge
3. New version string recorded in DECISIONS.md

---

## Database Conventions

All IDs: `uuid` (uuid_generate_v4())
All timestamps: `timestamptz` stored in UTC, returned as ISO strings
Column naming: `snake_case` in DB, `camelCase` in TypeScript (transform on read)
Soft deletes: `deleted_at timestamptz` — never hard delete domain records
Tenant scoping: every query that touches user data includes `org_id` filter

### pgvector (project-specific reminder)
```sql
-- Correct cosine similarity query pattern for this project:
SELECT
  source_type,
  source_id,
  content,
  metadata,
  1 - (embedding <=> $1::vector) AS similarity
FROM embeddings
WHERE org_id = $2          -- always scope to tenant first
  AND project_id = $3
  AND 1 - (embedding <=> $1::vector) > 0.7  -- threshold, not optional
ORDER BY embedding <=> $1::vector
LIMIT 10
```

---

## Extraction Pipeline — How It Works

Two-pass Claude strategy (do not collapse into one pass):

**Pass 1:** Extract all epics from the full document text.
  Tool: `extract_epics` → `{ epics: EpicExtraction[], document_type, extraction_notes }`

**Pass 2:** For each epic, extract its user stories.
  Tool: `extract_stories` → `{ stories: StoryExtraction[] }`
  Context: epic title + description + full document text

After each pass: Zod validation → retry once with errors if fails.
Log after each Claude call: model, promptVersion, inputTokens, outputTokens,
cacheReadTokens, latencyMs, costUsd, validationRetries.

**Do not refactor this into a single pass** — extraction accuracy degrades
significantly on complex nested schemas in one call. See ADR-003.

---

## BullMQ Worker Concurrency

Max 2 concurrent extraction jobs.
Reason: Claude API rate limits. At concurrency > 2 we see 429s on large docs.
Do not increase without testing against Claude API limits first.

Progress stages in order:
`queued → downloading → parsing → extracting_epics →
 extracting_stories → embedding → saving → complete`

Publish to Redis pub/sub channel `progress:{jobId}` at each stage.
Also update `extraction_jobs.progress` and `extraction_jobs.stage` in postgres.

---

## Frontend Conventions

State management: React Query for all server state. No Redux, no Zustand.
No localStorage — all state server-side (see ADR for reasoning).
Routing: React Router v6 with these routes:
  `/`              Dashboard
  `/upload`        Document upload + extraction progress
  `/projects/:id`  Project view with epics/stories
  `/chat`          Conversational requirements gathering
  `/analytics`     Token economics dashboard

API base URL: `VITE_API_URL` env variable (defaults to `http://localhost:3000`)
All API calls through `src/lib/api.ts` — never fetch() directly in components.

---

## Tailwind Colour Tokens

```
bg-background  #0f1117   Page background
bg-surface     #1a1f2e   Cards, panels
border-border  #2d3748   All borders
text-text      #e2e8f0   Primary text
text-muted     #718096   Secondary text, labels
accent         #667eea   Primary accent, active states
success        #68d391   Completed, healthy
warning        #f6e05e   Degraded, in-progress
danger         #fc8181   Errors, failed states
```

---

## Cloud Run Deployment

API deployed to Cloud Run on GCP (not nginx + PM2 — see ADR-005).
Port: 8080 (not 3000 — Cloud Run requires 8080).

Deploy: `make deploy-api` (triggers Cloud Build via `cloudbuild.yaml`)
Web deployed to Firebase Hosting.
Deploy web: `make deploy-web`

Environment variables in production: via GCP Secret Manager.
Never put secrets in cloudbuild.yaml or Dockerfile.

---

## Documents in This Repo to Keep Updated

After completing each significant feature, update:
- `DECISIONS.md` — if a new architectural decision was made
- `RUNBOOK.md` — if operational procedures changed (new alerts, new commands)
- `CHANGELOG.md` — every user-facing or API change

---

## What Phase Are We On?

Check `docs/progress.md` for the current phase and what's been completed.
(Create this file after Phase 0 and update it after each phase.)

Format:
```
## SpecForge Build Progress

- [x] Phase 0 — Bootstrap
- [x] Phase 1 — Database schema
- [ ] Phase 2 — MinIO storage  ← current
- [ ] Phase 3 — BullMQ queue
...
```
