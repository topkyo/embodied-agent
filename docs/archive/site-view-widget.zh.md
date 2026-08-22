# 现场视图 Widget（Site View）设计草案

状态：T+0 草案 · 首版仅 **industrial** 挂载 · 组件可跨 pack 复用

## 目标

在 ops 工作台总览页提供一处「现场平面/拓扑」示意：实时测点、告警标注、近期 outcome 短轨迹。面向现场运维扫一眼，不是建模平台。

## 红线

- **禁止**对外/对内文档与 UI 文案使用「数字孪生」「ontology」等表述。
- **鉴权不变**：沿用现有 scene-ops 壳；总览为 `requireOperator`（admin / operator）。本 widget 不新增路由、不改鉴权边界。
- **不接外部数据源**：不接第三方孪生/GIS/BIM；只读本部署既有 store 经现有 admin API 暴露的字段。
- **首版范围**：仅 industrial overview 挂载；agriculture / robotics 后续复用同一 `SiteViewPanel`，通过 `opsTabWidgets` + `pack-ops-registry` 注册。

## 数据源映射

部署数据根：`{AGENT_DATA_DIR}/deployments/{deployment_id}/`（`deploymentScopedPath`）。

| 语义            | 后端真源                                                                        | 落盘路径                                                  | 读路径（API / 代码）                                                                                                       | 首版 UI 用法                              |
| --------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| 实时遥测        | `apps/api/src/telemetry/store.ts`                                               | `telemetry-state.json`                                    | `GET /admin/overview` → `entities[].telemetry` / `reported_at` / `stale`（组装见 `apps/api/src/routes/admin-overview.ts`） | SVG 温度点、排风状态；缺失显示「—」       |
| 告警规则 / 事件 | `apps/api/src/alerts/threshold-store.ts`、`apps/api/src/alerts/alert-events.ts` | `alert-rules.json`、`alert-events.jsonl`                  | overview 的 `active_alert_rules_count`；细则 `GET /admin/alert-rules`；当日事件经 alert-events 查询                        | 柜体旁 alert 标注；无规则/无事件显示「—」 |
| 历史 outcome    | `apps/api/src/scene/outcome-store.ts`（经 MemoryJournal）                       | `scene-outcomes.jsonl`（`packages/memory` `OUTCOME_LOG`） | `GET /admin/scene-outcomes`                                                                                                | 短轨迹列表（最近数条）；无记录显示「—」   |

节点在线态来自同一 overview 的 `nodes[]`（心跳/runtime），首版拓扑可不画节点边，仅作柜体绑定参考。

## UI 约定

- 容器：ops `settings-panel` + `PanelTitle`；布局用 `utilities.css` / `console-layout.css` class，禁止新增 `style={{}}` 堆布局。
- 示意：SVG 平面/拓扑即可（首版 industrial = **1 柜** + 温度点 + 排风状态）。
- 实时点：有 `temperature_c` / `fan_status`（或等价 relay 读数）则展示；否则「—」。
- Alert 标注：有启用阈值或可绑定事件则点亮标注，否则「—」。
- Outcome 短轨迹：可选 props / 后续轻量拉取；空态「—」。
- 文案：中性「现场视图 / Site view」，不出现孪生/本体词汇。

## 挂载

1. Domain Pack：`scenes/industrial/scene/pack.ts` → `opsTabWidgets.overview = "industrial-overview"`。
2. Web：`apps/web/src/pages/scene-ops/pack-ops-registry.tsx` 注册 `industrial-overview` → OverviewPanel。
3. 可复用组件：`apps/web/src/features/ops/SiteViewPanel.tsx`（跨 pack 同一组件；各 pack 只换挂载与实体过滤）。

## 非目标（本阶段不做）

- 多柜拖拽编辑、比例尺地图、历史回放时间轴、写回控制。
- 新后端聚合 API 或 WebSocket 专线。
- 改变 `/admin/overview` 鉴权或角色矩阵。
