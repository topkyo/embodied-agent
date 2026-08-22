#!/usr/bin/env bash
# API/runtime 依赖 workspace 包的 dist/（core、domain-sdk、Domain Pack 等）。
# 增量构建：dist 存在且比 src 新则跳过，避免每次 dev-services start 全量 build（~2.5min → ~5s）。
# 强制全量重建：FORCE_BUILD=1 bash scripts/ensure-workspace-runtime-build.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

FORCE="${FORCE_BUILD:-0}"

# macOS 用 stat -f '%m'，Linux 用 stat -c '%Y'；启动时探测一次供 find -exec 复用。
if stat -f '%m' /dev/null >/dev/null 2>&1; then
  STAT_MTIME=(stat -f '%m')
else
  STAT_MTIME=(stat -c '%Y')
fi

# 判断某 workspace 的 dist 是否新鲜（存在且比 src 最新文件新）。
# 用法: dist_fresh <src_dir> <dist_dir>
dist_fresh() {
  local src_dir="$1" dist_dir="$2"
  [ -d "$dist_dir" ] || return 1
  local dist_newest src_newest
  dist_newest=$(find "$dist_dir" -type f \( -name '*.js' -o -name '*.d.ts' -o -name '*.json' \) -exec "${STAT_MTIME[@]}" {} \; 2>/dev/null | sort -rn | head -1)
  [ -n "$dist_newest" ] || return 1
  src_newest=$(find "$src_dir" -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.json' \) -not -path '*/node_modules/*' -not -path '*/dist/*' -exec "${STAT_MTIME[@]}" {} \; 2>/dev/null | sort -rn | head -1)
  [ -n "$src_newest" ] || return 0
  [ "$dist_newest" -ge "$src_newest" ]
}

# 带跳过逻辑的 build 包装。
# 用法: run_build <npm_script> <workspace> <src_dir> <dist_dir>
run_build() {
  local script="$1" ws="$2" src_dir="$3" dist_dir="$4"
  if [ "$FORCE" = "0" ] && dist_fresh "$src_dir" "$dist_dir"; then
    echo "skip $ws $script (dist fresh)"
    return
  fi
  npm run "$script" -w "$ws"
}

# Domain pack 的 bootstrap + full build 是两个阶段，但都会 rm -rf dist。
# 如果 dist 已新鲜，整个序列跳过；否则先 bootstrap 再 full。
run_domain_pack() {
  local ws="$1" src_dir="$2" dist_dir="$3"
  if [ "$FORCE" = "0" ] && dist_fresh "$src_dir" "$dist_dir"; then
    echo "skip $ws (dist fresh)"
    return
  fi
  npm run build:bootstrap -w "$ws"
  npm run build -w "$ws"
}

# core primitives（独立 tsconfig，产物在 dist/）
run_build "build:primitives" "@embodied-agent/core" "packages/core/src" "packages/core/dist"

# Domain pack 依赖 core/domain-sdk 的 dist，必须先全量构建它们（干净环境下 pack 先构建会 TS2307）。
# 干净环境下 primitives 阶段刚写入 dist，会让 dist_fresh 误判 core 全量构建可跳过；
# 缺 dist/index.js 说明只有 primitives 产物，强制重建。
[ -f packages/core/dist/index.js ] || rm -rf packages/core/dist
run_build "build" "@embodied-agent/core" "packages/core/src" "packages/core/dist"
run_build "build" "@embodied-agent/platform" "packages/platform/src" "packages/platform/dist"
run_build "build" "@embodied-agent/memory" "packages/memory/src" "packages/memory/dist"
run_build "build" "@embodied-agent/domain-sdk" "packages/domain-sdk/src" "packages/domain-sdk/dist"

# Domain pack（bootstrap + full 一体判断）
run_domain_pack "@embodied-agent/domain-agriculture" "scenes/greenhouse" "scenes/greenhouse/dist"
run_domain_pack "@embodied-agent/domain-robotics" "scenes/robot" "scenes/robot/dist"
run_domain_pack "@embodied-agent/domain-aquaculture" "scenes/aquaculture" "scenes/aquaculture/dist"
run_domain_pack "@embodied-agent/domain-industrial" "scenes/industrial" "scenes/industrial/dist"
# domain-packs:insert-here

# 其余 workspace（按依赖顺序）
run_build "build" "@embodied-agent/node" "packages/node/src" "packages/node/dist"
run_build "build" "@embodied-agent/agent" "packages/agent/src" "packages/agent/dist"
run_build "build" "@embodied-agent/safety" "packages/safety/src" "packages/safety/dist"
run_build "build" "@embodied-agent/runtime" "packages/runtime/src" "packages/runtime/dist"
run_build "build" "@embodied-agent/chat-runtime" "packages/chat-runtime/src" "packages/chat-runtime/dist"
run_build "build" "@embodied-agent/channel-runtime" "packages/channel-runtime/src" "packages/channel-runtime/dist"
run_build "build" "@embodied-agent/alert-runtime" "packages/alert-runtime/src" "packages/alert-runtime/dist"
