# 寒潮防冻

## 1. 基本信息

| 字段     | 内容                   |
| -------- | ---------------------- |
| Skill ID | `cold_wave_protection` |
| 中文名称 | 寒潮防冻               |
| 当前版本 | `v0.1`                 |
| 状态     | 草案                   |
| 负责人   | embodied-agent         |
| 最后更新 | `2026-06-08`           |

## 2. 场景定义

预报或实况低温（寒潮、霜冻风险）时提醒保温、避免误开通风/夜间模式。

## 3. 已实现能力映射

| 能力         | 实现                                                                  |
| ------------ | --------------------------------------------------------------------- |
| 预报预警     | `weather.query_alert` + `weather/proactive-push.ts`（寒潮仅提醒保温） |
| 关闭夜间通风 | 用户口述 `greenhouse.set_mode(off)`                                   |
| 阈值报警     | `alert.set_threshold` 低温侧（试点可选）                              |

## 4. 触发条件

```yaml
trigger:
  type: weather_proactive
  conditions:
    - forecast_min_temp_c: "< 5"
  risk_level: L1
  action: notify_only # 不自动卷膜
```

## 5. 明确禁止

- 寒潮下自动 `open_vent` 或 `set_mode(night_vent)` 无需确认即执行
- LLM 直接下发 GPIO/MQTT

## 6. 复盘

用户是否在寒潮窗口减少误操作；寒潮推送打开率。

## 7. 版本记录

| 版本 | 日期       | 变更                                |
| ---- | ---------- | ----------------------------------- |
| v0.1 | 2026-06-08 | 初始草案；主动推送已对接 Open-Meteo |
