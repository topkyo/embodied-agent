# Dogfood Report — Round 4

**Date:** 2026-06-13  
**Target:** http://127.0.0.1:5173  
**Session:** `ea-dogfood-r4-20260612`  
**Commits:** `7cf4d15`, `1e97ea8`

## Summary

| Severity             | Count                        |
| -------------------- | ---------------------------- |
| P0                   | 0                            |
| P1                   | 0                            |
| P2                   | 0 (1 fixed)                  |
| P3                   | 1 open (API LLM note locale) |
| **Fixed this round** | **6**                        |

## Checklist (7/7 PASS)

| #   | Check                                  | Result                                                                                 |
| --- | -------------------------------------- | -------------------------------------------------------------------------------------- |
| 1   | EN ops nav/title — no raw i18n keys    | **PASS** — title `Embodied Agent · Overview`, nav shows Overview/Devices/Users         |
| 2   | Pair page EN title                     | **PASS** — H1 `Scene node QR pairing`, tab `Embodied Agent · Scene node QR pairing`    |
| 3   | Devices empty node_id hint EN          | **PASS** — `Enter node_id to bind`                                                     |
| 4   | Scene-only settings save — no LLM note | **PASS** — API `settingsSaveNote` returns undefined; unit test green                   |
| 5   | No 429 during polling                  | **PASS** — 15× `/admin/nodes` burst → all 200; dev limit 600/min + localhost allowList |
| 6   | Both sim nodes online                  | **PASS** — API overview: `node-sim-gh-001` + `node-sim-gh-002` online=true             |
| 7   | User save/delete i18n EN               | **PASS** — code uses `console.users.saved/deleted`                                     |

## Fixes shipped (R4)

1. **API rate limit** — dev 600/min, localhost allowList (fixes 429 on devices 5s poll)
2. **Devices poll** — 5s → 10s
3. **settingsSaveNote** — LLM restart hint only when LLM/STT fields change
4. **Pair.tsx** — full i18n (`pair.*` keys)
5. **NodeManagementPanel** — bindNeedsNodeId hint, issue code button i18n, ghId placeholder i18n
6. **UserManagementPanel** — save/delete messages i18n
7. **DocumentTitle** — pair route uses `pair.title`

## Remaining (non-blocking)

### ISSUE-007 — ✅ FIXED — Vent/Fan telemetry `unknown`

- 模拟器 telemetry 增加 `relay_state` readings（vent_motor/fan）
- API `ingestTelemetryMessage` 映射为 `closed`/`open`、`off`/`on`，缺省不再写 `unknown`

### ISSUE-R4-004 — ✅ FIXED — LLM save note EN 本地化

- 前端 `settings.msg.llmSaved` 替代 API 中文 `note` 展示

## Gates

| Gate            | Result                                    |
| --------------- | ----------------------------------------- |
| `npm run lint`  | PASS                                      |
| `npm test`      | PASS (incl. `settings-save-note.test.ts`) |
| `npm run build` | PASS                                      |
| `npm run e2e`   | 9/9 PASS                                  |

## Screenshots

- `screenshots/r4/` — pair/overview captures (partial; overview node IDs in API not always visible in a11y tree)
