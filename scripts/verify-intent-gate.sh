#!/usr/bin/env bash
# Deterministic intent checks + sim:matrix core/wechat gates; domain flywheel gate runs unless skipped.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== intent prompt + schema contract + matrix dataset (vitest) =="
npm run test -w @embodied-agent/agent -- src/intent/prompt/build-intent-prompt.test.ts src/intent/schema-contract.test.ts
npx vitest run scripts/lib/intent-eval-common.test.ts

if [ -z "${AGENT_DATA_DIR:-}" ]; then
  echo "ERROR: AGENT_DATA_DIR must be set explicitly for intent gate (e.g. scripts/fixtures/ci-eval)." >&2
  exit 1
fi
if [ -z "${LLM_API_KEY:-}" ] && [ ! -f "$AGENT_DATA_DIR/settings.json" ]; then
  echo "ERROR: no LLM key (LLM_API_KEY or AGENT_DATA_DIR/settings.json); sim:matrix gate is required" >&2
  exit 1
fi
if [ -z "${EVAL_EVIDENCE_SECRET:-}" ]; then
  echo "ERROR: EVAL_EVIDENCE_SECRET is required for signed sim matrix evidence" >&2
  exit 1
fi

echo "== workspace runtime build (core + Domain Pack dist) =="
bash "$(dirname "$0")/ensure-workspace-runtime-build.sh"

echo "== sim:matrix core (>= 90% gate) =="
SIM_MATRIX_SLICE=core npm run sim:matrix

echo "== sim:matrix wechat (100% gate) =="
SIM_MATRIX_SLICE=wechat npm run sim:matrix

echo "== sim:matrix negative (100% gate) =="
SIM_MATRIX_SLICE=negative npm run sim:matrix

echo "== sim:matrix evidence verifier =="
npm run sim:matrix:evidence

if [ -f "$(dirname "$0")/verify-domain-flywheel-gate.sh" ]; then
  bash "$(dirname "$0")/verify-domain-flywheel-gate.sh"
fi
