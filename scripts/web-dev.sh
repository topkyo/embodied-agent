#!/usr/bin/env bash
# 启动 Web 开发服务器（vite.config.ts 已固定 host: 0.0.0.0，支持局域网访问）
# 禁止: npm run web:dev -- --host 127.0.0.1  （会把 127.0.0.1 误当成项目根目录）

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"
# shellcheck source=lib/lan-ip.sh
source "$SCRIPT_DIR/lib/lan-ip.sh"

export VITE_API_PROXY="${VITE_API_PROXY:-http://127.0.0.1:3001}"
export VITE_ADMIN_TOKEN="${VITE_ADMIN_TOKEN:-dev-admin}"
export VITE_SITE_MODE="${VITE_SITE_MODE:-deployment}"
export WEB_PORT="${WEB_PORT:-5173}"

LAN_IP=$(lan_ip)
PORT="$WEB_PORT"

echo "=== Web 配置台 ==="
echo "  本机:   http://127.0.0.1:${PORT}/"
if [ -n "$LAN_IP" ]; then
  echo "  局域网: http://${LAN_IP}:${PORT}/"
  echo "  登录:     http://${LAN_IP}:${PORT}/login"
  echo "  平台底座: http://${LAN_IP}:${PORT}/scenes/greenhouse/ops/platform（须 admin session）"
else
  echo "  局域网: （未检测到 en0/en1 IP，请本机访问）"
fi
echo "  API 代理: ${VITE_API_PROXY}（Vite 本机转发，手机无需直连 API）"
echo ""

exec npm run web:dev
