#!/usr/bin/env bash
# traffic-report.sh — 每日 vnstat 流量报告发送到 Slack
# cron: 0 9 * * * /home/tim/scripts/traffic-report.sh
set -euo pipefail

SLACK_WEBHOOK=$(cat /home/tim/scripts/.slack-webhook 2>/dev/null)
if [ -z "$SLACK_WEBHOOK" ]; then
  echo "no slack webhook configured"
  exit 0
fi

# vnstat --oneline 格式: eth0;date;rx;tx;total;rx_rate;tx_rate;total_rate
TODAY_LINE=$(vnstat --oneline -i eth0 2>/dev/null || echo "")
MONTH_LINE=$(vnstat --oneline -i eth0 --months 1 2>/dev/null || echo "")

TODAY_RX=$(echo "$TODAY_LINE" | awk -F';' '{print $3}')
TODAY_TX=$(echo "$TODAY_LINE" | awk -F';' '{print $4}')
TODAY_TOTAL=$(echo "$TODAY_LINE" | awk -F';' '{print $5}')

MONTH_RX=$(echo "$MONTH_LINE" | awk -F';' '{print $3}')
MONTH_TX=$(echo "$MONTH_LINE" | awk -F';' '{print $4}')
MONTH_TOTAL=$(echo "$MONTH_LINE" | awk -F';' '{print $5}')

TEXT="📊 VPS 每日流量报告
今日: ↓${TODAY_RX:-N/A} ↑${TODAY_TX:-N/A} 合计 ${TODAY_TOTAL:-N/A}
本月: ↓${MONTH_RX:-N/A} ↑${MONTH_TX:-N/A} 合计 ${MONTH_TOTAL:-N/A}
狗云控制台查看计费流量为准"

PAYLOAD=$(python3 -c "import json,sys; print(json.dumps({'text': sys.argv[1]}))" "$TEXT")

curl -sf -X POST -H "Content-Type: application/json" -d "$PAYLOAD" "$SLACK_WEBHOOK" 2>/dev/null && echo "sent" || echo "send failed"
