# 工业网关只读接入路径

> **状态：** 仓内模拟映射已落地（`scenes/industrial/gateway/`）；真 TCP / npm 依赖仍另开 PR。  
> **写动作纪律不变：** 启停排风等物理执行仍走 **schema → safety → pending-confirm → audit**；本网关本阶段只解决「读 + 转 telemetry」。

---

## 1. 目标

在不重写 `packages/core` / `packages/platform` 的前提下，补一层柜侧协议适配，把异构读数注入现有 Device registry / industrial pack。

| 做                                                                                | 不做                                           |
| --------------------------------------------------------------------------------- | ---------------------------------------------- |
| **只读** OPC UA / Modbus（及最小私有变体）                                        | 写动作旁路 schema / safety / confirm           |
| 把异构读数**转成现有 telemetry** 格式，注入现有 Device registry / industrial pack | on-prem 全栈、驱动市场、ERP/MES/SCADA 上层接入 |
| 作为 Domain Pack 能力扩展注入 active pack                                         | 新建独立 catalog pack「为存在感而存在」        |

---

## 2. 形态决策

| 选项                                           | 建议                                                                |
| ---------------------------------------------- | ------------------------------------------------------------------- |
| 独立 pack `industrial-gateway-transport`       | 备选（需 `domain-packs.json` + manifest；能力单薄时过重）           |
| **Domain Pack capability `kind: "extension"`** | **推荐**（轻量、不污染 catalog、与 `safety` / `evidence` 同层扩展） |

**本阶段决策：选 capability `extension` 形态；不新建独立 catalog pack。**

### 语义澄清（同名不同层 · 实现必拆清）

| 符号                                   | 所在层                                         | 含义                                                            |
| -------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------- |
| `DomainPackCapabilityKind "extension"` | pack 契约 / capability 枚举（`packages/core`） | **pack 能力扩展**：工业网关等非 scene/nlg/ops/evidence 的注入点 |
| ops schema tab `kind: "extension"`     | 运维台 UI schema（`DomainPackOpsSchema` tabs） | **运维台扩展页**：专属面板 / `widget_id` 可选 tab               |

两者字符串同为 `"extension"`，**不是同一类型、不可互相替代**。实现与文档引用时必须写全限定名（capability vs ops-tab），禁止裸写 `extension` 导致串层。

---

## 3. 选型（仅记录 · 依赖另开 PR）

| 协议面           | 候选 client lib                                                | 本阶段结论                                                                      |
| ---------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Modbus TCP / RTU | `modbus-serial` | **推荐评估**；持 holding/coil/input 读写能力，本阶段以**读 + 转 telemetry**为主 |
| OPC UA           | `node-opcua`       | **推荐评估**；优先 browse / subscribe / read                                    |

- 本文 **只锁定选型方向**；**不**在选型阶段引入 npm 依赖。
- **已落地（模拟器）：** `scenes/industrial/gateway/modbus-bridge.ts` — 默认柜 map + 内存寄存器 + → telemetry 桥；证明映射合同，**不算**真柜 LIVE。
- 依赖引入、license / 体积 / Node 兼容与 `check-npm-audit` 门禁另开 PR。
- 中国工业私有协议仅做 _最小_ 适配（如部分 Modbus 变体）；**不做**驱动市场。

---

## 4. 实现状态

| 项                                        | 状态                                                      |
| ----------------------------------------- | --------------------------------------------------------- |
| 形态决策（capability `extension`）        | 已落盘                                                    |
| `DomainPackCapabilityKind` 含 `extension` | ✅ 已在 enum；实现时须与 ops-tab `extension` **语义拆清** |
| `modbus-serial` / `node-opcua` 依赖       | ❌ **尚未引入**（另开 PR）                                |
| 内存模拟 Modbus → telemetry 桥            | ✅ `scenes/industrial/gateway/modbus-bridge.ts`           |
