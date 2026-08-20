#!/usr/bin/env bash
# 检测本机局域网 IPv4（macOS en0/en1/en2）

lan_ip() {
  local iface ip
  for iface in en0 en1 en2; do
    ip=$(ipconfig getifaddr "$iface" 2>/dev/null) || true
    if [ -n "$ip" ]; then
      echo "$ip"
      return
    fi
  done
}