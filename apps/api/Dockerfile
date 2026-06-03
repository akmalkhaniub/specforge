# Multi-stage build for the SpecForge API.
# Builder installs the full workspace, builds @specforge/shared + api, then uses
# `pnpm deploy` to produce a self-contained, production-only node_modules tree.
# Runtime is a minimal node:20-slim image listening on Cloud Run's port 8080.

# --- Stage 1: build ---
FROM node:20-slim AS builder
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

WORKDIR /repo

# Copy manifests first for better layer caching.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/

RUN pnpm install --frozen-lockfile

# Copy sources and build.
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @specforge/shared build \
 && pnpm --filter api build

# Produce a self-contained deploy dir with prod deps only.
RUN pnpm --filter api deploy --prod /app

# --- Stage 2: runtime ---
FROM node:20-slim AS runtime
ENV NODE_ENV=production
ENV PORT=8080
WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

EXPOSE 8080
# Lightweight healthcheck against the /health route.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://localhost:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
