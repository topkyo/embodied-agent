# 当前实现架构

本文件描述当前实现，不记录旧架构兼容路径。历史 greenhouse-first、all-in-one tmux、旧字段和旧运行态材料见 [`../archive/README.zh.md`](../archive/README.zh.md)。

## 模块边界

```text
apps/api
  Fastify API、chat pipeline、admin、Domain Pack runtime adapter、MQTT 订阅、jobs
apps/web
  平台运维台、场景工作台、绑定与演示页面
deploy
  Vercel 等平台部署适配；不承载业务 API 源码
packages/core
  平台协议、schema、Domain Pack contract
packages/agent
  LLM intent runtime、prompt、升格、失败样本飞轮
packages/node
  Scene Node registry、pairing、token、config sync
packages/platform
  data root、deployment path、MQTT topic、logger、atomic/file-lock
packages/memory
  command / intent failure journal backends
packages/runtime
  Domain Pack catalog、active pack resolution、physical dispatch facade、readiness、eval evidence、service injection facade
packages/chat-runtime
  对话 pipeline 编排（pending-confirm、路由、回复），与 API 薄壳解耦
packages/channel-runtime
  通道注册与入站消息标准化
packages/alert-runtime
  阈值 breach 评估与 sustained alert 扫描逻辑
packages/domain-sdk
  Domain Pack helper API（`defineDomainPackCore`、`assembleDomainPackContract`）与 conformance 校验
packages/safety
  deterministic guard
scenes/*
  Domain Pack 实现
tests/e2e
  Playwright 端到端冒烟与 dogfood 测试
```

`packages/runtime` 加载 catalog 中的单个 active Domain Pack，并提供 physical dispatch、pre-dispatch、skill handler、readiness、eval evidence、ops schema 与 capability facade。`apps/api/src/domain-packs/` 在 API 侧组装 contract-first 运行视图（含 PlatformHost），只保留 loader、catalog、services 注册、admin-extensions、ops-control capability 查找与 route 薄层（≤10 个实现文件）；re-export shim 已删除，业务逻辑直引 `@embodied-agent/runtime`。平台 domain services 与 pack-bound services（如 agriculture NDVI）分离，仅 active pack 声明的 `requiredServices` 在 preload 后注入并通过 `assertRequiredServices` 硬门禁。`apps/api` 不应深路径引用 `scenes/*` 的内部实现，除明确的 pack 入口外。

Domain Pack 作者真源为 `DomainPackCore + capabilities`：`packages/core/src/scene-contract.ts` 声明 contract 视图；monolithic `DomainPack` 类型已删除（由 `createDomainPackContract()` 取代）。scene pack 通过 `createDomainPackContract()` 导出，loader 只加载 contract，不接受 legacy `createDomainPack()`；contract gate 会验证 live pack 的 core、scene/ops/evidence capability、safety、readiness 和 command adapter。

新增 placeholder Domain Pack 使用 `npm run domain:new -- --id <id> --slug <slug> --transport mqtt|http`。脚本会生成 `scenes/{slug}` 骨架与 `scene/pack.test.ts` conformance 测试、登记 `domain-packs.json`，并更新 TypeScript references 与 workspace build 脚本；生成后运行 `npm install --package-lock-only` 更新 workspace lockfile。

## 启动与配置

关键环境变量：

| 变量             | 说明                                                             |
| ---------------- | ---------------------------------------------------------------- |
| `AGENT_DATA_DIR` | 运行数据根。未设置时默认 `.agentstack/dev-profiles/default/data` |
| `DEPLOYMENT_ID`  | 当前 deployment。生产必须显式配置                                |
| `ACTIVE_DOMAIN`  | 当前 active Domain Pack。生产必须显式配置单值                    |
| `MQTT_URL`       | MQTT broker                                                      |
| `ADMIN_TOKEN`    | Admin API token。生产不能使用 `dev-admin`                        |
| `STATE_BACKEND`  | `file` 或 `redis`                                                |
| `COMMAND_STORE`  | `file` 或 `sqlite`                                               |

`settings.json` 可配置 `deployment_id`、`active_domain`、LLM、MQTT、通知、Domain Pack 配置。缺失关键配置时应失败可见。

**Settings 保存门禁（admin API）：** 切换 `active_domain` / 保存 `domain_configs` 仅校验 config + registry；MQTT-required pack 切换时校验有效 `mqtt_url`。Transport 连接态在 runtime readiness 展示，不阻断 settings 冷启动。`mqtt_url` 变更后 API 内重连 MQTT 订阅（`restartMqttSubscribers`）。详见 [`platform-runtime.zh.md`](platform-runtime.zh.md) §运维门禁。

## 本地 Profile

```bash
npm run dev:greenhouse
npm run dev:robot
npm run dev:industrial
npm run dev:greenhouse -- --no-monitor
npm run dev:robot -- --no-monitor
npm run dev:industrial -- --no-monitor
```

Profile 数据：

```text
.agentstack/dev-profiles/{greenhouse|robot|industrial}/data
```

服务 PID 和日志：

```text
.agentstack/dev-services/{scene}/
```

飞轮：

```bash
npm run domain:flywheel
```

飞轮由当前 active Domain Pack 的 `flywheelGate.adapterModule` 决定。agriculture 默认使用 `.agentstack/dev-runs/domain-flywheel/agriculture/data` 并启动 greenhouse 验证栈和临时双棚模拟器；它不是独立本地场景 profile。

## 数据与 Memory

运行数据根：

```text
{AGENT_DATA_DIR}/
├── settings.json
├── device-registry.json
├── users.json
├── platform-bindings.json
└── deployments/{deployment_id}/
    ├── command-logs.jsonl
    ├── telemetry-state.json
    ├── pending-confirm.json
    ├── pending-clarification.json
    ├── conversation-history.json
    ├── digest-state.json
    ├── alert-rules.json
    ├── alert-cooldown.json
    ├── sustained-anomaly-state.json
    └── scene-outcomes.jsonl
```

当前实现只读当前 key 和 deployment-scoped 文件。旧 alert key、旧 sustained key、旧农场用户字段专用兼容响应不再保留。

## 对话执行链

```text
request
  → auth / binding / user context
  → pending-confirm 或 pending-clarification
  → LLM intent resolve
  → schema validation
  → schema repair / clarification 后的 active Domain Pack structural override
  → route table / pre-dispatch
  → safety guard
  → physical or non-physical handler
  → operation log / command record / reply
```

物理动作必须进入 command lifecycle。查询类可由 Domain Pack handler 直接读取 telemetry、settings 或外部 API。

## 后台任务

入口：`apps/api/src/jobs/start.ts`。Capability 守卫与 `active_domain` 切换后的 `restartDomainCapabilitySchedulers()` 见 [`platform-runtime.zh.md`](platform-runtime.zh.md) §运维门禁。

告警推送使用 `reserveAlertCooldown` → 发送 → `confirmAlertFiredResilient`；eval/sim 脚本从 `@embodied-agent/runtime` 导入 readiness 与 matrix evidence 符号（无 API shim）。

## Node 与 MQTT

Topic：

```text
deployments/{deployment_id}/nodes/{node_id}/config
deployments/{deployment_id}/nodes/{node_id}/commands
deployments/{deployment_id}/nodes/{node_id}/events
deployments/{deployment_id}/nodes/{node_id}/telemetry
deployments/{deployment_id}/nodes/{node_id}/heartbeat
```

要求：

- 注册节点必须有 `node_token`。
- topic 的 `deployment_id` / `node_id` 必须与 payload 一致。
- `command_event` 必须匹配原 command 的 `deployment_id`、`node_id`、`device_id`、`idempotency_key`。
- 不保留无 token 或 topic/payload 不一致的兼容路径。

## Domain Pack 示例

Greenhouse 是 `agriculture` pack：

- P0/P1：查询、通风、风机、灌溉、报警、报告。
- L3/L4：高温、高湿、夜间通风、灌后通风、设备诊断、outcome、ROI。
- 验证：显式运行 `SIM_MATRIX_SLICE=core npm run sim:matrix`、`SIM_MATRIX_SLICE=wechat npm run sim:matrix`、`SIM_MATRIX_SLICE=negative npm run sim:matrix`，并通过 `npm run sim:matrix:evidence`，再跑 `npm run verify:chat`、`npm run domain:chat-verify -- --pack agriculture`、`npm run domain:flywheel`。

Robot 是 `robotics` pack：

- M20 查询和控制。
- 需要 `settings.domain_configs.robotics.m20_base_url`、`default_robot_id`、`waypoints`。
- 验证：`npm run robot:matrix`、`npm run domain:chat-verify -- --pack robotics`、`npm run domain:flywheel`。

Industrial 是 `industrial` pack：

- 过温排风：温度查询、二次确认、排风启动/停止、指令状态查询。
- 需要 `settings.domain_configs.industrial.default_cabinet_id`，registry 中显式配置 cabinet、温度传感器和 `default_for: "exhaust_fan"` 的 fan。
- 验证：`AGENT_DATA_DIR=scripts/fixtures/ci-industrial-eval npm run domain:chat-verify -- --pack industrial`、`AGENT_DATA_DIR=scripts/fixtures/ci-industrial-eval npm run domain:flywheel`。

这些文档和测试是 Domain Pack 示例与验证材料，不是平台架构真源。
