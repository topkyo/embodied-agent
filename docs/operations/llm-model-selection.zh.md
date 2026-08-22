# LLM 模型选型（DeepSeek）

> 依据 DeepSeek 定价与模型说明（2026-04 更新）。

## 配置来源（运行时真源）

**生产环境不以 shell 环境变量为主。** Web 平台底座（`/scenes/{active-pack}/ops/platform`）保存的密钥与模型设置写入：

```text
{AGENT_DATA_DIR}/settings.json   # 默认 .agentstack/dev-profiles/default/data/settings.json，Compose 挂载 agent_data volume
```

`getEffectiveSettings()`（`apps/api/src/settings/store.ts`）读取顺序：

1. `{AGENT_DATA_DIR}/settings.json`（含 Web 填写的 **DeepSeek API Key**、`llm_model`、`llm_thinking` 等）
2. 环境变量作为第二显式配置来源（`LLM_API_KEY`、`LLM_MODEL` 等）— 仅用于 CI、无配置台的头机部署

因此本地评测与微信对话**只要配置台已保存 Key，即可直接运行**，无需再 `export LLM_API_KEY`：

```bash
npm run eval:intent          # 自动读 {AGENT_DATA_DIR}/settings.json
export EVAL_EVIDENCE_SECRET=...
SIM_MATRIX_SLICE=core npm run sim:matrix      # core ≥90%
SIM_MATRIX_SLICE=wechat npm run sim:matrix    # wechat 100%
SIM_MATRIX_SLICE=negative npm run sim:matrix  # negative 100%
npm run sim:matrix:evidence  # 校验 runtime evidence 可被 readiness 接受
npm run eval:intent:matrix   # 本地 Flash / Pro 对比工具
```

运行数据目录已 `.gitignore`，勿提交密钥。部署栈见 `deploy/vps/README.zh.md`；本地一键栈可用 `npm run stack:up`（Compose，与 VPS 部署无关）。

## 模型对照

| API 模型名          | 定位                                  | 与本项目关系                                    |
| ------------------- | ------------------------------------- | ----------------------------------------------- |
| `deepseek-v4-flash` | 快、省、接近 Pro 的推理；Instant 模式 | **线上默认**（微信 / 集成通道意图解析）         |
| `deepseek-v4-pro`   | 更强推理与复杂 Agent；Expert 模式     | **Flash 无法理解或校验失败时的升格重试**        |
| `deepseek-chat`     | 已弃用别名                            | 等价于 `deepseek-v4-flash`；2026-07-24 UTC 下线 |
| `deepseek-reasoner` | 已弃用别名                            | 等价于 `deepseek-v4-flash` **思考模式**         |

## 策略：Flash 默认 + 思考开启 + Pro 升格

### 默认：`deepseek-v4-flash` + **思考模式开启**

守棚工长（对外名农场工长）需要理解口语、语音转写误差和多轮跟进，**默认开启 Thinking**（`llm_thinking: true`）：

- Web 配置台保存设置时，DeepSeek 预设默认 `llm_thinking: true`
- 或环境变量 `LLM_THINKING=1`
- 实现：`packages/agent/src/intent/llm.ts` 仅在显式关闭时发送 `thinking: { type: "disabled" }`

思考用于**理解用户意图**，最终仍须输出 strict JSON 到 `message.content`；若 API 将正文放在 `reasoning_content`，客户端会尝试回退读取。

### 升格：`deepseek-v4-pro`（Flash 仍不够时）

**不用正则、关键词或规则引擎选择 skill。** Pro 仅在 Flash 结果**不可信**时，对**同一句 utterance** 再调一次 LLM（`packages/agent/src/intent/pro-escalation.ts`）：

| 触发原因                   | 说明                                                       | 示例                                 |
| -------------------------- | ---------------------------------------------------------- | ------------------------------------ |
| `repairable_json`          | JSON 损坏 / zod 校验失败（原逻辑）                         | 混入思考文字、缺字段                 |
| `skill_utterance_conflict` | 话术与 skill **语义冲突**（只触发升格，不替 LLM 选 skill） | 用户说「灌溉」Flash 却给 `open_vent` |
| `low_confidence_control`   | 物理控制 skill 且 `confidence < 0.82`                      | 含糊控制句                           |
| `user_correction`          | 用户纠错（「不是通风」）且清掉错误 pending                 | 多轮纠正                             |

流程：Flash（+thinking）→ 上述任一触发 → **Pro 重试一次**（同样开启思考）→ 仍失败 → 澄清或 503，并写入 `intent-failures.jsonl`。

日志：`[intent] escalating deepseek-v4-flash → deepseek-v4-pro reason=…`

升格是 **LLM→LLM**，不是 LLM→规则。物理执行层仍走确定性技能路由与安全层，不变。

### L3 / L4 场景运营层：固定 `deepseek-v4-pro`

理解层默认 Flash + 升格 Pro；**场景运营层（L3 主动建议润色、L4 周报/策略建议）固定 Pro**，不经 Flash：

| 调用点                                                 | 模型                          | 代码                                                                        |
| ------------------------------------------------------ | ----------------------------- | --------------------------------------------------------------------------- |
| 周报运营建议 `advice.query_weekly`                     | `deepseek-v4-pro`             | `apps/api/src/advice/weekly-threshold.ts`                                   |
| 主动推送 NLG（持续性异常 L2/L3、简报、天气 proactive） | `deepseek-v4-pro`             | `apps/api/src/nlg/render-reply.ts` → `renderProactiveSummary`               |
| 查询类 NLG（温湿度、日志等）                           | `settings.llm_model`（Flash） | `renderReply`（`advice.query_weekly` 不经 NLG，仅 `buildWeeklyAdviceText`） |

常量：`SCENE_OPS_LLM_MODEL`（`apps/api/src/scene/llm-model.ts`）。理由：运营上下文多源 JSON、需稳定归纳 ROI/outcome/策略建议，Pro 成本相对跑棚价值可接受。

### 明确禁止的「兜底」

| 禁止                       | 说明                                                                   |
| -------------------------- | ---------------------------------------------------------------------- |
| 正则 / 关键词意图引擎      | 已移除（原 mock-harness）；理解层仅真实 LLM + sim:matrix / eval:intent |
| LLM 失败后静默执行设备动作 | 必须失败可见                                                           |
| 隐式默认设备 / 隐式猜棚号  | registry 缺失即拒绝                                                    |
| 用 Pro 替代安全层或策略层  | Pro 只服务**理解层**升格                                               |

`normalizeLlmShape` 与 schema repair 属于 **JSON 契约修复**（字段名/类型），不是第二套意图引擎。

## 多轮会话历史

每条微信消息不再孤立解析。`apps/api/src/chat/conversation-store.ts` 按 `user_id + conversation_id` 保留最近若干轮（默认 10 条，`CONVERSATION_MAX_TURNS` 可配），`processChatMessage` 将历史一并送入 LLM，用于「打开 10 分钟」「那个棚」等指代跟进。

持久化：`{AGENT_DATA_DIR}/deployments/{deployment_id}/conversation-history.json`。

## 与场景技能库 / 数据飞轮（理解层）

**属于数据飞轮的第一环**：把真实对话里的理解成败结构化沉淀，而不是用规则兜底掩盖。

```text
微信语音/文字 + 会话历史
  → Flash（+thinking）→ 可校验 IntentPayload
  → 失败 → Pro 升格一次 → 仍失败 → intent-failures.jsonl
  → promote → wechat 运行时矩阵副本（本地回归用）
  → 手动 export 到 repo eval corpus → 人审 commit → 进入 CI / 反哺 prompt
  → 下一轮 LLM 更懂真实说法
```

物理动作结果（command log 前后遥测）是飞轮第二环，见后续「数据飞轮 v0」里程碑。

这里要分清两类证据：**意图层飞轮证据（sim-matrix evidence）**只验证 NL 话术→意图分类在离线 corpus 上的通过率，`row_hash` 基于 eval corpus 行内容生成，**不关联 command_id**，属于意图层离线评测；**执行层证据（per-command）**才用 `command_id` 串起 command 生成→node 执行→outcome→memory 全链路，真源由 `scene-outcomes.jsonl` + `command-logs.jsonl` 承担（见 `apps/api/src/skills/physical/intent-to-command.ts:20`）。两类证据各自闭环：readiness gate 校验意图层，admin 反查校验执行层。

`npm run intent:flywheel` 是意图改进闭环的可视编排入口：它只负责列出 pending failures、提示 sim:matrix 现状和下一步 promote 命令，不自动 promote；`npm run domain:flywheel` 则是场景 outcome 飞轮，专注物理执行结果，两者互补。

场景技能库规范见 [`../domain-pack/authoring.zh.md`](../domain-pack/authoring.zh.md)。**只有暴露出来的失败句，才值得写成场景技能或 golden 用例。**

## 环境变量（第二显式配置来源 / CI）

| 变量                 | 建议值                                                                                                     |
| -------------------- | ---------------------------------------------------------------------------------------------------------- |
| `AGENT_DATA_DIR`     | 默认 `.agentstack/dev-profiles/default/data`（由 `@embodied-agent/platform` 解析）；Compose 内 `/app/data` |
| `LLM_BASE_URL`       | `https://api.deepseek.com/v1`                                                                              |
| `LLM_MODEL`          | `deepseek-v4-flash`（可被 settings.json 覆盖）                                                             |
| `LLM_THINKING`       | `1`（默认开启；设 `0` 关闭）                                                                               |
| `LLM_ESCALATE_MODEL` | `deepseek-v4-pro`（升格目标；实现见 `apps/api/src/chat/pipeline.ts`）                                      |
| `LLM_STRICT_JSON`    | 默认开启 strict `json_schema`；不支持时显式改用 `json_object`                                              |

## 试点失败句沉淀

理解失败（非用户主动的 `clarification_needed`）写入 `{AGENT_DATA_DIR}/deployments/{deployment_id}/intent-failures.jsonl`：

```bash
npm run intent:failures:list
npm run intent:failures:promote -- --id f-xxx --skill alert.set_threshold --expected '{"target":{"greenhouse_id":"gh-002"},"parameters":{"metric":"temperature_c","operator":">","value":30}}'
```

晋升后写入当前 active Domain Pack manifest 声明的 golden eval 路径，例如 agriculture 写入 `scenes/greenhouse/eval/intent-golden.zh.jsonl`，供 `npm run eval:intent` 回归。

wechat promote 只会写 `{AGENT_DATA_DIR}/sim-matrix-wechat.jsonl`，用于部署本地回归；要让这批句子进入 repo eval corpus 并被 CI 复验，需显式执行：

```bash
npm run intent:failures:export-wechat -- --apply
```

然后人工审查 `scenes/{active_pack}/eval/sim-matrix-wechat.jsonl` 的变更并提交 git。

## 评测命令

```bash
# 读 {AGENT_DATA_DIR}/settings.json 中的 Key（配置台已填则无需 export）
npm run eval:intent

# 当前 active pack 门禁矩阵（readiness 需要三份 slice evidence）
export EVAL_EVIDENCE_SECRET=...
SIM_MATRIX_SLICE=core npm run sim:matrix
SIM_MATRIX_SLICE=wechat npm run sim:matrix
SIM_MATRIX_SLICE=negative npm run sim:matrix
npm run sim:matrix:evidence

# Flash + Pro 对比矩阵（本地诊断）
npm run eval:intent:matrix
```

门禁：`npm run sim:matrix` 按当前 `active_domain` 选择矩阵；readiness 只接受当前 deployment runtime evidence 目录下的 core / wechat / negative 三份 slice 报告。core slice ≥90%，wechat/negative slice 100%；Pro 矩阵用于发版前对比与难例诊断。

## 端到端对话验证

```bash
PORT=3001 npm run api:dev   # 另一终端
npm run verify:chat         # 读 settings.json，跑 greenhouse 13 个端到端场景（含 P1/P2）
```

见 [`../eval/chat-verify.zh.md`](../eval/chat-verify.zh.md)；报告默认写入 `{AGENT_DATA_DIR}/local-eval-reports/chat-verify-report.json`。
