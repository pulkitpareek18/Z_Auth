#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-zauth_prod}"

if [[ -z "${PREVIOUS_CORE_IMAGE:-}" || -z "${PREVIOUS_UI_IMAGE:-}" || -z "${PREVIOUS_NOTES_IMAGE:-}" ]]; then
  echo "Set PREVIOUS_CORE_IMAGE, PREVIOUS_UI_IMAGE, and PREVIOUS_NOTES_IMAGE before rollback"
  exit 1
fi

TMP_ENV="$(mktemp)"
cp env/.env.prod "$TMP_ENV"

echo "ZAUTH_CORE_IMAGE=$PREVIOUS_CORE_IMAGE" >> "$TMP_ENV"
echo "ZAUTH_UI_IMAGE=$PREVIOUS_UI_IMAGE" >> "$TMP_ENV"
echo "ZAUTH_NOTES_IMAGE=$PREVIOUS_NOTES_IMAGE" >> "$TMP_ENV"

docker compose -p "$PROJECT_NAME" -f docker/compose.base.yml -f docker/compose.prod.yml --env-file "$TMP_ENV" up -d

rm -f "$TMP_ENV"

echo "Rollback completed"
