# 夜间通风控温

## 1. 基本信息

| 字段     | 内容                        |
| -------- | --------------------------- |
| Skill ID | `night_ventilation_control` |
| 中文名称 | 夜间通风控温                |
| 当前版本 | `v0.1`                      |
| 状态     | 试点中                      |
| 负责人   | embodied-agent              |
| 最后更新 | `2026-06-07`                |

---

## 2. 场景定义

### 2.1 适用场景

> 夜间棚内温度持续偏高，农场主不在现场，需要系统根据温度滞回自动开/关侧帘，或在持续超温后主动建议开启夜间模式。

### 2.2 不适用场景

- 卷膜电机限位异常或 `manual_override` 为真；
- 极端大风 / 寒潮预警（需人工判断）；
- 作物处于特殊管理期（如花期防冻优先）。

---

## 3. 适用范围

| 维度     | 说明                                   |
| -------- | -------------------------------------- |
| 棚型     | 单体薄膜棚 / 简易拱棚（P0 试点）       |
| 作物     | 通用叶菜 / 草莓（待试点标注）          |
| 季节     | 夏季夜间 / 梅雨季                      |
| 设备依赖 | 温湿度传感器、卷膜侧帘电机、Scene Node |
| 数据依赖 | 实时遥测、报警规则、command 飞轮快照   |

---

## 4. 触发条件

### 4.1 自动触发（L1 / L2）

```yaml
trigger:
  type: sustained_threshold
  conditions:
    - sensor: temperature_c
      operator: ">"
      value: 30
      duration_minutes: 15 # SUSTAINED_ALERT_MINUTES
  l1: 持续异常微信提醒
  l2: 建议 greenhouse.set_mode(night_vent) + 用户确认
```

实现：`apps/api/src/alerts/sustained-push.ts`

### 4.2 人工触发

- 「1 号棚夜间别超过 30 度」→ `greenhouse.set_mode` / `night_vent`
- L2 建议后用户回复「确认」→ 执行 pending intent
- 「夜间通风模式打开了吗」→ `command.query_status`（`action=set_mode`）；读 `command-logs.jsonl` 真实状态，拒绝时须说明原因（如 `config_version_mismatch`）
- 环控模式仅在指令 **completed** 后写入 `mode-store`；`sent` 时回复「已提交，设备确认后将微信通知」

### 4.3 数据飞轮

- 指令拒绝/完成 → `command-logs.jsonl` + 微信主动通知 → 用户追问走 `command.query_status`，无需每次新增黄金句
- 仅当 prompt/技能契约无法覆盖的**新口语变体**才晋升 `intent-golden.zh.jsonl`（控制总量，避免膨胀）

---

## 5. 风险等级

| 等级 | 是否自动执行 | 本场景                     |
| ---- | ------------ | -------------------------- |
| L1   | 是           | 持续异常提醒               |
| L2   | 需确认       | 建议夜间模式               |
| L3   | 强确认       | 长时间卷膜（非本技能默认） |

本技能默认：**L2**（建议 + 确认后执行）。

---

## 6. 推荐动作序列

```yaml
actions:
  - action_id: greenhouse.query_status
    params:
      greenhouse_id: "<greenhouse_id>"

  - action_id: greenhouse.set_mode
    params:
      greenhouse_id: "<greenhouse_id>"
      mode: night_vent
      max_temp_c: 30
      temp_low_c: 28
```

设备技能映射见各 Domain Pack 的 `skills.ts`（如 `scenes/greenhouse/skills.ts`）中的 `greenhouse.set_mode`。

---

## 7. 预期效果

- 夜间高温时段减少人工跑棚；
- 侧帘按滞回自动调节，避免单次超长 `open_vent` 脉冲；
- L2 建议被采纳后，command log 应含动作前/后遥测（数据飞轮 v0）。

---

## 8. 复盘指标

| 指标              | 说明                                   |
| ----------------- | -------------------------------------- |
| 建议采纳率        | L2 推送后用户确认比例                  |
| 执行后 30min 降温 | `telemetry_flywheel.after` vs `before` |
| 误建议次数        | 用户取消 / 执行后温度未改善            |

---

## 9. Golden / 失败句引用

- `scenes/greenhouse/eval/intent-golden.zh.jsonl`：`1号棚夜间别超过30度`
- 多轮：先「1号棚多少度」再「打开10分钟」→ 见 `npm run verify:chat` 场景 `multi_turn_vent`

---

## 10. 相关文档

- [`docs/operations/llm-model-selection.zh.md`](../../../../docs/operations/llm-model-selection.zh.md) — 理解层飞轮
- [`docs/architecture/control-layers.zh.md`](../../../../docs/architecture/control-layers.zh.md) — `set_mode` 执行层闭环
- [`docs/operations/notifications.zh.md`](../../../../docs/operations/notifications.zh.md) — 报警与推送
