# 狗云 VPS 单实例部署指南

本指南面向 **1C2G 入门级 VPS**（以狗云 `91.216.169.29` 为例），部署具身Agent平台。

---

## 1. 部署架构

```
用户浏览器
  │
  ├──→ Vercel: ea-web-9527.vercel.app (工作台)
  │    └── vercel.json rewrites /admin/* /auth/* 等 → Tunnel URL
  │
  ├──→ Vercel: ea-site-9527.vercel.app (营销站)
  │    └── vercel.json rewrites /admin/* 等 → Tunnel URL
  │
  ▼
Cloudflare Quick Tunnel (HTTPS, 出站)
  │  trycloudflare.com 临时域名
  ▼
VPS localhost:80 → Caddy (bind 127.0.0.1)
  ├── /admin/* /auth/* /health 等 → 127.0.0.1:3001 (API, systemd)
  └── / → apps/web/dist 静态 SPA (fallback index.html)

MQTT 1883 → Mosquitto (systemd, 仅 127.0.0.1)
```

**设计要点**：

- **零成本**：Vercel Hobby + Cloudflare Quick Tunnel（免费）+ VPS（已有）。
- **本机部署**：API 和 Mosquitto 以 systemd 服务运行，无 Docker 开销，节省 ~200-300MB 内存。
- **无 Redis**：`STATE_BACKEND=file`，`COMMAND_STORE=file`，节省约 100 MB 内存。
- **前端分离**：工作台和营销站部署到 Vercel，通过 rewrites 代理 API 请求到 Tunnel。
- **Caddy 仅本地**：`bind 127.0.0.1`，不对外暴露，所有外部流量经 Cloudflare Tunnel。
- **单 deployment**：只启用一个 `active_domain`，符合项目架构约束。

**已知限制**：

- Cloudflare Quick Tunnel URL 不稳定（VPS/cloudflared 重启后变化），由 `tunnel-watch.sh` cron 自动更新 Vercel。
- 5 分钟检测间隔内可能有短暂空窗期。

---

## 2. 前置准备

### 2.1 VPS 环境

需要：

- Ubuntu 24.04 LTS
- Node.js 20（由 `setup-bare-metal.sh` 自动安装）
- Mosquitto（由 `setup-bare-metal.sh` 自动安装）
- Caddy（`apt install -y caddy`）
- cloudflared（`curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared && chmod +x /usr/local/bin/cloudflared`）

> 不再需要 Docker。

### 2.2 本地工具

需要：

- Vercel CLI（`npm i -g vercel`）
- SSH 访问 VPS

### 2.3 克隆源码到 VPS

```bash
ssh root@<VPS_IP>
mkdir -p /home/tim/project /home/tim/var /home/tim/scripts /home/tim/backups
cd /home/tim/project
git clone https://github.com/topkyo/embodied-agent.git EA
```

---

## 3. 配置环境变量

```bash
cd /home/tim/project/EA
cp deploy/vps/.env.vps.example .env.vps.local
# 编辑 .env.vps.local 填入真实值
```

必须设置的字段：

| 变量                 | 说明                                                    |
| -------------------- | ------------------------------------------------------- |
| `DEPLOYMENT_ID`      | 部署 ID，如 `dep-gh-pilot-001`                          |
| `ACTIVE_DOMAIN`      | `agriculture` / `robotics` / `industrial`               |
| `MQTT_API_PASSWORD`  | MQTT api 用户强密码                                     |
| `MQTT_NODE_PASSWORD` | MQTT node 用户强密码                                    |
| `ADMIN_TOKEN`        | 管理接口 token，≥ 32 随机字符                           |
| `SESSION_SECRET`     | web session 签名密钥，≥ 64 随机字符                     |
| `CORS_ORIGIN`        | 所有前端域名（逗号分隔），含 Vercel 子域名和 Tunnel URL |
| `LLM_API_KEY`        | 真实 LLM API key                                        |
| `WEB_INSTALL_CODE`   | 首次创建管理员账户用，如 `EA-INSTALL-<随机hex>`         |

可选但建议：

- `AGENT_SECRETS_KEY`：启用 settings 加密。
- `METRICS_SCRAPE_TOKEN`：生产 `/metrics` 端点推荐鉴权（64-char hex）。scrape 时用 `Authorization: Bearer …` 或 `x-metrics-token: …`。`METRICS_ALLOW_PUBLIC=1` 仅在网络隔离的 CI/dev 测试用；v0.10.0 VPS 部署已切 SCRAPE_TOKEN（main `05bee1e0` + VPS `1784102197` flip）。

> **重要**：`.env.vps.local` 必须加入 `.gitignore`，不要提交到 Git。

---

## 4. 准备运行数据

```bash
export DATA_DIR=/home/tim/var/embodied-agent-data
sudo mkdir -p "$DATA_DIR"
sudo cp deploy/vps/data-templates/settings.json "$DATA_DIR/"
sudo cp deploy/vps/data-templates/device-registry.json "$DATA_DIR/"
sudo cp deploy/vps/data-templates/users.json "$DATA_DIR/"
```

> **注意**：`users.json` 模板不包含 `email` / `password_hash` 字段。首次启动 API 后，需要通过 bootstrap 流程创建管理员账户（见 §9）。

---

## 5. 一键初始化（Mosquitto + Node.js + 依赖）

```bash
cd /home/tim/project/EA
sudo bash deploy/vps/setup-bare-metal.sh
```

脚本自动完成：安装 Node.js 20、Mosquitto、编译依赖、克隆仓库、`npm ci`、构建 workspace runtime、生成 Mosquitto 密码文件和配置、安装 systemd service。

> 脚本会在 `.env.vps.local` 存在时自动读取 MQTT 密码生成 Mosquitto 配置。请先完成 §3 的环境变量配置。
```

---

## 6. 配置 Caddy

```bash
sudo cp deploy/vps/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Caddy 绑定 `127.0.0.1:80`，不对外暴露。所有外部流量经 Cloudflare Tunnel 代理。

---

## 7. 启动 Cloudflare Quick Tunnel

```bash
# 创建 systemd 服务
sudo bash -c 'cat > /etc/systemd/system/cloudflared-tunnel.service << EOF
[Unit]
Description=Cloudflare Quick Tunnel
After=network.target

[Service]
ExecStart=/usr/local/bin/cloudflared tunnel --url http://127.0.0.1:80
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF'

sudo systemctl daemon-reload
sudo systemctl enable --now cloudflared-tunnel

# 获取 Tunnel URL
sudo journalctl -u cloudflared-tunnel --no-pager | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | tail -1
```

记录 Tunnel URL，后续需要更新到 `vercel.json` 和 `CORS_ORIGIN`。

---

## 8. 启动 API + Mosquitto（systemd）

```bash
sudo systemctl start mosquitto
sudo systemctl start ea-api
```

API 首次启动需要 1-2 分钟（`npm ci` + workspace build + 服务启动）。后续重启秒级完成。

查看状态：

```bash
sudo systemctl status ea-api
sudo journalctl -u ea-api --tail 20 -f
```

---

## 9. 创建管理员账户（Bootstrap）

API 启动后，通过 bootstrap 流程创建第一个管理员账户：

```bash
# 检查 bootstrap 是否可用
curl -s https://<tunnel-url>/auth/bootstrap-status
# 应返回 {"available":true,"redeemed":false}

# 创建管理员
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"install_code":"<WEB_INSTALL_CODE>","email":"admin@example.com","password":"YourPassword","display_name":"管理员"}' \
  https://<tunnel-url>/auth/bootstrap
```

bootstrap 成功后，`WEB_INSTALL_CODE` 即被兑换，不可重复使用。

创建后续用户（需要管理员 session）：

```bash
# 登录获取 cookie
COOKIE=$(curl -s -X POST -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"YourPassword"}' \
  https://<tunnel-url>/auth/email -c - | grep ea_session | awk '{print $NF}')

# 创建 user 权限账户
curl -s -X POST -H "Content-Type: application/json" \
  -H "Cookie: ea_session=$COOKIE" \
  -d '{"email":"user@example.com","password":"UserPassword","display_name":"普通用户","role":"user"}' \
  https://<tunnel-url>/auth/account/create
```

---

## 10. 部署前端到 Vercel

> **后续升级不是 push 自动上线。** 首次 link 完成后，日常 prod 发布走 §13.1–13.2（手动 CLI / Dashboard）。仓内不接 Vercel GitHub auto-deploy。

### 10.1 创建 Vercel 项目

```bash
# 在本地项目目录
cd apps/web && npx vercel link  # 关联到 Vercel 项目
npx vercel deploy --prod --yes  # 首次部署（与日常升级同一命令）

cd apps/site && npx vercel link
npx vercel deploy --prod --yes
```

### 10.2 添加生产域名

Vercel Hobby 计划不能用自定义域名，但可以使用 Vercel 子域名。用 `vercel domains add` 添加为生产域名（不要用 `vercel alias set`，那创建的是预览别名）：

```bash
npx vercel domains add ea-web-9527.vercel.app
npx vercel domains add ea-site-9527.vercel.app
```

### 10.3 设置 Vercel 环境变量

在 Vercel Dashboard 或 CLI 中设置：

| 变量                       | 项目 | 值                                |
| -------------------------- | ---- | --------------------------------- |
| `VITE_DEMO_API_GREENHOUSE` | site | `https://<tunnel-url>`            |
| `VITE_DEMO_API_ROBOT`      | site | `https://<tunnel-url>`            |
| `VITE_DEMO_API_INDUSTRIAL` | site | `https://<tunnel-url>`            |
| `VITE_WEB_APP_URL`         | site | `https://ea-web-9527.vercel.app`  |
| `VITE_SITE_URL`            | web  | `https://ea-site-9527.vercel.app` |

### 10.4 更新 vercel.json 中的 Tunnel URL

`apps/web/vercel.json` 和 `apps/site/vercel.json` 中的 rewrites destination 需要指向当前 Tunnel URL。手动更新或运行：

```bash
deploy/vps/update-tunnel-url.sh
```

---

## 11. 配置自动化运维脚本

### 11.1 部署脚本到 VPS

```bash
sudo mkdir -p /home/tim/scripts
sudo cp deploy/vps/tunnel-watch.sh deploy/vps/health-watch.sh deploy/vps/alert.sh /home/tim/scripts/
sudo chmod +x /home/tim/scripts/*.sh
```

### 11.2 配置告警凭证

```bash
# Telegram Bot
echo -n "<bot_token>" | sudo tee /home/tim/scripts/.telegram-token
echo -n "<chat_id>" | sudo tee /home/tim/scripts/.telegram-chat-id

# Slack Webhook
echo -n "<webhook_url>" | sudo tee /home/tim/scripts/.slack-webhook

# Vercel Token（tunnel-watch.sh 用）
echo -n "<vercel_token>" | sudo tee /home/tim/scripts/.vercel-token

sudo chmod 600 /home/tim/scripts/.telegram-token /home/tim/scripts/.telegram-chat-id /home/tim/scripts/.slack-webhook /home/tim/scripts/.vercel-token
```

### 11.3 配置 Cron

```bash
sudo crontab -e
# 每 5 分钟检测 Tunnel URL 变化
*/5 * * * * /home/tim/scripts/tunnel-watch.sh >> /home/tim/scripts/tunnel-watch.log 2>&1
# 每 5 分钟本地健康检查
*/5 * * * * /home/tim/scripts/health-watch.sh >> /home/tim/scripts/health-watch.log 2>&1
```

### 11.4 配置本地 Off-site 备份

在本地机器配置 crontab：

```bash
crontab -e
# 每天 04:00 从 VPS 拉取数据备份
0 4 * * * /Users/ht/github/embodied-agent/deploy/vps/backup-pull.sh
```

---

## 12. 验证

```bash
# API 健康检查（通过 Tunnel）
curl -s https://<tunnel-url>/health
# 应返回 {"ok":true}

# 通过 Vercel 验证
curl -s https://ea-web-9527.vercel.app/health
curl -s https://ea-site-9527.vercel.app/health

# 登录验证
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"YourPassword"}' \
  https://ea-web-9527.vercel.app/auth/email
# 应返回 user_id 和 role

# MQTT 连接测试
mosquitto_sub -h 127.0.0.1 -u api -P '<MQTT_API_PASSWORD>' -t 'deployments/dep-gh-pilot-001/nodes/+/events' -v
```

---

## 13. 日常运维

### 查看日志

```bash
sudo journalctl -u ea-api --tail 50 -f
sudo journalctl -u caddy -f
sudo journalctl -u cloudflared-tunnel -f
```

### 13.1 部署策略（A：手动 + 按批次/版本）

**结论：生产不自动部署。** push / merge 到 `main` **只跑 CI**，不上线。VPS 与 Vercel 均需人工触发。

| 面 | 触发方式 | 是否 push 自动 | 说明 |
| -- | -------- | -------------- | ---- |
| CI（lint/test/build/e2e） | push / PR | 是 | 门禁，不是上线 |
| VPS API + 本机 web dist | GH Actions `Deploy to VPS`（`workflow_dispatch`）或 tg-bot `/deploy` | **否** | 见 `.github/workflows/deploy-vps.yml`，仅 `on: workflow_dispatch` |
| Vercel `ea-web` / `ea-site` | 本地 `npx vercel deploy --prod --yes`（或 Dashboard Redeploy） | **否** | 仓内无 `deploy-vercel` workflow；GitHub 未接 Vercel webhook；root `vercel.json` 有 `git.deploymentEnabled: false`（root 项目） |

**何时部署（按批次，不是每个 commit）**

- `release:` / `docs(release):` / tag `vX.Y.Z`
- 明确 `hotfix:`（鉴权、公网可见 bug、生产 env 安全 flip）
- 公网验收前（营销站/工作台 UI、i18n、跨站链接）
- **不要**每个 docs chore / 小注释 / 中间态 commit 都上线

**为什么不 auto-every-push**

- VPS 每次 deploy ≈ `npm ci` + workspace build + rsync，1C2G 带宽与 CPU 贵，一天多 commit 会反复烧流量
- 中间态上线风险高；本仓节奏是「攒一批再上」
- 与 `deploy-vps.yml` 的 `rebuild_web` / `restart_api` 可选项一致：需要人手控粒度

> 坑：`main` 已含修复但公网仍旧 → **多半是忘了手动 deploy**，不是代码没合入。见 [`TROUBLESHOOTING.zh.md`](TROUBLESHOOTING.zh.md) §5.4。

### 13.2 上线清单（一次完整生产发布）

前置：目标 commit 已在 `origin/main`，且 CI 绿（至少 deterministic；有 UI 改动时 e2e 也绿）。

**1) VPS（API / MQTT / 本机 dist）**

GitHub → Actions → **Deploy to VPS** → Run workflow：

| input | 默认 | 何时改 |
| ----- | ---- | ------ |
| `rebuild_web` | true | 仅改 API/env、不换前端静态时可为 false |
| `restart_api` | true | 仅同步 dist、不改 API 时可为 false |

workflow 会：SSH → `git pull` → `npm ci` → workspace build → 可选 rsync `apps/web/dist` → `systemctl restart ea-api`（+ 双棚 simulator）→ loopback `/health`。

备选：tg-bot `/deploy`，或 SSH 手搓（仅应急）：

```bash
ssh tim@<VPS_HOST>
cd /home/tim/project/EA
git checkout -- apps/web/vercel.json apps/site/vercel.json 2>/dev/null || true
git pull
npm ci --include=dev
bash scripts/ensure-workspace-runtime-build.sh
# 若需本机 SPA：在 runner/本地 build 后 rsync apps/web/dist/
sudo systemctl restart ea-api
# 双棚若 enable：sudo systemctl restart ea-simulator@node-sim-gh-001 ea-simulator@node-sim-gh-002
curl -sf http://127.0.0.1:3001/health
```

**2) Vercel（公网工作台 + 营销站）**

在**已登录**本机（`npx vercel whoami` 有账号），于仓库根目录：

```bash
cd apps/site && npx vercel deploy --prod --yes
cd ../web  && npx vercel deploy --prod --yes
```

期望 alias：`https://ea-site-9527.vercel.app`、`https://ea-web-9527.vercel.app`。

**3) 冒烟（部署后必跑）**

```bash
curl -sf https://ea-web-9527.vercel.app/health
curl -sf -o /dev/null -w '%{http_code}\n' https://ea-site-9527.vercel.app/
# 若本次改了前端逻辑，核对 bundle 新鲜度（Last-Modified 应为刚部署时刻）:
# curl -sI "https://ea-web-9527.vercel.app$(curl -sf https://ea-web-9527.vercel.app/ | grep -oE '/assets/index-[^\"]+\.js' | head -1)" | grep -i last-modified
```

有公网 UI 改动时再做一次无痕/incognito 走查（跨站 `?lang=`、登录、运维台入口）。

**4) 记一笔（可选）**

- CHANGELOG Unreleased 或 release notes 加 `Deployed on YYYY-MM-DD`（VPS + Vercel）
- 安全/env 变更同步 [`TROUBLESHOOTING.zh.md`](TROUBLESHOOTING.zh.md) §9 运维惯例表

### 13.3 Tunnel URL 变化

VPS 或 cloudflared 重启后 Tunnel URL 会变。`tunnel-watch.sh` 会自动检测并更新 Vercel，也可手动运行：

```bash
deploy/vps/update-tunnel-url.sh
```

---

## 14. 安全清单

- [ ] `ADMIN_TOKEN` 不是 `dev-admin`，长度 ≥ 32 随机字符
- [ ] `SESSION_SECRET` 已设置，长度 ≥ 64 随机字符
- [ ] `AGENT_SECRETS_KEY` 已启用
- [ ] MQTT 密码高强度，api / node 用户密码不同
- [ ] `.env.vps.local` 未提交到 Git
- [ ] Caddy `bind 127.0.0.1`，不对外暴露
- [ ] UFW 只开放 22/443（443 给 sing-box，不是 Caddy）；1883 不得放行
- [ ] `CORS_ORIGIN` 精确匹配域名，无通配符
- [ ] SSH 仅 key 登录
- [ ] 凭证文件（`.vercel-token` 等）权限 600

---

## 15. 故障排查

完整按症状→根因→修复的运维 runbook 见 [`deploy/vps/TROUBLESHOOTING.zh.md`](TROUBLESHOOTING.zh.md)（含 30s 健康快照、BLOCKED · Sim Matrix evidence 修复、双棚 simulator systemd 模板实例、settings.json Docker 迁移遗留、systemd `EnvironmentFile=` 优先级坑、`EVAL_EVIDENCE_SECRET` 续签、git pull 与 vercel.json 冲突等）。下面只列最快命中的几条。

### API 启动失败：missing settings.json

确保 `AGENT_DATA_DIR` 指向的目录下有 `settings.json` 和 `device-registry.json`。检查 `.env.vps.local` 中 `AGENT_DATA_DIR` 是否设置正确。

### bootstrap 不可用（available: false）

1. 检查 `.env.vps.local` 中 `WEB_INSTALL_CODE` 是否设置
2. 用 `sudo systemctl restart ea-api` 重启服务
3. 验证：`sudo systemctl show ea-api --property=Environment | grep WEB_INSTALL`

### 邮箱登录失败（invalid_credentials）

`users.json` 模板不包含 `email` / `password_hash`。必须通过 bootstrap 流程创建管理员（§9），再由管理员创建其他用户。

### 修改 `.env.vps.local` 后环境变量不生效

`systemctl restart` 会重新读取 `EnvironmentFile`。执行 `sudo systemctl restart ea-api`。

### Vercel SPA 路由 404

`vercel.json` 必须包含 catch-all rewrite：`{ "source": "/:path*", "destination": "/index.html" }`。

### Vercel API 响应被缓存

`vercel.json` 的 `headers` 段必须包含 `Cache-Control: no-store` 和 `x-vercel-enable-rewrite-caching: 0`。

### Vercel alias 返回 302 SSO 重定向

用 `vercel domains add` 添加生产域名，不要用 `vercel alias set`（那创建的是预览别名）。

### Caddy 返回 index.html 而非 API 响应

Caddy `try_files` 会拦截所有路径。必须用 `handle` 块分离 API 路由和静态文件 fallback。

### git dubious ownership

VPS 上 git 仓库 owner 与当前用户不一致时：

```bash
sudo chown -R <user>:<user> /home/tim/project/EA/
git config --global --add safe.directory /home/tim/project/EA
```

### 从 Docker 迁移到本机部署

```bash
# 1. 停止 Docker 容器
sudo docker compose -p embodied-agent --project-directory /home/tim/project/EA \
  -f deploy/vps/docker-compose.vps.yml down 2>/dev/null || true

# 2. 运行本机初始化脚本
cd /home/tim/project/EA
sudo bash deploy/vps/setup-bare-metal.sh

# 3. 启动服务
sudo systemctl start mosquitto
sudo systemctl start ea-api

# 4. 验证通过后，可选卸载 Docker
sudo systemctl disable --now docker
sudo apt-get remove -y docker-ce docker-ce-cli containerd.io
```
