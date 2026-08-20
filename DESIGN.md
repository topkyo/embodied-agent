# 具身Agent Web 设计系统（v3.1）

**双 app 真源（2026-07 拆分后）：**

| 应用            | 职责                                    | 设计 token                       | 路由入口                                 |
| --------------- | --------------------------------------- | -------------------------------- | ---------------------------------------- |
| **`apps/site`** | 营销站（公开首页、场景叙事、三域 demo） | `apps/site/src/design/`          | `npm run site:dev` 默认 `:5170`          |
| **`apps/web`**  | 工作台（登录、微信开始、场景 ops）      | `apps/web/src/design/tokens.css` | `npm run web:dev` / `dev:*` 默认 `:5173` |

截图索引见 `docs/design/web-rebuild-v3/README.zh.md`。  
状态：**React v3.1 已落地**；历史方案见 `docs/archive/plans/web-rebuild-agentic-ux.zh.md`，`docs/archive/prototypes-web/` 仅 IA 考古，**不是**运行时真源。

两站 visual token 同源演进，改色板时两边对齐；业务路由**不要**写回单一 `apps/web`。

## 产品定位

具身Agent 是 **面向物理世界的 Agent Runtime**（LLM 只理解意图；确定性 Runtime 负责授权、安全、执行和结果验证），不是智慧农业官网或纯 IoT 看板。

### 营销站（`apps/site`）

- **平台首页 `/`**：讲编排底座与证据链（Hero + 证据面板）。
- **农场工长 `/scenes/greenhouse`**：agriculture Runtime 参考实现（双棚模拟已验证，真棚待验收）；遥测走 `VITE_DEMO_API_*` + `DEMO_READONLY`，不用 admin-token。
- **机器人 `/scenes/robot`**、**工业 `/scenes/industrial`**：Runtime 可加载叙事 + DemoPanel（M20 stub / 模拟排风；真实硬件待验收）。
- **智能硬件 `/nodes`**、领域列表等：见 `apps/site/src` 路由。

### 工作台（`apps/web`）

- **登录 `/login`**、**领域选择 `/start`**、**微信开始 `/start/wechat`**：session 鉴权；绑定与角色分流。`/login` 默认跳 `/start`；RequireAuth 重定向时保留 `state.from`。
- **平台底座 `/scenes/{active-pack}/ops/platform`**：LLM/MQTT/通道与 readiness（需 admin）。
- **场景工作台 `/scenes/{active-pack}/ops/*`**：总览/设备/用户/复盘等（operator 只读面 + admin 写配置）。
- 历史 `/console`、`/settings`、`/settings/pair`、`/landing`、`/scenes/farm` 与 web 内营销首页路由已删除，不得回流。

## 视觉主题

参考 Tesla/SpaceX 的信息密度与全幅 Hero，主色为 **EA 硬件绿**，避免大面积纯黑或廉价农业模板。

关键词：可信 AI、强硬件、真实现场、产品证据、克制大厂风。

### 色彩（CSS 变量）

| 角色      | Token                                   | 用途                      |
| --------- | --------------------------------------- | ------------------------- |
| Hero 深底 | `--sf-green-950` / `--sf-green-900`     | 平台/场景 Hero            |
| 正文底    | `--sf-canvas` `#f7f8f5`                 | 浅色内容区                |
| 主强调    | `--sf-accent` `#1f8a5b`                 | CTA、连接态、RUNTIME 徽章 |
| 亮强调    | `--sf-accent-bright` `#78d691`          | Hero 高亮、在线点         |
| 正文      | `--sf-ink` / `--sf-body`                | 标题与说明                |
| 运维底    | `--sf-ops-bg`                           | 浅绿工作台（户外可读）    |
| 语义      | `--sf-blue` / `--sf-amber` / `--sf-red` | NEXT、提醒、风险          |

场景页可通过 `body.scene-*` 覆盖 `--scene-accent`（工业蓝、银龄琥珀、宠物金）。

### 字体

- 中文：`Noto Sans SC`
- 等宽/telemetry：`IBM Plex Mono`
- Hero 可大字号，但移动端须可换行；运维台标题保持工具感，不用 Hero 级字号。

## Hero 布局规范

### 平台首页

- 背景：左深右透渐变 + `platform-hero-three.js`（CDN three@0.160.0）。
- `hero-inner`：**双列网格** — 左列上行文案+CTA，左列下行证据面板，右列留给动画。
- 证据面板内容：`平台 · 编排中枢`，指标为智能体/节点/技能，事件为理解/裁判/沉淀。
- **禁止**绝对定位面板遮挡 CTA；`prefers-reduced-motion` 时跳过 Three.js。

### 守棚 / 拓展场景

- 守棚：实景图 `assets/greenhouse-aiot-hero.jpg`，`background-position: 72%`；gh-001 面板左下。
- 工业/银龄/宠物：Unsplash 或渐变 + `scene-hero`；标注 NEXT / PLANNED / EXPLORE。
- 模拟数据必须脚注：「双棚模拟联调，不作 ROI 承诺」等。

## 导航与信息架构

公开导航（**`apps/site`** `MarketingLayout`）：

```text
平台 | 智能硬件 | 领域展开 | 微信开始     [运维台 → VITE_WEB_APP_URL]
```

领域展开排序：农场工长（Runtime 可加载 · 双棚模拟）→ 机器人领域（M20 stub）→ 工业安能卫士（过温排风模拟）→ 水产管家 placeholder / NEXT → 冷链值班员 PLANNED；银龄/宠物降为探索链接。首页 Runtime 证据区块紧跟 Hero 之后。运行态 Domain Pack 以 `domain-packs.json` 为准；site/web 静态 catalog 只映射 slug/展示，`status: live` / placeholder 与 active 以 API catalog 为准（live = Runtime 可启用，不是现场验收）；概念场景不生成 ops 入口。

## 组件约定

- 圆角：统一 `var(--sf-radius)`（4px）；pill 徽章用 `999px`；禁止硬编码 `8px` 圆角双轨。hairline 边框，少阴影。
- 品牌：`EA` 字标 +「具身Agent」。
- 徽章：`badge-live` / `badge-next` / `badge-plan` / `badge-explore`。
- 证据面板：`proof-panel` — 顶栏、metric-grid、event-list、disclaimer。
- 按钮：主色实心、ghost 描边、accent 绿底；运维台浅底黑字主按钮。
- 图标：React 实施继续 `lucide-react`。

## 运维台

- 浅绿 EA 工作台（`body.ops` + `--sf-ops-*`），非黑色监控台。
- 顶栏/横幅明确：棚主用微信，本台只做安装与复盘。
- 平台底座：位于当前 active Domain Pack 的 `/ops/platform`。**首屏 = readiness + 核心 settings**；飞轮 / ROI 默认折叠；策略运营放在复盘；**无**企微 / SMS 等空壳通道入口。微信绑定在 `/start/wechat`。
- 场景工作台侧栏：总览、场景配置、设备、复盘、用户（按 active Domain Pack 实例）。非 active pack、placeholder 和概念场景必须显示不可执行状态，不回退到 greenhouse。

## 文案原则

- 少用「场域」，用「具身智能体」「场景」。
- 平台页讲底座；场景页讲结果；棚主白话。
- 避免：无人农场、静默接管、虚构 ROI、把模拟器包装成真实试点。
- 工程术语（Agent/Node、技能真名）可保留，但面向棚主处须有人话说明。

## Do / Don't

**Do**

- 平台与守棚 Hero 叙事分离。
- 证据面板统一左下语义。
- 角色分流：微信 vs 运维台。
- 真实或明确标注的模拟状态、日志、复盘。
- Web UX 验证流程见 [`AGENTS.md`](AGENTS.md) §Web UX 验证。
- 验收判据：platform 无 admin session → 拒绝页（非空白或静默失败）；placeholder / 非 active pack 的 ops → 禁用壳（不可执行）；布局与状态样式用 CSS class，不用内联 `style`。

**Don't**

- 泛 AI 紫蓝渐变、光球粒子、玻璃拟态。
- 麦田/泥土棕廉价农业风、卡片堆叠营销模板。
- 平台首页用守棚实景主导；把拓展场景写成当前售卖承诺。
- 运维/控制台面板用 `style={{}}` 堆布局（用 `design/utilities.css` + 组件 class）。
- 单文件巨型 CSS（样式按 `tokens` / `app-shell` / `console-settings` / `console-layout` / `utilities` / `marketing*` / `console` 分层；`design-lab.css` 仅 `DesignLab.tsx` DEV import）。

## 实施映射（React）

本表为核心实施映射，非穷举；完整路由见 `apps/web/src/App.tsx`。

| 原型                    | 目标路由                             | 所属 app    | 状态 |
| ----------------------- | ------------------------------------ | ----------- | ---- |
| `platform-home.html`    | `/`                                  | `apps/site` | ✅   |
| `nodes.html`            | `/nodes`                             | `apps/site` | ✅   |
| `scenes.html`           | `/scenes`                            | `apps/site` | ✅   |
| `scene-greenhouse.html` | `/scenes/greenhouse`                 | `apps/site` | ✅   |
| `start-wechat.html`     | `/start/wechat`                      | `apps/web`  | ✅   |
| `start-picker.html`     | `/start`                             | `apps/web`  | ✅   |
| `console-ops.html`      | `/scenes/{active-pack}/ops/platform` | `apps/web`  | ✅   |

共享组件：`SceneOpsLayout`（`apps/web/src/layouts/`）；`ProofPanel`、`PlatformHeroCanvas`、`SceneHero`（`apps/site/src/components/`）。

评审截图：`docs/design/web-rebuild-v3/`（React 实施后可用 agent-browser 对照线上一致性重截）。
