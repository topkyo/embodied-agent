#!/usr/bin/env bash
# Skip redundant ensure when CI or caller already built workspace packages.
set -euo pipefail
if [ "${ENSURE_WORKSPACE_BUILD_DONE:-0}" = "1" ]; then
  echo "skip ensure-workspace-runtime-build (ENSURE_WORKSPACE_BUILD_DONE=1)"
  exit 0
fi
exec "$(dirname "$0")/ensure-workspace-runtime-build.sh" "$@"