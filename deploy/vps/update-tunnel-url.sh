#!/usr/bin/env bash
# 更新 Vercel 项目的 CDN 路由规则，指向新的 Cloudflare Tunnel URL。
# 用法：deploy/vps/update-tunnel-url.sh
#
# 前置：
#   1. 本机已安装 Vercel CLI 并登录（npx vercel whoami 能返回用户名）
#   2. VPS SSH 可达
#
# 场景：VPS 重启或 cloudflared 重启后，trycloudflare URL 变化，
#       运行此脚本秒级更新 Vercel 路由，无需重新部署。

set -euo pipefail

VPS_HOST="goyun"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

echo "=== 1. 从 VPS 获取当前 Tunnel URL ==="
TUNNEL_URL=$(ssh "$VPS_HOST" \
  'sudo journalctl -u cloudflared-tunnel --no-pager 2>/dev/null | grep -o "https://[a-z0-9-]*\.trycloudflare\.com" | tail -1')

if [ -z "$TUNNEL_URL" ]; then
  echo "ERROR: 无法获取 Tunnel URL，检查 VPS 上 cloudflared-tunnel 服务状态"
  exit 1
fi

echo "当前 Tunnel URL: $TUNNEL_URL"

# 检查 URL 是否与 vercel.json 中的一致
CURRENT_WEB_URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$REPO_ROOT/apps/web/vercel.json" 2>/dev/null | head -1 || echo "")
CURRENT_SITE_URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$REPO_ROOT/apps/site/vercel.json" 2>/dev/null | head -1 || echo "")

if [ "$TUNNEL_URL" = "$CURRENT_WEB_URL" ] && [ "$TUNNEL_URL" = "$CURRENT_SITE_URL" ]; then
  echo "vercel.json 中的 URL 已是最新，无需更新"
  exit 0
fi

echo ""
echo "=== 2. 更新 vercel.json 文件 ==="
for APP in web site; do
  FILE="$REPO_ROOT/apps/$APP/vercel.json"
  if [ -f "$FILE" ]; then
    sed -i.bak "s|https://[a-z0-9-]*\.trycloudflare\.com|$TUNNEL_URL|g" "$FILE"
    echo "已更新 apps/$APP/vercel.json"
  fi
done

# vercel 55+: --yes 需显式指定 team（VERCEL_ORG_ID 或 --scope）
VERCEL_SCOPE_ARGS=""
if [ -n "${VERCEL_ORG_ID:-}" ]; then
  VERCEL_SCOPE_ARGS="--scope $VERCEL_ORG_ID"
fi

echo ""
echo "=== 3. 重新部署 Vercel（CDN 路由秒级生效） ==="
echo "部署 apps/web..."
cd "$REPO_ROOT/apps/web" && eval npx vercel --prod --yes $VERCEL_SCOPE_ARGS 2>&1 | tail -3

echo ""
echo "部署 apps/site..."
cd "$REPO_ROOT/apps/site" && eval npx vercel --prod --yes $VERCEL_SCOPE_ARGS 2>&1 | tail -3

echo ""
echo "=== 4. 验证 ==="
echo -n "web /health:  "
curl -sf --max-time 10 "$TUNNEL_URL/health" && echo "" || echo "FAILED"
WEB_URL=$(cd "$REPO_ROOT/apps/web" && eval npx vercel ls --prod $VERCEL_SCOPE_ARGS 2>/dev/null | grep "vercel.app" | head -1 | awk '{print $2}')
echo -n "web Vercel /health:  "
curl -sf --max-time 10 "https://ea-web-9527.vercel.app/health" && echo "" || echo "FAILED"
echo -n "site Vercel /health: "
curl -sf --max-time 10 "https://ea-site-9527.vercel.app/health" && echo "" || echo "FAILED"

echo ""
echo "完成。Tunnel URL 已更新为 $TUNNEL_URL"
