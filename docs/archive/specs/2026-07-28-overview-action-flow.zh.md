# 总览动作流优先（共享壳 + L2 叙事动效）

**Date:** 2026-07-28  
**Status:** Approved（对话确认：范围共享壳 B、pending 只读 B、可见性 user+admin A、布局上下各半 B、交付一规格两波 A、路径壳内插槽 1、Wave2=L2、动效技术 CSS/SVG+可选 WAAPI B、L3→营销/demo）  
**Related:** 工作台 IA 差异化调研稿（已移出本仓库）

## Goal

把工作台场景总览从「遥测/现场视图优先」改为 **动作流优先**：首屏先回答「有没有事等确认」和「最近动作执行到哪」，现场态仍完整可见；用只读 pending 名单强化确认门叙事（确认仍在微信），并以 L2 叙事动效表达数据↔物理联动——让总览一眼不像典型 AIoT 看板。

## Constraints

- **共享壳**：改 `SceneOpsOverview` 固定顺序，三 LIVE（agriculture / industrial / robotics）一起受益；pack `OverviewPanel` 仍挂载，不折叠。
- **Pending**：只读列表；**禁止** Web 确认/拒绝 API 与按钮。确认主通道仍为微信。
- **可见性**：`requireOperator` — user 与 admin 均可读 pending 与证据链。
- **布局**：上半 ActionFlow，下半 Pack 现场态完整展示（不默认折叠）。
- **交付**：同一规格分两波 — Wave1 结构+API+列表+证据；Wave2 L2 动效。
- **动效技术**：CSS/SVG 为主；进度带编排必要时可用 **原生 WAAPI**；禁止 framer-motion / GSAP / Lottie（留给营销 L3）。
- **设计纪律**：class 优先；禁止新增 `style={{}}` 堆布局；尊重 `prefers-reduced-motion: reduce`。
- **YAGNI**：不新开侧栏 Tab；不做数字孪生；不做多 agent 编排图 / LLM trace。

## Design

### Architecture

```text
SceneOpsOverview (shared shell)
  1. OpsPageHeader (+ lead: 微信确认 · 本台待办与证据)
  2. ActionFlowSection          ← Wave1 上半
       PendingConfirmsPanel     (readonly)
       CommandEvidencePanel     (stages + duration)
       [optional secondary: alert rules / schedules collapsed]
  3. Pack OverviewPanel         ← 下半，不折叠
       agriculture | industrial SiteView | robotics overview
  4. Nodes                      (pack flags; robot may hide)
  5. Dedup: robot pack 内「最近指令」与壳级 CommandEvidence 二选一，优先壳级
```

Wave2 在上述 DOM 上叠加 L2 动效（不改信息架构）。

### Components

| 组件 | 职责 |
|------|------|
| `ActionFlowSection` | 动作流容器；入场 stagger 的挂载点（Wave2） |
| `PendingConfirmsPanel` | 只读行：动作摘要、目标、剩余时间；空态；CTA「请到微信回复确认」 |
| `CommandEvidencePanel` | 最近 N 条指令阶段展示（理解→确认→执行→回执）+ status / duration；由现有 commands API 编排 |
| Pack `OverviewPanel` | 保持现有；Wave2 接受「执行中联动」强调 class（industrial/agriculture） |
| 进度带（Wave2） | **单焦点**：跟最近一条指令或一条焦点 pending 的阶段；禁止多时间线并行编排 |

### Data flow

**Pending（Wave1）**

- 复用 `apps/api/src/policy/pending-confirm.ts` 存储。
- **扩展 `GET /admin/overview`**：保留 `pending_confirms_count`；新增 `pending_confirms: PendingConfirmView[]`（仅未过期）。
- `PendingConfirmView` 至少含：`user_id`、`created_at`、`expires_at`、目标摘要、动作/技能摘要、可选 `scene_skill_id`。从 `intent` 投影；不把可滥用的完整内部载荷原样下发。
- 鉴权与 overview 相同：`requireOperator`。
- Web **无** POST/DELETE confirm。

**Commands（Wave1）**

- 继续 `GET /admin/commands?limit=10`（或现有等价）；UI 编排阶段，不新造服务端状态机。

**现场态**

- Wave1：数据路径不变。
- Wave2：根据焦点指令/执行中状态，给 SiteView 或温室对应点加强调 class。

### Error handling / empty states

- Pending 空：仍显示区块标题 +「当前没有等待确认的动作」+「需要确认时会出现在这里；请在微信回复确认」。
- Pending 有数据：行内剩余时间由 `expires_at` 计算；过期不展示。
- CTA：文案引导微信确认；不做假装调起微信的确认；可选链到 `/start` 绑定说明，**不是**确认动作。
- Commands 空：「暂无指令记录」。
- overview 失败：沿用 banner + Retry；投影缺字段显示「—」，不静默丢整表。

### Wave2 — L2 叙事动效

| 项 | 行为 |
|----|------|
| 进度带 | 阶段推进（理解→确认→执行→回执），单焦点 |
| 现场联动 | 执行中：对应排风/点位短暂描边或呼吸 |
| 入场 | 进入总览时 ActionFlow **一次** stagger（轮询不重播） |
| L1 基底 | 风机 ON 轻转、告警 pulse、数值 diff 高亮、pending/status 行高亮、Readiness 一次性翻转 |
| 技术 | CSS/SVG 默认；编排过脆时用 WAAPI；`prefers-reduced-motion` → 静态 |
| 禁止 | 持续炫耀循环、3D、粒子片头、动效 npm 库 |

### Testing

**Wave1**

- API：`pending_confirms` 仅未过期；user session 可读；不存在 Web confirm 写接口。
- 组件/页面：DOM 顺序 ActionFlow → Pack Overview；空态文案；user 可见列表。
- Playwright dogfood：user 总览可见 pending 区域；**断言无** Web 确认/拒绝按钮。默认不加 `@critical`，除非门闩语义变化。

**Wave2**

- 进度带阶段 class、联动 class、reduced-motion 降级存在性测；不对 L3/像素门禁。

**禁止：** mock LLM；用动效假证明物理执行。

## Out of scope

- Web 端确认/拒绝（可列为后续独立规格）。
- L3 大气制作（全屏仪式、Rive/Lottie/视频等）— **仅 `apps/site` / demo**，另开 brainstorm。
- 新侧栏「动作流」Tab；改微信主文案流程；真柜 Modbus LIVE；数字孪生措辞。
- framer-motion / GSAP / Lottie 引入本仓 ops。

## Open questions

（无 — 已在对话关闭）

## Acceptance (product)

1. 打开任一 LIVE `/scenes/*/ops`：首屏上半为待确认 + 指令证据，下半为现场态。  
2. 有 pending 时 user 能看到名单与倒计时，且只能被引导去微信确认。  
3. 无 Web 确认按钮。  
4. Wave2 后：单焦点进度带与现场联动在非 reduced-motion 下可见；reduced-motion 下静态可用。
