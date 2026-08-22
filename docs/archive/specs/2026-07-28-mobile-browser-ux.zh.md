# 手机端浏览器体验（最小交集波）

**Date:** 2026-07-28  
**Status:** Approved（对话确认：范围 C、观感 B、非目标 C、方案 1）

## Goal

在 **390×844** 视口下，让营销站首屏/场景列表与工作台 ops 壳达到「不溢出、主操作可点、关键信息可读」的观感级可用，而不引入移动专用组件双轨或独立 CDP 流水线。

## Constraints

- 方案：**CSS / 壳层收敛**（改现有 class 与少量结构，不新建 Mobile* 组件层）。
- 断点：工作台 ops 以现有 **860px** 为准；营销站 drawer / 列表以 **900px** 对齐。
- 保留现有 design tokens 与 class 纪律（`utilities.css` + 组件 class；禁止新增 `style={{}}` 堆布局）。
- 验证走现有 Playwright + agent-browser 探索；不上独立 CDP / 真机 Safari CI / PWA / 小程序。
- 桌面布局行为不得被本波破坏。

## Design

### Architecture

单波覆盖两个表面的**最小交集**：

| 表面 | 纳入 | 手段 |
|------|------|------|
| `apps/web` ops 壳 | 双顶栏堆叠、readiness 挤压 | CSS + 必要 class；不合并 Header/Topbar 组件 |
| `apps/site` | `/` hero、`/scenes` 列表、轻量加载态 | 断点对齐 + 现有 loading 模式 |
| `apps/web` 附带 | Settings 触控高度；用户表 + 节点表横向滚动可用性 | 仅窄屏 `@media` |

### Components / surfaces

#### 1. Ops 顶栏（≤860px）

- 窄屏下 `SceneOpsTopbar` 改为**纵向堆叠**：第一行 readiness（省略号 + 原生 `title` 全量），第二行动作按钮（解绑 / 返回），全宽左对齐。
- `.scene-ops-readiness-badge`：取消与按钮同行争宽；`max-width` 改为相对视口（如 `min(100%, calc(100vw - 2rem))`），允许文本省略。
- `SceneOpsHeader` 与 `SceneOpsTopbar` **职责不合并**；桌面布局不变。
- 验收：`/scenes/greenhouse/ops` @ 390×844 — 无页面级横向滚动；Open menu 可见可点；badge 不顶出视口。

#### 2. 营销站首页 + 场景列表

- `@media (max-width: 900px)`：`.scene-card` 改为单列（去掉固定 `180px` thumb 列），与 nav drawer 断点一致。
- 首页 hero / loop strip：只修现有 `@media`，保证 390 宽无横向溢出；不改桌面构图。
- `ScenesList` / `DemoPanel`：增加明确 loading（骨架或与现有 muted 文案一致的占位），避免空白闪屏。
- 验收：`/` 与 `/scenes` @ 390×844 — 无横向滚动；汉堡菜单可用；场景卡全文可读。

#### 3. Settings 触控 + 两张高频表（≤759px）

- `.settings-nav a` 与主操作按钮：`min-height` ≥ **44px**（与现有输入触控对齐）。
- 不重排 Settings IA；不改 ≥980px 粘性侧栏。
- **用户列表**、**节点列表**：强化 `.ops-table-wrap` 可滑；单元格 padding ≥8px；**不** card 化整表。

### Data flow

无后端 / API / session 变更。纯前端布局与呈现。

### Error handling

- 加载失败态沿用现有 Banner / muted 错误模式；本波不统一全站错误体系。
- 缺配置、鉴权失败行为不变（不兜底）。

### Testing

| 层 | 要求 |
|----|------|
| Playwright | `390×844`：ops 顶栏不溢出 + drawer；site `/` 与 `/scenes` 无 `document` 横向溢出；settings nav 可点（成本可控则加） |
| 门禁挂载 | 扩现有 `web-dogfood` / `site-smoke`（或等价）；**不**新建 mobile Playwright project |
| 探索 | agent-browser 窄屏抽检；不作为 CI 阻断 |
| 回归 | 桌面默认 viewport 现有 smoke/dogfood 仍通过 |

## Out of scope

- PWA、小程序、独立 CDP 流水线、真机 Safari CI
- 全站表格 card 化、平台 Settings 整页重排
- 新建移动专用组件双轨（`MobileTopbar` 等）
- featured 场景卡重设计、WebGL context loss、全站 typography token 大扫除
- 微信 H5 / 小程序通道体验（非本波「浏览器」范围）

## Open questions

（无 — 已在对话中确认）
