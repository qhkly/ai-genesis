#!/bin/bash
set -euo pipefail

MODE="${1:-push}"
DATA_DIR="${DATA_DIR:-/data}"
ARCHIVE="/tmp/ai-genesis-data.tar.gz"

if [ -z "${R2_ACCESS_KEY_ID:-}" ] || [ -z "${R2_SECRET_ACCESS_KEY:-}" ] || [ -z "${R2_BUCKET_NAME:-}" ]; then
  echo "[sync-r2] R2 is not configured; skipping"
  exit 0
fi

if ! command -v aws >/dev/null 2>&1; then
  echo "[sync-r2] aws CLI is not installed; skipping"
  exit 0
fi

if [ -z "${R2_ENDPOINT_URL:-}" ]; then
  echo "[sync-r2] R2_ENDPOINT_URL is not configured; skipping"
  exit 0
fi

export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION="${R2_REGION:-auto}"

case "$MODE" in
  push)
    tar -C "$DATA_DIR" -czf "$ARCHIVE" .
    aws s3 cp "$ARCHIVE" "s3://${R2_BUCKET_NAME}/ai-genesis-data.tar.gz" --endpoint-url "$R2_ENDPOINT_URL"
    ;;
  pull)
    if aws s3 cp "s3://${R2_BUCKET_NAME}/ai-genesis-data.tar.gz" "$ARCHIVE" --endpoint-url "$R2_ENDPOINT_URL"; then
      mkdir -p "$DATA_DIR"
      tar -C "$DATA_DIR" -xzf "$ARCHIVE"
    fi
    ;;
  *)
    echo "usage: sync-r2.sh [push|pull]" >&2
    exit 2
    ;;
esac
