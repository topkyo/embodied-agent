# 通道冗余最小演练（P0）

> **目标**：微信 / iLink 主通道不可用时，仍能用 **Web 工作台**完成「确认高风险动作 + 查看执行证据」。  
> **范围**：本演练**不要求**重构 `channel-runtime`；**不要求** WhatsApp 或其它旁路通道。  
> **环境**：本地用当前 profile 的 Web URL；**生产以实际部署 URL 为准**（勿写死端口或主机名）。

---

## 1. 前置

### 1.1 启动场景 profile

任选其一（只起后台基础服务即可）：

```bash
# 工业过温（A1 成交实验常用）
npm run dev:industrial -- --no-monitor

# 或温室（展示田 / 对照）
npm run dev:greenhouse -- --no-monitor
```

确认服务与端口：

```bash
npm run dev:status
```

API / Web 端口、数据目录**以 `npm run dev:status` 输出为准**；本地常见默认见 [`docs/operations/web-session.zh.md`](web-session.zh.md) §4.1，但勿在演练记录里写死未核验的端口。

### 1.2 登录 admin session

完整步骤（bootstrap / invite / 邮箱密码、`ea_session`、角色矩阵）：见 **[`docs/operations/web-session.zh.md`](web-session.zh.md)**。

最短路径：

1. 浏览器打开工作台登录页（本地一般为 Vite 提供的 Web 入口；**URL 以 `dev:status` 为准**；生产用部署 URL）。
2. 用 **admin** 邮箱密码登录，拿到 `ea_session`。
3. 确认能进当前 active 场景的 ops（总览 / 运行状态）；平台底座 `/ops/platform` 仅 admin。

> Session 默认 TTL **15 分钟**、无滑动续期。演练若接近超时，先重新登录再记时，避免把掉线误判为通道故障。

### 1.3 演练前检查清单

| 项 | 要求 |
| --- | --- |
| active_domain | 与所选 profile 一致（industrial 或 agriculture/greenhouse） |
| MQTT / transport | ops 顶栏非持续 `BLOCKED · Transport`（与角色无关；见 web-session §2.2） |
| 可确认动作 | 场景内至少有一条会走确认门的物理/控制动作，或已有 pending confirm |
| 主通道可模拟不可用 | 能停掉 / 断掉微信·iLink 相关进程或配置，使该通道不可发指令 |

---

## 2. 演练步骤

| # | 动作 | 记录 |
| --- | --- | --- |
| 1 | **模拟主通道不可用**：停止或断开微信 / iLink 通道（本地：停相关进程或拔配置；生产：按运维规程隔离该通道）。确认该通道无法再下发指令。 | 开始时刻 `T0` = ______ |
| 2 | **打开 Web 工作台**：用 admin（或具备确认权限的 operator session，以当前产品门闩为准）登录；进入当前场景 ops。 | Web URL = ______ |
| 3 | **发起 / 确认一条物理动作**：在工作台发起会触发确认门的动作，或打开已有 **pending confirm** 并完成确认。不要依赖微信侧卡片。 | 动作 / skill = ______ |
| 4 | **查找执行证据**：在工作台「运行状态」或 command / 审计相关视图中，找到本次 command 记录（含确认人、时间、结果；有 `actual_duration_seconds` 则一并记下）。必要时用 `GET /admin/commands`（需有效 web session，见 web-session §4.2）。 | command id / 证据链接 = ______ |
| 5 | **记录耗时**：从 `T0`（主通道判定不可用）到确认闭环完成（证据可见）的墙钟时间。 | 耗时 = ______ 分钟 |

---

## 3. 通过线

- 主通道 kill / 隔离后，**15 分钟内**完成一次「确认 → 证据可见」闭环。
- 证据须能指向本次动作（command / 审计条目），不得仅靠口头「好像执行了」。

未达标即判失败，填下方失败栏；可重跑，但须重新记 `T0`。

---

## 4. 失败记录栏

| 字段 | 填写 |
| --- | --- |
| 日期 / 执行人 | |
| Profile / 部署 | industrial / greenhouse / 生产 URL： |
| `T0` → 结束 | |
| 实际耗时 | |
| 失败阶段 | □ 通道隔离 □ 登录/session □ 发起动作 □ 确认门 □ 证据查找 □ 其它 |
| 现象与日志要点 | |
| 是否配置/运维问题（非代码） | □ 是 □ 否；说明： |
| 是否触发工程跟进 | □ 否（本演练不强制改 `channel-runtime`）□ 是（仅当阻断 P0 闭环且已有明确缺陷单） |
| 复跑计划 | |

---

## 5. 明确不做

- **不**借本演练重构 `packages/channel-runtime` 或通道抽象大改。
- **不**要求接入 WhatsApp 或其它未承诺通道。
- **不**用模拟器绿灯冒充「生产通道冗余已验证」；生产须在实际部署 URL 上按同样步骤重跑并归档。

---

## 6. 归档建议

演练结果（含失败栏）放入未跟踪目录 `.agentstack/pilot-notes/`（勿提交客户隐私与密钥）。对外/对内复盘可引用本文件路径。
