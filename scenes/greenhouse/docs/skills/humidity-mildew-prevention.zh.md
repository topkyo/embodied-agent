# 高湿防病害

## 1. 基本信息

| 字段     | 内容                         |
| -------- | ---------------------------- |
| Skill ID | `humidity_mildew_prevention` |
| 中文名称 | 高湿防病害                   |
| 当前版本 | `v0.1`                       |
| 状态     | 草案                         |
| 负责人   | embodied-agent               |
| 最后更新 | `2026-06-08`                 |

## 2. 场景定义

连续高湿（如 RH>85% 且温度 18–28°C）易诱发霉病；在不影响保温前提下短时通风降湿。

**不适用**：夜间寒潮、开花期敏感作物、外部降雨中开帘。

## 3. 设备技能序列

1. `greenhouse.query_status` / `alert.query_threshold`
2. L2 建议：`greenhouse.open_vent` 脉冲 5–10 分钟
3. `agronomy.query_pest` 只读知识补充（P2，试点不承诺）

## 4. 触发条件

```yaml
trigger:
  type: sustained_threshold
  conditions:
    - humidity_percent: "> 85"
      duration_minutes: 20
    - temperature_c: "18..28"
  risk_level: L2
```

## 5. 安全与确认

- 与夜间模式互斥时需先 `greenhouse.set_mode(off)` 或用户确认
- 时长按用户原话；长时脉冲需二次确认；持续控湿用 `set_mode`

## 6. 复盘

动作后湿度是否下降 ≥5%（15 分钟内）；记录至 command 飞轮。

## 7. 版本记录

| 版本 | 日期       | 变更     |
| ---- | ---------- | -------- |
| v0.1 | 2026-06-08 | 初始草案 |
