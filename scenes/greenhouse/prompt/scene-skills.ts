/**
 * 运行时注入 LLM 的精简场景契约（完整文档见 scenes/greenhouse/docs/skills/*.md）。
 * 只放理解层需要的映射规则，避免堆黄金句。
 */
export const SCENE_SKILL_PROMPT_SECTION = `
场景技能（理解映射，只输出 JSON）：

【脉冲通风 open_vent / close_vent】
- 用户给明确分钟/秒 → duration_seconds 按用户原话换算（10 分=600，20 分=1200）；未给时长须 clarification_needed 追问。
- 不按固定 15 分钟截断；整夜/按温度自动开关用 greenhouse.set_mode，勿用超长 open_vent 代替环控语义。

【夜间通风 set_mode】
- 「开一晚上」「夜间别超 N 度」「夜里自动通风」「N号棚自动通风」→ mode=night_vent，max_temp_c/temp_high_c（默认 30）。
- 「关闭夜间模式」→ mode=off。
- 用户追问「夜间模式开了吗」「夜间通风模式打开了吗」→ command.query_status，parameters.action=set_mode；未指明棚号时输出 target:{}，禁止 clarification_needed。

【指令状态 command.query_status】（查指令/模式是否生效，不是查温湿度）
- 含「刚才」且问通风是否执行（「刚才开通风执行了吗」）→ parameters.action=open_vent，勿 recent=true。
- 「开通风成功了吗」（无「刚才」）→ parameters.recent=true。
- 「N号棚开通风了吗」「通风开了吗」「侧帘开了吗」→ parameters.action=open_vent；有棚号则 target.greenhouse_id。
- 「夜间模式开了吗」→ parameters.action=set_mode。
- 勿与 greenhouse.query_status（多少度/湿度）混淆。

【日志 log.query_today】
- 「今天谁动了」「谁操作过」「今天操作记录」→ log.query_today；有棚号加 greenhouse_id。

【多轮跟进】（消息前若有对话历史，必须结合历史，禁止重复追问已明确的棚号/时长）
- 历史刚查 gh-001 温度，当前「打开10分钟」→ greenhouse.open_vent gh-001 duration_seconds=600。
- 历史刚对 gh-001 侧帘开通风 15 分钟，当前「2号棚也打开」→ greenhouse.open_vent gh-002，duration_seconds 延续上轮（15 分=900）。
- 历史刚为 gh-001 设温度报警 30 度，当前「也是30度」→ alert.set_threshold gh-002，同样 metric/operator/value。
- 历史讨论夜间模式，当前「可以开启吗」→ greenhouse.set_mode(night_vent)；「打开了吗」→ command.query_status(action=set_mode)。
- 上一轮因手动优先/通风互锁/设备离线被拒，或用户改口要整夜环控，说「那就开夜间」「开夜间模式」→ greenhouse.set_mode(night_vent)。

【风机 fan.start】
- 必须有时长；未说明时长须 clarification_needed 追问「开多久」。

【通知偏好】
- 「今晚别提醒」「别烦我」由澄清合并层正则处理（非 LLM skill）；理解层勿输出虚构 skill。

【天气预报 weather.*】
- 「天气如何」「天气怎么样」「明天天气」「会下雨吗」→ weather.query_forecast，**勿** greenhouse.query_status。
- 复合问句同时含「大棚/大盘/情况」与「天气」→ 由网关串行执行 query_all_status + weather.query_forecast；禁止说「没监测设备」或「大盘查不了」。
- 「两个大棚的浇灌情况如何」→ irrigation.query_status（各分区），**勿** zone_id=未知分区。

【寒潮防冻 cold_wave_protection】
- 用户问降温/寒潮/今晚冷吗/要保温吗 → 优先 weather.query_forecast 或 weather.query_alert。
- 若用户明确要采取环控行动（开夜间模式、保温通风）→ greenhouse.set_mode(night_vent)。
- 不要编造未在天气预报摘要中出现的极端温度。

【高湿防病害 humidity_mildew_prevention】
- 问高湿/霉病/防病 → agronomy.query_pest，parameters.query 含「高湿」或具体病害名。
- 若用户要执行通风降湿 → greenhouse.open_vent（需时长）或 set_mode。

【报警查询 alert.query_threshold】
- 「N号棚湿度报警阈值」「温度报警阈值是多少」→ alert.query_threshold（查询，勿 clarification）；设置阈值才用 alert.set_threshold。

【灌后通风 post_irrigation_ventilation】（L3 执行层，非理解层 skill）
- 用户说灌溉 → 仅 irrigation.start；**勿**在理解层挂灌后通风 scene。
- 灌溉阀完成后由 command-hooks 以 irrigation_completed 推送 L2 通风建议；用户确认后 open_vent 挂 post_irrigation_ventilation 复盘 outcome。

【灌溉 irrigation.*】（P1，已支持）
- 「给1号大棚/1号棚灌溉N分钟」未指明 A/B 区 → irrigation.start，zone_id=zone-a，greenhouse_id=gh-001，**禁止** 追问分区。
- 「1号棚A区浇水5分钟」「A区灌溉10分钟」→ irrigation.start，zone_id=zone-a，duration_seconds 为秒；**禁止** clarification 说「不支持灌溉」。
- 「2号棚灌溉15分钟」「2号棚B区浇水」「2号棚A区浇水」（口语常混用区号）→ irrigation.start，target.greenhouse_id=gh-002，zone_id 可省略或 zone-b；**禁止** 判成 greenhouse.open_vent（灌溉≠通风/开帘），**禁止** 因「2号棚+A区」字面冲突而 clarification。
- 用户纠正「开启灌溉不是通风」且历史已含棚号/时长 → irrigation.start，沿用历史 greenhouse_id 与 duration_seconds。
- 「2号棚B区浇水」未给时长 → clarification_needed 追问几分钟。
- 「停止A区灌溉」「停止浇水」→ irrigation.stop，zone_id=zone-a。
- 「A区灌溉状态」「灌溉状态怎么样」「在浇水吗」→ irrigation.query_status，**勿** greenhouse.query_status。
`.trim();
