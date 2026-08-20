#!/usr/bin/env bash
# cloudflared-tunnel-entry.sh — Quick Tunnel 启动包装：把分配到的 URL 落盘
# 供 systemd cloudflared-tunnel.service 使用，供 tunnel-watch / health-watch 读取。

set -euo pipefail

STATE_FILE="${TUNNEL_STATE_FILE:-/home/tim/scripts/.tunnel-url-state}"
CLOUDFLARED_BIN="${CLOUDFLARED_BIN:-/usr/bin/cloudflared}"
TARGET_URL="${TUNNEL_ORIGIN_URL:-http://localhost:80}"

mkdir -p "$(dirname "$STATE_FILE")"

# pipefail：cloudflared 退出码向上传递，systemd 才能正确 Restart
set -o pipefail

# stdbuf 行缓冲，尽快捕获 URL；tee 保证 journal 仍有完整日志
stdbuf -oL -eL "$CLOUDFLARED_BIN" tunnel --url "$TARGET_URL" --no-autoupdate 2>&1 | \
while IFS= read -r line || [ -n "${line:-}" ]; do
  printf '%s\n' "$line"
  if [[ "$line" =~ (https://[a-z0-9-]+\.trycloudflare\.com) ]]; then
    printf '%s\n' "${BASH_REMATCH[1]}" > "$STATE_FILE"
    chmod 644 "$STATE_FILE" 2>/dev/null || true
  fi
done
