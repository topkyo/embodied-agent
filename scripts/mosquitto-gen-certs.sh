#!/usr/bin/env sh
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${ROOT}/infra/mosquitto/certs"
mkdir -p "$OUT"

CN="${MQTT_TLS_CN:-embodied-agent-mqtt}"
DAYS="${MQTT_TLS_CERT_DAYS:-825}"
SAN="${MQTT_TLS_SAN:-DNS:${CN},DNS:mosquitto,DNS:localhost,IP:127.0.0.1}"

openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout "${OUT}/server.key" \
  -out "${OUT}/server.crt" \
  -days "$DAYS" \
  -subj "/CN=${CN}" \
  -addext "subjectAltName=${SAN}"

cp "${OUT}/server.crt" "${OUT}/ca.crt"
chmod 600 "${OUT}/server.key"
chmod 644 "${OUT}/server.crt" "${OUT}/ca.crt"

echo "Wrote TLS certs to ${OUT}"
echo "Stack requires these certs; mosquitto-stack-entry.sh exits 1 if they are missing."