# 设备效率诊断

## 1. 基本信息

| 字段     | 内容                                        |
| -------- | ------------------------------------------- |
| Skill ID | `device_efficiency_diagnosis`               |
| 中文名称 | 设备效率诊断                                |
| 当前版本 | `v0.1`                                      |
| 状态     | v0.2 已编排（24h 内重复失败 → L1 诊断推送） |
| 负责人   | embodied-agent                              |
| 最后更新 | `2026-06-09`                                |

## 2. 场景定义

同一设备在 24 小时内多次指令失败（rejected / failed / timeout），提示检查节点在线、限位与手动优先状态，减少无效跑棚。

**不适用**：单次偶发失败、计划内维护停机。

## 3. 动作序列

1. `command-hooks.ts` 监听指令终态 `rejected|failed|timeout`
2. `device-failures.ts` 统计近 24h 失败次数
3. L1 主动推送诊断文案（不自动下发物理指令）
4. 用户可追问 `command.query_status` 或 `greenhouse.query_status`

## 4. 触发条件

```yaml
trigger:
  type: device_repeated_failure
  conditions:
    - failure_count_24h: ">= 3"
  risk_level: L1
```

## 5. 安全限制

- 仅通知，不自动执行通风/风机
- 去重：同 `deployment_id + device_id` 24h 内只推送一次
- `alert_push_enabled=false` 时不推送

## 6. 复盘指标

`sceneSuccessMetric` 为 `completion`；记录失败次数、推送时间与后续指令成功率变化。

## 7. 版本记录

| 版本 | 日期       | 变更                                         |
| ---- | ---------- | -------------------------------------------- |
| v0.1 | 2026-06-09 | 初始草案，对齐 `maybeNotifyDeviceEfficiency` |
