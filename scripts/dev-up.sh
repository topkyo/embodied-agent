#!/usr/bin/env bash
# 启动指定 Domain Pack 的本地基础服务，并打开调试 monitor。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

usage() {
  cat <<'EOF'
用法:
  scripts/dev-up.sh greenhouse [--no-monitor]
  scripts/dev-up.sh robot [--no-monitor]
  scripts/dev-up.sh industrial [--no-monitor]
EOF
}

SCENE="${1:-${DEV_SCENE:-}}"
if [ -z "$SCENE" ]; then
  echo "需要显式指定 scene：greenhouse、robot 或 industrial。" >&2
  usage >&2
  exit 2
fi
if [ $# -gt 0 ]; then shift; fi

case "$SCENE" in
  greenhouse|robot|industrial) ;;
  -h|--help)
    usage
    exit 0
    ;;
  *)
    echo "未知 scene: $SCENE（仅支持 greenhouse / robot / industrial）" >&2
    usage >&2
    exit 2
    ;;
esac

NO_MONITOR=0
while [ $# -gt 0 ]; do
  case "$1" in
    --no-monitor)
      NO_MONITOR=1
      shift
      ;;
    *)
      echo "未知参数: $1" >&2
      exit 2
      ;;
  esac
done

"$ROOT/scripts/dev-services.sh" start --scene "$SCENE"

if [ "$NO_MONITOR" = "1" ]; then
  exit 0
fi

if [ "$SCENE" = "industrial" ]; then
  echo "industrial 无 monitor 面板，使用 npm run dev:logs 查看日志。后台服务已启动。"
else
  exec "$ROOT/scripts/dev-monitor.sh" --scene "$SCENE"
fi
