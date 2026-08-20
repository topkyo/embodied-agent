# 灌后通风

## 1. 基本信息

| 字段     | 内容                                                            |
| -------- | --------------------------------------------------------------- |
| Skill ID | `post_irrigation_ventilation`                                   |
| 中文名称 | 灌后通风                                                        |
| 当前版本 | `v0.1`                                                          |
| 状态     | v0.2 已编排（灌溉完成 → L2 通风 10 分钟建议 + pending confirm） |
| 负责人   | embodied-agent                                                  |
| 最后更新 | `2026-06-09`                                                    |

## 2. 场景定义

灌溉结束后棚内湿度上升，需在不影响作物的前提下短时通风降湿，减少霉病风险。

**不适用**：寒潮、大风、限位异常、`manual_override` 为真、用户已设「今晚别提醒」。

## 3. 设备技能序列（L2 建议 + 确认）

1. `irrigation.start` 完成（`irrigation_valve` 指令 `completed`）
2. 主动推送建议：`greenhouse.open_vent` 10 分钟（600s）
3. 用户回复「确认」后执行；15 分钟后 outcome 复盘湿度变化

映射实现：`command-hooks.ts` 在灌溉 `completed` 时触发 `irrigation_completed` → 写入 `pending-confirm`。

## 4. 触发条件

```yaml
trigger:
  type: command_completed
  conditions:
    - device_type: irrigation_valve
      action: start
      status: completed
  risk_level: L2
  requires_confirmation: true
```

## 5. 安全限制

- 默认建议 10 分钟；用户确认后按 `duration_seconds` 执行
- 单次脉冲 ≤14400s；≥600s 走二次确认
- 通风方向互锁；`alert_push_enabled=false` 时不推送
- P1 灌溉工程已实现；试点对外不承诺灌溉能力

## 6. 复盘指标

见 [`docs/protocol/action-result-schema.zh.md`](../../../../docs/protocol/action-result-schema.zh.md)：`scene_skill_id=post_irrigation_ventilation`，`sceneSuccessMetric` 为 `humidity`；15 分钟内湿度下降 ≥3 个百分点记为 success（`evaluate-outcome.ts`：`metrics.humidity_delta_percent < -3`）。

## 7. 版本记录

| 版本 | 日期       | 变更                                       |
| ---- | ---------- | ------------------------------------------ |
| v0.1 | 2026-06-09 | 初始草案，对齐 `command-hooks` 灌后通风 L2 |
