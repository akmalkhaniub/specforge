# SpecForge Build Progress

- [x] Phase 0 — Bootstrap
- [x] Phase 1 — Database schema
- [x] Phase 2 — MinIO storage
- [x] Phase 3 — BullMQ queue + Redis pub/sub
- [x] Phase 4 — Claude AI pipeline (code complete; live test pending real ANTHROPIC_API_KEY)
- [x] Phase 5 — Hono API routes (non-AI endpoints verified live; health=ok all services)
- [x] Phase 6 — Wire worker to pipeline (code complete; live extraction pending real ANTHROPIC_API_KEY)
- [x] Phase 7 — React frontend (Dashboard + Analytics verified live in browser)
- [x] Phase 8 — Cloud Run deployment (configs written; Docker build untested — no Docker locally)
- [x] Phase 9 — Token analytics + cost dashboard (endpoints verified live; view migration 008 applied)
- [x] Phase 10 — README + DECISIONS.md + polish
- [x] Phase 11 — Engineering documentation suite

**All 11 phases complete.** Remaining to fully exercise: add a real
`ANTHROPIC_API_KEY` to `.env` then run `pnpm --filter api exec tsx
src/scripts/smoke-extract.ts` (or upload a doc in the UI) to verify live
extraction end-to-end.

## Notes

- Local Postgres is **native PG18** at `localhost:5432` (not Docker). pgvector
  v0.8.2 built from source and installed; `specforge` db created.
- `DATABASE_URL` uses the `postgres` superuser (see root `.env`).
- Redis and MinIO are not yet running locally (no Docker on this machine) —
  to be addressed at Phases 2/3 with native binaries.
- Embeddings are feature-flagged off (`EMBEDDINGS_ENABLED=false`) until an
  OpenAI key is provided.
- Seeded Acme org id: `47574a0b-8702-4968-801b-6d84ff4a22f4`.
