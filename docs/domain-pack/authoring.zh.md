# 场景技能文档模板

## 状态

工程模板 / 场景技能库规范，适用于所有 Domain Pack。

本文定义 `scenes/{pack}/docs/skills/` 下每一个场景技能文档的统一结构，用于把真实现场运营经验沉淀为可审计、可复盘、可版本化的 Agent Skill。示例全部取自 agriculture pack（温室）。

场景技能不是简单的设备动作，而是围绕具体棚型、作物、季节、风险和执行效果形成的运营策略单元。

### 理解层原则（与设备动作技能的关系）

- **只用 LLM 理解自然语言**，运行时不用正则/关键词意图引擎兜底；理解失败写入 `{AGENT_DATA_DIR}/deployments/{deployment_id}/intent-failures.jsonl` 并暴露给用户，不静默猜意图。
- 默认 **`deepseek-v4-flash` + 思考模式**；Flash 仍无法产出可校验 JSON 时，**升格 `deepseek-v4-pro` 重试一次**（仍是 LLM，不是规则）。
- 场景技能文档应引用真实失败句 / golden 用例（`scenes/greenhouse/eval/intent-golden.zh.jsonl`），把「用户怎么说」与「应映射到哪些设备技能序列」写清楚。
- 设备动作（P0）见各 Domain Pack 的 `skills.ts`（如 `scenes/greenhouse/skills.ts` 的 `GREENHOUSE_P0_SKILLS`）；场景技能是**带上下文的运营策略**，可组合多个 P0 技能并定义 L0–L4 风险与确认要求。

详见 [`../operations/llm-model-selection.zh.md`](../operations/llm-model-selection.zh.md)。

---

## 技能文件命名规范

建议使用：

```text
scenes/{pack}/docs/skills/<skill_id>.zh.md
```

示例（agriculture pack）：

```text
scenes/greenhouse/docs/skills/night-ventilation-control.zh.md
scenes/greenhouse/docs/skills/high-temp-emergency-response.zh.md
scenes/greenhouse/docs/skills/humidity-mildew-prevention.zh.md
```

---

## Skill ID 规范

Skill ID 使用小写英文 + 下划线：

```text
night_ventilation_control
high_temp_emergency_response
humidity_mildew_prevention
cold_wave_protection
post_irrigation_ventilation
morning_dew_reduction
worker_manual_override_review
device_efficiency_diagnosis
```

Skill ID 必须稳定，不随文档标题变化而变化。

---

## 场景技能模板

复制以下模板创建新技能文档。

````markdown
# <技能中文名>

## 1. 基本信息

| 字段     | 内容                          |
| -------- | ----------------------------- |
| Skill ID | `<skill_id>`                  |
| 中文名称 | `<中文名称>`                  |
| 当前版本 | `v0.1`                        |
| 状态     | 草案 / 试点中 / 稳定 / 已废弃 |
| 负责人   | `<owner>`                     |
| 最后更新 | `YYYY-MM-DD`                  |

---

## 2. 场景定义

### 2.1 适用场景

描述这个技能解决什么真实问题。

示例：

> 夜间棚内温度持续偏高，但人工不方便频繁跑棚，需要系统根据温度、湿度、时间段和历史效果，建议或执行短时通风。

### 2.2 不适用场景

明确不要使用该技能的边界。

示例：

- 极端天气预警期间；
- 卷膜电机限位异常；
- 风机 / 侧帘处于故障状态；
- 作物处于特殊管理阶段，需要人工判断。

---

## 3. 适用范围

| 维度     | 说明                                         |
| -------- | -------------------------------------------- |
| 棚型     | 例如：单体薄膜棚 / 连栋温室 / 简易拱棚       |
| 作物     | 例如：草莓 / 番茄 / 叶菜 / 通用              |
| 季节     | 例如：夏季 / 梅雨季 / 冬季 / 全季节          |
| 设备依赖 | 例如：温湿度传感器、风机、卷膜电机、水泵     |
| 数据依赖 | 实时温湿度、设备状态、历史动作记录、人工反馈 |

---

## 4. 触发条件

### 4.1 自动触发条件

```yaml
trigger:
  type: sensor_and_time_window
  conditions:
    - sensor: temperature
      operator: ">="
      value: 30
      duration_minutes: 15
    - sensor: humidity
      operator: "<="
      value: 90
    - time_window: "20:00-06:00"
```
````

### 4.2 人工触发条件

示例：

- 用户在微信中询问“今晚要不要通风？”
- 用户要求“帮我看看 1 号棚温度是否异常”
- 用户主动选择某个推荐策略

---

## 5. 风险等级

| 等级 | 是否允许自动执行  | 说明             |
| ---- | ----------------- | ---------------- |
| L0   | 是                | 查询与汇报       |
| L1   | 是                | 提醒与低风险通知 |
| L2   | 需确认            | 中风险短时动作   |
| L3   | 强确认 / 人工处理 | 高风险动作       |
| L4   | 管理员确认        | 长期策略变更     |

本技能默认风险等级：`L2`

风险等级须与 [`../architecture/control-layers.zh.md`](../architecture/control-layers.zh.md) 及 [`../architecture/scene-layer.zh.md`](../architecture/scene-layer.zh.md) 中的 L0–L4 定义保持一致。

---

## 6. 推荐动作序列

```yaml
actions:
  - action_id: greenhouse.query_status
    params:
      greenhouse_id: "<greenhouse_id>"

  - action_id: greenhouse.open_vent
    params:
      greenhouse_id: "<greenhouse_id>"
      duration_seconds: 600
      open_percent: 30
    requires_confirmation: true

  - action_id: greenhouse.query_status
    delay_seconds: 900
    params:
      greenhouse_id: "<greenhouse_id>"
```

---

## 7. 安全限制与互锁

必须列出该技能涉及的本地安全限制。

示例：

- 卷膜正反转互锁；
- 最大连续运行时长；
- 命令过期拒绝；
- 限位异常拒绝；
- 急停输入优先；
- 手动模式优先；
- 离线保护；
- 极端天气禁止自动卷膜。

---

## 8. 用户确认话术

### 8.1 建议执行话术

```text
1 号棚温度已连续 15 分钟高于 30℃，当前 31.2℃，湿度 78%。
建议打开侧帘 30%，通风 10 分钟。
该动作属于 L2 中风险动作，需要你确认后执行。
是否确认？
```

### 8.2 拒绝执行话术

```text
当前不建议执行通风动作：卷膜电机限位状态异常，存在设备风险。
我已记录该异常，建议先人工检查 1 号棚卷膜电机。
```

---

## 9. 预期效果

| 指标     | 目标                               |
| -------- | ---------------------------------- |
| 温度变化 | 例如：15 分钟内下降 0.5–2.0℃       |
| 湿度变化 | 例如：不显著升高或控制在阈值内     |
| 跑棚减少 | 用户无需夜间人工检查               |
| 安全风险 | 无限位异常、无误动作、无长时间运行 |

---

## 10. 复盘指标

每次技能执行后，必须写入动作结果数据。

推荐记录：

- 动作前环境状态；
- 动作执行参数；
- Policy Guard 放行 / 拒绝原因；
- Scene Node 执行状态；
- 动作后 5 / 15 / 30 分钟环境变化；
- 用户是否满意；
- 是否减少跑棚；
- 是否进入成功经验库；
- 是否进入失败案例评测集。

动作结果数据结构见 [`../protocol/action-result-schema.zh.md`](../protocol/action-result-schema.zh.md)（`CommandRecord.telemetry_flywheel`、`operation-logs.jsonl`）。

---

## 11. 成功案例

```yaml
cases:
  - case_id: "case_YYYYMMDD_001"
    greenhouse_id: "gh_001"
    crop: "strawberry"
    result: "temperature_reduced"
    summary: "夜间短时通风 10 分钟后，棚温从 31.2℃ 降至 29.8℃，用户无需跑棚。"
```

---

## 12. 失败案例

```yaml
failure_cases:
  - case_id: "fail_YYYYMMDD_001"
    reason: "humidity_increased_after_ventilation"
    summary: "通风后湿度持续升高，未达到预期效果，需要调整触发条件。"
    next_action: "进入评测集，降低同类场景自动建议置信度。"
```

---

## 13. 版本记录

| 版本 | 日期       | 变更说明 |
| ---- | ---------- | -------- |
| v0.1 | YYYY-MM-DD | 初始草案 |

```

---

## 8 个 greenhouse 场景技能（与 Domain Pack registry 对齐）

`scenes/greenhouse/scene/registry.ts` 中 **8** 个 `SCENE_SKILL_IDS`，均已具 v0.1 文档实例；`apps/api/src/scene/registry.ts` 只是 active Domain Pack runtime facade：

1. [`scenes/greenhouse/docs/skills/night-ventilation-control.zh.md`](../../scenes/greenhouse/docs/skills/night-ventilation-control.zh.md) — `night_ventilation_control`
2. [`scenes/greenhouse/docs/skills/high-temp-emergency-response.zh.md`](../../scenes/greenhouse/docs/skills/high-temp-emergency-response.zh.md) — `high_temp_emergency_response`
3. [`scenes/greenhouse/docs/skills/humidity-mildew-prevention.zh.md`](../../scenes/greenhouse/docs/skills/humidity-mildew-prevention.zh.md) — `humidity_mildew_prevention`
4. [`scenes/greenhouse/docs/skills/cold-wave-protection.zh.md`](../../scenes/greenhouse/docs/skills/cold-wave-protection.zh.md) — `cold_wave_protection`
5. [`scenes/greenhouse/docs/skills/post-irrigation-ventilation.zh.md`](../../scenes/greenhouse/docs/skills/post-irrigation-ventilation.zh.md) — `post_irrigation_ventilation`
6. [`scenes/greenhouse/docs/skills/morning-dew-reduction.zh.md`](../../scenes/greenhouse/docs/skills/morning-dew-reduction.zh.md) — `morning_dew_reduction`
7. [`scenes/greenhouse/docs/skills/worker-manual-override-review.zh.md`](../../scenes/greenhouse/docs/skills/worker-manual-override-review.zh.md) — `worker_manual_override_review`
8. [`scenes/greenhouse/docs/skills/device-efficiency-diagnosis.zh.md`](../../scenes/greenhouse/docs/skills/device-efficiency-diagnosis.zh.md) — `device_efficiency_diagnosis`

架构与联调见 [`../architecture/scene-layer.zh.md`](../architecture/scene-layer.zh.md)。
```
