#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

ENV_FILE=deploy/.env.prod
COMPOSE=deploy/docker-compose.prod.yml

git pull --ff-only
docker compose --env-file "$ENV_FILE" -f "$COMPOSE" build
docker compose --env-file "$ENV_FILE" -f "$COMPOSE" up -d
sudo systemctl reload nginx || true

