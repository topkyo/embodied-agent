#!/usr/bin/env bash
# setup-bare-metal.sh — 狗云 VPS 本机部署一次性初始化
# 前置：Ubuntu 24.04 LTS，以 root 或 sudo 用户执行
set -euo pipefail

REPO_DIR="/home/tim/project/EA"
DATA_DIR="/home/tim/var/embodied-agent-data"
MOSQ_DIR="/home/tim/var/mosquitto-runtime"
SCRIPTS_DIR="/home/tim/scripts"

echo "=== 1. 安装 Node.js 20 (NodeSource) ==="
if ! command -v node &>/dev/null || [[ "$(node -v)" != v20* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
echo "Node.js: $(node -v)"

echo "=== 2. 安装 Mosquitto ==="
if ! command -v mosquitto &>/dev/null; then
  apt-get update && apt-get install -y mosquitto mosquitto-clients
fi

echo "=== 3. 安装 better-sqlite3 编译依赖 ==="
apt-get install -y --no-install-recommends python3 make g++

echo "=== 4. 创建目录 ==="
mkdir -p "$REPO_DIR" "$DATA_DIR" "$MOSQ_DIR" "$SCRIPTS_DIR" /home/tim/backups

echo "=== 5. 克隆仓库（如不存在） ==="
if [ ! -d "$REPO_DIR/.git" ]; then
  git clone https://github.com/topkyo/embodied-agent.git "$REPO_DIR"
fi
chown -R tim:tim /home/tim/project /home/tim/var /home/tim/scripts /home/tim/backups

echo "=== 6. 安装依赖 + 构建 ==="
cd "$REPO_DIR"
sudo -u tim npm ci --include=dev
# tsx bin symlink 偶发缺失，显式校验并重建
if [ ! -e node_modules/.bin/tsx ]; then
  sudo -u tim npm rebuild tsx
fi
sudo -u tim bash scripts/ensure-workspace-runtime-build.sh

echo "=== 7. 配置 Mosquitto ==="
# 密码文件需从 .env.vps.local 读取（执行前先 cp .env.vps.example .env.vps.local）
if [ -f "$REPO_DIR/.env.vps.local" ]; then
  MQTT_API_PW=$(grep MQTT_API_PASSWORD "$REPO_DIR/.env.vps.local" | cut -d= -f2)
  MQTT_NODE_PW=$(grep MQTT_NODE_PASSWORD "$REPO_DIR/.env.vps.local" | cut -d= -f2)
  mosquitto_passwd -b -c "$MOSQ_DIR/passwd" api "$MQTT_API_PW"
  mosquitto_passwd -b "$MOSQ_DIR/passwd" node "$MQTT_NODE_PW"
  cp "$REPO_DIR/infra/mosquitto/acl" "$MOSQ_DIR/acl"
  cat > "$MOSQ_DIR/mosquitto.conf" << EOF
listener 1883 127.0.0.1
allow_anonymous false
password_file $MOSQ_DIR/passwd
acl_file $MOSQ_DIR/acl
persistence false
EOF
  chmod 644 "$MOSQ_DIR"/*
  chown mosquitto:mosquitto "$MOSQ_DIR/passwd"
  if command -v ufw >/dev/null 2>&1; then
    MQTT_UFW_PORT=1883
    ufw delete allow "${MQTT_UFW_PORT}/tcp" >/dev/null 2>&1 || true
  fi
fi

echo "=== 8. 安装 systemd service（真源在 deploy/vps/*.service） ==="
cp "$REPO_DIR/deploy/vps/ea-api.service" /etc/systemd/system/ea-api.service
cp "$REPO_DIR/deploy/vps/ea-simulator@.service" /etc/systemd/system/ea-simulator@.service

# Mosquitto 用系统 service，覆盖配置指向自定义目录
mkdir -p /etc/systemd/system/mosquitto.service.d
cat > /etc/systemd/system/mosquitto.service.d/override.conf << EOF
[Service]
ExecStart=
ExecStart=/usr/sbin/mosquitto -c $MOSQ_DIR/mosquitto.conf
EOF

systemctl daemon-reload
systemctl enable ea-api mosquitto ea-simulator@node-sim-gh-001 ea-simulator@node-sim-gh-002

echo "=== 9. 准备运行数据 ==="
if [ ! -f "$DATA_DIR/settings.json" ]; then
  cp "$REPO_DIR/deploy/vps/data-templates/settings.json" "$DATA_DIR/"
  echo "WARNING: 已复制 settings.json 模板，请编辑填入真实值（含 mqtt_url=mqtt://127.0.0.1:1883）"
fi
if [ ! -f "$DATA_DIR/device-registry.json" ]; then
  cp "$REPO_DIR/deploy/vps/data-templates/device-registry.json" "$DATA_DIR/"
fi
# 数据目录须归属 tim（服务以 tim 运行），否则读写失败
chown -R tim:tim "$DATA_DIR"

echo "=== 10. 签发模拟器 node_token（AGENT_SECRETS_KEY 加密落盘） ==="
if [ -f "$REPO_DIR/.env.vps.local" ]; then
  cd "$REPO_DIR"
  sudo -u tim bash -c 'set -a; source .env.vps.local; set +a; npx tsx scripts/ensure-sim-node-tokens.ts'
fi

echo ""
echo "=== 完成 ==="
echo "后续步骤："
echo "  1. cp $REPO_DIR/deploy/vps/.env.vps.example $REPO_DIR/.env.vps.local && 填入真实值"
echo "  2. sudo systemctl start mosquitto"
echo "  3. sudo systemctl start ea-api"
echo "  4. 验证: curl -sf http://127.0.0.1:3001/health"
echo "  5. （可选）启动模拟器: sudo systemctl start ea-simulator"
