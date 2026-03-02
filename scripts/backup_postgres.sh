#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-zauth_prod}"

source env/.env.prod

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_FILE="backup_${TIMESTAMP}.sql.gz"

PGPASSWORD="$POSTGRES_PASSWORD" docker compose -p "$PROJECT_NAME" -f docker/compose.base.yml -f docker/compose.prod.yml --env-file env/.env.prod exec -T postgres \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$BACKUP_FILE"

echo "Created $BACKUP_FILE"
