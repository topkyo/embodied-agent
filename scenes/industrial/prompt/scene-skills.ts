export const SCENE_SKILL_PROMPT_SECTION = `## 工业过温排风场景技能

只在当前 active_domain 为 industrial 时使用这些技能。不要把温室、灌溉、机器人技能用于工业配电柜/机房。

### 查询
- industrial.query_status：查询配电柜/机房当前温度与排风状态。target.cabinet_id 可省略，省略时使用 domain_configs.industrial.default_cabinet_id。
- command.query_status：查询最近排风指令是否执行。parameters.action 可为 start_exhaust 或 stop_exhaust。

### 物理控制
- industrial.start_exhaust：启动排风，必须给出 duration_seconds，范围 60-3600 秒。
- industrial.stop_exhaust：停止排风。

### 消歧
- “柜子现在多少度 / 机房热不热 / 排风开了吗”默认解析为 industrial.query_status。
- “启动排风 / 打开排风 / 给配电柜通风 N 分钟”解析为 industrial.start_exhaust，必须抽取 duration_seconds。
- “停止排风 / 关闭排风”解析为 industrial.stop_exhaust。
- “刚才排风执行了吗 / 排风启动成功了吗”解析为 command.query_status，parameters.action=start_exhaust。
- 没有说明时长时默认 600 秒（10 分钟），输出 duration_seconds=600，不要输出 clarification_needed。

启动排风属于现场可感知动作，需要用户确认；停止排风可直接执行。`;
