# 🤝 Contributing to SpecForge

SpecForge is an AI-powered requirements extraction platform built as a TypeScript monorepo (Hono API, React Web, and shared schemas).

## 🛠️ Development Setup
```bash
pnpm install
docker compose up -d  # Starts PostgreSQL (pgvector), Redis, MinIO
pnpm dev
```

## 🧪 Verification
Run the verification quality gate before submitting PRs:
```bash
pnpm verify
```
