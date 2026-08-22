#!/usr/bin/env bash
# 释放本地开发栈占用的 TCP 端口（tmux 重启前调用，避免 EADDRINUSE）

free_dev_ports() {
  for port in "$@"; do
    local pids
    pids=$(lsof -ti :"${port}" 2>/dev/null || true)
    if [ -z "$pids" ]; then
      continue
    fi
    echo "[free-dev-ports] 释放 :${port} (pid ${pids//$'\n'/ })"
    # shellcheck disable=SC2086
    kill ${pids} 2>/dev/null || true
    sleep 0.5
    pids=$(lsof -ti :"${port}" 2>/dev/null || true)
    if [ -n "$pids" ]; then
      # shellcheck disable=SC2086
      kill -9 ${pids} 2>/dev/null || true
    fi
  done
}