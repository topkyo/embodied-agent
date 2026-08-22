#!/usr/bin/env tsx
/**
 * 八场景 L3 数据飞轮全自动闭环。
 * 前置：API FLYWHEEL_DEV=1；双棚模拟器 SIM_TELEMETRY_SCENARIO=full SIM_TELEMETRY_REACT=1
 */
import { resolveAgentDataDir } from "@embodied-agent/platform";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { appendSignedFlywheelAttestation } from "./lib/flywheel-attestation.js";
import { writeLocalEvalReport } from "./lib/eval-report-output.js";
import { setTimeout as sleep } from "node:timers/promises";
import type { SceneSkillId } from "../apps/api/src/scene/registry.js";
import {
  FLYWHEEL_FARM_USER,
  readSettingsFlags,
  resetFlywheelRunState,
  seedFlywheelWechatFixture,
} from "./lib/flywheel-fixture.js";
import { getAllSceneSkillIds, missingScenes } from "./lib/flywheel-scene-catalog.js";
import {
  apiHealth,
  clearScenePending,
  confirmPendingWithRetry,
  ensureFlywheelPilotUsers,
  devChat,
  fetchDigestPreview,
  fetchRoiSummary,
  waitForGreenhouseHumidity,
  getSceneOutcomeIds,
  pollOutcomeCount,
  postPilotBaseline,
  postResetFlywheelState,
  postWeatherProactive,
  readOperationLogSceneIds,
  setDeviceManualOverride,
  preflightFlywheelDev,
  waitForCommandCompleted,
  waitForDeviceIdle,
  waitForFailedCommands,
  waitForIrrigationCompleted,
  waitForOperationLogScene,
  waitForPendingScene,
} from "./lib/flywheel-e2e-lib.js";
import { bindScriptRuntime } from "./lib/bind-script-runtime.js";

const API = (process.env.API_URL ?? "http://127.0.0.1:3001").replace(/\/$/, "");
const TOKEN = process.env.ADMIN_TOKEN ?? "dev-admin";
const AGENT_DATA_DIR = resolveAgentDataDir();
const DEPLOYMENT_ID = process.env.DEPLOYMENT_ID ?? "dep-gh-pilot-001";
const FAST = process.env.FLYWHEEL_FAST !== "0";
const sustainedWaitMs = FAST
  ? (Number(process.env.SUSTAINED_ALERT_MINUTES ?? "3") + 3) * 60_000
  : (Number(process.env.SUSTAINED_ALERT_MINUTES ?? "15") + 3) * 60_000;
const windowMin = Number(
  process.env.SCENE_OUTCOME_WINDOWS_MINUTES?.split(",")[0] ?? (FAST ? "1" : "15"),
);
const OUTCOME_SCENE_IDS: SceneSkillId[] = [
  "high_temp_emergency_response",
  "humidity_mildew_prevention",
  "post_irrigation_ventilation",
  "night_ventilation_control",
];

const attestations = new Set<SceneSkillId>();

function attest(id: SceneSkillId, note: string): void {
  attestations.add(id);
  console.log(`[attest] ${id}: ${note}`);
  const dir = resolve(AGENT_DATA_DIR, "deployments", DEPLOYMENT_ID);
  mkdirSync(dir, { recursive: true });
  appendSignedFlywheelAttestation(resolve(dir, "flywheel-scene-attestations.jsonl"), {
    scene_skill_id: id,
    note,
  });
}

/** tick-sustained 可能并行推送其他场景 pending，确认前只保留当前场景。 */
async function pruneOtherScenePendings(
  conversationId: string,
  keepScene: SceneSkillId,
): Promise<void> {
  for (const scene of getAllSceneSkillIds()) {
    if (scene === keepScene) continue;
    await clearScenePending({
      api: API,
      userId: FLYWHEEL_FARM_USER,
      conversationId,
      sceneSkillId: scene,
    });
  }
}

function fail(msg: string): never {
  console.error("FAIL:", msg);
  process.exit(1);
}

function log(phase: string): void {
  console.log(`\n=== ${phase} ===`);
}

async function main() {
  process.env.AGENT_DATA_DIR = AGENT_DATA_DIR;
  await bindScriptRuntime();
  console.log("AGENT_DATA_DIR=", AGENT_DATA_DIR);
  console.log("八场景飞轮 | mode:", FAST ? "fast" : "realtime");

  await apiHealth(API);
  await preflightFlywheelDev(API);
  const flags = readSettingsFlags(AGENT_DATA_DIR);
  if (!flags.llm_api_key) fail("settings.json 缺少 llm_api_key");

  resetFlywheelRunState(AGENT_DATA_DIR, DEPLOYMENT_ID);
  await postResetFlywheelState(API);
  seedFlywheelWechatFixture(AGENT_DATA_DIR);
  await ensureFlywheelPilotUsers({
    api: API,
    token: TOKEN,
    deploymentId: DEPLOYMENT_ID,
  });
  await postPilotBaseline({ api: API, token: TOKEN });
  const startedAt = Date.now();

  // 1. 高温应急 gh-002（emergency_heat ≥35°C）
  log("1/8 high_temp_emergency_response");
  const step1At = Date.now();
  let r = await devChat({
    api: API,
    text: "2号棚温度超过30度就报警",
    userId: FLYWHEEL_FARM_USER,
    conversationId: "flywheel-s1-threshold",
  });
  if (r.status !== 200) fail(`设温阈值失败 ${r.status}`);
  const p1 = await waitForPendingScene({
    api: API,
    deploymentDir: AGENT_DATA_DIR,
    userId: FLYWHEEL_FARM_USER,
    sceneSkillId: "high_temp_emergency_response",
    sinceMs: step1At,
    timeoutMs: sustainedWaitMs,
    pollMs: FAST ? 10_000 : 8000,
  });
  attest("high_temp_emergency_response", "sustained L2 pending");
  await pruneOtherScenePendings(p1.conversation_id, "high_temp_emergency_response");
  r = await confirmPendingWithRetry({
    api: API,
    userId: FLYWHEEL_FARM_USER,
    conversationId: p1.conversation_id,
  });
  if (r.status !== 200) fail(`高温应急确认失败 ${r.status}`);
  await waitForCommandCompleted({
    deploymentDir: AGENT_DATA_DIR,
    deploymentId: DEPLOYMENT_ID,
    greenhouseId: "gh-002",
    sinceMs: startedAt,
    timeoutMs: FAST ? 120_000 : 600_000,
  });

  // 2. 高湿防病 gh-001
  log("2/8 humidity_mildew_prevention");
  const step2At = Date.now();
  r = await devChat({
    api: API,
    text: "1号棚湿度超过85%就报警",
    userId: FLYWHEEL_FARM_USER,
    conversationId: "flywheel-s2-threshold",
  });
  if (r.status !== 200) fail(`设湿阈值失败 ${r.status}`);
  const p2 = await waitForPendingScene({
    api: API,
    deploymentDir: AGENT_DATA_DIR,
    userId: FLYWHEEL_FARM_USER,
    sceneSkillId: "humidity_mildew_prevention",
    sinceMs: step2At,
    timeoutMs: sustainedWaitMs,
    pollMs: FAST ? 10_000 : 8000,
  });
  attest("humidity_mildew_prevention", "sustained humidity L2");
  await pruneOtherScenePendings(p2.conversation_id, "humidity_mildew_prevention");
  r = await confirmPendingWithRetry({
    api: API,
    userId: FLYWHEEL_FARM_USER,
    conversationId: p2.conversation_id,
  });
  if (r.status !== 200) fail(`高湿通风确认失败 ${r.status}`);
  await waitForCommandCompleted({
    deploymentDir: AGENT_DATA_DIR,
    deploymentId: DEPLOYMENT_ID,
    greenhouseId: "gh-001",
    sinceMs: startedAt,
    timeoutMs: FAST ? 120_000 : 600_000,
  });

  // 3. 浇水后通风 gh-001
  log("3/8 post_irrigation_ventilation");
  const irrSec = FAST ? 180 : 300;
  const irrStartedAt = Date.now();
  r = await devChat({
    api: API,
    text: `1号棚A区浇水${FAST ? 3 : 5}分钟`,
    userId: FLYWHEEL_FARM_USER,
    conversationId: "flywheel-s3-irr",
  });
  if (r.status !== 200) fail(`灌溉指令失败 ${r.status}`);
  await waitForIrrigationCompleted({
    deploymentDir: AGENT_DATA_DIR,
    deploymentId: DEPLOYMENT_ID,
    greenhouseId: "gh-001",
    sinceMs: irrStartedAt,
    timeoutMs: FAST ? irrSec * 1000 + 30_000 : irrSec * 1000 + 60_000,
  });
  const p3 = await waitForPendingScene({
    api: API,
    deploymentDir: AGENT_DATA_DIR,
    userId: FLYWHEEL_FARM_USER,
    sceneSkillId: "post_irrigation_ventilation",
    sinceMs: irrStartedAt,
    timeoutMs: FAST ? 120_000 : 300_000,
  });
  attest("post_irrigation_ventilation", "灌溉完成 L2");
  await pruneOtherScenePendings(p3.conversation_id, "post_irrigation_ventilation");
  r = await confirmPendingWithRetry({
    api: API,
    userId: FLYWHEEL_FARM_USER,
    conversationId: p3.conversation_id,
  });
  if (r.status !== 200) fail(`灌后通风确认失败 ${r.status}`);

  // 4. 夜间通风（天气高温 L2）
  log("4/8 night_ventilation_control (weather heat)");
  const step4At = Date.now();
  await postWeatherProactive(API, { force_heat: true });
  const p4 = await waitForPendingScene({
    api: API,
    deploymentDir: AGENT_DATA_DIR,
    userId: FLYWHEEL_FARM_USER,
    sceneSkillId: "night_ventilation_control",
    sinceMs: step4At,
    timeoutMs: FAST ? 180_000 : 300_000,
  });
  attest("night_ventilation_control", "weather_heat_l2 pending");
  await pruneOtherScenePendings(p4.conversation_id, "night_ventilation_control");
  r = await confirmPendingWithRetry({
    api: API,
    userId: FLYWHEEL_FARM_USER,
    conversationId: p4.conversation_id,
  });
  if (r.status !== 200) fail(`夜间通风确认失败 ${r.status}`);

  // 5. 寒潮保温
  log("5/8 cold_wave_protection");
  const wx = await fetch(`${API}/dev/flywheel/weather-proactive`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ force_cold: true }),
  });
  if (!wx.ok) fail(`weather cold ${wx.status}`);
  const wxBody = (await wx.json()) as { cold?: number };
  if ((wxBody.cold ?? 0) < 1) fail("寒潮推送未触发");
  attest("cold_wave_protection", "weather_cold proactive");

  // 6. 清晨降露
  log("6/8 morning_dew_reduction");
  await waitForGreenhouseHumidity({
    api: API,
    token: TOKEN,
    greenhouseId: "gh-001",
    minPercent: 85,
    timeoutMs: FAST ? 300_000 : 300_000,
    pollMs: FAST ? 10_000 : 15_000,
  });
  const digest = await fetchDigestPreview(API, "morning");
  if (!digest.includes("morning_dew_reduction")) {
    fail("晨间简报未含 morning_dew_reduction（gh-001 高湿应触发）");
  }
  attest("morning_dew_reduction", "digest morning high humidity");

  // 7. 手动优先复核
  log("7/8 worker_manual_override_review");
  await setDeviceManualOverride({
    api: API,
    token: TOKEN,
    deviceId: "vent-sim-gh-001",
    manualOverride: true,
  });
  r = await devChat({
    api: API,
    text: "1号棚开通风5分钟",
    userId: FLYWHEEL_FARM_USER,
    conversationId: "flywheel-s7-manual",
  });
  if (r.status !== 403 && !r.reply.includes("手动")) {
    fail(`手动优先拒绝未生效 status=${r.status}`);
  }
  const opScenes = readOperationLogSceneIds(AGENT_DATA_DIR, DEPLOYMENT_ID, startedAt);
  if (!opScenes.includes("worker_manual_override_review")) {
    fail("操作日志未记录 worker_manual_override_review");
  }
  attest("worker_manual_override_review", "safety reject + op log");
  await setDeviceManualOverride({
    api: API,
    token: TOKEN,
    deviceId: "vent-sim-gh-001",
    manualOverride: false,
  });

  // 8. 设备效率诊断
  log("8/8 device_efficiency_diagnosis");
  // 等待 vent-sim-gh-001 空闲，避免 in-flight 去重拦截 flywheel-fail 命令。
  await waitForDeviceIdle({
    deploymentDir: AGENT_DATA_DIR,
    deploymentId: DEPLOYMENT_ID,
    deviceId: "vent-sim-gh-001",
    timeoutMs: FAST ? 120_000 : 600_000,
    pollMs: FAST ? 5000 : 10000,
  });
  for (let i = 0; i < 3; i++) {
    await devChat({
      api: API,
      text: "1号棚开通风2分钟",
      userId: FLYWHEEL_FARM_USER,
      conversationId: `flywheel-fail-${i}`,
    });
    await sleep(2000);
  }
  await waitForFailedCommands({
    deploymentDir: AGENT_DATA_DIR,
    deploymentId: DEPLOYMENT_ID,
    deviceId: "vent-sim-gh-001",
    sinceMs: startedAt,
    minCount: 3,
    timeoutMs: 90_000,
  });
  await waitForOperationLogScene({
    deploymentDir: AGENT_DATA_DIR,
    deploymentId: DEPLOYMENT_ID,
    sceneSkillId: "device_efficiency_diagnosis",
    sinceMs: startedAt,
    timeoutMs: 90_000,
  });
  attest("device_efficiency_diagnosis", "3x failures + proactive op log");

  // outcome 窗口 + 周报 + ROI
  log("复盘窗口 + 周报 + ROI");
  await sleep(windowMin * 60_000);
  await pollOutcomeCount({
    api: API,
    token: TOKEN,
    minCount: OUTCOME_SCENE_IDS.length,
    timeoutMs: 120_000,
  });
  const outcomeIds = await getSceneOutcomeIds(API, TOKEN);
  const missingOutcomes = OUTCOME_SCENE_IDS.filter(
    (id) => !(outcomeIds as SceneSkillId[]).includes(id),
  );
  if (missingOutcomes.length > 0) {
    console.error("未覆盖 outcome 场景:", missingOutcomes.join(", "));
    console.error("outcomes:", outcomeIds.join(", "));
    console.error("attestations:", [...attestations].join(", "));
    fail(`物理指令复盘未全覆盖，缺 ${missingOutcomes.length} 个`);
  }
  const missingCoverage = missingScenes(outcomeIds as SceneSkillId[], [...attestations]);
  if (missingCoverage.length > 0) {
    console.error("未覆盖场景:", missingCoverage.join(", "));
    console.error("outcomes:", outcomeIds.join(", "));
    console.error("attestations:", [...attestations].join(", "));
    fail(`八场景未全覆盖，缺 ${missingCoverage.length} 个`);
  }
  const missingAttestations = getAllSceneSkillIds().filter((id) => !attestations.has(id));
  if (missingAttestations.length > 0) {
    console.error("未覆盖 attest 场景:", missingAttestations.join(", "));
    console.error("outcomes:", outcomeIds.join(", "));
    console.error("attestations:", [...attestations].join(", "));
    fail(`八场景 attest 未全覆盖，缺 ${missingAttestations.length} 个`);
  }

  const weekly = await devChat({
    api: API,
    text: "这周运营有什么建议",
    userId: FLYWHEEL_FARM_USER,
    conversationId: "flywheel-weekly",
  });
  if (weekly.status !== 200) fail("周报失败");
  const roi = await fetchRoiSummary({ api: API, token: TOKEN });
  console.log("roi:", roi.slice(0, 200));
  console.log("八场景:", getAllSceneSkillIds().join(", "));
  const attestationPath = resolve(
    AGENT_DATA_DIR,
    "deployments",
    DEPLOYMENT_ID,
    "flywheel-scene-attestations.jsonl",
  );
  const report = {
    at: new Date().toISOString(),
    pack: "agriculture",
    deployment_id: DEPLOYMENT_ID,
    llm_real: true,
    attestation_path: attestationPath,
    scene_skill_ids: getAllSceneSkillIds(),
    attested: [...attestations],
    outcome_scene_ids: OUTCOME_SCENE_IDS,
    passed: true,
  };
  const reportPath = writeLocalEvalReport(
    "agriculture-flywheel-report.json",
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(`Report: ${reportPath}`);
  console.log("::DOMAIN_FLYWHEEL_PASSED::");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
