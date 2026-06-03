# SpecForge developer commands.
# On machines with Docker, `make up` starts postgres/redis/minio. The primary
# dev machine runs these natively, so use the dev:* targets directly there.

.PHONY: dev up down logs build migrate seed dev-api dev-web deploy deploy-api deploy-web cloud-run-logs

up:
	docker compose up -d

down:
	docker compose down

logs:
	docker compose logs -f

# Start infra (if using Docker) then both apps in watch mode.
dev: up
	pnpm --filter api dev & pnpm --filter web dev

dev-api:
	pnpm --filter api dev

dev-web:
	pnpm --filter web dev

build:
	pnpm --filter @specforge/shared build && pnpm --filter api build && pnpm --filter web build

migrate:
	pnpm --filter api db:migrate

seed:
	pnpm --filter api db:seed

# --- Deployment (Phase 8) ---
deploy-api:
	gcloud builds submit --config cloudbuild.yaml

deploy-web:
	firebase deploy --only hosting

deploy: deploy-api deploy-web

cloud-run-logs:
	gcloud run services logs read specforge-api --region me-central2
