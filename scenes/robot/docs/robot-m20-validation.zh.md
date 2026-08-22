# Robotics / M20 验证手册

本文用于 `active_domain: "robotics"` 的本地 stub 和真实 M20 验证。`robotics` 是 Runtime 可加载 Domain Pack（catalog `status: live`）；M20 stub 是该领域下的当前验证场景/执行端 fixture，真实 M20 验收证据未入库。v1 语音链路依赖 iLink `voice_item.text`，不下载微信语音媒体另走 STT；没有转写时按没听清处理。

## 本地 Stub 闭环

日常本地验证可直接启动 robot profile：

```bash
npm run dev:robot
```

该命令会在后台常驻 API、Web、aedes 与 M20 stub，并打开只用于观察的 tmux monitor；关闭 monitor 不会停止 Web/API。停止后台服务用 `npm run dev:stop`。

一键冒烟：

```bash
npm run robot:m20:stub
```

脚本会创建隔离 `AGENT_DATA_DIR`，写入 robot settings、`robot_dog` registry 和 owner 用户，启动本地 M20 stub，再验证：

- `/admin/robot/overview` 能读取 M20 状态、传感器、避障、位姿和导航状态。
- `/integrations/chat` 能通过真实 chat pipeline 路由到 `robot.query_status`。
- `/admin/robot/intents` 能执行拍图、站立。
- `robot.move` 和 `robot.navigate_to_waypoint` 未确认时返回 409，确认后完成。
- M20 stub 关闭后，控制指令返回 503，失败可见。

机器人矩阵（真实 LLM + 执行链路）：

```bash
npm run robot:matrix
```

`robot:matrix` 默认使用 `scripts/fixtures/ci-robot-eval`，先跑 robot 专属真实 LLM 矩阵（core/wechat/negative 100%），再跑 M20 stub 执行矩阵。现场交付要显式设置当前 profile 的 `AGENT_DATA_DIR`，否则 readiness 不会获得当前 deployment 的 runtime evidence。执行矩阵验证：

注意：`robot-execution-matrix` 和 `domain-flywheel-robotics` 中的 scripted harness 是确定性执行链路验证，用来覆盖 admin/chat route、确认、command lifecycle、M20 stub 与数据飞轮；它不是理解层真实 LLM 门禁。理解层门禁仍以 robot 专属 sim matrix 的真实 LLM 结果为准。

- `/admin/robot/overview` 能读 M20 状态。
- `/integrations/chat` 能走 chat pipeline 路由到 robot 查询。
- `robot.move` 在聊天入口必须先生成 pending-confirm，用户回复“确认”后才创建 command。
- 低风险动作（如 `robot.stand_up`）进入 command lifecycle 并完成。
- 高风险动作（如 `robot.navigate_to_waypoint`）未确认返回 409，确认后完成且 `user_confirmed=true`。
- 未知 `waypoint_id`、M20 endpoint 失败、M20 HTTP 超时、缺 `m20_base_url` 均返回 503，并把 command 标为 `failed`。
- M20 stub 请求日志必须出现对应 endpoint，避免只断言 API 文案。

执行矩阵报告默认写入 `{AGENT_DATA_DIR}/local-eval-reports/robotics-execution-matrix-report.json`，该文件是本地诊断副本，不作为交付 evidence。仅显式 `EVAL_WRITE_DOCS=1` 时额外写 `docs/eval/robotics-execution-matrix-report.json`。

机器人数据飞轮：

```bash
npm run domain:flywheel
```

`domain:flywheel` 是巡检取证数据飞轮，不再承载上面的执行矩阵。它使用隔离 `AGENT_DATA_DIR` 和 M20 stub，验证：

- 正常巡检写入 `robot-inspection-tasks.jsonl` 与 `robot-evidence.jsonl`，证据显式标记 `source_kind:"stub"`。
- 重复异常巡检写入 `robot-anomalies.jsonl` 与 `robot-inspection-outcomes.jsonl`，并在 summary 中形成点位建议。
- `/integrations/chat` 能查询机器人巡检异常摘要。
- M20 inspect endpoint 失败、缺 `m20_base_url` 均失败可见，并写入失败 outcome。

飞轮报告默认写入 `{AGENT_DATA_DIR}/local-eval-reports/robotics-flywheel-report.json`，该文件是本地诊断副本，不作为交付 evidence。仅显式 `EVAL_WRITE_DOCS=1` 时额外写 `docs/eval/robotics-flywheel-report.json`。

单独启动 M20 stub：

```bash
npm run robot:stub
```

可选环境变量：

- `M20_STUB_PORT=3099`：stub 监听端口。
- `M20_STUB_DELAY_MS=1000`：每个请求延迟，验证超时和 UI loading。
- `M20_STUB_FAIL_PATHS=/body/move,/body/nav/start`：指定 endpoint 返回失败；`*` 表示全失败。
- `M20_HTTP_TIMEOUT_MS=8000`：API 调 M20 的超时时间。

## 真实 M20 流程

1. 在 Web 以 **admin session** 登录（`/login`），进入 `/scenes/robot/ops/settings`。
2. 在 Devices 写入至少一台 `robot_dog`，确认 `device_id`、`node_id`、`deployment_id`、`status` 为真实值。
3. 在 Settings 保存：
   - `M20 Base URL`：真实 M20 HTTP 网关地址。
   - 默认 `robot_id`：必须匹配 registry 中的 `robot_dog`。
   - `waypoints`：导航点位，格式为 `{ "waypoint_id": "...", "name": "...", "points": [...] }[]`。
4. 确认 `/admin/robot/overview` 的 `active_domain` 为 `robotics`，M20 API 为 connected。
5. 先做查询类：状态、位姿、导航状态、拍图、视频流。
6. 再做低风险动作：站立、趴下、喊话、音量、工作灯。
7. 最后在安全场地做高风险动作：短距离移动、点位导航、警报、吊舱运动、激光测距。所有高风险动作必须确认后执行。

## 安全场地检查

- 机器人周围 2 米内无人、无宠物、无易倒物。
- 地面平整，无台阶、线缆、水渍和强反光障碍。
- 急停、遥控器或现场人工接管可用。
- 导航点位只使用配置中的 `waypoint_id`，不临时生成坐标。
- 首次真实执行移动时使用最小位移或 1 秒内短动作。

## 验收话术

微信文字或 iLink 语音转写可覆盖以下话术：

- “看一下机器狗状态”
- “现在 M20 在哪里”
- “机器狗导航状态怎么样”
- “拍一张现场图”
- “给我视频流地址”
- “让机器狗站起来”
- “让机器狗趴下”
- “向前走 1 秒”
- “去充电桩”
- “喊话：请注意现场安全”
- “音量调到 60”
- “打开工作灯”
- “播放警报”
- “吊舱回中”
- “吊舱向左转 1 秒”
- “激光测距”
- “确认”
- “取消”

## 问题记录与回归

- 理解错误：记录原话、Flash/Pro 输出、期望 `robot.*` skill，补到 `scenes/robot/eval/sim-matrix-wechat.jsonl`。
- 执行失败：记录 command id、M20 endpoint、HTTP 状态、返回 body，必要时补 `M20_STUB_FAIL_PATHS` 回归。
- 配置缺失：不要加隐式回退；补 settings 或 registry 后重跑。
- 回归命令：

```bash
AGENT_DATA_DIR=scripts/fixtures/ci-robot-eval SIM_MATRIX_SLICE=core SIM_MATRIX_MIN_PASS_RATE=1 npm run sim:matrix
AGENT_DATA_DIR=scripts/fixtures/ci-robot-eval SIM_MATRIX_SLICE=wechat SIM_MATRIX_WECHAT_MIN_PASS_RATE=1 npm run sim:matrix
AGENT_DATA_DIR=scripts/fixtures/ci-robot-eval SIM_MATRIX_SLICE=negative SIM_MATRIX_NEGATIVE_MIN_PASS_RATE=1 npm run sim:matrix
npm run robot:matrix
npm run domain:flywheel
npm run robot:m20:stub
npm run test -w @embodied-agent/api
npm run test -w @embodied-agent/web
```

全量严格门禁：

```bash
LLM_API_KEY=... npm run verify:strict
```

该命令同时跑 agriculture strict matrix、agriculture domain flywheel、robotics strict matrix、robotics domain flywheel 与 industrial domain flywheel；缺少 `LLM_API_KEY` 或 signed evidence 配置时直接失败，不做跳过。
