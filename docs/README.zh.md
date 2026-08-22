# 文档索引

工程约定真源（lint / test / build / CI gate / Web UX 验证 / Domain Pack 边界 / 环境变量指针）见根目录 [`AGENTS.md`](../AGENTS.md)。本索引讲"how to read"，AGENTS 讲"how to build"。

## 架构

| 文档                                                                         | 用途                                                                                        |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| [`architecture/platform-runtime.zh.md`](architecture/platform-runtime.zh.md) | **顶层真源**：Platform Runtime / Domain Pack / Deployment / Scene Node 边界，含数据流架构图 |
| [`architecture/implementation.zh.md`](architecture/implementation.zh.md)     | 当前仓库模块、运行流、状态根、脚本入口                                                      |
| [`architecture/control-layers.zh.md`](architecture/control-layers.zh.md)     | 理解 → 策略 → 安全 → 执行四层分层                                                           |
| [`architecture/scene-layer.zh.md`](architecture/scene-layer.zh.md)           | L3/L4 场景层、outcome、ROI、策略建议                                                        |

## 协议

| 文档                                                                               | 用途                                    |
| ---------------------------------------------------------------------------------- | --------------------------------------- |
| [`protocol/command-protocol.zh.md`](protocol/command-protocol.zh.md)               | MQTT command / event / telemetry 契约   |
| [`protocol/device-registry.zh.md`](protocol/device-registry.zh.md)                 | Deployment、Entity、Node、Device 注册表 |
| [`protocol/esp32-node-registration.zh.md`](protocol/esp32-node-registration.zh.md) | ESP32 Scene Node 自注册与场景绑定       |
| [`protocol/action-result-schema.zh.md`](protocol/action-result-schema.zh.md)       | command / outcome / failure 数据 schema |

## Domain Pack

| 文档                                                               | 用途                           |
| ------------------------------------------------------------------ | ------------------------------ |
| [`domain-pack/authoring.zh.md`](domain-pack/authoring.zh.md)       | 场景技能文档统一结构与编写指南 |
| [`domain-pack/delivery-kit.zh.md`](domain-pack/delivery-kit.zh.md) | 新 pack 最小交付件 + 必跑门禁  |

## 运维

| 文档                                                                                                       | 用途                                                    |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| [`operations/repos.zh.md`](operations/repos.zh.md)                                                         | 私仓 / 公开仓分工（clone、PR、VPS、Deploy to VPS）      |
| [`operations/env-keys.zh.md`](operations/env-keys.zh.md)                                                   | 环境变量 → 消费方 → 真源文件 → 缺失行为指针表           |
| [`operations/web-session.zh.md`](operations/web-session.zh.md)                                             | Web session 模型、角色矩阵、本地 401 / ops BLOCKED 运维 |
| [`operations/admin-routes.zh.md`](operations/admin-routes.zh.md)                                           | `/admin/*` 端点参考                                     |
| [`operations/notifications.zh.md`](operations/notifications.zh.md)                                         | 报警、简报、定时汇报、冷却路径                          |
| [`operations/safety-checklist.zh.md`](operations/safety-checklist.zh.md)                                   | 安全检查清单                                            |
| [`operations/llm-model-selection.zh.md`](operations/llm-model-selection.zh.md)                             | LLM 模型选型（DeepSeek Flash + Pro 升格策略）           |
| [`operations/installation-checklist.zh.md`](operations/installation-checklist.zh.md)                       | 叠加层安装 Checklist                                    |
| [`operations/industrial-installation-checklist.zh.md`](operations/industrial-installation-checklist.zh.md) | 工业过温排风叠加层安装 Checklist                        |
| [`operations/channel-failover-drill.zh.md`](operations/channel-failover-drill.zh.md)                       | 通道冗余最小演练                                        |

## 集成

| 文档                                                                         | 用途                                    |
| ---------------------------------------------------------------------------- | --------------------------------------- |
| [`integrations/integration-chat.zh.md`](integrations/integration-chat.zh.md) | `/integrations/chat` 通道与语音原则     |
| [`integrations/wechat-lobster.zh.md`](integrations/wechat-lobster.zh.md)     | 微信 / 小龙虾通道适配器                 |
| [`integrations/user-binding.zh.md`](integrations/user-binding.zh.md)         | IM 用户绑定（平台 ID → 现场 principal） |
| [`integrations/openai-voice.zh.md`](integrations/openai-voice.zh.md)         | OpenAI / GPT 与语音                     |

## 评测

| 文档                                                                                                                         | 用途                                       |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| [`eval/chat-verify.zh.md`](eval/chat-verify.zh.md)                                                                           | 微信 / LLM 对话验证                        |
| [`../scenes/greenhouse/docs/domain-flywheel-agriculture.zh.md`](../scenes/greenhouse/docs/domain-flywheel-agriculture.zh.md) | 双棚 L3/L4 数据飞轮联调手册（agriculture） |
| [`../scenes/robot/docs/robot-m20-validation.zh.md`](../scenes/robot/docs/robot-m20-validation.zh.md)                         | Robotics / M20 验证手册                    |

## 设计

| 文档                                                                       | 用途                  |
| -------------------------------------------------------------------------- | --------------------- |
| [`design/README.zh.md`](design/README.zh.md)                               | Web v3.1 设计资产索引 |
| [`design/web-rebuild-v3/README.zh.md`](design/web-rebuild-v3/README.zh.md) | Web 重构效果图 v3.1   |

## Domain Pack 材料

领域专属文档随 pack 放在 `scenes/{pack}/docs/`，不作为平台架构真源。

**agriculture**（`scenes/greenhouse`）— Runtime 可加载；双棚模拟已验证，真棚待验收：

- [`../scenes/greenhouse/docs/skills-design.md`](../scenes/greenhouse/docs/skills-design.md) — 技能设计示例
- [`../scenes/greenhouse/docs/skills/`](../scenes/greenhouse/docs/skills/) — 9 个场景技能文档

**robotics**（`scenes/robot`）— Runtime 可加载；M20 stub 已验证，真实 M20 未入库：

- [`../scenes/robot/docs/robot-m20-validation.zh.md`](../scenes/robot/docs/robot-m20-validation.zh.md)

**industrial**（`scenes/industrial`）— Runtime 可加载；内存 Modbus / 模拟排风已验证，真柜待验收：

- [`../scenes/industrial/docs/gateway-read-path.zh.md`](../scenes/industrial/docs/gateway-read-path.zh.md) — 工业网关只读接入（Modbus/OPC UA → telemetry）

## 部署

| 文档                                                                         | 用途                      |
| ---------------------------------------------------------------------------- | ------------------------- |
| `../deploy/vps/README.zh.md`                   | VPS 本机 systemd 部署指南 |
| `../deploy/vps/SERVICES.zh.md`               | 服务清单                  |
| `../deploy/vps/TROUBLESHOOTING.zh.md` | 运维 runbook              |

## 硬件

| 文档                                                                   | 用途                                                 |
| ---------------------------------------------------------------------- | ---------------------------------------------------- |
| [`../firmware/scene-node/README.md`](../firmware/scene-node/README.md) | Scene Node 固件：SoftAP 配网、MQTT 配对、HTTP 自注册 |

## 归档

[`archive/README.zh.md`](archive/README.zh.md) — 历史计划、旧架构材料、release notes，只读追溯。归档内容不作为当前实现依据。

## 代码真源

文档是 prose，代码是 contract。以下文件是各自领域的不可绕过真源：

- `packages/core/src/scene-contract.ts` — Domain Pack contract 类型定义
- `packages/core/src/skills.ts` — 平台技能枚举（空数组；技能真源在各 Domain Pack）
- `packages/runtime/src/loader.ts` — Domain Pack loader
- `packages/runtime/src/contract.ts` — runtime contract
- `packages/runtime/src/readiness.ts` — readiness / eval evidence / sim-matrix 符号
- `packages/runtime/src/physical-dispatch.ts` — 物理指令调度
- `packages/chat-runtime/src/index.ts` — `runChatPipeline` 固定阶段
- `packages/domain-sdk/src/index.ts` — Domain Pack SDK
- `packages/agent/src/intent/prompt/build-intent-prompt.ts` — LLM prompt 真源
- `scripts/domain-new.ts` — Domain Pack 脚手架
- `scenes/greenhouse/scene/registry.ts` — agriculture 设备注册表
- `scenes/robot/scene/pack.ts` — robotics pack
- `scenes/industrial/scene/pack.ts` — industrial pack
