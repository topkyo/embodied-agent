# 高温应急

## 1. 基本信息

| 字段     | 内容                                                               |
| -------- | ------------------------------------------------------------------ |
| Skill ID | `high_temp_emergency_response`                                     |
| 中文名称 | 高温应急                                                           |
| 当前版本 | `v0.1`                                                             |
| 状态     | v0.2 已编排（≥35°C 持续异常 → 风机 10 分钟建议 + pending confirm） |
| 负责人   | embodied-agent                                                     |
| 最后更新 | `2026-06-08`                                                       |

## 2. 场景定义

白天或傍晚棚温快速攀升（如 >35°C 且持续 10 分钟），需短时加大通风或开风机降温，避免作物热应激。

**不适用**：寒潮、大风、限位异常、`manual_override` 为真。

## 3. 设备技能序列（L2 建议 + 确认）

1. `greenhouse.query_status` — 确认当前温湿度
2. `fan.start`（5–15 分钟）或 `greenhouse.open_vent`（按建议时长脉冲，用户确认后执行）
3. 15 分钟后 `greenhouse.query_status` 复盘

映射实现：用户口述脉冲技能；持续性超温由 `sustained-push.ts` L1→L2 引导 `greenhouse.set_mode`。

## 4. 触发条件

```yaml
trigger:
  type: threshold_or_sustained
  conditions:
    - temperature_c: "> 35"
      duration_minutes: 10
  risk_level: L2
  requires_confirmation: true
```

## 5. 安全限制

- 时长按用户确认值执行；单次脉冲 ≤14400s（`PHYSICAL_PULSE_MAX_SECONDS`）；≥600s 走二次确认
- 通风方向互锁；拒绝时返回 `guidance`
- 工人角色仅可 `fan.start/stop`

## 6. 复盘指标

见 [`docs/protocol/action-result-schema.zh.md`](../../../../docs/protocol/action-result-schema.zh.md)：`telemetry_flywheel.before/after`、跑棚是否减少。

## 7. 版本记录

| 版本 | 日期       | 变更                                                                             |
| ---- | ---------- | -------------------------------------------------------------------------------- |
| v0.1 | 2026-06-08 | 初始草案                                                                         |
| v0.2 | 2026-06-08 | `sustained-push` ≥35°C 分支：`high_temp_emergency_response` + `fan.start` 待确认 |
