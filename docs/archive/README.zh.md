# 归档文档

本目录保留**历史决策、实施计划与 release notes**，供追溯用；**不作为当前工程真源或执行 checklist**。

当前规格与阅读顺序见 [`docs/README.zh.md`](../README.zh.md)。

归档文档只读追溯：若现行代码、评测门禁或文档入口与归档内容冲突，以 [`docs/README.zh.md`](../README.zh.md)、[`docs/architecture/implementation.zh.md`](../architecture/implementation.zh.md)、[`docs/architecture/control-layers.zh.md`](../architecture/control-layers.zh.md)、[`docs/architecture/scene-layer.zh.md`](../architecture/scene-layer.zh.md) 和代码真源为准。

归档文档中的旧相对链接可能因移动而失效；需要执行当前工程任务时，请回到 [`docs/README.zh.md`](../README.zh.md) 查找活跃入口。

## 目录

| 路径                                                                                                                 | 说明                                                            |
| -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| [CHANGELOG.md](../../CHANGELOG.md)                                                                                             | 版本发布说明（v0.2.0–v0.5.0 等）                                |
| [`research-report.zh.md`](research-report.zh.md)                                                                     | 早期硬件与网络选型调研（只读）                                  |
| [`specs/2026-06-05-esp32-c6-scene-node-brainstorm.zh.md`](specs/2026-06-05-esp32-c6-scene-node-brainstorm.zh.md)     | ESP32-C6 头脑风暴；结论已并入工程规格                           |
| [`specs/2026-06-10-embodied-agent-platform-upgrade.zh.md`](specs/2026-06-10-embodied-agent-platform-upgrade.zh.md)   | 平台升级完成态 spec                                             |
| [`specs/2026-06-11-native-platform-deployment-model.zh.md`](specs/2026-06-11-native-platform-deployment-model.zh.md) | Deployment 模型完成态 spec                                      |
| `plans/2026-06-04-engineering-quality-remediation.md`         | 工程加固记录                                                    |
| `plans/2026-06-06-agent-hardening-followups.zh.md`               | Agent 加固 follow-up #6–#11 验收记录（已闭环，只读追溯）        |
| `plans/2026-06-10-embodied-agent-platform-upgrade.zh.md`   | 平台升级 A+B 实施计划（已完成）                                 |
| `plans/2026-06-11-native-platform-deployment-model.zh.md` | Deployment 模型实施计划（v0.4.0 已完成）                        |
| `plans/2026-06-platform-scene-alignment-checklist.zh.md`   | 平台运行时 / Domain Pack 仓库整理清单（P0-P6 已执行）           |
| `plans/2026-06-18-platform-90-plus-phase2.zh.md`                   | 平台 90+ Phase 2 实施计划（已完成，只读追溯）                   |
| `plans/2026-07-06-arch-extract-non-web.md`                               | 非 Web 模块抽取实施计划（已完成，只读追溯）                     |
| `plans/2026-07-07-tech-debt-cleanup.zh.md`                               | 技术债清理计划与验收记录（已完成，只读追溯）                    |
| `plans/2026-07-08-tech-debt-and-doc-cleanup.zh.md`               | 技术债与文档清理计划（P0–P2 全清，PR #39/#40，只读追溯）        |
| `plans/2026-07-08-web-ux-auth-demo-revamp.zh.md`                   | Web UX/演示/登录权限改版计划（四阶段全清，`8063e9d`，只读追溯） |
| `plans/2026-07-09-web-admin-cleanup.zh.md`                               | Web Admin 精简切片 Track A（**已随 public-ready D0 完成**，只读）   |
| `plans/2026-07-09-web-workbench-public-ready.zh.md`             | Web 公网就绪总方案 v2（已完成，只读）                               |
| `plans/2026-07-17-wechat-channel-onboarding.zh.md`               | 微信通道 onboarding 实施计划（PR #62 已完成，只读）                 |
| `plans/2026-06-next-phase-v0.2-followup.zh.md`                       | v0.2.0 后续阶段计划（历史基线）                                 |
| `plans/web-rebuild-agentic-ux.zh.md`                                           | Web v3.1 方案与 IA 验收记录（已完成）                           |
| `plans/e2e-demo-script.zh.md`                                                         | 历史工程 E2E 演示脚本；当前验收以 `docs/eval/*` 为准            |
| `plans/mvp-plan.md`                                                                             | 历史 MVP 计划                                                   |
| `plans/mvp-test-plan.md`                                                                   | 历史 MVP 测试计划                                               |
| `plans/web-rebuild-react-impl.zh.md`                                           | Web v3.1 React 实施 PR 清单（已完成）                           |
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
