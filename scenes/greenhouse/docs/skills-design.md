# agriculture Domain Pack 技能设计示例

## 目的

本文是 agriculture Domain Pack（greenhouse / 守棚工长（对外名农场工长））的技能示例规格，不是平台全局技能清单。Domain Pack 技能真源见各 pack 的 `skills.ts`；平台层 `packages/core/src/skills.ts` 为空，仅保留 contract 占位。

LLM 只应输出结构化意图，不应该知道或控制 GPIO 引脚、继电器编号、电机接线方式或其他底层硬件细节。

```text
自然语言
  ↓
结构化意图
  ↓
技能
  ↓
安全检查
  ↓
设备指令
```

## 技能设计原则

1. 使用业务级动作，而不是硬件级动作。
2. 每个技能都有严格输入结构。
3. 执行前进行确定性校验。
4. 物理动作必须经过安全保护层。
5. 每次执行都生成可追溯日志。
6. 技能应尽量具备幂等性。
7. 高风险动作需要二次确认。
8. 未知或含糊目标不得执行。

## 技能命名约定

```text
<业务域>.<动作>
```

示例：

```text
greenhouse.query_status
greenhouse.open_vent
greenhouse.close_vent
fan.start
fan.stop
irrigation.start
irrigation.stop
alert.set_threshold
report.set_schedule
report.cancel_schedule
log.query_today
```

## 核心技能结构

### greenhouse.query_status

查询单座温室当前状态。

输入：

```json
{
  "greenhouse_id": "gh-001"
}
```

输出：

```json
{
  "greenhouse_id": "gh-001",
  "temperature_c": 31.2,
  "humidity_percent": 78,
  "vent_status": "closed",
  "fan_status": "off",
  "irrigation_status": "off",
  "updated_at": "2026-06-04T10:00:00Z"
}
```

### greenhouse.query_all_status

查询一个农场内所有温室状态。

输入：

```json
{
  "deployment_id": "dep-gh-pilot-001"
}
```

输出：

```json
{
  "deployment_id": "dep-gh-pilot-001",
  "greenhouses": [
    {
      "greenhouse_id": "gh-001",
      "name": "1 号棚",
      "temperature_c": 31.2,
      "humidity_percent": 78,
      "status": "normal"
    }
  ]
}
```

### greenhouse.open_vent

在限定时长内打开温室通风电机或卷膜侧帘。

输入：

```json
{
  "greenhouse_id": "gh-001",
  "vent_id": "vent-left",
  "duration_seconds": 600
}
```

安全检查：

- 用户具备控制权限。
- 目标通风设备存在。
- 设备在线。
- 手动优先未生效。
- 时长在配置上限内。
- 相反方向未运行。
- 限位开关状态允许打开。

### greenhouse.close_vent

在限定时长内关闭温室通风电机或卷膜侧帘。

输入：

```json
{
  "greenhouse_id": "gh-001",
  "vent_id": "vent-left",
  "duration_seconds": 600
}
```

安全检查与 `greenhouse.open_vent` 相同，但限位开关方向相反。

### greenhouse.stop_vent

立即停止通风电机。

输入：

```json
{
  "greenhouse_id": "gh-001",
  "vent_id": "vent-left"
}
```

停止动作与安全相关，应允许大多数农场操作员执行。

### fan.start

启动风机。

输入：

```json
{
  "fan_id": "fan-gh-001-01",
  "duration_seconds": 900
}
```

安全检查：

- 风机存在且在线。
- 运行时长不超过上限。
- 电气负载不超过限制。

### fan.stop

停止风机。

输入：

```json
{
  "fan_id": "fan-gh-001-01"
}
```

### irrigation.start

> **实现状态：P1 已实现（路由、schema、handler 基础支持；执行依赖 registry 设备绑定与 Scene Node）。** 规格见上文，`scenes/greenhouse/skills.ts` 的 `GREENHOUSE_P1_SKILLS` 现包含灌溉技能。

启动某个分区的灌溉。

输入：

```json
{
  "zone_id": "zone-003",
  "duration_seconds": 1200
}
```

安全检查：

- 分区存在。
- 水泵或阀门在线。
- 运行时长不超过上限。
- 如果有监测，水源可用。
- 如果有监测，不存在漏水或压力报警。

### irrigation.stop

停止某个分区的灌溉。

输入：

```json
{
  "zone_id": "zone-003"
}
```

### irrigation.query_status

查询分区灌溉是否在执行（**读 command store**，非静态文案）。

输入：

```json
{
  "zone_id": "zone-a"
}
```

实现：`scenes/greenhouse/scene/irrigation-status.ts`（contract-first 改造后已迁至 Domain Pack）— 按 registry 中 `irrigation_valve` 设备解析 `zone_id`，查 `deployments/{deployment_id}/command-logs.jsonl` 最近 `start/stop` 指令，返回进行中 / 已完成 / 未灌溉等状态。

### alert.set_threshold

设置温室报警阈值。

输入：

```json
{
  "greenhouse_id": "gh-001",
  "metric": "temperature_c",
  "operator": ">",
  "value": 32,
  "duration_seconds": 300
}
```

### report.set_schedule

通过对话开启**定时状态汇报**（按间隔向微信推送各棚温湿度，非单次查询）。

输入（LLM 输出经 schema 校验后）：

```json
{
  "skill": "report.set_schedule",
  "target": { "deployment_id": "dep-gh-pilot-001" },
  "parameters": {
    "greenhouse_ids": ["gh-001", "gh-002"],
    "interval_minutes": 15
  }
}
```

策略层写入 `{AGENT_DATA_DIR}/deployments/{deployment_id}/status-report-schedules.json`；平台存储字段为 `entity_ids`，农业 Domain Pack 的 LLM intent 参数 `greenhouse_ids` 在 pre-dispatch 阶段显式转换。执行层由 `apps/api/src/report/scheduler.ts` 按间隔推送。仅 owner/operator 可配置。

### report.cancel_schedule

关闭当前用户的定时状态汇报。

```json
{
  "skill": "report.cancel_schedule",
  "target": { "deployment_id": "dep-gh-pilot-001" }
}
```

### log.query_today

查询当天操作日志。

输入：

```json
{
  "deployment_id": "dep-gh-pilot-001",
  "greenhouse_id": "gh-001"
}
```

输出：

```json
{
  "logs": [
    {
      "time": "2026-06-04T09:30:00Z",
      "user": "owner-001",
      "skill": "greenhouse.open_vent",
      "target": "gh-001",
      "result": "completed"
    }
  ]
}
```

## 意图解析输出结构

自然语言理解**仅**由 LLM 完成（structured output / tool call），经 schema 校验后进入技能路由与安全层。意图层不使用正则/关键词规则；LLM 失败时返回澄清或「服务暂不可用」，不静默降级。别名与设备 ID 解析在技能路由层完成（见 `docs/protocol/device-registry.zh.md`「目标解析」）。

所有解析后的 LLM 输出都应匹配以下形状：

```json
{
  "skill": "greenhouse.open_vent",
  "target": {
    "greenhouse_id": "gh-001",
    "vent_id": "vent-left"
  },
  "parameters": {
    "duration_seconds": 600
  },
  "confidence": 0.93,
  "requires_confirmation": false,
  "raw_text": "把 1 号棚打开 10 分钟"
}
```

## 澄清示例

用户说：

```text
把棚打开。
```

系统应追问：

```text
你要打开哪座温室？1 号棚、2 号棚，还是全部温室？
```

用户说：

```text
浇一会儿水。
```

系统应追问：

```text
你要给哪个灌溉分区浇水？浇几分钟？
```

## 确认示例

高风险指令：

```text
关闭所有温室通风口。
```

系统回复：

```text
这会关闭所有温室通风口。请确认：是否关闭 A 农场全部通风口？
```

## 执行日志格式

每次技能执行都应生成日志：

```json
{
  "operation_id": "op-20260604-0001",
  "deployment_id": "dep-gh-pilot-001",
  "user_id": "owner-001",
  "skill": "greenhouse.open_vent",
  "target_device_id": "vent-gh-001-left",
  "parameters": {
    "duration_seconds": 600
  },
  "status": "completed",
  "started_at": "2026-06-04T10:00:00Z",
  "finished_at": "2026-06-04T10:10:00Z"
}
```

## 最小 P0 技能集

技能真源在各 Domain Pack manifest（如 `scenes/greenhouse/skills.ts` 的 `GREENHOUSE_P0_SKILLS`）。平台层 `packages/core/src/skills.ts` 的 `P0_SKILLS` / `P1_SKILLS` / `P2_SKILLS` 为空数组，仅保留 contract 占位；技能枚举以当前 active Domain Pack 为准。上文各节保留各技能 JSON 契约详述。

P1 灌溉路由与 handler **已实现**。主动通知见 [`docs/operations/notifications.zh.md`](../../../docs/operations/notifications.zh.md)。
