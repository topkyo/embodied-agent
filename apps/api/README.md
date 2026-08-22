# @embodied-agent/api

Fastify 后端：理解层 → 策略层 → 执行层 → L3/L4 场景飞轮。

## 包结构

```
src/
├── chat/pipeline.ts       # 对话编排入口
├── intent/                # @embodied-agent/agent facade / re-export
├── skills/
│   ├── router.ts          # 薄编排
│   ├── route-table/       # 澄清/确认/告警突变
│   └── physical/          # MQTT 物理指令发布
├── mqtt/
│   ├── handle-event-message.ts      # 可单测的 command/node 事件处理
│   └── handle-telemetry-message.ts    # 可单测的 telemetry/heartbeat 处理
├── routes/admin/          # 管理 API（按域拆分）
├── commands/              # 指令生命周期（file 或 SQLite）
├── scene/                 # L3/L4 runtime
├── state/                 # STATE_BACKEND、Redis、SQLite 初始化
└── server.ts              # 开发进程入口
```

## 状态层

| 变量            | 默认                                            | 说明                                |
| --------------- | ----------------------------------------------- | ----------------------------------- |
| `STATE_BACKEND` | `file`                                          | `redis` 时启用 Redis 会话态         |
| `COMMAND_STORE` | `file`（`STATE_BACKEND=redis` 时默认 `sqlite`） | 指令持久化后端，可与会话后端解耦    |
| `REDIS_URL`     | —                                               | `STATE_BACKEND=redis` 时必填        |
| `SQLITE_PATH`   | `{AGENT_DATA_DIR}/agent.db`                     | `COMMAND_STORE=sqlite` 时指令库路径 |

`STATE_BACKEND=redis` 时会话态为进程内缓存 + Redis 写穿；pipeline 每轮对 pending-confirm/clarification **读穿 Redis**，多副本无需粘滞即可见对端写入。启动时 `initStateBackend()` 须在 listen 前完成 hydrate。

JSONL→SQLite 仅首次启动自动导入（标记 `{AGENT_DATA_DIR}/.sqlite-command-import.done`）。历史手动迁移脚本见 `docs/archive/scripts/migrate-state-to-sqlite.ts`（只读追溯）。

## 日志

运行时使用 `createLogger`（`@embodied-agent/platform`），例如：

```ts
import { createLogger } from "@embodied-agent/platform";
const log = createLogger("mqtt-event");
log.info("subscribed", { topic });
```

输出为单行 JSON，便于 grep / 日志采集。勿在 `src/` 新增裸 `console.*`。

## 安全与限流

- 生产须配置非默认 `ADMIN_TOKEN`（见 `require-production.ts`）。
- Fastify 全局 `@fastify/rate-limit`：120 请求/分钟（OPTIONS 除外）。计数为**进程内**内存桶，多副本部署时各实例独立限流，非全集群共享配额。
- 若 API 置于 nginx / 负载均衡之后，须配置 Fastify `trustProxy`（或等价代理头），否则限流按代理 IP 计次而非真实客户端。

## 评测与测试

```bash
npm run test -w @embodied-agent/api
SIM_MATRIX_SLICE=core npm run sim:matrix   # 需 LLM Key，门禁 ≥90%
SIM_MATRIX_SLICE=wechat npm run sim:matrix # 微信回归，门禁 100%
npm run verify:chat                        # 需运行中 API
```

单测数据目录：`allocateAgentDataDir` / `releaseAgentDataDir`（`@embodied-agent/platform`，`mkdtemp`；`apps/api/src/test/isolated-data-dir.ts` 为 re-export）。MQTT 入口见 `src/mqtt/handle-*.test.ts`；物理下发见 `src/skills/physical/*.test.ts`。

## Prompt 真源

- 组装：`packages/agent/src/intent/prompt/build-intent-prompt.ts`
- Schema 契约：`packages/agent/src/intent/schema-contract.ts`（与 `packages/core` Zod 同步）
- 生成：`npm run codegen:intent`
