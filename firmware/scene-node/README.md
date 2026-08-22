# ESP32 Scene Node 固件

现场 **Scene Node** 固件：SoftAP 配网、MQTT 配对、HTTP 自注册、**GPS heartbeat 坐标上报**。完整协议见 `docs/protocol/esp32-node-registration.zh.md`。

本地无硬件时用 `scripts/node-simulator.ts`（同 MQTT/API 协议，含命令执行闭环）。

## GPS 接线（NEO-6M / ATGM336H）

| GPS 模块 | ESP32                                         |
| -------- | --------------------------------------------- |
| VCC      | 3.3V                                          |
| GND      | GND                                           |
| TX       | GPIO **16**（`GPS_RX_PIN`，模块 TX → ESP RX） |
| RX       | GPIO **17**（可选，`GPS_TX_PIN`）             |

默认 UART2、9600 baud。首次室外冷启动可能需要 1–3 分钟搜星；有 fix 后 heartbeat 自动附带 `gps` 字段，云端用于农场天气预报坐标。

无 GPS 模块时编译加 `-DGPS_ENABLE=0`，heartbeat 仍周期上报（不含 `gps`）。

## 安全

- 默认 `esp32dev` 为 **DRY_RUN**（只打日志）；台架用 `esp32dev-dummy` 驱动假负载 GPIO。
- 接真实电机前须完成假负载验收 + [`docs/operations/safety-checklist.zh.md`](../../docs/operations/safety-checklist.zh.md)。

## 环境

- PlatformIO
- Mosquitto（`docker compose up -d mosquitto`）
- API（`PORT=3001 npm run api:dev`）

## 编译与烧录

```bash
cd firmware/scene-node
export MQTT_HOST="192.168.1.x"   # Mosquitto 所在主机
pio run -e esp32dev -t upload
pio device monitor
```

Stack TLS（`mqtts://8883`，自签证书，台架/开发）：

```bash
# 仓库根目录生成证书：scripts/mosquitto-gen-certs.sh
pio run -e esp32dev-tls -t upload   # WiFiClientSecure + MQTT_TLS_INSECURE
```

Stack TLS + CA 校验（**仅** docker stack `8883`；VPS bare metal 固件仍用非 TLS 环境 `esp32dev` / `esp32dev-stack`）：

```bash
export MQTT_NODE_PASSWORD="与 .env 中 MQTT_NODE_PASSWORD 一致"
export MQTT_CA_CERT_PEM="$(cat path/to/ca.pem)"   # 交付必须注入 CA PEM
pio run -e esp32dev-tls-verify -t upload
```

未注入 `MQTT_CA_CERT_PEM` 时固件**不会**调用 `setInsecure`，TLS 连接也不会真正校验 CA（串口会打印拒绝信息）。交付烧录前必须注入 PEM。

Stack Mosquitto 认证（`docker compose` stack，`allow_anonymous false`）：

```bash
export MQTT_NODE_PASSWORD="与 .env 中 MQTT_NODE_PASSWORD 一致"
pio run -e esp32dev-stack -t upload          # mqtt://1883 + node 用户
# 或 TLS stack：
pio run -e esp32dev-tls-stack -t upload      # mqtts://8883 + node 用户
```

可选预分配 node_id（`platformio.ini` build_flags）：

```ini
-DNODE_ID_ASSIGNED=1 -DNODE_ID=\"node-gh-001-a\"
```

## 假负载接线（台架 `esp32dev-dummy`）

编译：`pio run -e esp32dev-dummy -t upload`（`DRY_RUN_GPIO=0`）

| channel（config）                           | GPIO   | 台架接法                          |
| ------------------------------------------- | ------ | --------------------------------- |
| `relay:vent_left`                           | **25** | LED+电阻 或继电器 IN（3.3V 逻辑） |
| `relay:fan_01`                              | **26** | 同上                              |
| `relay:irrigation_a` / `relay:irrigation_b` | **27** | 同上                              |
| `relay:vent_right`                          | **32** | 同上                              |

- 默认上电 **LOW**；`open`/`start`/`close` 脉冲拉高，到时或 `stop` 拉回 LOW
- 同时仅允许 **1 路 channel** 通电（互锁）；有时长动作必须携带正数 `duration_seconds`，`resolveDurationMs()` 决定定时并受 4h `CMD_MAX_DURATION_MS` 看门狗保护
- `running.runtime_limit_seconds` 与 `completed.result.actual_duration_seconds` 分别上报**有效计划秒数**与**实测 elapsed**，不用未截断的用户 `duration_seconds` 填充
- **勿**在未接假负载时驱动真实电机

## 命令执行（DRY_RUN / 假负载）

绑定并收到 retained `config` 后，固件会：

1. 解析 `devices[]`，上报 `config_applied` node_event
2. 订阅 `commands`，校验 `config_version` 与 `device_id`
3. 按协议上报 `acknowledged` → `running` → `completed`（或 `rejected`）
4. 串口打印 `[node-cmd] DRY_RUN …`，不拉高 GPIO

本地对照验收：`npm run pair:full:e2e -- --attach`（模拟器全闭环；固件逻辑与模拟器事件序列对齐）。

## 配对流程

1. 上电 → SoftAP `DF-Node-xxxx` → 手机配 WiFi
2. 贴纸 QR：`npx tsx scripts/generate-node-label.ts <pack_slug> <node_id>`
3. Web `/scenes/{active-pack}/ops/devices/pair?node_id=...` →「MQTT 下发」
4. 固件收 `deployments/{deployment_id}/pairing/{node_id}/install_code` → `POST /nodes/register`
5. Settings 确认绑定 → retained `deployments/{deployment_id}/nodes/{node_id}/config`

## MQTT Topic

```text
deployments/{deployment_id}/pairing/{node_id}/install_code   # 订阅 retained
deployments/{deployment_id}/nodes/{node_id}/config             # 绑定后订阅 retained
deployments/{deployment_id}/nodes/{node_id}/commands           # 绑定后订阅
deployments/{deployment_id}/nodes/{node_id}/events             # 发布
deployments/{deployment_id}/nodes/{node_id}/telemetry          # 发布 readings[]
deployments/{deployment_id}/nodes/{node_id}/heartbeat          # 注册后每 30s，含 gps（有 fix 时）
```

节点注册成功后，`events`、`telemetry`、`heartbeat` 上报均附带 `node_token`，云端按已注册节点 token 鉴权。

heartbeat `gps` 示例（与云端 `node-gps-cache.json` 对齐）：

```json
{
  "message_type": "heartbeat",
  "node_id": "node-gh-001-a",
  "gps": {
    "latitude": 31.91,
    "longitude": 121.08,
    "accuracy_m": 8,
    "fix_quality": 2
  }
}
```
