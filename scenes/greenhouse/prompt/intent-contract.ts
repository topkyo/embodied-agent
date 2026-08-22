export const GREENHOUSE_INTENT_CONTRACT = `各技能 parameters 必须使用下列字段名（禁止 threshold、sensor_type、direction 等自造字段）：

- greenhouse.query_status / greenhouse.stop_vent: target.greenhouse_id
- greenhouse.open_vent / greenhouse.close_vent: target.greenhouse_id, parameters.duration_seconds（整数秒）
- greenhouse.set_mode: target.greenhouse_id, parameters.mode（"night_vent"|"off"）, 可选 max_temp_c, temp_high_c, temp_low_c, until_iso
- fan.start / fan.stop: target.fan_id
- alert.set_threshold: target.greenhouse_id, parameters.metric（"temperature_c"|"humidity_percent"）, parameters.operator（">"|"<"|">="|"<="）, parameters.value（数字）
- alert.query_threshold: 可选 target.greenhouse_id；省略则返回全场规则
- alert.clear_threshold: target.greenhouse_id, 可选 parameters.metric
- alert.query_today: 可选 target.greenhouse_id
- log.query_today: 可选 target.greenhouse_id
- greenhouse.query_all_status: target 省略或 {}
- report.set_schedule: target {} 或省略, parameters.greenhouse_ids（字符串数组）, parameters.interval_minutes（整数分钟，1-1440）
- report.cancel_schedule: target {} 或省略
- report.query_schedule: target {} 或省略
- command.query_status: 可选 target.greenhouse_id；parameters.command_id / recent / action（"set_mode" 查夜间模式，"open_vent" 查通风指令是否生效；勿与 greenhouse.query_status 混淆）
- irrigation.start: target.zone_id（"zone-a"|"zone-b"）, parameters.duration_seconds（整数秒）
- irrigation.stop: target.zone_id
- irrigation.query_status: 可选 target.zone_id
- weather.query_forecast: target {} 或省略, 可选 parameters.hours（1-72，默认 24）
- weather.query_alert: target {} 或省略
- satellite.query_ndvi: 必填 target.greenhouse_id 或 plot_id
- agronomy.query_pest: target {} 或省略, parameters.query（字符串）
- tasks.query_task: target {} 或省略, 可选 parameters.status（pending|done|all）
- tasks.create_task: target {} 或省略, parameters.title, 可选 due_date、greenhouse_id
- advice.query_weekly: target {} 或省略
- policy.apply_suggestion: target {} 或省略, 可选 parameters.suggestion_index（从 1 起）或 suggestion_id

示例：
{"skill":"alert.set_threshold","target":{"greenhouse_id":"gh-002"},"parameters":{"metric":"temperature_c","operator":">","value":30}}
{"skill":"alert.query_threshold","target":{"greenhouse_id":"gh-001"}}
{"skill":"command.query_status","target":{"greenhouse_id":"gh-001"},"parameters":{"action":"set_mode"}}
{"skill":"greenhouse.set_mode","target":{"greenhouse_id":"gh-001"},"parameters":{"mode":"night_vent","max_temp_c":30,"temp_low_c":28}}
{"skill":"report.set_schedule","target":{},"parameters":{"greenhouse_ids":["gh-001","gh-002"],"interval_minutes":15}}
{"skill":"irrigation.start","target":{"zone_id":"zone-a"},"parameters":{"duration_seconds":300}}
{"skill":"irrigation.query_status","target":{"zone_id":"zone-a"}}
{"skill":"weather.query_forecast","target":{},"parameters":{"hours":24}}
{"skill":"weather.query_alert","target":{}}
{"skill":"agronomy.query_pest","target":{},"parameters":{"query":"高湿霉病"}}`;
