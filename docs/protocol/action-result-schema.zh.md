# 动作结果数据 Schema（v1）

## 状态

工程规格 — 场景技能复盘与 L3/L4 数据飞轮的统一记录形状。

## 目的

将「谁、何时、以何参数、执行前后环境如何变化」沉淀为可查询、可评测、可迭代的结构化数据，支撑：

- 场景技能复盘（各 pack 的 `docs/skills/*.zh.md` §10）
- 执行层飞轮（`{AGENT_DATA_DIR}/deployments/{deployment_id}/command-logs.jsonl`）
- 理解层飞轮（`{AGENT_DATA_DIR}/deployments/{deployment_id}/intent-failures.jsonl`）

## 权威存储

| 存储         | 路径                                                                 | 说明                             |
| ------------ | -------------------------------------------------------------------- | -------------------------------- |
| 指令生命周期 | `{AGENT_DATA_DIR}/deployments/{deployment_id}/command-logs.jsonl`    | 每条物理指令一行 `CommandRecord` |
| 操作日志     | `{AGENT_DATA_DIR}/deployments/{deployment_id}/operation-logs.jsonl`  | 技能级审计（含查询类）           |
| 意图失败     | `{AGENT_DATA_DIR}/deployments/{deployment_id}/intent-failures.jsonl` | 理解层误解句 inbox               |

实现类型：`apps/api/src/commands/types.ts` → `CommandRecord`。

## CommandRecord 核心字段

```json
{
  "command_id": "cmd-20260608-0001",
  "status": "completed",
  "created_at": "2026-06-08T10:00:00.000Z",
  "updated_at": "2026-06-08T10:15:00.000Z",
  "command": {
    "deployment_id": "dep-gh-pilot-001",
    "entity_id": "gh-001",
    "node_id": "node-sim-gh-001",
    "device_id": "vent-sim-gh-001",
    "device_type": "vent_motor",
    "action": "open",
    "parameters": { "duration_seconds": 600 },
    "issued_by": {
      "user_id": "owner-001",
      "role": "owner",
      "platform": "wechat",
      "conversation_id": "wx-1"
    }
  },
  "result": {
    "actual_duration_seconds": 600
  },
  "telemetry_flywheel": {
    "before": {
      "entity_id": "gh-001",
      "temperature_c": 31.2,
      "humidity_percent": 78,
      "captured_at": "2026-06-08T10:00:01.000Z"
    },
    "after": {
      "entity_id": "gh-001",
      "temperature_c": 29.8,
      "humidity_percent": 72,
      "captured_at": "2026-06-08T10:10:05.000Z"
    }
  }
}
```

### status 枚举

`created` → `sent` → `acknowledged` → `running` → `completed` | `rejected` | `failed` | `timeout`

`result.actual_duration_seconds` 为边缘**实测 elapsed**（固件墙钟 / 模拟器真实等待），不用未截断的用户计划时长填充。通知层优先读该字段（见 `apps/api/src/commands/notify.ts`）。

### telemetry_flywheel（v0 已实现）

- **before**：`createCommand` 时快照（`commands/telemetry-snapshot.ts`）
- **after**：`completed` 事件时快照
- 用于场景技能「动作前后 5/15/30 分钟环境变化」复盘的第一版（当前为完成时刻单点）

## 场景技能关联字段（建议写入 operation log params）

| 字段                        | 说明                                                                            |
| --------------------------- | ------------------------------------------------------------------------------- |
| `scene_skill_id`            | 如 `night_ventilation_control`（router / pending-confirm / command log 已标注） |
| `risk_level`                | L0–L4（`apps/api/src/scene/risk-level.ts`）                                     |
| `user_confirmed`            | 是否经 pending-confirm                                                          |
| `evaluation_window_minutes` | 复盘时间窗（0=完成时刻，15=延迟窗口）                                           |
| `safety_reject_code`        | 拒绝时来自 `@embodied-agent/safety`                                             |

当前 v1：物理指令经 `command_id` 关联 operation log；`scene-outcomes.jsonl` 按 deployment 持久化，支持 upsert 与多时间窗复评。

## SceneOutcome 核心字段

`scene-outcomes.jsonl` 的平台字段使用 `entity_id` 和通用 `metrics`，不再把农业 `greenhouse_id` 或温湿度 delta 作为一等字段。

```json
{
  "ts": "2026-06-08T10:15:00.000Z",
  "deployment_id": "dep-gh-pilot-001",
  "scene_skill_id": "night_ventilation_control",
  "command_id": "cmd-20260608-0001",
  "entity_id": "gh-001",
  "success": true,
  "evaluation_window_minutes": 15,
  "user_confirmed": true,
  "metrics": {
    "action": "open",
    "device_id": "vent-sim-gh-001",
    "status": "completed",
    "temperature_delta_c": -1.4,
    "humidity_delta_percent": -6
  }
}
```

## 与演进阶段对照

| 阶段      | 数据能力                         | 当前                                                                 |
| --------- | -------------------------------- | -------------------------------------------------------------------- |
| L1 可控   | command log + operation log      | ✅                                                                   |
| L2 可管   | 主动推送 + 持续性异常记录        | ✅                                                                   |
| L3 可建议 | 场景技能 + 动作结果复盘          | ✅ schema + scene runtime + 延迟窗口复盘                             |
| L4 可运营 | 跨 deployment 聚合、阈值建议写入 | ✅ ROI 摘要 + `policy.apply_suggestion` + 跨 deployment outcomes API |

## 相关文档

- [`../domain-pack/authoring.zh.md`](../domain-pack/authoring.zh.md) §10 复盘指标
- [`../architecture/control-layers.zh.md`](../architecture/control-layers.zh.md) 数据飞轮 v0
- [`command-protocol.zh.md`](command-protocol.zh.md)
