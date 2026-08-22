# 微信 / LLM 对话验证

## 命令

```bash
# 1. 确保配置台已保存 LLM Key（{AGENT_DATA_DIR}/settings.json）
# 2. 启动 API
PORT=3001 npm run api:dev

# 3. 跑场景验证（真实 DeepSeek）
npm run verify:chat
```

报告默认输出：`{AGENT_DATA_DIR}/local-eval-reports/chat-verify-report.json`

## 场景列表

| ID                      | 说明                                                   |
| ----------------------- | ------------------------------------------------------ |
| `query_single`          | 单轮查温湿度                                           |
| `multi_turn_vent`       | 多轮：查棚 → 打开10分钟                                |
| `night_vent_mode`       | 夜间通风 set_mode                                      |
| `alert_threshold`       | 设置报警阈值                                           |
| `clarify_ambiguous`     | 含糊句澄清                                             |
| `irrigation_start`      | P1 启动灌溉                                            |
| `irrigation_query`      | P1 查询灌溉状态                                        |
| `weather_forecast`      | P2 天气预报（需坐标）                                  |
| `compound_farm_weather` | 复合问句：大棚概况 + 天气（双 skill 合并回复）         |
| `weather_alert`         | P2 灾害预警                                            |
| `agronomy_pest`         | P2 病虫害咨询                                          |
| `farm_task`             | P2 农事任务查询                                        |
| `satellite_ndvi`        | P2 卫星 NDVI（脚本自动种子 `satellite_plots` + cache） |

**P2 天气：** 默认坐标 `31.23` / `121.47`（上海近郊），无需手填；真实农场可在配置台覆盖。

**P2 卫星：** `verify:chat` 启动时会写入 `gh-001-plot` bbox 与 NDVI 诊断缓存 fixture；这只服务本地 verify 脚本，不代表运行时无 API Key 时存在隐式兜底。

## 迭代流程

1. 跑 `npm run verify:chat` 与 `npm run eval:intent`
2. 失败句：`npm run intent:failures:list` → promote 进 golden
3. 更新 active pack 的 `scenes/{pack}/docs/skills/*.zh.md` 与 prompt 规则
4. 重跑直至通过率达标

## 数据飞轮（理解层）

```text
verify:chat 失败 → intent-failures.jsonl → golden → 场景技能 / prompt 迭代
```

## 最近验证

运行 `npm run verify:chat` 后查看 `{AGENT_DATA_DIR}/local-eval-reports/chat-verify-report.json`。这是 greenhouse 端到端对话验证，基准：**13/13** 场景、`scenes/greenhouse/eval/intent-golden.zh.jsonl` **44** 条 golden（`npm run eval:intent` ≥ 90%）；greenhouse 话术矩阵为 **110** core + **12** wechat + **6** negative（`npm run sim:matrix` core ≥90%，wechat/negative 100%）。

`npm run sim:matrix` 会同时写本地诊断副本 `{AGENT_DATA_DIR}/local-eval-reports/{packId}-{slice}-sim-matrix-report.json` 和当前部署 runtime evidence：

```text
{AGENT_DATA_DIR}/deployments/{deployment_id}/eval-reports/{packId}-{slice}-sim-matrix-report.json
```

交付 readiness 只认可 runtime evidence 目录中的签名报告，并会校验 `deployment_id`、`active_domain`、LLM 设置指纹、当前 eval corpus digest、三段 slice 门槛和新鲜度。引用报告时必须标明 pack、slice、deployment，不能把本地诊断副本当成交付证据。仅当显式设置 `EVAL_WRITE_DOCS=1` 时，脚本才额外写 `docs/eval/*.json` 诊断副本。

**本地前置：** `device-registry.json` 含 `irrigation-sim-gh-001`（`zone-a`）；坐标示例上海 `31.23` / `121.47`。
