# 旧架构材料归档说明

日期：2026-06-14

基线提交：`dcc5260`

本次切换后，活跃文档以“平台底座 + 单 active Domain Pack + 可复制交付模型”为主线。以下材料只读追溯，不作为当前实现依据：

- greenhouse-first 平台叙事。
- 旧 all-in-one tmux 六面板入口。
- `apps/api/data` 默认运行态。
- `farm_id` / `farm_user_id` 旧字段。
- `active_domains` / `ScenePack` 多场景混载叙事。
- legacy alert/sustained key 迁移回读。

当前入口：

- 本地开发：`npm run dev:greenhouse` / `npm run dev:robot`
- 飞轮：`npm run scene:flywheel`
- 数据根：`.agentstack/dev-profiles/{scene}/data` 或显式 `AGENT_DATA_DIR`
- 架构真源：`docs/platform-runtime-architecture.zh.md`、`docs/architecture.md`
