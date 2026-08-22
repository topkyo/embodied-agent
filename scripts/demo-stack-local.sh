#!/usr/bin/env bash
# 无 Docker 的三域只读 demo 栈（等价 docker-compose.demo.yml）。
# 用法: scripts/demo-stack-local.sh start|stop|status

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
STATE_ROOT="$ROOT/.agentstack/demo-services"
DATA_ROOT="${DEMO_STACK_DATA_ROOT:-$ROOT/.agentstack/demo-profiles}"
ENV_FILE="${DEMO_ENV_FILE:-$ROOT/.env.demo-site.local}"

COMMAND="${1:-status}"
if [ $# -gt 0 ]; then shift; fi

usage() {
  cat <<'EOF'
用法:
  scripts/demo-stack-local.sh start
  scripts/demo-stack-local.sh stop
  scripts/demo-stack-local.sh status

环境: 读取 .env.demo-site.local（可用 DEMO_ENV_FILE 覆盖）
EOF
}

if [ "$COMMAND" = "help" ] || [ "$COMMAND" = "-h" ] || [ "$COMMAND" = "--help" ]; then
  usage
  exit 0
fi

load_env() {
  if [ -f "$ENV_FILE" ]; then
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
  fi
  DEMO_STACK_ADMIN_TOKEN="${DEMO_STACK_ADMIN_TOKEN:-local-admin-token}"
  DEMO_STACK_SESSION_SECRET="${DEMO_STACK_SESSION_SECRET:-0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef}"
  DEMO_SITE_ORIGIN="${DEMO_SITE_ORIGIN:-http://127.0.0.1:5170}"
  DEMO_GREENHOUSE_API_PORT="${DEMO_GREENHOUSE_API_PORT:-3101}"
  DEMO_ROBOT_API_PORT="${DEMO_ROBOT_API_PORT:-3201}"
  DEMO_INDUSTRIAL_API_PORT="${DEMO_INDUSTRIAL_API_PORT:-3301}"
  DEMO_GREENHOUSE_MQTT_PORT="${DEMO_GREENHOUSE_MQTT_PORT:-1884}"
  DEMO_ROBOT_MQTT_PORT="${DEMO_ROBOT_MQTT_PORT:-1885}"
  DEMO_INDUSTRIAL_MQTT_PORT="${DEMO_INDUSTRIAL_MQTT_PORT:-1886}"
  DEMO_M20_STUB_PORT="${DEMO_M20_STUB_PORT:-3209}"
}

pid_file() {
  echo "$STATE_ROOT/pids/$1.pid"
}

log_file() {
  echo "$STATE_ROOT/logs/$1.log"
}

is_pid_alive() {
  local pid="$1"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

read_pid() {
  local file="$1"
  [ -f "$file" ] && cat "$file" || true
}

quote_env() {
  printf "%q" "$1"
}

port_busy_by_other() {
  local port="$1" expected_pid="${2:-}" pids pid
  pids="$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)"
  [ -z "$pids" ] && return 1
  for pid in $pids; do
    if [ -n "$expected_pid" ] && [ "$pid" = "$expected_pid" ]; then
      continue
    fi
    echo "$pid"
    return 0
  done
  return 1
}

start_one() {
  local name="$1" port="$2" command="$3" pid old_pid busy log
  old_pid="$(read_pid "$(pid_file "$name")")"
  if is_pid_alive "$old_pid"; then
    echo "已运行: ${name} pid=${old_pid}"
    return
  fi
  if [ -n "$port" ]; then
    busy="$(port_busy_by_other "$port" "$old_pid" || true)"
    if [ -n "$busy" ]; then
      echo "端口 :${port} 已被外部进程占用（pid=${busy}）" >&2
      exit 1
    fi
  fi
  mkdir -p "$STATE_ROOT/pids" "$STATE_ROOT/logs"
  log="$(log_file "$name")"
  echo "启动 ${name}，日志: ${log}"
  (
    cd "$ROOT"
    nohup bash -lc "$command" </dev/null >>"$log" 2>&1 &
    echo $! >"$(pid_file "$name")"
  )
}

wait_for_port() {
  local port="$1" name="$2" i
  for i in $(seq 1 60); do
    if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.5
  done
  echo "${name} 端口 :${port} 在 30s 内未就绪。" >&2
  return 1
}

stop_one() {
  local name="$1" file pid
  file="$(pid_file "$name")"
  pid="$(read_pid "$file")"
  if ! is_pid_alive "$pid"; then
    rm -f "$file"
    return
  fi
  echo "停止 ${name} pid=${pid}"
  kill "$pid" 2>/dev/null || true
  sleep 1
  if is_pid_alive "$pid"; then
    kill -9 "$pid" 2>/dev/null || true
  fi
  rm -f "$file"
}

start_demo_api() {
  local scene="$1" port="$2" data_dir="$3" deployment_id="$4" active_domain="$5" mqtt_url="$6" m20_base="${7:-}"
  node "$ROOT/scripts/demo-provision-profile.mjs" "$scene" "$data_dir"
  local m20_env=""
  if [ -n "$m20_base" ]; then
    m20_env="M20_BASE_URL=$(quote_env "$m20_base")"
  fi
  start_one "demo-${scene}-api" "$port" \
    "cd $(quote_env "$ROOT") && NODE_ENV=development DEMO_READONLY=1 SESSION_SECRET=$(quote_env "$DEMO_STACK_SESSION_SECRET") ADMIN_TOKEN=$(quote_env "$DEMO_STACK_ADMIN_TOKEN") CORS_ORIGIN=$(quote_env "$DEMO_SITE_ORIGIN") STATE_BACKEND=file COMMAND_STORE=file CHAT_CHANNEL=dev AGENT_DATA_DIR=$(quote_env "$data_dir") DEPLOYMENT_ID=$(quote_env "$deployment_id") ACTIVE_DOMAIN=$(quote_env "$active_domain") MQTT_URL=$(quote_env "$mqtt_url") PORT=$(quote_env "$port") LLM_API_KEY=$(quote_env "${LLM_API_KEY:-}") $m20_env exec npm run api:dev"
  wait_for_port "$port" "demo-${scene}-api"
}

cmd_start() {
  load_env
  "$ROOT/scripts/ensure-workspace-runtime-build.sh"
  mkdir -p "$DATA_ROOT/greenhouse/data" "$DATA_ROOT/robot/data" "$DATA_ROOT/industrial/data"

  local gh_data="$DATA_ROOT/greenhouse/data"
  local robot_data="$DATA_ROOT/robot/data"
  local ind_data="$DATA_ROOT/industrial/data"
  local gh_mqtt="mqtt://127.0.0.1:$DEMO_GREENHOUSE_MQTT_PORT"
  local robot_mqtt="mqtt://127.0.0.1:$DEMO_ROBOT_MQTT_PORT"
  local ind_mqtt="mqtt://127.0.0.1:$DEMO_INDUSTRIAL_MQTT_PORT"
  local m20_url="http://127.0.0.1:$DEMO_M20_STUB_PORT"

  start_one "demo-greenhouse-broker" "$DEMO_GREENHOUSE_MQTT_PORT" \
    "cd $(quote_env "$ROOT") && exec npx --yes aedes-cli -p $(quote_env "$DEMO_GREENHOUSE_MQTT_PORT")"
  wait_for_port "$DEMO_GREENHOUSE_MQTT_PORT" "demo-greenhouse-broker"

  start_demo_api "greenhouse" "$DEMO_GREENHOUSE_API_PORT" "$gh_data" "dep-demo-greenhouse-001" "agriculture" "$gh_mqtt"

  start_one "demo-greenhouse-sim" "" \
    "cd $(quote_env "$ROOT") && MQTT_URL=$(quote_env "$gh_mqtt") DEPLOYMENT_ID=dep-demo-greenhouse-001 AGENT_DATA_DIR=$(quote_env "$gh_data") API_URL=http://127.0.0.1:$(quote_env "$DEMO_GREENHOUSE_API_PORT") NODE_ID=node-sim-gh-001 ADMIN_TOKEN=$(quote_env "$DEMO_STACK_ADMIN_TOKEN") SIM_TELEMETRY_REACT=1 exec npx tsx scripts/node-simulator.ts"

  start_one "demo-robot-broker" "$DEMO_ROBOT_MQTT_PORT" \
    "cd $(quote_env "$ROOT") && exec npx --yes aedes-cli -p $(quote_env "$DEMO_ROBOT_MQTT_PORT")"
  wait_for_port "$DEMO_ROBOT_MQTT_PORT" "demo-robot-broker"

  start_one "demo-robot-m20" "$DEMO_M20_STUB_PORT" \
    "cd $(quote_env "$ROOT") && M20_STUB_PORT=$(quote_env "$DEMO_M20_STUB_PORT") exec npx tsx scripts/m20-stub.ts"
  wait_for_port "$DEMO_M20_STUB_PORT" "demo-robot-m20"

  start_demo_api "robot" "$DEMO_ROBOT_API_PORT" "$robot_data" "dep-demo-robot-001" "robotics" "$robot_mqtt" "$m20_url"

  start_one "demo-industrial-broker" "$DEMO_INDUSTRIAL_MQTT_PORT" \
    "cd $(quote_env "$ROOT") && exec npx --yes aedes-cli -p $(quote_env "$DEMO_INDUSTRIAL_MQTT_PORT")"
  wait_for_port "$DEMO_INDUSTRIAL_MQTT_PORT" "demo-industrial-broker"

  start_demo_api "industrial" "$DEMO_INDUSTRIAL_API_PORT" "$ind_data" "dep-demo-industrial-001" "industrial" "$ind_mqtt"

  (
    cd "$ROOT"
    AGENT_DATA_DIR="$ind_data" API_URL="http://127.0.0.1:$DEMO_INDUSTRIAL_API_PORT" \
      ADMIN_TOKEN="$DEMO_STACK_ADMIN_TOKEN" MQTT_URL="$ind_mqtt" npm run ensure:sim-industrial
  )
  start_one "demo-industrial-sim" "" \
    "cd $(quote_env "$ROOT") && MQTT_URL=$(quote_env "$ind_mqtt") DEPLOYMENT_ID=dep-demo-industrial-001 AGENT_DATA_DIR=$(quote_env "$ind_data") API_URL=http://127.0.0.1:$(quote_env "$DEMO_INDUSTRIAL_API_PORT") NODE_ID=node-sim-industrial-001 ADMIN_TOKEN=$(quote_env "$DEMO_STACK_ADMIN_TOKEN") SIM_TELEMETRY_REACT=1 exec npx tsx scripts/node-simulator.ts --profile=industrial"

  echo ""
  echo "=== demo 栈（本地，无 Docker）==="
  echo "  greenhouse API: http://127.0.0.1:$DEMO_GREENHOUSE_API_PORT"
  echo "  robot API:      http://127.0.0.1:$DEMO_ROBOT_API_PORT"
  echo "  industrial API: http://127.0.0.1:$DEMO_INDUSTRIAL_API_PORT"
  echo "  CORS_ORIGIN:    $DEMO_SITE_ORIGIN"
}

cmd_stop() {
  local names=(
    demo-industrial-sim demo-industrial-api demo-industrial-broker
    demo-robot-api demo-robot-m20 demo-robot-broker
    demo-greenhouse-sim demo-greenhouse-api demo-greenhouse-broker
  )
  for name in "${names[@]}"; do
    stop_one "$name"
  done
}

cmd_status() {
  local names=(
    demo-greenhouse-broker demo-greenhouse-api demo-greenhouse-sim
    demo-robot-broker demo-robot-m20 demo-robot-api
    demo-industrial-broker demo-industrial-api demo-industrial-sim
  )
  for name in "${names[@]}"; do
    local pid status port=""
    pid="$(read_pid "$(pid_file "$name")")"
    if is_pid_alive "$pid"; then
      status="running pid=$pid"
    else
      status="stopped"
    fi
    case "$name" in
      *greenhouse-broker) port=":${DEMO_GREENHOUSE_MQTT_PORT:-1884}" ;;
      *greenhouse-api) port=":${DEMO_GREENHOUSE_API_PORT:-3101}" ;;
      *robot-broker) port=":${DEMO_ROBOT_MQTT_PORT:-1885}" ;;
      *robot-m20) port=":${DEMO_M20_STUB_PORT:-3209}" ;;
      *robot-api) port=":${DEMO_ROBOT_API_PORT:-3201}" ;;
      *industrial-broker) port=":${DEMO_INDUSTRIAL_MQTT_PORT:-1886}" ;;
      *industrial-api) port=":${DEMO_INDUSTRIAL_API_PORT:-3301}" ;;
    esac
    printf "  %-24s %-18s %s\n" "$name" "$status" "$port"
  done
}

case "$COMMAND" in
  start) cmd_start ;;
  stop) cmd_stop ;;
  status) cmd_status ;;
  *)
    echo "未知命令: $COMMAND" >&2
    usage >&2
    exit 2
    ;;
esac