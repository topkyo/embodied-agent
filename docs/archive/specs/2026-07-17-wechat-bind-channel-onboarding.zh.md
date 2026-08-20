# 微信绑定后通道操作提示（Channel Onboarding）

**Date:** 2026-07-17  
**Status:** Implemented

## Goal

参考 Telegram bot「绑定/启动后立刻给出可照着说的指令清单」体验：用户完成微信绑定并在 IM 侧产生会话后，按当前 `active_domain` 收到一次域专属操作提示；之后可通过固定关键词再次调出。提升一线操作便利，不改变意图理解与物理执行主路径。

## Constraints

- 仅微信 IM（`wechat-ilink` inbound）；不做 Web Banner 长文案、不做 WhatsApp/Telegram 用户绑定 tip。
- 扫码 `confirmed` 瞬间通常无 `context_token`，**不**依赖该时刻 proactive 推送。
- 文案真源在 Domain Pack；平台只负责触发、关键词、拼装与防重。
- KISS：不列全技能表、不走 LLM 生成帮助、不引入新外部依赖。
- 缺失 pack 字段时失败可见回退（通用一句），不阻断正常指令回复。
- 每个 deployment 仅一个 `active_domain`；tip 随该域切换。

## Design

### Architecture

```text
微信 inbound
  → 已绑定？否 → USER_REPLY.notBound
  → 帮助关键词？是 → 只回 tip（pack examples）
  → 正常 processChatMessage
  → 若尚未发过首次 tip → 追加 tip + 落标 channel_welcome_sent_at
```

平台读 active Domain Pack 的 `channelOnboarding.examples` 拼装 tip；LIVE pack（agriculture / industrial / robotics）各自提供 2～4 条示例。

### Components

1. **Pack 契约**（`DomainPackManifest` 或等价 contract 暴露面）  
   - 可选：`channelOnboarding?: { examples: string[] }`  
   - 校验：若存在则 `examples.length` ∈ [1, 4]，且每项非空 trim 后 string。

2. **三 LIVE pack**  
   - 各填贴合场景的 `examples`（如工业柜体温查询/排风、农业棚膜通风、机器人状态/导航类短句）。

3. **平台 tip 拼装**（建议 `apps/api/src/chat/` 下小模块，与 `USER_REPLY` 并列）  
   - 模板固定：

```text
已绑定，可以直接发指令。
试试：
· {example1}
· {example2}
…
回复「帮助」可再次查看。
```

   - 无 examples →：`已绑定，可以直接发指令。回复「帮助」查看示例。`

4. **Inbound 触发**（`ilink-bridge` `handleInbound`）  
   - 关键词（整句、去空白、大小写不敏感）：`帮助` / `菜单` / `你好` / `help` / `start`（常量一处真源）。  
   - 首次自动：绑定记录字段 `channel_welcome_sent_at`；仅自动一次；帮助关键词不消耗/不依赖该标记（可重复调出）。

5. **绑定存储**（`platform-bindings` / 现有 binding 模型）  
   - 增加可选 `channel_welcome_sent_at?: string`（ISO）；写标失败应打日志且不阻断本条业务回复。

### Data flow

1. 用户扫码绑定成功 → Web 仍用现有短 message；IM 无强制推送。  
2. 用户微信发首条业务指令 → 业务回复 → 若无 `channel_welcome_sent_at` → 再发 tip → 写标。  
3. 用户发「帮助」等 → 只回 tip，不进 LLM。  
4. 之后普通指令 → 不再自动 tip。

### Error handling

- pack 未声明 onboarding → 通用回退句。  
- 拼装/读 pack 异常 → 通用回退；不抛给用户堆栈。  
- 出站 tip 失败 → 记日志；业务回复已成功则不重试刷屏（首次标记：仅在 tip **成功发出**后落标，避免「标了但用户没收到」；若选择「尝试后即落标」须在实现计划中二选一并测——**本 spec 定为：仅成功发出后落标**）。

### Testing

**Vitest（确定性）**

- 关键词命中 / 非命中。  
- 首次：未落标 → 追加 tip 并写标；已落标 → 不追加。  
- 帮助关键词 → 只 tip、不调 LLM（mock）。  
- 有/无 examples 的拼装结果。  
- manifest `examples` 非法 → contract/loader 失败可见。

**不测：** 真实微信出站、真实 LLM。

**手工：** 绑定后首条指令见 tip 一次；再指令无 tip；「帮助」再出 tip；换 active 域例句变化（若环境允许）。

## Out of scope

- Web / Start 页长 onboarding、复用未挂载 i18n 的完整三步引导。  
- WhatsApp pairing inbound claim、Telegram 用户 bot。  
- Domain Pack 级多语言 tip、富媒体菜单。  
- 扫码成功瞬间无 token 的强推。  
- 用 LLM 生成帮助文案。

## Open questions

（无 — 对话已确认：微信 IM、首次+关键词、按域 examples、方案 2 Pack 契约。）
