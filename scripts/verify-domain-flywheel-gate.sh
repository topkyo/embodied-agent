#!/usr/bin/env bash
# Domain flywheel regression gate — active Domain Pack 全自动闭环。
# 与 sim:matrix 并列；本地/CI 可用 SKIP_DOMAIN_FLYWHEEL=1 跳过。
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -n "${SKIP_DOMAIN_FLYWHEEL:-}" ]; then
  echo "SKIP_DOMAIN_FLYWHEEL=1 — domain flywheel gate skipped"
  exit 0
fi

if [ -z "${LLM_API_KEY:-}" ] && [ ! -f "${AGENT_DATA_DIR:-.agentstack/dev-runs/domain-flywheel/agriculture/data}/settings.json" ]; then
  if [ -n "${DOMAIN_FLYWHEEL_REQUIRED:-}" ]; then
    echo "ERROR: DOMAIN_FLYWHEEL_REQUIRED=1 but no LLM key is available." >&2
    exit 1
  fi
  echo "WARN: no LLM key (LLM_API_KEY or AGENT_DATA_DIR/settings.json) — skip domain flywheel gate"
  exit 0
fi

echo "== domain:flywheel fast (active Domain Pack 闭环) =="
npm run domain:flywheel
