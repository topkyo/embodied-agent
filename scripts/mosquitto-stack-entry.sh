#!/usr/bin/env sh
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONF_SRC="${ROOT}/infra/mosquitto"
RUNTIME_CONF="/mosquitto/runtime"
mkdir -p "$RUNTIME_CONF"

API_PASS="${MQTT_API_PASSWORD:?Set MQTT_API_PASSWORD for stack mosquitto}"
NODE_PASS="${MQTT_NODE_PASSWORD:?Set MQTT_NODE_PASSWORD for stack mosquitto}"

PASSWD="${RUNTIME_CONF}/passwd"
mosquitto_passwd -b -c "$PASSWD" api "$API_PASS"
mosquitto_passwd -b "$PASSWD" node "$NODE_PASS"

cp "${CONF_SRC}/acl" "${RUNTIME_CONF}/acl"

if [ ! -f "${CONF_SRC}/certs/server.crt" ] || [ ! -f "${CONF_SRC}/certs/server.key" ]; then
  echo "Missing TLS certs under ${CONF_SRC}/certs (server.crt + server.key required)." >&2
  echo "run: bash scripts/mosquitto-gen-certs.sh" >&2
  exit 1
fi

mkdir -p "${RUNTIME_CONF}/certs"
cp "${CONF_SRC}/certs/server.crt" "${RUNTIME_CONF}/certs/server.crt"
cp "${CONF_SRC}/certs/server.key" "${RUNTIME_CONF}/certs/server.key"
cp "${CONF_SRC}/certs/ca.crt" "${RUNTIME_CONF}/certs/ca.crt"
cat > "${RUNTIME_CONF}/mosquitto.conf" <<'EOF'
# TLS-only stack broker (no plaintext listener).
allow_anonymous false
password_file /mosquitto/runtime/passwd
acl_file /mosquitto/runtime/acl
persistence false

listener 8883
cafile /mosquitto/runtime/certs/ca.crt
certfile /mosquitto/runtime/certs/server.crt
keyfile /mosquitto/runtime/certs/server.key
require_certificate false
EOF

exec mosquitto -c "${RUNTIME_CONF}/mosquitto.conf"
