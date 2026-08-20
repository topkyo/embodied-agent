export const INDUSTRIAL_INTENT_CONTRACT = `## industrial intent 契约

允许的技能：
- industrial.query_status: 可选 target.cabinet_id；省略时用 domain_configs.industrial.default_cabinet_id
- command.query_status: 可选 target.cabinet_id；parameters.command_id / recent / action
- industrial.start_exhaust: 可选 target.cabinet_id；parameters.duration_seconds 整数 60-3600
- industrial.stop_exhaust: 可选 target.cabinet_id

示例：
{"skill":"industrial.query_status","target":{"cabinet_id":"cabinet-001"}}
{"skill":"industrial.start_exhaust","target":{"cabinet_id":"cabinet-001"},"parameters":{"duration_seconds":600}}
{"skill":"industrial.stop_exhaust","target":{"cabinet_id":"cabinet-001"}}
{"skill":"command.query_status","target":{"cabinet_id":"cabinet-001"},"parameters":{"action":"start_exhaust"}}
`;
