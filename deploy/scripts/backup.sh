#!/usr/bin/env bash
set -euo pipefail
DIR=/var/backups/mathsite
mkdir -p "$DIR"
docker exec mathsite-postgres pg_dump -U mathsite mathsite | gzip -9 > "$DIR/mathsite-$(date +%F-%H%M%S).sql.gz"
find "$DIR" -name '*.sql.gz' -mtime +14 -delete
