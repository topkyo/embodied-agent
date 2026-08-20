#!/usr/bin/env bash
# VPS 部署专用 API 入口脚本。
# 用法：
#   vps-api-entry.sh           — 预检 + 构建 + 启动（完整流程）
#   vps-api-entry.sh --check   — 仅预检 settings.json / device-registry.json
set -eu
DATA="${AGENT_DATA_DIR:-/home/tim/var/embodied-agent-data}"
mkdir -p "$DATA"

# 预检：settings.json 和 device-registry.json 必须存在
for f in settings.json device-registry.json; do
  if [ ! -f "$DATA/$f" ]; then
    echo "ERROR: missing $DATA/$f; provision $f explicitly before starting." >&2
    exit 1
  fi
done

# --check 模式：仅预检，不构建不启动
if [ "${1:-}" = "--check" ]; then
  echo "pre-flight check passed: settings.json + device-registry.json present"
  exit 0
fi

# 完整模式：构建 + 启动
bash "$(dirname "$0")/../scripts/ensure-workspace-runtime-build.sh"
exec npm run start -w @embodied-agent/api
