# ESP32-C6 场景智能节点调研与固件头脑风暴

> **归档文档**：头脑风暴记录。结论已并入 [`docs/protocol/esp32-node-registration.zh.md`](../../protocol/esp32-node-registration.zh.md)。文中 `firmware/gateway` 指历史目录，现行固件为 [`firmware/scene-node/`](../../../firmware/scene-node/)。

**Date:** 2026-06-05
**Status:** Draft

## 结论

ESP32-C6 适合作为第一代「场景智能节点」的 MCU 候选，但不适合被包装成「能在本地跑 LLM 的 AI 芯片」。

更准确的定位是：它在农业、宠物、家庭等场景里承担边缘采集、联网、协议桥接、安全执行和设备在线状态上报；LLM 仍放在云端或本地服务器侧，负责理解人的自然语言意图，ESP32-C6 负责把已经确认过的确定性指令可靠执行。

对 Web 和产品表达来说，不建议把「ESP32-C6」直接作为首页主卖点。用户更容易理解的是「场景智能节点」：一个能把传感器、执行器、微信/语音/AI 意图系统连接起来的小硬件。ESP32-C6 可以出现在技术说明、硬件规格或开发日志里，而不是作为消费者第一屏的核心文案。

## 官方资料要点

Espressif 官方产品页说明，ESP32-C6 集成 2.4 GHz Wi-Fi 6、Bluetooth 5 LE 和 IEEE 802.15.4，面向安全联网设备，主 CPU 是最高 160 MHz 的 32-bit RISC-V，另有低功耗 RISC-V 处理器；芯片提供 30 个或 22 个可编程 GPIO，支持 SPI、UART、I2C、I2S、RMT、TWAI、PWM、Motor Control PWM、12-bit ADC 和温度传感器。参考：<https://www.espressif.com/en/products/socs/esp32-c6>

官方还强调 Wi-Fi 6 的效率、低延迟和 Target Wake Time，对长期联网的 IoT 设备有价值；802.15.4 + BLE + Wi-Fi 的组合也让它能覆盖 Thread、Zigbee 和 Matter 相关设备生态。参考：<https://www.espressif.com/en/products/socs/esp32-c6>

ESP32-C6-DevKitC-1 官方开发板文档显示，该开发板基于 ESP32-C6-WROOM-1(U)，带 8 MB SPI flash，并集成 Wi-Fi、Bluetooth LE、Zigbee 和 Thread 功能，大多数 I/O 引出到排针，适合原型阶段接传感器、继电器或假负载。参考：<https://docs.espressif.com/projects/esp-dev-kits/en/latest/esp32c6/esp32-c6-devkitc-1/user_guide.html>

Arduino-ESP32 官方文档列出 ESP32-C6 在 stable 和 development 中均为支持状态。参考：<https://docs.espressif.com/projects/arduino-esp32/en/latest/getting_started.html>

PlatformIO 官方 board 文档列出 `esp32-c6-devkitc-1`，板卡参数包括 ESP32C6、160 MHz、8 MB flash，并给出 `platformio.ini` 的 board 配置；但该页面的 Frameworks 区域只列 ESP-IDF。参考：<https://docs.platformio.org/en/latest/boards/espressif32/esp32-c6-devkitc-1.html>

## 适合我们的点

### 1. 更像「边缘连接节点」，不是单场景农业网关

项目当前从「自然农业场景」切入，但长期会接入更多硬件和场景。ESP32-C6 的多协议能力适合做统一硬件底座：

- 农业：温湿度、侧帘、风机、继电器、限位、急停、离线心跳。
- 宠物：饮水机、喂食器、猫砂盆、环境传感器、门磁、活动状态。
- 家庭：灯、插座、门窗、温湿度、空气质量、Matter/Thread 设备桥接。

这类场景共同需要的是「采集 + 执行 + 联网 + 状态可见」，而不是板端大模型推理。ESP32-C6 的 Wi-Fi 6、BLE、Thread/Zigbee/802.15.4 组合比普通 ESP32 更适合作为跨场景节点的长期候选。

### 2. 与现有架构匹配

现有架构已经明确：LLM 只解析意图，设备执行走确定性技能、安全层和 MQTT。当前 `firmware/gateway` 也已经按网关原型实现了 Wi-Fi、MQTT、heartbeat、telemetry、events、DRY_RUN 和本地超时。

ESP32-C6 不要求推翻这条路径。更合理的做法是把现有固件迁移到 C6 板卡，保持指令协议和安全边界不变：

```text
微信 / Web / 语音
  -> LLM 意图解析
  -> 安全确认和技能路由
  -> MQTT 指令
  -> ESP32-C6 场景智能节点
  -> 传感器 / 继电器 / 电机 / 家用设备
```

### 3. 原型阶段成本和风险可控

ESP32-C6-DevKitC-1 有官方开发板，8 MB flash 足够当前 MQTT 网关原型使用。当前固件默认 `ENABLE_GPIO_OUTPUT=0`，不会驱动真实 GPIO，这对第一轮硬件联调很重要。

第一版可以只做假负载：

- 板载 LED 或外接 LED 表示 open/close/stop。
- 串口输出命令解析和状态变化。
- MQTT 上报 `running`、`completed`、`stopped`、`heartbeat`。
- 不接真实电机，不接真实棚内设备。

这样能先验证板卡、固件、MQTT、API、Web/微信闭环，不把风险提前推到强电和机械动作上。

## 不适合或需要克制的点

### 1. 不要宣传「本地 AI 大模型」

ESP32-C6 是微控制器，不是边缘 GPU/NPU。它可以做轻量状态机、协议桥接、低功耗采样、简单规则和安全互锁，但不能承担 LLM 推理。

对外表达应该是：

- 可以说：AI 系统的边缘执行节点。
- 可以说：让传感器和设备进入 AI/LLM 控制闭环。
- 不要说：ESP32-C6 本地运行大模型。
- 不要说：板端自主 AI 决策替代安全策略。

### 2. 现有 GPIO 不能直接沿用

当前 `firmware/gateway/src/main.cpp` 默认引脚包括 26、27、32、33、34、35，这是典型 ESP32 dev board 习惯，不应直接套到 ESP32-C6。C6 的 GPIO 数量、启动相关引脚、板载 LED、USB/JTAG、外设复用都需要重新检查。

迁移时必须新增 C6 pin map，并在文档中明确：

- 哪些 pin 用于假负载 LED。
- 哪些 pin 预留给继电器。
- 哪些 pin 预留给 limit switch、manual override、emergency stop。
- 哪些 pin 禁止使用或暂不使用。

### 3. PlatformIO + Arduino 需要实测

Arduino-ESP32 官方文档显示 ESP32-C6 已支持，但 PlatformIO 的 `esp32-c6-devkitc-1` 页面 Frameworks 区域只列 ESP-IDF。当前固件使用 Arduino API 和 PubSubClient，因此执行阶段需要优先做一次构建验证。

建议顺序：

1. 先尝试保留 Arduino 代码，新增 `env:esp32-c6-devkitc-1`，执行 `pio run -e esp32-c6-devkitc-1`。
2. 如果 PlatformIO Arduino 构建不可用，再评估切 ESP-IDF，或者短期改用 Arduino CLI / Espressif 官方 Arduino flow。
3. 不为了兼容旧板同时维护两套复杂抽象。项目开发阶段按 AGENTS.md 规则，不做旧设备兼容和隐式兜底。

## 固件 v0 头脑风暴

### 目标

做一个可演示、可烧录、可回滚的 ESP32-C6 场景智能节点原型，先证明「AI 意图 -> MQTT -> C6 节点 -> 假负载 -> 状态上报」闭环。

### 范围

v0 只做：

- Wi-Fi 连接。
- MQTT 连接和断线重连。
- 订阅当前 command topic。
- 发布 heartbeat、telemetry、event。
- 解析 open / close / stop 这类控制命令。
- 本地 duration 超时自动 stop。
- DRY_RUN 默认开启。
- 使用 LED 或低压假负载表示输出状态。

v0 不做：

- 真实强电控制。
- 真实电机/H 桥接线。
- OTA。
- Matter/Thread/Zigbee 实际接入。
- 复杂设备注册。
- 多租户、多场景动态配置。
- 旧 ESP32 dev board 兼容。

### 建议实现路径

第一步只改固件工程配置和 pin map：

```ini
[env:esp32-c6-devkitc-1]
platform = espressif32
board = esp32-c6-devkitc-1
framework = arduino
monitor_speed = 115200
```

如果该配置构建失败，再按实际错误决定是锁定 platform 版本、改 Arduino 构建链，还是转 ESP-IDF。不要提前重写全部固件。

第二步把引脚定义集中化：

```cpp
#if CONFIG_IDF_TARGET_ESP32C6 || defined(ARDUINO_ESP32C6_DEV)
// ESP32-C6 pin map here
#else
#error "Unsupported board for current development phase"
#endif
```

这里的思路是开发阶段明确失败，不做静默兜底。

第三步做假负载联调：

```text
API / simulator / MQTT
  -> farms/farm-001/gateways/gw-gh-001/commands
  -> ESP32-C6 serial log
  -> LED / fake relay state
  -> events / telemetry / heartbeat
```

第四步才考虑真实设备输入：

- limit switch。
- manual override。
- emergency stop。
- relay board。
- 电源隔离。
- 防水盒和端子。

## Web 页面展示建议

首页当前主叙事是「自然农业场景」和「守棚工长」，这对 MVP 获客是对的，但如果以后要扩宠物和家庭，硬件展示不应该叫「农业网关」。

建议采用两层表达：

```text
产品层：场景智能节点
技术层：ESP32-C6 / Wi-Fi 6 / BLE / Thread / Zigbee / MQTT
```

### 首页第一阶段

短期不建议把硬件放到首屏抢主视觉。当前首屏已经围绕农业场景和 live 面板做过布局优化，再加硬件卡片容易继续遮挡背景图。

更好的方式是在首屏之后增加一个硬件带状区：

- 标题：场景智能节点
- 文案：把棚里的传感器、侧帘、风机和云端 AI 指令接成闭环。
- 视觉：一个 cool 但克制的设备盒渲染图，旁边用小标签展示 Wi-Fi、BLE、Thread/Zigbee、MQTT、安全执行。
- 不写「ESP32-C6」大标题，只在规格行出现。

### 多场景阶段

等宠物或家庭场景启动后，再把页面从「农业单页」升级为「场景入口」：

```text
场景智能节点
  -> 自然农业：棚、风机、侧帘、温湿度
  -> 宠物家庭：喂食、饮水、环境、门磁
  -> 家庭设备：灯、插座、空气、Thread/Matter
```

这样不会推翻当前 MVP，也给未来硬件扩展留了空间。

## 外观方向

### 工业防护款

用于农业、温室、设备间、半户外环境。视觉关键词：

- IP65/IP67 风格外壳。
- 深灰、绿色、黑色为主。
- 防水接头、端子排、DIN 导轨或壁挂孔。
- 状态灯要清楚：Power、Wi-Fi、MQTT、Relay、Fault。
- 外形要像可靠设备，不要像玩具。

这款适合展示在农业页或安装文档里，强调可靠、耐用、可维护。

### 宠物家用款

用于宠物饮水机、喂食器、猫砂盆、家庭传感器。视觉关键词：

- 小型圆角盒或磁吸底座。
- 白色、浅灰、低饱和绿色。
- 隐藏螺丝和线缆。
- 单个柔和状态灯。
- 可以贴近消费电子，而不是工业控制盒。

这款适合未来宠物场景页面，强调安静、好看、不打扰家里环境。

### 统一原则

两种外观不应该意味着两套完全不同的核心硬件。建议统一成：

```text
ESP32-C6 核心板 / 核心模组
  + 工业接口底板 / 家用接口底板
  + 工业防护外壳 / 家用外壳
```

这样产品故事统一，研发复杂度也可控。

## 下一步建议

1. 买或确认一块 ESP32-C6-DevKitC-1。
2. 新增 C6 固件构建环境，先跑 `pio run -e esp32-c6-devkitc-1`。
3. 如果 Arduino/PlatformIO 构建可行，迁移 pin map 并做 LED 假负载。
4. 如果构建不可行，再决定是否切 ESP-IDF，不提前重写。
5. 生成一张「场景智能节点」概念渲染图，先作为 Web 后续视觉资产候选。
6. Web 页面先不立刻硬改首页首屏，等硬件文档和外观方向确认后再加硬件带状区。

## 决策记录

- 默认产品概念名：场景智能节点。
- ESP32-C6：适合作为第一代边缘节点候选。
- 农业：当前 MVP 场景，不作为硬件命名边界。
- 宠物/家庭：作为后续场景预留。
- 兼容策略：开发阶段不做旧设备兼容和隐式兜底。
- 固件第一步：假负载闭环，不接真实执行器。
