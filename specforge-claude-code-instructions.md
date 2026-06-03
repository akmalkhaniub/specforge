# SpecForge — Claude Code Build Instructions

> **How to use this file:** Share it with Claude Code at the start of your session.
> Work through one phase at a time. After each phase, run the app and verify it works
> before moving to the next. At the start of each new session paste:
> "We are building SpecForge. Current structure: [paste `find . -type f -name '*.ts' | head -60`]. Continue from Phase X."

---

## Your Role — Senior Staff Architect

**Paste this at the start of every Claude Code session, before any phase instruction:**

```
You are acting as a Senior Staff Architect and my pair programming partner
on SpecForge. Your job is not just to write code that works — it is to
help me build a codebase that demonstrates staff-level engineering judgment.

Throughout every phase, apply these standards without being asked:

ARCHITECTURE
- Before writing any non-trivial module, briefly state the design you are
  about to implement and why. Flag any decision worth recording as an ADR.
- If a simpler approach exists that trades future flexibility for immediate
  clarity, prefer simplicity and note the tradeoff explicitly.
- If you notice a design in the existing code that should be reconsidered,
  say so before proceeding.

CODE QUALITY
- Strict TypeScript throughout. Zero 'any' types. If you are tempted to
  use 'any', stop and design the type properly.
- Every exported function gets a JSDoc comment: what it does, params,
  return value, and any important side effects.
- Error handling is explicit: no swallowed errors, no bare catch(e) {},
  no untyped throws. Every error path is a typed error class.
- No magic numbers or strings in logic — constants with names that explain
  their meaning.

OBSERVABILITY
- Every significant operation emits a structured JSON log:
  { level, event, ...contextFields, timestamp, durationMs (if timed) }
- Every new failure mode gets an explicit error type and a comment
  explaining what operational response it requires.
- Every Claude API call logs: model, inputTokens, outputTokens,
  cacheReadTokens, latencyMs, costUsd.

DOCUMENTATION
- After completing each phase, generate or update the relevant section
  of DECISIONS.md with an ADR for any significant decision made.
- After completing Phase 6 (worker), generate a RUNBOOK.md entry for
  the extraction pipeline covering: how to monitor it, common failure
  modes, and how to respond to each.
- After completing Phase 9 (analytics), generate a POST_MORTEM_TEMPLATE.md
  that a future engineer could use after an AI quality incident.

PRODUCTION MINDSET
- Write code as if it will be debugged at 2am by someone who did not
  build it, six months from now.
- Pinned dependency versions. Pinned Claude model versions. Never 'latest'.
- Feature flag any behaviour that might need to be turned off quickly
  (e.g. Opus-tier extraction, embedding generation).
- Before finishing each phase, state: what could go wrong in production
  here, and how would we know?

When you are about to make a decision that a reasonable engineer might
make differently, pause and present two options with tradeoffs before
proceeding. I will choose.

Now read the phase instruction below and begin.
```

---

## What We're Building

**SpecForge** — an AI-powered requirements extraction platform. Users upload a PDF/DOCX
or describe their project conversationally. A Claude-powered pipeline extracts structured
epics, user stories, and acceptance criteria. Results are searchable via pgvector semantic
search and a token economics dashboard tracks AI costs per extraction.

This project demonstrates the full Arkitekt Forge tech stack in a smaller but genuine product.

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | React + TypeScript (Vite) | Same as Forge |
| Backend API | Hono on Node.js + TypeScript | Lightweight, native streaming, edge-ready |
| Database | PostgreSQL + pgvector | Vector search without a separate service |
| Job queue | BullMQ + Redis | Async document extraction with progress events |
| AI | Anthropic Claude API (tool use + streaming) | 200K context, reliable structured output |
| Document parsing | mammoth (DOCX) + pdf-parse (PDF) | Same as Forge |
| Object storage | MinIO (S3-compatible) | Data sovereignty, S3 API compatibility |
| Deployment | Cloud Run (API) + Firebase Hosting (web) | Modern, zero-ops, replaces nginx+PM2 |
| Containerisation | Docker + Docker Compose (local dev) | Consistent local environment |

---

## Monorepo Structure (Target)

```
specforge/
  apps/
    api/                    Hono backend
      src/
        db/                 postgres client + migrations
        storage/            MinIO client
        queue/              BullMQ queue + worker + Redis pub/sub
        ai/                 Claude extractor + embeddings + chat
        routes/             Hono route handlers
        index.ts            app entry point
      Dockerfile
      ecosystem.config.js   (kept for reference only, not used in prod)
      package.json
    web/                    React frontend
      src/
        pages/              Dashboard, Upload, Project, Chat, Analytics
        components/         shared UI components
        lib/                API client, React Query hooks
      Dockerfile
      package.json
  packages/
    shared/                 shared TypeScript types (no runtime deps)
      src/types.ts
  docker-compose.yml        local dev: postgres, redis, minio only
  cloudbuild.yaml           GCP Cloud Build pipeline
  .env.example
  Makefile
  README.md
  DECISIONS.md
```

---

## Environment Variables (.env.example)

```bash
# Database
DATABASE_URL=postgresql://specforge:specforge@localhost:5432/specforge

# Redis
REDIS_URL=redis://localhost:6379

# MinIO
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=specforge-documents
MINIO_USE_SSL=false

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Embeddings (use OpenAI text-embedding-3-small for 1536-dim vectors)
OPENAI_API_KEY=sk-...

# App
PORT=3000
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173

# Cloud Run (production only)
CLOUD_RUN_SERVICE_URL=https://specforge-api-xxxx-uc.a.run.app
```

---

## Phase 0 — Project Bootstrap

```
We are building SpecForge — an AI-powered requirements extraction platform.
Full context is in specforge-claude-code-instructions.md which I have shared.

Bootstrap the monorepo now:

1. Root package.json with pnpm workspaces pointing to apps/* and packages/*
2. apps/api:
   - package.json with dependencies: hono, @hono/node-server, @anthropic-ai/sdk,
     openai, postgres, ioredis, bullmq, minio, mammoth, pdf-parse, zod,
     @google-cloud/storage (optional)
   - devDependencies: typescript, tsx, tsup, @types/node, @types/pdf-parse
   - tsconfig.json: strict, ESNext, moduleResolution bundler
   - src/index.ts: basic Hono app on port 3000 with /health route returning
     { status: 'ok', timestamp: new Date().toISOString() }
   - Scripts: dev (tsx watch src/index.ts), build (tsup src/index.ts),
     start (node dist/index.js)

3. apps/web:
   - Vite + React + TypeScript via create-vite template
   - Install: @tanstack/react-query, react-router-dom, axios, lucide-react, recharts
   - Install and configure Tailwind CSS v3
   - tailwind.config.ts with custom colours:
     background: '#0f1117', surface: '#1a1f2e', border: '#2d3748',
     text: '#e2e8f0', muted: '#718096', accent: '#667eea', success: '#68d391',
     warning: '#f6e05e', danger: '#fc8181'
   - src/App.tsx: placeholder with "SpecForge" heading

4. packages/shared:
   - package.json with name @specforge/shared, no runtime dependencies
   - src/types.ts: export all shared types (see types below)
   - tsconfig.json

5. docker-compose.yml with three services:
   postgres:
     image: pgvector/pgvector:pg16
     environment: POSTGRES_DB=specforge, POSTGRES_USER=specforge,
       POSTGRES_PASSWORD=specforge
     ports: 5432:5432
     volumes: postgres_data:/var/lib/postgresql/data
     healthcheck: pg_isready -U specforge

   redis:
     image: redis:7-alpine
     ports: 6379:6379
     volumes: redis_data:/data
     healthcheck: redis-cli ping

   minio:
     image: minio/minio
     command: server /data --console-address ":9001"
     environment: MINIO_ROOT_USER=minioadmin, MINIO_ROOT_PASSWORD=minioadmin
     ports: 9000:9000, 9001:9001
     volumes: minio_data:/data
     healthcheck: curl -f http://localhost:9000/minio/health/live

6. .env.example as shown in the instructions doc
7. .env copied from .env.example (gitignored)
8. Root Makefile:
   dev: runs docker-compose up -d then pnpm --filter api dev & pnpm --filter web dev
   build: pnpm --filter api build && pnpm --filter web build
   up: docker-compose up
   down: docker-compose down
   migrate: pnpm --filter api db:migrate
   seed: pnpm --filter api db:seed
   logs: docker-compose logs -f

Shared types to put in packages/shared/src/types.ts:
  Organisation, Project, Document, ExtractionJob, Epic, Story,
  AcceptanceCriteria, ExtractionProgress, ProgressStage, ChatMessage,
  AnalyticsOverview, TokenUsageByDay, ModelUsage

Use uuid for all IDs. All timestamps as ISO strings in shared types.
Strict TypeScript throughout. No any types anywhere.
```

---

## Phase 1 — Database Schema + Migrations

```
Set up the PostgreSQL database layer in apps/api.

Use the `postgres` npm package (tagged template literals, not an ORM).
Create apps/api/src/db/client.ts exporting a singleton `sql` instance.
Create apps/api/src/db/migrate.ts — a migration runner that:
  - Reads numbered SQL files from src/db/migrations/ in order
  - Tracks applied migrations in a schema_migrations table
  - Is idempotent (safe to run multiple times)

Migrations to create (numbered 001–007):

001_extensions.sql:
  CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
  CREATE EXTENSION IF NOT EXISTS vector;

002_organisations.sql:
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()

003_projects.sql:
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  org_id uuid REFERENCES organisations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  status text DEFAULT 'active' CHECK (status IN ('active','archived')),
  document_count int DEFAULT 0,
  epic_count int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()

004_documents.sql:
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  filename text NOT NULL,
  mime_type text NOT NULL,
  minio_key text NOT NULL,
  size_bytes int NOT NULL,
  status text DEFAULT 'pending'
    CHECK (status IN ('pending','processing','extracted','failed')),
  created_at timestamptz DEFAULT now()

005_extraction_jobs.sql:
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  document_id uuid REFERENCES documents(id) ON DELETE CASCADE,
  status text DEFAULT 'queued'
    CHECK (status IN ('queued','processing','complete','failed')),
  progress int DEFAULT 0,
  stage text,
  model text,
  prompt_tokens int DEFAULT 0,
  completion_tokens int DEFAULT 0,
  cache_read_tokens int DEFAULT 0,
  cache_write_tokens int DEFAULT 0,
  cost_usd numeric(10,6) DEFAULT 0,
  latency_ms int,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()

006_epics_and_stories.sql:
  epics:
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
    document_id uuid REFERENCES documents(id) ON DELETE CASCADE,
    title text NOT NULL,
    description text NOT NULL,
    priority text DEFAULT 'medium'
      CHECK (priority IN ('high','medium','low')),
    confidence numeric(3,2),
    embedding vector(1536),
    metadata jsonb DEFAULT '{}',
    created_at timestamptz DEFAULT now()

  stories:
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    epic_id uuid REFERENCES epics(id) ON DELETE CASCADE,
    title text NOT NULL,
    description text NOT NULL,
    persona text,
    acceptance_criteria jsonb DEFAULT '[]',
    priority text DEFAULT 'medium'
      CHECK (priority IN ('high','medium','low')),
    story_points int,
    confidence numeric(3,2),
    created_at timestamptz DEFAULT now()

007_embeddings.sql:
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  org_id uuid REFERENCES organisations(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('epic','story','document')),
  source_id uuid NOT NULL,
  content text NOT NULL,
  embedding vector(1536) NOT NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()

  CREATE INDEX ON embeddings USING hnsw (embedding vector_cosine_ops);
  CREATE INDEX ON embeddings (org_id, project_id);
  CREATE INDEX ON epics USING hnsw (embedding vector_cosine_ops);

Seed file (src/db/seed.ts):
  Insert one organisation: { name: 'Acme Corp', slug: 'acme' }
  Insert two projects for that org: 'E-commerce Platform', 'Mobile Banking App'

Add to package.json scripts:
  db:migrate: tsx src/db/migrate.ts
  db:seed: tsx src/db/seed.ts

Run migrate and seed as part of `make migrate` and `make seed`.
```

---

## Phase 2 — MinIO Storage Module

```
Build the MinIO storage client in apps/api/src/storage/minio.ts.

Use the `minio` npm package.

Export a StorageClient class with these methods:

  uploadDocument(params: {
    buffer: Buffer
    filename: string
    mimeType: string
    projectId: string
  }): Promise<{ key: string; size: number }>
    - Key pattern: documents/{projectId}/{uuid}-{filename}
    - Returns the key (not a URL — presigned URLs are separate)

  downloadDocument(key: string): Promise<Buffer>
    - Stream to buffer

  getPresignedUrl(key: string, expirySeconds = 3600): Promise<string>
    - For temporary download links in the frontend

  deleteDocument(key: string): Promise<void>

  ensureBucket(): Promise<void>
    - Create the bucket if it doesn't exist
    - Called on app startup

  healthCheck(): Promise<boolean>
    - Returns true if MinIO is reachable, false otherwise

Export a singleton: export const storage = new StorageClient()

Call storage.ensureBucket() in the Hono app startup (in src/index.ts).

Add error handling: wrap all MinIO errors in a StorageError class with
the original error attached. Never throw raw MinIO SDK errors.
```

---

## Phase 3 — BullMQ Queue + Redis Pub/Sub

```
Set up the job queue layer in apps/api/src/queue/.

Files to create:

src/queue/connection.ts:
  - Export a Redis IORedis instance for BullMQ (REDIS_URL from env)
  - Export a separate IORedis instance for pub/sub (subscriber)
  - Export a third IORedis instance for pub/sub publishing
  (BullMQ requires its own connection; pub/sub needs two separate ones)

src/queue/types.ts:
  ExtractionJobData: {
    documentId: string
    projectId: string
    orgId: string
    filename: string
  }

  ProgressEvent: {
    jobId: string
    stage: ProgressStage  (from shared types)
    percent: number
    message: string
    tokensUsed?: number
    costUsd?: number
  }

  ProgressStage enum:
    'queued' | 'downloading' | 'parsing' | 'extracting_epics' |
    'extracting_stories' | 'embedding' | 'saving' | 'complete' | 'failed'

src/queue/extraction-queue.ts:
  - Export extractionQueue: new Queue('extraction', { connection })
  - Export addExtractionJob(data: ExtractionJobData): Promise<string>
    returns the BullMQ job ID

src/queue/progress.ts:
  - publishProgress(jobId: string, event: ProgressEvent): Promise<void>
    publishes to Redis channel `progress:${jobId}`
  - subscribeToProgress(jobId: string,
      handler: (event: ProgressEvent) => void): () => void
    subscribes to the channel, returns an unsubscribe function

src/queue/worker.ts:
  - Create a BullMQ Worker on the 'extraction' queue
  - Concurrency: 2
  - On each job:
    1. Publish progress: stage=downloading, percent=5
    2. Download file buffer from MinIO
    3. Publish progress: stage=parsing, percent=15
    4. Parse document (mammoth or pdf-parse based on mime_type)
    5. Publish progress: stage=extracting_epics, percent=25
    6. Call extractRequirements() — handle the async generator
       publishing progress events as they arrive
    7. Publish progress: stage=saving, percent=90
    8. Save epics, stories, embeddings to postgres
    9. Update extraction_jobs record with tokens + cost
    10. Update document status to 'extracted'
    11. Update project epic_count and document_count
    12. Publish progress: stage=complete, percent=100
  - On failure: update extraction_jobs.status='failed', store error
  - Retry: 3 attempts, exponential backoff (1s, 4s, 16s)
  - Log every stage transition as structured JSON:
    { level: 'info', jobId, stage, durationMs, timestamp }

Export startWorker() function called from src/index.ts on startup.
```

---

## Phase 4 — Claude AI Pipeline

```
Build the AI layer in apps/api/src/ai/.
Use @anthropic-ai/sdk. Pin model to 'claude-sonnet-4-5-20251022'. Never use 'latest'.

src/ai/schemas.ts — Zod schemas:

  EpicExtraction:
    title: z.string()
    description: z.string()
    priority: z.enum(['high', 'medium', 'low'])
    confidence: z.number().min(0).max(1)
    rationale: z.string()  (why this was identified as an epic)

  StoryExtraction:
    title: z.string()
    description: z.string()  (As a [persona], I want [action], so that [benefit])
    persona: z.string()
    acceptance_criteria: z.array(z.string())  (Given/When/Then format)
    priority: z.enum(['high', 'medium', 'low'])
    story_points: z.union([z.literal(1), z.literal(2), z.literal(3),
      z.literal(5), z.literal(8), z.literal(13)])
    confidence: z.number().min(0).max(1)

  ExtractionResult:
    epics: z.array(EpicExtraction)
    document_type: z.string()
    extraction_notes: z.string()

src/ai/cost.ts — token cost calculator:
  calculateCost(usage: {
    inputTokens: number
    outputTokens: number
    cacheReadTokens: number
    cacheWriteTokens: number
    model: string
  }): number
  Use Sonnet pricing: input $3/MTok, output $15/MTok,
  cache read $0.30/MTok, cache write $3.75/MTok

src/ai/prompts.ts:
  EXTRACTION_SYSTEM_PROMPT:
    Role: Expert business analyst and product manager.
    Task: Extract structured requirements from documents.
    Rules:
      - Only extract what is explicitly stated or strongly implied
      - Set confidence < 0.6 for anything inferred or ambiguous
      - Do not hallucinate requirements
      - Acceptance criteria must follow Given/When/Then format
      - User stories must follow As a/I want/So that format
    Include 2 examples of good vs bad extraction.

  CHAT_SYSTEM_PROMPT:
    Role: Requirements gathering assistant.
    Task: Guide user through defining their project via conversation.
    Process: Ask about stakeholders, goals, constraints, key features.
    When enough information is gathered, signal completion via
    a 'requirements_complete' tool call with a PRD summary.

src/ai/extractor.ts:

  extractRequirements(params: {
    documentText: string
    documentId: string
    onProgress: (stage: string, percent: number, tokensUsed: number) => void
  }): Promise<{
    epics: EpicExtraction[]
    totalInputTokens: number
    totalOutputTokens: number
    totalCacheReadTokens: number
    costUsd: number
  }>

  Implementation (two-pass strategy):
  PASS 1 — Extract epics:
    Single Claude call with tool_use.
    Tool name: 'extract_epics'
    Tool input schema: { epics: EpicExtraction[], document_type, extraction_notes }
    System prompt: EXTRACTION_SYSTEM_PROMPT
    User message: "Extract all epics from this document:\n\n{documentText}"
    On Zod validation failure: retry once, appending validation errors to message.
    Log: { pass: 1, model, inputTokens, outputTokens, latencyMs }

  PASS 2 — Extract stories per epic:
    For each epic, one Claude call.
    Tool name: 'extract_stories'
    Tool input schema: { stories: StoryExtraction[] }
    User message: "Extract user stories for this epic:\n
      Epic: {epic.title}\n{epic.description}\n\nFrom document:\n{documentText}"
    Accumulate token counts.
    Call onProgress after each epic with updated percent and token count.

  Return accumulated results and totals.

src/ai/embeddings.ts:
  generateEmbedding(text: string): Promise<number[]>
  generateBatchEmbeddings(texts: string[]): Promise<number[][]>
  Use OpenAI text-embedding-3-small (1536 dimensions).
  Batch in groups of 100. Add 100ms delay between batches.

src/ai/chat.ts:
  streamChat(params: {
    messages: ChatMessage[]
    onChunk: (text: string) => void
    onComplete: (message: string, requirementsComplete?: PRDSummary) => void
  }): Promise<void>

  PRDSummary type:
    title: string
    overview: string
    stakeholders: string[]
    epics_outline: Array<{ title: string; description: string }>

  Use Claude streaming API.
  Include a 'requirements_complete' tool in the tools array.
  If that tool is called, parse the input as PRDSummary and pass to onComplete.
  Log every call as structured JSON.
```

---

## Phase 5 — Hono API Routes

```
Build all API routes in apps/api/src/routes/ and wire them in src/index.ts.

src/index.ts setup:
  - Create Hono app
  - Add logger middleware (structured JSON logs)
  - Add CORS middleware (origin from CORS_ORIGIN env)
  - Add error handling middleware (return { error, code, statusCode })
  - Mount all route modules
  - On startup: call storage.ensureBucket(), run migrations, startWorker()
  - /health route: check postgres (SELECT 1), redis (PING), minio healthCheck()
    Return { status, services: { postgres, redis, minio }, uptime }

src/routes/documents.ts — POST /api/documents/upload:
  - Accept multipart/form-data: file (File), projectId (string)
  - Validate: file must exist, mime_type in
    ['application/pdf', 'application/vnd.openxmlformats-...wordprocessingml.document']
  - Max size: 20MB (reject with 413 if larger)
  - Upload to MinIO via storage.uploadDocument()
  - Insert into documents table
  - Insert into extraction_jobs table (status: 'queued')
  - Call addExtractionJob({ documentId, projectId, orgId, filename })
  - Return 202: { documentId, jobId, message: 'Extraction queued' }

src/routes/jobs.ts — GET /api/jobs/:jobId/progress (SSE):
  - Use streamSSE from 'hono/streaming'
  - Subscribe to Redis progress events for this jobId
  - Send each event as SSE: data: JSON.stringify(progressEvent)
  - Also poll extraction_jobs table every 3s as fallback
    (in case pub/sub message was missed)
  - Send SSE comment (': keepalive') every 15s to prevent timeout
  - On complete or failed: send final event then close stream
  - Clean up subscription on stream close

  Also add: GET /api/jobs/:jobId — return extraction_jobs row (for polling fallback)

src/routes/projects.ts:
  GET /api/projects?orgId=:
    Return projects with document_count and epic_count

  POST /api/projects:
    Body: { orgId, name, description }
    Insert and return new project

  GET /api/projects/:id:
    Return project with all epics, each epic with its stories
    Order epics by priority (high first) then created_at

  GET /api/projects/:id/search?q=:
    - Generate embedding for the query
    - Run pgvector query on embeddings table scoped to project_id:
      SELECT source_type, source_id, content, metadata,
        1 - (embedding <=> $1) AS similarity
      FROM embeddings
      WHERE project_id = $2
      ORDER BY embedding <=> $1
      LIMIT 10
    - Filter results where similarity > 0.7
    - Return with similarity scores

src/routes/epics.ts:
  GET /api/epics/:id — return epic with stories
  PATCH /api/epics/:id — update title, description, or priority
  DELETE /api/epics/:id — soft delete (add deleted_at column)

src/routes/chat.ts — POST /api/chat/stream:
  Body: { messages: ChatMessage[], projectId?: string }
  Use Hono streaming response (Content-Type: text/event-stream)
  Call streamChat() passing onChunk to write SSE chunks
  If requirementsComplete callback fires:
    - Create a project (if projectId not provided)
    - Create a document record from the chat summary
    - Enqueue an extraction job
    - Send a final SSE event: { type: 'requirements_complete', projectId }

src/routes/analytics.ts:
  GET /api/analytics/overview?orgId=:
    Query extraction_jobs joined with documents joined with projects
    Return: total_documents, total_cost_usd, avg_cost_per_document,
      total_epics, total_stories, avg_extraction_time_seconds,
      cache_hit_rate (cache_read_tokens / total input tokens * 100)

  GET /api/analytics/timeline?orgId=&days=30:
    GROUP BY date, return per-day: documents processed, cost, avg tokens

  GET /api/analytics/by_model?orgId=:
    GROUP BY model_used, return: total calls, total tokens, total cost, avg latency

Use Hono's zValidator middleware for all request bodies and query params.
All routes return camelCase JSON. DB columns are snake_case — transform on read.
```

---

## Phase 6 — Wire Worker to Pipeline

```
Connect the BullMQ worker in apps/api/src/queue/worker.ts to the full
extraction pipeline. This phase implements the complete job handler.

Replace the placeholder handler with:

async function processExtractionJob(job: Job<ExtractionJobData>) {
  const { documentId, projectId, orgId } = job.data
  const startTime = Date.now()

  // Update DB job status to 'processing'
  await sql`UPDATE extraction_jobs SET status='processing', started_at=now()
    WHERE id = ${job.id}`

  // STAGE 1: Download from MinIO
  await publishProgress(job.id, { stage: 'downloading', percent: 5,
    message: 'Downloading document...' })
  const buffer = await storage.downloadDocument(documentRecord.minio_key)

  // STAGE 2: Parse document
  await publishProgress(job.id, { stage: 'parsing', percent: 15,
    message: 'Parsing document...' })

  let documentText: string
  if (documentRecord.mime_type.includes('wordprocessingml')) {
    const result = await mammoth.extractRawText({ buffer })
    documentText = result.value
  } else {
    const result = await pdfParse(buffer)
    documentText = result.text
  }

  // Clean the text:
  documentText = documentText
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !/^\d+$/.test(line))  // remove page numbers
    .join('\n')

  // Truncate if over 150,000 chars (log warning)
  if (documentText.length > 150_000) {
    console.warn(JSON.stringify({ level: 'warn', jobId: job.id,
      message: 'Document truncated', originalLength: documentText.length }))
    documentText = documentText.slice(0, 150_000)
  }

  // STAGE 3-4: AI Extraction
  let totalTokens = 0
  const extractionResult = await extractRequirements({
    documentText,
    documentId,
    onProgress: (stage, percent, tokensUsed) => {
      totalTokens = tokensUsed
      publishProgress(job.id, { stage, percent,
        message: `Extracting ${stage}...`, tokensUsed })
    }
  })

  // STAGE 5: Generate embeddings
  await publishProgress(job.id, { stage: 'embedding', percent: 85,
    message: 'Generating embeddings...' })

  const epicTexts = extractionResult.epics.map(e => `${e.title}: ${e.description}`)
  const embeddings = await generateBatchEmbeddings(epicTexts)

  // STAGE 6: Save to database
  await publishProgress(job.id, { stage: 'saving', percent: 90,
    message: 'Saving results...' })

  // Insert epics (with embeddings)
  const epicIds: string[] = []
  for (let i = 0; i < extractionResult.epics.length; i++) {
    const epic = extractionResult.epics[i]
    const embedding = embeddings[i]
    const [row] = await sql`INSERT INTO epics (...) VALUES (...) RETURNING id`
    epicIds.push(row.id)

    // Insert stories for this epic
    for (const story of epic.stories) {
      await sql`INSERT INTO stories (...) VALUES (...)`
    }

    // Insert into embeddings table
    await sql`INSERT INTO embeddings (...) VALUES (...)`
  }

  // Update extraction_jobs with token counts and cost
  const costUsd = calculateCost({ ... })
  await sql`UPDATE extraction_jobs SET
    status='complete', progress=100, stage='complete',
    prompt_tokens=${extractionResult.totalInputTokens},
    completion_tokens=${extractionResult.totalOutputTokens},
    cache_read_tokens=${extractionResult.totalCacheReadTokens},
    cost_usd=${costUsd},
    latency_ms=${Date.now() - startTime},
    completed_at=now()
    WHERE id = ${job.id}`

  // Update document and project counts
  await sql`UPDATE documents SET status='extracted' WHERE id = ${documentId}`
  await sql`UPDATE projects SET
    epic_count = (SELECT COUNT(*) FROM epics WHERE project_id = ${projectId}),
    document_count = (SELECT COUNT(*) FROM documents WHERE project_id = ${projectId}),
    updated_at = now()
    WHERE id = ${projectId}`

  // Final progress event
  await publishProgress(job.id, {
    stage: 'complete', percent: 100,
    message: `Extracted ${extractionResult.epics.length} epics`,
    costUsd
  })
}

Install: mammoth, pdf-parse, @types/pdf-parse
```

---

## Phase 7 — React Frontend

```
Build the complete React frontend in apps/web/src/.

Design system (already configured in Tailwind):
  Dark theme. bg-background (#0f1117), bg-surface (#1a1f2e),
  border-border (#2d3748), text-text (#e2e8f0), text-muted (#718096),
  accent (#667eea), success (#68d391), warning (#f6e05e), danger (#fc8181)

src/lib/api.ts:
  Axios instance with baseURL from VITE_API_URL env variable.
  All request/response types imported from @specforge/shared.
  Export typed functions for every API endpoint.

src/lib/hooks.ts:
  React Query hooks:
    useProjects(orgId), useProject(id), useEpic(id),
    useAnalyticsOverview(orgId), useAnalyticsTimeline(orgId, days),
    useSearch(projectId, query) — debounced 300ms

src/App.tsx:
  React Router with these routes:
    / → Dashboard
    /upload → Upload
    /projects/:id → Project
    /chat → Chat
    /analytics → Analytics
  Wrap in QueryClientProvider and a simple auth context
  (hardcode orgId='acme-org-id' for now — no auth needed for demo)

src/components/Layout.tsx:
  Fixed sidebar (240px) + main content area.
  Sidebar: SpecForge logo, nav links with lucide-react icons,
    bottom section showing "Default Org".
  Top bar: page title + breadcrumb.
  Dark theme throughout.

src/pages/Dashboard.tsx:
  - 4 stat cards: Total Projects, Documents Processed, Epics Extracted,
    Total AI Cost (from analytics overview)
  - Projects grid: each card shows name, document count, epic count,
    last updated, "View" button
  - "New Project" button → modal with name + description fields

src/pages/Upload.tsx:
  - Project selector (dropdown of existing projects)
  - Drag-and-drop zone: accepts .pdf and .docx only
    Shows file icon, name, size on drop
  - "Start Extraction" button → POST /api/documents/upload
  - After submission: renders ExtractionProgress component

src/components/ExtractionProgress.tsx:
  - Opens EventSource to /api/jobs/:jobId/progress
  - Animated progress bar (CSS transition on width)
  - Stage label: maps ProgressStage to human-readable strings
  - Live token counter: ticks up as tokensUsed increases in events
  - Live cost display: "$0.0042" updating in real time
  - On complete: green checkmark, "View Results" button → /projects/:projectId
  - On failed: red X, error message, "Try Again" button
  - Fallback: if EventSource fails, poll /api/jobs/:jobId every 2s

src/pages/Project.tsx:
  - Project header: name, description, stat pills (X epics, Y stories, Z docs)
  - Search bar at top: calls useSearch() with 300ms debounce
    When results exist: highlight matching epics with a blue ring
  - Epic list: each epic is an accordion card
    Header: priority badge (colour coded), title, confidence bar, story count
    Expanded: description, then story cards
  - Story card: title, persona chip, story points badge, confidence,
    acceptance criteria as a checklist (checkboxes, decorative only)
  - Empty state: "No epics yet — upload a document to extract requirements"

src/pages/Chat.tsx:
  - Message thread (scrollable, newest at bottom)
  - User messages: right-aligned, accent background
  - Assistant messages: left-aligned, surface background
  - Input: textarea (Enter to send, Shift+Enter for newline) + Send button
  - Streams Claude response in real-time (fetch with ReadableStream on
    /api/chat/stream, parse SSE chunks)
  - When { type: 'requirements_complete' } event received:
    Show a banner: "Requirements captured ✓" with "View Project" button
  - Project selector at top: optional, attaches chat to a project

src/pages/Analytics.tsx:
  - 4 KPI cards: Total Docs, Total Cost, Avg Cost/Doc, Cache Hit Rate %
  - Line chart (recharts): daily cost for last 30 days
    X-axis: date, Y-axis: cost in USD, area fill with gradient
  - Bar chart: tokens by type (prompt, completion, cache_read, cache_write)
  - Table: recent extraction jobs
    Columns: document, project, model, tokens, cost, duration, status
    Status as coloured badge
  - Cost estimator panel:
    Input: docs/month (number input with +/- buttons)
    Output: estimated monthly cost based on avg cost/doc
    Shows Haiku/Sonnet/Opus tier breakdown

All components: strict TypeScript, no any. Loading skeletons on all
data-fetching components. Error boundaries on each page.
```

---

## Phase 8 — Cloud Run Deployment

```
Set up production deployment using Google Cloud Run (not nginx + PM2).

WHY CLOUD RUN over nginx + PM2:
  - Cloud Run manages process lifecycle — no PM2 needed
  - Autoscales to zero when idle (cost savings for a demo/portfolio project)
  - Built-in HTTPS, load balancing, and health checks
  - Deployable with one gcloud command or via Cloud Build CI/CD
  - Runs anywhere Docker runs — no server SSH required

1. apps/api/Dockerfile (multi-stage):

  Stage 1 (build):
    FROM node:20-slim AS builder
    Install pnpm
    Copy monorepo root (package.json, pnpm-lock.yaml, pnpm-workspace.yaml)
    Copy packages/shared and apps/api
    pnpm install --frozen-lockfile
    pnpm --filter @specforge/shared build
    pnpm --filter api build

  Stage 2 (runtime):
    FROM node:20-slim
    Copy only the built dist/ and node_modules (production only)
    ENV NODE_ENV=production PORT=8080
    EXPOSE 8080
    CMD ["node", "dist/index.js"]

  NOTE: Cloud Run expects port 8080 by default. Update Hono app to use
  process.env.PORT || 8080.

2. apps/web/Dockerfile (multi-stage):

  Stage 1 (build):
    FROM node:20-slim AS builder
    Build the Vite app (pnpm --filter web build)
    VITE_API_URL set to Cloud Run service URL at build time

  Stage 2 (serve):
    FROM nginx:alpine
    Copy dist/ to /usr/share/nginx/html
    Add minimal nginx.conf:
      - Serve static files
      - try_files for React Router (SPA fallback)
      - Gzip enabled
    EXPOSE 80

  NOTE: The web Dockerfile uses nginx only to serve static files locally
  or on Cloud Run — nginx here is just a static file server, not a
  reverse proxy. This is a valid modern use of nginx.
  For production, prefer Firebase Hosting (see step 4).

3. cloudbuild.yaml (GCP Cloud Build CI/CD):

  steps:
    - id: Build API image
      name: gcr.io/cloud-builders/docker
      args: [build, -t, gcr.io/$PROJECT_ID/specforge-api:$COMMIT_SHA,
        -f, apps/api/Dockerfile, .]

    - id: Push API image
      name: gcr.io/cloud-builders/docker
      args: [push, gcr.io/$PROJECT_ID/specforge-api:$COMMIT_SHA]

    - id: Deploy API to Cloud Run
      name: gcr.io/google.com/cloudsdktool/cloud-sdk
      args:
        - gcloud run deploy specforge-api
        - --image gcr.io/$PROJECT_ID/specforge-api:$COMMIT_SHA
        - --region me-central2  (Dammam — same region as Forge uses)
        - --platform managed
        - --allow-unauthenticated
        - --port 8080
        - --memory 1Gi
        - --cpu 1
        - --min-instances 0
        - --max-instances 10
        - --set-env-vars DATABASE_URL=$$DATABASE_URL,REDIS_URL=$$REDIS_URL,...
        - --set-secrets ANTHROPIC_API_KEY=anthropic-api-key:latest

    - id: Build web
      name: node:20-slim
      args: [sh, -c, pnpm install && pnpm --filter web build]
      env:
        - VITE_API_URL=https://specforge-api-xxxx-uc.a.run.app

    - id: Deploy web to Firebase Hosting
      name: gcr.io/google.com/cloudsdktool/cloud-sdk
      args: [firebase, deploy, --only, hosting, --project, $PROJECT_ID]

  substitutions:
    _REGION: me-central2

4. firebase.json (for web hosting):
  {
    "hosting": {
      "public": "apps/web/dist",
      "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
      "rewrites": [{ "source": "**", "destination": "/index.html" }]
    }
  }

5. Update Makefile with Cloud Run commands:
  deploy-api: gcloud builds submit --config cloudbuild.yaml
  deploy-web: firebase deploy --only hosting
  deploy: deploy-api and deploy-web
  cloud-run-logs: gcloud run services logs read specforge-api --region me-central2

6. .gcloudignore (ignore node_modules, .env, etc.)

7. Add a section to README.md: "Deployment" explaining:
   - Why Cloud Run over nginx+PM2 (the modern approach)
   - How to set up GCP project, enable Cloud Run API, set up Cloud Build trigger
   - How to provision Cloud SQL (managed Postgres) and Memorystore (managed Redis)
     for production (vs docker-compose for local dev)
   - Estimated Cloud Run cost for a portfolio project (~$0 with min-instances=0)
```

---

## Phase 9 — Token Analytics + Cost Dashboard

```
Complete the token economics dashboard — the feature that signals
production-minded AI engineering.

This phase extends Phase 5 analytics routes and Phase 7 analytics page
with richer data and a cost estimator.

Backend additions in src/routes/analytics.ts:

1. GET /api/analytics/overview?orgId= already built — ensure it includes:
   cache_hit_rate: (SUM(cache_read_tokens) / NULLIF(SUM(prompt_tokens), 0) * 100)
   This shows prompt caching effectiveness. A high cache hit rate means
   the system prompt is being cached efficiently — signals cost awareness.

2. GET /api/analytics/cost-estimate:
   Body: { docsPerMonth: number, avgPagesPerDoc: number }
   Logic:
     avgCharsPerPage = 3000
     avgTokensPerChar = 0.25
     estimatedInputTokens = docsPerMonth * avgPagesPerDoc * avgCharsPerPage * avgTokensPerChar
     Compute cost at three tiers:
       haiku: $0.80/MTok input, $4/MTok output
       sonnet: $3/MTok input, $15/MTok output
       opus: $15/MTok input, $75/MTok output
     Return all three with a recommended tier based on volume

3. Add a DB view for the analytics table query (create in a new migration 008):
   CREATE VIEW extraction_analytics AS
   SELECT
     ej.*,
     d.filename, d.mime_type, d.size_bytes,
     p.name as project_name, p.org_id,
     (SELECT COUNT(*) FROM epics WHERE document_id = d.id) as epic_count,
     (SELECT COUNT(*) FROM stories s
       JOIN epics e ON s.epic_id = e.id
       WHERE e.document_id = d.id) as story_count
   FROM extraction_jobs ej
   JOIN documents d ON ej.document_id = d.id
   JOIN projects p ON d.project_id = p.id

Frontend additions in src/pages/Analytics.tsx:

1. Cache efficiency card:
   Show cache_hit_rate as a percentage with a colour indicator:
   < 20%: red (not caching well)
   20-60%: yellow (moderate)
   > 60%: green (efficient caching)
   Tooltip: "Higher cache hit rate means lower costs. System prompts are
   being reused across API calls."

2. Cost estimator panel (interactive):
   Slider: docs/month (1 to 10,000)
   Slider: avg pages per doc (1 to 100)
   Three-column output: Haiku / Sonnet / Opus estimated monthly cost
   Highlight Sonnet as "Recommended" (Forge's primary model)
   Show: "At your current avg cost of $X/doc, this would cost $Y/month"

3. Model usage doughnut chart (recharts PieChart):
   Shows token distribution across models if multiple models used
   (useful if you implement Haiku for classification, Sonnet for extraction)

4. Recent jobs table with expandable rows:
   Expand a row to see: full token breakdown (prompt/completion/cache),
   document filename, extraction stages, any errors

This is the feature that tells a hiring engineer you think about AI in
production — not just "does it work" but "what does it cost and is it efficient."
```

---

## Phase 10 — README + DECISIONS.md + Polish

```
Write production-quality documentation for SpecForge.

README.md sections:

1. Header: SpecForge logo (ASCII art or emoji), one-line description,
   badges: TypeScript, Node.js, React, Claude API, pgvector

2. What it does (3 sentences max)

3. Architecture diagram in Mermaid:
   graph LR
     User -->|Upload PDF/DOCX| React
     React -->|POST /upload| Hono
     Hono -->|Enqueue| BullMQ
     BullMQ -->|Download| MinIO
     BullMQ -->|Parse| mammoth/pdfparse
     BullMQ -->|Extract| Claude[Claude API]
     Claude -->|Structured JSON| BullMQ
     BullMQ -->|Store epics/stories| PostgreSQL
     BullMQ -->|Store embeddings| pgvector[PostgreSQL/pgvector]
     BullMQ -->|Progress events| Redis
     Redis -->|SSE stream| React
     React -->|Search| Hono
     Hono -->|Vector query| pgvector

4. Tech stack table with one-line rationale per choice

5. Prerequisites: Docker Desktop, Node 20+, pnpm, Anthropic API key,
   OpenAI API key (embeddings)

6. Getting started:
   git clone ...
   cp .env.example .env  # add your API keys
   make dev              # starts postgres/redis/minio + runs both apps
   make migrate          # runs DB migrations
   make seed             # creates demo org and projects
   # Open http://localhost:5173

7. How the extraction pipeline works:
   Two-pass Claude strategy, why two passes, Zod validation + retry,
   token logging, cost tracking

8. API reference table (endpoint, method, description)

9. Deployment: Cloud Run vs nginx+PM2 (brief explanation of why Cloud Run)

10. Roadmap:
    - Multi-tenant auth (Clerk or Supabase Auth)
    - Figma MCP integration for wireframe generation
    - Intelligent project classification (Haiku model routing)
    - Export to Jira/Linear/Notion

---

DECISIONS.md — 5 Architectural Decision Records:

Format for each:
  ## ADR-00N: [Title]
  **Status:** Accepted
  **Date:** [today]
  **Context:** [the problem]
  **Decision:** [what we chose]
  **Alternatives considered:** [table of alternatives with reasons rejected]
  **Consequences:** [what this enables and what it forecloses]

ADR-001: pgvector over a dedicated vector database (Pinecone/Qdrant)
ADR-002: BullMQ over AWS SQS or Temporal for async job processing
ADR-003: Anthropic Claude over OpenAI GPT-4 for requirements extraction
ADR-004: Hono over Express or Fastify for the API layer
ADR-005: Cloud Run over nginx+PM2 for deployment

The ADRs are what a senior hiring engineer reads to assess your
architectural thinking. Make each one substantive — real tradeoffs,
not just "X is better than Y."

---

Final polish checklist:
  [ ] All TypeScript strict — zero 'any' types
  [ ] All routes have Zod validation
  [ ] All errors return { error: string, code: string }
  [ ] Health endpoint returns real service status
  [ ] All Claude calls log model + tokens + latency as structured JSON
  [ ] Model version pinned (never 'latest')
  [ ] Zod validation + retry loop on extraction
  [ ] README has a live demo URL (deploy to Cloud Run free tier)
  [ ] DECISIONS.md has 5 complete ADRs
  [ ] GitHub repo is public with a clean commit history
  [ ] Add the GitHub URL and live demo link to your CV under Projects
```

---

## Key Things That Will Impress Arkitekt

In order of impact:

**1. The two-pass Claude extraction strategy** — most candidates would do one big prompt. Two passes with Zod validation and a retry loop on failure shows you've thought about production reliability, not just "it works."

**2. The token economics dashboard** — specifically the cache hit rate metric. Knowing about prompt caching signals you've worked with Claude at scale, not just in demos.

**3. DECISIONS.md** — most portfolio projects have no documentation. Five real ADRs with genuine tradeoff analysis is what Staff-level engineers write. A hiring manager will read this before looking at a single line of code.

**4. ADR-005 on Cloud Run vs nginx+PM2** — showing you understand why they use it, that it's pragmatic but dated, and what the modern alternative looks like — without being dismissive — is exactly the kind of contextual judgment a Staff role requires.

**5. pgvector with org_id scoping** — the multi-tenant filter on the vector query (`WHERE org_id = $1 AND project_id = $2`) shows you've thought about what happens when this has real enterprise customers, not just a demo with one user.

---

## Phase 11 — Engineering Documentation Suite

```
Generate the full engineering documentation suite for SpecForge.
This phase produces four documents that demonstrate staff-level
operational thinking. Write them as real, substantive documents —
not placeholders.

---

DOCUMENT 1: DECISIONS.md

Five complete ADRs in this format:

  ## ADR-00N: [Title]
  **Status:** Accepted
  **Date:** [today]

  ### Context
  [The problem and constraints that made this decision necessary]

  ### Decision
  [What we chose, in one sentence, then elaboration]

  ### Alternatives Considered
  | Option | Why Rejected |
  |--------|-------------|
  | ...    | ...         |

  ### Consequences
  [What this enables, what it forecloses, when to revisit]

ADR-001: pgvector over a dedicated vector database
  Context: needed vector similarity search for semantic search across
  extracted epics. Options: Pinecone, Qdrant, Weaviate, pgvector.
  Decision: pgvector. Key reason: filtered vector search with SQL JOINs
  eliminates a whole class of consistency bugs. Scale threshold to revisit:
  ~10M vectors or when query p99 exceeds 200ms.

ADR-002: BullMQ over AWS SQS or Temporal
  Context: document extraction is slow (10-90 seconds). Cannot be handled
  synchronously. Need durable job queues with progress events for the
  frontend SSE stream.
  Decision: BullMQ on Redis. Redis already in stack for caching.
  BullMQ adds zero infra overhead and has native progress events.
  Temporal considered — correct for complex multi-step workflows but
  operationally heavy for current stage. Revisit if extraction pipeline
  grows beyond 5 sequential steps.

ADR-003: Anthropic Claude over OpenAI GPT-4
  Context: core extraction task requires reliable structured JSON output
  from noisy, real-world documents. Two key requirements: large context
  window (full BRD in one pass) and reliable tool use for schema enforcement.
  Decision: Claude Sonnet. 200K context window, more reliable tool use
  on complex nested schemas in testing, prompt caching makes repeated
  system prompts ~10x cheaper on cache hits.
  Revisit trigger: if GPT-4o or Gemini 2.5 Pro demonstrates materially
  better extraction accuracy on our eval set.

ADR-004: Hono over Express or Fastify
  Context: Node.js API framework selection. Requirements: TypeScript-first,
  native SSE streaming (for job progress), lightweight, modern.
  Decision: Hono. Native streaming support is the deciding factor — SSE
  from BullMQ progress events to frontend requires clean streaming primitives
  that Express middleware chains handle awkwardly. Hono's RPC client
  generation also gives us frontend type safety for free.

ADR-005: Cloud Run over nginx + PM2 on a VM
  Context: production deployment target on GCP. Prior pattern in the
  team is nginx + PM2 on a GCE VM. Evaluating whether to continue that
  pattern or move to managed containers.
  Decision: Cloud Run.
  nginx + PM2 is a valid pattern but requires: SSH access, manual scaling,
  PM2 config, SSL cert renewal automation, OS patching. All of this is
  operational overhead that Cloud Run eliminates.
  Cloud Run: give GCP a Docker container, get HTTPS + load balancing +
  autoscaling for free. Scales to zero when idle (significant cost saving
  for a portfolio project). Cold starts mitigated with min-instances=1
  in production.
  Note: nginx is still used in the web Dockerfile to serve the static
  Vite build — this is a valid use of nginx as a static file server,
  distinct from using it as a reverse proxy in front of Node.js.

---

DOCUMENT 2: RUNBOOK.md

A complete operational runbook for the extraction pipeline.

Sections:

  ## Overview
  What SpecForge does. What healthy looks like (metrics, expected latency,
  expected cost per document).

  ## Architecture
  Mermaid diagram of the extraction pipeline flow.

  ## Health Checks
  How to verify each component is healthy:
    - API: GET /health endpoint, expected response
    - PostgreSQL: pg_isready, check pg_stat_activity for long queries
    - Redis: redis-cli PING, check memory usage
    - MinIO: GET /minio/health/live
    - BullMQ workers: check active/waiting/failed job counts
    - Cloud Run: GCP console, request count and error rate

  ## Common Operations
  Step-by-step instructions for:
    - Deploy a new API version to Cloud Run
    - Roll back to previous Cloud Run revision
    - Run database migrations in production
    - Manually retry a failed extraction job
    - Clear a stuck BullMQ queue
    - Rotate the Anthropic API key

  ## Alert Responses
  For each alert, include: meaning, likely causes (ordered by frequency),
  and diagnostic steps.

  Alert 1: extraction_failure_rate > 10% in 5 minutes
    Causes: Claude API outage, schema validation failures, Redis down
    Steps: check status.anthropic.com, check extraction_jobs error column,
    check Redis connectivity

  Alert 2: extraction_job_queue_depth > 50
    Causes: worker crashed, throughput spike, Claude API slowdown
    Steps: check BullMQ dashboard, check worker logs, check Cloud Run
    instance count

  Alert 3: avg_cost_per_document spike (> 2x baseline)
    Causes: model routing misconfiguration, unusually long documents,
    prompt caching miss (system prompt changed)
    Steps: check extraction_jobs for model_used distribution,
    check cache_read_tokens vs prompt_tokens ratio

  Alert 4: p99 extraction latency > 120 seconds
    Causes: Claude API slowdown, large documents, embedding batch backup
    Steps: check Claude API status, check document sizes in recent jobs,
    check embedding generation latency separately

  ## Escalation
  Who to contact and when. What information to include in an escalation.

---

DOCUMENT 3: POST_MORTEM_TEMPLATE.md

A filled-in example post-mortem based on a realistic incident
for an AI extraction platform. Use this scenario:

  Incident: Extraction accuracy dropped from ~85% to ~55% over 48 hours.
  No error rate increase. No latency increase. Detected by a user
  reporting poor quality results, not by automated monitoring.
  Root cause: Claude model alias (not a pinned version) was updated
  by Anthropic to a new model version. The new version is more conservative
  about inferring requirements, producing fewer epics per document.
  The eval set had not been run since the previous deployment (3 weeks prior).

Fill in the full post-mortem template with this scenario:
  - Realistic timeline with plausible timestamps
  - Thorough root cause analysis (go 5 levels deep with "why")
  - Contributing factors (no eval in CI, no accuracy monitoring,
    model alias instead of pinned version, no model version in logs)
  - What went well (user reported it, rollback was fast once identified)
  - 6-8 concrete action items with owners and due dates
  - Lessons learned section with 3 substantive lessons

The post-mortem should read as if it was written by a senior engineer
who has done this before — honest, specific, blameless, and focused
on systemic fixes rather than individual mistakes.

---

DOCUMENT 4: Definition of Done (add to README.md as a section)

Add a "## Contributing" section to README.md with our Definition of Done:

A pull request is ready to merge when:

CODE
  [ ] All existing tests pass (pnpm test)
  [ ] New behaviour has test coverage
  [ ] Zero TypeScript errors (pnpm typecheck)
  [ ] No 'any' types introduced
  [ ] ESLint passes with zero warnings

OBSERVABILITY
  [ ] New operations emit structured JSON logs with event name + context
  [ ] New Claude API calls log model, tokens, latency, cost
  [ ] New failure modes have typed error classes

DOCUMENTATION
  [ ] JSDoc on all new exported functions
  [ ] ADR written for any significant architectural decision
  [ ] RUNBOOK.md updated if operational procedures changed
  [ ] CHANGELOG.md entry added

PRODUCTION READINESS
  [ ] No hardcoded secrets or environment-specific values
  [ ] Pinned dependency versions (no ^ or ~ in package.json for core deps)
  [ ] Feature flagged if behaviour might need to be disabled quickly
  [ ] PR description explains the why, not just the what
```

---

## Deliverables Summary

After all 11 phases, SpecForge will have:

| File | Purpose |
|---|---|
| `README.md` | Setup, architecture diagram, API reference, DoD |
| `DECISIONS.md` | 5 ADRs covering every major stack choice |
| `RUNBOOK.md` | Operational guide: health checks, alerts, common ops |
| `POST_MORTEM_TEMPLATE.md` | Example incident analysis for AI quality degradation |
| `docs/` | Any RFCs written during development |
| `cloudbuild.yaml` | Cloud Run CI/CD pipeline |
| `docker-compose.yml` | Local dev environment |
| `Makefile` | All common operations as named commands |

The documentation suite alone — before a single line of application code
is read — tells a hiring engineer that this was built by someone who thinks
about production systems, not just working demos.
