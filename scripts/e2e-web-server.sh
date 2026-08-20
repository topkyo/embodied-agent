#!/usr/bin/env bash
# Start Web dev server for Playwright E2E, or hold the process when one is already up.
set -euo pipefail
cd "$(dirname "$0")/.."

export WEB_PORT="${WEB_PORT:-5173}"
BASE_URL="http://127.0.0.1:${WEB_PORT}/"

if curl -sf "$BASE_URL" >/dev/null 2>&1; then
  echo "[e2e-web-server] reusing existing Web at ${BASE_URL}" >&2
  exec tail -f /dev/null
fi

exec bash scripts/web-dev.sh
