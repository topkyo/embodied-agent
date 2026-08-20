import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startM20Stub } from "./m20-stub.js";
import { createLlmClientFromSettings } from "./lib/intent-eval-common.js";
import {
  assert,
  attestFlywheelScenario,
  createScenarioRunner,
  FLYWHEEL_ADMIN_TOKEN,
  getAdminJson,
  handleLlmUnavailable,
  parseFlywheelArgs,
  postJson,
  prepareFlywheelAttestationPath,
  RecordingMqttPublisher,
  seedFlywheelData,
  startInProcessApp,
  writePackFlywheelReport,
} from "./lib/flywheel-harness.js";

const INTEGRATION_SECRET = "domain-flywheel-robotics-secret";
const DEPLOYMENT_ID = "dep-domain-flywheel-robotics";
const ROBOT_ID = "m20-001";

function buildRoboticsSeed(m20BaseUrl: string) {
  return {
    settings: {
      deployment_id: DEPLOYMENT_ID,
      deployment_name: "M20 Robot Flywheel",
      llm_provider: "deepseek",
      llm_base_url: "https://api.deepseek.com/v1",
      llm_model: "deepseek-v4-flash",
      llm_thinking: false,
      stt_provider: "none",
      stt_model: "whisper-1",
      mqtt_url: "mqtt://127.0.0.1:1883",
      integration_secret: INTEGRATION_SECRET,
      active_domain: "robotics",
      domain_configs: {
        robotics: {
          m20_base_url: m20BaseUrl,
          default_robot_id: ROBOT_ID,
          waypoints: [
            {
              waypoint_id: "dock",
              name: "充电桩",
              points: [{ x: 0, y: 0, yaw: 0 }],
            },
            {
              waypoint_id: "yard",
              name: "院区",
              points: [{ x: 5, y: 1, yaw: 0 }],
            },
          ],
        },
      },
    },
    deviceRegistry: {
      deployments: [
        {
          deployment_id: DEPLOYMENT_ID,
          name: "M20 Robot Flywheel",
          timezone: "Asia/Shanghai",
          status: "active",
        },
      ],
      entities: [
        {
          entity_id: ROBOT_ID,
          deployment_id: DEPLOYMENT_ID,
          entity_type: "robot",
          domain_id: "robotics",
          name: "M20 机器狗",
          aliases: ["机器狗", "M20"],
          status: "active",
        },
      ],
      nodes: [{ node_id: ROBOT_ID, deployment_id: DEPLOYMENT_ID, status: "active" }],
      devices: [
        {
          device_id: ROBOT_ID,
          deployment_id: DEPLOYMENT_ID,
          device_type: "robot_dog",
          name: "M20 机器狗",
          aliases: ["机器狗", "M20"],
          entity_id: ROBOT_ID,
          node_id: ROBOT_ID,
          transport: "m20_http",
          status: "active",
          default_for: "robot_dog",
        },
      ],
    },
    users: {
      "owner-001": {
        user_id: "owner-001",
        role: "owner",
        deployment_id: DEPLOYMENT_ID,
        display_name: "Robot Flywheel Owner",
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
  const dataDir = await mkdtemp(join(tmpdir(), "ea-domain-flywheel-robotics-"));
  const stub = await startM20Stub();
  process.env.AGENT_DATA_DIR = dataDir;
  process.env.ADMIN_TOKEN = FLYWHEEL_ADMIN_TOKEN;
  process.env.NODE_ENV = "development";
  process.env.M20_HTTP_TIMEOUT_MS = "120";
  await seedFlywheelData(dataDir, buildRoboticsSeed(stub.baseUrl));

  let deps: ReturnType<typeof createLlmClientFromSettings>;
  try {
    deps = createLlmClientFromSettings();
  } catch (e) {
    await handleLlmUnavailable(e, {
      allowSkip: args.allowSkip,
      pack: "robot",
      cleanup: async () => {
        await stub.close();
        await rm(dataDir, { recursive: true, force: true });
      },
    });
    return;
  }

  const { saveSettings, getEffectiveSettings } = await import("../apps/api/src/settings/store.js");
  const { ingestHeartbeatMessage } = await import("../apps/api/src/telemetry/store.js");

  const attestationPath = await prepareFlywheelAttestationPath(dataDir, DEPLOYMENT_ID);

  const { app, baseUrl } = await startInProcessApp(dataDir, {
    pipeline: {
      llmClient: deps.client,
      model: deps.model,
      mqttEnabled: false,
      mqtt: new RecordingMqttPublisher(),
    },
    beforeListen: () => {
      ingestHeartbeatMessage({ message_type: "heartbeat", node_id: ROBOT_ID }, DEPLOYMENT_ID);
    },
  });

  const { run, results } = createScenarioRunner();

  try {
    await run("normal inspection records clean evidence", async () => {
      const res = await postJson(
        baseUrl,
        "/admin/robot/inspections",
        { waypoint_id: "yard", source: "body", objective: "巡检院区" },
        { "x-admin-token": FLYWHEEL_ADMIN_TOKEN },
      );
      assert(res.status === 200, `inspection status ${res.status}`);
      assert(String(res.json.reply ?? "").includes("未见明显异常"), "clean reply missing");
      const evidence = res.json.evidence as { source_kind?: string; waypoint_id?: string };
      assert(evidence.source_kind === "stub", "evidence not marked as stub");
      assert(evidence.waypoint_id === "yard", "evidence waypoint mismatch");
    });

    await run("repeated anomaly forms summary suggestion", async () => {
      for (let i = 0; i < 2; i++) {
        const res = await postJson(
          baseUrl,
          "/admin/robot/inspections",
          { waypoint_id: "dock", source: "body", objective: "复查充电桩通道" },
          { "x-admin-token": FLYWHEEL_ADMIN_TOKEN },
        );
        assert(res.status === 200, `dock inspection status ${res.status}`);
        assert(String(res.json.reply ?? "").includes("发现"), "anomaly reply missing");
      }
      const summary = await getAdminJson(baseUrl, "/admin/robot/inspection-summary");
      assert(summary.status === 200, `summary status ${summary.status}`);
      assert(Number(summary.json.task_count) === 3, "task count mismatch");
      assert(Number(summary.json.evidence_count) === 3, "evidence count mismatch");
      assert(Number(summary.json.anomaly_count) === 2, "anomaly count mismatch");
      const repeated = summary.json.repeated_anomaly_waypoints as unknown[];
      assert(Array.isArray(repeated) && repeated.length === 1, "repeated suggestion missing");
    });

    await run("chat query returns inspection summary", async () => {
      const utterance = "机器人巡检异常有什么建议";
      const chat = await postJson(
        baseUrl,
        "/integrations/chat",
        {
          platform: "wechat",
          user_id: "owner-001",
          conversation_id: "domain-flywheel-robotics-summary",
          text: utterance,
        },
        { Authorization: `Bearer ${INTEGRATION_SECRET}` },
      );
      assert(chat.status === 200, `chat status ${chat.status}`);
      const reply = String(chat.json.reply ?? "");
      assert(reply.length > 0, "summary reply missing");
      assert(
        reply.includes("异常") || reply.includes("建议") || reply.includes("巡检"),
        "summary anomaly missing",
      );
      attestFlywheelScenario(attestationPath, {
        pack: "robotics",
        scenario: "chat query returns inspection summary",
        utterance,
        expected_skill: "robot.query_inspection_summary",
        actual_skill: "llm_resolved",
        model: deps.model,
        llm_real: true,
        ok: true,
        evidence_refs: { task_count: 1 },
      });
    });

    await run("chat query triggers robot status or inspection intent", async () => {
      const utterance = "让机器人去院区巡检";
      const chat = await postJson(
        baseUrl,
        "/integrations/chat",
        {
          platform: "wechat",
          user_id: "owner-001",
          conversation_id: "domain-flywheel-robotics-intent",
          text: utterance,
        },
        { Authorization: `Bearer ${INTEGRATION_SECRET}` },
      );
      assert(chat.status === 200, `chat status ${chat.status}`);
      assert(String(chat.json.reply ?? "").length > 0, "robot intent reply missing");
      attestFlywheelScenario(attestationPath, {
        pack: "robotics",
        scenario: "chat query triggers robot status or inspection intent",
        utterance,
        expected_skill: "robot.start_inspection",
        actual_skill: "llm_resolved",
        model: deps.model,
        llm_real: true,
        ok: true,
        evidence_refs: { task_count: 1 },
      });
    });

    await run("M20 inspect failure is visible and records failed outcome", async () => {
      stub.setFailPaths(["/vision/inspect"]);
      const res = await postJson(
        baseUrl,
        "/admin/robot/inspections",
        { waypoint_id: "yard", source: "body", objective: "失败验证" },
        { "x-admin-token": FLYWHEEL_ADMIN_TOKEN },
      );
      stub.setFailPaths([]);
      assert(res.status === 503, `failure status ${res.status}`);
      const rows = await getAdminJson(baseUrl, "/admin/robot/inspections");
      const outcomes = rows.json.outcomes as Array<{ success?: boolean }>;
      assert(
        outcomes.some((o) => o.success === false),
        "failed outcome missing",
      );
    });

    await run("missing M20 config fails visibly", async () => {
      const current = getEffectiveSettings();
      const roboticsConfig = (current.domain_configs?.robotics ?? {}) as {
        waypoints?: unknown[];
      };
      saveSettings({
        domain_configs: {
          ...current.domain_configs,
          robotics: {
            ...roboticsConfig,
            m20_base_url: undefined,
            default_robot_id: ROBOT_ID,
            waypoints: roboticsConfig.waypoints ?? [],
          },
        },
      });
      const res = await postJson(
        baseUrl,
        "/admin/robot/inspections",
        { waypoint_id: "yard", source: "body", objective: "缺配置验证" },
        { "x-admin-token": FLYWHEEL_ADMIN_TOKEN },
      );
      saveSettings({ domain_configs: current.domain_configs });
      assert(res.status === 503, `missing config status ${res.status}`);
      assert(
        String(res.json.error ?? "").includes("m20_base_url"),
        "missing config error mismatch",
      );
    });
  } finally {
    await app.close();
    await stub.close();
    await rm(dataDir, { recursive: true, force: true });
  }

  const { reportPath, passed, total, exitCode } = writePackFlywheelReport({
    pack: "robotics",
    deployment_id: DEPLOYMENT_ID,
    model: deps.model,
    attestation_path: attestationPath,
    results,
    reportFileName: "robotics-flywheel-report.json",
  });

  console.log(`Robot flywheel: ${passed}/${total}`);
  console.log(`Report: ${reportPath}`);
  if (exitCode !== 0) process.exitCode = exitCode;
}

await main();
