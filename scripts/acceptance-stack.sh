#!/usr/bin/env bash
# 本机完整验收栈（方案二）：demo 三域 + 工作台 greenhouse + 营销站。
# 用法: scripts/acceptance-stack.sh start|stop|status

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
STATE_ROOT="$ROOT/.agentstack/acceptance-services"
ENV_FILE="${DEMO_ENV_FILE:-$ROOT/.env.demo-site.local}"

COMMAND="${1:-status}"
if [ $# -gt 0 ]; then shift; fi

usage() {
  cat <<'EOF'
用法:
  scripts/acceptance-stack.sh start   # 后台启动完整验收环境
  scripts/acceptance-stack.sh stop
  scripts/acceptance-stack.sh status

启动后:
  营销站  http://127.0.0.1:5170
  工作台  http://127.0.0.1:5173
  工作台 API http://127.0.0.1:3001
  demo API  3101 / 3201 / 3301
EOF
}

load_env() {
  if [ -f "$ENV_FILE" ]; then
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
  fi
  DEMO_GREENHOUSE_API_PORT="${DEMO_GREENHOUSE_API_PORT:-3101}"
  DEMO_ROBOT_API_PORT="${DEMO_ROBOT_API_PORT:-3201}"
  DEMO_INDUSTRIAL_API_PORT="${DEMO_INDUSTRIAL_API_PORT:-3301}"
  DEMO_SITE_ORIGIN="${DEMO_SITE_ORIGIN:-http://127.0.0.1:5170}"
  SITE_PORT="${SITE_PORT:-5170}"
  WEB_PORT="${WEB_PORT:-5173}"
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

start_bg() {
  local name="$1" command="$2"
  mkdir -p "$STATE_ROOT/pids" "$STATE_ROOT/logs"
  local old_pid log
  old_pid="$(read_pid "$(pid_file "$name")")"
  if is_pid_alive "$old_pid"; then
    echo "已运行: ${name} pid=${old_pid}"
    return
  fi
  log="$(log_file "$name")"
  echo "启动 ${name}，日志: ${log}"
  (
    cd "$ROOT"
    nohup bash -lc "$command" </dev/null >>"$log" 2>&1 &
    echo $! >"$(pid_file "$name")"
  )
}

stop_bg() {
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

wait_health() {
  local url="$1" name="$2" i
  for i in $(seq 1 60); do
    if curl -sf "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.5
  done
  echo "${name} 未就绪: ${url}" >&2
  return 1
}

cmd_start() {
  load_env
  mkdir -p "$STATE_ROOT/logs" "$STATE_ROOT/pids"

  echo ">>> [1/4] 三域 demo 栈"
  "$ROOT/scripts/demo-stack-local.sh" start

  echo ">>> [2/4] 工作台 greenhouse（API + Web + 双棚模拟器）"
  "$ROOT/scripts/dev-services.sh" stop --scene greenhouse 2>/dev/null || true
  AGENT_DATA_DIR="$ROOT/.agentstack/dev-profiles/greenhouse/data" \
    "$ROOT/scripts/dev-services.sh" start --scene greenhouse

  local gh_data="$ROOT/.agentstack/dev-profiles/greenhouse/data"
  local gh_api="http://127.0.0.1:3001"
  local gh_mqtt="mqtt://127.0.0.1:1883"
  echo ">>> 双棚模拟器绑定"
  AGENT_DATA_DIR="$gh_data" ENSURE_SIM_DUAL_FORCE_REBIND=1 npx tsx "$ROOT/scripts/ensure-sim-dual-nodes.ts"
  start_bg "workbench-sim-gh-001" \
    "cd $(quote_env "$ROOT") && AGENT_DATA_DIR=$(quote_env "$gh_data") DEPLOYMENT_ID=dep-gh-pilot-001 ADMIN_TOKEN=dev-admin MQTT_URL=$(quote_env "$gh_mqtt") NODE_ID=node-sim-gh-001 SIM_TELEMETRY_REACT=1 exec npx tsx scripts/node-simulator.ts"
  start_bg "workbench-sim-gh-002" \
    "cd $(quote_env "$ROOT") && AGENT_DATA_DIR=$(quote_env "$gh_data") DEPLOYMENT_ID=dep-gh-pilot-001 ADMIN_TOKEN=dev-admin MQTT_URL=$(quote_env "$gh_mqtt") NODE_ID=node-sim-gh-002 GREENHOUSE_ID=gh-002 SIM_TELEMETRY_REACT=1 exec npx tsx scripts/node-simulator.ts --auto"

  wait_health "$gh_api/health" "workbench-api"

  echo ">>> [3/4] 营销站"
  start_bg "site" \
    "cd $(quote_env "$ROOT") && VITE_WEB_APP_URL=http://127.0.0.1:$(quote_env "$WEB_PORT") VITE_DEMO_API_GREENHOUSE=http://127.0.0.1:$(quote_env "$DEMO_GREENHOUSE_API_PORT") VITE_DEMO_API_ROBOT=http://127.0.0.1:$(quote_env "$DEMO_ROBOT_API_PORT") VITE_DEMO_API_INDUSTRIAL=http://127.0.0.1:$(quote_env "$DEMO_INDUSTRIAL_API_PORT") SITE_PORT=$(quote_env "$SITE_PORT") exec npm run site:dev"

  wait_health "http://127.0.0.1:$SITE_PORT/" "site"

  echo ""
  echo "=== 本机完整验收栈已后台运行 ==="
  echo "  营销站:     http://127.0.0.1:$SITE_PORT"
  echo "  工作台:     http://127.0.0.1:$WEB_PORT"
  echo "  登录:       http://127.0.0.1:$WEB_PORT/login"
  echo "  微信绑定:   http://127.0.0.1:$WEB_PORT/start/wechat"
  echo "  运维总览:   http://127.0.0.1:$WEB_PORT/scenes/greenhouse/ops"
  echo "  demo 温室:  http://127.0.0.1:$SITE_PORT/scenes/greenhouse#demo"
  echo "  demo 机器人:http://127.0.0.1:$SITE_PORT/scenes/robot#demo"
  echo "  demo 工业:  http://127.0.0.1:$SITE_PORT/scenes/industrial#demo"
  echo ""
  echo "停止: npm run acceptance:stop  或  scripts/acceptance-stack.sh stop"
  echo "状态: npm run acceptance:status"
  echo "日志: .agentstack/acceptance-services/logs/ 与 .agentstack/demo-services/logs/"
}

cmd_stop() {
  echo ">>> 停止营销站与双棚模拟器"
  stop_bg "site"
  stop_bg "workbench-sim-gh-002"
  stop_bg "workbench-sim-gh-001"
  echo ">>> 停止工作台"
  "$ROOT/scripts/dev-services.sh" stop --scene greenhouse 2>/dev/null || true
  echo ">>> 停止 demo 栈"
  "$ROOT/scripts/demo-stack-local.sh" stop
}

cmd_status() {
  load_env
  echo "[acceptance]"
  for name in workbench-sim-gh-001 workbench-sim-gh-002 site; do
    local pid status
    pid="$(read_pid "$(pid_file "$name")")"
    if is_pid_alive "$pid"; then status="running pid=$pid"; else status="stopped"; fi
    printf "  %-24s %s\n" "$name" "$status"
  done
  echo ""
  "$ROOT/scripts/dev-services.sh" status --scene greenhouse || true
  echo ""
  echo "[demo]"
  "$ROOT/scripts/demo-stack-local.sh" status || true
  echo ""
  echo "URLs: site http://127.0.0.1:${SITE_PORT:-5170} | web http://127.0.0.1:${WEB_PORT:-5173}"
}

case "$COMMAND" in
  start) cmd_start ;;
  stop) cmd_stop ;;
  status) cmd_status ;;
  help|-h|--help) usage ;;
  *)
    echo "未知命令: $COMMAND" >&2
    usage >&2
    exit 2
    ;;
esac