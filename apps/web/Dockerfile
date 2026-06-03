# Multi-stage build for the SpecForge web app.
# Builds the Vite SPA, then serves the static output with nginx. Here nginx is
# only a static file server with SPA fallback — not a reverse proxy.
# For production, Firebase Hosting (see firebase.json) is preferred; this image
# is provided for Cloud Run / container-based hosting.

# --- Stage 1: build ---
FROM node:20-slim AS builder
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

COPY packages/shared packages/shared
COPY apps/web apps/web

# VITE_API_URL must point at the deployed Cloud Run API URL at build time.
ARG VITE_API_URL=http://localhost:3000
ENV VITE_API_URL=$VITE_API_URL
RUN pnpm --filter @specforge/shared build \
 && pnpm --filter web build

# --- Stage 2: serve ---
FROM nginx:alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
