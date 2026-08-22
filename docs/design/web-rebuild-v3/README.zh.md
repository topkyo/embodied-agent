# Web 重构效果图 v3.1

状态：React v3.1 截图基线 / 历史 IA 参考。
历史方案：`docs/archive/plans/web-rebuild-agentic-ux.zh.md`；当前设计系统真源见 `DESIGN.md` 与 `apps/web/src/design/tokens.css`。

## 截图清单

| 文件                           | 页面         | 说明                                      |
| ------------------------------ | ------------ | ----------------------------------------- |
| `platform-home-desktop.png`    | 平台首页桌面 | ✅ 2026-06-10 Playwright 回归（1440×900） |
| `platform-home-mobile.png`     | 平台首页移动 | ✅ 2026-06-10（390×844）                  |
| `greenhouse-scene-desktop.png` | 农场工长     | 温室实景 + gh-001 左下面板                |
| `nodes-desktop.png`            | 智能硬件     | 产品矩阵                                  |
| `start-wechat-mobile.png`      | 微信开始     | 角色分流 + 权限表                         |
| `console-ops-desktop.png`      | 运维台       | 浅绿 EA 工作台                            |

## 本地预览

```bash
cd apps/web/prototypes && python3 -m http.server 5199
# http://127.0.0.1:5199/index.html
```

平台首页 Three.js 需联网加载 CDN；离线时显示静态渐变背景。

## 重截建议（React 实施后校验）

```bash
# 使用 agent-browser 或 headless Chrome，视口：
# 桌面 1440×900，移动 390×844
# 覆盖：platform-home、scene-greenhouse、nodes、scenes、start-wechat、console-ops
```
