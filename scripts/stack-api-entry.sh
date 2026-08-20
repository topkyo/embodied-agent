#!/usr/bin/env sh
set -eu
DATA="${AGENT_DATA_DIR:-/app/data}"
mkdir -p "$DATA"
if [ ! -f "$DATA/settings.json" ]; then
  echo "ERROR: missing $DATA/settings.json; provision settings explicitly before starting stack." >&2
  exit 1
fi
if [ ! -f "$DATA/device-registry.json" ]; then
  echo "ERROR: missing $DATA/device-registry.json; provision registry explicitly before starting stack." >&2
  exit 1
fi
sh "$(dirname "$0")/ensure-workspace-runtime-build.sh"
exec npm run start -w @embodied-agent/api
