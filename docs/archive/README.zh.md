# 归档文档

本目录保留**历史决策、实施计划与 release notes**，供追溯用；**不作为当前工程真源或执行 checklist**。

当前规格与阅读顺序见 [`docs/README.zh.md`](../README.zh.md)。

归档文档只读追溯：若现行代码、评测门禁或文档入口与归档内容冲突，以 [`docs/README.zh.md`](../README.zh.md)、[`docs/architecture/implementation.zh.md`](../architecture/implementation.zh.md)、[`docs/architecture/control-layers.zh.md`](../architecture/control-layers.zh.md)、[`docs/architecture/scene-layer.zh.md`](../architecture/scene-layer.zh.md) 和代码真源为准。

归档文档中的旧相对链接可能因移动而失效；需要执行当前工程任务时，请回到 [`docs/README.zh.md`](../README.zh.md) 查找活跃入口。

## 目录

| 路径                                                                                                                 | 说明                                                            |
| -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| [`../../CHANGELOG.md`](../../CHANGELOG.md)                                                                           | 公开快照的版本记录（详细 release notes 未纳入本快照）           |
| [`research-report.zh.md`](research-report.zh.md)                                                                     | 早期硬件与网络选型调研（只读）                                  |
| [`specs/2026-06-05-esp32-c6-scene-node-brainstorm.zh.md`](specs/2026-06-05-esp32-c6-scene-node-brainstorm.zh.md)     | ESP32-C6 头脑风暴；结论已并入工程规格                           |
| [`specs/2026-06-10-embodied-agent-platform-upgrade.zh.md`](specs/2026-06-10-embodied-agent-platform-upgrade.zh.md)   | 平台升级完成态 spec                                             |
| [`specs/2026-06-11-native-platform-deployment-model.zh.md`](specs/2026-06-11-native-platform-deployment-model.zh.md) | Deployment 模型完成态 spec                                      |
| [`scripts/migrate-v0.3-farm-to-deployment.ts`](scripts/migrate-v0.3-farm-to-deployment.ts)                           | v0.3 → v0.4 一次性数据迁移脚本归档                              |
| [`scripts/migrate-state-to-sqlite.ts`](scripts/migrate-state-to-sqlite.ts)                                           | JSONL→SQLite 一次性迁移脚本归档（API 冷启动已自动导入）         |
| [`scripts/verify-plan.sh`](scripts/verify-plan.sh)                                                                   | 历史计划验收 shell（只读追溯，非当前门禁）                      |
| [`specs/embodied-agent-migration.zh.md`](specs/embodied-agent-migration.zh.md)                                       | 双仓迁移说明（已废止）                                          |
| [`runtime-data-20260614T012902Z.zh.md`](runtime-data-20260614T012902Z.zh.md)                                         | 本地 `apps/api/data` 运行态归档记录；不含敏感内容               |
| [`dogfood/`](dogfood/)                                                                                               | 历史 dogfood 报告；当前 dogfood 输出目录不入库                  |
| [`specs/2026-06-14-legacy-architecture-cutover.zh.md`](specs/2026-06-14-legacy-architecture-cutover.zh.md)           | 旧 greenhouse-first / all-in-one / legacy 字段材料归档说明      |

## 术语迁移（阅读归档时注意）

| 归档用语                                    | 现行用语                                                           |
| ------------------------------------------- | ------------------------------------------------------------------ |
| `firmware/gateway/`                         | `firmware/scene-node/`                                             |
| `gateway_id` / `gateways/{id}`              | `node_id` / `nodes/{node_id}`                                      |
| `eval:intent:matrix` 作为唯一 CI 门禁       | `sim:matrix` core slice + 可选 `eval:intent`                       |
| `FARM_DATA_DIR` / `farm_id` / MQTT `farms/` | `AGENT_DATA_DIR` / `deployment_id` / MQTT `deployments/`（v0.4.0） |
| `digital-farm` 仓名 / `@digital-farm/*`     | `embodied-agent` / `@embodied-agent/*`                             |
| `apps/api/data` 默认运行态                  | `.agentstack/dev-profiles/{scene}/data` 或显式 `AGENT_DATA_DIR`    |
| all-in-one `scripts/tmux-dev-stack.sh`      | `npm run dev:*` profile + `npm run domain:flywheel`                |
| `farm_user_id`                              | `principal_user_id`                                                |
| `ScenePack` / `active_domains`              | `DomainPack` / 单值 `active_domain`                                |
