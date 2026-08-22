# 环境变量与密钥索引

**用途：** 给 AI 与开发者一张「指针表」——只说明变量含义、消费方、真源文件与缺失时的行为；**不缓存具体取值**。取值以运行环境、`{AGENT_DATA_DIR}/settings.json` 与 `.env.example` 为准。

**本地模板：** [`.env.example`](../../.env.example)  
**场景 profile 导出：** `npm run dev:status` 查看数据目录；各 scene 启动后写入 `.agentstack/dev-services/{scene}/env.sh`

---

## 读取优先级（通用）

| 层级            | 说明                                                             |
| --------------- | ---------------------------------------------------------------- |
| 进程环境变量    | 多数脚本与 API 冷启动直接读 `process.env`                        |
| `settings.json` | 部署态配置；Web 配置台保存后覆盖同名字段（见下表「持久化字段」） |
| 代码默认        | 仅开发/试点；生产缺关键项应**失败可见**                          |

**LLM Key：** `settings.json.llm_api_key` 与 `LLM_API_KEY` 二选一或叠加（`getEffectiveSettings` 文件优先）。评测脚本通常两者都认。  
**MQTT：** `settings.json.mqtt_url` 优先于 `MQTT_URL` 环境变量（`getEffectiveSettings`）。  
**deployment / domain：** `settings.json` 与 `DEPLOYMENT_ID` / `ACTIVE_DOMAIN` 环境变量；生产须显式其一（见 `require-deployment.ts`）。

---

## 1. 部署与数据根（最高优先级）

| 变量             | 消费方                                    | 真源                                                                                                                                             | 缺失时                                                                         |
| ---------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `AGENT_DATA_DIR` | API、脚本、评测、Node 模拟器              | [`packages/platform/src/data-dir.ts`](../../packages/platform/src/data-dir.ts)                                                                      | 默认 `.agentstack/dev-profiles/default/data`（相对 cwd）                       |
| `DEPLOYMENT_ID`  | settings、MQTT topic、Memory 路径         | [`apps/api/src/settings/store.ts`](../../apps/api/src/settings/store.ts)、[`apps/api/src/settings/require-deployment.ts`](../../apps/api/src/settings/require-deployment.ts) | 无 settings 且无 env → **throw**                                               |
| `ACTIVE_DOMAIN`  | Domain Pack loader、调度器守卫            | [`apps/api/src/settings/store.ts`](../../apps/api/src/settings/store.ts)、[`apps/api/src/settings/require-deployment.ts`](../../apps/api/src/settings/require-deployment.ts) | 无 settings 且无 env → **throw**；禁止逗号多值                                 |
| `NODE_ENV`       | 鉴权默认值、集成回调、生产门禁、CORS 判定 | 多处                                                                                                                                             | 仅 `development`/`test` 视为显式开发；未设置/空串/其他值按生产语义 fail-closed |

**持久化字段（`{AGENT_DATA_DIR}/settings.json`）：** `deployment_id`、`active_domain`、`mqtt_url`、`domain_configs`、`device-registry.json` 同目录。

**数据布局真源：** [`docs/architecture/platform-runtime.zh.md`](../architecture/platform-runtime.zh.md) §数据根

| 变量                | 消费方                | 真源                                                                                                                                                                                                                                                                                | 缺失时                                                                                                                 |
| ------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `RETENTION_DAYS`    | JSONL 保留裁剪        | [`packages/platform/src/jsonl-retention.ts`](../../packages/platform/src/jsonl-retention.ts)、[`apps/api/src/jobs/retention.ts`](../../apps/api/src/jobs/retention.ts)                                                                                                                    | 不裁剪；无效值 warn 并跳过；无/坏时间戳行在裁剪时删除                                                                  |
| `AGENT_SECRETS_KEY` | settings 密钥静态加密 | [`packages/platform/src/secrets-crypto.ts`](../../packages/platform/src/secrets-crypto.ts)、[`apps/api/src/settings/secrets-at-rest.ts`](../../apps/api/src/settings/secrets-at-rest.ts)、[`apps/api/src/settings/require-production.ts`](../../apps/api/src/settings/require-production.ts) | 设置后 `saveSettings` 将 `llm_api_key` 等字段加密为 `eaenc:v1:` 前缀；生产若 settings 仍含明文密钥且无本变量则启动失败 |

---

## 2. API 进程

| 变量                                       | 消费方                              | 真源                                                                                                                                         | 缺失时                                                                                                                  |
| ------------------------------------------ | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `PORT`                                     | API 监听                            | [`apps/api/src/bootstrap.ts`](../../apps/api/src/bootstrap.ts)                                                                                  | `3001`                                                                                                                  |
| `HOST`                                     | API 绑定地址                        | [`apps/api/src/bootstrap.ts`](../../apps/api/src/bootstrap.ts)                                                                                  | 生产 `127.0.0.1`（Caddy/Tunnel 前置）；显式开发环境 `0.0.0.0`                                                           |
| `CORS_ORIGIN`                              | Fastify CORS                        | [`apps/api/src/app.ts`](../../apps/api/src/app.ts)、[`apps/api/src/cors.ts`](../../apps/api/src/cors.ts)                                           | 生产语义下未配置=空 allowlist；`*` 直接拒绝并启动失败；显式开发环境未配置/`*` 使用本地 allowlist                        |
| `STATE_BACKEND`                            | 会话态                              | [`apps/api/README.md`](../../apps/api/README.md)                                                                                                | `file`                                                                                                                  |
| `COMMAND_STORE`                            | 指令持久化                          | [`apps/api/README.md`](../../apps/api/README.md)                                                                                                | `file`；`redis` 时默认 `sqlite`                                                                                         |
| `REDIS_URL`                                | Redis 会话                          | `docker-compose.yml`、`apps/api/src/state/`                                                                                                  | `STATE_BACKEND=redis` 时**必填**                                                                                        |
| `REDIS_LOCK_TTL_MS`                        | Redis 协调锁 TTL                    | [`apps/api/src/state/redis-lock.ts`](../../apps/api/src/state/redis-lock.ts)、[`apps/api/src/fs/file-lock.ts`](../../apps/api/src/fs/file-lock.ts) | `STATE_BACKEND=redis` 时 `withFileLock` 走 Redis；默认 `INTENT_PROMOTE_MATRIX_TIMEOUT_MS + 60s`；须 `>= matrix timeout` |
| `SQLITE_PATH`                              | 指令库                              | [`apps/api/README.md`](../../apps/api/README.md)                                                                                                | `{AGENT_DATA_DIR}/agent.db`                                                                                             |
| `CHAT_CHANNEL`                             | 入站通道                            | [`apps/api/src/channels/registry.ts`](../../apps/api/src/channels/registry.ts)                                                                  | `dev`；生产禁止 `wechat-stub`                                                                                           |
| `HTTPS_PROXY` / `HTTP_PROXY` / `ALL_PROXY` | 出站 HTTP 代理（undici ProxyAgent） | [`apps/api/src/wechat/ilink-client.ts`](../../apps/api/src/wechat/ilink-client.ts)                                                              | 不设置则直连；设置后 undici 走代理，ProxyAgent 导入失败时 **throw**                                                     |

---

## 3. LLM 与语音（理解层）

| 变量                                                       | 消费方                     | 真源                                                                                                                                                               | 缺失时                                    |
| ---------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| `LLM_API_KEY`                                              | 意图解析、matrix、flywheel | [`packages/agent/src/intent/llm.ts`](../../packages/agent/src/intent/llm.ts)                                                                                          | 无 Key → **503** / 评测跳过（见脚本规则） |
| `LLM_BASE_URL`                                             | LLM HTTP                   | [`packages/agent/src/intent/llm.ts`](../../packages/agent/src/intent/llm.ts)                                                                                          | settings 或 provider preset               |
| `LLM_MODEL`                                                | LLM HTTP                   | 同上                                                                                                                                                               | preset 默认                               |
| `LLM_PROVIDER`                                             | settings 默认              | [`apps/api/src/settings/store.ts`](../../apps/api/src/settings/store.ts)                                                                                              | `deepseek`                                |
| `LLM_THINKING`                                             | 思考模式                   | [`packages/agent/src/intent/llm.ts`](../../packages/agent/src/intent/llm.ts)                                                                                          | 默认开；`0` 关闭                          |
| `LLM_TIMEOUT_MS`                                           | 请求超时                   | [`packages/agent/src/intent/llm.ts`](../../packages/agent/src/intent/llm.ts)                                                                                          | `15000`                                   |
| `LLM_STRICT_JSON`                                          | schema 约束                | [`packages/agent/src/intent/intent-json-schema.ts`](../../packages/agent/src/intent/intent-json-schema.ts)                                                            | 默认 strict；`0` 放宽                     |
| `LLM_ESCALATE_MODEL`                                       | 澄清升级                   | [`packages/agent/src/intent/resolve-with-escalation.ts`](../../packages/agent/src/intent/resolve-with-escalation.ts)                                                  | 内置默认模型                              |
| `STT_PROVIDER` / `STT_MODEL` / `STT_API_KEY` / `STT_APP_*` | 语音转写                   | [`apps/api/src/settings/store.ts`](../../apps/api/src/settings/store.ts)、[`packages/agent/src/stt-settings.ts`](../../packages/agent/src/stt-settings.ts)               | `none`；`STT_MOCK=1` 走 mock              |
| `STT_MOCK` / `STT_MOCK_TEXT`                               | 测试 mock STT              | [`packages/agent/src/stt-settings.ts`](../../packages/agent/src/stt-settings.ts)、[`packages/agent/src/intent/stt/mock.ts`](../../packages/agent/src/intent/stt/mock.ts) | 仅开发/测试                               |
| `ALIYUN_NLS_GATEWAY`                                       | 阿里云 STT                 | [`packages/agent/src/intent/stt/aliyun.ts`](../../packages/agent/src/intent/stt/aliyun.ts)                                                                            | 内置默认网关                              |
| `STT_TIMEOUT_MS`                                           | STT 请求超时               | [`packages/agent/src/intent/stt/timeout.ts`](../../packages/agent/src/intent/stt/timeout.ts)                                                                          | `15000`                                   |

**持久化字段：** `llm_*`、`stt_*`（Web 配置台 → `settings.json`）

---

## 4. MQTT 与物理下发

| 变量                                                          | 消费方                     | 真源                                                                                                                                                                                                                                        | 缺失时                                                                                                                                               |
| ------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MQTT_URL`                                                    | API 订阅/发布、模拟器、e2e | [`apps/api/src/mqtt/url.ts`](../../apps/api/src/mqtt/url.ts)、[`apps/api/src/chat/pipeline-ports.ts`](../../apps/api/src/chat/pipeline-ports.ts)、[`scripts/node-simulator.ts`](../../scripts/node-simulator.ts)                                     | 无隐式默认；显式注入/env/settings 都未配置则视为未配置（返回 `undefined`）；配置值若 scheme 非 `mqtt/mqtts/ws/wss` 或无 host，运行时立即报错失败可见 |
| `MQTT_USERNAME` / `MQTT_PASSWORD`                             | API/Node MQTT 客户端       | [`packages/platform/src/mqtt-connect-options.ts`](../../packages/platform/src/mqtt-connect-options.ts)、[`packages/node/src/mqtt/client.ts`](../../packages/node/src/mqtt/client.ts)、[`scripts/node-simulator.ts`](../../scripts/node-simulator.ts) | 无认证（本地 aedes）；stack 须配置                                                                                                                   |
| `MQTT_API_PASSWORD` / `MQTT_NODE_PASSWORD`                    | stack Mosquitto ACL 用户   | [`scripts/mosquitto-stack-entry.sh`](../../scripts/mosquitto-stack-entry.sh)、[`docker-compose.yml`](../../docker-compose.yml)                                                                                                                    | stack profile **必填**                                                                                                                               |
| `MQTT_REJECT_UNAUTHORIZED`                                    | TLS 校验                   | 同上                                                                                                                                                                                                                                        | 默认校验；`0` 关闭                                                                                                                                   |
| `MQTT_CA_FILE`                                                | mqtts CA 文件              | [`packages/platform/src/mqtt-connect-options.ts`](../../packages/platform/src/mqtt-connect-options.ts)                                                                                                                                | 未设则不附加 `ca`；docker stack 挂载 `infra/mosquitto/certs/ca.crt`                                                                                  |
| `MQTT_PUBLISH_TIMEOUT_MS`                                     | 发布超时                   | 同上                                                                                                                                                                                                                                        | `5000`                                                                                                                                               |
| `MQTT_SUBSCRIBE_CONNECT_ATTEMPTS`                             | 启动重试                   | [`apps/api/src/jobs/start.ts`](../../apps/api/src/jobs/start.ts)                                                                                                                                                                               | 普通 `5`；`FLYWHEEL_DEV=1` 时 `20`                                                                                                                   |
| `M20_HTTP_TIMEOUT_MS`                                         | Robot HTTP transport       | [`scenes/robot/m20/client.ts`](../../scenes/robot/m20/client.ts)                                                                                                                                                                               | 包内默认                                                                                                                                             |
| `M20_STUB_PORT` / `M20_STUB_DELAY_MS` / `M20_STUB_FAIL_PATHS` | 本地 M20 stub              | [`scripts/m20-stub.ts`](../../scripts/m20-stub.ts)                                                                                                                                                                                             | `3099` 等                                                                                                                                            |

---

## 5. 安全、集成与开发路由

| 变量                             | 消费方                                                                             | 真源                                                                                                                                                   | 缺失时                                                                                                                                                                                          |
| -------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ADMIN_TOKEN`                    | Admin API、`x-admin-token`（脚本/CI）；**浏览器工作台不依赖此头**，用 `ea_session` | [`apps/api/src/routes/admin-auth.ts`](../../apps/api/src/routes/admin-auth.ts)、[`apps/api/src/settings/require-production.ts`](../../apps/api/src/settings/require-production.ts) | 非生产 `dev-admin`；生产**必填**且不能为 `dev-admin`                                                                                                                                            |
| `SESSION_SECRET`                 | Web session cookie 签名（`ea_session`）；TTL 15min                                 | [`apps/api/src/auth/web-session/cookie.ts`](../../apps/api/src/auth/web-session/cookie.ts)                                                                | 生产**必填**；`development`/`test` 可用内置 dev 默认；重启换 secret 会使旧 cookie 失效                                                                                                          |
| `WEB_INSTALL_CODE`               | 首次部署 bootstrap 兑换 **admin**（须同时设邮箱密码）                              | [`apps/api/src/auth/web-session/accounts.ts`](../../apps/api/src/auth/web-session/accounts.ts)                                                            | 未配置则 `POST /auth/bootstrap` → `bootstrap_not_configured`；`GET /auth/bootstrap-status` → `{ available: false, redeemed: false }`；调试见 [`web-session.zh.md`](web-session.zh.md) |
| `INTEGRATION_SECRET`             | `POST /integrations/chat`                                                          | [`apps/api/src/routes/integration.ts`](../../apps/api/src/routes/integration.ts)、settings                                                                | 非生产可无 secret；生产应配置                                                                                                                                                                   |
| `DEV_CHAT_SECRET`                | `/dev/chat`                                                                        | [`apps/api/src/app.ts`](../../apps/api/src/app.ts)                                                                                                        | 生产 `ENABLE_DEV_CHAT=1` 时**必填**；本地设 secret 后请求须带 `x-dev-chat-secret`                                                                                                               |
| `ENABLE_DEV_CHAT`                | 生产临时开 dev chat                                                                | [`apps/api/src/app.ts`](../../apps/api/src/app.ts)、[`apps/api/src/routes/dev-flywheel.ts`](../../apps/api/src/routes/dev-flywheel.ts)                                           | 生产默认关；与 `DEV_CHAT_SECRET` 成对启用                                                                                                                                                       |
| `DEMO_READONLY`                  | 匿名只读 demo API 模式                                                             | [`apps/api/src/demo/readonly.ts`](../../apps/api/src/demo/readonly.ts)                                                                                    | 未设置=正常鉴权；**只允许** `=1`；其他值启动 **throw**；写路径一律 403；**生产语义**下还须 `DEMO_STACK=1`                                                                                       |
| `DEMO_STACK`                     | 标记当前进程为匿名演示栈                                                           | [`apps/api/src/demo/readonly.ts`](../../apps/api/src/demo/readonly.ts)、[`docker-compose.demo.yml`](../../docker-compose.demo.yml)                           | 未设置时生产禁止 `DEMO_READONLY`；demo compose / 演示部署显式 `=1`                                                                                                                              |
| `METRICS_SCRAPE_TOKEN`           | `/metrics` scrape 鉴权                                                             | [`apps/api/src/routes/metrics.ts`](../../apps/api/src/routes/metrics.ts)、[`apps/api/src/settings/require-production.ts`](../../apps/api/src/settings/require-production.ts)       | 设置后须 `Authorization: Bearer` 或 `x-metrics-token`；生产推荐                                                                                                                                 |
| `METRICS_ALLOW_PUBLIC`           | 生产允许匿名 `/metrics`                                                            | [`apps/api/src/settings/require-production.ts`](../../apps/api/src/settings/require-production.ts)                                                                              | 仅 `=1` 时与 scrapetoken 二选一；依赖网络隔离；demo 栈默认 `1`                                                                                                                                  |
| `FLYWHEEL_DEV`                   | 飞轮 dev 端点、微信跳过                                                            | [`apps/api/src/routes/dev-flywheel.ts`](../../apps/api/src/routes/dev-flywheel.ts)                                                                        | 飞轮 ready/reset **要求** `=1`                                                                                                                                                                  |
| `EMBODIED_AGENT_INTEGRATION_URL` | OpenClaw 转发                                                                      | [`scripts/openclaw-hook-forward-embodied-agent.mjs`](../../scripts/openclaw-hook-forward-embodied-agent.mjs)                                              | 脚本内默认 URL                                                                                                                                                                                  |

**持久化字段：** `integration_secret`

---

## 6. Web / Site（Vite）

| 变量                       | 消费方                                                                              | 真源                                                                                                   | 缺失时                                                                           |
| -------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `VITE_API_PROXY`           | 开发代理目标                                                                        | [`apps/web/vite.config.ts`](../../apps/web/vite.config.ts)、[`scripts/web-dev.sh`](../../scripts/web-dev.sh) | `http://127.0.0.1:3001`                                                          |
| `VITE_ADMIN_TOKEN`         | **废弃**：历史本地 admin token；工作台主路径已改 session cookie，site 走 demo-fetch | 无运行时消费（勿再接入）                                                                               | 可删；浏览器鉴权以 `/auth/*` + `ea_session` 为准                                 |
| `VITE_WECHAT_CONTACT`      | 联系展示                                                                            | `.env.example`                                                                                         | 可选                                                                             |
| `VITE_DEMO_API_GREENHOUSE` | site 温室演示 API base                                                              | [`apps/site/src/demo/config.ts`](../../apps/site/src/demo/config.ts)                                      | 未设置则演示区显示未配置提示                                                     |
| `VITE_DEMO_API_ROBOT`      | site 机器人演示 API base                                                            | 同上                                                                                                   | 同上                                                                             |
| `VITE_DEMO_API_INDUSTRIAL` | site 工业演示 API base                                                              | 同上                                                                                                   | 同上                                                                             |
| `VITE_WEB_APP_URL`         | 营销站「微信开始 / 工作台」等链到工作台的基址                                       | [`apps/site/src/lib/web-app-url.ts`](../../apps/site/src/lib/web-app-url.ts)                              | **DEV 默认** `http://127.0.0.1:5173`；生产须显式配置，否则相对路径落在营销站同源 |
| `VITE_SITE_URL`            | 工作台入口壳（登录/微信开始）品牌链到营销站                                         | [`apps/web/src/lib/site-url.ts`](../../apps/web/src/lib/site-url.ts)                                      | **DEV 默认** `http://127.0.0.1:5170`；生产须显式配置                             |
| `WEB_PORT`                 | Web 端口                                                                            | [`scripts/web-dev.sh`](../../scripts/web-dev.sh)、[`scripts/dev-services.sh`](../../scripts/dev-services.sh)         | `5173`                                                                           |
| `SITE_PORT`                | Site 端口                                                                           | [`apps/site/vite.config.ts`](../../apps/site/vite.config.ts)                                              | `5170`                                                                           |

---

## 7. 本地 dev profile（`npm run dev:*`）

由 [`scripts/dev-services.sh`](../../scripts/dev-services.sh) 写入 `.agentstack/dev-services/{scene}/env.sh`：

| 变量                                                    | 说明                                    |
| ------------------------------------------------------- | --------------------------------------- |
| `SCENE`                                                 | `greenhouse` / `robot` / `industrial`   |
| `AGENT_DATA_DIR`                                        | `.agentstack/dev-profiles/{scene}/data` |
| `API_PORT` / `WEB_PORT` / `MQTT_PORT` / `M20_STUB_PORT` | 各 scene 端口（见 `dev:status`）        |
| `API_URL` / `MQTT_URL`                                  | 脚本与 monitor 用                       |
| `ADMIN_TOKEN`                                           | 默认 `dev-admin`                        |

**命令：** `dev:greenhouse` / `dev:robot` / `dev:industrial` — 见 [`AGENTS.md`](../../AGENTS.md) §本地按场景启动

---

## 7.1 匿名 demo deployment（三域只读演示栈）

三域只读演示栈；每域独立 MQTT broker + API（`DEMO_READONLY=1`）+ 模拟器。模板见 [`.env.demo-site.example`](../../.env.demo-site.example)（复制为 `.env.demo-site.local` 后填入 secret）。

| 变量                                                                               | 说明                                                                                      |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `DEMO_STACK_NODE_ENV`                                                              | demo API `NODE_ENV`（`production` 时须配 `ADMIN_TOKEN`）                                  |
| `DEMO_STACK_DATA_ROOT`                                                             | 本地数据根，默认 `.agentstack/demo-profiles`                                              |
| `DEMO_STACK_ADMIN_TOKEN`                                                           | 三域 API 共用 admin token（写操作仍被 `DEMO_READONLY` 拦截）                              |
| `DEMO_STACK_SESSION_SECRET`                                                        | demo API `SESSION_SECRET`（`NODE_ENV=production` 时必填，避免携带 `ea_session` 请求 500） |
| `DEMO_SITE_ORIGIN`                                                                 | 写入各 API `CORS_ORIGIN`，供 site 跨域只读拉取（`site:dev` 默认 `http://127.0.0.1:5170`） |
| `DEMO_GREENHOUSE_API_PORT` / `DEMO_ROBOT_API_PORT` / `DEMO_INDUSTRIAL_API_PORT`    | 三域 API 宿主机端口（默认 3101/3201/3301）                                                |
| `DEMO_GREENHOUSE_MQTT_PORT` / `DEMO_ROBOT_MQTT_PORT` / `DEMO_INDUSTRIAL_MQTT_PORT` | 三域 MQTT 宿主机端口（默认 1884/1885/1886）                                               |
| `DEMO_M20_STUB_PORT`                                                               | robot M20 stub（compose 内网 3099；本地无 Docker 默认 3209）                              |

### 有 Docker 环境

```bash
cp .env.demo-site.example .env.demo-site.local   # 填入 secret
docker compose -f docker-compose.demo.yml --env-file .env.demo-site.local up -d
./scripts/demo-reset.sh all   # cron/systemd 定时重置模拟态
```

### 无 Docker 环境（本机进程）

等价方案：`scripts/demo-stack-local.sh`（真源 [`scripts/demo-stack-local.sh`](../../scripts/demo-stack-local.sh)），用本机 Node 进程替代容器，端口与 docker 方案一致。

```bash
npm run demo:stack:local -- start    # 启动三域 broker + API + 模拟器
npm run demo:stack:local -- status   # 查看进程与端口
npm run demo:stack:local -- stop     # 停止
```

脚本读取 `.env.demo-site.local`（同 docker 方案），未配置时用内置默认值（`DEMO_STACK_ADMIN_TOKEN=local-admin-token`、端口 3101/3201/3301 等），仅 `LLM_API_KEY` 需从环境继承（demo 只读模式不强制）。

### 营销站连接 demo API

无论 docker 还是本机方案，营销站（`apps/site`）都需在启动时指向三域 API：

```bash
VITE_DEMO_API_GREENHOUSE=http://127.0.0.1:3101 \
VITE_DEMO_API_ROBOT=http://127.0.0.1:3201 \
VITE_DEMO_API_INDUSTRIAL=http://127.0.0.1:3301 \
npm run site:dev
```

未设置则场景演示区显示未配置提示。

---

## 8. 模拟器与 Node 联调

| 变量                                                            | 消费方                                                | 真源                                                                      | 缺失时                                                        |
| --------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `NODE_ID`                                                       | 模拟器身份                                            | [`scripts/node-simulator.ts`](../../scripts/node-simulator.ts)               | greenhouse 默认 `node-sim-gh-001`                             |
| `GREENHOUSE_ID`                                                 | 遥测实体                                              | 同上、pair e2e                                                            | `gh-001`                                                      |
| `CABINET_ID` / `ENTITY_ID`                                      | industrial profile 遥测实体（`ENTITY_ID` 为回退别名） | [`scripts/node-simulator.ts`](../../scripts/node-simulator.ts)               | `cabinet-001`（仅 `--profile=industrial` 生效）               |
| `NODE_TOKEN`                                                    | 跳过配对                                              | 同上                                                                      | 无则走配对流程                                                |
| `INSTALL_CODE`                                                  | 配对                                                  | 同上                                                                      | 可选                                                          |
| `SIM_MAX_COMMAND_MS`                                            | 指令模拟时长上限                                      | [`scripts/node-simulator.ts`](../../scripts/node-simulator.ts)               | `0` 不缩短；flywheel CI 可设 `8000`                           |
| `SIM_TELEMETRY_SCENARIO` / `SIM_TELEMETRY_REACT`                | 双棚遥测剧本                                          | [`scripts/lib/sim-telemetry.ts`](../../scripts/lib/sim-telemetry.ts)         | 默认剧本                                                      |
| `SIM_GPS_LATITUDE` / `SIM_GPS_LONGITUDE` / `SIM_GPS_ACCURACY_M` | 模拟 GPS                                              | [`scripts/node-simulator.ts`](../../scripts/node-simulator.ts)               | 可选                                                          |
| `ENSURE_SIM_DUAL_FORCE_REBIND`                                  | 强制重绑双节点                                        | [`scripts/lib/sim-dual-nodes.ts`](../../scripts/lib/sim-dual-nodes.ts)       | `1` 强制                                                      |
| `ENSURE_SIM_INDUSTRIAL_FORCE_REBIND`                            | 强制重绑 industrial 模拟节点                          | [`scripts/ensure-sim-industrial.ts`](../../scripts/ensure-sim-industrial.ts) | `1` 强制重绑并重发 retained config；未设则仅在缺绑定时 rebind |
| `API_URL`                                                       | 脚本调 API                                            | 多数 `scripts/*-e2e.ts`                                                   | `http://127.0.0.1:3001`                                       |

---

## 9. 评测、飞轮与门禁

| 变量                               | 消费方                                                       | 真源                                                                                                                                                                                                                                                 | 缺失时                                                                                                  |
| ---------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `SIM_MATRIX_SLICE`                 | core/wechat/negative                                         | [`scripts/simulate-user-matrix.ts`](../../scripts/simulate-user-matrix.ts)                                                                                                                                                                              | 跑全部                                                                                                  |
| `SIM_MATRIX_MIN_PASS_RATE` 等      | 通过率门槛                                                   | 同上                                                                                                                                                                                                                                                 | core `0.9`，wechat/negative `1`                                                                         |
| `SIM_MATRIX_DELAY_MS`              | 矩阵节流                                                     | 同上                                                                                                                                                                                                                                                 | `150`                                                                                                   |
| `SIM_MATRIX_WECHAT_STAGING`        | 微信矩阵路径                                                 | [`scripts/lib/intent-eval-common.ts`](../../scripts/lib/intent-eval-common.ts)                                                                                                                                                                          | 默认 corpus                                                                                             |
| `MATRIX_WECHAT_PATH_OVERRIDE`      | 覆盖矩阵文件                                                 | 同上                                                                                                                                                                                                                                                 | 可选                                                                                                    |
| `EVAL_EVIDENCE_SECRET`             | ① `sim:matrix` 签报告 ② **API readiness 验签**（`attested`） | [`scripts/simulate-user-matrix.ts`](../../scripts/simulate-user-matrix.ts)、[`packages/runtime/src/readiness-sim-matrix.ts`](../../packages/runtime/src/readiness-sim-matrix.ts)；本地 dev 经 [`scripts/dev-services.sh`](../../scripts/dev-services.sh) 透传 | 无则报告不签名 / API 侧 `attested=false` → ops 顶栏 `BLOCKED · Sim Matrix *`；**签与跑 API 必须同一值** |
| `FLYWHEEL_ATTESTATION_SECRET`      | 飞轮 attestation HMAC                                        | [`scripts/lib/flywheel-attestation.ts`](../../scripts/lib/flywheel-attestation.ts)                                                                                                                                                                      | 无则 attestation 无签名                                                                                 |
| `EVIDENCE_ATTESTATION_SECRET`      | 同上（别名）                                                 | 同上                                                                                                                                                                                                                                                 | 同上                                                                                                    |
| `EVAL_WRITE_DOCS`                  | 报告写入 `docs/eval/`                                        | [`scripts/lib/eval-report-output.ts`](../../scripts/lib/eval-report-output.ts)                                                                                                                                                                          | 仅写 `{AGENT_DATA_DIR}/local-eval-reports/`                                                             |
| `FLYWHEEL_FAST`                    | 飞轮加速                                                     | [`scripts/domain-flywheel-agriculture-e2e.ts`](../../scripts/domain-flywheel-agriculture-e2e.ts)、[`apps/api/src/jobs/start.ts`](../../apps/api/src/jobs/start.ts)                                                                                                      | 默认 fast                                                                                               |
| `INTENT_EVAL_MIN_PASS_RATE`        | 意图评测                                                     | [`scripts/run-intent-eval.ts`](../../scripts/run-intent-eval.ts)                                                                                                                                                                                        | `0.9`                                                                                                   |
| `INTENT_PROMOTE_MATRIX_TIMEOUT_MS` | 晋升锁超时                                                   | [`packages/platform/src/file-lock.ts`](../../packages/platform/src/file-lock.ts)                                                                                                                                                                        | 默认 `600000`                                                                                           |
| `INTENT_PROMOTE_WECHAT_API`        | Serverless 晋升                                              | [`packages/agent/src/intent/promote-wechat-runner.ts`](../../packages/agent/src/intent/promote-wechat-runner.ts)                                                                                                                                        | 默认关                                                                                                  |
| `SPOT_IDS`                         | 矩阵 spot check                                              | [`scripts/spot-check-matrix-rows.ts`](../../scripts/spot-check-matrix-rows.ts)                                                                                                                                                                          | 默认 `43,74`                                                                                            |

**验证入口索引：** [`AGENTS.md`](../../AGENTS.md) §当前验证入口  
**飞轮细节：** [`scenes/greenhouse/docs/domain-flywheel-agriculture.zh.md`](../../scenes/greenhouse/docs/domain-flywheel-agriculture.zh.md)

---

## 10. 告警、场景时序与设备态

| 变量                                                        | 消费方             | 真源                                                                                                                         | 缺失时             |
| ----------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `DEVICE_HEARTBEAT_TIMEOUT_MS`                               | 离线判定           | [`apps/api/src/devices/runtime-state.ts`](../../apps/api/src/devices/runtime-state.ts)                                          | `90000`            |
| `TELEMETRY_STALE_MS`                                        | Admin 概览陈旧阈值 | [`apps/api/src/routes/admin-overview.ts`](../../apps/api/src/routes/admin-overview.ts)                                          | 包内默认           |
| `SUSTAINED_ALERT_MINUTES`                                   | L1/L2 持续告警     | [`apps/api/src/alerts/sustained-state.ts`](../../apps/api/src/alerts/sustained-state.ts)                                        | `15`               |
| `SUSTAINED_ALERTS`                                          | 总开关             | 同上                                                                                                                         | 默认开；`0` 关     |
| `SUSTAINED_L2_COOLDOWN_SECONDS`                             | L2 冷却            | [`apps/api/src/alerts/sustained-push.ts`](../../apps/api/src/alerts/sustained-push.ts)                                          | 包内默认           |
| `SUSTAINED_L1_RESERVATION_TTL_SECONDS`                      | L1 占位 TTL        | [`apps/api/src/alerts/sustained-state.ts`](../../apps/api/src/alerts/sustained-state.ts)                                        | 包内默认           |
| `ALERT_COOLDOWN_SECONDS` / `OFFLINE_ALERT_COOLDOWN_SECONDS` | 推送冷却           | [`apps/api/src/alerts/push.ts`](../../apps/api/src/alerts/push.ts)、[`apps/api/src/alerts/offline-push.ts`](../../apps/api/src/alerts/offline-push.ts) | `1800`             |
| `SCENE_OUTCOME_WINDOWS_MINUTES`                             | L3/L4 复盘窗口     | [`apps/api/src/scene/outcome-scheduler.ts`](../../apps/api/src/scene/outcome-scheduler.ts)                                      | `15`；可逗号多窗口 |
| `CONVERSATION_MAX_TURNS`                                    | 对话轮数上限       | [`apps/api/src/chat/conversation-store.ts`](../../apps/api/src/chat/conversation-store.ts)                                      | `10`               |

**持久化字段（可经 settings/env）：** `alert_push_enabled`、`digest_*`、`weather_proactive_enabled`、`nlg_enabled`

---

## 11. 地理、卫星与通知

| 变量                                                                            | 消费方    | 真源                                                                                                    | 缺失时                |
| ------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------- | --------------------- |
| `GEO_LATITUDE` / `GEO_LONGITUDE`                                                | 天气/定位 | [`apps/api/src/integrations/weather/geo-locate.ts`](../../apps/api/src/integrations/weather/geo-locate.ts) | 走 node GPS / IP 缓存 |
| `SATELLITE_API_KEY`                                                             | 遥感      | [`apps/api/src/settings/store.ts`](../../apps/api/src/settings/store.ts)                                   | 可选                  |
| `DIGEST_*` / `WEATHER_PROACTIVE_ENABLED` / `NLG_ENABLED` / `ALERT_PUSH_ENABLED` | 调度开关  | [`apps/api/src/settings/store.ts`](../../apps/api/src/settings/store.ts)                                   | 默认大多开启          |

---

## 12. E2E 与 CI

| 变量                       | 消费方                                  | 真源                                                                                      | 缺失时                                                  |
| -------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `E2E_BASE_URL`             | Playwright Web                          | [`playwright.config.ts`](../../playwright.config.ts)                                         | `http://127.0.0.1:5173`                                 |
| `E2E_API_URL`              | Playwright API health                   | 同上、[`tests/e2e/web-dogfood.spec.ts`](../../tests/e2e/web-dogfood.spec.ts)                 | `http://127.0.0.1:3001`                                 |
| `E2E_AGENT_DATA_DIR`       | E2E API 隔离数据根                      | [`scripts/e2e-api-server.sh`](../../scripts/e2e-api-server.sh)                               | `{repo}/.agentstack/e2e/data`                           |
| `E2E_FIXTURE_SOURCE`       | E2E fixture 拷贝源                      | 同上                                                                                      | `scripts/fixtures/ci-eval`（拷贝后剥离 `wechat-ilink`） |
| `ILINK_BASE_URL`           | iLink API 基址覆盖                      | [`apps/api/src/wechat/ilink-client.ts`](../../apps/api/src/wechat/ilink-client.ts)、E2E mock | 默认 `https://ilinkai.weixin.qq.com`                    |
| `ILINK_MOCK_PORT`          | E2E iLink mock 端口（`0` = 自动分配）   | [`scripts/ilink-mock-server.ts`](../../scripts/ilink-mock-server.ts)                         | `0`                                                     |
| `ILINK_MOCK_PORT_FILE`     | mock 写入实际端口供 e2e-api-server 读取 | [`scripts/e2e-api-server.sh`](../../scripts/e2e-api-server.sh)                               | `{repo}/.agentstack/e2e/ilink-mock.port`                |
| `ILINK_MOCK_CONFIRM_AFTER` | mock QR 第 N 次 poll 确认               | 同上                                                                                      | `2`                                                     |

**Fixture 数据根（显式设置，不依赖默认）：**

| Pack                 | 典型 `AGENT_DATA_DIR`                                               |
| -------------------- | ------------------------------------------------------------------- |
| robotics             | `scripts/fixtures/ci-robot-eval`                                    |
| industrial           | `scripts/fixtures/ci-industrial-eval`                               |
| agriculture flywheel | `.agentstack/dev-runs/domain-flywheel/agriculture/data`（脚本自管） |

---

## 13. 仅本地 Compose `stack` profile（VPS 已切 systemd）

> **仅本地一键栈**，用于本地一次性起完整（Mosquitto + Redis + API + Web + 模拟器）。VPS 部署已全切 systemd，**不在**此处描述，详见 `deploy/vps/README.zh.md` 与 `deploy/vps/TROUBLESHOOTING.zh.md` `§3 API 启动`。

见 [`docker-compose.yml`](../../docker-compose.yml)。启动：`npm run stack:up`（须预先 export）：

| 变量                 | 必填 | 说明                               |
| -------------------- | ---- | ---------------------------------- |
| `DEPLOYMENT_ID`      | 是   | stack api / node-sim               |
| `ADMIN_TOKEN`        | 是   | api；Web 配置台手输，不写入 bundle |
| `MQTT_API_PASSWORD`  | 是   | api MQTT 发布（用户 `api`）        |
| `MQTT_NODE_PASSWORD` | 是   | node-simulator（用户 `node`）      |
| `INTEGRATION_SECRET` | 否   | 集成回调                           |
| `CORS_ORIGIN`        | 否   | 默认 `http://localhost:5173`       |

Compose 内固定：`STATE_BACKEND=redis`、`REDIS_URL=redis://redis:6379`、`MQTT_URL=mqtts://mosquitto:8883`、`AGENT_DATA_DIR=/app/data`。

---

## 14. 结构化日志排障（压缩语义范围）

**stdout 格式：** `{"ts","level","scope","message","fields"?}` — 实现 [`packages/platform/src/logger.ts`](../../packages/platform/src/logger.ts)

**建议顺序：**

1. `npm run dev:logs` 或 API 日志 → 按 `"scope"` 过滤（如 `mqtt-event`、`integration`、`domain.loader`）
2. `{AGENT_DATA_DIR}/deployments/{deployment_id}/command-logs.jsonl` → 按 `command_id` 串联执行链
3. `scene-outcomes.jsonl`、`local-eval-reports/*.json` → L3/L4 与评测证据
4. Readiness → `GET /admin/domain-packs/readiness` 或 `packages/runtime/src/readiness.ts` 探针逻辑

**禁止：** 在 `apps/api/src` 新增裸 `console.*`（见 [`AGENTS.md`](../../AGENTS.md)）

---

## 15. settings.json 与 env 对照（常查）

| settings.json 字段                            | 对应 env             | 合并逻辑真源              |
| --------------------------------------------- | -------------------- | ------------------------- |
| `llm_api_key`                                 | `LLM_API_KEY`        | 文件优先                  |
| `llm_base_url` / `llm_model` / `llm_thinking` | `LLM_*`              | 文件优先，env 填 DEFAULTS |
| `mqtt_url`                                    | `MQTT_URL`           | 文件优先                  |
| `deployment_id`                               | `DEPLOYMENT_ID`      | 文件优先                  |
| `active_domain`                               | `ACTIVE_DOMAIN`      | 文件优先                  |
| `integration_secret`                          | `INTEGRATION_SECRET` | 文件优先                  |
| `stt_*`                                       | `STT_*`              | 文件优先                  |
| `satellite_api_key`                           | `SATELLITE_API_KEY`  | 文件优先                  |

类型定义：[`apps/api/src/settings/store.ts`](../../apps/api/src/settings/store.ts) `AgentSettings`

---

## 16. 运行时调优（非配置真源）

| 变量                                     | 消费方                  | 真源                                      | 缺失时          |
| ---------------------------------------- | ----------------------- | ----------------------------------------- | --------------- |
| `COMMAND_DELIVERY_TTL_MS`                | 指令投递 TTL            | `apps/api/src/commands/config.ts`         | `30000`         |
| `COMMAND_ACK_TIMEOUT_MS`                 | 指令 ACK 超时           | `apps/api/src/commands/config.ts`         | `15000`         |
| `COMMAND_RETRY_INTERVAL_MS`              | 指令重试间隔            | `apps/api/src/commands/config.ts`         | `5000`          |
| `COMMAND_MAX_RETRIES`                    | 指令最大重试            | `apps/api/src/commands/config.ts`         | `2`             |
| `ROUTER_CONFIG_WAIT_MS`                  | 路由配置等待            | `packages/node/src/nodes/config-sync.ts`  | `800`           |
| `WATCHER_CONFIG_WAIT_MS`                 | watcher 配置等待        | `packages/node/src/nodes/config-sync.ts`  | `300`           |
| `CONFIG_PUBLISH_COOLDOWN_MS`             | config 发布冷却         | `packages/node/src/nodes/config-sync.ts`  | `10000`         |
| `FILE_LOCK_STALE_MS`                     | 文件锁过期              | `apps/api/src/fs/atomic.ts`               | `30000`         |
| `CONVERSATION_MAX_TURNS`                 | 会话上下文长度          | `apps/api/src/chat/conversation-store.ts` | `20`            |
| `ALERT_COOLDOWN_RESERVATION_TTL_SECONDS` | 告警保留 TTL            | `apps/api/src/alerts/push.ts`             | `7200`          |
| `DIGEST_ENABLED`                         | 早晚简报开关            | `apps/api/src/settings/store.ts`          | `true`          |
| `DIGEST_MORNING_HOUR`                    | 晨报小时                | `apps/api/src/settings/store.ts`          | `7`             |
| `DIGEST_EVENING_HOUR`                    | 晚报小时                | `apps/api/src/settings/store.ts`          | `20`            |
| `DIGEST_TIMEZONE`                        | 简报时区                | `apps/api/src/settings/store.ts`          | `Asia/Shanghai` |
| `STT_APP_KEY` / `STT_APP_ID`             | 阿里云 NLS 密钥（可选） | `apps/api/src/settings/store.ts`          | 无              |
| `MQTT_WATCH_TOPIC`                       | MQTT 订阅 topic 覆盖    | `apps/api/src/mqtt/event-subscriber.ts`   | 默认订阅        |

## 17. 部署平台注入（非常规配置）

| 变量                       | 注入方         | 消费方                                                      |
| -------------------------- | -------------- | ----------------------------------------------------------- |
| `VERCEL`                   | Vercel build   | `scripts/build-vercel-output.ts`                            |
| `VERCEL_URL`               | Vercel runtime | `apps/api/src/routes/integration.ts`（CORS 默认推导）       |
| `VERCEL_ENV`               | Vercel runtime | `deploy/vercel/server.ts`                                   |
| `AWS_LAMBDA_FUNCTION_NAME` | AWS Lambda     | `deploy/vercel/vercel-function.ts`（检测部署环境）          |
| `WEB_BASE`                 | 部署 env       | `scripts/generate-node-label.ts`（节点标签二维码 base URL） |

## 18. 评测与脚本调优

| 变量                                     | 消费方                       | 真源                                 | 缺失时  |
| ---------------------------------------- | ---------------------------- | ------------------------------------ | ------- |
| `SIM_MATRIX_WECHAT_MIN_PASS_RATE`        | wechat matrix 门禁           | `scripts/verify-intent-gate.sh`      | `0.9`   |
| `SIM_MATRIX_NEGATIVE_MIN_PASS_RATE`      | negative matrix 门禁         | `scripts/verify-intent-gate.sh`      | `1.0`   |
| `INTENT_PROMOTE_WECHAT_ALLOW_SERVERLESS` | failure 推广 serverless 旁路 | `scripts/promote-intent-failures.ts` | `false` |

---

_本表随代码演进；发现漂移时请改真源文件并同步更新此索引，不要只改对话记忆。_
_自动同步检查：`npx tsx scripts/check-env-keys.ts`（lint gate 一部分）_
