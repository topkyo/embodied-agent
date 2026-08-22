# 人工操作复盘

## 1. 基本信息

| 字段     | 内容                            |
| -------- | ------------------------------- |
| Skill ID | `worker_manual_override_review` |
| 中文名称 | 人工操作复盘                    |
| 当前版本 | `v0.1`                          |
| 状态     | 草案                            |
| 负责人   | embodied-agent                  |
| 最后更新 | `2026-06-08`                    |

## 2. 场景定义

现场工人手动操作卷膜/风机后，云端需可查询「是否处于手动优先」、谁在何时发了云端指令，避免人机冲突。

## 3. 已实现映射

| 能力     | 实现                                                    |
| -------- | ------------------------------------------------------- |
| 操作审计 | `log.query_today`、`command.query_status`               |
| 手动优先 | `device-registry` `manual_override` + safety guard 拒绝 |
| 角色区分 | `worker` 仅风机；`owner/operator` 全控                  |

**待固件**：真实现场 `manual_override` 须由节点遥测上报，非 registry 静态字段。

## 4. 推荐话术

- 「今天谁动了 1 号棚？」→ `log.query_today`
- 「现在能远程开帘吗？」→ 查 `manual_override` + 遥测

## 5. 复盘指标

- 人工操作后 24h 内云端误控次数
- `rejected` + `device_unavailable` / manual 相关拒绝占比

## 6. 版本记录

| 版本 | 日期       | 变更     |
| ---- | ---------- | -------- |
| v0.1 | 2026-06-08 | 初始草案 |
