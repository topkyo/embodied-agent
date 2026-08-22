#!/usr/bin/env bash
# PR subset of verify:strict — symmetric negative-matrix coverage for non-agriculture LIVE packs.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -z "${LLM_API_KEY:-}" ]; then
  echo "ERROR: verify:pr-strict requires LLM_API_KEY." >&2
  exit 1
fi
if [ -z "${EVAL_EVIDENCE_SECRET:-}" ]; then
  echo "ERROR: verify:pr-strict requires EVAL_EVIDENCE_SECRET." >&2
  exit 1
fi

echo "== PR strict subset: industrial negative matrix (100%) =="
AGENT_DATA_DIR=scripts/fixtures/ci-industrial-eval \
  SIM_MATRIX_SLICE=negative \
  SIM_MATRIX_NEGATIVE_MIN_PASS_RATE=1 \
  npm run sim:matrix

echo "== PR strict subset: robotics negative matrix (100%) =="
AGENT_DATA_DIR=scripts/fixtures/ci-robot-eval \
  SIM_MATRIX_SLICE=negative \
  SIM_MATRIX_NEGATIVE_MIN_PASS_RATE=1 \
  npm run sim:matrix

echo "::PR_STRICT_GATE_PASSED::"