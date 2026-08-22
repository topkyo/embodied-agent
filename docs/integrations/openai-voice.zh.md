# OpenAI / GPT 与语音

产品原则（用户只发语音/字、API 统一 STT+意图）：[`integration-chat.zh.md`](integration-chat.zh.md)。

## 配置（Web 配置台）

1. **LLM 提供商** 选 `OpenAI / GPT`
2. 填写 **OpenAI API Key**
3. **意图模型**：以你账号在 OpenAI 控制台可调用的 **API model ID** 为准；须支持当前聊天流水线使用的 Chat Completions + JSON 输出。
4. **语音转写**：按配置台中的 STT provider 配置；OpenAI Whisper 可用 `openai_whisper`。

> 产品里的营销名称不一定等于 OpenAI API 的 `model` 字符串。以你密钥在控制台可调用的模型名为准；更换模型前先用 `/dev/chat` 或 `npm run verify:chat` 做冒烟。

## 能力边界

| 能力             | 实现                                         | 说明                                          |
| ---------------- | -------------------------------------------- | --------------------------------------------- |
| 文本 → 意图 JSON | `gpt-4o` 等 + `response_format: json_object` | 与 DeepSeek 相同流水线                        |
| 语音 → 文字      | `openai_whisper` STT provider                | API 内建；外部通道适配器优先传 `audio_base64` |
| 电话级实时对话   | OpenAI **Realtime API**（WebSocket）         | **未实现**；需单独服务，后续可接              |

## 带语音的请求

`POST /integrations/chat`（Bearer 集成密钥）：

```json
{
  "audio_base64": "<base64 编码的 wav/mp3/webm 等>",
  "audio_format": "wav",
  "platform": "wechat",
  "user_id": "wx-owner-1"
}
```

`user_id` 是已绑定的平台侧用户 ID，不是 `owner-001` 等现场账号。也可同时传 `text`（会与转写结果拼接）。流程：STT 转写 → LLM 意图 → 技能/MQTT。

## STT 与 LLM 分离（配置台）

| `stt_provider`   | 必填配置                                                             | 说明                         |
| ---------------- | -------------------------------------------------------------------- | ---------------------------- |
| `none`           | —                                                                    | 仅接受文字；语音需通道先转写 |
| `openai_whisper` | OpenAI API Key（或 `stt_api_key`）                                   | 与 GPT 可共用 Key            |
| `aliyun`         | `stt_app_key`（NLS AppKey）+ `stt_api_key`（NLS Token）              | 国内试点推荐                 |
| `iflytek`        | `stt_app_id` + `stt_api_key`（API Secret）+ `stt_app_key`（API Key） | WebSocket 听写               |

意图 LLM 仍由 **LLM 提供商**（DeepSeek / OpenAI）决定，与 STT 独立。

## 与 DeepSeek 切换

- DeepSeek：成本低、国内试点默认意图模型；语音在配置台选 **阿里云** 或 **讯飞** STT。
- OpenAI：可选 Whisper STT + GPT 意图；需能访问 `api.openai.com`。

保存配置后若 API 已启动，建议重启 `npm run api:dev` 以加载新 settings。

## 本地 STT 冒烟

```bash
STT_MOCK=1 PORT=3001 npm run api:dev   # 另终端
./scripts/test-voice-stt.sh
```
