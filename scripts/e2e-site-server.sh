#!/usr/bin/env bash
# Start marketing site dev server for Playwright E2E, or hold when one is already up.
set -euo pipefail
cd "$(dirname "$0")/.."

export SITE_PORT="${SITE_PORT:-5170}"
BASE_URL="http://127.0.0.1:${SITE_PORT}/"

if curl -sf "$BASE_URL" >/dev/null 2>&1; then
  echo "[e2e-site-server] reusing existing Site at ${BASE_URL}" >&2
  exec tail -f /dev/null
fi

export VITE_API_PROXY="${VITE_API_PROXY:-http://127.0.0.1:3001}"
export VITE_ADMIN_TOKEN="${VITE_ADMIN_TOKEN:-dev-admin}"
export WEB_PORT="${SITE_PORT}"

exec npm run site:dev