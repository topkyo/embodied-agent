#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

export AGENT_DATA_DIR="${AGENT_DATA_DIR:-scripts/fixtures/ci-robot-eval}"
if [ -z "${EVAL_EVIDENCE_SECRET:-}" ]; then
  echo "ERROR: EVAL_EVIDENCE_SECRET is required for signed robot sim matrix evidence" >&2
  exit 1
fi

echo "== robot intent matrix strict: core =="
SIM_MATRIX_SLICE=core \
  SIM_MATRIX_MIN_PASS_RATE="${SIM_MATRIX_MIN_PASS_RATE:-1}" \
  npm run sim:matrix

echo "== robot intent matrix strict: wechat =="
SIM_MATRIX_SLICE=wechat \
  SIM_MATRIX_WECHAT_MIN_PASS_RATE="${SIM_MATRIX_WECHAT_MIN_PASS_RATE:-1}" \
  npm run sim:matrix

echo "== robot intent matrix strict: negative =="
SIM_MATRIX_SLICE=negative \
  SIM_MATRIX_NEGATIVE_MIN_PASS_RATE="${SIM_MATRIX_NEGATIVE_MIN_PASS_RATE:-1}" \
  npm run sim:matrix

echo "== robot sim matrix evidence verifier =="
npm run sim:matrix:evidence

echo "== robot execution matrix =="
npx tsx scripts/robot-execution-matrix.ts

echo "::ROBOT_MATRIX_PASSED::"
