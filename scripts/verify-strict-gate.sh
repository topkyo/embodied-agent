#!/usr/bin/env bash
# Strict software regression gate for all LIVE Domain Packs.
# Requires a real LLM key; does not prove real-field outcomes.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -z "${LLM_API_KEY:-}" ]; then
  echo "ERROR: verify:strict requires LLM_API_KEY; strict gate must not skip live LLM matrix." >&2
  exit 1
fi
if [ -z "${EVAL_EVIDENCE_SECRET:-}" ]; then
  echo "ERROR: verify:strict requires EVAL_EVIDENCE_SECRET for signed sim matrix evidence." >&2
  exit 1
fi

echo "== static + deterministic gates =="
npm run lint
npm test
npm run build

echo "== greenhouse sim:matrix core strict (>=95%) =="
AGENT_DATA_DIR=scripts/fixtures/ci-eval \
  SIM_MATRIX_SLICE=core \
  SIM_MATRIX_MIN_PASS_RATE=0.95 \
  npm run sim:matrix

echo "== greenhouse sim:matrix wechat strict (100%) =="
AGENT_DATA_DIR=scripts/fixtures/ci-eval \
  SIM_MATRIX_SLICE=wechat \
  SIM_MATRIX_WECHAT_MIN_PASS_RATE=1 \
  npm run sim:matrix

echo "== greenhouse sim:matrix negative strict (100%) =="
AGENT_DATA_DIR=scripts/fixtures/ci-eval \
  SIM_MATRIX_SLICE=negative \
  SIM_MATRIX_NEGATIVE_MIN_PASS_RATE=1 \
  npm run sim:matrix

echo "== greenhouse sim:matrix evidence verifier =="
AGENT_DATA_DIR=scripts/fixtures/ci-eval npm run sim:matrix:evidence

echo "== agriculture domain flywheel strict =="
AGENT_DATA_DIR=scripts/fixtures/ci-flywheel \
  DOMAIN_FLYWHEEL_REQUIRED=1 \
  npm run domain:flywheel

echo "== robot matrix strict =="
npm run robot:matrix

echo "== robotics domain flywheel strict =="
AGENT_DATA_DIR=scripts/fixtures/ci-robot-eval npm run domain:flywheel

echo "== industrial domain chat-verify strict =="
AGENT_DATA_DIR=scripts/fixtures/ci-industrial-eval npm run domain:chat-verify -- --pack industrial

echo "== industrial domain flywheel strict =="
AGENT_DATA_DIR=scripts/fixtures/ci-industrial-eval npm run domain:flywheel

echo "::STRICT_GATE_PASSED::"
