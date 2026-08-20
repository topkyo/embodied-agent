# Web UX Vision — 暗色系企业级改版（2026-07）

> 与明亮企业级改版并列，沉淀 robot / industrial / aquaculture / coldchain / elderly / pet 等非守棚场景的 **暗色 scene-hero 视觉规范**。

## 摘要

`apps/site` 当前守棚外的 6 个 `.scene-page--{slug}` 场景 hero 一致走深底（slate-800/900 / cyan-900 / stone-900 / amber-900）+ `::after` 暗蒙版 + `on-dark` 文案调性。本文档作为该「暗色企业级」调色与排版的运行时规范存档，与明亮 vision 改版**互不替代**：明亮改版只覆盖守棚 hero (`apps/site/src/assets/vision/card-greenhouse.jpg` 等 LIVE 卡片与首页 LIVE 区块)；其余 scene hero 保留暗栈，仅在 token / 排版细节上做出与明亮改版对应的纪律。

> 暗色 scene-hero 是 design.md 默认调性（「Hero 深底 / `--sf-green-950` / `--sf-green-900`」 + 「守棚 / 拓展场景」原文：「工业/银龄/宠物：Unsplash 或渐变 + scene-hero；标注 NEXT / PLANNED / EXPLORE」）。vision 改版（v0.9.2）只把 robot/industrial 占位渐变换成实际 vision 卡，其余调性维持。

## scope（在范围内）

```text
.scene-page--robot
.scene-page--industrial
.scene-page--aquaculture
.scene-page--coldchain
.scene-page--elderly
.scene-page--pet
```

每个 scene-page 至少定义三个 token：

| Token                   | 用途                                                           | 示例（robot）                                                                                            |
| ----------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `--scene-accent`        | on-light 主强调（CTA / active 按钮）                           | `#64748b` (slate-500)                                                                                    |
| `--scene-accent-bright` | on-dark 高亮（live 点 / 高亮数字）                             | `#94a3b8` (slate-400)                                                                                    |
| `--scene-hero-bg`       | scene-hero 背景实色打底                                        | `#1e293b` (slate-800)                                                                                    |
| `--scene-hero-bg-image` | 多层背景（top → bottom）：url(vision) → linear-gradient(slate) | `url("../assets/vision/card-robot.jpg"), linear-gradient(135deg, #334155 0%, #1e293b 55%, #0f172a 100%)` |

## 排版 & 文案

- 父容器 `.scene-hero`：
  - `min-height: 80vh`（守棚专属 `.hero-greenhouse` 走 100vh）；保持垂直比例分布相对宽松。
  - `color: var(--sf-white)`。
- 暗蒙版 `.scene-hero::after`：
  - `linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.82) 100%)`。
  - 上 25% / 下 82% 透明度梯度 → 顶部基本保留 vision 主体可读，底部用于保证 on-dark 文案 + CTA 可见。
- 文案层 `.lead.on-dark`、`h1.on-dark`、`badge-live / badge-next / badge-plan / badge-explore`：
  - 必须用 `on-dark` 子句类（在 `marketing-pages.css` 与 `utilities.css` 中定义）；
  - 暗底上 only white-100 / accent-bright；二元对比度 ≥ AA（4.5:1）。
- 字号：`clamp(32px, 5.5vw, 56px)`，与守棚 hero 对齐的 token 化入口。
- CTA 按钮：主色实心 + ghost 描边 + accent 绿底（与守棚一致）。

## source 资产（v0.9.2 现状）

| scene slug  | 源 hero 资产                                                          | 视觉覆盖                                                                                                    |
| ----------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| robot       | `apps/site/src/assets/vision/card-robot.jpg` (1200×800, 明亮 AI)      | LIVE（2026-07-11 起；`worktree/vision-assets-cherry-pick` 合 main 后）                                      |
| industrial  | `apps/site/src/assets/vision/card-industrial.jpg` (1200×800, 明亮 AI) | LIVE（同上）                                                                                                |
| aquaculture | _暂未接入 vision 卡_                                                  | `linear-gradient(135deg, #0c4a6e 0%, #082f49 55%, #042f2e 100%)` 占位 → NEXT 占位                           |
| coldchain   | _暂未接入 vision 卡_                                                  | 深蓝 linear-gradient → PLANNED 占位                                                                         |
| elderly     | _暂未接入 vision 卡_                                                  | `linear-gradient(180deg, rgba(0,0,0,0.2), rgba(0,0,0,0.78))` on `#1c1917` 暖黑 + 琥珀 accent → EXPLORE 探索 |
| pet         | _暂未接入 vision 卡_                                                  | `linear-gradient(180deg, rgba(0,0,0,0.2), rgba(0,0,0,0.78))` on `#422006` 暗棕 + 琥珀金 → EXPLORE 探索      |

> 接入新 vision 卡必须保留原 scene-hero 暗栈：`--scene-hero-bg` + `--scene-hero-bg-image` (url + linear-gradient) + `::after` 蒙版不得移除；**只**替换 url 项内的占位渐变图。
> 源图比例守棚统一为 **1200×800**（v0.9.2 同期变更：`greenhouse-aiot-hero.jpg` 重采样 1000×562 → 1200×800；robot / industrial 已在 v0.9.2 是 1200×800）。

## 不在范围内（明确 boundary）

- **不**新增「暗色 vision AI 资产」清单。当前 `apps/{site,web}/src/assets/vision/README.zh.md` 是明亮改版唯一真源；`v0.9.2` 发布说明中 vision 五张图（landing-pipeline / twin-greenhouse / card-*）全部为「明亮企业级」。如未来需暗色 AI 卡，应单独建 `apps/site/src/assets/vision-dark/` + 同名 README，避免破坏 README「再生成规则」三硬约束。
- **不**改 `.scene-hero::after` 通用暗蒙版。所有 6 个暗色 scene 都通过这个蒙版保证 `on-dark` 文案 AA 对比度。
- **不**用 `.hero-greenhouse` 样式替代 `.scene-page--*` hero。两者是不同的容器：守棚 hero 用真实棚图 + `90deg` 半透蒙版（左深右透），scene-hero 用 slate 多层 + `180deg` 全屏蒙版（顶浅底深）。
- **不**在 scene-hero 内引入 `style={{}}` 堆布局（与 design.md §不要 一致）。

## 与明亮改版的对照

| 维度                      | 明亮 vision 改版                                                                                    | 暗色 scene-hero 改版                                                    |
| ------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 容器                      | `.hero-greenhouse` + `.trio-card-img`                                                               | `.scene-hero`（6 个 scene-page）                                        |
| 主背景                    | 真实棚图 / AI 明亮图                                                                                | slate-800/900 / cyan-900 / stone-900 / amber-900 + dark linear-gradient |
| 蒙版方向                  | 90deg 左→右（暗→透）                                                                                | 180deg 顶→底（浅→深）                                                   |
| 文案层级                  | on-dark（守棚 hero copy 仍为 on-dark，因 heroInner 文字在左侧暗区）                                 | on-dark（白字 + accent-bright）                                         |
| 源图比例（v0.9.2 同期后） | 统一 1200×800                                                                                       | 统一 1200×800                                                           |
| READMEs 真源              | `apps/{site,web}/src/assets/vision/README.zh.md` + `docs/design/web-ux-vision-2026-07/README.zh.md` | 本文件                                                                  |
| 适用范围                  | LIVE 三域卡（守棚首页 LIVE / M20 机器人 / 工业安全）+ L+ 探索视觉                                   | 6 个 scene-page hero + active placeholder                               |

> 两份文档互为 sibling，互相不替换、不升级覆盖；改某一处请同步两份 README.zh.md，避免「明亮 ↔ 暗色」命名歧义。

## 文档与版本痕迹

- 上游 commit：v0.9.2 `c4d4f89 feat(site): extend vision 资产接入 \`/\` 与 /scenes 列表（保留 greenhouse 原图）`+ docs commit`4dbbc2b docs(release): v0.9.2 — 营销站 vision 资产接入（明亮企业级改版落地）`。
- 同期 source 元变更：`apps/site/src/assets/greenhouse-aiot-hero.jpg` 重采样至 1200×800（v0.9.2 patch）。
- 后续若新增 .scene-page--*：必须先更新本文 §scope + token 表 + source 表。
