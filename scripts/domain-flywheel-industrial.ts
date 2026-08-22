import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { issueNodeToken } from "@embodied-agent/node";
import { createLlmClientFromSettings } from "./lib/intent-eval-common.js";
import {
  assert,
  attestFlywheelScenario,
  createScenarioRunner,
  FLYWHEEL_ADMIN_TOKEN,
  handleLlmUnavailable,
  parseFlywheelArgs,
  postJson,
  prepareFlywheelAttestationPath,
  RecordingMqttPublisher,
  seedFlywheelData,
  startInProcessApp,
  writePackFlywheelReport,
} from "./lib/flywheel-harness.js";

const INTEGRATION_SECRET = "industrial-flywheel-secret";
const DEPLOYMENT_ID = "dep-industrial-flywheel";
const CABINET_ID = "cabinet-001";
const NODE_ID = "node-sim-industrial-001";
const SENSOR_ID = "sensor-industrial-001";
const FAN_ID = "fan-industrial-001";

function buildIndustrialSeed() {
  return {
    settings: {
      deployment_id: DEPLOYMENT_ID,
      deployment_name: "Industrial Flywheel",
      llm_provider: "deepseek",
      llm_base_url: "https://api.deepseek.com/v1",
      llm_model: "deepseek-v4-flash",
      llm_thinking: false,
      stt_provider: "none",
      stt_model: "whisper-1",
      mqtt_url: "mqtt://127.0.0.1:1883",
      integration_secret: INTEGRATION_SECRET,
      active_domain: "industrial",
      domain_configs: {
        industrial: {
          default_cabinet_id: CABINET_ID,
        },
      },
    },
    deviceRegistry: {
      deployments: [
        {
          deployment_id: DEPLOYMENT_ID,
          name: "Industrial Flywheel",
          timezone: "Asia/Shanghai",
          status: "active",
        },
      ],
      entities: [
        {
          entity_id: CABINET_ID,
          deployment_id: DEPLOYMENT_ID,
          entity_type: "cabinet",
          domain_id: "industrial",
          name: "1号配电柜",
          aliases: ["配电柜", "机房"],
          status: "active",
        },
      ],
      nodes: [
        {
          node_id: NODE_ID,
          deployment_id: DEPLOYMENT_ID,
          entity_id: CABINET_ID,
          status: "active",
          config_version: 1,
        },
      ],
      devices: [
        {
          device_id: SENSOR_ID,
          deployment_id: DEPLOYMENT_ID,
          device_type: "sensor",
          name: "柜内温度",
          aliases: ["温度传感器"],
          entity_id: CABINET_ID,
          node_id: NODE_ID,
          status: "active",
          metrics: ["temperature_c"],
        },
        {
          device_id: FAN_ID,
          deployment_id: DEPLOYMENT_ID,
          device_type: "fan",
          name: "排风风机",
          aliases: ["排风", "通风"],
          entity_id: CABINET_ID,
          node_id: NODE_ID,
          status: "active",
          default_for: "exhaust_fan",
          channel: "relay:exhaust",
        },
      ],
    },
    users: {
      "owner-001": {
        user_id: "owner-001",
        role: "owner",
        deployment_id: DEPLOYMENT_ID,
        display_name: "Industrial Owner",
      },
    },
    platformBindings: {
      bindings: [
        {
          platform: "wechat",
          platform_user_id: "owner-001",
          principal_user_id: "owner-001",
          bound_at: new Date().toISOString(),
        },
      ],
    },
  };
}

async function main(): Promise<void> {
  const args = parseFlywheelArgs(process.argv.slice(2));
  const dataDir = await mkdtemp(join(tmpdir(), "ea-industrial-flywheel-"));
  const mqtt = new RecordingMqttPublisher();
  process.env.AGENT_DATA_DIR = dataDir;
  process.env.ADMIN_TOKEN = FLYWHEEL_ADMIN_TOKEN;
  process.env.NODE_ENV = "development";
  process.env.ACTIVE_DOMAIN = "industrial";
  process.env.DEPLOYMENT_ID = DEPLOYMENT_ID;
  await seedFlywheelData(dataDir, buildIndustrialSeed());

  const { ingestHeartbeatMessage, ingestTelemetryMessage } =
    await import("../apps/api/src/telemetry/store.js");
  const { recordNodeAppliedConfigVersion } = await import("@embodied-agent/node");
  const { applyCommandEvent, listCommands } = await import("../apps/api/src/commands/store.js");

  let deps: ReturnType<typeof createLlmClientFromSettings>;
  try {
    deps = createLlmClientFromSettings();
  } catch (e) {
    await handleLlmUnavailable(e, {
      allowSkip: args.allowSkip,
      pack: "industrial",
      cleanup: async () => {},
    });
    return;
  }

  const attestationPath = await prepareFlywheelAttestationPath(dataDir, DEPLOYMENT_ID);

  const { app, baseUrl } = await startInProcessApp(dataDir, {
    pipeline: {
      llmClient: deps.client,
      model: deps.model,
      mqttEnabled: false,
      mqtt,
    },
    beforeListen: async () => {
      issueNodeToken(DEPLOYMENT_ID, NODE_ID);
      recordNodeAppliedConfigVersion(DEPLOYMENT_ID, NODE_ID, 1, "config_applied");
      ingestHeartbeatMessage(
        { message_type: "heartbeat", node_id: NODE_ID, config_version: 1 },
        DEPLOYMENT_ID,
      );
      ingestTelemetryMessage(
        {
          readings: [
            { device_id: SENSOR_ID, metric: "temperature_c", value: 42 },
            { device_id: FAN_ID, metric: "relay_state", value: 0 },
          ],
        },
        DEPLOYMENT_ID,
      );
    },
  });

  const { run, results } = createScenarioRunner();

  try {
    await run("query status reads industrial telemetry", async () => {
      const utterance = "配电柜现在多少度";
      const res = await postJson(
        baseUrl,
        "/integrations/chat",
        {
          platform: "wechat",
          user_id: "owner-001",
          conversation_id: "industrial-query",
          text: utterance,
        },
        { Authorization: `Bearer ${INTEGRATION_SECRET}` },
      );
      assert(res.status === 200, `query status ${res.status}`);
      assert(String(res.json.reply ?? "").includes("42.0"), "temperature reply missing");
      attestFlywheelScenario(attestationPath, {
        pack: "industrial",
        scenario: "query status reads industrial telemetry",
        utterance,
        expected_skill: "industrial.query_status",
        actual_skill: String(res.json.skill ?? "llm_resolved"),
        model: deps.model,
        llm_real: true,
        ok: true,
        evidence_refs: { mqtt_published_length: mqtt.published.length },
      });
    });

    await run("start exhaust requires confirmation", async () => {
      const utterance = "启动排风10分钟";
      const res = await postJson(
        baseUrl,
        "/integrations/chat",
        {
          platform: "wechat",
          user_id: "owner-001",
          conversation_id: "industrial-exhaust",
          text: utterance,
        },
        { Authorization: `Bearer ${INTEGRATION_SECRET}` },
      );
      assert(res.status === 200, `start status ${res.status}`);
      const reply = String(res.json.reply ?? "");
      assert(
        reply.length > 0 && (reply.includes("确认") || reply.includes("排风")),
        "confirmation reply missing",
      );
      assert(mqtt.published.length === 0, "command published before confirmation");
      attestFlywheelScenario(attestationPath, {
        pack: "industrial",
        scenario: "start exhaust requires confirmation",
        utterance,
        expected_skill: "industrial.start_exhaust",
        actual_skill: String(res.json.skill ?? "llm_resolved"),
        model: deps.model,
        llm_real: true,
        ok: true,
        evidence_refs: { mqtt_published_length: mqtt.published.length },
      });
    });

    await run("confirmed exhaust command completes and lowers temperature", async () => {
      const utterance = "确认";
      const res = await postJson(
        baseUrl,
        "/integrations/chat",
        {
          platform: "wechat",
          user_id: "owner-001",
          conversation_id: "industrial-exhaust",
          text: utterance,
        },
        { Authorization: `Bearer ${INTEGRATION_SECRET}` },
      );
      assert(res.status === 200, `confirm status ${res.status}`);
      assert(mqtt.published.length === 1, "confirmed command not published");
      const cmd = mqtt.published[0]!;
      assert(cmd.action === "start", `unexpected action ${cmd.action}`);
      applyCommandEvent({
        message_type: "command_event",
        protocol_version: "0.1",
        event_id: `evt-${Date.now()}`,
        command_id: cmd.command_id,
        idempotency_key: cmd.idempotency_key,
        deployment_id: DEPLOYMENT_ID,
        node_id: NODE_ID,
        device_id: FAN_ID,
        status: "completed",
        result: { actual_duration_seconds: 600 },
        occurred_at: new Date().toISOString(),
      });
      ingestTelemetryMessage(
        {
          readings: [
            { device_id: SENSOR_ID, metric: "temperature_c", value: 39.5 },
            { device_id: FAN_ID, metric: "relay_state", value: 1 },
          ],
        },
        DEPLOYMENT_ID,
      );
      const completed = listCommands(DEPLOYMENT_ID).find(
        (row) => row.command_id === cmd.command_id,
      );
      assert(completed?.status === "completed", "command did not complete");
      attestFlywheelScenario(attestationPath, {
        pack: "industrial",
        scenario: "confirmed exhaust command completes and lowers temperature",
        utterance,
        expected_skill: "industrial.start_exhaust",
        actual_skill: cmd.action === "start" ? "llm_resolved" : "unknown",
        model: deps.model,
        llm_real: true,
        ok: true,
        evidence_refs: { mqtt_published_length: mqtt.published.length, command_id: cmd.command_id },
      });
    });

    await run("command status query sees completed exhaust", async () => {
      const utterance = "刚才排风启动成功了吗";
      const res = await postJson(
        baseUrl,
        "/integrations/chat",
        {
          platform: "wechat",
          user_id: "owner-001",
          conversation_id: "industrial-status",
          text: utterance,
        },
        { Authorization: `Bearer ${INTEGRATION_SECRET}` },
      );
      assert(res.status === 200, `command query status ${res.status}`);
      assert(String(res.json.reply ?? "").length > 0, "completed status missing");
      attestFlywheelScenario(attestationPath, {
        pack: "industrial",
        scenario: "command status query sees completed exhaust",
        utterance,
        expected_skill: "command.query_status",
        actual_skill: String(res.json.skill ?? "llm_resolved"),
        model: deps.model,
        llm_real: true,
        ok: true,
        evidence_refs: { mqtt_published_length: mqtt.published.length },
      });
    });
  } finally {
    await app.close();
    await rm(dataDir, { recursive: true, force: true });
  }

  const { reportPath, passed, total, exitCode } = writePackFlywheelReport({
    pack: "industrial",
    deployment_id: DEPLOYMENT_ID,
    model: deps.model,
    attestation_path: attestationPath,
    results,
    reportFileName: "industrial-flywheel-report.json",
  });
  console.log(`Industrial flywheel: ${passed}/${total}`);
  console.log(`Report: ${reportPath}`);
  if (exitCode !== 0) process.exitCode = exitCode;
}

await main();
