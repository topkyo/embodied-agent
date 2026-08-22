# 双棚 L3/L4 数据飞轮联调手册

用 **gh-001 / gh-002** 两个 Scene Node 模拟器，在**无真棚**前提下转动场景/运营数据飞轮。

## 前提

- LLM Key 已写入 `AGENT_DATA_DIR/settings.json`（配置台）或通过环境变量提供
- **L3/L4 NLG / 周报固定 `deepseek-v4-pro`**（见 `apps/api/src/scene/llm-model.ts`）
- 理解层对话仍用 Flash（配置台 `llm_model` 默认即可）

## 脚本入口说明

| 入口                                           | 实际脚本                                 | 说明                                                         |
| ---------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------ |
| `npm run domain:flywheel`                      | `scripts/domain-flywheel-agriculture.sh` | **推荐**一键全闭环                                           |
| `npm run domain:flywheel -- --setup-only`      | 同上 `--setup-only`                      | 仅 baseline/阈值/快照；要求 API/模拟器已就绪，不负责拉起服务 |
| `scripts/domain-flywheel-agriculture-setup.sh` | agriculture flywheel 子步骤              | 由 agriculture adapter 内部调用，勿单独当主入口              |

## 一键全闭环（推荐）

```bash
# 默认：使用独立验证运行数据目录启动 agriculture/greenhouse 后台服务 + 临时 full 双棚模拟器 + 全自动飞轮
npm run domain:flywheel

# 附着已有后台服务/模拟器（模拟器须已带 full+REACT；API 须 FLYWHEEL_DEV=1）
npm run domain:flywheel -- --attach

# 完整时长（约 30+ 分钟）
npm run domain:flywheel -- --realtime

# 仅 baseline/阈值/快照，不跑 e2e；不会拉起 API/模拟器
npm run domain:flywheel -- --setup-only
```

成功标志：终端输出 `::DOMAIN_FLYWHEEL_PASSED::`。

### 启动顺序（默认后台服务 + 临时模拟器）

`domain-flywheel-agriculture.sh` 在拉起栈前会：

1. **`resetFlywheelRunState`** — 清理 `pending-confirm`、sustained episode、相关 alert 冷却键（避免脏状态导致 503 或 pending 超时）
2. **启动后台基础服务** — API 传入 `FLYWHEEL_DEV=1` 与 fast/realtime 时间 env
3. **dev-only 显式 `ensure-sim-dual` + force rebind** — 仅飞轮脚本内部用于双棚 MQTT config 对齐；API 启动与 `dev:greenhouse` monitor 不会自动执行
4. **启动临时 gh-002 模拟器并等待心跳** — full 场景、`SIM_TELEMETRY_REACT=1`
5. **轮询 `GET /dev/flywheel/ready`** — 最多 180s，须双棚遥测 + 双节点心跳新鲜 + sustained 可评估

就绪门闩响应示例：

```json
{
  "ready": true,
  "entities": ["gh-001", "gh-002"],
  "telemetry_ready": true,
  "nodes_online": true,
  "flywheel_dev": true,
  "checks": [
    { "id": "flywheel_telemetry", "ok": true },
    { "id": "flywheel_nodes_online", "ok": true },
    { "id": "flywheel_config_applied", "ok": true },
    { "id": "greenhouse_sustained_alerts", "ok": true }
  ],
  "nodes": [
    { "node_id": "node-sim-gh-001", "online": true },
    { "node_id": "node-sim-gh-002", "online": true }
  ]
}
```

`/dev/flywheel/ready` 须 API 进程 **`FLYWHEEL_DEV=1`**（非生产 dev 路由，与其他 flywheel dev 端点一致）。所需实体、遥测指标、节点清单与领域检查由当前 active Domain Pack 的 `runtimeReadiness.flywheel` 显式声明。

### 模拟器默认场景 `full`

| 节点              | 温室   | 遥测场景                            | 硬件（canonical-sim）                 |
| ----------------- | ------ | ----------------------------------- | ------------------------------------- |
| `node-sim-gh-001` | gh-001 | 高湿 `high_humidity`（88%）         | 温湿度、通风、风机、环控、灌溉 zone-a |
| `node-sim-gh-002` | gh-002 | 高温应急 `emergency_heat`（36.2°C） | 温湿度、通风、风机、环控、灌溉 zone-b |

`SIM_TELEMETRY_REACT=1`：通风/风机降温降湿；灌溉阀 `open` 期间湿度上升，结束后回落。

### 八场景全覆盖（`domain-flywheel-agriculture-e2e.ts`）

| 场景 ID                         | 联调路径                                        |
| ------------------------------- | ----------------------------------------------- |
| `high_temp_emergency_response`  | gh-002 持续超温 ≥35°C → L2 风机待确认           |
| `humidity_mildew_prevention`    | gh-001 持续高湿 → L2 通风待确认                 |
| `post_irrigation_ventilation`   | gh-001 灌溉完成 → 灌后通风待确认                |
| `night_ventilation_control`     | 天气高温 L2 → 夜间通风模式待确认                |
| `cold_wave_protection`          | `POST /dev/flywheel/weather-proactive` 寒潮模拟 |
| `morning_dew_reduction`         | `GET /dev/flywheel/digest-preview` 晨间高湿简报 |
| `worker_manual_override_review` | 环控器 `manual_override` → 云控拒绝             |
| `device_efficiency_diagnosis`   | `flywheel-fail-*` 会话触发 3 次模拟失败         |

成功时写入 `deployments/dep-gh-pilot-001/flywheel-scene-attestations.jsonl` 并断言八场景无缺失。

实现：[`scripts/lib/sim-telemetry.ts`](../../../scripts/lib/sim-telemetry.ts)、[`scripts/node-simulator.ts`](../../../scripts/node-simulator.ts)。

### 时间模式

| 模式         | 命令                      | `SUSTAINED_ALERT_MINUTES` | `SUSTAINED_L2_COOLDOWN_SECONDS` | `DEVICE_HEARTBEAT_TIMEOUT_MS` | `SCENE_OUTCOME_WINDOWS_MINUTES` | `SIM_MAX_COMMAND_MS` |
| ------------ | ------------------------- | ------------------------- | ------------------------------- | ----------------------------- | ------------------------------- | -------------------- |
| fast（默认） | `npm run domain:flywheel` | 3                         | 0                               | 300000                        | 1                               | 60000                |
| realtime     | `--realtime`              | 15                        | （默认）                        | （默认 90s）                  | 15                              | 0                    |

fast 模式将 L2 冷却置 0、心跳超时放宽至 5 分钟，避免 gh-002 冷启动期间误报离线。Nightly workflow 会额外覆盖 `SIM_MAX_COMMAND_MS=8000` 以缩短 CI 时间。

### Dev 旁路

`FLYWHEEL_DEV=1`（`npm run domain:flywheel` 默认开启并传入 API）：本地飞轮跳过真实微信 HTTP 发送，仍写入 `pending-confirm` 供 `dev/chat`「确认」。

飞轮联调请用 `npm run domain:flywheel`；附着已有栈时须手动保证 API 带 `FLYWHEEL_DEV=1`。

### 多场景 pending

同一用户多条 `scene_skill_id` 并存时，`getPendingConfirmForUser` 不再默认取最新一条；须通过对应 `conversation_id` 确认，或仅有一条 pending 时方可跨会话确认。微信侧多条并存会提示「多个待确认操作」。

## 飞轮链路（全自动）

```text
1. seed wechat 绑定 + POST pilot/baseline
2. dev/chat 设 gh-002 高温阈值
3. sustained-push 检测连续超温 → L2 + pending-confirm
4. dev/chat「确认」→ 通风/风机（scene_skill_id）
5. 模拟器 completed + telemetry_flywheel 快照
6. outcome 窗口到期 → scene-outcomes.jsonl
7. dev/chat 周报 advice.query_weekly（Pro）
8. GET pilot/roi 断言摘要非空
```

## 推荐话术（手动补测）

| 步骤     | 话术                      | 期望                             |
| -------- | ------------------------- | -------------------------------- |
| 设阈值   | `2号棚温度超过30度就报警` | `alert.set_threshold`            |
| 确认     | `确认`                    | 执行 pending 通风/风机           |
| 周报     | `这周运营有什么建议`      | `advice.query_weekly`（**Pro**） |
| 采纳策略 | `采纳策略建议1`           | `policy.apply_suggestion`        |

## 产物路径（默认 `AGENT_DATA_DIR=.agentstack/dev-runs/domain-flywheel/agriculture/data`）

| 文件                                                | 内容                         |
| --------------------------------------------------- | ---------------------------- |
| `deployments/dep-gh-pilot-001/scene-outcomes.jsonl` | L3 复盘记录                  |
| `deployments/dep-gh-pilot-001/command-logs.jsonl`   | 指令生命周期 + flywheel 快照 |
| `deployments/dep-gh-pilot-001/pending-confirm.json` | L2 待确认（e2e 轮询）        |
| `deployments/dep-gh-pilot-001/pilot-baseline.json`  | 每周跑棚基线                 |
| `wechat-ilink/flywheel-dev.json`                    | 飞轮 dev 微信账号种子        |

## 验收标准

| 检查项  | 命令 / 位置                                              |
| ------- | -------------------------------------------------------- |
| 全闭环  | `npm run domain:flywheel` → `::DOMAIN_FLYWHEEL_PASSED::` |
| 冒烟    | `npm run domain:l3-smoke`                                |
| outcome | `GET /admin/scene-outcomes`                              |
| ROI     | `GET /admin/pilot/roi?since_days=7`                      |

## 跑通经验（联调记录）

以下条目来自 2026-06 平台与 greenhouse 解耦后的双棚全量飞轮联调；按此操作可将 fast 模式稳定在 **约 5–6 分钟** 内输出 `::DOMAIN_FLYWHEEL_PASSED::`，并支持**连续多轮**重跑。

### 可靠一键命令（fast）

```bash
# 1. 门闩：须 ready=true、flywheel_dev=true、双棚 online
curl -sf http://127.0.0.1:3001/dev/flywheel/ready

# 2. 清状态（磁盘 + API 内存 dedup）；每次跑前必做
curl -s -X POST http://127.0.0.1:3001/dev/flywheel/reset-state

# 3. 八场景 e2e（勿并行起第二个实例）
AGENT_DATA_DIR="$(pwd)/.agentstack/dev-runs/domain-flywheel/agriculture/data" \
FLYWHEEL_DEV=1 FLYWHEEL_FAST=1 DEVICE_HEARTBEAT_TIMEOUT_MS=300000 \
SIM_MAX_COMMAND_MS=60000 \
npx tsx scripts/domain-flywheel-agriculture-e2e.ts
```

推荐仍用 `npm run domain:flywheel`（显式执行 reset、ensure-sim、ready 门闩与 e2e）；手动跑时须自行逐项执行前置，不依赖 API 或 monitor 自动补齐。

### 前置清单（缺一则易在步骤 1–2 或 8 失败）

| 项       | 要求                                                                                                                                                    |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API      | `FLYWHEEL_DEV=1`；`GET /dev/flywheel/ready` → `flywheel_dev: true`                                                                                      |
| 数据目录 | API 与双棚模拟器**同一** `AGENT_DATA_DIR`，用**绝对路径**（勿用 `apps/api` 下的相对 `data`）                                                            |
| 模拟器   | `SIM_TELEMETRY_SCENARIO=full`、`SIM_TELEMETRY_REACT=1`；默认由脚本管理临时双棚模拟器，手动单模拟器配对时可用 `npx tsx scripts/node-simulator.ts --auto` |
| 注册表   | 附着节点后须能解析设备；需要重建双棚模拟 binding 时显式运行 `ENSURE_SIM_DUAL_FORCE_REBIND=1 npm run ensure:sim-dual`，否则 `unknown_device`             |
| 试点用户 | `owner-001` 等 `deployment_id=dep-gh-pilot-001`（e2e 会 `PUT /admin/users` 对齐；灌后通风依赖 digest 收件人）                                           |
| LLM      | `settings.json` 有 `llm_api_key`；`/dev/chat` 设阈值须 **200**（非 503）                                                                                |

### 禁止事项（常见浪费时间来源）

- **勿并行**多个 `domain-flywheel-agriculture-e2e.ts`（pending 409、sustained 脏状态）
- **勿在飞轮期间** `kill -9 :3001` 或重复起 API / 模拟器（步骤 1 约 80s 即失败）
- 手动单独起模拟器时要确保节点已注册/绑定并收到 config；`--auto` 是配对注册的便捷方式，不是默认飞轮入口的统一启动参数
- 附着已有服务时须显式开启 `FLYWHEEL_DEV`

### `reset-state` 清什么

除 pending、sustained episode、alert 冷却外，还须清 **API 进程内** 场景 hook 去重：

- `deviceEfficiencyNotified`（步骤 8 设备诊断；不清则第二次跑 `operation-logs` 无 `device_efficiency_diagnosis`）
- 灌后通风 pending 去重

实现：`POST /dev/flywheel/reset-state` → `clearCommandHooksFlywheelDedup()`。

e2e 脚本内也会调同一端点；手动连跑时**跑前仍建议显式 curl 一次**。

### 八步与关键修复对照

| 步骤 | 场景      | 曾卡住的原因       | 修复要点                                                   |
| ---- | --------- | ------------------ | ---------------------------------------------------------- |
| 1–2  | 高温/高湿 | pending 409、503   | Zod 统一 + `preloadDomainPacks`；`pruneOtherScenePendings` |
| 3    | 灌后通风  | 无 pending         | pilot 用户 `deployment_id` 对齐                            |
| 4    | 夜间通风  | weather 500        | `FLYWHEEL_DEV` + `force_heat` 跳过 Open-Meteo              |
| 6    | 晨间降露  | 湿度 &lt;85%       | `waitForGreenhouseHumidity`；sim 非通风时湿度回升加快      |
| 8    | 设备诊断  | 第二次 op log 超时 | `reset-state` 清内存 dedup                                 |
| 指令 | —         | `unknown_device`   | 模拟器附着时从 registry hydrate 设备列表                   |

### 失败时长速查

| 耗时            | 常见卡点                                            |
| --------------- | --------------------------------------------------- |
| ~80s            | API 被杀或步骤 1 `dev/chat` 503                     |
| ~200s           | 步骤 1–2 pending/确认 409，或未 reset-state         |
| ~5min 后 exit 1 | 步骤 6 湿度或步骤 8 dedup（修复前）                 |
| ~50min          | 多实例 + API 反复重启，sustained 反复吃满 6min 超时 |

## 故障排查

| 现象                               | 处理                                                                                            |
| ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| 就绪门闩失败 `nodes_online: false` | gh-002 未启动或心跳过旧；检查临时模拟器日志，等待心跳后重试 ready                               |
| 无 pending-confirm                 | 确认 `FLYWHEEL_DEV=1`、模拟器 `full+REACT`、API jobs 在跑                                       |
| attach 失败                        | 重启模拟器面板或 `npm run domain:flywheel` 默认重建                                             |
| outcome 全 fail                    | 开 `SIM_TELEMETRY_REACT=1`                                                                      |
| 503 设阈值 / dev/chat              | Domain Pack 动态 `import` + greenhouse schema 与 core 共用 `z`；重启 API                        |
| 503 周报                           | 配置台补 LLM Key                                                                                |
| ready 返回 400                     | API 未带 `FLYWHEEL_DEV=1`，重启 API 面板或重跑 `npm run domain:flywheel`                        |
| 高湿/高温确认 409                  | 跑前 `reset-state`；勿并行飞轮；e2e 确认前 `pruneOtherScenePendings`                            |
| 步骤 8 op log 超时                 | 确认 `reset-state` 已清 dedup；见上文「跑通经验」                                               |
| `unknown_device`                   | `ENSURE_SIM_DUAL_FORCE_REBIND=1 npm run ensure:sim-dual`；手动配对场景检查模拟器是否已注册/绑定 |
