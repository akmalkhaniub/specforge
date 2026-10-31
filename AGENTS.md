# AGENTS.md — Autonomous Agent Operating Contract

## 🎯 Repository Purpose & Architecture
`SpecForge` is an AI-powered requirements extraction platform. A two-pass Claude tool-calling pipeline extracts structured epics, user stories, and Given/When/Then acceptance criteria, validates them with Zod, indexes them into `pgvector`, and tracks token-economics in a FinOps dashboard.

### Monorepo Structure
- `apps/api`: Hono on Node.js REST & SSE streaming server, pgvector repository, BullMQ worker
- `apps/web`: Vite + React + TypeScript web workspace
- `packages/shared`: Shared Zod schemas, TypeScript types, and FinOps cost models
- `docker-compose.yml`: Local PostgreSQL (pgvector), Redis, and MinIO storage

---

## ⚡ Autonomous Execution Protocol
1. Read assigned task from `TASKS.json`.
2. Inspect target package in `apps/api`, `apps/web`, or `packages/shared`.
3. Implement changes strictly adhering to TypeScript strict mode and Zod schemas.
4. Execute single quality gate verification:
   ```bash
   pnpm verify
   ```
5. If verification fails, inspect TypeScript / test errors, self-heal, and re-run.
6. Commit with conventional commit message: `feat(task-id): description`.

---

## 🛡️ Non-Negotiable Quality Rules
- **No Direct any Types**: Never use `any` casting. Use `unknown` and narrow with Zod schema parsing.
- **Hermetic Unit Tests**: Test LLM parsers using recorded fixture data or mocked tool calls. Do not make live Anthropic API calls in CI unit tests.
- **Shared Schema Single Source of Truth**: All data models shared between API and Web MUST reside in `packages/shared/src`.
- **Zero Raw Vector Math in App Logic**: Use pgvector SQL queries with cosine distance operator `<=>` for semantic retrieval.

---

## 🧪 Verification Commands
- **Full Quality Gate**: `pnpm verify` (runs typechecking across all workspaces)
- **Typecheck Only**: `pnpm typecheck`
- **Build All**: `pnpm build`
