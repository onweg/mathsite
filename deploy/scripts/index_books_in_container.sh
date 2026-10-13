#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

docker compose --env-file deploy/.env.prod -f deploy/docker-compose.prod.yml \
    run --rm -v "$(pwd):/mnt/project:ro" -w /mnt/project/backend \
    backend python -m scripts.index_books "${1:-all}"

