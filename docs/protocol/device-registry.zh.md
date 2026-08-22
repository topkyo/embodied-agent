# 设备注册表规格

## Implementation Status

当前 API 已落地显式 registry/resolver + **Scene Node 支持**（按 `docs/protocol/esp32-node-registration.zh.md` 完成 1-11 步）。

- 双棚模拟 registry 真源在 agriculture Domain Pack 的 `registry/canonical-sim`；dev/CI 需要显式调用 `buildCanonicalSimRegistry()` 写入 `device-registry.json`，运行时不导出或加载隐式注册表。
- `store.ts` / `resolver.ts` 支持 `nodes[]` + device `node_id` 绑定。
- 安装码、`/nodes/register`、admin 绑定已实现，绑定后自动 retained config + devices 写入 registry。
- 设备必须绑定 `node_id`；MQTT 走 `deployments/{deployment_id}/nodes/{node_id}/...`。
- 本地 dev profile seed 包含 **两个** Scene Node：`node-sim-gh-001`（gh-001）、`node-sim-gh-002`（gh-002），各 5 台设备；`scripts/node-simulator.ts` 为执行端；需要重建双棚模拟绑定时显式运行 `npm run ensure:sim-dual`。

运行时不会在缺失 registry 时隐式生成默认表；生产、测试和 dev profile 都必须显式写入 `device-registry.json`。下一步如需现场配置热更新，可把当前 seed 表替换为数据库 loader。

## 目的

设备注册表是技能、安全检查和设备指令之间的确定性映射层。

自然语言里的 `1 号棚`、`左侧帘`、`1 号风机` 不能直接进入设备控制逻辑。系统必须先把这些人类可读名称解析为已注册的温室、分区和设备 ID，再根据设备配置执行权限、安全和指令检查。

## MVP 范围

第一版设备注册表覆盖（本地 dev/CI 显式 seed `canonical-sim` 为双棚双节点）：

- 1+ deployment（`device-registry.json` 可多 deployment；活跃租户由 `settings.deployment_id` 决定）
- 1-2 座温室（本地 dev/CI seed 为 gh-001 + gh-002）
- 每座温室 1 个温湿度传感器（`temperature_c`、`humidity_percent`）
- 每座温室 1 个通风电机（`default_for: vent_motor`）
- 每座温室 1 个风机（`default_for: fan`）
- 每座温室 1 个环控器（`default_for: greenhouse_controller`）
- 每座温室 1 个灌溉阀（P1 已路由；gh-001→`zone-a`，gh-002→`zone-b`）

## 核心实体

### deployment

Deployment 是权限、设备和日志的顶层边界。

```json
{
  "deployment_id": "dep-gh-pilot-001",
  "name": "A 农场试点",
  "timezone": "Asia/Shanghai",
  "status": "active"
}
```

字段说明：

| 字段          | 类型   | 必填 | 说明                       |
| ------------- | ------ | ---: | -------------------------- |
| deployment_id | string |   是 | 全局唯一 deployment ID     |
| name          | string |   是 | 用户可见名称               |
| timezone      | string |   是 | 日志、报警和日报使用的时区 |
| status        | string |   是 | `active` / `disabled`      |

### entity

Entity 是 Domain Pack 可解释的业务实体。农业 Domain Pack 中，温室是 `domain_id=agriculture`、`entity_type=greenhouse` 的 entity。

```json
{
  "entity_id": "gh-001",
  "entity_type": "greenhouse",
  "domain_id": "agriculture",
  "deployment_id": "dep-gh-pilot-001",
  "name": "1 号棚",
  "aliases": ["一号棚", "1棚", "一棚"],
  "status": "active"
}
```

字段说明：

| 字段          | 类型     | 必填 | 说明                               |
| ------------- | -------- | ---: | ---------------------------------- |
| entity_id     | string   |   是 | 全局唯一业务实体 ID                |
| entity_type   | string   |   是 | 业务实体类型，如 `greenhouse`      |
| domain_id     | string   |   是 | 所属 Domain Pack，如 `agriculture` |
| deployment_id | string   |   是 | 所属 deployment                    |
| name          | string   |   是 | 标准显示名称                       |
| aliases       | string[] |   是 | 自然语言解析使用的别名             |
| status        | string   |   是 | `active` / `disabled`              |
| metadata      | object   |   否 | Domain Pack 自定义扩展             |

同一 `domain_id` 内 entity alias 不得冲突。若别名冲突，技能路由必须触发澄清，而不是选择第一个匹配项。

### device

设备是云端可以查询、控制或接收遥测的硬件对象。

```json
{
  "device_id": "vent-sim-gh-001",
  "deployment_id": "dep-gh-pilot-001",
  "entity_id": "gh-001",
  "device_type": "vent_motor",
  "name": "1 号棚模拟左侧帘",
  "aliases": ["1号棚侧帘", "一号棚侧帘"],
  "node_id": "node-sim-gh-001",
  "status": "active",
  "channel": "relay:vent_left",
  "default_for": "vent_motor"
}
```

字段说明：

| 字段                               | 类型     | 必填 | 说明                                                            |
| ---------------------------------- | -------- | ---: | --------------------------------------------------------------- |
| device_id                          | string   |   是 | 全局唯一设备 ID                                                 |
| deployment_id                      | string   |   是 | 所属 deployment                                                 |
| entity_id                          | string   |   否 | 绑定的业务实体；deployment 级设备可为空                         |
| device_type                        | string   |   是 | 设备类型                                                        |
| name                               | string   |   是 | 标准显示名称                                                    |
| aliases                            | string[] |   是 | 用户可说出的别名                                                |
| node_id                            | string   |   是 | 设备绑定的 Scene Node                                           |
| status                             | string   |   是 | `active` / `offline` / `maintenance` / `disabled`               |
| capabilities                       | string[] |   否 | 允许的动作集合                                                  |
| transport                          | string   |   否 | 传输类型或协议标识                                              |
| metadata                           | object   |   否 | Domain Pack 自定义扩展                                          |
| default_for                        | string   |   否 | 默认设备用途，如 `vent_motor` / `fan`                           |
| max_duration_seconds               | number   |   否 | **可选**；灌溉等场景可标注建议上限；通风/风机云端**不按此拒执** |
| confirm_duration_threshold_seconds | number   |   否 | 超过该秒数需二次确认（默认 600，见 `guard.ts`）                 |
| manual_override                    | boolean  |   否 | 当前是否处于手动优先                                            |
| channel                            | string   |   否 | 节点本地通道，如 `relay:vent_left`                              |
| metrics                            | string[] |   否 | 该设备上报的指标，如 `temperature_c`                            |
| zone_id                            | string   |   否 | 所属灌溉分区                                                    |

MVP 设备类型：

| device_type           | 用途                                                           | P0/P1 |
| --------------------- | -------------------------------------------------------------- | ----: |
| sensor                | 温湿度遥测（`metrics` 含 `temperature_c`、`humidity_percent`） |    P0 |
| vent_motor            | 卷膜侧帘或通风电机                                             |    P0 |
| fan                   | 排风扇                                                         |    P0 |
| greenhouse_controller | 环控模式（如夜间通风 `set_mode`）                              |    P0 |
| irrigation_valve      | 灌溉阀                                                         |    P1 |
| water_pump            | 水泵                                                           |  预留 |

### node

Scene Node 是现场 ESP32 智能节点。详见 `docs/protocol/esp32-node-registration.zh.md`。

```json
{
  "node_id": "node-sim-gh-001",
  "deployment_id": "dep-gh-pilot-001",
  "entity_id": "gh-001",
  "firmware_version": "sim-0.3.0",
  "config_version": 1,
  "status": "active"
}
```

字段说明：

| 字段             | 类型   | 必填 | 说明                                              |
| ---------------- | ------ | ---: | ------------------------------------------------- |
| node_id          | string |   是 | 全局唯一节点 ID                                   |
| deployment_id    | string |   是 | 所属 deployment                                   |
| entity_id        | string |   否 | 绑定后的业务实体                                  |
| name             | string |   否 | 用户可见节点名称                                  |
| firmware_version | string |   否 | 固件版本                                          |
| config_version   | number |   否 | 已应用配置版本                                    |
| registered_at    | string |   否 | 注册时间                                          |
| last_seen_at     | string |   否 | 最近心跳时间                                      |
| status           | string |   是 | `pending` / `active` / `disabled` / `maintenance` |

### user_role

用户权限必须绑定到 deployment 和角色。

**持久化**：`$AGENT_DATA_DIR/users.json`（配置台 **用户** 面板或 `GET/POST/PUT/DELETE /admin/users`）。生产和测试必须显式提供该文件；缺失时 API 失败可见。本地 dev profile 由启动脚本写入显式种子。微信等平台账号映射见 `platform-bindings.json`（`docs/integrations/user-binding.zh.md`）。

```json
{
  "user_id": "owner-001",
  "deployment_id": "dep-gh-pilot-001",
  "display_name": "张三",
  "role": "owner"
}
```

角色能力：

| role     | 查询 | 控制 | 管理阈值 | 急停 | 管理用户 |
| -------- | ---: | ---: | -------: | ---: | -------: |
| owner    |   是 |   是 |       是 |   是 |       是 |
| operator |   是 |   是 |       否 |   是 |       否 |
| viewer   |   是 |   否 |       否 |   否 |       否 |

停止类动作如 `greenhouse.stop_vent` 和 `fan.stop` 应允许 `owner` 和 `operator` 执行。未知用户不能查询敏感状态，也不能控制设备。

## 目标解析规则（技能路由层）

以下规则在**技能路由**阶段执行，用于把 LLM 已给出的领域目标 / 设备别名解析为内部 ID；**不是**意图层的正则或关键词理解引擎。

技能路由解析目标时按以下顺序处理：

1. 在当前 deployment 内匹配实体别名。
2. 在匹配到的实体内匹配设备别名。
3. 若用户只说 `1 号棚通风`，默认选择该温室唯一的 `vent_motor`。
4. 若存在多个候选设备，必须追问澄清。
5. 若目标设备状态不是 `active`，必须拒绝执行。

农业 Domain Pack 的 LLM intent 仍可使用 `target.greenhouse_id`。进入技能路由后，该值必须匹配 registry 中 `entities[].entity_id`，且该 entity 需满足 `domain_id=agriculture`、`entity_type=greenhouse`、`status=active`。设备解析使用 `devices[].entity_id` 关联到该温室实体。

示例：

```json
{
  "raw_text": "把 1 号棚侧帘打开 10 分钟",
  "resolved": {
    "deployment_id": "dep-gh-pilot-001",
    "entity_id": "gh-001",
    "device_id": "vent-gh-001-left",
    "action": "open",
    "duration_seconds": 600
  }
}
```

## 安全配置建议值

MVP 推荐显式配置值：

| 设备类型         | 建议操作时长 | 二次确认阈值 | 是否必须指定时长 | 云端时长策略                                                 |
| ---------------- | -----------: | -----------: | ---------------: | ------------------------------------------------------------ |
| vent_motor       |       300 秒 |       600 秒 |               是 | 按用户 `duration_seconds`；schema 上限 14400s                |
| fan              |       300 秒 |       600 秒 |               是 | 同 vent；`evaluateCommand` 缺时长即拒绝                      |
| irrigation_valve |       600 秒 |       600 秒 |               是 | 同 vent；registry 可配 `max_duration_seconds` 作显式安全上限 |
| water_pump       |       600 秒 |       600 秒 |               是 | 同上                                                         |

单次脉冲上限真源：`PHYSICAL_PULSE_MAX_SECONDS`（`packages/core/src/schemas/intent.ts`，14400s）。理解层校验拒绝 >4h；固件 `CMD_MAX_DURATION_MS` 与之对齐。`running.runtime_limit_seconds` 与 `completed.result.actual_duration_seconds` 均反映**有效执行**（截断后计划时长 / 实测 elapsed），非未截断的用户原话。整夜环控用 `greenhouse.set_mode`，不用超长 `open_vent`。

## Canonical 双棚模拟节点设备清单

真源：agriculture Domain Pack 的 `registry/canonical-sim`（`SIM_NODE_PRESETS` / `buildCanonicalSimRegistry()`）。两节点结构对称，每棚 5 台设备。

| 节点              | 温室   | device_id               | device_type           | default_for           | channel / metrics                               | 说明                                       |
| ----------------- | ------ | ----------------------- | --------------------- | --------------------- | ----------------------------------------------- | ------------------------------------------ |
| `node-sim-gh-001` | gh-001 | `sensor-sim-gh-001`     | sensor                | —                     | `i2c:0x44`；`temperature_c`、`humidity_percent` | 温湿度遥测                                 |
|                   |        | `vent-sim-gh-001`       | vent_motor            | vent_motor            | `relay:vent_left`                               | 侧帘通风                                   |
|                   |        | `fan-sim-gh-001`        | fan                   | fan                   | `relay:fan_01`                                  | 风机                                       |
|                   |        | `gh-001`                | greenhouse_controller | greenhouse_controller | —                                               | 环控器（rebind MQTT id：`ghc-sim-gh-001`） |
|                   |        | `irrigation-sim-gh-001` | irrigation_valve      | irrigation            | `relay:irrigation_a`；`zone_id: zone-a`         | A 区灌溉                                   |
| `node-sim-gh-002` | gh-002 | `sensor-sim-gh-002`     | sensor                | —                     | 同上                                            | 温湿度遥测                                 |
|                   |        | `vent-sim-gh-002`       | vent_motor            | vent_motor            | `relay:vent_left`                               | 侧帘通风                                   |
|                   |        | `fan-sim-gh-002`        | fan                   | fan                   | `relay:fan_01`                                  | 风机                                       |
|                   |        | `ghc-sim-gh-002`        | greenhouse_controller | greenhouse_controller | —                                               | 环控器                                     |
|                   |        | `irrigation-sim-gh-002` | irrigation_valve      | irrigation            | `relay:irrigation_b`；`zone_id: zone-b`         | B 区灌溉                                   |

### 技能覆盖（节点设备相关）

| 技能层  | 代表技能                                                     | 依赖设备                         |  gh-001   |  gh-002   |
| ------- | ------------------------------------------------------------ | -------------------------------- | :-------: | :-------: |
| P0 查询 | `greenhouse.query_status`、`greenhouse.query_all_status`     | sensor 遥测                      |    ✅     |    ✅     |
| P0 通风 | `greenhouse.open_vent` / `close_vent` / `stop_vent`          | vent_motor                       |    ✅     |    ✅     |
| P0 环控 | `greenhouse.set_mode`                                        | greenhouse_controller            |    ✅     |    ✅     |
| P0 风机 | `fan.start` / `fan.stop`                                     | fan                              |    ✅     |    ✅     |
| P0 告警 | `alert.set_threshold` 等                                     | sensor 遥测                      |    ✅     |    ✅     |
| P0 指令 | `command.query_status`                                       | 指令日志（无额外设备）           |    ✅     |    ✅     |
| P1 灌溉 | `irrigation.start` / `stop` / `query_status`                 | irrigation_valve                 | ✅ zone-a | ✅ zone-b |
| P2 外部 | `weather.*`、`satellite.query_ndvi`、`tasks.*`、`agronomy.*` | 农场配置/API，**不**依赖节点设备 |     —     |     —     |

模拟器 `scripts/node-simulator.ts` 按 `NODE_ID` 从 MQTT config 读取 `sensor` 的 `device_id`，周期上报 `temperature_c` / `humidity_percent`；两路模拟器并行时各报各棚遥测。

完整 JSON 见 `scripts/fixtures/stack-bootstrap/device-registry.json`；本地双棚对齐用 `AGENT_DATA_DIR=<profile/data> npm run ensure:sim-dual`（经 API rebind 写入 canonical 节点与 MQTT config）。

## 验收要求

设备注册表在进入云端骨架实现前必须满足：

- `entities[]` 必须存在；农业温室用 `entity_id` 表达，不使用 registry 级 `greenhouse_id` 字段。
- 同一 `domain_id` 内 entity alias 不得冲突。
- 每个设备都有 `node_id`，且引用 registry 中已存在的 node。
- 设备如绑定业务实体，必须使用 `entity_id` 且引用已存在的 entity。
- 通风/风机设备不要求 `max_duration_seconds`；灌溉可选配置。云端 safety 层不因缺失该字段拒执。
- MQTT topic 由 `node_id` 推导，不在 registry 重复存储。
- 每个聊天用户都能映射到一个具身Agent 现场用户和角色。
