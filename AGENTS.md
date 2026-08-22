# 全局响应语言

**永久约定**：所有回复默认使用中文（含分析、review、方案评估、提交说明）；除非用户在本轮对话中明确要求其他语言。
代码、命令、路径、错误信息、API 名称和专有名词可保留原文。

--- project-doc ---

# 具身Agent — Project Development Rules

本仓库为 **具身Agent 平台**。开发真源是 **`topkyo/embodied-agent-internal`**；`topkyo/embodied-agent` 是只读公开展示快照，不要在那开发或给 VPS `git pull`。仓库分工见 [`docs/operations/repos.zh.md`](docs/operations/repos.zh.md)。当前主线是 **物理世界 Agent Runtime + 单 active Domain Pack**。`agriculture`（`scenes/greenhouse`）、`robotics`（`scenes/robot`）与 `industrial`（`scenes/industrial`）是 Runtime 可加载的参考 Domain Pack（catalog `status: live` = 可被 Runtime 启用并参加软件门禁，不是现场/硬件验收）。守棚工长（对外名农场工长）是 agriculture 的双棚模拟验证场景，真棚待验收；M20 stub 是 robotics 的当前验证场景，真实 M20 未入库；过温排风是 industrial 的模拟映射验证场景，真柜待验收。

- 始终用中文回复，除非用户明确要求其他语言。
- 遵循 KISS 和 YAGNI，优先保持真实执行路径清晰。
- 项目仍处于开发阶段；不要为旧设备、旧配置、历史接口或未被当前需求证明的场景添加兼容路径。
- 不添加隐式兜底行为。缺失配置时应失败可见，并要求显式配置。
- 需要最新事实、API、规则或兼容性信息时，先查可靠来源。

## 架构边界

- 平台包负责通道、LLM runtime、路由、安全、Node runtime、Memory、Deployment；Domain Pack loader/catalog/readiness/physical-dispatch 真源在 `packages/runtime`（见下 §Domain Pack 开发）。
- Domain Pack 负责技能、schema、prompt/eval、结构性 intent override、目标解析、场景风险、L3/L4 outcome。
- 每个 deployment 只能启用一个 `active_domain`。生产必须显式配置 `deployment_id` 与单值 `active_domain`。
- 新任务不得恢复源码包内旧默认数据目录、旧 alert/sustained key 迁移、旧 farm 用户字段专用响应、无 token MQTT 兼容、旧 all-in-one tmux 入口或旧架构文档真源。
- 旧 greenhouse-first、all-in-one、旧 farm 字段、旧多场景包材料只在 `docs/archive/` 中只读追溯。

## 工程门禁与工具链

- **Lint**：`npm run lint`（真源 `package.json`）= workspace runtime build + `check-web-domain-catalog-sync` + `check-intent-cheatsheet-sync` + `check-env-keys` + `tsc -b --noEmit` + `eslint . --max-warnings=0` + `check-repo-layout` + `check-domain-docs` + `check-web-domain-catalog` + `check-domain-pack-contracts`（校验 live pack probe/probeNotRequired 同构）+ `check-wechat-bind-chain` + **`check-web-dogfood-critical`**（鉴权/禁用壳 dogfood title 必须带 `@critical`）+ **`check-doc-links`**（markdown 相对链接可达性）+ `domain:check`（readiness）。
- **Test**：`npm run test --workspaces --if-present`。
- **Build**：`npm run build`。
- **格式化**：`npm run format` / `npm run format:write`。全仓 Prettier 债已在 v0.10.0 关闭；日常只格式化本 PR 改动文件，勿为单个任务批量重写无关文件。
- **CI**：`npx tsx scripts/check-npm-audit.ts`（high 与 critical 均阻断；allowlist 真源 `scripts/fixtures/audit-allowlist.json`，记录 tar/undici/form-data/minimatch/path-to-regexp 等 vercel 构建链 transitive）→ lint → Prettier（changed files）→ test → **`test:coverage:gates`（web 门闩 coverage）** → build → Playwright **web-smoke 全集 + 完整 web-dogfood + site-smoke**。完整步骤见 `.github/workflows/ci.yml`（PR：`deterministic` + `e2e`；**所有 PR 不跑 `llm-gates`**）。`llm-gates`（intent / robot / industrial / strict）仅在 **push main** 跑，夜间回归见 `nightly-e2e.yml` / `nightly-flywheel.yml` / `nightly-strict.yml`（含 wechat-bind-golden / site-dogfood 全文）。
- **site_scope**：仅当 diff **全部**落在 `apps/site/*` 与少数 demo 脚本时 e2e 可只跑营销站；**不含**裸 `package.json` / `ci.yml`（改 monorepo/CI 必须仍跑 web 门闩）。
- **E2E**：`npm run e2e` 需要 `npm run web:dev`，`E2E_BASE_URL` 默认 `http://127.0.0.1:5173`。

## 环境变量索引

- 完整指针表（变量 → 消费方 → 真源文件 → 缺失行为）：[`docs/operations/env-keys.zh.md`](./docs/operations/env-keys.zh.md)。
- 本地模板：`.env.example`；scene 启动后导出：`.agentstack/dev-services/{scene}/env.sh`（`npm run dev:status` 查看数据目录与端口）。

## 运行数据

- 默认数据根：`.agentstack/dev-profiles/default/data`。
- 本地场景 profile：`.agentstack/dev-profiles/{greenhouse|robot|industrial}/data`。
- 飞轮验证运行数据根由 `npm run domain:flywheel` 按 active Domain Pack 选择；agriculture 默认使用 `.agentstack/dev-runs/domain-flywheel/agriculture/data`。它不是独立 Domain Pack 或本地场景 profile。
- 测试必须用显式临时 `AGENT_DATA_DIR`，不要写源码包内旧默认数据目录。
- 不提交 settings、微信同步文件、token、用户数据或任何运行态敏感数据。
- 历史运行态归档只允许放在未跟踪 `.agentstack/archive/runtime-data/`；`docs/archive` 只记录时间、commit、源/目标路径和恢复方式。

## 本地按场景启动

| 命令                                     | 场景       | 行为                                                          |
| ---------------------------------------- | ---------- | ------------------------------------------------------------- |
| `npm run dev:greenhouse`                 | greenhouse | 启动 aedes、API、Web，并打开双棚模拟器 / MQTT watcher monitor |
| `npm run dev:robot`                      | robot/M20  | 启动 aedes、M20 stub、API、Web，并打开 robot overview monitor |
| `npm run dev:industrial`                 | industrial | 启动 aedes、API、Web（过温排风模拟映射 profile）              |
| `npm run dev:greenhouse -- --no-monitor` | greenhouse | 只启动后台基础服务                                            |
| `npm run dev:robot -- --no-monitor`      | robot/M20  | 只启动后台基础服务                                            |
| `npm run dev:industrial -- --no-monitor` | industrial | 只启动后台基础服务                                            |
| `npm run dev:status`                     | —          | 查看后台服务 PID、端口与数据目录                              |
| `npm run dev:logs`                       | —          | tail 当前 profile 基础服务日志                                |
| `npm run dev:stop`                       | —          | 停止 profile 后台服务                                         |

`npm run domain:flywheel` 使用当前 active Domain Pack 的 `runtimeReadiness.flywheelGate.adapterModule`；agriculture 会自动启动 greenhouse 验证栈和临时双棚模拟器。

旧 `scripts/tmux-dev-stack.sh` 已删除。不要在文档、脚本或测试中重新引入它。

## Web UX 验证

营销站（`apps/site`）与工作台（`apps/web`）分 app 验证。Web 鉴权与 session 走查见 [`docs/operations/web-session.zh.md`](docs/operations/web-session.zh.md)。

**工作台**改动按三层验证（由快到慢）：

1. **确定性层**：`npm run lint`（含 `scripts/check-web-dogfood-critical.ts`：鉴权/禁用壳 dogfood title 必须带 `@critical`）、`npm run build`、`npm run test -w @embodied-agent/web`（node 逻辑测 + happy-dom 组件/门闩测；`src/**/*.test.tsx`）。
2. **回归层**：Playwright — `tests/e2e/web-smoke.spec.ts`（路由与壳）、`tests/e2e/web-dogfood.spec.ts`（session 角色、placeholder/inactive 禁用、门闩失败态）。**PR 门禁（D0 T3）**跑 **web-smoke 全集 + 完整 web-dogfood + site-smoke**。其中 `@critical` 是安全/门闩**最小强制集合**（清单真源 `scripts/check-web-dogfood-critical.ts`，lint 校验 title 不丢：**user 藏 admin nav、role-switch 不串权、platform deny/allow、review deny、placeholder/inactive 禁用壳**）；**不等于**「PR 只跑这 7 条」。`wechat-bind-golden` 与 site-dogfood 全文在 nightly。新增 dogfood **默认不** critical；安全/门闩类变更须同步维护 tag 与 check 脚本清单。
3. **探索层**：agent-browser 对照真实 API 扫关键路由，补 Playwright 尚未覆盖的视觉/交互缺口。

**营销站**：`npm run site:dev`（默认 `:5170`）；三域实时演示需先起 demo 栈再设 `VITE_DEMO_API_*`（见 `docs/operations/env-keys.zh.md` §7.1）。有 Docker 用 `docker-compose.demo.yml`；无 Docker 用 `npm run demo:stack:local -- start`（本机进程等价方案）。Playwright — `site-smoke` / `site-dogfood`。

**环境前置**

- 工作台：先起 dev 栈 `npm run dev:greenhouse -- --no-monitor`（或当前 active 场景 profile）；`npm run dev:status` 确认 API/Web 端口。
- **Web 鉴权调试真源**：[`docs/operations/web-session.zh.md`](./docs/operations/web-session.zh.md)（角色矩阵、curl 诊断、建 admin、常见 401）。
- 平台底座 / `GET /admin/settings`：需 **admin** session（`ea_session`）或脚本用 `x-admin-token`（dev 默认 `dev-admin`）。**user 登录后进平台 401 是预期**。
- 场景壳 active_domain：公开 `GET /domain-packs`；总览/节点/运行状态只读：`requireOperator`（任意 web session）。
- ops 顶栏 readiness（`BLOCKED · Transport` / `Sim Matrix *`）与 **角色无关**；运维步骤见 [`docs/operations/web-session.zh.md`](./docs/operations/web-session.zh.md) §2.2（MQTT、sim rebind、`EVAL_EVIDENCE_SECRET` + `sim:matrix`）。
- `/admin/wechat/login/start` 与 `/admin/wechat/login/status`：需 web session；非 admin 强制绑定本人 `user_id`，且只能轮询本人发起的 bind session。`/admin/wechat/status`：admin 全量，普通 web session 仅本人 principal 状态。
- 本地 e2e 须显式设 `E2E_API_URL`、`E2E_BASE_URL`（web）、`E2E_SITE_URL`（site）；health 探针为 `{E2E_API_URL}/health`。dev 栈已跑时 `scripts/e2e-*-server.sh` 会复用现有服务（`reuseExistingServer`）。

**迭代环**

agent-browser 探索 → 修 class（`utilities.css`、`console-layout.css` 等）→ 补 Playwright 断言 → `npm run e2e`。

```bash
E2E_BASE_URL=http://127.0.0.1:5173 E2E_SITE_URL=http://127.0.0.1:5170 E2E_API_URL=http://127.0.0.1:3001 npm run e2e
agent-browser open http://127.0.0.1:5173/<route>   # 工作台
agent-browser open http://127.0.0.1:5170/<route>   # 营销站
agent-browser snapshot -i -c
```

**纪律**

- 不兜底：测 platform 无 admin session 拒绝、placeholder ops 禁用壳、API 错误可见；不把 session 竞态或缺配置误判为 UI bug。
- platform 页须 **admin session**（`/login` 或 install bootstrap）；`?role=installer` 已废止。
- agent-browser 按路由**串行**探索，避免并行 session 误判。
- 样式用 class（`design/utilities.css` + 组件 class），禁止新增 `style={{}}` 堆布局。

## 测试原则

- 理解层只用真实 LLM，禁止 mock harness、正则假 LLM 或 mock LLM 兜底意图。
- Vitest 只测确定性层：router、safety、槽位续接、notify、鉴权、503 无 Key、状态存储。
- 测试需要 registry 时必须用 `saveRegistry()` 写入隔离 `AGENT_DATA_DIR`。
- 缺少 `device-registry.json` 应失败可见，不允许运行时隐式回退默认注册表。
- 指令耗时必须有断言：`actual_duration_seconds` 反映真实等待或显式 `SIM_MAX_COMMAND_MS` 缩短后的结果。

## 结构化日志

- `apps/api/src` 使用 `@embodied-agent/platform` 的 `createLogger(scope)`，输出单行 JSON。
- `scripts/` 与 `firmware/` CLI 可用 `console.log`。
- 不在 `apps/api/src` 新增裸 `console.*`。

## Domain Pack 开发

- 通过 `apps/api/src/domain-packs/loader.ts` 或 `@embodied-agent/domain-*` 导入 Domain Pack。
- Readiness / eval evidence / sim-matrix 符号真源：`@embodied-agent/runtime`（`packages/runtime/src/readiness.ts`）；`apps/api/src/domain-packs/readiness` shim 已删除，脚本与测试直引 runtime。Settings 保存仅拦 config/registry + 有效 `mqtt_url`；transport 连接态在 readiness 探针展示，不阻断冷启动。约定见 `docs/architecture/platform-runtime.zh.md` §运维门禁。
- 禁止在 `apps/api` 中深路径引用 `scenes/*` 内部实现，除明确 loader/pack 入口外。
- 平台技能枚举：`packages/core/src/skills.ts`（`PLATFORM_P0_SKILLS` 等为空数组；技能真源在各 active Domain Pack 的 `skills.ts` / manifest）。
- Prompt 真源：`packages/agent/src/intent/prompt/build-intent-prompt.ts`。
- Schema contract：`packages/agent/src/intent/schema-contract.ts`，修改后运行 `npm run codegen:intent`。

## 当前验证入口

- Greenhouse matrix：`npm run sim:matrix`
- Greenhouse chat：`npm run verify:chat`
- Greenhouse L3/L4：`npm run domain:flywheel`
- Robot matrix：`npm run robot:matrix`
- Robot flywheel：`AGENT_DATA_DIR=scripts/fixtures/ci-robot-eval npm run domain:flywheel`
- Industrial chat：`AGENT_DATA_DIR=scripts/fixtures/ci-industrial-eval npm run domain:chat-verify -- --pack industrial`
- Industrial flywheel：`AGENT_DATA_DIR=scripts/fixtures/ci-industrial-eval npm run domain:flywheel`

无 `LLM_API_KEY` 时，真实 LLM 门禁可按脚本规则跳过；确定性 lint/test/build 不应跳过。

## 已知技术债

渐进收敛项（非阻断）。本节即为开放项真源；审计快照与商业评估材料不在本仓库。

**已关闭（v0.10.0，勿再当开放项）：** Prettier 全仓格式化债；`any` / eslint `no-explicit-any` override；CHANGELOG `v0.5.5`–`v0.6.1` 历史空洞标注；node token AES-256-GCM 加密落盘 + 生产明文拦截（hash/JWT 摘要方案在双向共享密钥模型下收益不足，已关闭）；VPS `/metrics` 示例默认 `METRICS_SCRAPE_TOKEN`（`METRICS_ALLOW_PUBLIC` 仅作网络隔离 / CI escape）。

**仍开放：**

- **依赖 major 尾项（S3）**：Zod 3→4（含 `readiness-pack.ts` `._def` 反射）；Vite 6→8 + `@vitejs/plugin-react` 4→6；TypeScript 声明仍写 `^5.8.3`（lock peer 可见 6.x），TS7 被 typescript-eslint 阻塞故暂缓。升级前先复核 `package.json` 与 lock 中的实际 peer 约束。
- **复制 / 占位**：`aquaculture` 仍为 placeholder（不可交付）；firmware 无 PlatformIO CI 烟测；`channel-runtime` 仍偏空壳（实现在 `apps/api/src/channels/`）。
- **文档边界**：`docs/` 只放平台与协议真源；领域专属文档随 pack 放在 `scenes/{pack}/docs/`；试点与商业材料不入库。
- **产品 TODO（非债）**：工作台用户列表虚拟化、节点绑定态细分、`domain-new` CROSS_DOMAIN_HINT。
