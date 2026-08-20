# L3/L4 场景层

## 定位

场景层位于**策略层之上、运营闭环之内**：平台负责 scene runtime、outcome 持久化和人工采纳流程；具体运营经验、策略建议草稿和领域 intent 编译由当前 active Domain Pack 提供。

与 [`control-layers.zh.md`](control-layers.zh.md) 的关系：

| 层                  | 职责                              | 实现                                                                                        |
| ------------------- | --------------------------------- | ------------------------------------------------------------------------------------------- |
| 理解层              | 自然语言 → `IntentPayload`        | `packages/agent/src/intent/`（API 侧通过 runtime bindings 接入）                            |
| 策略层              | 安全守卫 → MQTT 指令              | `skills/router.ts`、`packages/safety/`                                                      |
| **L3 场景 runtime** | 触发编排、outcome 复盘、L2 建议   | `apps/api/src/scene/` + Domain Pack `commandHooks` / `proactiveAlerts` / `weatherProactive` |
| **L4 运营飞轮**     | ROI、策略建议、试点基线、周报建议 | 平台持久化 + Domain Pack `policySuggestions` / `digest` / `weeklyAdvice`                    |

**LLM 分工**：理解层 Flash + 升格 Pro；L3/L4 NLG / 周报固定 **`deepseek-v4-pro`**（`scene/llm-model.ts`）。

## 模块地图

```text
apps/api/src/scene/
├── registry.ts           # active Domain Pack runtime facade
├── risk-level.ts         # 场景风险 L0–L4
├── command-hooks.ts      # 指令终态分发；领域副作用由 Domain Pack commandHooks 生成
├── evaluate-outcome.ts   # 温/湿度 delta 判定 success
├── outcome-scheduler.ts  # 15 分钟延迟窗口
├── outcome-store.ts      # scene-outcomes.jsonl
├── device-failures.ts    # 24h 重复失败统计
├── policy-suggestions.ts # L4 策略建议状态机；草稿与 apply 编译来自 Domain Pack
├── pilot-baseline.ts     # 试点跑棚基线
└── roi-report.ts         # 试点 ROI 摘要
```

## Greenhouse 8 个场景技能

8 个 greenhouse 场景定义真源在 `scenes/greenhouse/scene/registry.ts`；`apps/api/src/scene/registry.ts` 只代理当前 active Domain Pack 的 scene runtime。`robotics` pack（目录 `scenes/robot`）有独立 scene runtime，`industrial` pack（目录 `scenes/industrial`）提供过温排风模拟映射，`aquaculture` 为 placeholder。

| Skill ID                        | 文档                                                                                             | 触发器                | 风险 |
| ------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------- | ---- |
| `night_ventilation_control`     | [night-ventilation-control](../../scenes/greenhouse/docs/skills/night-ventilation-control.zh.md) | 持续超温 L2、天气高温 | L2   |
| `high_temp_emergency_response`  | [high-temp-emergency](../../scenes/greenhouse/docs/skills/high-temp-emergency-response.zh.md)    | ≥35°C 持续 L1         | L2   |
| `humidity_mildew_prevention`    | [humidity-mildew](../../scenes/greenhouse/docs/skills/humidity-mildew-prevention.zh.md)          | 持续高湿 L2           | L2   |
| `cold_wave_protection`          | [cold-wave](../../scenes/greenhouse/docs/skills/cold-wave-protection.zh.md)                      | 天气寒潮              | L2   |
| `post_irrigation_ventilation`   | [post-irrigation](../../scenes/greenhouse/docs/skills/post-irrigation-ventilation.zh.md)         | 灌溉完成              | L2   |
| `morning_dew_reduction`         | [morning-dew](../../scenes/greenhouse/docs/skills/morning-dew-reduction.zh.md)                   | 早简报高湿            | L1   |
| `worker_manual_override_review` | [manual-override](../../scenes/greenhouse/docs/skills/worker-manual-override-review.zh.md)       | 手动优先拒绝          | L1   |
| `device_efficiency_diagnosis`   | [device-efficiency](../../scenes/greenhouse/docs/skills/device-efficiency-diagnosis.zh.md)       | 设备重复失败          | L1   |

触发解析：`resolveSceneForTrigger()` 经 active Domain Pack runtime 调用。

## 数据流

```text
告警/天气/灌溉/简报/用户意图
  → resolveSceneForTrigger → scene_skill_id
  → skills/router（标注 risk_level）
  → MQTT 执行
  → command_event 终态
  → command-hooks（平台分发；Domain Pack 生成灌后通风/设备诊断等领域计划）
  → evaluate-outcome + outcome-scheduler（15min 窗口）
  → scene-outcomes.jsonl
  → policy-suggestions（Domain Pack 草稿 / 平台采纳）/ roi-report（L4）
```

动作前后环境快照：`CommandRecord.telemetry_flywheel`（见 [`../protocol/action-result-schema.zh.md`](../protocol/action-result-schema.zh.md)）。

## Outcome 判定

实现：`apps/api/src/scene/evaluate-outcome.ts`；延迟窗口：`outcome-scheduler.ts`（默认 **15** 分钟，可配 `SCENE_OUTCOME_WINDOWS_MINUTES`）。

| `sceneSuccessMetric` | success 条件（动作后窗口内）                                  |
| -------------------- | ------------------------------------------------------------- |
| `temperature`        | `metrics.temperature_delta_c < -0.5`（降温 ≥0.5°C）           |
| `humidity`           | `metrics.humidity_delta_percent < -3`（湿度下降 ≥3 个百分点） |
| `completion`         | 指令 `status === completed`（如人工覆写复盘、设备诊断）       |

风险等级以 `risk-level.ts` 为准（场景技能 YAML 草案中的 L 级可能滞后）。

## L4 运营闭环

| 能力               | API / 脚本                                                        |
| ------------------ | ----------------------------------------------------------------- |
| 试点基线           | `GET/POST /admin/pilot/baseline`                                  |
| ROI 摘要           | `GET /admin/pilot/roi?since_days=7`                               |
| 场景 outcome       | `GET /admin/scene-outcomes`                                       |
| 跨 deployment 聚合 | `GET /admin/scene-outcomes/all`                                   |
| 策略建议           | `GET /admin/policy-suggestions`；`POST .../apply` / `.../dismiss` |
| 聊天采纳           | `policy.apply_suggestion`（用户确认后写入阈值/模式）              |

## 后台调度与 capability

L3/L4 相关主动能力由平台 jobs 调度，**仅当 active pack 声明对应 capability 时执行**（切域后 `restartDomainCapabilitySchedulers()` 重启）：

| Capability          | 行为               | 守卫                          |
| ------------------- | ------------------ | ----------------------------- |
| `proactive-alerts`  | 持续性异常 L1/L2   | `hasActiveProactiveAlerts()`  |
| `digest`            | 早晚场况简报       | `hasActiveDigest()`           |
| `scheduled-reports` | 对话配置的定时汇报 | `hasActiveScheduledReports()` |
| `weather-proactive` | 寒潮/高温预报推送  | `hasActiveWeatherProactive()` |

无 capability 的 pack（如 robotics 无 digest）调度器早退，不抛错。告警冷却：`reserveAlertCooldown` → 发送 → `confirmAlertFiredResilient`。详见 [`../operations/notifications.zh.md`](../operations/notifications.zh.md)、[`platform-runtime.zh.md`](platform-runtime.zh.md) §运维门禁。

## 联调与验收

- agriculture 双棚飞轮：[`scenes/greenhouse/docs/domain-flywheel-agriculture.zh.md`](../../scenes/greenhouse/docs/domain-flywheel-agriculture.zh.md)
- 一键：`npm run domain:flywheel` → 当前 active Domain Pack 的 `flywheelGate.adapterModule`
- 冒烟：`npm run domain:l3-smoke`
- 成功标志：`::DOMAIN_FLYWHEEL_PASSED::`

飞轮 dev 路由（须 `FLYWHEEL_DEV=1`）：`GET /dev/flywheel/ready`。

## 禁止事项

- LLM 不得直接改写运行中控制环或静默应用策略
- L2 物理动作须经 `pending-confirm` 用户确认
- 场景 outcome 阈值须用真棚数据校准，模拟器样本仅作联调参考
