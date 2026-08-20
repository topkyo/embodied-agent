# Web Session 鉴权与本地调试

> **真源**：实现以代码为准；本文是运维/调试手册，避免把「登录成功但平台 401」误判为配置损坏。

| 代码                                                                                       | 职责                                                                                                         |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| [`apps/api/src/auth/web-session/`](../../apps/api/src/auth/web-session/)                   | 账号、cookie、session、invite、bootstrap                                                                     |
| [`apps/api/src/routes/admin-auth.ts`](../../apps/api/src/routes/admin-auth.ts)             | `requireAdmin` / `requireOperator`                                                                           |
| [`apps/web/src/layouts/SceneOpsLayout.tsx`](../../apps/web/src/layouts/SceneOpsLayout.tsx) | 场景壳 active_domain 门闩（公开 catalog）                                                                    |
| [`apps/web/src/api/admin-fetch.ts`](../../apps/web/src/api/admin-fetch.ts)                 | 工作台 fetch：`credentials: "include"`，**不**默认塞 `x-admin-token`                                         |
| 端点表                                                                                     | [`docs/operations/admin-routes.zh.md`](admin-routes.zh.md) §认证 / §鉴权矩阵                                 |
| 环境变量                                                                                   | [`docs/operations/env-keys.zh.md`](env-keys.zh.md) §5（`SESSION_SECRET`、`WEB_INSTALL_CODE`、`ADMIN_TOKEN`） |

---

## 1. 认证模型（当前）

```text
bootstrap(安装码 + 邮箱密码)  →  首个 admin
admin 创建邮箱账号 / 发邀请码
invite 兑换(邮箱 + 密码)     →  user 或 admin
邮箱密码登录                 →  ea_session cookie（唯一 durable 重登路径）
微信扫码                     →  仅通道 bind，不是 Web 登录
```

| 规则    | 说明                                                                           |
| ------- | ------------------------------------------------------------------------------ |
| 两角色  | `admin` \| `user`；`?role=installer` 已废止                                    |
| Session | Cookie 名 `ea_session`；默认 TTL **15 分钟**；无滑动续期                       |
| 密码    | 最少 **8** 位；bootstrap / invite redeem / create / reset 均校验               |
| 微信    | 绑定链在 platform-bindings + wechat-ilink；与 Web 账号无 `wechat_user_id` 耦合 |
| 多实例  | 微信扫码 bind 会话是**进程内**状态；`STATE_BACKEND=redis` 时 start 直接失败    |

---

## 2. 鉴权分层

实现：`requireAdmin`、`requireOperator`（[`apps/api/src/routes/admin-auth.ts`](../../apps/api/src/routes/admin-auth.ts)）。

| 辅助函数            | 通过条件                                              | 典型用途                                                                                                                  |
| ------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `requireAdmin`      | admin session **或** `x-admin-token` **或** demo 只读 | 平台配置、写路径、admin-only 列表                                                                                         |
| `requireOperator`   | 任意 web session **或** admin / token                 | 场景总览、节点列表只读、readiness；运行状态三只读：`GET /admin/alert-rules`、`/admin/report-schedules`、`/admin/commands` |
| `requireWebSession` | 任意有效 web session                                  | 微信 bind start/status                                                                                                    |
| 公开                | 无 cookie                                             | `/health`、`/domain-packs`、`/auth/email`、`/auth/bootstrap*`                                                             |

### 2.1 前端门闩（避免再踩坑）

| 页面 / 能力                         | 前端依赖                                                                                                                     | 需要角色                                                                       |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `/login`                            | `/auth/*`                                                                                                                    | 无                                                                             |
| 登录后默认入口                      | **匿名直接访问** → `/start`（领域选择）；`state.from` 存在（RequireAuth 重定向）→ 保留原路径                                 |                                                                                |
| `/start`                            | **公开** `GET /domain-packs`；登录用户可见三张可加载 Domain Pack 卡与当前 active_domain                                      | 任何角色；admin 多一条"进入平台底座 →"                                         |
| `/start/wechat`                     | **公开** `GET /domain-packs`；绑定须 **session** 的 `user_id`（或 admin 代绑 `?principal=`）                                 | 未登录显示「先登录」；网页内 pack picker 可即时切 `?pack={slug}` 渲染对应域 QR |
| 场景 ops 顶栏「换领域 →」           | 链到 `/start`（领域选择）；不是 `/start/wechat?no_redirect=1`                                                                |                                                                                |
| 场景 ops 顶栏「绑定微信」           | 链到 `/start/wechat?no_redirect=1`，**不要**链 `scenePath`（`/scenes/greenhouse` 等在 apps/web 已 404，营销页在 site :5170） |                                                                                |
| 微信开始跳转                        | `?no_redirect=1`：进页**已绑定**不自动跳（方便重绑）；**扫码/重绑成功**仍自动进 ops/平台                                     | 默认无 query：已绑定或扫码成功均自动跳                                         |
| 微信 bind 组件                      | `principalUserId` 来自 session；autoStart 等 principal 就绪后再扫码                                                          | 避免 auth 未加载时 sticky「缺少 principal」错误                                |
| 场景 ops 壳（总览/设备）            | **公开** `GET /domain-packs` 判 active_domain                                                                                | **任意**已登录 user/admin                                                      |
| 场景总览数据                        | `GET /admin/overview`（operator）                                                                                            | 任意 web session                                                               |
| 设备列表                            | `GET /admin/nodes`（operator）；发码/绑定仍 admin                                                                            | 读：session；写：admin                                                         |
| 运行状态（只读）                    | `GET /admin/alert-rules`、`/admin/report-schedules`、`/admin/commands`（operator）                                           | 任意 web session                                                               |
| 平台底座 `/ops/platform`            | admin session + `/admin/settings` 等                                                                                         | **仅 admin**                                                                   |
| 领域 admin catalog / readiness 详情 | `GET /admin/domain-packs`                                                                                                    | **仅 admin**（壳层不依赖它）                                                   |

**登录后动线（memory）**：

```
匿名 → /login （无 state.from）  → 登录成功 → /start（领域选择）
匿名 → /login?state.from=/scenes/{slug}/ops/...  → 登录成功 → 回到原 ops 路径
/ops/platform?from=* 被拒绝  → AccessGate / SceneOpsPlatformDenied → state.from `${opsPath}/platform`，否则 /start
/scenes/{slug}/ops （非 active_domain）  → SceneOpsDisabled reason="inactive_domain" →  返回 /start
/scenes/{slug}/ops （admin-only 页 user 角色）  → AccessGate reason="role_insufficient" → 返回 ops
```

**错误对照**

| UI 文案 / 现象                               | 常见原因                                                                                        |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 读取平台配置失败 / `unauthorized`（旧）      | 曾用 admin API 做壳门闩；现应已改为 catalog 公开。若仍见，检查是否命中 platform 页且账号是 user |
| 「需要管理员权限」                           | 已登录但 `role !== admin`，进了平台底座                                                         |
| 运行状态 `unauthorized` / 阈值·计划·指令拉空 | 无有效 session，或旧 API 仍按 admin 拦截；应任意 web session 可读上述三条 GET；写路径仍 admin   |
| 读取领域 catalog 失败                        | API 未起、代理错、`/domain-packs` 非 200                                                        |
| 登录后 15 分钟掉线且无法重登                 | 账号无邮箱密码（旧 invite）；须用带 email+password 的 redeem/bootstrap                          |
| 顶栏 `BLOCKED · Transport`                   | **与 user/admin 角色无关**；见下节运维表                                                        |

### 2.2 本地 ops 顶栏 BLOCKED 运维（greenhouse）

| 症状                            | 处理                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `BLOCKED · Transport`           | `mqtt_publisher.connected !== true`：确认 aedes :1883、`mqtt_url`，必要时重启 API；`ENSURE_SIM_DUAL_FORCE_REBIND=1 npm run ensure:sim-dual`                                                                                                                                                                                                                                                                                    |
| `invalid or missing node_token` | 旧 sim 进程 token 过期：停掉 node-simulator 后 force rebind 再起双棚 sim                                                                                                                                                                                                                                                                                                                                                       |
| `BLOCKED · Sim Matrix *`        | 报告过期（默认 7 天）或未签名。生成：`EVAL_EVIDENCE_SECRET=…`（与 API 用同一值） + `cd /home/tim/project/EA && set -a; source .env.vps.local; set +a` 后跑 `SIM_MATRIX_SLICE=core\|wechat\|negative npx tsx scripts/simulate-user-matrix.ts`。生产 VPS 完整步骤 + cron 续签建议见 [`deploy/vps/TROUBLESHOOTING.zh.md`](../../deploy/vps/TROUBLESHOOTING.zh.md) §1.2。注意：**签报告与跑 API 须同一 secret** 才 `attested=true` |

**何时需要跑 `sim:matrix`：** 仅当要清顶栏 Sim Matrix 红灯、做交付 / attested 证据、或报告过期续签时。日常开发、功能验收、设备联调、微信 tip 走查等 **不必** 跑（真 LLM，费额度）；顶栏红灯可忽略，不影响聊天 / tip / 节点在线判定。节点「未在线」看 heartbeat 与 `node_token`（上表），与 matrix 无关。

快速验收：

```bash
curl -sS -H 'x-admin-token: dev-admin' http://127.0.0.1:3001/admin/status | jq .mqtt_publisher
curl -sS -H 'x-admin-token: dev-admin' http://127.0.0.1:3001/admin/platform/readiness | jq '{ready, fails:[.checks[]|select(.ok==false)|.id]}'
```

交付证据细节见 [`docs/operations/llm-model-selection.zh.md`](llm-model-selection.zh.md)、[`docs/eval/chat-verify.zh.md`](../eval/chat-verify.zh.md)。

---

## 3. 运行数据位置

| Profile    | 账号文件                                                       |
| ---------- | -------------------------------------------------------------- |
| greenhouse | `.agentstack/dev-profiles/greenhouse/data/auth/web-users.json` |
| robot      | `.agentstack/dev-profiles/robot/data/auth/web-users.json`      |
| industrial | 同上 industrial                                                |

字段要点：`bootstrap_redeemed`、`users[].role`、`users[].email`、`password_hash`（scrypt）。**不要**提交该文件。

Session 存储：默认本地 ephemeral / 文件；`STATE_BACKEND=redis` 时走 Redis（与微信扫码进程内会话不同）。

### 3.1 本地固定账号（各场景共用）

本机验收 / 手工走查 **只使用** 这一对账号（greenhouse / robot / industrial 同邮箱同密码）。不要每次临时生成。

| 角色  | 邮箱                | 密码          |
| ----- | ------------------- | ------------- |
| admin | `admin@example.com` | `admin-pass1` |
| user  | `user@example.com`  | `user-pass1`  |

重置（清空该 profile 其它 web 账号，仅保留上表两行）：

```bash
npx tsx scripts/seed-local-web-users.ts              # 三个 scene 全写
npx tsx scripts/seed-local-web-users.ts --scene industrial
```

E2E 仍可通过 `/auth/dev/create-user` 自建临时账号；跑完可再 seed 收口。

---

## 4. 本地调试手册

### 4.1 前置

```bash
npm run dev:greenhouse -- --no-monitor   # 或 robot / industrial
npm run dev:status                       # 确认 API :3001、Web :5173
```

Web 经 Vite 代理：`/auth`、`/admin`、`/domain-packs` → `VITE_API_PROXY`（默认 `http://127.0.0.1:3001`）。

### 4.2 快速诊断矩阵

```bash
# 1) 公开 catalog（壳层依赖）
curl -sS http://127.0.0.1:3001/domain-packs | head -c 400; echo

# 2) 邮箱登录拿 cookie（固定 admin，见 §3.1）
curl -sS -D - -o /tmp/login.json -X POST http://127.0.0.1:3001/auth/email \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"admin-pass1"}'
# 从 Set-Cookie 取 ea_session=... 段

COOKIE='ea_session=....'   # 填入实际值（含签名段）

# 3) 角色
curl -sS http://127.0.0.1:3001/auth/me -H "Cookie: $COOKIE"; echo

# 4) 平台配置（仅 admin）
curl -sS -w '\nHTTP %{http_code}\n' http://127.0.0.1:3001/admin/settings \
  -H "Cookie: $COOKIE" | head -c 200; echo

# 5) 场景只读（任意 session）
curl -sS -w '\nHTTP %{http_code}\n' http://127.0.0.1:3001/admin/overview \
  -H "Cookie: $COOKIE" | head -c 200; echo

# 6) 运行状态只读（任意 session；user 也应 200）
curl -sS -w '\nHTTP %{http_code}\n' 'http://127.0.0.1:3001/admin/commands?limit=5' \
  -H "Cookie: $COOKIE" | head -c 200; echo

# 7) readiness / Transport 探针（任意 session；BLOCKED 与角色无关）
curl -sS http://127.0.0.1:3001/admin/platform/readiness -H "Cookie: $COOKIE" \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); print("ready=", d.get("ready")); [print(c) for c in d.get("checks",[]) if "transport" in c.get("id","") or c.get("label")=="Transport"]' 2>/dev/null || head -c 400; echo

# 8) 脚本/CI 仍可用 token（工作台浏览器不依赖）
curl -sS -H 'x-admin-token: dev-admin' http://127.0.0.1:3001/admin/settings | head -c 200; echo
```

| `/auth/me` role | `/admin/settings` | `/admin/overview` | `/admin/commands` 等运行状态只读 | 预期 UI                            |
| --------------- | ----------------- | ----------------- | -------------------------------- | ---------------------------------- |
| admin           | 200               | 200               | 200                              | 平台底座 + 全导航                  |
| user            | **401**           | 200               | 200                              | 总览/设备/运行状态可用；平台拒绝页 |
| 无 cookie       | 401               | 401               | 401                              | 跳转登录                           |

### 4.3 创建 admin（本地）

**A. bootstrap（正式路径）**

1. 启动 API 前配置（示例）：

```bash
export WEB_INSTALL_CODE='local-install'
export SESSION_SECRET='dev-session-secret'   # 生产必配
```

2. `GET /auth/bootstrap-status` → `{ available: true, ... }` 时，`/login` 显示安装码 tab。
3. Body 须含 **email + password**（≥8）+ `install_code`。

**B. dev 快捷建号（仅 `NODE_ENV=development|test`）**

```bash
curl -sS -X POST http://127.0.0.1:3001/auth/dev/create-user \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"admin-pass1","role":"admin","display_name":"Local Admin"}'
```

生产与 `registerWebAuthDevRoutes` 关闭时此路由不存在。

**C. 邀请**

admin session → `POST /auth/invite` → 用户在 `/login?invite=<token>` 填邮箱密码兑换。

### 4.4 常见故障

| 现象                                              | 检查                                                                                              |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `invalid_credentials`                             | 密码错；或账号无 `password_hash` / 无 email                                                       |
| bootstrap `available: false` 且 `redeemed: false` | 未设 `WEB_INSTALL_CODE`                                                                           |
| bootstrap `bootstrap_already_redeemed`            | 已有 admin 或 `bootstrap_redeemed`                                                                |
| 登录成功但平台 401                                | `role` 是 user；用 admin 登录或升权                                                               |
| 运行状态页阈值/计划/指令 401                      | 无 cookie 或 session 失效；这三条 GET 应为 `requireOperator`（任意 session），不是 admin-only     |
| 顶栏 `BLOCKED · Transport`（admin/user 皆然）     | readiness `mqtt_transport` 未通过：MQTT publisher 未连接；与角色无关，需起 broker 并保证 API 已连 |
| Cookie 登录后 me 仍 unauthenticated               | 跨源未走 Vite 代理；或 `SESSION_SECRET` 重启后变了导致旧 cookie 失效                              |
| 微信 bind 503 / 多实例                            | `STATE_BACKEND=redis` 与进程内 QR 会话冲突                                                        |
| 设备页无发码按钮                                  | 当前是 user（预期）；admin 才有写操作                                                             |

### 4.5 相关自动化测试

```bash
npm run test -w @embodied-agent/api -- \
  src/auth/web-session/web-session.test.ts \
  src/routes/admin-auth.test.ts
```

覆盖：email 登录、bootstrap 须邮箱密码、invite redeem 须凭证、user 可读 overview/不可读 settings、`requireOperator` 等。

### 4.6 E2E：造 admin / user session 与绑定契约

**Cookie session 工厂**（Playwright）：`tests/e2e/helpers/web-auth.ts`

```bash
# 逻辑（helper 内）：
# POST /auth/dev/create-user  →  role: admin|user
# POST /auth/email            →  Set-Cookie: ea_session
# context.addCookies([{ name: "ea_session", value, url: E2E_BASE_URL }])
```

| Helper                                          | 用途                                                    |
| ----------------------------------------------- | ------------------------------------------------------- |
| `seedWebSession(context, request, role, opts?)` | 注入 cookie；`emailPrefix` / `workerIndex` 做并行隔离   |
| `clearWebSession` / `reseedsWebSessionAs`       | 同 context 角色切换（先清 cookie 再 seed）              |
| `tests/e2e/helpers/wechat-bind.ts`              | 绑定 API：`waitForApiHealthy`、`apiWithSession`、中文壳 |

**门闩 dogfood（PR `@critical`）**：`tests/e2e/web-dogfood.spec.ts` — 清单由 `scripts/check-web-dogfood-critical.ts` 强制。

**绑定黄金路径（nightly，默认不标 PR critical）**：`tests/e2e/wechat-bind-golden.spec.ts`

- 匿名 `GET /admin/wechat/status` / `POST .../login/start` → 401
- user session 可读本人 status；他人 `session_key` poll → 403（当 session 存在且非本人发起）
- 已登录 UI 进入 `/start/wechat` 不掉登录页

环境：`E2E_API_URL` / `E2E_BASE_URL`；API 起服见 `scripts/e2e-api-server.sh`（含 ilink mock）。运维细节见本文 §1–2。

---

## 5. 与脚本 / CI 的边界

| 调用方                 | 推荐鉴权                                                 |
| ---------------------- | -------------------------------------------------------- |
| 浏览器工作台           | **仅** `ea_session` cookie（admin 或 user）              |
| `curl` / CI / 运维脚本 | `x-admin-token`（`ADMIN_TOKEN`；dev 默认可 `dev-admin`） |
| Demo 匿名只读          | `DEMO_READONLY=1` 白名单路径；写路径 403                 |

`VITE_ADMIN_TOKEN` 不再作为工作台主路径；遗留 `setAdminToken` 仅兼容脚本/测试注入。

---

## 6. 变更时必改清单

改鉴权行为时请同步：

1. 本文 + [`docs/operations/admin-routes.zh.md`](admin-routes.zh.md) 鉴权矩阵
2. [`AGENTS.md`](../../AGENTS.md) §Web UX 验证（环境前置）
3. `apps/api/src/auth/web-session/web-session.test.ts` / `admin-auth.test.ts`
4. 若新增公开门闩端点：确认 `SceneOpsLayout` 不再误调 admin-only API

---

## 7. D0 生产硬化 checklist

客户 deployment 工作台对外前，至少确认下列项（变量 → 消费方 → 缺失行为见 [`docs/operations/env-keys.zh.md`](env-keys.zh.md) §5；VPS 部署见 [`deploy/vps/README.zh.md`](../../deploy/vps/README.zh.md)）。

| #   | 项                         | 要求                                                                                                  | 失败观感                                |
| --- | -------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------- |
| 1   | **`SESSION_SECRET`**       | 生产**必设**强随机值；勿用 dev 内置默认；滚动 secret 会使旧 `ea_session` 全部失效                     | cookie 签不过、随机 401、登录后立刻掉线 |
| 2   | **禁默认 `dev-admin`**     | 生产 **`ADMIN_TOKEN` 必填且 ≠ `dev-admin`**；浏览器工作台主路径只用 `ea_session`，token 仅脚本/CI     | 公网猜中默认 token 即可调 admin API     |
| 3   | **禁误开 `DEMO_READONLY`** | 客户 deployment **不要**设 `DEMO_READONLY=1`；该模式仅 demo/营销栈（且生产语义下还须 `DEMO_STACK=1`） | 匿名可读 overview 等白名单只读面        |
| 4   | **安装码 / bootstrap**     | 若仍要首装路径：生产显式 `WEB_INSTALL_CODE`；bootstrap 兑换后关闭入口                                 | 任意人可领首个 admin                    |
| 5   | **数据与密钥**             | `AGENT_DATA_DIR` 持久化；`LLM` / 集成密钥不进镜像与仓库；勿提交 `auth/web-users.json`                 | 密钥泄漏或账号文件被覆盖                |

快速自检（部署机）：

```bash
# 生产应失败或未设置；本地 dev 才可看到默认
test -n "$SESSION_SECRET" && echo "SESSION_SECRET=set" || echo "FAIL: SESSION_SECRET missing"
test -n "$ADMIN_TOKEN" && test "$ADMIN_TOKEN" != "dev-admin" && echo "ADMIN_TOKEN=ok" || echo "FAIL: ADMIN_TOKEN weak/default"
test "${DEMO_READONLY:-}" != "1" && echo "DEMO_READONLY=off" || echo "FAIL: DEMO_READONLY is on (demo-only)"
```

自动化 env 阻断（K3）进 D0.1 backlog；本清单是 D0 人工 / runbook 门闩。
