#!/usr/bin/env bash
# agriculture/greenhouse L3/L4 数据飞轮 adapter 入口：默认使用验证运行数据目录启动基础服务 + 临时模拟器。
# 手册：scenes/greenhouse/docs/domain-flywheel-agriculture.zh.md
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ATTACH=0
SETUP_ONLY=0
FAST=1
for arg in "$@"; do
  case "$arg" in
    --attach) ATTACH=1 ;;
    --restart) ATTACH=0 ;;
    --setup-only) SETUP_ONLY=1 ;;
    --fast) FAST=1 ;;
    --realtime) FAST=0 ;;
  esac
done

export AGENT_DATA_DIR="${AGENT_DATA_DIR:-$ROOT/.agentstack/dev-runs/domain-flywheel/agriculture/data}"
export API_URL="${API_URL:-http://127.0.0.1:3001}"
export ADMIN_TOKEN="${ADMIN_TOKEN:-dev-admin}"

# 双棚模拟器：full = gh-001 高湿 + gh-002 高温；REACT 使通风/风机/灌溉反馈到遥测
export SIM_TELEMETRY_SCENARIO="${SIM_TELEMETRY_SCENARIO:-full}"
export SIM_TELEMETRY_REACT="${SIM_TELEMETRY_REACT:-1}"
export FLYWHEEL_DEV="${FLYWHEEL_DEV:-1}"

if [ "$FAST" = "1" ]; then
  export FLYWHEEL_FAST=1
  export SUSTAINED_ALERT_MINUTES="${SUSTAINED_ALERT_MINUTES:-3}"
  export SUSTAINED_L2_COOLDOWN_SECONDS="${SUSTAINED_L2_COOLDOWN_SECONDS:-0}"
  export DEVICE_HEARTBEAT_TIMEOUT_MS="${DEVICE_HEARTBEAT_TIMEOUT_MS:-300000}"
  export SCENE_OUTCOME_WINDOWS_MINUTES="${SCENE_OUTCOME_WINDOWS_MINUTES:-1}"
  export SIM_MAX_COMMAND_MS="${SIM_MAX_COMMAND_MS:-60000}"
else
  export FLYWHEEL_FAST=0
  export SUSTAINED_ALERT_MINUTES="${SUSTAINED_ALERT_MINUTES:-15}"
  export SCENE_OUTCOME_WINDOWS_MINUTES="${SCENE_OUTCOME_WINDOWS_MINUTES:-15}"
  export SIM_MAX_COMMAND_MS="${SIM_MAX_COMMAND_MS:-0}"
fi

echo "=== 双棚数据飞轮（统一）==="
echo "AGENT_DATA_DIR=$AGENT_DATA_DIR"
echo "SIM_TELEMETRY_SCENARIO=$SIM_TELEMETRY_SCENARIO SIM_TELEMETRY_REACT=$SIM_TELEMETRY_REACT"
echo "FLYWHEEL_DEV=$FLYWHEEL_DEV mode=$([ "$FAST" = "1" ] && echo fast || echo realtime)"

SIM_PIDS=()
cleanup_sims() {
  for pid in "${SIM_PIDS[@]:-}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done
}
trap cleanup_sims EXIT

start_simulator() {
  local node_id="$1" greenhouse_id="$2" extra_arg="${3:-}" log_file
  log_file="$ROOT/.agentstack/dev-services/greenhouse/logs/flywheel-${node_id}.log"
  mkdir -p "$(dirname "$log_file")"
  (
    cd "$ROOT"
    AGENT_DATA_DIR="$AGENT_DATA_DIR" DEPLOYMENT_ID=dep-gh-pilot-001 ADMIN_TOKEN="$ADMIN_TOKEN" \
      MQTT_URL="${MQTT_URL:-mqtt://127.0.0.1:1883}" SIM_MAX_COMMAND_MS="$SIM_MAX_COMMAND_MS" \
      SIM_TELEMETRY_SCENARIO="$SIM_TELEMETRY_SCENARIO" SIM_TELEMETRY_REACT="$SIM_TELEMETRY_REACT" \
      NODE_ID="$node_id" GREENHOUSE_ID="$greenhouse_id" \
      npx tsx scripts/node-simulator.ts $extra_arg
  ) >>"$log_file" 2>&1 &
  local pid="$!"
  SIM_PIDS+=("$pid")
  echo "启动模拟器 $node_id pid=$pid log=$log_file"
}

wait_api_ready() {
  local ready=0
  for _ in $(seq 1 30); do
    if curl -sf "$API_URL/health" >/dev/null 2>&1; then
      ready=1
      break
    fi
    sleep 2
  done
  if [ "$ready" != "1" ]; then
    echo "FAIL: API 在 60s 内未就绪 ($API_URL/health)" >&2
    exit 1
  fi
}

gh002_online() {
  curl -sf "$API_URL/dev/flywheel/ready" 2>/dev/null \
    | grep -q '"node_id":"node-sim-gh-002"[^}]*"online":true'
}

if [ "$ATTACH" = "0" ] && [ "$SETUP_ONLY" = "0" ]; then
  echo "清理飞轮脏状态（pending / sustained / sustained 冷却）..."
  AGENT_DATA_DIR="$AGENT_DATA_DIR" npx tsx -e "
import { resetFlywheelRunState } from './scripts/lib/flywheel-fixture.ts';
resetFlywheelRunState(process.env.AGENT_DATA_DIR!, 'dep-gh-pilot-001');
console.log('[flywheel] run state reset');
"
  echo "启动 agriculture/greenhouse 验证栈基础服务..."
  "$ROOT/scripts/dev-services.sh" stop --scene greenhouse
  AGENT_DATA_DIR="$AGENT_DATA_DIR" API_URL="$API_URL" ADMIN_TOKEN="$ADMIN_TOKEN" \
    FLYWHEEL_DEV="$FLYWHEEL_DEV" SUSTAINED_ALERT_MINUTES="$SUSTAINED_ALERT_MINUTES" \
    SUSTAINED_L2_COOLDOWN_SECONDS="$SUSTAINED_L2_COOLDOWN_SECONDS" \
    DEVICE_HEARTBEAT_TIMEOUT_MS="$DEVICE_HEARTBEAT_TIMEOUT_MS" \
    SCENE_OUTCOME_WINDOWS_MINUTES="$SCENE_OUTCOME_WINDOWS_MINUTES" \
    "$ROOT/scripts/dev-services.sh" start --scene greenhouse
  echo "等待 API 就绪..."
  wait_api_ready
  echo "双棚 config 对齐（ensure-sim-dual）..."
  AGENT_DATA_DIR="$AGENT_DATA_DIR" ENSURE_SIM_DUAL_FORCE_REBIND=1 npx tsx "$ROOT/scripts/ensure-sim-dual-nodes.ts"
  echo "启动双棚模拟器..."
  start_simulator "node-sim-gh-001" "gh-001"
  start_simulator "node-sim-gh-002" "gh-002" "--auto"
  sleep 8
  AGENT_DATA_DIR="$AGENT_DATA_DIR" ENSURE_SIM_DUAL_FORCE_REBIND=1 npx tsx "$ROOT/scripts/ensure-sim-dual-nodes.ts"
  echo "等待双棚遥测 + 心跳 + sustained 可评估..."
  stack_ready=0
  for _ in $(seq 1 90); do
    ready_json="$(curl -sf "$API_URL/dev/flywheel/ready" 2>/dev/null || true)"
    if echo "$ready_json" | grep -q '"ready":true' \
      && echo "$ready_json" | grep -q '"flywheel_dev":true'; then
      stack_ready=1
      break
    fi
    if ! gh002_online; then
      echo "gh-002 仍离线，继续等待..."
    fi
    sleep 2
  done
  if [ "$stack_ready" != "1" ]; then
    echo "FAIL: 飞轮栈 180s 内未就绪（须双棚遥测 + node-sim 心跳新鲜）" >&2
    curl -sf "$API_URL/dev/flywheel/ready" 2>/dev/null || true
    echo "" >&2
    exit 1
  fi
elif [ "$ATTACH" = "1" ]; then
  echo "附着模式：请确认现有 API/模拟器已带 SIM_TELEMETRY_SCENARIO=full SIM_TELEMETRY_REACT=1"
  echo "         API 进程须带 FLYWHEEL_DEV=1 与 fast/realtime 时间 env"
fi

if [ "$SETUP_ONLY" = "1" ]; then
  exec bash "$ROOT/scripts/domain-flywheel-agriculture-setup.sh"
fi

exec npx tsx "$ROOT/scripts/domain-flywheel-agriculture-e2e.ts"
