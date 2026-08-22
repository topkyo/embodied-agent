# Domain Pack Delivery Kit

本文件定义新增 Domain Pack 的最小交付门禁。目标是让新场景按平台底座复制，而不是靠复制 greenhouse 或 robot 的隐性约定。

## 官方复制起点（推荐）

新领域按以下顺序上手，不要从 `scenes/greenhouse` 整包复制：

1. **生成骨架**：`npm run domain:new -- --id <id> --slug <slug> --transport mqtt|http`
   - 产出 placeholder pack、`scene/pack.test.ts` conformance 测试、`domain-packs.json` 登记。
2. **对照最小可加载模板**（catalog `status: live` 表示 Runtime 可启用，不是现场验收）：`scenes/industrial`（MQTT `commandBuilder` 最小集）与 `scenes/aquaculture`（`defineDomainPackCore` SDK 形态）。
3. **能力按需增量**：NLG、clarification、physicalExecutor、conversation 等通过 capability 显式声明，参考 agriculture/robotics 单模块而非整包。
4. **注册与 codegen**：更新 `domain-packs.json` 后运行 `npm run codegen:web-catalog`，保持 Web runtime catalog 与 API catalog 同步。
5. **本地 profile**：`npm run dev:greenhouse` / `dev:robot` / `dev:industrial` 按场景显式启动；工业模拟映射用 `dev:industrial`。

**SDK 作者形态**（以 `packages/domain-sdk` 为准）：

| 步骤          | API                                                                              | 说明                                                       |
| ------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 定义 core     | **`defineDomainPackCore()`**                                                     | 技能 / schema / prompt / safety / readiness / sceneRuntime |
| 组装 contract | **`assembleDomainPackContract(core, caps)`** 或 **`defineDomainPackContract()`** | 挂 ops / nlg / scene 等 capabilities                       |
| 包导出工厂    | 各 pack 导出 **`createDomainPackContract()`**（及可选 `createDomainPackCore()`） | **loader 只动态 import 该工厂名**                          |

monolithic `DomainPack` 类型与旧 `createDomainPack()` **已删除**，不得在新 pack 中使用。  
新领域**对照 `scenes/industrial` 或 `domain:new` 骨架**，禁止从 `scenes/greenhouse` 整包复制。

## 最小交付件

每个可交付 `live` Domain Pack 必须提供：

- `manifest`：稳定 `id`、展示名、`status: "live"`、四类 eval 路径。
- `skills`：P0 查询/报告类、P1 控制类、physical 子集；skill 名不得重复。
- `intentSchemas`：Zod schema，必须覆盖该 pack 的所有结构化 intent。
- `prompt`（`section` / `contract` / `processing`）：作为 LLM prompt 和 repair contract 的真源（对应 core.prompt，不是旧扁平 `promptSection` 字段）。
- `structuralOverrides`：只允许在 LLM 返回 `clarification_needed` 或 schema repair 仍失败后做固定结构修复；不得覆盖已通过 schema 的有效 LLM intent。
- `targetResolver`：声明物理技能识别与设备目标解析。
- `safety`：权限、确认、时长、互锁或场景风险策略。
- `sceneRuntime`：scene skill、risk level、success metric 与 outcome threshold。
- 执行适配：有 physical skill 时必须提供 `commandBuilder` 或 `physicalExecutor`；`commandBuilder` 必须用显式映射把领域 skill 转成执行端 action，不能依赖平台 core 的跨领域 action 白名单。建议提供 `commandReplies.commandStatusMessage` 以对齐终态通知体验。
- `eval`：`golden` / `matrixExtra` / `matrixWechat` / `matrixNegative` 路径均非空且 JSONL **文件内容非空**（`check-domain-pack-contracts` 强制），P0 与 physical skill 必须在 golden/extra/wechat 中有正向覆盖；新增 structural override 规则必须同时补正向和负向覆盖。
- `readiness` 会静态校验 live pack 的 `skills` 与 Zod `skill: z.literal(...)` 同步：声明的技能必须有 intent schema，schema 也不得声明未登记 skill。
- `readiness`（core）：**非空** `requiredTransports`（如 `["mqtt"]` 或 `["m20_http"]`），并提供 `validateConfig` / `validateRegistry`；live pack 必须声明 `probe()` 或 `probeNotRequired.reason`（`check-domain-pack-contracts` 同构门禁）。平台 settings 仅对 `mqtt` 自动生成 `mqtt_url` 字段；HTTP 类 transport 连接态由 `probe` 覆盖。真源：`packages/runtime/src/readiness.ts`。
- **Readiness 分层（勿混用）：**
  - **交付 / ops 探针**（`/admin/platform/readiness`、flywheel gate）：config、registry、transport 连接、node 在线等均可见；transport 未连接会记入 `issues` / checks，供运维判断。
  - **Settings 保存**（`PUT /admin/settings`）：仅 **config + registry** 硬阻断；切换到 MQTT-required pack 时校验**有效** `mqtt_url`（已持久化或同请求提供）。**不**要求保存 settings 时 MQTT publisher 已连接（避免冷启动死锁）。`mqtt_url` 变更后 API 自动 `restartMqttSubscribers()`。
  - **Capability 后台任务**：digest、`scheduled-reports`、weather-proactive、proactive-alerts、NDVI 等仅当 active pack 声明对应 capability 时调度；切域触发 `restartDomainCapabilitySchedulers()`。详见 [`../architecture/platform-runtime.zh.md`](../architecture/platform-runtime.zh.md) §运维门禁。
- `runtimeReadiness.flywheelGate`：live pack 必须声明 `adapterModule`；通用入口 `npm run domain:flywheel` 会按 active pack 加载 adapter。
- stub / simulator：新执行端先提供验证 stub，再进入真实现场。

`placeholder` pack 可以存在于目录和 Web 展示中，但 readiness 必须为 `placeholder`，不能作为可交付场景。

`domain-packs.json` 中的 `status: "live"` 只表示该 pack 可被显式配置为某个 deployment 的 `active_domain`；运行态仍然只加载并执行当前单一 active Domain Pack，不代表多个 live pack 同时运行。

## 必跑门禁

```bash
npm run domain:check
npm run lint
npm run test --workspaces --if-present
npm run build
```

`npm run lint` 已包含 `check-domain-pack-contracts.ts`，会校验 live pack readiness 的 probe/probeNotRequired 同构。

交付和 CI 必须配置真实 LLM Key 与 evidence 签名密钥；无 `LLM_API_KEY` 或 `EVAL_EVIDENCE_SECRET` 时，readiness 必然 BLOCKED。按 active Domain Pack 运行三段矩阵：

```bash
export EVAL_EVIDENCE_SECRET=...
SIM_MATRIX_SLICE=core npm run sim:matrix
SIM_MATRIX_SLICE=wechat npm run sim:matrix
SIM_MATRIX_SLICE=negative npm run sim:matrix
npm run sim:matrix:evidence
npm run domain:chat-verify -- --pack <active-pack-id>
```

场景专项门禁按 pack 增加，例如：

```bash
npm run verify:chat  # agriculture greenhouse API 对话烟测
npm run robot:matrix
AGENT_DATA_DIR=scripts/fixtures/ci-flywheel npm run domain:flywheel
AGENT_DATA_DIR=scripts/fixtures/ci-robot-eval npm run domain:flywheel
AGENT_DATA_DIR=scripts/fixtures/ci-industrial-eval npm run domain:chat-verify -- --pack industrial
AGENT_DATA_DIR=scripts/fixtures/ci-industrial-eval npm run domain:flywheel
```

`npm run robot:matrix` 默认使用 `scripts/fixtures/ci-robot-eval`。现场交付必须显式设置当前 profile 的 `AGENT_DATA_DIR`，让 core / wechat / negative 报告写入当前 `deployment_id` 的 `eval-reports` 目录。

## Evidence 口径

`npm run sim:matrix` 写入两份报告：

```text
{AGENT_DATA_DIR}/local-eval-reports/{packId}-{slice}-sim-matrix-report.json            # 本地诊断副本，不作为交付 evidence
{AGENT_DATA_DIR}/deployments/{deployment_id}/eval-reports/{packId}-{slice}-sim-matrix-report.json  # readiness 唯一认可
```

报告包含模型、slice、通过率、升格次数、延迟统计、失败摘要、当前 eval corpus 行数/digest 与 HMAC attestation。不得把本地诊断副本、其他 deployment、其他 active pack、未签名或旧 corpus 的报告当成交付证据。只有显式 `EVAL_WRITE_DOCS=1` 时才会额外写 `docs/eval/*.json` 诊断副本。

## 交付判断

安装/交付人员以 `/admin/platform/readiness` 和平台底座页的 readiness 面板为准：

- Active Domain Pack 交付态须 `ready`（静态 eval + 运行时 checks）。
- LLM Key、registry、domain config、transport、node 在线等在 readiness 面板**必须可见**；error 级 issue 表示尚不可交付。
- **Transport 未连接**会阻断 flywheel / 部分物理控制，但**不**阻止管理员先保存 `mqtt_url` 或切换 `active_domain`（config/registry 满足且 `mqtt_url` 非空即可）；连接态应在 readiness 面板修复后再跑 flywheel。
- Web **Control 面板**物理动作经 `POST /admin/domain/control-actions`，admin 上下文会 `connectAdminMqtt()`（与 chat pipeline 对齐）。
- placeholder pack 的 blocked/placeholder 状态是预期结果。
- negative matrix 必须证明不会跨领域误触发物理动作。
- sim:matrix evidence 与 readiness 符号从 `@embodied-agent/runtime` 导入（无 `apps/api/src/domain-packs/readiness` shim）。

执行完这些门禁，只能说明“该场景按 Domain Pack contract 具备软件交付条件”。真实硬件安全、真实客户价值和长期现场 impact 仍需单独验证。
