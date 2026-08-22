# Dogfood Report — embodied-agent Web

**Date:** 2026-06-12  
**Target:** http://127.0.0.1:5173  
**Session:** ea-dogfood-20260612  
**Scope:** 全路由 + 守棚 ops 各 Tab + 安装人员门闩 + 设备边界操作

## Summary

| Severity    | Count |
| ----------- | ----- |
| P0 Critical | 1     |
| P1 High     | 3     |
| P2 Medium   | 2     |
| P3 Low      | 1     |
| **Total**   | **7** |

## Routes exercised

- `/`, `/scenes`, `/scenes/greenhouse`, `/nodes`, `/start/wechat`
- `/scenes/greenhouse/ops` (+ settings, devices, users, review, platform)
- `/scenes/greenhouse/ops/platform?role=installer`
- `/scenes/aquaculture/ops` (disabled pack)
- `/console` → legacy redirect
- Devices: Issue Install Code, active nodes list

## What passed

- 营销首页、领域页、硬件页可加载，无 JS error
- 守棚 ops 总览：双棚遥测 Live、节点 online/active 显示正确
- 设备页：生成安装码 API 成功（DF-xxxx）
- Review / Platform 非安装人员门闩文案正确
- `?role=installer` 可进入平台底座，显示 Review/Platform 导航
- 水产场景 ops 正确显示「尚未开放」
- `/console` 重定向至 greenhouse 安装人员平台页

---

### ISSUE-001 — P0 — EN 语言下 sceneOps 大量文案显示为 i18n 键名

**Area:** `/scenes/greenhouse/ops/*` (EN locale)

**Observed:** 侧栏、顶栏、导航、总览标题显示 `sceneOps.nav.overview`、`sceneOps.topbar`、`SCENEOPS.SIDEBAR`（CSS uppercase 放大了缺失键）。

**Missing keys (12):** `sceneOps.nav.label`, `sceneOps.topbar`, `sceneOps.sidebar`, `sceneOps.backScene`, `sceneOps.nav.overview`, `sceneOps.nav.settings`, `sceneOps.nav.devices`, `sceneOps.nav.users`, `sceneOps.overview.title`, `sceneOps.overview.lead`, `settings.scope.scene.lead`, `settings.scope.platform.lead`

**Repro:** 浏览器 `localStorage.ea_lang=en` 或点 EN → 打开 `/scenes/greenhouse/ops`

**Screenshot:** `screenshots/route--scenes-greenhouse-ops.png`

---

### ISSUE-002 — P1 — 浏览器标签标题显示原始键名

**Area:** 所有 `/ops` 页面

**Observed:** `document.title` = `Embodied Agent · sceneOps.nav.label`（EN 下键名未翻译）

**Repro:** 打开任意 ops 子页 → 看标签页标题

---

### ISSUE-003 — P1 — Ops 工作台无法切换语言

**Area:** SceneOpsLayout

**Observed:** `.ops-console-root .top-bar { display: none }` 隐藏了含 `LangSwitcher` 的顶栏；用户在 ops 内无法切换中/EN。

**Repro:** 进入 `/scenes/greenhouse/ops` → 找不到语言切换控件

---

### ISSUE-004 — P1 — 设备页成功/错误消息硬编码中文

**Area:** `/scenes/greenhouse/ops/devices`

**Observed:** EN 界面下点击 Issue Install Code，成功 Banner 仍为「安装码已生成: DF-xxx」；`setErr("请输入 node_id")` 等亦未走 i18n。

**Repro:** EN 模式 → Issue Install Code → 读 Banner 文案

---

### ISSUE-005 — P2 — 安装人员门闩页链接文案仍为键名

**Area:** `/scenes/greenhouse/ops/platform`（无 installer）

**Observed:** 底部链接显示 `sceneOps.nav.overview` 而非「Back to overview」

**Repro:** 非 installer 访问 platform 页

---

### ISSUE-006 — P2 — 活跃节点心跳时间格式缺少空格

**Area:** Devices → Active Nodes

**Observed:** `fw:sim-0.3.0hb 2026/6/12 23:34:43` — `hb` 与 firmware 粘连

**Repro:** 打开设备页 → 看 active 节点行

---

### ISSUE-007 — P3 — vent/fan 状态长期 unknown

**Area:** Ops 总览温室卡片

**Observed:** 温湿度 Live，但 Vent/Fan 均为 `unknown`（模拟器未上报或未映射）

**Note:** 可能是模拟器遥测字段缺口，非纯 UI bug；需与 sim 对齐后复验。

---

## Fix plan (this iteration)

1. ✅ 补齐 12 个 EN `sceneOps` / `settings.scope` 键
2. ✅ Ops 顶栏恢复 `LangSwitcher`
3. ✅ `NodeManagementPanel` 成功/错误消息 i18n 化
4. ✅ 修复 active 节点 `hb` 格式
5. ✅ `DocumentTitle` ops 子路由更具体标题
6. ✅ 复测：agent-browser snapshot + web test 33/33 + e2e 9/9

## Post-fix verification (2026-06-12)

- EN ops 侧栏显示 Overview / Devices / Scene settings（不再裸露键名）
- 标签页标题：`Embodied Agent · Overview`
- Ops 顶栏可见 中/EN 语言切换
- ISSUE-007 vent/fan unknown：待模拟器遥测字段对齐（未在本轮修复）

---

## Follow-up Dogfood (2026-06-14)

**Target:** http://127.0.0.1:5173
**Session:** `embodied-web-dogfood`
**Runtime:** 新 profile 架构，`1883/3001/5173`，`AGENT_DATA_DIR=.agentstack/dev-profiles/greenhouse/data`

### Automated Gate

- Playwright Web smoke + Dogfood: `14/14` passed
- Routes covered: `/`, `/settings`, `/scenes`, `/nodes`, `/scenes/greenhouse`, `/scenes/greenhouse/ops`, `/ops/devices`, `/ops/settings`
- Interaction covered: EN ops nav, devices empty-node bind hint, pair page title/tab, scene settings save, overview telemetry not `unknown`

### Browser Pass

- `ops-overview.png`: 总览页可见，EN 文案正常，节点/运维/阈值/报表/最近指令区域加载。
- `devices.png`: 设备页可见，安装码、MQTT pairing、绑定表单、设备 JSON 编辑区加载。
- `settings-before-save.png`: 场景设置页可见，站点坐标、NDVI、通知与 NLG 开关加载。
- Console: only Vite/React/Vercel Analytics development messages observed; no app runtime error found.

### Findings

- No new application issue found in this follow-up pass.
- Note: `agent-browser wait --text Saved` did not catch the transient save feedback, but the same save flow passed Playwright and `/admin/settings` confirmed persisted settings with `llm_api_key_set: true` and masked key only.
