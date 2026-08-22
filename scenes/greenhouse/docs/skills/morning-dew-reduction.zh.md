# 清晨降露

## 1. 基本信息

| 字段     | 内容                                    |
| -------- | --------------------------------------- |
| Skill ID | `morning_dew_reduction`                 |
| 中文名称 | 清晨降露                                |
| 当前版本 | `v0.1`                                  |
| 状态     | v0.2 已编排（早简报高湿 → L1 通风建议） |
| 负责人   | embodied-agent                          |
| 最后更新 | `2026-06-09`                            |

## 2. 场景定义

日出前后棚内湿度偏高、叶面结露，建议在安全时段短时通风，降低霉病与结露风险。

**不适用**：寒潮预警、大风、限位异常、开花期敏感作物。

## 3. 设备技能序列

1. 早简报（`digest/scheduler`）检测高湿棚号
2. L1 建议：日出后 `greenhouse.open_vent` 5–10 分钟
3. 用户主动要求时走脉冲或 `greenhouse.set_mode`

映射实现：`digest/builder.ts` 触发 `digest_morning_high_humidity` → `morning_dew_reduction`。

## 4. 触发条件

```yaml
trigger:
  type: digest_morning_high_humidity
  conditions:
    - humidity_percent: "> 85"
    - time_window: "digest_morning_hour 前后"
  risk_level: L1
```

## 5. 安全与确认

- L1 仅建议，不自动执行物理动作
- 用户口述执行时，时长按原话；≥600s 需二次确认
- 与夜间环控模式并存时需用户确认优先级

## 6. 复盘指标

`sceneSuccessMetric` 为 `humidity`；记录简报推送与用户后续是否执行通风。

## 7. 版本记录

| 版本 | 日期       | 变更                                                     |
| ---- | ---------- | -------------------------------------------------------- |
| v0.1 | 2026-06-09 | 初始草案，对齐早简报 `digest_morning_high_humidity` 触发 |
