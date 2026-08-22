#!/usr/bin/env bash
# Start an API server for Playwright E2E against an isolated data root.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

DATA_DIR="${E2E_AGENT_DATA_DIR:-$REPO_ROOT/.agentstack/e2e/data}"
SOURCE_DIR="${E2E_FIXTURE_SOURCE:-$REPO_ROOT/scripts/fixtures/ci-eval}"
ILINK_MOCK_PORT="${ILINK_MOCK_PORT:-0}"
ILINK_MOCK_PORT_FILE="${ILINK_MOCK_PORT_FILE:-$REPO_ROOT/.agentstack/e2e/ilink-mock.port}"

rm -rf "$DATA_DIR"
mkdir -p "$DATA_DIR"
cp -R "$SOURCE_DIR"/. "$DATA_DIR"/
rm -rf "$DATA_DIR/wechat-ilink"
# 可选覆盖（如更小的 E2E 专用 settings）
OVERLAY_DIR="$REPO_ROOT/scripts/fixtures/ci-e2e-wechat-bind"
if [ -d "$OVERLAY_DIR" ]; then
  cp -R "$OVERLAY_DIR"/. "$DATA_DIR"/
  rm -rf "$DATA_DIR/wechat-ilink"
fi

export NODE_ENV="${NODE_ENV:-development}"
export AGENT_DATA_DIR="$DATA_DIR"
export DEPLOYMENT_ID="${DEPLOYMENT_ID:-dep-gh-pilot-001}"
export ACTIVE_DOMAIN="${ACTIVE_DOMAIN:-agriculture}"
export ADMIN_TOKEN="${ADMIN_TOKEN:-dev-admin}"
export PORT="${PORT:-3001}"
export MQTT_URL="${MQTT_URL:-mqtt://127.0.0.1:1883}"
HEALTH_URL="http://127.0.0.1:${PORT}/health"
if curl -sf "$HEALTH_URL" >/dev/null 2>&1; then
  echo "[e2e-api-server] reusing existing API at ${HEALTH_URL}" >&2
  exec tail -f /dev/null
fi

mkdir -p "$(dirname "$ILINK_MOCK_PORT_FILE")"
rm -f "$ILINK_MOCK_PORT_FILE"
ILINK_HEALTH=""
if [ -n "${ILINK_BASE_URL:-}" ]; then
  ILINK_HEALTH="${ILINK_BASE_URL%/}/ilink/bot/get_bot_qrcode?bot_type=3"
fi
if [ -z "$ILINK_HEALTH" ] || ! curl -sf "$ILINK_HEALTH" >/dev/null 2>&1; then
  echo "[e2e-api-server] starting ilink mock (port file: ${ILINK_MOCK_PORT_FILE})" >&2
  ILINK_MOCK_PORT="$ILINK_MOCK_PORT" ILINK_MOCK_PORT_FILE="$ILINK_MOCK_PORT_FILE" \
    npx tsx scripts/ilink-mock-server.ts &
  ILINK_PID=$!
  for _ in $(seq 1 30); do
    if [ -f "$ILINK_MOCK_PORT_FILE" ]; then
      ILINK_MOCK_PORT="$(cat "$ILINK_MOCK_PORT_FILE")"
      ILINK_HEALTH="http://127.0.0.1:${ILINK_MOCK_PORT}/ilink/bot/get_bot_qrcode?bot_type=3"
      if curl -sf "$ILINK_HEALTH" >/dev/null 2>&1; then
        break
      fi
    fi
    sleep 0.2
  done
  if [ ! -f "$ILINK_MOCK_PORT_FILE" ] || ! curl -sf "$ILINK_HEALTH" >/dev/null 2>&1; then
    echo "[e2e-api-server] ilink mock failed to start" >&2
    kill "$ILINK_PID" 2>/dev/null || true
    exit 1
  fi
  ILINK_MOCK_PORT="$(cat "$ILINK_MOCK_PORT_FILE")"
fi
export ILINK_BASE_URL="${ILINK_BASE_URL:-http://127.0.0.1:${ILINK_MOCK_PORT}}"
export ILINK_MOCK_PORT

npm run start -w @embodied-agent/api