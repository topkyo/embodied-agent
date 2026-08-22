# IM 用户绑定（平台 ID → 现场 principal）

现场用户在微信等 IM 里的 **平台用户 ID** 与具身Agent 现场 principal（如 **owner-001 / worker-001**）需一次性绑定，之后只发语音/文字即可进入当前 active Domain Pack 的对话与控制链路。

## 现场用户（RBAC）

现场账号（如 `owner-001`、`worker-001`）持久化在 **`$AGENT_DATA_DIR/users.json`**。生产和测试必须显式提供该文件；缺失时 API 失败可见。本地 dev profile 由启动脚本写入显式种子。

- **配置台**：`/scenes/{active-pack}/ops/users`（增删改角色）
- **API**：`GET/POST/PUT/DELETE /admin/users`

微信等平台 ID 仍通过 `platform-bindings.json` 映射到上述 `principal_user_id`。删除用户不会自动清理绑定，须人工检查绑定列表。

## 安装人员流程

1. 在 Web 配置台确认 API 与集成密钥已保存；必要时在 **现场用户** 面板新增 `operator-001` 等账号。
2. 为现场负责人签发配对码：

```bash
curl -s -X POST http://127.0.0.1:3001/admin/bindings/issue-code \
  -H "x-admin-token: $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"principal_user_id":"owner-001"}'
```

3. 将返回的 6 位 `code` 口头或微信发给现场负责人；负责人通过外部通道适配器完成绑定（OpenClaw / 小龙虾只是可选示例），或由安装人员代填 `claim`：

```bash
curl -s -X POST http://127.0.0.1:3001/admin/bindings/claim \
  -H "x-admin-token: $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"code":"123456","platform":"wechat","platform_user_id":"wx_真实openid"}'
```

4. 负责人再发试控语句（查温、开风机等）。

## 管理 API

| 方法   | 路径                         | 说明                                                                                       |
| ------ | ---------------------------- | ------------------------------------------------------------------------------------------ |
| GET    | `/admin/users`               | 列出当前 deployment 的现场用户                                                             |
| POST   | `/admin/users`               | 新增/覆盖用户 `{ user_id, role, deployment_id, display_name? }`                            |
| PUT    | `/admin/users/:user_id`      | 更新角色/deployment/显示名                                                                 |
| DELETE | `/admin/users/:user_id`      | 删除（不可删最后一个 owner）                                                               |
| GET    | `/admin/bindings`            | 列出绑定                                                                                   |
| POST   | `/admin/bindings`            | 直接绑定 `{ platform, platform_user_id, principal_user_id }`；旧字段按普通请求校验失败处理 |
| POST   | `/admin/bindings/issue-code` | 签发配对码 `{ principal_user_id }`                                                         |
| POST   | `/admin/bindings/claim`      | 用配对码绑定                                                                               |

数据文件：`$AGENT_DATA_DIR/platform-bindings.json`、`pairing-codes.json`。

## 集成行为

`POST /integrations/chat` 使用请求体中的 `platform` + `user_id`（平台侧 ID）解析现场用户：

- 已绑定 → 走 STT + 意图 + MQTT
- 未绑定 → `尚未绑定现场账号，请联系安装人员。`（HTTP 200）
- 调试现场账号可走 `/dev/chat`；`/integrations/chat` 只接受已绑定的平台侧 `user_id`，不把 `owner-001` 等现场账号当作平台用户。

详见 [`integration-chat.zh.md`](integration-chat.zh.md)。

## 微信 IM 操作提示

微信 `wechat-ilink` inbound（非 `POST /integrations/chat`）在绑定成功后：

- 用户首条**业务**指令的业务回复之后，自动追加一次操作提示（仅一次；tip 成功发出后落标 `channel_welcome_sent_at`）。
- 发送「帮助」「菜单」「你好」「help」「start」（整句、不区分大小写）可再次调出，不进 LLM。
- 提示中的示例例句来自当前 `active_domain` Domain Pack 的 `channelOnboarding.examples`。

详见 [`../archive/specs/2026-07-17-wechat-bind-channel-onboarding.zh.md`](../archive/specs/2026-07-17-wechat-bind-channel-onboarding.zh.md)。
