# 三层分层与控制演进

**状态：** 已采用（与 [`implementation.zh.md`](implementation.zh.md) 一致）。L3/L4 场景运营层见 [`scene-layer.zh.md`](scene-layer.zh.md)。

## 一句话

采用**理解 → 策略 → 执行**三层分工；执行层目标是由现场节点承担互锁、超时与闭环。当前仓库已验收的是模拟器路径，ESP32 参考固件默认 DRY_RUN。

## 分层定义

### 理解层

- **输入：** 微信/集成通道标准化消息（文本或语音转写）。
- **输出：** `IntentPayload`（`skill` + `target` + `parameters`），`intent_source: "llm"`。
- **代码：** [`apps/api/src/chat/pipeline.ts`](../../apps/api/src/chat/pipeline.ts)、[`packages/agent/src/intent/llm.ts`](../../packages/agent/src/intent/llm.ts)、[`packages/agent/src/intent/validate.ts`](../../packages/agent/src/intent/validate.ts)。
- **原则：** LLM 仅理解；失败时澄清或「服务暂不可用」，不静默降级到规则引擎。
- **契约修复：** Zod 失败时自动进行 **1 次** schema repair（`schema-contract.ts` + `resolveIntent`），仍失败再澄清。

### 策略层

- **输入：** 已校验意图。
- **输出：** 安全决策、MQTT 指令、操作日志、用户可见回复；未来将包含持久化的 `night_mode` / 温度带等 policy。
- **代码：** [`apps/api/src/skills/router.ts`](../../apps/api/src/skills/router.ts)、[`packages/safety/src/guard.ts`](../../packages/safety/src/guard.ts)、[`packages/core/src/schemas/intent.ts`](../../packages/core/src/schemas/intent.ts)。
- **原则：** 确定性、可审计；`duration_seconds` 按用户原话，不因 registry 旧 15 分钟 cap 拒执；单次脉冲 schema 上限 14400s（`PHYSICAL_PULSE_MAX_SECONDS`，与固件 4h 看门狗一致），>4h 引导 `set_mode`。≥600s 需二次确认（`guard.ts` 默认阈值，设备可配 `confirm_duration_threshold_seconds`）。`fan.start` 缺时长在 guard 层拒绝。
- **已落地：** 待确认状态机（`apps/api/src/policy/pending-confirm.ts`）；`greenhouse.set_mode` 技能与 schema。

### 执行层

- **输入：** MQTT `command`（脉冲）或 `set_mode` / setpoint（演进）。
- **输出：** 遥测、command_event、本地互锁与定时停止。
- **代码：** [`scripts/node-simulator.ts`](../../scripts/node-simulator.ts)（✅ 工程验收路径）、[`firmware/scene-node/`](../../firmware/scene-node/)（⚠️ DRY_RUN，真 GPIO 待迭代）。
- **原则：** 断网仍执行本地硬限制；手动优先高于云端；长时维持由边缘环完成，而非云端重复下发。

**执行层分述**：模拟器已实现滞回环与 `set_mode` TTL；ESP32 参考固件默认 DRY_RUN，假负载环境已有 GPIO、超时与 manual override / E-stop 路径，真实执行器尚未验收。文档称「执行层已完成」时默认指模拟器，除非明确写固件与现场验收。

## 用户话术映射

| 用户说法                  | 应落层                                      | MVP 现状                                                                              |
| ------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1 号棚多少度              | 理解 → `query_status` → 读遥测              | 已支持                                                                                |
| 开 10 分钟                | 策略 → `open_vent` 脉冲 → 执行定时停        | 已支持                                                                                |
| 开 10 分钟（≥600s）       | 策略 → 需「确认」→ 执行                     | 已支持（回复「确认」）                                                                |
| 开一晚上 / 夜间别超 30 度 | 策略 → `set_mode` → 执行层闭环              | 模拟器已支持 `greenhouse.set_mode`                                                    |
| 开超过 4 小时（单次脉冲） | 理解层 schema 拒绝 / 澄清；应改 `set_mode`  | 已支持（`PHYSICAL_PULSE_MAX_SECONDS`）                                                |
| 2 号棚超 30 度报警        | 理解 → `alert.set_threshold` → 遥测触发推送 | 已支持，见 [`../operations/notifications.zh.md`](../operations/notifications.zh.md)   |
| 每 15 分钟汇报温湿度      | 理解 → `report.set_schedule` → 定时推送     | 已支持                                                                                |
| 早晚场况摘要              | 执行层定时任务（非对话下发）                | 已支持 07:00 / 22:00 简报；仅 `digest` capability 的 pack 调度（`hasActiveDigest()`） |

## 明确不采用（执行大脑）

- **LLM 自进化/自总结**直接改写运行中控制策略。
- Phase 2 可选：基于操作日志的**建议**（人确认后写入确定性配置），不改变三层边界。

## 演进顺序

1. ~~**策略层：** pending confirm + 「一晚上」澄清~~（已完成）
2. ~~**策略 + 协议：** `greenhouse.set_mode` + MQTT `set_mode`~~（已完成）
3. ~~**执行层：** 模拟器滞回环 + `set_mode` TTL~~（已完成）；ESP32 固件仅 command 状态机骨架 ⚠️
4. ~~**试点失败句沉淀**~~：`{AGENT_DATA_DIR}/deployments/{deployment_id}/intent-failures.jsonl` + `npm run intent:failures:promote`（已完成）。
5. ~~**主动通知：** 报警推送、早晚简报、对话配置定时汇报~~（见 [`../operations/notifications.zh.md`](../operations/notifications.zh.md)；各通道按 active pack capability 守卫，settings 保存与 transport 冷启动约定见 [`platform-runtime.zh.md`](platform-runtime.zh.md) §运维门禁）。
6. ~~**理解层：多轮会话历史**~~：`conversation-store` + pipeline 传入 LLM（已完成）。
   6b. ~~**理解层：槽位续接 + STT 归一化**~~：`pending-clarification` + `clarification-merge` + `normalize-utterance`；场景技能契约注入 `prompt.ts`（已完成）。
   6c. ~~**策略层：口语调设备上限**~~：已移除 `set_vent_limit`；口语「最长通风改成 X 分钟」→ 当次 `open_vent` + `duration_seconds`。
   6d. ~~**运营偏好**~~：`notification-prefs` 支持「今晚别提醒」跳过 L2（已完成）。
7. ~~**可管：持续性异常 + L2 建议**~~：`sustained-push`（连续 N 分钟超温 → L1 提醒 → L2 夜间通风建议 + pending confirm）（已完成）。
8. ~~**数据飞轮 v0**~~：command `telemetry_flywheel` 动作前/后快照（已完成）。
9. ~~**运营辅助：周报式阈值建议**~~：`advice.query_weekly`（LLM 只读建议）；用户确认后自行口述 `alert.set_threshold`（已完成）。
10. ~~**P2 外部数据**~~：天气预报、病虫害知识、农事任务、可选 NDVI；`GreenhouseSceneContext` / `buildDeploymentContext` 注入预报摘要（已完成）。
11. ~~**表达层 NLG**~~：查询/简报/预警推送口语润色，`nlg_enabled` 可关（已完成）。
12. ~~**L3 Phase 2：场景 runtime 加深**~~：`risk_level` 标注、高温 ≥35°C 风机应急编排、15 分钟 outcome 窗口调度（`scene/outcome-scheduler.ts`）。
13. ~~**L4 Phase 2：运营飞轮**~~：试点 ROI（`pilot/roi`）、策略建议草稿 + `policy.apply_suggestion` 人确认写入、`scene-outcomes/all` 跨 deployment 聚合。

## 与试点目标

国内试点 KPI 为**跑棚次数下降**。这是待真实硬件试点验证的目标；当前模拟器证据不能证明「人不在棚里时仍按目标控棚」。理解层证明微信话术可结构化，策略层证明**谁、何时、以何参数**可追责。
