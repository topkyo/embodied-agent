# Archived script: do not execute as a current repository entrypoint.
# Engineering verification for docs/archive/plans/2026-06-04-domestic-pilot-mvp.md
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== npm ci =="
npm ci --quiet

echo "== lint =="
npm run lint

echo "== test (all workspaces) =="
npm test

echo "== build =="
npm run build

# 目标已移出本仓库，跳过 pilot one-pager 灌溉检查
echo "== pilot doc check skipped (target moved out of repo) =="

echo "== docker mosquitto =="
docker compose up -d mosquitto
sleep 1

echo "== API key probe (optional) =="
if [ -f .env ]; then set -a; source .env; set +a; fi
if [ -n "${LLM_API_KEY:-}" ]; then
  code=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $LLM_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"model":"deepseek-v4-flash","messages":[{"role":"user","content":"ok"}],"max_tokens":5}' \
    "${LLM_BASE_URL:-https://api.deepseek.com/v1}/chat/completions")
  if [ "$code" = "200" ]; then
    echo "LLM_API_KEY: valid (HTTP 200)"
    echo "== sim:matrix core (CI-aligned gate) =="
    AGENT_DATA_DIR=scripts/fixtures/ci-eval LLM_THINKING=1 SIM_MATRIX_SLICE=core npm run sim:matrix
  else
    echo "WARN: LLM_API_KEY returned HTTP $code — skip eval (fix key or use GitHub secret for CI)"
  fi
else
  echo "WARN: no LLM_API_KEY — skip live eval"
fi

echo "== e2e smoke (requires LLM_API_KEY) =="
if [ -z "${LLM_API_KEY:-}" ]; then
  echo "WARN: no LLM_API_KEY — skip live chat e2e (configure Key or rely on vitest integration tests)"
else
  export INTEGRATION_SECRET=verify-plan-secret CHAT_CHANNEL=wechat-stub MQTT_URL=mqtt://127.0.0.1:1883
  fuser -k 3001/tcp 2>/dev/null || true
  PORT=3001 npm run start -w @embodied-agent/api &
  API_PID=$!
  trap 'kill $API_PID 2>/dev/null || true' EXIT
  for i in $(seq 1 30); do
    curl -sf http://127.0.0.1:3001/health >/dev/null && break
    sleep 0.5
  done

  curl -sf http://127.0.0.1:3001/health | grep -q '"ok":true'
  curl -sf -X POST http://127.0.0.1:3001/dev/chat \
    -H 'Content-Type: application/json' \
    -d '{"text":"1号棚现在多少度？"}' | grep -qE '[0-9]+(\.[0-9]+)?'
  curl -sf -X POST http://127.0.0.1:3001/webhooks/chat \
    -H 'Content-Type: application/json' \
    -d '{"FromUserName":"owner-001","ToUserName":"farm-bot","Content":"1号棚现在多少度？"}' | grep -qE '[0-9]+(\.[0-9]+)?'
  curl -sf -X POST http://127.0.0.1:3001/integrations/chat \
    -H "Authorization: Bearer $INTEGRATION_SECRET" \
    -H 'Content-Type: application/json' \
    -d '{"text":"1号棚现在多少度？"}' | grep -qE '[0-9]+(\.[0-9]+)?'
  curl -sf -H "x-admin-token: ${ADMIN_TOKEN:-dev-admin}" http://127.0.0.1:3001/admin/status | grep -q '"api":"ok"'

  kill $API_PID 2>/dev/null || true
  trap - EXIT
  echo "e2e smoke OK"
fi

echo "== ALL ENGINEERING CHECKS PASSED =="
