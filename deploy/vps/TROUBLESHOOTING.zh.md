# VPS 部署运维 Troubleshooting Runbook

> **适用**：狗云 1C2G VPS（`goyun/91.216.169.29` 为例）及同构单实例生产环境。
> **不适用**：本地 dev profile（请走 `AGENTS.md` / `docs/operations/web-session.zh.md`）。
> **真源检查顺序**：本文档 → `deploy/vps/SERVICES.zh.md` → release notes → 源码。

本文档是 release notes 里"踩过的坑"的**长期可运行版**——releases / scripts 只列一次，本文按症状→根因→修复组织，便于复发时 30s 内定位。

---

## 0. 30s 健康快照

```bash
# 服务?
for s in ea-api ea-simulator@node-sim-gh-001 ea-simulator@node-sim-gh-002 mosquitto caddy cloudflared-tunnel; do
  printf "%-40s %s\n" "$s" "$(systemctl is-active $s)"
done

# API + readiness?
curl -sf http://127.0.0.1:3001/health || echo "API DOWN"
ADMIN=$(sudo -u tim grep -E '^ADMIN_TOKEN=' /home/tim/project/EA/.env.vps.local | cut -d= -f2-)
curl -sf -H "x-admin-token: $ADMIN" http://127.0.0.1:3001/admin/platform/readiness \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('ready:', d['ready']); [print('  FAIL', c['id'], c['detail'][:80]) for c in d.get('checks',[]) if not c['ok']]"

# VPS 资源?
free -m | awk 'NR==1||/Mem/'
df -h / | tail -1
```

**若 only readiness 有红色**：跳 §1。**若服务挂了**：跳 §3。**若节点 offline**：跳 §2。

---

## 1. /ops/platform 显示「需处理」

readiness 红项 3 类：Transport / MQTT 连接、Sim Matrix evidence、registry/nodes。

### 1.1 `mqtt` 检查失败（`BLOCKED · Transport`）

**症状**：readiness 检查 `mqtt`，`detail: connected=false`，但 `systemctl status mosquitto` 显示 active。

**根因**：API 连接 Mosquitto 失败。常见三种：

1. `settings.json` 的 `mqtt_url` 指向 Docker 主机名（迁移遗留）→ §3.3
2. `.env.vps.local` 的 `MQTT_USERNAME`/`MQTT_PASSWORD` 没设或与 Mosquitto `passwd` 不一致
3. Mosquitto systemd override 配置指向旧 `mosquitto.conf`

**排查**：

```bash
# 1. Mosquitto 真在跑吗?
systemctl is-active mosquitto
ss -tlnp | grep '127.0.0.1:1883'  # 应见 mosquitto 仅 loopback

# 2. Mosquitto 日志（系统包路径）
sudo tail -30 /var/log/mosquitto/mosquitto.log

# 3. 用 Mosquitto CLI 直连测试（绕过 API）
mosquitto_sub -h 127.0.0.1 -u api -P "$MQTT_API_PASSWORD" \
  -t 'deployments/+/nodes/+/heartbeat' -v -W 5
# 期望: Authentication successful 并持续输出
```

**修复**：

- Mosquitto 配置路径：VPS 本机是 `/home/tim/var/mosquitto-runtime/mosquitto.conf`（Docker 里是 `/mosquitto/config/mosquitto.conf`）。检查 systemd override：`/etc/systemd/system/mosquitto.service.d/override.conf`。
- 重置密码：`mosquitto_passwd -b /home/tim/var/mosquitto-runtime/passwd api "$MQTT_API_PASSWORD"`、`mosquitto_passwd -b /home/tim/var/mosquitto-runtime/passwd node "$MQTT_NODE_PASSWORD"`，再 `sudo systemctl restart mosquitto`。

### 1.2 `sim_matrix_core` / `sim_matrix_wechat` / `sim_matrix_negative` 全红

**症状**：readiness 检查三项 sim_matrix_*, detail 都是 `agriculture-X-sim-matrix-report.json 不存在于当前 deployment evidence 目录`。

**根因**：VPS 从未生成过这三份报告；或者 `EVAL_EVIDENCE_SECRET` 未配置 → 即使有报告也不会被 readiness 视为交付 evidence。

**关键约束**：签报告（`sim:matrix` 跑时）与验签（API 启动时）必须用**同一个** `EVAL_EVIDENCE_SECRET`，否则 `attested=false`。

**修复（首次配置）**：

```bash
cd /home/tim/project/EA
SECRET=$(openssl rand -hex 24)
sudo -u tim bash -c "echo 'EVAL_EVIDENCE_SECRET=$SECRET' >> .env.vps.local"
unset SECRET
sudo systemctl restart ea-api
sleep 5

# 跑三个 slice（顺序无影响，core 较大需 ~6 min）
set -a; source .env.vps.local; set +a
SIM_MATRIX_SLICE=core     nohup npx tsx scripts/simulate-user-matrix.ts > /tmp/sim-core.log 2>&1
SIM_MATRIX_SLICE=wechat   nohup npx tsx scripts/simulate-user-matrix.ts > /tmp/sim-wechat.log 2>&1
SIM_MATRIX_SLICE=negative nohup npx tsx scripts/simulate-user-matrix.ts > /tmp/sim-negative.log 2>&1
wait $(jobs -p)
```

**修复（续签）**：通常由 cron 周期续签。若 SLI `BLOCKED · Sim Matrix *` 突现，多半是 secret 被重置或报告超过 freshness 阈值。

```bash
# 检查 freshness 阈值（默认 7d）
grep -r 'FRESHNESS' /home/tim/project/EA/packages/runtime/src/readiness-sim-matrix.ts
```

**预防（cron）**：建议 0 3 * * * 重跑一轮，确保始终 fresh：

```cron
0 3 * * * cd /home/tim/project/EA && set -a; source .env.vps.local; set +a; \
  for s in core wechat negative; do \
    SIM_MATRIX_SLICE=$s npx tsx scripts/simulate-user-matrix.ts; \
  done >> /home/tim/scripts/sim-matrix-cron.log 2>&1
```

> LLM 调用量 = 128 行/次；core 6 min / wechat 15s / negative 15s。`LLM_API_KEY` 配额要够。

### 1.3 `registry` 失败

**症状**：`detail: 0 deployments` 或解析失败。

**根因**：`$AGENT_DATA_DIR/device-registry.json` 不存在、被破坏、或 `settings.json.deployment_id` 与 registry `deployment_id` 不一致。

**排查**：

```bash
sudo -u tim jq '.deployments[].deployment_id, .entities[].entity_id' \
  /home/tim/var/embodied-agent-data/device-registry.json
sudo jq -r '.deployment_id' /home/tim/var/embodied-agent-data/settings.json
# 两者 deployment_id 应一致
```

**修复**：从 `deploy/vps/data-templates/` 重新部署模板，或跑 `ensure:sim-dual` 重建：

```bash
cd /home/tim/project/EA && set -a; source .env.vps.local; set +a
sudo -u tim npx tsx scripts/ensure-sim-dual-nodes.ts
```

### 1.4 `nodes` 失败（`2/2 online` 应为 `2/2`，实际 < 2）

跳 §2。

---

## 2. 节点显示「设备绑定未就绪 / 当前离线」

### 2.1 gh-002 vent_motor 离线，gh-001 正常

**症状**：admin overview 中 `gh-002` 显示 `stale=true, reported_at=null`，但 `node-sim-gh-002` 在 registry 中 `status=active`。

**根因**：sm 单实例 simulator 只覆盖 gh-001；gh-002 缺独立 systemd 实例。也可叠加 §3.3（mqtt_url 错）。

**修复**：

```bash
# 检查实例是否启用 + 在跑
systemctl is-enabled ea-simulator@node-sim-gh-002
systemctl is-active  ea-simulator@node-sim-gh-002

# 启
sudo systemctl enable --now ea-simulator@node-sim-gh-002
journalctl -u ea-simulator@node-sim-gh-002 -n 20 --no-pager
# 期望日志最后几行: "节点 node-sim-gh-002 已 active" + "ATTACHED" + "已订阅"
```

如果启动但 token 验证失败（API 日志连发 `invalid or missing node_token`）→ §2.3。

### 2.2 双 instance 但都成了同一个 NODE_ID（systemd EnvironmentFile 优先级坑）

这是双 instance 部署里**最隐蔽**的坑：systemd `EnvironmentFile=` 优先级**高于** `Environment=`，env file 里的 `NODE_ID=...` 会覆盖模板变量 `Environment=NODE_ID=%i`，导致两个 @instance 的进程都拿到同一个 `NODE_ID`——双实例退化为单实例。

**症状**：
- `systemctl show ea-simulator@node-sim-gh-002 -p Environment` 输出 `NODE_ID=node-sim-gh-001`
- `journalctl -u ea-simulator@node-sim-gh-002 | grep 'node_id:'` 显示 `node-sim-gh-001`

**修复**：

```bash
# 1. 删 env file 里的 NODE_ID 行（如果有）
sudo -u tim sed -i '/^NODE_ID=/d' /home/tim/project/EA/.env.vps.local

# 2. 重启双实例
sudo systemctl restart ea-simulator@node-sim-gh-001 ea-simulator@node-sim-gh-002

# 3. 验证 gh-002 实例真正的 NODE_ID
sudo systemctl show ea-simulator@node-sim-gh-002 -p Environment
# 期望: NODE_ID=node-sim-gh-002
```

**预防规则**：

- 使用 template service（`ea-simulator@.service`）时，**永远不要**在 `.env.vps.local` 设 `NODE_ID`。模板会从 `%i` 实例名注入，会被 env file 覆盖。
- 在 `deploy/vps/.env.vps.example` 中显式注释了此约束；若某天有人违反，两个 instance 不会报错（静默退化为单实例），gh-002 仍 offline。

### 2.3 telemetry 被 API 拒（`invalid or missing node_token`）

**症状**：
- ea-simulator 日志一切正常（token 已加载、MQTT connected、ATTACHED）
- ea-api 日志持续告警 `invalid or missing node_token {node_id, topic}`

**根因**：`AGENT_SECRETS_KEY` 加密了 `node-tokens.json`，API 端 `getNodeToken` 会 `maybeDecryptSecret`；但 `node-simulator.ts` 的 `loadPersistedNodeToken` 读的是磁盘原串（`eaenc:v1:...`），明文 token 未注入 `NODE_TOKEN` 环境变量。

**修复**：`sim-entry.sh` 在检测到 `AGENT_SECRETS_KEY` 时会自动调用 `scripts/print-node-token.ts` 解密 + 注入 `NODE_TOKEN`。如果还是拒：

```bash
# 1. 检查 token 是否真的解密出来了
sudo -u tim jq '.tokens[] | select(.node_id=="node-sim-gh-002") | .token[:20]' \
  /home/tim/var/embodied-agent-data/deployments/dep-gh-pilot-001/node-tokens.json
# 期望: "eaenc:v1:..." 加密串（API 端能解密）

# 2. 手动解密验证
sudo -u tim bash -c '
  cd /home/tim/project/EA
  set -a; source .env.vps.local; set +a
  npx tsx scripts/print-node-token.ts "$DEPLOYMENT_ID" "node-sim-gh-002"
'
# 期望输出: "node_xxx<base64url>" 明文（**不是** eaenc:v1:...）
```

如果第 2 步拿到的是 `eaenc:v1:` 字符串——`AGENT_SECRETS_KEY` 不匹配或 `issueNodeToken` 未生效。重发：

```bash
sudo -u tim bash -c '
  cd /home/tim/project/EA
  set -a; source .env.vps.local; set +a
  npx tsx scripts/ensure-sim-node-tokens.ts
'
```

### 2.4 已 active 节点缺 token

**症状**：simulator 启动时报 `缺少 node_token；运行 ensure-sim-node-tokens.ts 后重启模拟器`。

**修复**：跑上述 `ensure-sim-node-tokens.ts`，然后 `systemctl restart ea-simulator@*`。

---

## 3. API 启动失败 / systemd 异常

### 3.1 `Error: missing settings.json`

`vps-api-entry.sh --check` 显式失败，systemd 不会启动 API。

**排查 / 修复**：

```bash
ls -la /home/tim/var/embodied-agent-data/{settings,device-registry}.json
# 不存在: cp
[ -f settings.json ] || sudo -u tim cp deploy/vps/data-templates/settings.json /home/tim/var/embodied-agent-data/
[ -f device-registry.json ] || sudo -u tim cp deploy/vps/data-templates/device-registry.json /home/tim/var/embodied-agent-data/
# 权限: 必须 tim 可读
sudo chown -R tim:tim /home/tim/var/embodied-agent-data
```

### 3.2 `Error: 生产环境须设置 METRICS_SCRAPE_TOKEN 或显式 METRICS_ALLOW_PUBLIC=1`

**根因**：`NODE_ENV=production`（或 dev 默认外的其他值）下，readiness 端点在 `/metrics` 上强制鉴权。

**修复**：

- **推荐**：在 `.env.vps.local` 设 `METRICS_SCRAPE_TOKEN=<openssl rand -hex 32>`（main `05bee1e0` flip 起为生产默认；参考 §9 "运维惯例现状"），scrape 时用 `Authorization: Bearer …` 或 `x-metrics-token: …`。备份 `.env.vps.local.bak-<ts>` 在 flip 步骤自动生成，回退用 `cp $BAK .env.vps.local && sudo systemctl restart ea-api`。
- **临时 escape**：仅 dev / CI / 网络严格隔离下加 `METRICS_ALLOW_PUBLIC=1`；v0.10.0 VPS 已不再走该路径。

### 3.3 数据目录 / settings.json 迁移遗留

Docker 时代 `AGENT_DATA_DIR` 由容器以 root 写入，迁移到本机后必须：

```bash
sudo chown -R tim:tim /home/tim/var/embodied-agent-data
# 检查 mqtt_url 必须指向本机 broker
sudo -u tim jq -r '.mqtt_url' /home/tim/var/embodied-agent-data/settings.json
# 期望: "mqtt://127.0.0.1:1883"；若不对，编辑 settings.json 后 sudo systemctl restart ea-api
```

> `settings.json.mqtt_url` 优先级**高于** `MQTT_URL` 环境变量。规则详见 [`docs/operations/env-keys.zh.md` §MQTT](../../docs/operations/env-keys.zh.md)。

### 3.4 `tsx: not found` / `SyntaxError: Unexpected end of input` in cli.mjs

**根因**：

1. systemd 默认 `PATH` 不含 `/home/tim/project/EA/node_modules/.bin` —— 必须显式注入。
2. 部分 `npm install X`（不通过 `npm ci`）会损坏 node_modules 一致性（tsx cli.mjs 被截断、`js-sdsl` 缺 transitve）。

**已预防**：`ea-api.service` 已含 `Environment=PATH=/home/tim/project/EA/node_modules/.bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`。

**修复（已损坏）**：

```bash
cd /home/tim/project/EA
sudo systemctl stop ea-api
sudo -u tim rm -rf node_modules
sudo -u tim npm ci --include=dev
[ -e node_modules/.bin/tsx ] || sudo -u tim npm rebuild tsx
sudo -u tim bash scripts/ensure-workspace-runtime-build.sh
sudo systemctl start ea-api
curl -sf http://127.0.0.1:3001/health
```

### 3.5 simulator 启动但 token/encode 阶段未走完

`sim-entry.sh` 自动检测 `AGENT_SECRETS_KEY` 存在与否：

- 没设 → 直接 `npx tsx scripts/node-simulator.ts`
- 有设 → npx 调 `scripts/print-node-token.ts <deployment_id> <node_id>` 注入 `NODE_TOKEN`

如 §2.3 还失败，手动跑 ensure 重新签发清理旧 token：

```bash
sudo -u tim bash -c 'cd /home/tim/project/EA && set -a; source .env.vps.local; set +a; npx tsx scripts/ensure-sim-node-tokens.ts'
```

---

## 4. 部署/同步

### 4.1 git pull 失败：`Please commit your changes or stash them before you merge`

**症状**：`sudo -u tim git pull origin main` 报 uncommitted changes（通常是 `apps/web/vercel.json`、`apps/site/vercel.json`）。

**根因**：`tunnel-watch.sh` 会改 `vercel.json`，要么 commit 进去、要么 checkout 掉。如果上一次 tunn-url 变化时 cron 没赶上 commit，就会有脏状态。

**修复**：

```bash
cd /home/tim/project/EA
sudo -u tim git checkout -- .   # 丢弃本地修改（vercel.json 会被 tunnel-watch 在下次变化时重生成）
sudo -u tim git pull origin main
```

### 4.2 "已经不需要 push GitHub 吗？vps 直接拉？"

**不需要。** 当前唯一部署路径是：

```
本地  ──git push──>  GitHub  ──git pull──>  VPS (部署机)
```

VPS 是部署目标机，不是开发机。VPS 的 SSH key 只支持从 local → VPS 的入栈，反向（VPS → GitHub 来 push 本地的 patch）**不存在**。

两条部署触发路径都依赖 git pull：

- GitHub Actions `deploy-vps.yml`（手动 `workflow_dispatch`，含 `rebuild_web` / `restart_api` 选项）
- tg-bot `/deploy`（Telegram 异步命令，跑 git pull + npm ci + workspace build + systemctl restart）

**但 `tunnel-watch.sh` 是个例外**：它在 VPS 上自动 `sed` 改 `vercel.json` + 重新部署 Vercel + `git commit` + `git push origin main`——它把"vercel.json 同步给 GitHub"，这条真源回写是预期行为。

### 4.3 npm ci 应该在什么时候跑？

**不在 ExecStartPre 跑**：

- systemd `ExecStartPre` 默认 timeout 90s；1C2G 上完整 `npm ci` 约 5–7 分钟（含 better-sqlite3 native 编译）→ systemd 会 timeout → 服务循环重启。
- API 启动应该秒级，不该当依赖管理器。

**跑的正确时点**：

| 触发点 | 位置 |
|---|---|
| CI 部署 | `.github/workflows/deploy-vps.yml` 中 "Install deps + build workspace runtime on VPS" step |
| tg-bot 命令 | `tg-bot.py cmd_deploy()` 中间步骤 |
| 首次部署 | `deploy/vps/setup-bare-metal.sh` §6 |
| 手动维修 | `ssh goyun "cd /home/tim/project/EA && sudo -u tim npm ci --include=dev && [ -e node_modules/.bin/tsx ] || npm rebuild tsx && bash scripts/ensure-workspace-runtime-build.sh"` |

**重 run 也行**：`npm ci --include=dev` 是 idempotent 的；tsx bin 偶发缺失时再补 rebuild。

### 4.4 deploy 后 services 没有自动起

**症状**：`deploy-vps.yml` 跑完 workflow，但 portal 显示服务挂了。

**根因**：`systemctl enable` ≠ `systemctl start`。enable 只设置开机自启；启动要显式 start。

**修复**：

```bash
sudo systemctl is-enabled ea-api ea-simulator@node-sim-gh-001 ea-simulator@node-sim-gh-002 mosquitto
# 全 enabled? 若有 inactive: sudo systemctl start <name>
sudo systemctl start ea-api ea-simulator@node-sim-gh-001 ea-simulator@node-sim-gh-002 mosquitto
```

### 4.5 搬迁 home 目录：`/opt` → `/home/tim/`

历史部署在 `/opt/embodied-agent`。迁移到 `/home/tim/project/EA` 后需要：

```bash
# 1. 改 systemd unit 路径
sudo sed -i 's|/opt/embodied-agent|/home/tim/project/EA|g' /etc/systemd/system/{ea-api,ea-simulator@.service,cloudflared-tunnel}.service.d/*.conf 2>/dev/null
sudo systemctl daemon-reload

# 2. systemd Environment= 路径更新
sudo sed -i 's|/opt/embodied-agent|/home/tim/project/EA|g' /etc/systemd/system/ea-api.service /etc/systemd/system/ea-simulator@.service

# 3. tg-bot / tunnel-watch 中路径替换
grep -rl '/opt/embodied-agent' /home/tim/scripts | xargs sudo sed -i 's|/opt/embodied-agent|/home/tim/project/EA|g'
```

---

## 5. tunnel / vercel / 前端

### 5.1 tunnel URL 抓不到 / `tunnel-watch` 一直 ERROR

**症状**：`journalctl -u cloudflared-tunnel | grep trycloudflare` 输出空，`/home/tim/scripts/tunnel-watch.log` 持续报 `无法获取 Tunnel URL`。

**根因**：`journalctl` 日志会滚动（cloudflared 已运行 16h+），trycloudflare URL 已不在 journal 缓冲区。`tunnel-watch.sh` 只看 journal 的话**永远抓不到**。

**当前修复**：tg-bot 和 health-watch 都优先读 `/home/tim/scripts/.tunnel-url-state`（cloudflared 启动时或 tunnel-watch 检测到变化时写入），state 文件存在就不会抓 journal。

**手动恢复 / 重启 tunnel**：

```bash
sudo systemctl restart cloudflared-tunnel
sleep 5
NEW=$(sudo journalctl -u cloudflared-tunnel --since '30 seconds ago' | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | tail -1)
echo "$NEW" | sudo -u tim tee /home/tim/scripts/.tunnel-url-state

# 然后手动推进 vercel.json 中的 destination + 重新部署
echo "$NEW" | sudo -u tim tee /tmp/new-url
# 详情走 deploy/vps/update-tunnel-url.sh 或手工 sed 替换
```

### 5.2 Vercel 代理响应 stale

**排查**：curl 加 `-H 'Cache-Control: no-cache'` 看是否同样 stale。

**修复**：用 `vercel.json` 中的 `headers` 段强制 `Cache-Control: no-store` + `x-vercel-enable-rewrite-caching: 0`（已知 history fix，见 git log）。

### 5.3 knowledge 路径：`ea_session` 跨域 mismatch

`CORS_ORIGIN` 修改后**必须** `sudo systemctl restart ea-api`（API 启动时读 CORS，运行时改 env 不生效）。

### 5.4 main 已合入但公网仍是旧前端（Vercel bundle stale）

**症状**：本地 / CI 已有修复（例如跨 app `?lang=`），`origin/main` tip 也含该 commit，但 `https://ea-web-9527.vercel.app` / `ea-site-9527` 行为仍旧；`curl` 公网 JS 里 `grep '?lang='` 为 0；`Last-Modified` 停在几天前。

**根因（设计如此，不是 webhook 坏了）**：

1. **Vercel 不随 push 自动部署**。仓内无 `deploy-vercel` workflow；GitHub repo hooks 无 Vercel app；生产靠本地 `npx vercel deploy --prod --yes` 或 Dashboard 手动 Redeploy。
2. **VPS 也不随 push 自动部署**。`.github/workflows/deploy-vps.yml` 仅 `on: workflow_dispatch`（+ tg-bot `/deploy`）。push main 只跑 CI。
3. 空 commit / 再 push **不会**触发 Vercel rebuild；只增加 git 历史。

**修复**：按 [`README.zh.md`](README.zh.md) §13.2 补跑 Vercel 双侧 prod deploy，再核对 bundle `Last-Modified` 与关键字符串。若本次还动了 API，另跑 Deploy to VPS。

**防再踩**：上线节奏见 README §13.1（A：手动 + 批次/版本）；公网可见改动合并后**显式**走清单，不要假设「推了 main = 已上线」。

---

## 6. 兜底应急

### 6.1 全栈重启

```bash
sudo systemctl restart mosquitto
sudo systemctl restart ea-api
sudo systemctl restart ea-simulator@node-sim-gh-001 ea-simulator@node-sim-gh-002
sudo systemctl restart caddy cloudflared-tunnel

sleep 10
curl -sf http://127.0.0.1:3001/health || sudo journalctl -u ea-api -n 30 --no-pager
```

### 6.2 全部清掉重来（**慎用**，会丢 retry 状态）

```bash
sudo systemctl stop ea-api ea-simulator@node-sim-gh-001 ea-simulator@node-sim-gh-002 mosquitto
# 注意不要 rm data；保留 device-registry.json + users.json + settings.json + node-tokens.json + eval-reports/
cd /home/tim/project/EA
sudo -u tim rm -rf node_modules
sudo -u tim npm ci --include=dev
[ -e node_modules/.bin/tsx ] || sudo -u tim npm rebuild tsx
sudo -u tim bash scripts/ensure-workspace-runtime-build.sh
sudo systemctl start mosquitto ea-api ea-simulator@node-sim-gh-001 ea-simulator@node-sim-gh-002
```

### 6.3 验收清单（部署/修复后必跑）

```bash
# 三端
curl -sf https://ea-web-9527.vercel.app/health
curl -sf https://ea-site-9527.vercel.app     # HTTP 200
curl -sf "$(cat /home/tim/scripts/.tunnel-url-state 2>/dev/null || true)/health"

# Readiness
ADMIN=$(sudo -u tim grep -E '^ADMIN_TOKEN=' /home/tim/project/EA/.env.vps.local | cut -d= -f2-)
curl -sf -H "x-admin-token: $ADMIN" http://127.0.0.1:3001/admin/platform/readiness | jq '.ready'
# 期望: true

# 双棚在线
curl -sf -H "x-admin-token: $ADMIN" http://127.0.0.1:3001/admin/overview | jq '.entities[] | {entity_id, stale}'

# Sim Matrix evidence 在
ls /home/tim/var/embodied-agent-data/deployments/dep-gh-pilot-001/eval-reports/
# 期望: agriculture-{core,wechat,negative}-sim-matrix-report.json
```

---

## 7. 真源 checklist

| 关注点 | 真源 |
|---|---|
| systemd unit | `deploy/vps/ea-api.service`、`deploy/vps/ea-simulator@.service` |
| 入口 / token 解密 | `deploy/vps/vps-api-entry.sh`、`deploy/vps/sim-entry.sh`、`scripts/print-node-token.ts` |
| env file template | `deploy/vps/.env.vps.example`（`.env.vps.local` 在 `.gitignore`，不入仓） |
| 一次性 setup | `deploy/vps/setup-bare-metal.sh` |
| 部署 CI（手动） | `.github/workflows/deploy-vps.yml`（仅 `workflow_dispatch`） |
| 部署策略 A + 上线清单 | `deploy/vps/README.zh.md` §13.1–13.2 |
| 服务列表 + 资源 | `deploy/vps/SERVICES.zh.md` |
| 部署指南 | `deploy/vps/README.zh.md` |
| readiness 校验 | [`packages/runtime/src/readiness.ts`](../../packages/runtime/src/readiness.ts)、[`packages/runtime/src/readiness-sim-matrix.ts`](../../packages/runtime/src/readiness-sim-matrix.ts) |
| env 变量总表 | [`docs/operations/env-keys.zh.md`](../../docs/operations/env-keys.zh.md) |
| Web 鉴权调试 | [`docs/operations/web-session.zh.md`](../../docs/operations/web-session.zh.md) |
| 项目架构 | [`AGENTS.md`](../../AGENTS.md)、[`DESIGN.md`](../../DESIGN.md) |
| release notes | [`CHANGELOG.md`](../../CHANGELOG.md) |

---

## 8. 还应该补但本次未做（TODO）

- [ ] tunnel-watch 重写：直接从 cloudflared metrics endpoint 拿 URL，避免依赖 journal/状态文件。
- [ ] systemd unit 全部加 `Environment=PATH=...` 到 factory / linter，防止 NODE_ID / GREENHOUSE_ID / 等变量被 env file 偷覆。
- [ ] cron 自动续签 Sim Matrix reports + 自动推送 readiness 变更告警。
- [ ] 异常上报：Prometheus metrics 远端 → Grafana dashboard（依赖确保 `/metrics` 拉取通道独立、scrape token 在外部凭据仓落地）。

## 9. 运维惯例现状（2026-07-15 baseline）

便于核对当下默认与历史。当一项被改动时，本节同步刷新。

| 项 | 当前值 | 历史 | 自 |
| --- | --- | --- | --- |
| `/metrics` 端点鉴权 | `METRICS_SCRAPE_TOKEN=<64-char hex>` 必填（Bearer 或 x-metrics-token） | 2026-07-15 之前 `METRICS_ALLOW_PUBLIC=1` 公开 | flip at `.env.vps.local.bak-1784102197` → `05bee1e0` |
| `METRICS_ALLOW_PUBLIC` | 已注释保留（不删行；仅作 dev/CI escape） | 真源示例默认 =1（v0.10.0 之前） | `6427c2ef` |
| `/health` 端点 | 公开（不需 token） | 同样 | 沿用 |
| VPS systemd 服务 | `ea-api` + `ea-simulator@node-sim-gh-001/002` + `mosquitto` + `caddy` + `cloudflared-tunnel` + `sing-box` | 2026-07-08 以前为 Docker Compose | `410a7d6b` bare-metal 迁移 |
| `.env.vps.local` 路径 | `/home/tim/project/EA/.env.vps.local` | 早期可能在 `/home/tim/var/...` 下 | 当前 systemd unit 默认 |
| 跨 app 语言选择 | URL `?lang=xx` 显式入参；`LanguageProvider` 优先消费并 `history.replaceState` 清痕 | 之前仅靠 `localStorage["ea_lang"]`，Vercel 子源本地存储隔离导致漂移 | `234fb88d` |
| 部署触发 | **手动（策略 A）**：VPS = GH Actions `Deploy to VPS`（`workflow_dispatch` only，非 push）或 tg-bot `/deploy`；Vercel = `npx vercel deploy --prod --yes` 于 `apps/site` + `apps/web`（无 GitHub webhook / 无 deploy-vercel workflow）。push main **只跑 CI**。按 release/hotfix/公网验收批次上线，不每个 commit 部署 | 曾误写为「push → deploy-vps + Vercel webhook」；2026-07-15 纠正为与 workflow 真源一致 | 策略文档 `README.zh.md` §13.1；坑 `TROUBLESHOOTING` §5.4 |
| 文档真源 vs prose 优先级 | `apps/{web,site}/src/components/LangSwitcher.tsx` + `apps/{web,site}/src/contexts/LanguageContext.tsx` + `apps/{web,site}/src/lib/{web-app-url,site-url}.ts` + `apps/api/src/routes/metrics.ts` + `require-production.ts` | 自 v0.10.0 双 app 字节一致；如发现分歧以本节为验收锚 | 持续核对 |

> **保留该节为现场文档。** 任何"生产默认改了 → 走完 audit + flip + 测 + commit + 文档 + deploy"流程后，在这里加或更新一行（git blame 即可）。
