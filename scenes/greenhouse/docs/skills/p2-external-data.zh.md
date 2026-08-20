# P2 外部数据与运营技能

## 状态

工程已实现；**对外交付范围以各 Domain Pack 的 skills 声明为准**。

**权威枚举**：各 Domain Pack 的 `skills.ts`（如 `scenes/greenhouse/skills.ts` 的 `GREENHOUSE_P0_SKILLS` 含 weather/satellite/agronomy/tasks/advice/policy 等 P2 技能）。平台层 `packages/core/src/skills.ts` 的 `P2_SKILLS` 为空数组。

## 技能清单

| Skill                     | 说明                                                                             | Handler 位置                     |
| ------------------------- | -------------------------------------------------------------------------------- | -------------------------------- |
| `weather.query_forecast`  | 天气预报（坐标见 settings / geo 缓存）                                           | `skills/handlers/weather.ts`     |
| `weather.query_alert`     | 气象预警                                                                         | 同上                             |
| `satellite.query_ndvi`    | 卫星 NDVI（须 `satellite_plots` + 明确 `plot_id` 或 entity 绑定 + 可选 API Key） | `skills/handlers/satellite.ts`   |
| `agronomy.query_pest`     | 病虫害/高湿防病知识查询                                                          | `skills/handlers/agronomy.ts`    |
| `tasks.query_task`        | 农事任务查询                                                                     | `skills/handlers/scene-tasks.ts` |
| `tasks.create_task`       | 创建农事任务                                                                     | 同上                             |
| `advice.query_weekly`     | 周报（ROI + outcome + 策略建议，固定 Pro）                                       | `skills/handlers/advice.ts`      |
| `policy.apply_suggestion` | 采纳 L4 策略建议草稿（人确认后写入）                                             | `skills/handlers/policy.ts`      |

## 与场景技能的关系

- P2 多为**只读查询**或**人确认后的策略写入**，不直接驱动 GPIO
- 场景技能可引用 P2 结果辅助建议，例如：
  - `cold_wave_protection` → `weather.query_alert`
  - `humidity_mildew_prevention` → `agronomy.query_pest`
- L4 `policy.apply_suggestion` 须用户明确采纳，禁止 LLM 静默改运行策略

## 配置真源

| 配置项    | 位置                                                                                                 |
| --------- | ---------------------------------------------------------------------------------------------------- |
| 现场坐标  | `settings.json`（已显式存在的来源优先级：手动 > 环境变量 > GPS > IP 缓存；缺坐标则天气能力失败可见） |
| NDVI 地块 | `satellite_plots`、`satellite_api_key`                                                               |
| 天气开关  | `weather_proactive_enabled`                                                                          |
| NLG 润色  | `nlg_enabled`（查询类默认开启）                                                                      |

详见 [`docs/operations/llm-model-selection.zh.md`](../../../../docs/operations/llm-model-selection.zh.md)、[`docs/operations/notifications.zh.md`](../../../../docs/operations/notifications.zh.md)。

## 评测

- greenhouse `npm run sim:matrix` core 110 路含 P2 话术（44 golden + 66 extra）
- `npm run verify:chat` 为 greenhouse 13 场景，含天气/灌溉等复合问句

P0/P1 设备动作 JSON 契约见 [`../skills-design.md`](../skills-design.md)。
