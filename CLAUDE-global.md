# Akmal Khan — Global Claude Code Standards
# File location: ~/.claude/CLAUDE.md
# Purpose: Applied to every project, every session, automatically.

---

## Who I Am

Senior Staff Engineer specialising in AI-powered platforms, LLM systems,
agentic workflows, and RAG pipelines. 20+ years production experience.
Primary languages: TypeScript and Python. I build systems that are
observable, operable, and documented for the engineer who inherits them.

---

## Non-Negotiable Standards

Apply these on every project without being asked. They are not optional
even when the task seems small.

### TypeScript
- Strict mode always. Zero `any` types. If tempted to use `any`, design
  the type properly.
- Explicit return types on all exported functions.
- Typed error classes — never `throw new Error("something went wrong")`.
  Always `throw new ExtractionError("...", { cause: originalError })`.
- No non-null assertions (`!`) unless you add a comment explaining why
  it is safe. Prefer explicit null checks.

### Python
- Type hints on all function signatures. Return types included.
- Pydantic for data validation and serialisation — not dataclasses for
  anything that crosses a boundary (API, DB, queue).
- Never bare `except:` — always `except SpecificError as e:`.
- Structured logging via `structlog` or `logging` with a JSON formatter.
  Never `print()` in production code.

### Error Handling (both languages)
```typescript
// Wrong
throw new Error("extraction failed")

// Right
export class ExtractionError extends Error {
  constructor(
    message: string,
    public readonly context: Record<string, unknown> = {},
    options?: ErrorOptions
  ) {
    super(message, options)
    this.name = 'ExtractionError'
  }
}
throw new ExtractionError("Claude returned no tool use block", {
  jobId, model: CLAUDE_MODEL, stopReason: response.stop_reason
})
```

### Structured Logging
Every significant operation emits a JSON log line. No prose logs in
production code paths.

```typescript
// Wrong
console.log("Extraction started for job " + jobId)

// Right — every log line has these fields minimum:
console.log(JSON.stringify({
  level: "info",          // info | warn | error
  event: "extraction_started",  // snake_case event name
  jobId,
  documentId,
  timestamp: new Date().toISOString(),
  service: "specforge-api"
}))
```

For AI API calls specifically, always log:
- `model` (pinned version string)
- `promptVersion`
- `inputTokens`, `outputTokens`, `cacheReadTokens`
- `latencyMs`
- `costUsd` (calculated)
- `validationRetries` (if applicable)

### Constants and Configuration
- No magic numbers or strings inline in logic.
- All config from environment variables, validated at startup with Zod
  (TypeScript) or Pydantic Settings (Python).
- Fail fast: if a required env variable is missing, crash at startup
  with a clear message — do not silently use a default in production.

```typescript
// Validate all env vars at startup
const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  ANTHROPIC_API_KEY: z.string().startsWith('sk-ant-'),
  REDIS_URL: z.string(),
  PORT: z.coerce.number().default(3000),
})
export const env = EnvSchema.parse(process.env)
```

---

## AI / LLM Standards

These apply to every project that uses an LLM API.

### Model Versions
ALWAYS pin. NEVER use aliases.

```typescript
// Never — silently breaks when provider updates the alias
const MODEL = "claude-sonnet-latest"
const MODEL = "gpt-4o"

// Always — intentional, auditable, logged
const CLAUDE_MODEL = "claude-sonnet-4-5-20251022"
const OPENAI_MODEL = "gpt-4o-2024-11-20"
```

When upgrading a model version: run the eval set against the new version
first. Deploy with the new pinned version string. Record in DECISIONS.md.

### Prompt Versioning
Prompts are code. Version them.

```typescript
export const EXTRACTION_PROMPT = {
  version: "v2.3.1",
  content: `...`
}
// Log promptVersion alongside model on every call
```

### Tool Use / Function Calling (Anthropic SDK)
```typescript
// Correct response parsing — never assume content[0]
const toolBlock = response.content.find(b => b.type === 'tool_use')
if (!toolBlock || toolBlock.type !== 'tool_use') {
  throw new LLMError('No tool use block', { stopReason: response.stop_reason })
}
const input = toolBlock.input  // already parsed JSON

// Correct token field names (SDK v0.20+)
const usage = {
  inputTokens: response.usage.input_tokens,
  outputTokens: response.usage.output_tokens,
  cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
  cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
}
```

### Validation + Retry Pattern
After every LLM structured output, validate with Zod/Pydantic.
On failure, retry once with errors appended to the message.

```typescript
let result = parseResult(rawOutput)
if (!result.success) {
  // Retry with validation errors in the message
  const retry = await callLLM([
    ...messages,
    { role: 'assistant', content: rawOutput },
    { role: 'user', content: `Schema validation failed:\n${result.error}\nPlease correct and retry.` }
  ])
  result = parseResult(retry)
  if (!result.success) throw new ExtractionError('Validation failed after retry', { errors: result.error })
}
```

### Cost Tracking
Calculate and log cost on every LLM call.

```typescript
// Sonnet pricing (update when model changes)
function calculateCost(usage: TokenUsage): number {
  const INPUT_PER_MTOK = 3.00
  const OUTPUT_PER_MTOK = 15.00
  const CACHE_READ_PER_MTOK = 0.30
  const CACHE_WRITE_PER_MTOK = 3.75
  return (
    (usage.inputTokens / 1_000_000) * INPUT_PER_MTOK +
    (usage.outputTokens / 1_000_000) * OUTPUT_PER_MTOK +
    (usage.cacheReadTokens / 1_000_000) * CACHE_READ_PER_MTOK +
    (usage.cacheWriteTokens / 1_000_000) * CACHE_WRITE_PER_MTOK
  )
}
```

---

## Database Standards

### PostgreSQL (postgres npm package)
```typescript
// Always use tagged template literals — never string concatenation
// Wrong (SQL injection risk)
const result = await sql`SELECT * FROM users WHERE id = '${userId}'`

// Right
const result = await sql`SELECT * FROM users WHERE id = ${userId}`

// Always destructure results
const [user] = await sql`SELECT * FROM users WHERE id = ${userId}`
if (!user) throw new NotFoundError('User not found', { userId })
```

### pgvector
```
Distance operator for cosine similarity: <=>  (NOT <-> which is L2)
Always cast query embedding:             $1::vector
Index type:                              HNSW (not IVFFlat)
Index creation:
  CREATE INDEX ON table USING hnsw (embedding vector_cosine_ops)
Similarity score (0 to 1, higher = more similar):
  1 - (embedding <=> $1::vector) AS similarity
Always filter by tenant before vector search:
  WHERE org_id = $1 AND 1 - (embedding <=> $2::vector) > 0.7
```

### Migrations
- Numbered SQL files, run in order, tracked in schema_migrations table.
- Always idempotent (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`).
- Never modify an existing migration — add a new one.
- Run migrations at startup in production, not in a separate step.

---

## API Design Standards

### REST conventions
- Resources are nouns, plural: `/api/projects`, `/api/documents`
- Actions on resources: `POST /api/documents/:id/reprocess`
- IDs in path for specific resources, query params for filtering
- 202 Accepted for async operations (return jobId, not result)
- Consistent error response: `{ error: string, code: string, details?: unknown }`

### Request validation
Every route validates its input with Zod before touching business logic.

```typescript
// Hono with zValidator
import { zValidator } from '@hono/zod-validator'

app.post('/api/projects',
  zValidator('json', CreateProjectSchema),
  async (c) => {
    const body = c.req.valid('json')  // typed, validated
    // ...
  }
)
```

### Health endpoints
Every service has a `/health` endpoint that checks all dependencies:
```typescript
// Returns 200 if healthy, 503 if any dependency is down
GET /health → {
  status: 'ok' | 'degraded',
  services: { postgres: bool, redis: bool, minio: bool },
  uptime: number,
  version: string
}
```

---

## Hono-Specific Patterns

```typescript
// SSE streaming — correct import and pattern
import { streamSSE } from 'hono/streaming'  // NOT 'hono/sse'

app.get('/api/jobs/:id/progress', (c) =>
  streamSSE(c, async (stream) => {
    const keepalive = setInterval(() =>
      stream.writeSSE({ data: '', event: 'keepalive' }), 15000)

    const unsub = subscribe(c.req.param('id'), (event) => {
      stream.writeSSE({ data: JSON.stringify(event), event: 'progress' })
      if (event.stage === 'complete' || event.stage === 'failed') {
        clearInterval(keepalive)
        unsub()
        stream.close()
      }
    })

    c.req.raw.signal.addEventListener('abort', () => {
      clearInterval(keepalive)
      unsub()
    })
  })
)
```

---

## Async Job Queue Standards (BullMQ)

```typescript
// Concurrency: limit based on external API rate limits
// Claude API: max 2 concurrent jobs to avoid 429s
const worker = new Worker('extraction', handler, {
  connection,
  concurrency: 2,
})

// Always update job progress at each stage
await job.updateProgress({ stage: 'parsing', percent: 20, message: '...' })

// Retry config: 3 attempts, exponential backoff
defaultJobOptions: {
  attempts: 3,
  backoff: { type: 'exponential', delay: 1000 }
}

// Always log job lifecycle as structured events
worker.on('completed', (job) =>
  console.log(JSON.stringify({ level: 'info', event: 'job_completed',
    jobId: job.id, durationMs: Date.now() - job.timestamp })))
worker.on('failed', (job, err) =>
  console.log(JSON.stringify({ level: 'error', event: 'job_failed',
    jobId: job?.id, error: err.message, stack: err.stack })))
```

---

## Documentation Standards

### JSDoc — all exported functions
```typescript
/**
 * Extracts structured epics and user stories from a document using Claude.
 * Uses a two-pass strategy: epics first, then stories per epic.
 * Validates output with Zod and retries once on schema failure.
 *
 * @param params.documentText - Cleaned text content of the document
 * @param params.documentId - UUID of the document record (for logging)
 * @param params.onProgress - Callback for stage progress updates
 * @returns Extracted epics with stories, token usage, and cost
 * @throws ExtractionError if Claude returns no tool use block
 * @throws ValidationError if output fails Zod validation after retry
 */
```

### ADRs — when to write one
Write an ADR when the decision is:
- Hard to reverse (database choice, queue system, AI model)
- Non-obvious to a new engineer (why not the standard choice?)
- Made under constraints that might change (data sovereignty, scale limits)

Store in `docs/decisions/ADR-00N-title.md`. Number sequentially.

### After each major phase
State out loud: "What could go wrong in production here, and how would
we know?" If the answer is "we wouldn't know", add logging or an alert
before moving on.

---

## Deployment Standards

### Docker
- Multi-stage builds always (build stage + minimal runtime stage)
- Runtime image: `node:20-slim` (not `node:20` — saves ~400MB)
- No secrets in Dockerfile or image layers
- Health check in every Dockerfile

### Cloud Run (preferred for Node.js APIs on GCP)
- Port: 8080 (Cloud Run default)
- `min-instances: 0` for dev/staging, `min-instances: 1` for production
- Secrets via Secret Manager, not environment variables for sensitive values
- Always specify `--region` explicitly — never rely on defaults

### Environment parity
Local dev uses docker-compose for dependencies (postgres, redis, minio).
The same Docker image that runs locally is what gets deployed.
Never "it works on my machine" — if it works in the container, it works.

---

## The 2am Test

Before finishing any feature, ask:
"If this breaks at 2am six months from now, and the engineer who built
it has left the company, can the on-call engineer diagnose and fix it
using only the logs, the runbook, and the code?"

If the answer is no: add logging, update the runbook, improve the error
messages, or simplify the code. Ship when the answer is yes.
