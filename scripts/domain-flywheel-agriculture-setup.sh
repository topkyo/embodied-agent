#!/usr/bin/env bash
# agriculture/greenhouse 飞轮半自动：baseline + 阈值 + 快照（全闭环请用 domain:flywheel）
# 手册：scenes/greenhouse/docs/domain-flywheel-agriculture.zh.md
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

API="${API_URL:-http://127.0.0.1:3001}"
TOKEN="${ADMIN_TOKEN:-dev-admin}"
AGENT_DATA_DIR="${AGENT_DATA_DIR:-$ROOT/.agentstack/dev-runs/domain-flywheel/agriculture/data}"
export AGENT_DATA_DIR

echo "=== 双棚 L3/L4 飞轮联调（setup-only）==="
echo "AGENT_DATA_DIR=$AGENT_DATA_DIR"
echo "API=$API"
echo "提示：全自动闭环请运行 npm run domain:flywheel"
echo ""

curl -sf "$API/health" >/dev/null || {
  echo "FAIL: API 未就绪。请先运行: npm run domain:flywheel"
  exit 1
}
echo "OK: API health"

echo ""
echo "=== 1. 写入试点基线（联调用） ==="
curl -sf -X POST "$API/admin/pilot/baseline" \
  -H "x-admin-token: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"manual_run_shed_count_per_week":14,"notes":"双棚飞轮联调基线"}' | python3 -m json.tool

echo ""
echo "=== 2. 设 2 号棚高温报警阈值（dev/chat） ==="
curl -sf -X POST "$API/dev/chat" \
  -H "Content-Type: application/json" \
  -d '{"text":"2号棚温度超过30度就报警","user_id":"owner-001","conversation_id":"flywheel-setup"}' \
  | python3 -c "import sys,json; r=json.load(sys.stdin); print('reply:', (r.get('reply') or '')[:200])"

echo ""
echo "=== 3. 模拟器环境（统一脚本默认已开启）==="
echo "  SIM_TELEMETRY_SCENARIO=full   # gh-001 高湿 + gh-002 高温"
echo "  SIM_TELEMETRY_REACT=1"
echo "  全闭环: npm run domain:flywheel"

POLL_MAX="${DOMAIN_FLYWHEEL_POLL_MAX:-3}"
POLL_SEC="${DOMAIN_FLYWHEEL_POLL_SEC:-30}"
echo ""
echo "=== 4. 轮询 scene-outcomes / ROI（最多 ${POLL_MAX} 次，间隔 ${POLL_SEC}s）==="
for i in $(seq 1 "$POLL_MAX"); do
  outcome_count="$(curl -sf "$API/admin/scene-outcomes" -H "x-admin-token: $TOKEN" \
    | python3 -c "import sys,json; b=json.load(sys.stdin); print(len(b.get('outcomes') or []))")"
  roi_snippet="$(curl -sf "$API/admin/pilot/roi?since_days=7" -H "x-admin-token: $TOKEN" \
    | python3 -c "import sys,json; b=json.load(sys.stdin); print((b.get('summary_text') or '')[:300])")"
  echo "  [$i/$POLL_MAX] outcomes: $outcome_count | roi: $roi_snippet"
  if [ "$i" -lt "$POLL_MAX" ]; then
    sleep "$POLL_SEC"
  fi
done

echo ""
echo "=== 5. 可选：本地冒烟 ==="
if command -v npm >/dev/null; then
  if npm run domain:l3-smoke; then
    echo "OK: domain:l3-smoke"
  else
    echo "WARN: domain:l3-smoke 失败（检查 AGENT_DATA_DIR）" >&2
  fi
fi

echo ""
echo "::DOMAIN_FLYWHEEL_DUAL_SIM_READY::"
