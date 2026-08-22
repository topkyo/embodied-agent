# ESP32 Scene Node 自注册与场景绑定机制

## 背景

当前项目已经具备 agriculture Domain Pack（当前交付场景为 `scenes/greenhouse` 守棚工长（对外名农场工长））的基础控制闭环；下列示例使用农业 deployment/entity/device，但注册机制本身是平台抽象：

- `device-registry.json` 描述 deployment、entity 和 device。
- Admin API 已支持读取和更新 registry。
- 技能路由可以把 LLM 意图中的 `greenhouse_id`、`fan_id` 解析为具体 `device_id`。
- 云端已通过 MQTT 下发设备指令，并订阅 telemetry、heartbeat 和 command event。
- ESP32 原型固件可以作为最小硬件执行端上报状态并响应指令。

早期文档曾使用“网关”描述现场硬件，但真实产品抽象应是 **Scene Node / 场景智能节点**：它不是单纯转发消息的中转层，而是具身Agent 在现场的采集、执行、联网和安全保护节点。

因此，下一阶段重点不是继续堆叠 LLM 能力，而是补齐：

- 节点首次安装与自注册。
- 管理员确认节点绑定的场景和设备。
- 云端 registry 作为唯一设备映射真源。
- 节点配置下发、应用确认和版本校验。
- 按设备粒度上报 telemetry 并支撑语音查询与控制。

## 目标

第一版目标是支撑 1–2 户真实温室试点安装，让安装员可以把一个 ESP32 Scene Node 绑定到某座大棚，并登记该节点连接的传感器和执行器。

本机制采用：

- **node 作为硬件核心身份**：`node_id` 是现场 ESP32 Scene Node 的一等身份；注册、配对、config、heartbeat、telemetry 和 command event 都围绕 `node_id`。
- **安装码配对**：安装码只用于首次配对；注册成功后云端签发长期 `node_token`。
- **实体绑定**：节点安装码与绑定使用 `deployment_id` + `entity_id`；农业 Domain Pack 中 `entity_id=gh-001` 代表一个温室实体。
- **设备绑定**：传感器和执行器仍以 `device_id` 作为云端可查询、可控制、可审计对象。
- **云端真源**：节点只声明硬件能力，不能自己决定成为哪个大棚的哪个设备。
- **配置版本化**：设备映射通过 MQTT retained config topic 下发，节点按 `config_version` 校验命令。

## 当前实现状态

### 云端注册绑定（实施顺序 1–11）✅ 已实现

以下流程在 API + Web + `scripts/node-simulator.ts` 上已跑通并通过 e2e 验证：

- `deployment / entity / node / device` schema；设备必须绑定 `node_id`，可选绑定 `entity_id`。
- dev/CI 显式 seed registry（真源为 agriculture Domain Pack 的 `canonical-sim`）：**双节点** `node-sim-gh-001` / `node-sim-gh-002`，各绑定 gh-001 / gh-002，每棚 5 台设备（温湿度 sensor、vent_motor、fan、greenhouse_controller、irrigation_valve）。详见 `docs/protocol/device-registry.zh.md`「Canonical 双棚模拟节点设备清单」。
- `GET /admin/registry` 与 `PUT /admin/registry`；registry 校验含 node 引用完整性。
- 意图到设备解析：通风、风机、环控器控制解析到 `device_id` + `node_id`。
- MQTT topic：`deployments/{deployment_id}/nodes/{node_id}/commands|events|telemetry|heartbeat`；retained `.../config`；配对 `.../pairing/{node_id}/install_code`。
- `POST /nodes/register`、安装码生成/过期/一次性、`node_token` 签发。
- 场景工作台 `/scenes/{active-pack}/ops/devices/pair`、待绑定节点列表、`PUT /admin/nodes/:node_id/binding` 场景绑定。
- node config 下发、`config_version` 校验、`node_event.config_applied`（由模拟器上报）。
- telemetry `readings[]` 按 `device_id` 上报并聚合到大棚状态。
- 自动化：`npm run pair:e2e`、`npm run pair:full:e2e`；本地基础服务用 `npm run dev:greenhouse -- --no-monitor`，监控面板用 `npm run dev:greenhouse` 打开。

### 边缘执行闭环

| 执行端                      | 状态          | 说明                                                                                                               |
| --------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------ |
| `scripts/node-simulator.ts` | ✅ 全闭环     | config apply、commands、events、telemetry、heartbeat                                                               |
| `firmware/scene-node/`      | ⚠️ 假负载可验 | 配网/注册/GPS/config/command 非阻塞状态机；`esp32dev-dummy` 驱动 GPIO 假负载；**无** telemetry readings / 真实电机 |

本地开发与 e2e 默认用模拟器；ESP32 固件当前仅验证「上电 → 配对 → pending 注册」。

### 未实现 / 后续

- 固件侧真实 GPIO 驱动、telemetry readings、本地互锁与现场安全反射（当前 DRY_RUN 仅串口日志 + MQTT 事件）。
- 多节点多棚生产部署运维面板细化。
- 固件 NVS 持久化与 OTA 版本管理。
- 生产现场新 ESP32 仍须配对绑定；本地 greenhouse profile 需要双棚模拟时显式运行 `npm run ensure:sim-dual` rebind gh-002，无需手改 `device-registry.json`。

**微信/语音交互**：与注册绑定无关；须配置 LLM API Key，未配置时对话接口返回 503，无运行时兜底。

## 核心概念

### scene node

`node` 表示一个 ESP32 Scene Node。它是现场硬件主体，负责连接传感器、继电器、电机驱动、风机控制线路或其他场景设备。

建议字段：

```json
{
  "node_id": "node-gh-001-a",
  "deployment_id": "dep-gh-pilot-001",
  "entity_id": "gh-001",
  "name": "1 号棚节点 A",
  "firmware_version": "0.1.0",
  "config_version": 1,
  "status": "pending",
  "registered_at": "2026-06-06T08:00:00.000Z",
  "last_seen_at": "2026-06-06T08:05:00.000Z"
}
```

状态建议：

| status      | 说明                                 |
| ----------- | ------------------------------------ |
| pending     | 节点已自注册，但还未绑定到场景和设备 |
| active      | 已绑定，可接收命令和上报遥测         |
| disabled    | 管理员禁用                           |
| maintenance | 维护中，不允许控制                   |

### scene

在 agriculture 示例中，entity 是农业 Domain Pack 里的大棚：

```text
dep-gh-pilot-001
  -> greenhouse gh-001
    -> node node-gh-001-a
```

不要在第一版 API 中提前引入复杂的跨行业场景模型。长期产品形态可以扩展到宠物和家庭，但当前实现只需要把 `node` 与 `deployment_id / entity_id` 绑定清楚；农业领域里 `entity_id` 对应具体温室。

### device

`device` 继续作为云端可查询、可控制、可接收遥测的硬件对象。第一版在 device 上增加节点绑定信息：

```json
{
  "device_id": "sensor-gh-001-env",
  "deployment_id": "dep-gh-pilot-001",
  "entity_id": "gh-001",
  "device_type": "sensor",
  "name": "1 号棚温湿度传感器",
  "aliases": ["1号棚温湿度", "一号棚温湿度"],
  "node_id": "node-gh-001-a",
  "channel": "i2c:0x44",
  "metrics": ["temperature_c", "humidity_percent"],
  "config_version": 1,
  "status": "active"
}
```

执行器示例：

```json
{
  "device_id": "vent-gh-001-left",
  "deployment_id": "dep-gh-pilot-001",
  "entity_id": "gh-001",
  "device_type": "vent_motor",
  "name": "1 号棚左侧帘",
  "aliases": ["1号棚侧帘", "一号棚侧帘"],
  "node_id": "node-gh-001-a",
  "channel": "relay:vent_left",
  "default_for": "vent_motor",
  "confirm_duration_threshold_seconds": 600,
  "manual_override": false,
  "config_version": 1,
  "status": "active"
}
```

## 注册流程

### 1. 管理员生成安装码

管理员在 Web/Admin 里选择 deployment，必要时预选 entity，生成一次性安装码。

建议 API：

```http
POST /admin/node-install-codes
```

请求：

```json
{
  "deployment_id": "dep-gh-pilot-001",
  "entity_id": "gh-001",
  "ttl_minutes": 30
}
```

响应：

```json
{
  "ok": true,
  "install_code": "DF-482913",
  "deployment_id": "dep-gh-pilot-001",
  "entity_id": "gh-001",
  "expires_at": "2026-06-06T08:30:00.000Z"
}
```

约束：

- 安装码一次性使用。
- 安装码过期后不能注册。
- 安装码只授权节点进入 `pending`，不直接允许控制设备。
- 安装码不能作为长期凭证保存在节点里；注册成功后必须废止。

**Settings 面板说明（试点）：**

- `待绑定节点 (pending)` 为空 **不是故障**：表示还没有节点用当前有效安装码调用 `POST /nodes/register`。
- 表单中的 `entity_id` 必须与安装码目标实体一致（农业试点中例如 `gh-002`，勿仍填 `gh-001`）。
- 绑定时的 `device_id` 须为节点专属 ID，**不可**复用当前 registry 已有 ID（如 dev/CI seed 中的模拟设备 ID），否则会报「设备 ID 重复」。
- 无硬件时可用模拟器：`INSTALL_CODE=DF-XXXX GREENHOUSE_ID=gh-00X npx tsx scripts/node-simulator.ts --auto`

**现场扫码配对（推荐，无需手输安装码）：**

1. 节点贴纸 QR 指向 `/scenes/{active-pack}/ops/devices/pair?node_id=...`（`npx tsx scripts/generate-node-label.ts <pack_slug> <node_id>` 生成）
2. 首次上电：`ENABLE_NODE_REG=1` 固件开 SoftAP `DF-Node-xxxx`，手机配户主 WiFi
3. 管理员在配对页点「MQTT 下发」→ `POST /admin/nodes/:id/pair` → retained topic `deployments/{deployment_id}/pairing/{node_id}/install_code`
4. 固件收码后自动 `POST /nodes/register` → Settings pending → 确认绑定

自动化验证：

- 配对段（MQTT 发码 → register → pending）：`npm run pair:e2e`
- 全链路（`--pair` 模拟器 → 绑定 → MQTT 直发 command，不经过 LLM）：`npm run pair:full:e2e`（默认隔离 `AGENT_DATA_DIR`）；附着 profile 时 `AGENT_DATA_DIR=.agentstack/dev-profiles/greenhouse/data npm run pair:full:e2e -- --attach`
- 微信/语音交互须单独配置 LLM API Key 验证，与注册绑定无关
- 模拟器配对常驻：`NODE_ID=node-demo-001 npx tsx scripts/node-simulator.ts --pair`

### 2. ESP32 Scene Node 自注册

ESP32 第一次开机后，通过安装码向云端注册。

建议 API：

```http
POST /nodes/register
```

请求：

```json
{
  "deployment_id": "dep-gh-pilot-001",
  "install_code": "DF-482913",
  "node_id": "node-gh-001-a",
  "firmware_version": "0.1.0",
  "capabilities": {
    "sensors": [
      {
        "channel": "i2c:0x44",
        "metrics": ["temperature_c", "humidity_percent"]
      }
    ],
    "actuators": [
      {
        "channel": "relay:vent_left",
        "device_type": "vent_motor",
        "actions": ["open", "close", "stop"]
      },
      {
        "channel": "relay:fan_01",
        "device_type": "fan",
        "actions": ["start", "stop"]
      }
    ]
  }
}
```

响应：

```json
{
  "ok": true,
  "status": "pending",
  "node_id": "node-gh-001-a",
  "deployment_id": "dep-gh-pilot-001",
  "entity_id": "gh-001",
  "node_token": "node-token-redacted",
  "message": "节点已注册，等待管理员确认设备绑定。"
}
```

注册成功后：

- 云端废止安装码。
- 节点本地持久化 `node_token`、``deployment_id`和`node_id`。
- 后续 heartbeat、telemetry、config ack 都必须使用 `Authorization: Bearer {node_token}` 或等价的 MQTT 鉴权身份。
- 节点可以继续上报 heartbeat，但在管理员确认绑定和配置应用前不应执行控制命令。

### 3. 管理员确认绑定

管理员查看待绑定节点：

```http
GET /admin/nodes?status=pending
```

管理员确认节点所在大棚，并为能力声明生成或确认 device 映射：

```http
PUT /admin/nodes/{node_id}/binding
```

请求：

```json
{
  "deployment_id": "dep-gh-pilot-001",
  "entity_id": "gh-001",
  "devices": [
    {
      "device_id": "sensor-gh-001-env",
      "device_type": "sensor",
      "name": "1 号棚温湿度传感器",
      "channel": "i2c:0x44",
      "metrics": ["temperature_c", "humidity_percent"],
      "status": "active"
    },
    {
      "device_id": "vent-gh-001-left",
      "device_type": "vent_motor",
      "name": "1 号棚左侧帘",
      "channel": "relay:vent_left",
      "default_for": "vent_motor",
      "status": "active"
    }
  ]
}
```

响应：

```json
{
  "ok": true,
  "node": {
    "node_id": "node-gh-001-a",
    "status": "active",
    "config_version": 1
  }
}
```

绑定完成后：

- registry 写入或更新 `nodes` 和 `devices`。
- 控制类意图可以解析到该节点下的执行器。
- telemetry 可以按 `device_id` 聚合到对应大棚。
- 云端递增 `config_version`，并通过 MQTT retained config topic 下发设备映射。
- ESP32 收到配置后持久化并上报 `config_applied`，此后才允许执行控制命令。

## MQTT 与遥测

目标 Scene Node 协议使用 `nodes/{node_id}` 作为路由层级。

指令 topic：

```text
deployments/{deployment_id}/nodes/{node_id}/commands
```

节点事件：

```text
deployments/{deployment_id}/nodes/{node_id}/events
```

节点心跳：

```text
deployments/{deployment_id}/nodes/{node_id}/heartbeat
```

节点 telemetry：

```text
deployments/{deployment_id}/nodes/{node_id}/telemetry
```

节点配置：

```text
deployments/{deployment_id}/nodes/{node_id}/config
```

配对安装码（retained）：

```text
deployments/{deployment_id}/pairing/{node_id}/install_code
```

配置 topic 应使用 retained message。Admin 绑定、换棚、禁用设备或修改通道映射时，云端递增 `config_version` 并重新发布配置。

配置 payload 示例：

```json
{
  "message_type": "node_config",
  "protocol_version": "0.1",
  "deployment_id": "dep-gh-pilot-001",
  "node_id": "node-gh-001-a",
  "entity_id": "gh-001",
  "config_version": 1,
  "status": "active",
  "devices": [
    {
      "device_id": "sensor-gh-001-env",
      "device_type": "sensor",
      "channel": "i2c:0x44",
      "metrics": ["temperature_c", "humidity_percent"]
    },
    {
      "device_id": "vent-gh-001-left",
      "device_type": "vent_motor",
      "channel": "relay:vent_left",
      "actions": ["open", "close", "stop"]
    }
  ]
}
```

节点应用成功后，上报 node event：

```json
{
  "message_type": "node_event",
  "protocol_version": "0.1",
  "event_id": "evt-config-node-gh-001-a-1",
  "event_type": "config_applied",
  "deployment_id": "dep-gh-pilot-001",
  "node_id": "node-gh-001-a",
  "config_version": 1,
  "occurred_at": "2026-06-06T08:10:00.000Z"
}
```

配置应用失败时，上报：

```json
{
  "message_type": "node_event",
  "protocol_version": "0.1",
  "event_id": "evt-config-node-gh-001-a-1-rejected",
  "event_type": "config_rejected",
  "deployment_id": "dep-gh-pilot-001",
  "node_id": "node-gh-001-a",
  "config_version": 1,
  "error": {
    "code": "invalid_channel",
    "message": "Unknown channel relay:vent_left"
  },
  "occurred_at": "2026-06-06T08:10:00.000Z"
}
```

heartbeat 示例：

```json
{
  "message_type": "heartbeat",
  "protocol_version": "0.1",
  "deployment_id": "dep-gh-pilot-001",
  "node_id": "node-gh-001-a",
  "firmware_version": "0.1.0",
  "config_version": 1,
  "uptime_ms": 123456,
  "wifi_rssi": -58
}
```

telemetry 示例：

```json
{
  "message_type": "telemetry",
  "protocol_version": "0.1",
  "deployment_id": "dep-gh-pilot-001",
  "node_id": "node-gh-001-a",
  "config_version": 1,
  "reported_at": "2026-06-06T08:10:00.000Z",
  "readings": [
    {
      "device_id": "sensor-gh-001-env",
      "metric": "temperature_c",
      "value": 28.6
    },
    {
      "device_id": "sensor-gh-001-env",
      "metric": "humidity_percent",
      "value": 72.1
    }
  ]
}
```

云端接收后，根据 registry 中的 `device_id -> entity_id` 映射更新农业领域的大棚状态查询缓存。

迁移完成后的控制命令建议携带当前配置版本，同时保留现有 command 协议必填字段：

```json
{
  "message_type": "command",
  "protocol_version": "0.1",
  "command_id": "cmd-20260606-0001",
  "idempotency_key": "idem-20260606-0001",
  "deployment_id": "dep-gh-pilot-001",
  "node_id": "node-gh-001-a",
  "device_id": "vent-gh-001-left",
  "device_type": "vent_motor",
  "action": "open",
  "config_version": 1,
  "parameters": {
    "duration_seconds": 600
  },

  "issued_by": {
    "user_id": "owner-001",
    "role": "owner",
    "platform": "wechat",
    "conversation_id": "site-group-001"
  },
  "created_at": "2026-06-06T08:12:00.000Z",
  "expires_at": "2026-06-06T08:13:00.000Z"
}
```

ESP32 收到命令后必须校验：

- `config_version` 与本地已应用配置一致。
- `device_id` 存在于本地配置。
- `action` 在该设备允许动作内。
- 本地通道存在且安全检查通过。
- 命令未过期，且 `idempotency_key` 没有被重复执行。

## 固件行为

ESP32 固件第一版应支持：

1. 读取本地 `node_id`、安装码、API 地址和 MQTT 地址。
2. 未绑定时调用 `/nodes/register`。
3. 注册成功后保存 `node_token`、``deployment_id`、`node_id` 和节点状态。
4. 等待管理员确认绑定，期间只上报 heartbeat，不执行控制命令。
5. 订阅 retained config topic，收到配置后校验并持久化。
6. 成功应用配置后上报 `node_event.config_applied`。
7. 绑定激活且配置已应用后订阅 command topic。
8. 收到 command 后按 `device_id` 查找本地 channel，并校验 `config_version`。
9. 执行动作前检查本地安全条件：手动优先、急停、限位、互锁、运行超时。
10. 上报 command lifecycle event：acknowledged、running、completed、failed 或 rejected。`running` 带有效 `runtime_limit_seconds`（`resolveDurationMs` 结果）；`completed` 的 `actual_duration_seconds` 为实测 elapsed。
11. 单次脉冲时长与云端 schema 对齐：上限 14400s（`PHYSICAL_PULSE_MAX_SECONDS` / `CMD_MAX_DURATION_MS`）；更长环控由 `set_mode` 承担，不由超长 `open_vent` 代替。
12. 周期性上报 heartbeat 和 telemetry readings。

## 安全边界

- 未绑定节点不能执行控制命令。
- 安装码只允许一次性注册，不等同于长期凭证。
- `node_token` 是节点长期身份，泄露后必须可吊销。
- 云端 registry 是唯一设备映射真源；节点自报能力不能直接成为可控设备事实。
- 节点未应用最新 `config_version` 时不能执行控制命令。
- 生产环境不允许 registry 缺失或损坏后回退默认设备。
- `node_id`、`device_id`、`channel` 必须唯一且可审计。
- 多个同类设备绑定到同一大棚时，必须显式设置默认设备，否则控制意图应追问澄清。
- 设备状态为 `disabled` 或 `maintenance` 时，云端必须拒绝控制。

## 与历史硬件命名的关系

API、registry、MQTT 与本地开发已收敛到 Scene Node（`node_id` + `deployments/{deployment_id}/nodes/{node}/...`）。本地执行端为 `scripts/node-simulator.ts`；现场硬件为 `firmware/scene-node/`。

## 实施顺序

1. 扩展 registry schema，增加 `nodes` 和 device 绑定字段。
2. 新增安装码 store 和 Admin 生成 API。
3. 新增 `/nodes/register`，校验安装码并签发 `node_token`。
4. 新增 Admin 待绑定节点查询和绑定确认 API。
5. 新增 MQTT node config 发布逻辑，支持 retained config 和 `config_version`。
6. 调整 command 消息，携带当前 `config_version` 和 `node_id`。
7. 新增 node event schema，支持 `config_applied` 和 `config_rejected`。
8. 调整 telemetry store，支持 `readings` 按 `device_id` 聚合。
9. 调整 ESP32 固件，支持注册、持久化 `node_token`、应用 config、按 `device_id` 分派 channel。
10. 在 Web 设置台增加节点安装入口。
11. 补充 e2e 脚本：生成安装码 -> 节点注册 -> 管理员绑定 -> config_applied -> 语音控制 -> MQTT command -> command event -> 日志可查。

## 验收标准

### 云端注册绑定（1–11）✅ 已通过

以下项在 API + Web + `node-simulator.ts` 上已验证：

- 安装员能为某座大棚生成安装码。
- 节点（模拟器或 ESP32）使用安装码注册后进入 pending。
- 注册成功后云端签发 `node_token`，安装码失效。
- 管理员能看到 pending 节点并绑定到大棚。
- 绑定后 registry 中出现 node 和对应 devices。
- 绑定后云端发布 retained config，节点上报 `node_event.config_applied`。
- “1 号棚现在多少度”读取该节点上报的温湿度。
- “打开 1 号棚风机”能解析到该节点下的 fan device，并下发带 `node_id` 和 `config_version` 的 MQTT command。
- 节点拒绝旧配置版本、未知 `device_id`、过期命令或未授权 action。
- 未绑定节点、过期安装码、重复安装码、损坏 registry 都失败可见。
- 多设备歧义不会随机执行，会要求用户说明目标设备。

### ESP32 固件执行闭环 ⏳ 待迭代

- config 订阅与应用、`config_applied` 上报。
- command 订阅与执行、lifecycle events。
- telemetry / heartbeat 周期性上报。
- GPIO 驱动与现场安全互锁（接真负载前须完成 `safety-checklist.zh.md`）。

真实试点只使用 Scene Node 协议；不要为早期硬件命名新增兼容路径。
