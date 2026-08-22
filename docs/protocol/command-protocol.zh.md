# 指令通信协议

## 目的

指令通信协议定义云端设备指令服务与现场 Scene Node 之间的 MQTT 消息合同。

本文定义 **Scene Node MQTT 协议**。greenhouse 物理控制默认使用 MQTT；robot/M20 使用独立 `m20_http` transport 进入 command lifecycle，不复用本文 topic。WebSocket 尚未作为设备执行 transport。

## 设计原则

1. 云端只发送业务动作对应的设备指令，不发送 GPIO 级指令。
2. 每条指令都有唯一 `command_id` 和 `idempotency_key`。
3. 每条指令都有 `expires_at`，Scene Node 必须拒绝过期指令。
4. Scene Node 必须返回确认、运行状态和最终结果。
5. Scene Node 必须独立执行本地超时、互锁、限位和手动优先保护。
6. 云端重发相同幂等键的指令不能造成重复危险动作。

## MQTT Topic

**当前实现**（见 `docs/protocol/esp32-node-registration.zh.md`）：唯一执行路径为 Scene Node；command 必须带 `node_id`，可选 `config_version`（节点侧校验）。

### 指令下发

```text
deployments/{deployment_id}/nodes/{node_id}/commands
```

方向：云端到边缘 Scene Node。

### 配置下发（retained）

```text
deployments/{deployment_id}/nodes/{node_id}/config
```

### 配对安装码（retained）

```text
deployments/{deployment_id}/pairing/{node_id}/install_code
```

### 事件上报

```text
deployments/{deployment_id}/nodes/{node_id}/events
```

方向：Scene Node 到云端（含 `command_event` 与 `node_event`）。

### 遥测上报

```text
deployments/{deployment_id}/nodes/{node_id}/telemetry
```

方向：Scene Node 到云端；传感器使用 `readings[]` 按 `device_id` 上报。

### 心跳上报

```text
deployments/{deployment_id}/nodes/{node_id}/heartbeat
```

方向：Scene Node 到云端；payload 含 `node_id`。

## 指令消息

```json
{
  "message_type": "command",
  "protocol_version": "0.1",
  "command_id": "cmd-20260604-0001",
  "idempotency_key": "dep-gh-pilot-001:owner-001:greenhouse.open_vent:gh-001:vent-sim-gh-001:20260604T100000Z",
  "deployment_id": "dep-gh-pilot-001",
  "entity_id": "gh-001",
  "node_id": "node-sim-gh-001",
  "config_version": 1,
  "device_id": "vent-sim-gh-001",
  "device_type": "vent_motor",
  "action": "open",
  "parameters": {
    "duration_seconds": 600
  },
  "safety_limits": {
    "require_manual_override_clear": true,
    "require_limit_switch_check": true,
    "interlock_group": "vent-sim-gh-001"
  },
  "issued_by": {
    "user_id": "owner-001",
    "role": "owner",
    "platform": "wechat",
    "conversation_id": "farm-group-001"
  },
  "created_at": "2026-06-04T10:00:00Z",
  "expires_at": "2026-06-04T10:00:30Z"
}
```

字段说明：

| 字段             | 类型   | 必填 | 说明                                                                                                                |
| ---------------- | ------ | ---: | ------------------------------------------------------------------------------------------------------------------- |
| message_type     | string |   是 | 固定为 `command`                                                                                                    |
| protocol_version | string |   是 | 协议版本                                                                                                            |
| command_id       | string |   是 | 全局唯一指令 ID                                                                                                     |
| idempotency_key  | string |   是 | 幂等键                                                                                                              |
| deployment_id    | string |   是 | Deployment ID                                                                                                       |
| entity_id        | string |   否 | 业务实体 ID；农业场景如 `gh-001`。云端命令记录和查询过滤只使用显式 `entity_id`，不从 `device_id` 推断               |
| node_id          | string |   是 | Scene Node ID                                                                                                       |
| config_version   | number |   否 | 节点已应用的配置版本                                                                                                |
| device_id        | string |   是 | 目标设备 ID                                                                                                         |
| device_type      | string |   是 | 设备类型                                                                                                            |
| action           | string |   是 | 设备动作                                                                                                            |
| parameters       | object |   否 | 动作参数，无参数动作可省略                                                                                          |
| safety_limits    | object |   否 | 可选互锁/限位等提示；`max_duration_seconds` 仅作固件安全上限提示，**不**替代 `duration_seconds`，也不压用户指定时长 |
| issued_by        | object |   是 | 操作来源                                                                                                            |
| created_at       | string |   是 | ISO 8601 UTC 时间                                                                                                   |
| expires_at       | string |   是 | ISO 8601 UTC 时间                                                                                                   |

## 指令动作

平台协议不维护跨领域 action 枚举，只要求 `action` 为非空字符串。下面是 agriculture Scene Node 的当前示例动作：

| device_type           | action   | 参数                                                 | 说明                         |
| --------------------- | -------- | ---------------------------------------------------- | ---------------------------- |
| vent_motor            | open     | duration_seconds                                     | 打开通风电机                 |
| vent_motor            | close    | duration_seconds                                     | 关闭通风电机                 |
| vent_motor            | stop     | 无                                                   | 停止通风电机                 |
| fan                   | start    | duration_seconds                                     | 启动风机                     |
| fan                   | stop     | 无                                                   | 停止风机                     |
| greenhouse_controller | set_mode | mode, max_temp_c, temp_high_c, temp_low_c, until_iso | 夜间滞回通风（边缘本地闭环） |

`set_mode` 参数示例：

```json
{
  "mode": "night_vent",
  "max_temp_c": 30,
  "temp_high_c": 30,
  "temp_low_c": 28,
  "until_iso": "2026-06-05T06:00:00Z"
}
```

`mode: "off"` 关闭环控模式。

agriculture P1 示例：

| device_type      | action | 参数             | 说明       |
| ---------------- | ------ | ---------------- | ---------- |
| irrigation_valve | open   | duration_seconds | 打开灌溉阀 |
| irrigation_valve | close  | 无               | 关闭灌溉阀 |
| water_pump       | start  | duration_seconds | 启动水泵   |
| water_pump       | stop   | 无               | 停止水泵   |

## 指令状态机

云端状态：

```text
created -> validated -> queued -> sent -> acknowledged -> running -> completed
                                              ↘ rejected
                                              ↘ failed
                                              ↘ timeout
                                              ↘ cancelled
```

边缘事件必须推动云端状态变化。云端不能仅凭 MQTT publish 成功就认为设备已执行。

### Domain Pack direct executor

部分 Domain Pack 可以不用 MQTT Scene Node，而是通过显式 transport 调用外部执行端。例如 robotics/M20 使用 `m20_http`：

- 云端仍先创建 command record，记录 `created_at`、`issued_by`、`scene_skill_id`、`risk_level` 和 `user_confirmed`。
- HTTP 调用发出前，云端将 command 标记为 `sent`。
- HTTP 调用成功后，云端写入一条由 API 生成的 `completed` command event，并把执行端返回体保存到 `result`。
- HTTP 调用失败、超时或配置缺失时，云端将 command 标记为 `failed`，错误码使用 Domain Pack 的 `physicalExecutor.failureCode`。
- command record 与 operation log 必须标明执行口径：MQTT 路径写入 `execution_transport: "mqtt"` / `lifecycle_source: "scene_node_mqtt"`，operation log 写入 `execution_path: "mqtt_scene_node"` / `event_source: "scene_node_mqtt"`；direct executor 路径写入执行 transport（如 `m20_http`）与 `lifecycle_source: "api_domain_executor"`，operation log 写入 `execution_path: "domain_physical_executor"` / `event_source: "api_domain_executor"`。
- direct executor 不产生 Scene Node 的 `acknowledged` / `running` 边缘事件，也不证明本地互锁、急停或 GPIO 级安全；文档和报告必须将它与 MQTT Scene Node lifecycle 分开表述。

## 事件消息

Scene Node 上报的 `command_event`、`telemetry` 与 `heartbeat` payload 必须携带 `node_token`。云端会按 `{deployment_id, node_id}` 校验 token；缺失、错误或节点未注册 token 时直接丢弃并记录结构化日志。

### acknowledged

Scene Node 收到指令并完成基础校验后上报。

```json
{
  "message_type": "command_event",
  "protocol_version": "0.1",
  "event_id": "evt-20260604-0001",
  "command_id": "cmd-20260604-0001",
  "idempotency_key": "dep-gh-pilot-001:owner-001:greenhouse.open_vent:gh-001:vent-sim-gh-001:20260604T100000Z",
  "deployment_id": "dep-gh-pilot-001",
  "node_id": "node-sim-gh-001",
  "node_token": "node_xxx",
  "config_version": 1,
  "device_id": "vent-sim-gh-001",
  "status": "acknowledged",
  "occurred_at": "2026-06-04T10:00:02Z"
}
```

### running

Scene Node 开始执行物理动作后上报。`runtime_limit_seconds` 为固件 `resolveDurationMs()` 后的**有效**秒数（含 4h 看门狗截断）；有时长动作缺失或传入非正 `duration_seconds` 必须拒绝，`stop` 等无时长动作除外。

```json
{
  "message_type": "command_event",
  "protocol_version": "0.1",
  "event_id": "evt-20260604-0002",
  "command_id": "cmd-20260604-0001",
  "idempotency_key": "dep-gh-pilot-001:owner-001:greenhouse.open_vent:gh-001:vent-sim-gh-001:20260604T100000Z",
  "deployment_id": "dep-gh-pilot-001",
  "node_id": "node-sim-gh-001",
  "node_token": "node_xxx",
  "config_version": 1,
  "device_id": "vent-sim-gh-001",
  "status": "running",
  "runtime_limit_seconds": 600,
  "occurred_at": "2026-06-04T10:00:03Z"
}
```

### completed

Scene Node 完成动作后上报。`result.actual_duration_seconds` 为**实测 elapsed**（墙钟计时），不用未截断的用户计划时长填充。

```json
{
  "message_type": "command_event",
  "protocol_version": "0.1",
  "event_id": "evt-20260604-0003",
  "command_id": "cmd-20260604-0001",
  "idempotency_key": "dep-gh-pilot-001:owner-001:greenhouse.open_vent:gh-001:vent-sim-gh-001:20260604T100000Z",
  "deployment_id": "dep-gh-pilot-001",
  "node_id": "node-sim-gh-001",
  "node_token": "node_xxx",
  "config_version": 1,
  "device_id": "vent-sim-gh-001",
  "status": "completed",
  "result": {
    "reason": "duration_elapsed",
    "actual_duration_seconds": 600
  },
  "occurred_at": "2026-06-04T10:10:03Z"
}
```

### rejected

Scene Node 拒绝指令时上报。

```json
{
  "message_type": "command_event",
  "protocol_version": "0.1",
  "event_id": "evt-20260604-0004",
  "command_id": "cmd-20260604-0001",
  "idempotency_key": "dep-gh-pilot-001:owner-001:greenhouse.open_vent:gh-001:vent-sim-gh-001:20260604T100000Z",
  "deployment_id": "dep-gh-pilot-001",
  "node_id": "node-sim-gh-001",
  "node_token": "node_xxx",
  "config_version": 1,
  "device_id": "vent-sim-gh-001",
  "status": "rejected",
  "error": {
    "code": "manual_override_active",
    "message": "Manual override is active on device vent-sim-gh-001."
  },
  "occurred_at": "2026-06-04T10:00:02Z"
}
```

错误码：

| code                   | 说明                   |
| ---------------------- | ---------------------- |
| expired_command        | 指令已过期             |
| duplicate_command      | 重复指令，已按幂等处理 |
| unknown_device         | 未知设备               |
| unsupported_action     | 不支持的动作           |
| invalid_parameters     | 参数不合法             |
| manual_override_active | 手动优先生效           |
| interlock_active       | 互锁冲突               |
| limit_switch_blocked   | 限位状态不允许执行     |
| local_timeout          | 本地超时               |
| hardware_fault         | 硬件故障               |
| emergency_stop_active  | 急停生效               |

## 遥测消息

```json
{
  "message_type": "telemetry",
  "protocol_version": "0.1",
  "deployment_id": "dep-gh-pilot-001",
  "node_id": "node-sim-gh-001",
  "node_token": "node_xxx",
  "readings": [
    {
      "device_id": "sensor-sim-gh-001",
      "metric": "temperature_c",
      "value": 31.2,
      "unit": "celsius",
      "measured_at": "2026-06-04T10:00:00Z"
    },
    {
      "device_id": "sensor-sim-gh-001",
      "metric": "humidity_percent",
      "value": 78,
      "unit": "percent",
      "measured_at": "2026-06-04T10:00:00Z"
    }
  ]
}
```

## 心跳消息

```json
{
  "message_type": "heartbeat",
  "protocol_version": "0.1",
  "deployment_id": "dep-gh-pilot-001",
  "node_id": "node-sim-gh-001",
  "node_token": "node_xxx",
  "firmware_version": "0.1.0",
  "device_statuses": [
    {
      "device_id": "vent-sim-gh-001",
      "state": "idle",
      "manual_override": false,
      "fault": null
    },
    {
      "device_id": "fan-sim-gh-001",
      "state": "off",
      "manual_override": false,
      "fault": null
    }
  ],
  "reported_at": "2026-06-04T10:00:00Z"
}
```

心跳间隔建议为 30 秒。云端超过 `DEVICE_HEARTBEAT_TIMEOUT_MS`（默认 90s）未收到某 `node_id` 心跳，应将该节点关联设备视为离线并拒绝新的控制动作。

## 幂等与重试

云端行为：

- publish 后等待 `acknowledged`。
- 5 秒内未收到确认可重发同一 `command_id` 和 `idempotency_key`。
- 重发最多 2 次。
- 超过 15 秒未确认，指令标记为 `timeout`。

边缘行为：

- 已处理过的 `idempotency_key` 必须缓存至少 10 分钟。
- 若收到重复指令且原指令仍在运行，返回当前状态，不重新启动动作。
- 若收到重复指令且原指令已完成，返回 `duplicate_command` 或最近最终结果，不重新执行动作。

## 安全执行顺序

Scene Node 收到控制指令后按以下顺序处理：

1. 校验 `protocol_version`。
2. 校验 `deployment_id`、`node_id`、`device_id`、`config_version`（若携带）。
3. 校验 `expires_at`。
4. 校验幂等键。
5. 校验 action 是否在本地设备能力内。
6. 校验参数；云端理解层已限制单次脉冲 ≤14400s（`PHYSICAL_PULSE_MAX_SECONDS`）。有时长动作必须携带正数 `duration_seconds`，否则 Scene Node 拒绝；固件按 `resolveDurationMs()` 执行（4h 看门狗），`running`/`completed` 上报有效/实测时长。
7. 检查急停状态。
8. 检查手动优先状态。
9. 检查互锁状态。
10. 检查限位状态。
11. 输出物理控制信号。
12. 启动本地超时保护。
13. 上报 `running`。
14. 完成、停止或异常时关闭输出并上报最终状态。

任何一步失败都必须关闭相关输出，并上报 `rejected` 或 `failed`。

## MVP 验收要求

协议进入实现前必须明确：

- 云端 command 协议只校验 `action` 为非空字符串；动作词表由 active Domain Pack 的 `commandBuilder` 和对应 Scene Node / direct executor 能力表显式声明并测试。
- 边缘拒绝过期指令。
- 边缘处理重复指令不重复执行动作。
- 云端只有收到 `running` 才向用户回复“已开始执行”。
- 云端收到最终状态后写入操作日志。
- 节点离线时云端拒绝新的控制动作。
