#!/usr/bin/env sh
set -eu

SCENE="${DEMO_SCENE:?Set DEMO_SCENE to greenhouse|robot|industrial}"
DATA="${AGENT_DATA_DIR:-/app/data}"

if [ ! -d /app/node_modules ]; then
  npm ci
fi

mkdir -p "$DATA"
node /app/scripts/demo-provision-profile.mjs "$SCENE" "$DATA"

if [ ! -f "$DATA/device-registry.json" ]; then
  echo "ERROR: demo provision failed for $SCENE ($DATA)" >&2
  exit 1
fi

sh /app/scripts/ensure-workspace-runtime-build.sh
exec npm run start -w @embodied-agent/api