#!/usr/bin/env bash
# backup-pull.sh — 从 VPS 拉取数据备份到本地（off-site 备份）
# 用法：deploy/vps/backup-pull.sh
# 建议加入本地 crontab: 每天执行一次
#   0 4 * * * ~/github/embodied-agent/deploy/vps/backup-pull.sh

set -euo pipefail

VPS_HOST="goyun"
LOCAL_BACKUP_DIR="${HOME}/backups/embodied-agent"
RETENTION_DAYS=30

mkdir -p "$LOCAL_BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
ARCHIVE="$LOCAL_BACKUP_DIR/data-$TIMESTAMP.tar.gz"

echo "从 VPS 拉取数据备份..."
ssh "$VPS_HOST" "sudo tar -czf /tmp/ea-backup-$TIMESTAMP.tar.gz -C /home/tim/var embodied-agent-data && \
                 sudo chown tim:tim /tmp/ea-backup-$TIMESTAMP.tar.gz"
scp "$VPS_HOST:/tmp/ea-backup-$TIMESTAMP.tar.gz" "$ARCHIVE"
ssh "$VPS_HOST" "rm -f /tmp/ea-backup-$TIMESTAMP.tar.gz"

SIZE=$(du -h "$ARCHIVE" | cut -f1)
echo "备份完成: $ARCHIVE ($SIZE)"

# 清理过期本地备份
find "$LOCAL_BACKUP_DIR" -name "data-*.tar.gz" -mtime +$RETENTION_DAYS -delete
COUNT=$(find "$LOCAL_BACKUP_DIR" -name "data-*.tar.gz" | wc -l)
TOTAL=$(du -sh "$LOCAL_BACKUP_DIR" | cut -f1)
echo "当前本地备份: ${COUNT} 个, 总计 ${TOTAL}"
