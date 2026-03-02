#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-zauth_prod}"

if [[ ! -f env/.env.prod ]]; then
  echo "env/.env.prod is missing"
  exit 1
fi

echo "Deploying production stack..."
docker compose -p "$PROJECT_NAME" -f docker/compose.base.yml -f docker/compose.prod.yml --env-file env/.env.prod pull

docker compose -p "$PROJECT_NAME" -f docker/compose.base.yml -f docker/compose.prod.yml --env-file env/.env.prod up -d --remove-orphans

echo "Running smoke checks..."
./scripts/smoke.sh

echo "Release completed"
