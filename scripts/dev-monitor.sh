#!/usr/bin/env bash
# 场景监控 tmux：只跑调试面板，基础 Web/API/MQTT 由 dev-services 常驻。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
STATE_ROOT="$ROOT/.agentstack/dev-services"

SCENE="${DEV_SCENE:-greenhouse}"
DETACHED="${EMBODIED_AGENT_TMUX_DETACHED:-}"

while [ $# -gt 0 ]; do
  case "$1" in
    --scene)
      SCENE="${2:-}"
      shift 2
      ;;
    --scene=*)
      SCENE="${1#*=}"
      shift
      ;;
    --detached)
      DETACHED=1
      shift
      ;;
    *)
      echo "未知参数: $1" >&2
      exit 2
      ;;
  esac
done

case "$SCENE" in
  greenhouse|robot) ;;
  *)
    echo "未知 scene: ${SCENE}（仅支持 greenhouse / robot）" >&2
    exit 2
    ;;
esac

if ! command -v tmux >/dev/null 2>&1; then
  echo "需要安装 tmux (mac: brew install tmux)" >&2
  exit 1
fi

ENV_FILE="$STATE_ROOT/$SCENE/env.sh"
if [ ! -f "$ENV_FILE" ]; then
  echo "缺少 dev service 状态，请先运行: npm run dev:$SCENE -- --no-monitor" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$ENV_FILE"

SESSION="ea-$SCENE-monitor"
tmux kill-session -t "$SESSION" 2>/dev/null || true
tmux new-session -d -s "$SESSION" -n "$SCENE"
WIN_IDX="$(tmux list-windows -t "$SESSION" -F '#{window_index}' | head -1)"
WIN="$SESSION:$WIN_IDX"
tmux set-option -t "$SESSION" allow-rename off 2>/dev/null || true
tmux set-option -t "$WIN" automatic-rename off 2>/dev/null || true
tmux set -g mouse on
tmux set -g pane-border-status top 2>/dev/null || true
tmux set -g pane-border-format " #{pane_title} " 2>/dev/null || true

send() {
  local pane="$1" title="$2" cmd="$3"
  tmux select-pane -t "$WIN.$pane" -T "$title" 2>/dev/null || true
  tmux send-keys -t "$WIN.$pane" "$cmd" C-m
}

if [ "$SCENE" = "greenhouse" ]; then
  P0="$(tmux display-message -p -t "$WIN" '#{pane_index}')"
  P1="$(tmux split-window -t "$WIN" -P -F '#{pane_index}')"
  P2="$(tmux split-window -t "$WIN" -P -F '#{pane_index}')"
  P3="$(tmux split-window -t "$WIN" -P -F '#{pane_index}')"
  tmux select-layout -t "$WIN" tiled

  send "$P0" "[0] Sim gh-001" \
    "cd \"$ROOT\" && echo 'waiting API $API_URL' && until curl -sf \"$API_URL/health\" >/dev/null; do sleep 2; done && echo '双棚模拟绑定需显式运行: npm run ensure:sim-dual' && AGENT_DATA_DIR=\"$AGENT_DATA_DIR\" DEPLOYMENT_ID=dep-gh-pilot-001 ADMIN_TOKEN=\"$ADMIN_TOKEN\" MQTT_URL=\"$MQTT_URL\" NODE_ID=node-sim-gh-001 npx tsx scripts/node-simulator.ts"
  send "$P1" "[1] Sim gh-002" \
    "cd \"$ROOT\" && sleep 8 && AGENT_DATA_DIR=\"$AGENT_DATA_DIR\" DEPLOYMENT_ID=dep-gh-pilot-001 ADMIN_TOKEN=\"$ADMIN_TOKEN\" MQTT_URL=\"$MQTT_URL\" NODE_ID=node-sim-gh-002 GREENHOUSE_ID=gh-002 npx tsx scripts/node-simulator.ts --auto"
  send "$P2" "[2] MQTT Watch" \
    "cd \"$ROOT\" && MQTT_URL=\"$MQTT_URL\" npx tsx scripts/mqtt-watch.ts"
  send "$P3" "[3] Base Logs" \
    "tail -n 80 -F \"$STATE_DIR/logs/api.log\" \"$STATE_DIR/logs/web.log\" \"$STATE_DIR/logs/broker.log\""
else
  P0="$(tmux display-message -p -t "$WIN" '#{pane_index}')"
  P1="$(tmux split-window -t "$WIN" -P -F '#{pane_index}')"
  P2="$(tmux split-window -t "$WIN" -P -F '#{pane_index}')"
  tmux select-layout -t "$WIN" tiled

  send "$P0" "[0] Base Logs" \
    "tail -n 80 -F \"$STATE_DIR/logs/api.log\" \"$STATE_DIR/logs/web.log\" \"$STATE_DIR/logs/m20-stub.log\""
  send "$P1" "[1] Robot Overview" \
    "while true; do clear; date; curl -s -H \"x-admin-token: $ADMIN_TOKEN\" \"$API_URL/admin/robot/overview\"; echo; sleep 5; done"
  send "$P2" "[2] Robot Commands" \
    "cat <<'EOF'
Web: http://127.0.0.1:$WEB_PORT/login（admin session 后进 /scenes/robot/ops/settings）
Overview:
  curl -H 'x-admin-token: $ADMIN_TOKEN' $API_URL/admin/robot/overview
M20 stub:
  http://127.0.0.1:$M20_STUB_PORT
关闭本 tmux 不会停止 Web/API；停止基础服务: npm run dev:stop
EOF
exec bash"
fi

echo "monitor ready: $SESSION"
echo "Web: http://127.0.0.1:$WEB_PORT"
echo "API: $API_URL"

if [ -n "$DETACHED" ]; then
  exit 0
fi

exec tmux attach -t "$SESSION"
