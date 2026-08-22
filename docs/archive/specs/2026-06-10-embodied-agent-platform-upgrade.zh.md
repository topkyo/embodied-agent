# 具身Agent 平台升级（单仓：farm → embodied-agent）

**Date:** 2026-06-10  
**Status:** Completed (2026-06-10)

## Goal

在唯一活跃仓库 `topkyo/embodied-agent` 内，将代码库从「数字农场默认叙事」升级为「具身Agent 平台 + greenhouse Domain Pack」。Web 重构（v3.1 React）与 Phase C Deployment 模型均已完成；本 spec 记录**叙事层、包名、Domain Pack 抽象**决策。实施计划见 `../plans/2026-06-10-embodied-agent-platform-upgrade.zh.md`。

## Constraints

- **单仓真源**：仅 `embodied-agent` 仓活跃；不维护 `digital-farm` 双仓、cherry-pick 或双 clone 布局。
- **YAGNI**：v1 只注册 `greenhouse` pack；不为 industrial/pet/home 实现技能或 schema。
- **安全不变**：LLM 不直连 GPIO/MQTT；理解层 LLM-only；确定性安全层与边缘互锁保持。
- **试点不断**：`sim:matrix` core ≥90%、wechat 100%；`verify:chat` 13/13；`scene:flywheel` 不退化。
- **运行时兼容（Phase A+B 当时）**：`farm_id`、MQTT `farms/` 在 Phase C（v0.4.0）已切换为 `deployment_id` / `deployments/`；见 [`2026-06-11-native-platform-deployment-model.zh.md`](2026-06-11-native-platform-deployment-model.zh.md)。
- **分步可门禁**：每步 `npm run lint`、`npm test`、`npm run build`；有 Key 时 `./scripts/verify-intent-gate.sh`。

## Design

### Architecture

平台五层模型（产品叙事与代码组织对齐）：

```text
具身Agent（平台）
├── Agent      理解、编排、NLG、飞轮 L1–L4     → apps/api（runtime）
├── Node       MQTT、注册、配对、健康           → apps/api/nodes + firmware/scene-node
├── Skills     技能注册表、按 pack 加载         → packages/core + domain-packs/loader
├── Memory     指令/操作/outcome/策略/失败集   → apps/api commands/db/scene（存储路径不变）
└── Domain Packs（可插拔）
    └── greenhouse（LIVE）守棚工长、试点与飞轮真源
```

演进顺序：**Phase A（叙事与品牌）→ Phase B（Domain Pack 抽象）**。路径采用分段大 PR、每段可门禁（不做 `@digital-farm` 别名过渡层）。

### Phase A — 叙事与品牌

#### A1 Spec 与文档收口

- 以本文档为决策真源；`docs/specs/embodied-agent-migration.zh.md` 标记为已废止并指向本文档。
- 删除一切「双仓并行」「cherry-pick 回 farm」表述。

#### A2 包名与 workspace

| 现名                     | 新名                     |
| ------------------------ | ------------------------ |
| 根 `digital-farm`        | `embodied-agent`         |
| `@embodied-agent/core`   | `@embodied-agent/core`   |
| `@embodied-agent/safety` | `@embodied-agent/safety` |
| `@embodied-agent/api`    | `@embodied-agent/api`    |
| `@embodied-agent/web`    | `@embodied-agent/web`    |

全仓 `package.json`、import、`-w` 脚本参数机械替换。

#### A3 对外文档

| 文件                   | 要点                                                    |
| ---------------------- | ------------------------------------------------------- |
| `README.md`            | 标题「具身Agent」；五层架构；守棚工长 = greenhouse pack |
| `AGENTS.md`            | 品牌与评测原则；去除双仓                                |
| `docs/README.zh.md`    | 索引：平台 spec > 架构真源 > greenhouse pack            |
| `docs/architecture.md` | 开篇补「平台 + Domain Pack」；正文可保留温室实现细节    |

#### A4 CI / 脚本（低优先级）

- 确认 GitHub Actions、Vercel 绑定 `topkyo/embodied-agent`。
- `scripts/tmux-dev-stack.sh` 是当前本地栈入口；旧脚本别名已清理。

#### Phase A 验收

```bash
npm ci && npm run lint && npm test && npm run build
# 有 LLM_API_KEY 时
./scripts/verify-intent-gate.sh
```

#### Phase A 不做

- 不建 `scenes/greenhouse/`。
- 不改 intent schema、router、MQTT 行为。

### Phase B — Domain Pack 抽象

#### 目录结构

```text
scenes/greenhouse/                    # @embodied-agent/domain-agriculture
├── package.json
├── manifest.ts                       # pack 元数据与导出清单
├── skills.ts                         # greenhouse.* / fan.* / irrigation.*
├── prompt/                           # scene-skills、examples、disambiguation 温室段
├── eval/                             # golden、sim-matrix extra/wechat
├── registry/                         # canonical-sim、双棚默认 registry
├── scene/                            # L3 SCENE_SKILL_IDS、resolveSceneForTrigger
└── structural/                       # structural-intent 温室规则
```

#### 平台 vs pack 切分

**留平台 `packages/core`：**

- Command、Node、Device 基础 schema
- `command.query_status`、`log.query_today`、`report.*`、`alert.*`（非温室专属）
- P2：`weather.*`、`tasks.*`、`policy.apply_suggestion` 等
- `farm-data-root` / `resolveFarmDataDir`

**迁入 greenhouse pack：**

- `greenhouse.*`、`fan.*`、`irrigation.*` 技能枚举与 Zod 分支
- `canonical-sim`、`scene-skills` prompt、`structural-intent` 温室覆盖
- L3 八场景 `scene/registry`
- eval：`intent-golden.zh.jsonl` 及 matrix 温室句集

#### Pack manifest 与 loader

`scenes/greenhouse/manifest.ts` 声明 `id`、`displayName`、`status: "live"`、`skills`、`sceneSkillIds`、`eval` 路径、`prompt` 段、`registry` 构建函数。

`apps/api/src/domain-packs/loader.ts`：

- 读 `settings.active_domains`（默认 `["greenhouse"]`；缺失配置失败可见，无隐式回退）
- 合并启用 pack 技能 → `LLM_SKILL_ENUM`（`codegen:intent` 真源改读 loader）
- `buildIntentPrompt` 按 pack 拼接 scene section 与 examples
- `routeIntent` 与 physical handler **暂留** `apps/api/src/skills/`；pack 仅提供技能表与归属标注

v1 不实现多 pack 并行 dynamic import；manifest 类型为未来 pack 预留。

#### 分步迁移

| 步骤 | 内容                                               | 验收                   |
| ---- | -------------------------------------------------- | ---------------------- |
| B3.1 | 建 pack 目录；复制文件；原路径 re-export           | lint、test 绿          |
| B3.2 | `core/skills.ts` → platform + `loadPackSkills()`   | `eval:intent` 不退化   |
| B3.3 | `intent.ts` Zod 温室分支迁 pack；core 组装 union   | `sim:matrix` core ≥90% |
| B3.4 | eval 路径切 manifest；更新 `intent-eval-common.ts` | wechat slice 100%      |
| B3.5 | 删除重复实现，消除双真源                           | `scene:flywheel` 绿灯  |

#### Memory / Node（B 阶段仅文档化）

| 类型            | 路径                              | 归属                 |
| --------------- | --------------------------------- | -------------------- |
| 指令日志        | `farms/{id}/command-logs.jsonl`   | 平台                 |
| 操作日志        | `farms/{id}/operation-logs.jsonl` | 平台                 |
| L3 outcome      | `farms/{id}/scene-outcomes.jsonl` | pack 产出、平台存储  |
| intent-failures | `data/intent-failures.jsonl`      | 平台（按 pack 标签） |
| policy 草稿     | admin policy-suggestions          | 平台                 |

Node MQTT 协议与 `AGENT_DATA_DIR` 不改；文档改称「租户数据根 / 试点 farm 实例」。

#### 评测

- `sim:matrix` 数据源经 pack manifest；报告增加 `pack: "greenhouse"`。
- `verify-intent-gate.sh` 逻辑不变：core ≥90%、wechat 100%。

### Data flow（升级后不变）

```text
IM/Web → processChatMessage
  → resolveWithEscalation（Flash → Pro）
  → routeIntent（平台 router + pack 技能表）
  → safety / pending confirm
  → publishPhysicalCommand → MQTT → Scene Node
  → command-hooks / outcome → Memory
```

### Error handling

- `active_domains` 未配置或含未知 pack id → 启动或首次加载失败可见（4xx/日志），不静默回退全量温室技能。
- 迁移任一步门禁失败 → 不合并该 PR；禁止半迁半留双真源。
- MQTT 不可用仍为 503；LLM 无 Key 仍为 503。

### Testing

| 阶段     | 必跑                                               |
| -------- | -------------------------------------------------- |
| 每 PR    | `npm run lint`、`npm test`、`npm run build`        |
| A 完成后 | `./scripts/verify-intent-gate.sh`（有 Key）        |
| B 每步   | 上表 + `npm run eval:intent`；B3.3 起 `sim:matrix` |
| B 完成   | `scene:flywheel`、`verify:chat`                    |

## Out of scope

- industrial / pet / elderly 场景技能或 schema 实现
- `farm_id` → `scene_id` 运行时重命名
- `apps/api` 拆分为独立 Agent 微服务
- handler 文件迁出 monorepo
- ESP32 假负载与真棚试点（见 `docs/archive/plans/2026-06-next-phase-v0.2-followup.zh.md`，与平台升级并行轨道）
- Memory 独立 npm 包（后续 Phase C）

## 后续 Phase C（本 spec 不实施）

- Memory 模块统一读写接口
- Node 硬件能力矩阵与固件 profile 工程化
- `sim:matrix` platform slice（跨 scene 纯平台技能）

## Open questions

（无 — 批准前已对齐：单仓、C 路径 A→B、路径 1 分段 PR。）
