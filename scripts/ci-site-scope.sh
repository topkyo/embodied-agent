#!/usr/bin/env bash
# 判定当前 diff 是否仅为营销站/验收脚本范围。
# true → e2e 可只跑 site project；llm-gates 在 main push 上可跳过（PR 已一律跳过 llm-gates）。
# 用法: scripts/ci-site-scope.sh <base-ref>
# 输出: true | false（stdout）；详情 stderr。
#
# 故意不把 package.json / .github/workflows/ci.yml 算进 site-scope：
# 改 monorepo 脚本或 CI 时必须仍跑 web smoke + critical dogfood，避免门禁假绿。
set -euo pipefail
cd "$(dirname "$0")/.."

BASE="${1:-}"
if [ -z "$BASE" ]; then
  echo "usage: ci-site-scope.sh <base-ref>" >&2
  exit 2
fi
if [ "$BASE" = "0000000000000000000000000000000000000000" ]; then
  echo "false"
  exit 0
fi

is_site_scope_file() {
  case "$1" in
    apps/site/*) return 0 ;;
    scripts/acceptance-stack.sh) return 0 ;;
    scripts/demo-stack-local.sh) return 0 ;;
    scripts/demo-provision-profile.mjs) return 0 ;;
    scripts/ci-site-scope.sh) return 0 ;;
    *) return 1 ;;
  esac
}

mapfile -t FILES < <(git diff --name-only --diff-filter=ACMRT "${BASE}"...HEAD)

if [ "${#FILES[@]}" -eq 0 ]; then
  echo "[ci-site-scope] no changed files" >&2
  echo "false"
  exit 0
fi

for f in "${FILES[@]}"; do
  if ! is_site_scope_file "$f"; then
    echo "[ci-site-scope] out of scope: $f" >&2
    echo "false"
    exit 0
  fi
done

echo "[ci-site-scope] site scope (${#FILES[@]} file(s))" >&2
echo "true"
