#!/usr/bin/env bash
# health-watch.sh — 检测关键服务健康，异常时推送 Telegram + Slack 告警
# 设计：单次运行尽量收齐全部检查结果；失败不中断后续检查；外部 Tunnel 每 30 分钟一次。

set -uo pipefail

LOG="/home/tim/scripts/health-watch.log"
ALERT_LOG="/home/tim/scripts/health-alerts.log"
TOUCH_FILE="/home/tim/scripts/.tunnel-check-due"
STATE_FILE="/home/tim/scripts/.tunnel-url-state"
ALERT_SCRIPT="/home/tim/scripts/alert.sh"

FAILED=0

alert() {
  echo "$(date -Iseconds) ALERT: $1" >> "$ALERT_LOG"
  "$ALERT_SCRIPT" "$1" 2>/dev/null || true
  FAILED=1
}

check() {
  local name="$1"
  local cmd="$2"
  local result
  result=$(eval "$cmd" 2>/dev/null || echo "FAILED")
  if [ "$result" = "FAILED" ] || [ -z "$result" ]; then
    alert "$name 检查失败"
    return 1
  fi
  return 0
}

read_state_url() {
  # 只去掉首尾空白/换行，绝不 tr 掉字母 n
  if [ ! -f "$STATE_FILE" ]; then
    return 1
  fi
  local url
  url=$(tr -d '\r' < "$STATE_FILE" | head -n 1)
  url="${url#"${url%%[![:space:]]*}"}"
  url="${url%"${url##*[![:space:]]}"}"
  if [ -z "$url" ] || [ "${url:0:8}" != "https://" ]; then
    return 1
  fi
  printf '%s' "$url"
}

# === 本地服务检查 ===
check "API localhost" "curl -sf --max-time 5 http://127.0.0.1:3001/health" || true
check "Caddy localhost" "curl -sf --max-time 5 http://127.0.0.1:80/health" || true

for svc in ea-api ea-simulator@node-sim-gh-001 ea-simulator@node-sim-gh-002 mosquitto caddy cloudflared-tunnel sing-box; do
  if ! systemctl is-active --quiet "$svc"; then
    alert "服务 $svc 未运行"
  fi
done

# === 资源检查 ===
DISK_PCT=$(df / | tail -1 | awk '{print $5}' | tr -d '%')
if [ "${DISK_PCT:-0}" -gt 85 ]; then
  alert "磁盘使用率 ${DISK_PCT}% 超过 85%"
fi

MEM_AVAIL_KB=$(grep MemAvailable /proc/meminfo | awk '{print $2}')
MEM_AVAIL_MB=$((MEM_AVAIL_KB / 1024))
if [ "$MEM_AVAIL_MB" -lt 100 ]; then
  alert "可用内存仅 ${MEM_AVAIL_MB}MB 低于 100MB"
fi

# === Tunnel 外部检查（每 30 分钟）===
DO_TUNNEL=1
if [ -f "$TOUCH_FILE" ]; then
  LAST=$(tr -d ' \t\r\n' < "$TOUCH_FILE" || true)
  NOW=$(date +%s)
  if [ -n "${LAST:-}" ] && [ "$LAST" -eq "$LAST" ] 2>/dev/null; then
    DIFF=$((NOW - LAST))
    if [ "$DIFF" -lt 1800 ]; then
      DO_TUNNEL=0
    fi
  fi
fi

if [ "$DO_TUNNEL" -eq 0 ]; then
  echo "$(date -Iseconds) health OK (local, disk=${DISK_PCT}%, mem=${MEM_AVAIL_MB}MB, failed=${FAILED})" >> "$LOG"
  exit 0
fi

TUNNEL_URL=$(read_state_url || true)
if [ -z "${TUNNEL_URL:-}" ]; then
  TUNNEL_URL=$(sudo journalctl -u cloudflared-tunnel --no-pager -n 200 2>/dev/null \
    | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -1 || true)
fi
if [ -n "${TUNNEL_URL:-}" ]; then
  check "Tunnel external" "curl -sf --max-time 10 ${TUNNEL_URL}/health" || true
else
  alert "Tunnel URL 不可用（状态文件与 journal 均无有效 URL）"
fi

# 无论成功失败都推进节流时间戳，避免检查失败时每 5 分钟狂刷
date +%s > "$TOUCH_FILE"
if [ "$FAILED" -eq 0 ]; then
  echo "$(date -Iseconds) health OK (full, disk=${DISK_PCT}%, mem=${MEM_AVAIL_MB}MB)" >> "$LOG"
else
  echo "$(date -Iseconds) health DONE with failures (full, disk=${DISK_PCT}%, mem=${MEM_AVAIL_MB}MB)" >> "$LOG"
fi
exit 0
