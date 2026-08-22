# 微信 / OpenClaw 通道适配器

小龙虾（OpenClaw）在本方案中是 **可选微信个人号通道适配器**：负责登录、收消息、回消息；**不负责**具身Agent 的意图理解与设备执行。若使用 iLink bridge，可不经过本 HTTP 回调。

语音与文字的理解、转写（STT）、安全控棚由 **`apps/api`** 完成。产品原则见 [`integration-chat.zh.md`](integration-chat.zh.md)。本仓库也可用 **iLink bridge** 直连 API，不经过本 HTTP 回调。

## 数据流（推荐）

```text
现场用户（微信语音/文字）
  → 小龙虾 OpenClaw（微信通道，薄适配）
  → POST /integrations/chat（text 和/或 audio_base64）
  → API STT（若有音频）→ LLM 意图 → 安全层 → MQTT
  → 文本 reply → 小龙虾 → 微信
```

## 数据流（通道侧预转写，显式过渡模式）

若 API 尚未配置 STT，适配器可在通道侧显式启用预转写，再只 POST `text`。用户侧体验不变，但运维应优先改为 **传音频到 API**，避免两套 STT 配置。

## 回调契约

**URL：** `POST /integrations/chat`

**鉴权：** `Authorization: Bearer <INTEGRATION_SECRET>`

与 Web 配置台保存的「集成密钥」或环境变量 `INTEGRATION_SECRET` 一致。

**请求体（JSON）：**

| 字段              | 必填          | 说明                                                   |
| ----------------- | ------------- | ------------------------------------------------------ |
| `text`            | 与音频二选一* | 用户 utterance                                         |
| `audio_base64`    | 与文本二选一* | **推荐**：微信语音原始音频，由 API STT                 |
| `audio_format`    | 建议          | 与微信/插件导出格式一致，如 `amr`、`wav`               |
| `user_id`         | 是            | 微信平台用户 ID；必须先完成绑定，不能直接传现场账号 ID |
| `conversation_id` | 否            | 会话 ID，默认与 `user_id` 相同                         |
| `deployment_id`   | 否            | 覆盖部署上下文（多部署扩展用）                         |
| `platform`        | 是            | 建议 `wechat` 或 `wechat-lobster`；缺失时请求失败      |

\* 至少提供 `text` 或 `audio_base64` 之一。API STT 在 Web 配置台选择提供商（OpenAI Whisper / 阿里云 / 讯飞，见 [`openai-voice.zh.md`](openai-voice.zh.md)）。

**响应：**

```json
{ "reply": "1号棚当前温度 31.2°C，湿度 78%。侧帘关闭。" }
```

HTTP 状态码与 `/dev/chat` 一致（澄清 200，不可用 503，鉴权失败 401）。

## 示例

### 文字

```bash
export INTEGRATION_SECRET=your-strong-secret
curl -s -X POST http://127.0.0.1:3001/integrations/chat \
  -H "Authorization: Bearer $INTEGRATION_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"text":"1号棚现在多少度？","user_id":"wx-owner-1","conversation_id":"wx-conv-1","platform":"wechat"}'
```

### 语音（API STT）

```bash
curl -s -X POST http://127.0.0.1:3001/integrations/chat \
  -H "Authorization: Bearer $INTEGRATION_SECRET" \
  -H "Content-Type: application/json" \
  -d "{\"audio_base64\":\"$(base64 < sample.wav | tr -d '\n')\",\"audio_format\":\"wav\",\"user_id\":\"wx-owner-1\",\"platform\":\"wechat\"}"
```

## 小龙虾侧配置要点

1. 出站 Webhook 指向具身Agent API（局域网 IP 或公网反代 URL）。
2. Header 带 Bearer 密钥，与具身Agent 配置台一致。
3. **语音（推荐）**：将微信语音下载为二进制，Base64 后 POST `audio_base64` + `audio_format`；**不要**在小龙虾里再跑一套业务 Agent 回复，只转发 API 返回的 `reply`。
4. **语音（通道侧预转写）**：通道内 STT 后只 POST `text`（仅当 API 尚无 STT 且已显式启用该过渡模式时）。
5. 关闭或绕过 OpenClaw 对用户消息的自动 Agent 应答，避免与工长 `reply` 重复。
6. 超时建议 ≥ 30s（LLM 冷启动）。

## 与 `/webhooks/chat` 的区别

| 路径                 | 用途                                                    |
| -------------------- | ------------------------------------------------------- |
| `/integrations/chat` | 小龙虾等外部集成，Bearer 鉴权                           |
| `/webhooks/chat`     | 仅用于显式配置的内置 channel；未配置 channel 时拒绝请求 |
| `/dev/chat`          | 本地 curl 调试                                          |

若采用 OpenClaw / 小龙虾，推荐只让它转发到 `/integrations/chat`，避免在通道侧再实现一套业务 Agent。若采用 iLink bridge，则由 API 内置桥接直接进入同一条聊天流水线。

## 相关

- [`integration-chat.zh.md`](integration-chat.zh.md) — 竞品对照、STT 优先级、路线
- [`user-binding.zh.md`](user-binding.zh.md) — 微信 openid 绑定
- [`openclaw-forwarder.example.json5`](openclaw-forwarder.example.json5) — hooks 转发示例
- [`scripts/openclaw-hook-forward-embodied-agent.mjs`](../../scripts/openclaw-hook-forward-embodied-agent.mjs) — 转发脚本
- [`openai-voice.zh.md`](openai-voice.zh.md) — OpenAI Whisper 配置
- `deploy/vps/README.zh.md` — VPS 本机 systemd 一体机部署
