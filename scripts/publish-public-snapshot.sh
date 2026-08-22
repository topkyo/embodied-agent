#!/usr/bin/env bash
# Build a sanitized tree and push it to the public display snapshot.
# Run from the private repo root. Does not modify the private worktree.
#
#   bash scripts/publish-public-snapshot.sh
#   bash scripts/publish-public-snapshot.sh --replace-history
#
# --replace-history force-pushes a single orphan commit to public main so
# previously published instance files are not reachable from the default branch.
# Only use that on the display repo, never on embodied-agent-internal.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PUBLIC_DIR="${PUBLIC_DIR:-/tmp/ea-public-refresh}"
PUBLIC_REMOTE="${PUBLIC_REMOTE:-git@github.com:topkyo/embodied-agent.git}"
CLOSE_PR_TMP="$(mktemp)"
REPLACE_HISTORY=0

for arg in "$@"; do
  case "$arg" in
    --replace-history) REPLACE_HISTORY=1 ;;
    *)
      echo "publish-public-snapshot: unknown argument: $arg" >&2
      exit 1
      ;;
  esac
done

cd "$ROOT"
if [[ ! -f .github/workflows/deploy-vps.yml ]]; then
  echo "publish-public-snapshot: run from the private repo (deploy-vps.yml missing)" >&2
  exit 1
fi

if [[ -d "$PUBLIC_DIR/.git" ]]; then
  git -C "$PUBLIC_DIR" fetch origin
  git -C "$PUBLIC_DIR" checkout main
  git -C "$PUBLIC_DIR" reset --hard origin/main
else
  rm -rf "$PUBLIC_DIR"
  git clone "$PUBLIC_REMOTE" "$PUBLIC_DIR"
fi

if [[ -f "$PUBLIC_DIR/.github/workflows/display-only-close-pr.yml" ]]; then
  cp "$PUBLIC_DIR/.github/workflows/display-only-close-pr.yml" "$CLOSE_PR_TMP"
else
  echo "publish-public-snapshot: existing public tree missing display-only-close-pr.yml" >&2
  exit 1
fi

rsync -a --delete \
  --exclude '.git/' \
  --exclude 'docs/plans/' \
  --exclude 'docs/pilot/' \
  --exclude 'docs/strategy/' \
  --exclude 'docs/audits/' \
  --exclude 'docs/analysis/' \
  --exclude 'docs/archive/plans/' \
  --exclude 'docs/archive/releases/' \
  --exclude 'docs/archive/web-ux-vision-2026-07/' \
  --exclude 'docs/archive/web-ux-vision-2026-07-dark/' \
  --exclude '.github/workflows/deploy-vps.yml' \
  --exclude '.github/dependabot.yml' \
  --exclude 'deploy/vps/' \
  --exclude '.agentstack/' \
  --exclude 'node_modules/' \
  --exclude 'infra/mosquitto/certs/' \
  --exclude '.worktrees/' \
  "$ROOT/" "$PUBLIC_DIR/"

# rsync --exclude does not delete dest files that are excluded. Remove them explicitly.
rm -rf \
  "$PUBLIC_DIR/docs/plans" \
  "$PUBLIC_DIR/docs/pilot" \
  "$PUBLIC_DIR/docs/strategy" \
  "$PUBLIC_DIR/docs/audits" \
  "$PUBLIC_DIR/docs/analysis" \
  "$PUBLIC_DIR/docs/archive/plans" \
  "$PUBLIC_DIR/docs/archive/releases" \
  "$PUBLIC_DIR/docs/archive/web-ux-vision-2026-07" \
  "$PUBLIC_DIR/docs/archive/web-ux-vision-2026-07-dark" \
  "$PUBLIC_DIR/.github/workflows/deploy-vps.yml" \
  "$PUBLIC_DIR/.github/dependabot.yml" \
  "$PUBLIC_DIR/deploy/vps" \
  "$PUBLIC_DIR/.agentstack" \
  "$PUBLIC_DIR/node_modules" \
  "$PUBLIC_DIR/infra/mosquitto/certs" \
  "$PUBLIC_DIR/.worktrees"

mkdir -p "$PUBLIC_DIR/.github/workflows"
cp "$CLOSE_PR_TMP" "$PUBLIC_DIR/.github/workflows/display-only-close-pr.yml"
rm -f "$CLOSE_PR_TMP"

npx tsx "$ROOT/scripts/sanitize-public-snapshot.ts" "$PUBLIC_DIR"

(
  cd "$PUBLIC_DIR"
  git add -A
  npx tsx scripts/check-public-snapshot.ts
  npx tsx scripts/check-doc-links.ts

  if [[ "$REPLACE_HISTORY" -eq 1 ]]; then
    git checkout --orphan snapshot-root
    git add -A
    git commit -m "$(cat <<'EOF'
chore: public display snapshot

Read-only sanitized tree. Production instance files and Vercel rewrites
are not included. History is intentionally not preserved.
EOF
)"
    git branch -M main
    git push --force-with-lease origin main
  else
    if git diff --cached --quiet; then
      echo "publish-public-snapshot: no snapshot changes"
      exit 0
    fi
    git commit -m "$(cat <<'EOF'
chore: 刷新只读展示快照

排除生产实例剧本与 Vercel 回源，并改掉指向已排除路径的链接。
EOF
)"
    git push origin HEAD
  fi
)

echo "publish-public-snapshot: pushed $PUBLIC_REMOTE"
