import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IntentPayload } from "@embodied-agent/core";
import type { LlmClient } from "@embodied-agent/agent";
import { startM20Stub } from "./m20-stub.js";
import { writeLocalEvalReport } from "./lib/eval-report-output.js";

const ADMIN_TOKEN = "dev-admin";
const INTEGRATION_SECRET = "robot-matrix-secret";
const DEPLOYMENT_ID = "dep-robot-matrix";
const ROBOT_ID = "m20-001";

type ScenarioResult = {
  name: string;
  ok: boolean;
  detail?: string;
  command_id?: string;
  status?: string;
};

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function scriptedLlm(): LlmClient {
  return {
    async completeJson(_system, user) {
      if (user.includes("向前") || user.includes("挪") || user.includes("移动")) {
        return JSON.stringify({
          skill: "robot.move",
          target: {},
          parameters: { x: 0.2, duration_ms: 1000 },
        });
      }
      if (user.includes("站")) {
        return JSON.stringify({ skill: "robot.stand_up", target: {}, parameters: {} });
      }
      if (user.includes("导航") || user.includes("dock") || user.includes("充电")) {
        return JSON.stringify({
          skill: "robot.navigate_to_waypoint",
          target: {},
          parameters: { waypoint_id: "dock" },
        });
      }
      if (user.includes("拍") || user.includes("照片") || user.includes("图")) {
        return JSON.stringify({
          skill: "robot.capture_image",
          target: {},
          parameters: { source: "body" },
        });
      }
      return JSON.stringify({ skill: "robot.query_status", target: {}, parameters: {} });
    },
    async completeText(_system, user) {
      return user;
    },
  };
}

async function seedData(dir: string, m20BaseUrl: string): Promise<void> {
  await writeFile(
    join(dir, "settings.json"),
    JSON.stringify(
      {
        deployment_id: DEPLOYMENT_ID,
        deployment_name: "M20 Robot Matrix",
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
                waypoint_id: "gate",
                name: "门口通道",
                points: [{ x: 2, y: 1, yaw: 0 }],
              },
            ],
          },
        },
      },
      null,
      2,
    ),
  );
  await writeFile(
    join(dir, "device-registry.json"),
    JSON.stringify(
      {
        deployments: [
          {
            deployment_id: DEPLOYMENT_ID,
            name: "M20 Robot Matrix",
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
      null,
      2,
    ),
  );
  await writeFile(
    join(dir, "users.json"),
    JSON.stringify(
      {
        "owner-001": {
          user_id: "owner-001",
          role: "owner",
          deployment_id: DEPLOYMENT_ID,
          display_name: "Robot Matrix Owner",
        },
      },
      null,
      2,
    ),
  );
  await writeFile(
    join(dir, "platform-bindings.json"),
    JSON.stringify(
      {
        bindings: [
          {
            platform: "wechat",
            platform_user_id: "owner-001",
            principal_user_id: "owner-001",
            bound_at: new Date().toISOString(),
          },
        ],
      },
      null,
      2,
    ),
  );
}

async function postJson(
  baseUrl: string,
  path: string,
  body: unknown,
  opts: { admin?: boolean; integration?: boolean } = {},
) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(opts.admin ? { "x-admin-token": ADMIN_TOKEN } : {}),
      ...(opts.integration ? { Authorization: `Bearer ${INTEGRATION_SECRET}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, json };
}

async function getJson(baseUrl: string, path: string) {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { "x-admin-token": ADMIN_TOKEN },
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, json };
}

async function postAdminIntent(baseUrl: string, intent: IntentPayload, confirmed = false) {
  return postJson(
    baseUrl,
    "/admin/robot/intents",
    { intent, ...(confirmed ? { confirmed: true } : {}) },
    { admin: true },
  );
}

function latestCommand(
  rows: ReturnType<typeof import("../apps/api/src/commands/store.js").listCommands>,
  action: string,
  afterCount: number,
) {
  return rows
    .slice(afterCount)
    .filter((r) => r.command.action === action)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
}

async function main(): Promise<void> {
  const results: ScenarioResult[] = [];
  const dataDir = await mkdtemp(join(tmpdir(), "ea-robot-matrix-"));
  const stub = await startM20Stub();
  process.env.AGENT_DATA_DIR = dataDir;
  process.env.ADMIN_TOKEN = ADMIN_TOKEN;
  process.env.NODE_ENV = "development";
  process.env.M20_HTTP_TIMEOUT_MS = "80";
  await seedData(dataDir, stub.baseUrl);

  const { initRuntime } = await import("../apps/api/src/runtime/init.js");
  const { buildApp } = await import("../apps/api/src/app.js");
  const { listCommands } = await import("../apps/api/src/commands/store.js");
  const { saveSettings, getEffectiveSettings } = await import("../apps/api/src/settings/store.js");
  const { ingestHeartbeatMessage } = await import("../apps/api/src/telemetry/store.js");
  const { readOutcomeSchedulerPendingForTest } =
    await import("../apps/api/src/scene/outcome-scheduler.js");

  await initRuntime();
  ingestHeartbeatMessage({ message_type: "heartbeat", node_id: ROBOT_ID }, DEPLOYMENT_ID);
  const app = await buildApp({
    pipeline: {
      llmClient: scriptedLlm(),
      model: "robot-matrix-scripted",
      mqttEnabled: false,
    },
  });
  await app.listen({ host: "127.0.0.1", port: 0 });
  const address = app.server.address();
  assert(address && typeof address !== "string", "api listen failed");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  async function run(name: string, fn: () => Promise<ScenarioResult | void>): Promise<void> {
    try {
      const result = await fn();
      results.push({ name, ok: true, ...result });
      console.log(`PASS ${name}`);
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      results.push({ name, ok: false, detail });
      console.error(`FAIL ${name}: ${detail}`);
    }
  }

  try {
    await run("overview reads M20 status", async () => {
      const overview = await getJson(baseUrl, "/admin/robot/overview");
      assert(overview.status === 200, `overview status ${overview.status}`);
      assert(
        (overview.json.m20 as { ok?: boolean }).ok === true,
        `m20 overview not ok: ${JSON.stringify(overview.json)}`,
      );
    });

    await run("chat query_status uses integration pipeline", async () => {
      stub.clearRequests();
      const chat = await postJson(
        baseUrl,
        "/integrations/chat",
        {
          platform: "wechat",
          user_id: "owner-001",
          conversation_id: "robot-matrix-query",
          text: "看一下机器狗状态",
        },
        { integration: true },
      );
      assert(chat.status === 200, `chat status ${chat.status}`);
      assert(String(chat.json.reply ?? "").includes("M20"), "query reply missing M20");
      const paths = stub.requests().map((r) => r.path);
      assert(paths.includes("/body/status"), "M20 status endpoint not called");
      assert(paths.includes("/body/sensors"), "M20 sensors endpoint not called");
      assert(paths.includes("/body/obstacle"), "M20 obstacle endpoint not called");
    });

    await run("chat move requires pending confirm then completes", async () => {
      stub.clearRequests();
      const before = listCommands(DEPLOYMENT_ID).length;
      const pending = await postJson(
        baseUrl,
        "/integrations/chat",
        {
          platform: "wechat",
          user_id: "owner-001",
          conversation_id: "robot-matrix-move",
          text: "向前走 1 秒",
        },
        { integration: true },
      );
      assert(pending.status === 200, `pending status ${pending.status}`);
      assert(String(pending.json.reply ?? "").includes("确认"), "move did not ask confirmation");
      assert(listCommands(DEPLOYMENT_ID).length === before, "command created before confirmation");

      const confirmed = await postJson(
        baseUrl,
        "/integrations/chat",
        {
          platform: "wechat",
          user_id: "owner-001",
          conversation_id: "robot-matrix-move",
          text: "确认",
        },
        { integration: true },
      );
      assert(confirmed.status === 200, `confirmed status ${confirmed.status}`);
      const cmd = latestCommand(listCommands(DEPLOYMENT_ID), "move", before);
      assert(cmd, "confirmed move command not found");
      assert(cmd.status === "completed", `move command status ${cmd.status}`);
      assert(cmd.user_confirmed === true, "move command missing user_confirmed");
      assert(
        stub.requests().some((r) => r.path === "/body/move"),
        "M20 move endpoint not called",
      );
      return { command_id: cmd.command_id, status: cmd.status };
    });

    await run("low-risk stand_up completes command lifecycle", async () => {
      stub.clearRequests();
      const before = listCommands(DEPLOYMENT_ID).length;
      const res = await postAdminIntent(
        baseUrl,
        { skill: "robot.stand_up", target: {}, parameters: {} } as IntentPayload,
        false,
      );
      assert(res.status === 200, `stand_up status ${res.status}`);
      const cmd = latestCommand(listCommands(DEPLOYMENT_ID), "stand_up", before);
      assert(cmd, "stand_up command not found");
      assert(cmd.status === "completed", `stand_up command status ${cmd.status}`);
      assert(
        readOutcomeSchedulerPendingForTest(DEPLOYMENT_ID).some(
          (row) => row.command_id === cmd.command_id && row.entity_id === ROBOT_ID,
        ),
        "stand_up outcome window missing entity binding",
      );
      assert(
        stub.requests().some((r) => r.path === "/body/motion-state"),
        "M20 stand endpoint not called",
      );
      return { command_id: cmd.command_id, status: cmd.status };
    });

    await run("high-risk navigation requires confirmation", async () => {
      const unconfirmed = await postAdminIntent(baseUrl, {
        skill: "robot.navigate_to_waypoint",
        target: {},
        parameters: { waypoint_id: "dock" },
      } as IntentPayload);
      assert(unconfirmed.status === 409, `navigation unconfirmed status ${unconfirmed.status}`);
      stub.clearRequests();
      const before = listCommands(DEPLOYMENT_ID).length;
      const confirmed = await postAdminIntent(
        baseUrl,
        {
          skill: "robot.navigate_to_waypoint",
          target: {},
          parameters: { waypoint_id: "dock" },
        } as IntentPayload,
        true,
      );
      assert(confirmed.status === 200, `navigation confirmed status ${confirmed.status}`);
      const cmd = latestCommand(listCommands(DEPLOYMENT_ID), "navigate_to_waypoint", before);
      assert(cmd, "navigation command not found");
      assert(cmd.status === "completed", `navigation command status ${cmd.status}`);
      assert(cmd.user_confirmed === true, "navigation command missing user_confirmed");
      assert(
        stub.requests().some((r) => r.path === "/body/nav/start"),
        "M20 nav endpoint not called",
      );
      return { command_id: cmd.command_id, status: cmd.status };
    });

    await run("unknown waypoint fails visibly", async () => {
      const before = listCommands(DEPLOYMENT_ID).length;
      const res = await postAdminIntent(
        baseUrl,
        {
          skill: "robot.navigate_to_waypoint",
          target: {},
          parameters: { waypoint_id: "unknown" },
        } as IntentPayload,
        true,
      );
      assert(res.status === 503, `unknown waypoint status ${res.status}`);
      const cmd = latestCommand(listCommands(DEPLOYMENT_ID), "navigate_to_waypoint", before);
      assert(cmd, "unknown waypoint command not found");
      assert(cmd.status === "failed", `unknown waypoint command status ${cmd.status}`);
      return { command_id: cmd.command_id, status: cmd.status };
    });

    await run("endpoint failure marks command failed", async () => {
      stub.setFailPaths(["/body/move"]);
      const before = listCommands(DEPLOYMENT_ID).length;
      const res = await postAdminIntent(
        baseUrl,
        {
          skill: "robot.move",
          target: {},
          parameters: { x: 0.2, duration_ms: 1000 },
        } as IntentPayload,
        true,
      );
      stub.setFailPaths([]);
      assert(res.status === 503, `endpoint failure status ${res.status}`);
      const cmd = latestCommand(listCommands(DEPLOYMENT_ID), "move", before);
      assert(cmd, "failed move command not found");
      assert(cmd.status === "failed", `failed move command status ${cmd.status}`);
      assert(cmd.error?.code === "m20_http_failed", `unexpected error code ${cmd.error?.code}`);
      return { command_id: cmd.command_id, status: cmd.status };
    });

    await run("timeout marks command failed", async () => {
      stub.setDelayMs(140);
      const before = listCommands(DEPLOYMENT_ID).length;
      const res = await postAdminIntent(baseUrl, {
        skill: "robot.sit_down",
        target: {},
        parameters: {},
      } as IntentPayload);
      stub.setDelayMs(0);
      assert(res.status === 503, `timeout status ${res.status}`);
      const cmd = latestCommand(listCommands(DEPLOYMENT_ID), "sit_down", before);
      assert(cmd, "timeout command not found");
      assert(cmd.status === "failed", `timeout command status ${cmd.status}`);
      assert(cmd.error?.message.includes("超时"), `timeout error missing: ${cmd.error?.message}`);
      return { command_id: cmd.command_id, status: cmd.status };
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
      const before = listCommands(DEPLOYMENT_ID).length;
      const res = await postAdminIntent(baseUrl, {
        skill: "robot.stand_up",
        target: {},
        parameters: {},
      } as IntentPayload);
      saveSettings({ domain_configs: current.domain_configs });
      assert(res.status === 503, `missing config status ${res.status}`);
      const cmd = latestCommand(listCommands(DEPLOYMENT_ID), "stand_up", before);
      assert(cmd, "missing config command not found");
      assert(cmd.status === "failed", `missing config command status ${cmd.status}`);
      assert(
        cmd.error?.message.includes("m20_base_url"),
        `missing config error: ${cmd.error?.message}`,
      );
      return { command_id: cmd.command_id, status: cmd.status };
    });
  } finally {
    await app.close();
    await stub.close();
    await rm(dataDir, { recursive: true, force: true });
  }

  const passed = results.filter((r) => r.ok).length;
  const report = {
    at: new Date().toISOString(),
    pack: "robotics",
    deployment_id: DEPLOYMENT_ID,
    total: results.length,
    passed,
    failed: results.length - passed,
    results,
  };
  const reportPath = writeLocalEvalReport(
    "robotics-execution-matrix-report.json",
    `${JSON.stringify(report, null, 2)}\n`,
  );

  console.log(`Robot execution matrix: ${passed}/${results.length}`);
  console.log(`Report: ${reportPath}`);
  if (passed !== results.length) {
    process.exitCode = 1;
  }
}

await main();
