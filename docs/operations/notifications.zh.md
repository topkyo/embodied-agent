# 主动通知与定时汇报

**状态：** 已落地（`main` ≥ `73e4162`）

## 原则

与 [`../architecture/control-layers.zh.md`](../architecture/control-layers.zh.md) 一致：

| 层       | 职责                                                                                    |
| -------- | --------------------------------------------------------------------------------------- |
| **理解** | 用户对话经 LLM → `IntentPayload`（含 `report.set_schedule` / `alert.set_threshold` 等） |
| **策略** | Zod 校验、权限、持久化规则/计划、冷却与去重                                             |
| **执行** | MQTT 遥测订阅、定时器、微信 iLink 主动 `sendmessage`（不经 LLM）                        |

**禁止：** 用正则/关键词在 `pipeline` 中绕过 LLM 做意图判定。未配置 LLM Key 时对话接口应失败可见，不做运行时 mock 兜底。

## 1. 阈值报警推送

**设置（对话）：** `alert.set_threshold` → 写入 `{AGENT_DATA_DIR}/deployments/{deployment_id}/alert-rules.json`。平台规则字段为 `entity_id`、`metric`、`operator`、`value`、`enabled`、`updated_at`、`updated_by`；农业 Domain Pack 在意图层仍使用 `greenhouse_id`，进入平台持久化前转换为 `entity_id`。

**触发：** 订阅 `deployments/{deployment_id}/nodes/{node_id}/telemetry`，收到遥测后评估规则；另每 60s 轮询补扫。

**离线跳过：** 评估前检查温室绑定节点（`apps/api/src/alerts/node-offline.ts`）。若该棚无节点、或全部节点无心跳/已超时离线，则跳过阈值评估，避免 demo 种子数据或陈旧遥测误推。多节点时只要任一节点在线即继续评估。

**推送：** 超阈值且过冷却（默认 30 分钟，`ALERT_COOLDOWN_SECONDS`）→ 微信主动消息。冷却路径：`reserveAlertCooldown` → 发送 → `confirmAlertFiredResilient`（文件锁 + 重试；confirm 最终失败只记日志，避免重复推送）。发送失败则 `releaseAlertReservation`。接收人：规则设置者 + 已绑定 owner/operator。总闸：`alert_push_enabled`（配置台 **通知与表达层** 或 `ALERT_PUSH_ENABLED=0`）。

**关闭/改阈值：** 对话重新设置或编辑对应 deployment 下的 `alert-rules.json`。

## 1a. 持续性异常 + L2 运营建议（默认）

**默认开启**（`SUSTAINED_ALERTS=1`，设 `0` 恢复即时阈值推送）。

**触发：** 同一规则连续超阈 ≥ `SUSTAINED_ALERT_MINUTES`（默认 15）分钟（60s 轮询计数）。

| 阶段                        | 等级 | 行为                                                                   |
| --------------------------- | ---- | ---------------------------------------------------------------------- |
| 持续超阈达 N 分钟           | L1   | 【持续异常】微信提醒                                                   |
| 同 episode 已 L1 且高温规则 | L2   | 【运营建议】建议 `greenhouse.set_mode(night_vent)` + `pending-confirm` |

实现：`apps/api/src/alerts/sustained-push.ts`。场景技能见 [`scenes/greenhouse/docs/skills/night-ventilation-control.zh.md`](../../scenes/greenhouse/docs/skills/night-ventilation-control.zh.md)。

## 1b. 节点离线报警

**触发：** 后台每 60s 检查各 `node_id` 心跳（`DEVICE_HEARTBEAT_TIMEOUT_MS`，默认 90s）。

**推送：** 节点曾上报心跳且超时未续 → 【离线报警】；恢复后 → 【恢复在线】。冷却默认 30 分钟（`OFFLINE_ALERT_COOLDOWN_SECONDS`）。

**与阈值跳过的区别：** 从未上报过心跳的节点不推离线报警（视为尚未上线）；但会参与阈值跳过判定（无心跳 = 无实时遥测源）。

## 2. 早晚简报（平台调度 + Domain Pack 内容）

平台在固定时点触发 active Domain Pack 的 `digest` 能力，生成非对话下发的部署摘要。调度器先检查 `hasActiveDigest()`：无 `digest` capability 的 pack（如 robotics、industrial）**跳过**调度，不进入 `buildDigestMessage`。`active_domain` 切换后 `restartDomainCapabilitySchedulers()` 重启 digest 定时器。

| 项   | 默认            |
| ---- | --------------- |
| 晨间 | 07:00           |
| 晚间 | 22:00           |
| 时区 | `Asia/Shanghai` |

平台负责调度、去重、收件人与推送通道；摘要内容由 active Domain Pack 生成。`agriculture` 实现会输出各棚温湿度/通风/风机、夜间模式摘要和今日操作条数。

配置：Web 配置台 **通知与表达层** 面板，或 `/admin/settings` / `{AGENT_DATA_DIR}/settings.json` 中 `digest_enabled`、`digest_morning_hour`、`digest_evening_hour`、`digest_timezone`。去重：`{AGENT_DATA_DIR}/deployments/{deployment_id}/digest-state.json`。

接收人：已绑定微信的 **owner**。

## 3. 定时状态汇报（对话配置）

**开启（LLM）：** 例如「1号棚和2号棚每15分钟汇报温湿度」→ `report.set_schedule`。

```json
{
  "skill": "report.set_schedule",
  "target": { "deployment_id": "dep-gh-pilot-001" },
  "parameters": {
    "greenhouse_ids": ["gh-001", "gh-002"],
    "interval_minutes": 15
  }
}
```

**关闭（LLM）：** 「取消定时汇报」→ `report.cancel_schedule`。

持久化：`{AGENT_DATA_DIR}/deployments/{deployment_id}/status-report-schedules.json`。平台存储字段为 `entity_ids`；农业 Domain Pack 的 LLM intent 参数仍为 `greenhouse_ids`，进入平台前显式转换。后台每 60s 检查到期计划；仅当 `hasActiveScheduledReports()` 为真时推送【定时汇报】（切离 agriculture 后遗留计划不会周期性抛错）。

权限：仅 **owner / operator**（见 `packages/safety/src/guard.ts`）。

## 微信主动发送前提

1. Web 配置台完成 iLink 扫码登录（`{AGENT_DATA_DIR}/wechat-ilink/`）。
2. 现场账号已绑定（`{AGENT_DATA_DIR}/platform-bindings.json`）。
3. 用户曾与机器人有过至少一轮对话（保存 `context_token`，见 `apps/api/src/wechat/context-store.ts`）。

未满足时推送会跳过并在日志中记录 `[wechat-outbound] skip ... no context_token`。

## 配置台开关（`PUT /admin/settings`）

| 字段                        | 默认 | 说明                                                                |
| --------------------------- | ---- | ------------------------------------------------------------------- |
| `alert_push_enabled`        | 开   | 阈值/离线/持续性 L1/L2 等微信主动推送总闸（天气主动推送亦受此约束） |
| `digest_enabled`            | 开   | 早晚场况简报                                                        |
| `weather_proactive_enabled` | 开   | 寒潮/高温预报主动推送                                               |
| `nlg_enabled`               | 开   | 查询类回复与部分主动推送的第二遍 LLM 口语润色（需 LLM Key）         |

面板路径：Web `/scenes/{active-pack}/ops/settings` → **通知与表达层**。

## 环境变量（第二显式配置来源 / 无配置台部署）

| 变量                                                              | 说明                    |
| ----------------------------------------------------------------- | ----------------------- |
| `ALERT_PUSH_ENABLED=0`                                            | 关闭报警推送            |
| `DIGEST_ENABLED=0`                                                | 关闭早晚简报            |
| `WEATHER_PROACTIVE_ENABLED=0`                                     | 关闭天气主动推送        |
| `NLG_ENABLED=0`                                                   | 关闭查询/推送 NLG 润色  |
| `ALERT_COOLDOWN_SECONDS`                                          | 报警冷却秒数，默认 1800 |
| `DIGEST_MORNING_HOUR` / `DIGEST_EVENING_HOUR` / `DIGEST_TIMEZONE` | 简报时点                |

## 代码索引

| 能力                 | 路径                                        |
| -------------------- | ------------------------------------------- |
| 报警规则存储         | `apps/api/src/alerts/threshold-store.ts`    |
| 节点离线 / 阈值跳过  | `apps/api/src/alerts/node-offline.ts`       |
| 报警评估与推送       | `apps/api/src/alerts/push.ts`               |
| 冷却 reserve/confirm | `apps/api/src/alerts/alert-state.ts`        |
| 离线报警推送         | `apps/api/src/alerts/offline-push.ts`       |
| 遥测缓存             | `apps/api/src/telemetry/store.ts`           |
| MQTT 遥测订阅        | `apps/api/src/mqtt/telemetry-subscriber.ts` |
| 定时汇报存储         | `apps/api/src/report/schedule-store.ts`     |
| 定时汇报调度         | `apps/api/src/report/scheduler.ts`          |
| 早晚简报             | `apps/api/src/digest/`                      |
| 后台任务入口         | `apps/api/src/jobs/start.ts`                |
| 微信出站             | `apps/api/src/wechat/outbound.ts`           |

## 评测

Golden 意图见 [`scenes/greenhouse/eval/intent-golden.zh.jsonl`](../../scenes/greenhouse/eval/intent-golden.zh.jsonl)（含 `report.set_schedule` / `report.cancel_schedule`）。

```bash
npm run eval:intent
```
