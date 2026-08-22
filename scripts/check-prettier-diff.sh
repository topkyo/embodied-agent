#!/usr/bin/env bash
# Prettier gate for changed files only (avoids historical formatting debt).
set -euo pipefail
cd "$(dirname "$0")/.."

# Base ref: PR base SHA, push-before SHA (github.event.before), or HEAD~1 for local.
BASE="${1:-}"
if [ -z "$BASE" ]; then
  echo "usage: check-prettier-diff.sh <base-ref>" >&2
  exit 2
fi
if [ "$BASE" = "0000000000000000000000000000000000000000" ]; then
  echo "[prettier-diff] initial push (no base); skipping"
  exit 0
fi

mapfile -t FILES < <(
  git diff --name-only --diff-filter=ACMRT "${BASE}"...HEAD \
    | grep -E '\.(ts|tsx|js|mjs|cjs|json|md|yml|yaml|css)$' || true
)

if [ "${#FILES[@]}" -eq 0 ]; then
  echo "[prettier-diff] no eligible changed files"
  exit 0
fi

echo "[prettier-diff] checking ${#FILES[@]} file(s)"
npx prettier --check "${FILES[@]}"