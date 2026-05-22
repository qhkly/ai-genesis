#!/bin/bash
set -euo pipefail

DATA_DIR="${DATA_DIR:-/data}"
KNOWLEDGE_DIR="${KNOWLEDGE_DIR:-${DATA_DIR}/knowledge}"
DB_PATH="${BRAIN_DB_PATH:-${DATA_DIR}/memory.db}"

mkdir -p "$DATA_DIR" "$KNOWLEDGE_DIR"
chown -R ubuntu:ubuntu "$DATA_DIR"

if [ -f "$DB_PATH" ]; then
  echo "[startup] Existing memory database found at $DB_PATH"
else
  echo "[startup] No memory database found; initializing a new brain volume"
  if [ -n "${R2_ACCESS_KEY_ID:-}" ] && [ -n "${R2_SECRET_ACCESS_KEY:-}" ] && [ -n "${R2_BUCKET_NAME:-}" ]; then
    echo "[startup] R2 is configured; attempting optional restore"
    /opt/scripts/sync-r2.sh pull || echo "[startup] R2 restore skipped or failed; continuing with a new database"
  fi
fi

if [ -d /opt/ai-genesis/knowledge ]; then
  cp -n /opt/ai-genesis/knowledge/*.md "$KNOWLEDGE_DIR/" 2>/dev/null || true
fi
chown -R ubuntu:ubuntu "$KNOWLEDGE_DIR"

echo "[startup] Starting cron"
service cron start

echo "[startup] Starting supervisor"
exec /usr/bin/supervisord -c /etc/supervisor/supervisord.conf
