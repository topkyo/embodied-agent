#!/usr/bin/env bash
# Reset demo profile runtime state while preserving settings/registry seeds.
# Intended for cron/systemd timer on demo VPS.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

DATA_ROOT="${DEMO_STACK_DATA_ROOT:-.agentstack/demo-profiles}"

usage() {
  cat <<'EOF'
用法:
  scripts/demo-reset.sh [greenhouse|robot|industrial|all]

环境变量:
  DEMO_STACK_DATA_ROOT  默认 .agentstack/demo-profiles
  MQTT_URL / M20_STUB_PORT  传给 demo-provision-profile.mjs（可选）

Cron 示例（每 6 小时重置三域）:
  0 */6 * * * cd /opt/embodied-agent && DEMO_STACK_DATA_ROOT=/var/lib/embodied-agent/demo-profiles ./scripts/demo-reset.sh all >> /var/log/embodied-agent-demo-reset.log 2>&1
EOF
}

reset_scene() {
  local scene="$1"
  local data_dir="$DATA_ROOT/$scene/data"
  local deployment_dir="$data_dir/deployments"

  echo "[demo-reset] scene=$scene data=$data_dir"
  node "$ROOT/scripts/demo-provision-profile.mjs" "$scene" "$data_dir"

  if [ -d "$deployment_dir" ]; then
    find "$deployment_dir" -mindepth 2 -maxdepth 2 -type f \( \
      -name '*.json' -o -name '*.jsonl' \
    \) ! -name 'device-registry.json' ! -name 'settings.json' -delete 2>/dev/null || true
    find "$deployment_dir" -mindepth 2 -maxdepth 2 -type d -empty -delete 2>/dev/null || true
  fi

  rm -f "$data_dir/agent.db" "$data_dir/agent.db-wal" "$data_dir/agent.db-shm" 2>/dev/null || true
  rm -f "$data_dir"/pending-*.json "$data_dir"/platform-bindings.json 2>/dev/null || true
}

SCENE="${1:-all}"
case "$SCENE" in
  -h|--help)
    usage
    exit 0
    ;;
  greenhouse|robot|industrial)
    reset_scene "$SCENE"
    ;;
  all)
    reset_scene greenhouse
    reset_scene robot
    reset_scene industrial
    ;;
  *)
    echo "未知 scene: $SCENE" >&2
    usage >&2
    exit 2
    ;;
esac

echo "[demo-reset] done scene=$SCENE"