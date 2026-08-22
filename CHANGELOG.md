# Changelog

版本发布说明详见 [CHANGELOG.md](CHANGELOG.md)。

## Unreleased

## v0.11.0 — 2026-07-28

v0.10.1 后 33 个 commit：微信通道 onboarding、工业 T0（Modbus 模拟桥 + SiteView）、手机端运维台、文档治理。详见 [CHANGELOG.md](CHANGELOG.md)。

### feat

- **wechat / api / core**：Domain Pack `channelOnboarding` 契约；绑定后首次 tip 与帮助关键词；bindings `channel_welcome_sent_at`。
- **web (C)**：industrial ops 总览挂载 `SiteViewPanel` 现场视图（SVG 柜温/排风/告警/outcome 短轨迹；无数据「—」）；设计草案 `docs/archive/site-view-widget.zh.md`。
- **industrial (B)**：`scenes/industrial/gateway` Modbus 内存模拟 → telemetry 桥（未引入 npm Modbus 依赖；不算真柜 LIVE）。

### fix

- **web / site**：手机端浏览器最小交集、窄屏字号与触控、ops 移动密度与品牌统一、site 窄屏 EN「Ops」短标签（#69–#72）。
- **deploy / web**：恢复 Cloudflare 隧道 rewrite；统一微信开始导航色。

### docs

- 文档治理：docs/ 四分类重组（architecture / protocol / domain-pack / operations）；领域文档下沉到 `scenes/{pack}/docs/`；商业材料移出仓库。
- docs hygiene / pilot 降级 banner / plans 索引；VPS metrics 默认 scrape token。

## v0.10.1 — 2026-07-15

v0.10.0 后 15 个 commit：部署链路修复（Tunnel URL 自动更新 fallback + 双棚模拟器 systemd 模板）、跨 app i18n 同步、文档结构梳理与 VPS 踩坑 runbook。**不引入新 API 表面**。

### fix

- **deploy**: Vercel `vercel.json` rewrite 指向的 TryCloudflare 隧道 URL 失效导致公网 502；更新为当前活跃 URL + `tunnel-watch.sh` 增加 journalctl 日志轮转 fallback（状态文件 + 健康检查），避免 cron 持续空转。
- **i18n**: 跨 app 语言选择同步（apps/site 营销与 apps/web 工作台）— `webAppUrl()` / `siteUrl()` 在 localStorage `ea_lang` 已设时附加 `?lang=xx`（已含 query 用 `&lang=`）；`LanguageProvider` init 优先消费 URL `?lang=` 并 `history.replaceState` 清痕。解决两个 Vercel 子源 localStorage 隔离导致的语言漂移。
- **deploy**: 双棚模拟器 — systemd 模板服务 + `NODE_ID` 从 env file 移除（`49fd5bce`）。

### docs

- 固化生产部署策略 A（手动 + 按批次/版本）— `deploy/vps/README.zh.md` §13.1–13.2 上线清单；纠正「push 自动部署」误述；新增 §5.4 Vercel bundle stale 排障。
- VPS 踩坑 runbook `deploy/vps/TROUBLESHOOTING.zh.md` — 系统化症状→根因→修复。
- 文档结构梳理 — gitignore 收紧 + 根 `.env` 孤儿 + scripts 去 `tmp-` 前缀 + Docker 部署文档残余清理。

## v0.10.0 — 2026-07-14

VPS 本机 systemd 部署（Docker 迁移）+ 技术债批量修复（34 项中 32 项已修复，253+ 新增测试）+ S3 依赖升级第一批（ESLint 10、globals 17、rate-limit 11、vercel 56、@types/node 24）。详见 [CHANGELOG.md](CHANGELOG.md)。覆盖 v0.9.4 后 16 个 commit：VPS 裸金属迁移（`410a7d6b`→`874da626`）、技术债修复（`248cf53e`→`62573540`）、依赖升级（`8f345c69`→`9447ecbc`）。

## v0.9.4 — 2026-07-12

`退出登录` 合一 /start → ops unbind 原子路径：`/start` 单页一体化 + 三 LIVE picker + bind gate；ops shell 顶栏「退出登录」→「解除微信绑定连接」原子化（新 `DELETE /admin/wechat/binding` + confirm modal + logout + 跳 /login）；`apps/site` dev 默认端口 `5174 → 5170` 同步（含 e2e / CI / AGENTS / docs）。详见 [CHANGELOG.md](CHANGELOG.md)。覆盖 main 上 v0.9.2.3 tag 后的两个 commit：`3c20b83`（/start 一体化 + 端口）和 `620d891 (#55)`（ops unbind）。

## v0.9.1 — 2026-07-11

VPS 自托管部署链路完整化（Vercel 前端 + Cloudflare Tunnel + 自动化部署 + Telegram Bot 异步 + Clash/vnstat 流量监控）+ 6 项部署侧 fix + 工作流与文档回流。详见 [CHANGELOG.md](CHANGELOG.md)。本版本**不引入新 API 表面**。

## v0.9.0 — 2026-07-10

公网双 App、工作台 dense operational 整改、营销站 UX/a11y、demo 栈与跨站链接、MQTT/天气运行时修复。详见 [CHANGELOG.md](CHANGELOG.md)。

### 产品与鉴权

- 营销站 `apps/site` 与工作台 `apps/web` 职责拆分；session 角色化鉴权（admin/user）与 dogfood `@critical` 门禁。
- 匿名三域 demo 栈（`DEMO_READONLY` + `DEMO_STACK`）与 site `VITE_DEMO_API_*` 只读演示。

### 工作台 / 营销站

- 工作台 Phase 0–4：基础组件、Auth/Domain 数据层、Settings/Robot/Nodes 拆分、平台 Tab、导航分组、微交互。
- 营销站 UX 评估清单落地（交互态、骨架屏、skip-link、thumb CSS、utilities 去污染）。
- 跨站：`VITE_WEB_APP_URL` / `VITE_SITE_URL`（DEV 默认 5173↔5174）。

### 生产硬化与运行时

- 生产语义启用 `DEMO_READONLY=1` 必须同时 `DEMO_STACK=1`。
- `/metrics` 支持 `METRICS_SCRAPE_TOKEN`；生产须配置 scrape token 或显式 `METRICS_ALLOW_PUBLIC=1`。
- MQTT publisher 启动连接 + 重连状态；`weather.query_forecast` 缺 `parameters` 默认 24h。

### Domain Pack

- robotics 声明 `requiredTransports: ["m20_http"]`；industrial 补 `commandStatusMessage`。
- `check-domain-pack-contracts`：live pack 强制非空 `requiredTransports` 与非空 eval JSONL。

### 文档

- 全仓扫描、下一战场决策、工作台整改方案、营销站 UX 评估、agent readiness 报告。

## v0.8.0 — 2026-06-23

Domain Pack 平台底座 + Web v3.1：schema 驱动运维台、CSS 分层与 legacy 路由删除、E2E 46 条、DESIGN Don't 视觉债务清理。详见 [CHANGELOG.md](CHANGELOG.md)。

## v0.7.0 — 2026-06-19

验证强度可复制与契约硬化：四轮全量评估修复（7.7→9.2）。平台核心领域无关化并由门禁强制；Domain Pack readiness 契约统一（probe/probeNotRequired）；industrial 升级 golden sample；API 生产安全闭环；Web i18n 假阳性消除；工程门禁对称化。详见 [CHANGELOG.md](CHANGELOG.md)。

## v0.6.1 — 2026-06-17

内部标记版本，无独立对外发布说明。变更内容已合入 v0.7.0 release notes 累积描述。

## v0.6.0 — 2026-06-17

内部标记版本，无独立对外发布说明。变更内容已合入 v0.7.0 release notes 累积描述。

## v0.5.6 — 2026-06-17

内部标记版本，无独立对外发布说明。变更内容已合入 v0.7.0 release notes 累积描述。

## v0.5.5 — 2026-06-17

内部标记版本，与 v0.5.4 同日打 tag，无独立对外发布说明。变更内容已合入 v0.5.4 / v0.7.0 release notes 累积描述。

## v0.5.4 — 2026-06-17

Domain Pack 架构治理与可复制交付门禁加固，补齐飞轮验证、失败可见性与 Web/E2E 门禁。详见 [CHANGELOG.md](CHANGELOG.md)。

## v0.5.3 — 2026-06-13

Dogfood 多轮验证与稳定化：Web i18n 补齐、前后端设置保存一致、Vent/Fan 遥测闭环、E2E 扩展至 14 项。详见 [CHANGELOG.md](CHANGELOG.md)。

## v0.5.2 — 2026-06-12

平台首页文案重构（领域展开口径、平台内在价值叙事）；农场工长 Hero 左栏文案 + 微信 ClawBot 聊天演示面板，右侧保留实景背景。详见 [CHANGELOG.md](CHANGELOG.md)。

## v0.5.1 — 2026-06-11

仓库收口补丁：归档旧愿景、MVP、迁移 spec 与一次性迁移脚本；删除旧别名/批量 rename 脚本；活跃文档统一到具身Agent / Scene Node / Deployment 叙事；移除 `normalizeLlmShape()` 对旧租户字段的静默吞并。详见 [CHANGELOG.md](CHANGELOG.md)。

## v0.4.0 — 2026-06-10

原生 Deployment 模型：`deployment_id`、`AGENT_DATA_DIR`、`deployments/`、MQTT `deployments/`。新增 `platform` / `memory` / `node` / `agent` 包；一次性迁移脚本现已归档到 `docs/archive/scripts/`。详见 [CHANGELOG.md](CHANGELOG.md)。

## v0.3.0 及更早

### Agent hardening 闭环补丁

- core **106/106**：#67 报警阈值查询、#100 自动通风环控（`structural-intent`）
- **#9 代码对齐**：`irrigation.start` 不再挂灌后 scene；outcome 仅在确认后 `open_vent` 复盘
- **Agents.md** 同步：`COMMAND_STORE`、wechat 门禁、`structural-intent`、灌后通风双路径

### Agent hardening follow-ups（2026-06-09，Issues #6–#11）

- **#6**：结构性 intent 覆盖（`A区灌溉`→zone-a；多轮「也是30度」→gh-002 报警）
- **#7**：`verify-intent-gate.sh` / CI 增加 wechat sim:matrix 100% 门禁
- **#8**：Redis 多副本 pending 读穿（pipeline 每轮 refresh）
- **#10**：intent-resolve.jsonl 批量落盘；Redis 会话枚举改用 SCAN
- **#11**：`COMMAND_STORE=file|sqlite` 与 `STATE_BACKEND` 解耦

### Agent 工程加固（2026-06）

- **短板修复**：场景 intent 映射（灌溉→灌后通风）、统一失败捕获、Flash NLG 默认跳过、灌溉 Zod 去 cast、动态 eval 矩阵、intent 日志 JSONL
- **Router 拆分**：`route-table/` + `physical/` + 共享 `publish-prepared.ts`
- **状态外置**：`STATE_BACKEND=redis` 时 SQLite 指令库 + Redis 基础设施；`npm run migrate:sqlite`
- **Prompt SSOT**：`buildIntentPrompt()` 分层组装 + `npm run codegen:intent`

### 文档

- 修正历史 MVP 测试计划中 `fan.start` 无时长行为
- 强化 `docs/README.zh.md` Agent 工程索引
