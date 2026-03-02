#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-zauth_prod}"

docker compose -p "$PROJECT_NAME" -f docker/compose.base.yml -f docker/compose.prod.yml --env-file env/.env.prod restart

echo "Production stack restarted"
