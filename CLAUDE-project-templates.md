# CLAUDE.md Templates for Different Project Types
# Copy the relevant template to your project root as CLAUDE.md
# The global ~/.claude/CLAUDE.md handles universal standards —
# these templates only add what's project-specific.

---

## How the System Works

```
~/.claude/CLAUDE.md              ← YOUR IDENTITY + UNIVERSAL STANDARDS
                                    Write once. Never changes between projects.
                                    Covers: TypeScript/Python standards, LLM patterns,
                                    pgvector syntax, error handling, logging, deployment.

~/projects/specforge/CLAUDE.md   ← PROJECT CONTEXT
                                    One per repo. Covers: what this project is,
                                    local services, key files, pinned versions,
                                    project-specific conventions.
```

Claude Code reads both and merges them automatically.
You never need to paste your standards again — they're always there.

---

## Template 1: Python AI Backend (FastAPI + LangChain/LangGraph)

```markdown
# [Project Name] — Claude Code Context
# Location: ./CLAUDE.md

## What This Project Is
[One paragraph: what it does, who uses it, what problem it solves]

## Stack
- Runtime: Python 3.11+
- API: FastAPI with async/await throughout
- AI: LangGraph for agentic workflows / LangChain for chains
- Database: PostgreSQL via asyncpg + SQLAlchemy Core (not ORM)
- Queue: Celery + Redis (or RQ if simpler)
- Package manager: uv (not pip, not poetry)

## Local Services
PostgreSQL: localhost:5432
Redis:      localhost:6379
Run with:   docker-compose up -d

## Key Files
src/core/database.py     AsyncPG session factory — use this
src/core/settings.py     Pydantic Settings — all env vars here
src/ai/prompts/          Prompt files with version metadata
src/ai/chains/           LangChain/LangGraph definitions
src/models/              SQLAlchemy table definitions
alembic/versions/        Migrations — never modify existing

## Pinned Model Versions
CLAUDE_MODEL = "claude-sonnet-4-5-20251022"
OPENAI_MODEL = "gpt-4o-2024-11-20"
EMBEDDING_MODEL = "text-embedding-3-small"

## Python Conventions
- Type hints on everything including return types
- Pydantic models for all API request/response schemas
- structlog for all logging (never print(), never bare logging.info())
- async/await throughout — no synchronous DB or HTTP calls in route handlers
- Dependencies via FastAPI Depends() — never instantiate services in route handlers
- Alembic for all schema changes — never ALTER TABLE manually

## LangGraph Conventions
- State is a TypedDict — always fully typed
- Nodes are pure functions where possible (easier to test)
- Checkpointing via PostgresSaver for production persistence
- Log state transitions: entry node name + state summary at each step

## FastAPI Conventions
- All routes in routers/ — never define routes in main.py
- Dependency injection for DB sessions, settings, AI clients
- HTTPException with specific status codes and detail messages
- Background tasks via BackgroundTasks for fire-and-forget, Celery for durable

## Environment
.env.example committed, .env gitignored
All required vars validated at startup via Settings (Pydantic BaseSettings)
App crashes with clear message if required var is missing
```

---

## Template 2: TypeScript Fullstack SaaS (Next.js + Prisma)

```markdown
# [Project Name] — Claude Code Context
# Location: ./CLAUDE.md

## What This Project Is
[One paragraph description]

## Stack
- Frontend + API: Next.js 14 App Router (TypeScript)
- Database ORM: Prisma with PostgreSQL
- Auth: Clerk (or NextAuth if noted)
- Styling: Tailwind CSS
- Package manager: pnpm

## Local Services
PostgreSQL: localhost:5432
Run with:   docker-compose up -d

## Key Files
prisma/schema.prisma     Source of truth for DB schema
src/lib/prisma.ts        Prisma client singleton — always import this
src/lib/auth.ts          Auth helpers and session utilities
src/server/             Server Actions and API route handlers
src/components/ui/      Shared UI components (shadcn/ui based)

## Prisma Conventions
- Never use raw SQL unless Prisma can't express it
- Always use prisma.$transaction() for multi-step writes
- Select only needed fields — never findMany() without select
- Use cursor-based pagination (not offset) for large tables

## Next.js App Router Conventions
- Server Components by default — only add 'use client' when needed
  (event handlers, useState, useEffect require client)
- Server Actions for mutations — not API routes for internal calls
- Loading states via loading.tsx, errors via error.tsx
- Never fetch() in client components — use Server Components or SWR

## Auth Conventions (Clerk)
- auth() in Server Components, useAuth() in Client Components
- Middleware in middleware.ts protects all /dashboard/* routes
- org_id from auth().orgId — always scope data queries to org

## Environment
NEXT_PUBLIC_* vars are exposed to browser — never put secrets there
Required: DATABASE_URL, CLERK_SECRET_KEY, NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
```

---

## Template 3: Node.js Microservice (Hono + BullMQ)

```markdown
# [Project Name] — Claude Code Context
# Location: ./CLAUDE.md

## What This Project Is
[One paragraph description]
Standalone service: [what it processes / what it produces]

## Stack
- Runtime: Node.js 20, TypeScript strict
- API: Hono on @hono/node-server
- Queue: BullMQ + Redis
- Database: PostgreSQL via postgres npm package
- Package manager: pnpm

## Local Services
PostgreSQL: localhost:5432
Redis:      localhost:6379
Run with:   docker-compose up -d

## Key Files
src/index.ts         Entry point — app init + worker start
src/db/client.ts     Postgres singleton
src/queue/           BullMQ queue definitions + worker
src/routes/          Hono route handlers
src/ai/              Any LLM integration

## Hono Reminders (also in global CLAUDE.md but repeating for emphasis)
SSE import:  'hono/streaming' not 'hono/sse'
Use:         streamSSE(c, async (stream) => { ... })
Validator:   zValidator from '@hono/zod-validator'

## BullMQ Reminders
Concurrency: [set based on external API limits]
Retry:       3 attempts, exponential backoff { delay: 1000 }
Always:      update job.updateProgress() at each stage
Always:      log job lifecycle events (completed, failed, stalled)

## Deployment
Target: Cloud Run on GCP
Port:   8080 (not 3000)
Image:  multi-stage Docker build (node:20-slim runtime)
```

---

## Template 4: Data Pipeline / ML System (Python)

```markdown
# [Project Name] — Claude Code Context
# Location: ./CLAUDE.md

## What This Project Is
[One paragraph: data sources, transformations, outputs, consumers]

## Stack
- Language: Python 3.11+
- Pipeline orchestration: Prefect (or Airflow if noted)
- Data processing: Pandas / Polars (note which)
- Storage: S3-compatible (MinIO locally, AWS S3 in prod)
- Database: PostgreSQL for metadata + results
- Package manager: uv

## Local Services
PostgreSQL: localhost:5432
MinIO:      localhost:9000
Run with:   docker-compose up -d

## Key Files
src/flows/          Prefect flow definitions
src/tasks/          Individual pipeline tasks
src/models/         Pydantic models for data contracts
src/storage/        S3 client wrapper
config/             Environment-specific configs

## Data Contract Conventions
Every pipeline stage has typed input and output Pydantic models.
Never pass raw dicts between stages — always validate at boundaries.
Schema changes require a new model version (DatasetV2, not modifying V1).

## Logging
structlog with JSON formatter.
Every task logs: task_name, run_id, input_record_count, output_record_count,
duration_ms, error (if any).
Never use print() — not even for debugging. Use logger.debug().

## LLM Usage (if applicable)
Same standards as global CLAUDE.md.
Additional: track tokens and cost per pipeline run in the metadata DB.
Alert if cost per run exceeds 2x the baseline.
```

---

## Template 5: React Native Mobile App

```markdown
# [Project Name] — Claude Code Context
# Location: ./CLAUDE.md

## What This Project Is
[One paragraph: what the app does, target users, platforms]

## Stack
- Framework: React Native with Expo (managed workflow)
- Language: TypeScript strict
- Navigation: React Navigation v6
- State: Zustand (local) + React Query (server)
- API: [backend URL]
- Package manager: pnpm (or npm if Expo requires)

## Key Files
src/navigation/       Stack + tab navigators
src/screens/          Screen components (one file per screen)
src/components/       Reusable components
src/lib/api.ts        Typed API client
src/store/            Zustand stores

## React Native Conventions
- No DOM — View/Text/ScrollView/Pressable, not div/p/button
- Navigation: useNavigation() hook, never direct import of navigator
- Platform differences: Platform.select() for OS-specific styles
- Keyboard handling: KeyboardAvoidingView on forms
- Safe areas: useSafeAreaInsets() — never hardcode status bar height

## Expo Conventions
- expo-secure-store for sensitive data (tokens, keys) — never AsyncStorage
- expo-router if using file-based routing (note if this project uses it)
- EAS Build for production builds — never bare expo build

## Offline / Network
Assume poor connectivity. Every data-fetching component handles:
loading state, error state, empty state, and offline state.
React Query's staleTime and gcTime configured for mobile usage patterns.
```

---

## When to Add a New Template

Create a new template when you start a project that uses a meaningfully
different stack. Copy the closest existing template, change what's
different, remove what doesn't apply.

Rule of thumb: if you find yourself explaining the same thing to Claude Code
twice in different projects, it belongs in either the global file (if it
applies to all projects) or a new template (if it applies to one category).

---

## Installation

```bash
# Create the global file
mkdir -p ~/.claude
cp CLAUDE-global.md ~/.claude/CLAUDE.md

# For each project, copy the relevant template
cp CLAUDE-specforge-project.md ~/projects/specforge/CLAUDE.md

# Verify Claude Code reads it
cd ~/projects/specforge
claude "What are the local service ports for this project?"
# Should answer from CLAUDE.md without you telling it
```

---

## Maintenance

**Global file** — review and update when:
- You adopt a new standard tool (e.g. switching from npm to pnpm everywhere)
- You learn a new pattern that should apply universally
- A library API changes (e.g. Anthropic SDK version bump changes token field names)

**Project files** — update when:
- You add a new key file that Claude Code should read before editing related code
- You change a pinned version (model, major library)
- A new team convention is established
- Current phase changes (update the progress tracker)

**Rule:** if Claude Code makes the same mistake twice in the same project,
add a reminder to the project CLAUDE.md. If it makes the same mistake
across two different projects, add it to the global file.
