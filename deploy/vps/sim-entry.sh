#!/usr/bin/env bash
# VPS 模拟器入口脚本。
# node-simulator 用 node MQTT 凭据（区别于 API 的 api 凭据），
# 因此在此覆盖 MQTT_USERNAME/MQTT_PASSWORD，并指向本机 API/MQTT。
set -eu
cd "$(dirname "$0")/../.."

export API_URL="${API_URL:-http://127.0.0.1:3001}"
export MQTT_URL="${MQTT_URL:-mqtt://127.0.0.1:1883}"
export MQTT_USERNAME=node
export MQTT_PASSWORD="${MQTT_NODE_PASSWORD:?Set MQTT_NODE_PASSWORD in .env.vps.local}"

# 从 NODE_ID 推导 GREENHOUSE_ID（node-sim-gh-XXX → gh-XXX），未显式设置时生效
if [ -z "${GREENHOUSE_ID:-}" ] && [ -n "${NODE_ID:-}" ]; then
  case "$NODE_ID" in
    node-sim-gh-*) export GREENHOUSE_ID="gh-${NODE_ID#node-sim-gh-}" ;;
  esac
fi

# node-tokens.json 生产环境以 AGENT_SECRETS_KEY 加密落盘；模拟器发送遥测时须用明文 token
# （API 端 getNodeToken 解密后比对）。此处解密后注入 NODE_TOKEN。
if [ -z "${NODE_TOKEN:-}" ] && [ -n "${AGENT_SECRETS_KEY:-}" ]; then
  NODE_TOKEN="$(npx tsx scripts/print-node-token.ts "${DEPLOYMENT_ID}" "${NODE_ID}")"
  export NODE_TOKEN
fi

exec npx tsx scripts/node-simulator.ts
