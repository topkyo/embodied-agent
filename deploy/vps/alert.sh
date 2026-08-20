#!/usr/bin/env bash
# alert.sh — 发送告警到 Telegram + Slack
# 用法: alert.sh "告警内容"

set -euo pipefail

MSG="$1"
TIMESTAMP=$(date -Iseconds)
TEXT="[EA VPS] $TIMESTAMP $MSG"

# Telegram
TG_TOKEN_FILE="/home/tim/scripts/.telegram-token"
if [ -f "$TG_TOKEN_FILE" ]; then
  TG_TOKEN=$(cat "$TG_TOKEN_FILE")
  TG_CHAT_FILE="/home/tim/scripts/.telegram-chat-id"
  if [ -f "$TG_CHAT_FILE" ]; then
    TG_CHAT=$(cat "$TG_CHAT_FILE")
    curl -sf --max-time 10 "https://api.telegram.org/bot${TG_TOKEN}/sendMessage" \
      -d "chat_id=${TG_CHAT}" -d "text=${TEXT}" > /dev/null 2>&1 || true
  fi
fi

# Slack
SLACK_FILE="/home/tim/scripts/.slack-webhook"
if [ -f "$SLACK_FILE" ]; then
  SLACK_URL=$(cat "$SLACK_FILE")
  curl -sf --max-time 10 -X POST -H "Content-type: application/json" \
    --data "{\"text\":\"${TEXT}\"}" "$SLACK_URL" > /dev/null 2>&1 || true
fi
