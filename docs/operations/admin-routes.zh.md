# Admin API 参考

配置台与运维脚本使用的 HTTP 端点。

**鉴权总览（调试必读）**：完整模型与 curl 手册见 [`docs/operations/web-session.zh.md`](web-session.zh.md)。

| 方式       | 说明                                                                            |
| ---------- | ------------------------------------------------------------------------------- |
| Web 工作台 | `credentials: "include"` 携带 `ea_session` cookie；**不**默认带 `x-admin-token` |
| 脚本 / CI  | 请求头 `x-admin-token: <ADMIN_TOKEN>`（本地 dev 默认可 `dev-admin`）            |
| 公开       | `/health`、`GET /domain-packs` 等；见下「公开端点」                             |

实现分散在：

- `apps/api/src/routes/admin/` — 主体
- `apps/api/src/routes/admin-auth.ts` — `requireAdmin` / `requireOperator`
- `apps/api/src/routes/wechat-admin.ts` — 微信扫码绑定
- `apps/api/src/routes/intent-failures-admin.ts` — 意图失败飞轮
- `apps/api/src/auth/web-session/` — Web 账号与 session

## 鉴权矩阵（`/admin/*` 与相关）

| 类别                 | 鉴权                                                     | 示例路径                                                                                                                                                   |
| -------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 平台写 / 配置读      | `requireAdmin`（admin session 或 token）                 | `GET/PUT /admin/settings`、`GET /admin/domain-packs`、节点绑定写、invite 管理                                                                              |
| 场景只读             | `requireOperator`（**任意** web session 或 admin/token） | `GET /admin/overview`、`GET /admin/nodes`、`GET /admin/platform/readiness`、`GET /admin/commands`、`GET /admin/alert-rules`、`GET /admin/report-schedules` |
| 微信 bind            | web session；非 admin 强制本人 principal                 | `POST /admin/wechat/login/start`、`GET .../status`                                                                                                         |
| 微信状态             | admin=全量；任意 session=本人精简                        | `GET /admin/wechat/status`                                                                                                                                 |
| 场景壳 active_domain | **公开** `GET /domain-packs`（前端 `SceneOpsLayout`）    | 不依赖 admin settings                                                                                                                                      |

**user 登录后进平台底座 401 是预期**（需 admin）；进总览/设备/运行状态只读应成功。

**顶栏 `BLOCKED · Transport`**：来自 `GET /admin/platform/readiness` 的 `mqtt_transport` 探针（`label=Transport`），与 user/admin **角色无关**；需 MQTT publisher 已连接，admin 也会看到同一状态。详见 [`docs/operations/web-session.zh.md`](web-session.zh.md) 错误对照。

## 设置与状态

| 方法   | 路径                           | 说明                                                                                                                               |
| ------ | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/admin/settings`              | 读取公开配置（Key 脱敏）；**admin**                                                                                                |
| PUT    | `/admin/settings`              | 保存 LLM/STT/MQTT、坐标、通知总闸与 active Domain Pack 显式配置；**admin**；见下表 **Settings 保存门禁**                           |
| GET    | `/admin/status`                | API/MQTT/LLM 就绪状态；**admin**                                                                                                   |
| GET    | `/admin/overview`              | 控制台总览；**任意 web session**（`requireOperator`）；实体遥测在 `entities[].telemetry`，`stale` 默认 90s（`TELEMETRY_STALE_MS`） |
| GET    | `/admin/domain-packs`          | catalog + active pack readiness/`capabilities`；**admin**（壳层用公开 `/domain-packs`）                                            |
| GET    | `/admin/deployments`           | 注册表 deployment 列表 + 活跃 `deployment_id`；**admin**                                                                           |
| POST   | `/admin/geo/locate`            | 网络定位或 `unlock` 取消手动坐标；**admin**                                                                                        |
| GET    | `/admin/settings/tokens`       | admin token 列表（脱敏）；**admin**                                                                                                |
| POST   | `/admin/settings/tokens`       | 新增 admin token（`{ name, token? }` 或 `{ name, generate: true }`）；明文仅返回一次；**admin**                                    |
| DELETE | `/admin/settings/tokens/:name` | 删除指定 admin token；**admin**                                                                                                    |
| GET    | `/admin/platform/readiness`    | readiness 全量探针 + MQTT publisher；**任意 web session**（`requireOperator`）                                                     |

### Settings 保存门禁（`PUT /admin/settings`）

| 字段             | 行为                                                                                                                                                      |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `active_domain`  | 须为 catalog 中 `live` pack；`assertRequiredServicesForPack`；**仅** config/registry readiness 阻断；MQTT-required pack 须已有或同请求提供非空 `mqtt_url` |
| `domain_configs` | 只能写入当前（或同请求指定的）`active_domain` 键                                                                                                          |
| `mqtt_url`       | `body.mqtt_url !== undefined` 时写入（含 `""`，非 MQTT pack 可清空）；MQTT-required pack 禁止空值；变更后 API **自动** `restartMqttSubscribers()`         |
| 其他字段         | 不跑 domain readiness；transport 连接态见 `GET /admin/status` 的 `mqtt_publisher`                                                                         |

切换 `active_domain` 会 `syncActivePackBoundDomainServices` 并 `restartDomainCapabilitySchedulers()`（digest / weather / NDVI）。

## Domain Pack 运维（schema 驱动）

| 方法 | 路径                            | 说明                                                                                                               |
| ---- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| POST | `/admin/domain/intents`         | Body `{ intent, confirmed? }`；按 active pack `intentSchemas` 解析并路由；需确认时 `409` + `requires_confirmation` |
| POST | `/admin/domain/control-actions` | Body `{ action_id, confirmed? }`；按 ops schema `control.actions` 编译 intent 并路由；admin 上下文注入 MQTT        |

实现：`apps/api/src/routes/admin/domain-intents.ts`、`apps/api/src/domain-packs/admin-route-context.ts`、`apps/api/src/domain-packs/ops-control.ts`。

## 指令与注册表

| 方法 | 路径                                     | 说明                                                                                    | 鉴权                             |
| ---- | ---------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------- |
| GET  | `/admin/commands?limit=50`               | 最近指令列表                                                                            | **operator**（任意 web session） |
| GET  | `/admin/commands/:command_id`            | 单条指令详情                                                                            | **operator**（任意 web session） |
| GET  | `/admin/registry`                        | 设备注册表                                                                              | **admin**                        |
| PUT  | `/admin/registry`                        | 保存注册表                                                                              | **admin**                        |
| GET  | `/admin/alert-rules?deployment_id=`      | 阈值规则；响应 `{ deployment_id, rules, count }`，规则使用平台字段 `entity_id`          | **operator**（任意 web session） |
| GET  | `/admin/report-schedules?deployment_id=` | 定时汇报计划；响应 `{ deployment_id, schedules, count }`，计划使用平台字段 `entity_ids` | **operator**（任意 web session） |

运行状态页（`ReadonlyOpsPanel`）依赖上表三条 **operator** GET；阈值/计划/指令的**写**仍走对话技能或 admin 路径，不在本表开放给 user session。

## 用户与绑定

| 方法   | 路径                         | 说明            |
| ------ | ---------------------------- | --------------- |
| GET    | `/admin/users`               | 现场用户列表    |
| POST   | `/admin/users`               | 创建/更新用户   |
| PUT    | `/admin/users/:user_id`      | 更新角色/显示名 |
| DELETE | `/admin/users/:user_id`      | 删除用户        |
| GET    | `/admin/bindings`            | IM 平台绑定列表 |
| POST   | `/admin/bindings`            | 直接绑定        |
| POST   | `/admin/bindings/issue-code` | 签发配对码      |
| POST   | `/admin/bindings/claim`      | 认领配对码      |

详见 [`../integrations/user-binding.zh.md`](../integrations/user-binding.zh.md)。

## Scene Node

| 方法     | 路径                            | 说明                                                |
| -------- | ------------------------------- | --------------------------------------------------- |
| GET      | `/admin/nodes?status=pending`   | 节点列表；**任意 web session**（`requireOperator`） |
| PUT      | `/admin/nodes/:node_id/binding` | 绑定 deployment/entity/device；**admin**            |
| POST     | `/admin/nodes/:node_id/pair`    | 生成安装码 + MQTT retained；**admin**               |
| GET/POST | `/admin/node-install-codes`     | 安装码列表/签发；**admin**                          |

详见 [`../protocol/esp32-node-registration.zh.md`](../protocol/esp32-node-registration.zh.md)。

## 卫星与 NDVI

| 方法 | 路径                       | 说明          |
| ---- | -------------------------- | ------------- |
| GET  | `/admin/satellite/ndvi`    | 地块与缓存    |
| POST | `/admin/satellite/refresh` | 手动刷新 NDVI |

## L3/L4 场景与试点

| 方法     | 路径                                     | 说明                    |
| -------- | ---------------------------------------- | ----------------------- |
| GET      | `/admin/scene-outcomes`                  | 当前 deployment outcome |
| GET      | `/admin/scene-outcomes/all?since_days=7` | 跨 deployment 聚合      |
| GET      | `/admin/pilot/roi?since_days=7`          | 试点 ROI 摘要           |
| GET/POST | `/admin/pilot/baseline`                  | 跑棚基线读写            |
| GET      | `/admin/policy-suggestions`              | 策略建议列表            |
| POST     | `/admin/policy-suggestions/:id/apply`    | 管理员采纳              |
| POST     | `/admin/policy-suggestions/:id/dismiss`  | 忽略建议                |

详见 [`../architecture/scene-layer.zh.md`](../architecture/scene-layer.zh.md)。

## 微信与意图飞轮

| 方法 | 路径                                                | 说明                                                                                                 |
| ---- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| GET  | `/admin/wechat/status`                              | iLink 连接状态；admin/`x-admin-token` 返回全量；任意 web session 返回与本人 principal 相关的精简状态 |
| POST | `/admin/wechat/login/start`                         | 启动扫码绑定；需 web session；非 admin 强制绑定本人 `user_id`；admin 可指定 `principal_user_id`      |
| GET  | `/admin/wechat/login/status`                        | 轮询扫码绑定结果；需 web session；非 admin 只能轮询本人发起的 `session_key`                          |
| GET  | `/admin/intent-failures`                            | 意图失败 inbox                                                                                       |
| POST | `/admin/intent-failures/:id/promote-wechat`         | 单条晋升                                                                                             |
| POST | `/admin/intent-failures/promote-wechat`             | 批量晋升任务                                                                                         |
| GET  | `/admin/intent-failures/promote-wechat/jobs/:jobId` | 轮询批量晋升任务状态                                                                                 |

默认关闭（含本地 dev）：须显式设置 `INTENT_PROMOTE_WECHAT_API=1` 才放行，否则 501。Vercel/serverless 还须同时设置 `INTENT_PROMOTE_WECHAT_ALLOW_SERVERLESS=1`（或 `true`）。生产 VPS 推荐用 CLI `npm run intent:failures:promote-wechat`。

## 飞轮触发（admin）

| 方法 | 路径                             | 说明                                                                                                  |
| ---- | -------------------------------- | ----------------------------------------------------------------------------------------------------- |
| POST | `/admin/flywheel/trigger`        | 按 active pack 的 `flywheelGate.adapterModule` 异步触发飞轮任务；返回 `{ job_id, status: "running" }` |
| GET  | `/admin/flywheel/status/:job_id` | 轮询飞轮任务状态（`running` / `completed` / `failed`）                                                |

## Dev 路由（非生产）

| 方法 | 路径                                          | 说明                             |
| ---- | --------------------------------------------- | -------------------------------- |
| POST | `/dev/chat`                                   | 直连聊天流水线                   |
| GET  | `/dev/flywheel/ready`                         | 飞轮就绪门闩（`FLYWHEEL_DEV=1`） |
| POST | `/dev/flywheel/weather-proactive/reset-dedup` | 重置天气推送去重                 |

## 公开端点

| 方法 | 路径                 | 说明                                                                           |
| ---- | -------------------- | ------------------------------------------------------------------------------ |
| GET  | `/health`            | 存活探针                                                                       |
| GET  | `/channels`          | 已注册聊天通道                                                                 |
| GET  | `/domain-packs`      | 运行时 catalog 精简视图（无 readiness 证据）；见上「公开 Domain Pack catalog」 |
| POST | `/integrations/chat` | 外部集成回调（`INTEGRATION_SECRET`）                                           |

## 认证端点

调试流程与故障表见 [`docs/operations/web-session.zh.md`](web-session.zh.md)。

| 方法 | 路径                     | 说明                                                                                                                               |
| ---- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| GET  | `/auth/bootstrap-status` | 返回 `{ available, redeemed }`；前端据此决定是否显示安装码 tab                                                                     |
| POST | `/auth/bootstrap`        | Body `{ install_code, email, password, display_name? }`；兑换首个 admin（须带邮箱密码以便后续登录）→ session cookie；密码至少 8 位 |
| POST | `/auth/email`            | Body `{ email, password }`；邮箱密码登录 → session cookie                                                                          |
| POST | `/auth/invite`           | 需 admin session；Body `{ role? }`；生成邀请 token（24h 有效）                                                                     |
| POST | `/auth/invite/redeem`    | Body `{ token, email, password, display_name? }`；兑换邀请并创建带邮箱密码的账号 → session cookie；密码至少 8 位                   |
| POST | `/auth/account/create`   | 需 admin session；Body `{ email, password, display_name?, role? }`；创建 Web 账号；密码至少 8 位                                   |
| POST | `/auth/account/password` | 需 admin session；Body `{ user_id, password, email? }`；设置/重置密码；账号无邮箱时必须带 `email`；密码至少 8 位                   |
| GET  | `/auth/accounts`         | 需 admin session；列出所有 Web 账号（不含 password_hash）                                                                          |
| GET  | `/auth/me`               | 需 session；返回当前用户 `{ user_id, role, display_name }`                                                                         |
| POST | `/auth/logout`           | 无需认证（best-effort）：有 session 则销毁并清除 cookie，始终返回 `{ ok: true }`                                                   |
| POST | `/auth/dev/create-user`  | **仅** `NODE_ENV=development\|test`；Body `{ email, password, role?, display_name? }`；本地快速建 admin/user                       |

## 公开 Domain Pack catalog（补充）

与上文「公开端点」中 `GET /domain-packs` 相同：无需鉴权；返回 `catalog` + `active_domain` + `deployment_id`。**场景工作台壳层**（`SceneOpsLayout`）用此判 active pack，勿要求 admin。
