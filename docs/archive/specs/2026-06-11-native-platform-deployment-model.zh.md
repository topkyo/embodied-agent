# 原生平台运行时：Deployment 模型（Phase C）

**Date:** 2026-06-11  
**Status:** Completed (v0.4.0, 2026-06-11) — 实施计划见 （实施计划未纳入本公开快照）
**Replaces:** `farm_id` / `AGENT_DATA_DIR` / MQTT `farms/` 全栈语义（**无运行时兼容层**）  
**Prerequisite:** Phase A+B 已完成（[`2026-06-10-embodied-agent-platform-upgrade.zh.md`](2026-06-10-embodied-agent-platform-upgrade.zh.md)）

## Goal

将运行时从「数字农场租户」升级为**具身 Agent 平台原生模型**：以 `deployment_id` 标识一次物理部署（节点集合 + 记忆命名空间 + 配置），与 Domain Pack（行为）、Principal（用户）正交分离。一次性切换，不保留 `farm_*` 双读/别名。

## Non-goals

- 不引入 `org_id` / 计费多租户（后续 SaaS 再加）
- 不拆 Agent 微服务（本阶段只做包边界）
- 不实现 industrial/pet Domain Pack
- 不做 MQTT `farms/` 与 `deployments/` 双订阅

## First principles

平台运行时只有三条正交轴：

| 轴              | 标识                                   | 职责                               |
| --------------- | -------------------------------------- | ---------------------------------- |
| **Principal**   | `principal_user_id` / 微信绑定（既有） | 谁在操作                           |
| **Deployment**  | `deployment_id`                        | 在哪具身：节点、Memory、配置作用域 |
| **Domain Pack** | `active_domains[]`                     | 按什么场景思考：技能、prompt、eval |

`farm_id` 是农业试点遗留，与 Deployment 混义，**删除**。

## Design

### 1. 环境变量与数据布局

| 旧                 | 新                                                                  |
| ------------------ | ------------------------------------------------------------------- |
| `AGENT_DATA_DIR`   | `AGENT_DATA_DIR`                                                    |
| `FARM_ID`          | `DEPLOYMENT_ID`（仅 bootstrap/脚本；运行时以 `settings.json` 为准） |
| `farms/{farm_id}/` | `deployments/{deployment_id}/`                                      |

```text
{AGENT_DATA_DIR}/
├── settings.json              # deployment_id, active_domains, LLM, ...
├── device-registry.json       # deployments[]
├── intent-failures.jsonl
├── sim-matrix-wechat.jsonl
└── deployments/{deployment_id}/
    ├── command-logs.jsonl
    ├── operation-logs.jsonl
    ├── scene-outcomes.jsonl
    ├── geo-coordinates-cache.json
    ├── ndvi-cache.json
    └── ...
```

`resolveAgentDataDir()` 取代 `resolveFarmDataDir()`；旧 env **不读取**。

### 2. MQTT topic（与固件同版）

```text
deployments/{deployment_id}/nodes/{node_id}/commands
deployments/{deployment_id}/nodes/{node_id}/events
deployments/{deployment_id}/nodes/{node_id}/telemetry
deployments/{deployment_id}/nodes/{node_id}/heartbeat
deployments/{deployment_id}/nodes/{node_id}/config
```

- 常量真源：`packages/platform/src/mqtt-topics.ts`（新建）
- 固件 `firmware/scene-node`：`CONFIG_VERSION` bump，订阅/发布前缀同步
- 模拟器、`mqtt-watch`、tmux 脚本同 PR 栈更新

### 3. Settings

```typescript
type AgentSettings = {
  deployment_id: string; // 必填；试点默认 dep-gh-pilot-001
  deployment_name: string; // 取代 farm_name
  active_domains: string[];
  // ... 其余字段不变
};
```

- `getEffectiveSettings()`：无 `deployment_id` → **启动失败可见**（dev 默认仅用于种子 `settings.json` / fixture）
- 删除 `farm_id`、`farm_name` 字段

### 4. Device registry

```typescript
type DeviceRegistry = {
  deployments: {
    deployment_id: string;
    display_name: string;
    nodes: NodeRecord[];
    greenhouses: GreenhouseRecord[];
    // ...
  }[];
};
```

- 删除顶层 `farms[]`
- `canonical-sim` 种子：`deployment_id: "dep-gh-pilot-001"`，保留 `gh-001` / `gh-002`

### 5. Intent：Deployment 为 session 上下文

**规则：** LLM `target` 不再包含 `deployment_id` / `farm_id`。

| 类型                                                    | target                                   |
| ------------------------------------------------------- | ---------------------------------------- |
| 平台查询（`report.*`、`log.*`、`command.query_status`） | `{}` 或省略；runtime 注入当前 deployment |
| 场景实体（`greenhouse.*`、`fan.*`）                     | `greenhouse_id`、`zone_id` 等            |
| 复合查询                                                | 不变；deployment 由 pipeline 传入        |

- 更新 `packages/core/src/schemas/intent-platform.ts`：移除所有 `farm_id` zod 字段
- 更新 `scenes/greenhouse/eval/*.jsonl`：删除 `expected.target.farm_id`
- `build-intent-prompt` / `farm-context` → `deployment-context`（仅 `greenhouse_aliases` 等场景信息）

### 6. Command / Device schema

- `CommandMessage.farm_id` → `deployment_id`
- `Device.farm_id` → `deployment_id`
- 全仓类型与 MQTT payload 同步

### 7. 包结构（单进程，非微服务）

```text
packages/platform/     # AGENT_DATA_DIR、deployment 路径、mqtt-topics、settings 类型
packages/memory/       # MemoryJournal 端口 + file/sqlite 实现
packages/agent/        # intent、router、nlg、scene hooks（从 apps/api 迁出）
packages/node/         # mqtt client、registry、pairing、config-sync（从 apps/api 迁出）
apps/api/              # HTTP / Admin / 微信适配器 + bootstrap 组装
```

**运行时：** 仍一个 Node 进程（tmux 不变）。`apps/api/src/bootstrap.ts` 组装 platform + memory + node + agent。

**微服务：** 本 spec 不拆网络边界。仅当 Node 连接规模独立扩缩时再考虑 `apps/node-gateway` 独立进程。

### 8. Memory 端口

```typescript
interface MemoryJournal {
  appendCommand(deploymentId: string, record: CommandRecord): void;
  appendOutcome(deploymentId: string, record: OutcomeRecord): void;
  appendIntentFailure(record: IntentFailure): void;
  queryCommands(deploymentId: string, filter: CommandFilter): CommandRecord[];
}
```

- 作用域：**仅** `deployment_id`
- 后端：`file`（默认）/ `sqlite`（`COMMAND_STORE=sqlite`）
- Domain Pack 仅在 record 上打 `pack` 标签，不拥有存储路径

### 9. Admin / Web

- 查询参数：`?deployment_id=`（删除 `?farm_id=`）
- `GET /admin/deployments` → `GET /admin/deployments`
- Web `api.ts` / i18n 同步

### 10. 迁移（一次性）

脚本已归档：`docs/archive/scripts/migrate-v0.3-farm-to-deployment.ts`

```text
1. 若存在 farms/ → 重命名为 deployments/（目录名映射 1:1，farm-001 → dep-gh-pilot-001 可配置）
2. settings.json：farm_id → deployment_id，farm_name → deployment_name
3. device-registry.json：farms → deployments，字段改名
4. 全局替换环境变量文档与 .env.example
5. dry-run 模式；--apply 写入
```

**不实现**运行时 `farm_id ?? deployment_id` 回退。

### 11. 版本与固件

- monorepo 版本：**0.4.0**
- 固件：`CONFIG_VERSION` +1；旧固件需 rebind 或 OTA 后重配对
- 发布说明：明确 0.3 → 0.4 不兼容

## PR 顺序

```text
P1  packages/platform + AGENT_DATA_DIR + deployments/ 路径 + mqtt-topics
P2  settings/registry/schemas 去 farm_id；intent target 清理；eval jsonl 更新
P3  packages/memory + Journal 接口；api/scene/commands 改接
P4  packages/agent + packages/node；apps/api 变薄 + bootstrap
P5  migrate 脚本 + 固件/sim/tmux + 全量门禁（sim:matrix, verify:chat, scene:flywheel）
```

每 PR：`npm run lint && npm test && npm run build`；P2 起 `eval:intent`；P5 全量 `verify-intent-gate.sh` + `scene:flywheel`。

## Testing

| 门禁           | 要求                                                 |
| -------------- | ---------------------------------------------------- |
| 单测           | 路径、topic 解析、settings 缺 deployment_id 失败可见 |
| sim:matrix     | core ≥90%，wechat 100%（golden 无 farm_id）          |
| verify:chat    | 13/13                                                |
| scene:flywheel | `::SCENE_FLYWHEEL_PASSED::`                          |
| pair:e2e       | 新 topic 下配对 + config 下发                        |

## Error handling

- 缺 `deployment_id` / 未知 deployment / registry 无节点 → 4xx 或启动失败，**不**静默回退
- MQTT topic 前缀不匹配 → 忽略或 400（与现 node-offline 逻辑一致）
- 迁移脚本遇已迁移目录 → 失败可见，不覆盖

## Risks

| 风险                       | 缓解                            |
| -------------------------- | ------------------------------- |
| 大 diff（200+ 文件）       | 按 P1–P5 分段 PR；每段门禁      |
| 已绑定 ESP32 需 rebind     | migrate + 文档 + CONFIG_VERSION |
| intent golden 批量改       | 脚本校验 + sim:matrix           |
| 与 digital-farm 旧数据目录 | migrate 支持指定源目录          |

## Decisions (approved 2026-06-11)

1. 试点默认 **`deployment_id: dep-gh-pilot-001`**；迁移映射 `farm-001` → `dep-gh-pilot-001`
2. **删除** `GET /admin/deployments`；仅保留 `GET /admin/deployments`

## Approval

已批准。实施计划：`docs/archive/plans/2026-06-11-native-platform-deployment-model.zh.md`。
