# 工作台窄屏字号与触控尺寸

**Date:** 2026-07-28  
**Status:** Approved（对话确认：范围 D、方案 1）

## Goal

在 **390×844** 视口下，让 `apps/web` 工作台正文可读、主操作可点：窄屏抬高字号与触控高度；**桌面默认尺寸不变**。不引入移动专用组件双轨，不重排 IA。

## Constraints

- 方案：**窄屏 CSS 尺寸层**（现有 class + `@media` / 少量变量覆盖），不新建 `Mobile*` 组件。
- 断点：ops / 壳层 **`≤860px`**；Settings 沿用现有 **`≤759px`**。
- 保留 design tokens 与 class 纪律（`utilities.css` + 组件 class；禁止新增 `style={{}}` 堆布局）。
- 验证挂现有 Playwright；不上独立 mobile project / PWA / 真机 Safari CI。
- 桌面 viewport 行为与字号不得被本波破坏。

## Design

### Architecture

在 #69 布局收敛之上补一层**尺寸适配**：

| 层 | 本波 |
|----|------|
| 布局（顶栏堆叠、表横滑） | 已交付，本波不重做 |
| 字号 / 触控高度 | 本波：窄屏抬一档 |

手段：在既有断点内覆盖关键 class 的 `font-size`、`min-height`、单元格 `padding`；优先用少量局部 CSS 变量，避免全站 `html { font-size }` 缩放。

### Components / surfaces

| 表面 | 窄屏规则 |
|------|----------|
| Ops 顶栏、抽屉项、主操作按钮 | `min-height ≥ 44px`；抽屉文字 ≥14px |
| 总览 / 运行状态等卡片 | 标题 ≥16px；正文 ≥14px；次要说明 ≥12px |
| Settings 导航与表单控件 | 触控 ≥44px；标签与输入文字 ≥14px |
| 用户表 / 节点表 | 单元格 padding ≥8px；表头与单元格文字 ≥12px；保持横滑，不 card 化 |
| 登录页 | 输入与提交 `min-height ≥ 44px`；正文 ≥14px |

桌面（高于上述断点）保持当前字号与控件高度。

### Data flow

无后端 / API / session 变更。纯前端呈现。

### Error handling

鉴权失败、缺配置、Banner 错误态行为不变；本波不统一错误文案体系。

### Testing

| 层 | 要求 |
|----|------|
| Playwright | `390×844`：抽样断言关键控件计算 `min-height ≥ 44`、正文计算字号不低于上表下限；挂现有 `web-dogfood`（或等价） |
| 回归 | 桌面默认 viewport 现有 smoke / dogfood 仍通过 |
| 探索 | agent-browser 窄屏抽检；不作为 CI 阻断 |

## Out of scope

- PWA、小程序、独立 CDP / 真机 Safari CI
- 全站 `rem` 基准缩放、移动专用组件双轨
- 表格 card 化、Settings / 平台页整页重排
- 营销站（`apps/site`）、微信 H5 / 通道体验
- 改变桌面默认字号或控件高度

## Open questions

（无 — 已在对话中确认）
