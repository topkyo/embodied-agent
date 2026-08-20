import { getPlatformRuntimeContext } from "../../runtime/context.js";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { preloadDomainPacks } from "../../domain-packs/loader.js";
import { allocateAgentDataDir, releaseAgentDataDir } from "../../test/isolated-data-dir.js";
import { saveSettings } from "../../settings/store.js";
import { appendAlertEvent } from "../../alerts/alert-events.js";
import { setAlertRule } from "../../alerts/threshold-store.js";
import { createCommand } from "../../commands/store.js";
import { appendOperationLog } from "../../db/log.js";
import { upsertSchedule } from "../../report/schedule-store.js";
import { seedCanonicalSimRegistry } from "../../test/registry-fixture.js";
import { resetTelemetryCacheForTests, upsertTelemetry } from "../../telemetry/store.js";
import { writeNdviCacheForTests } from "../../integrations/satellite/ndvi.js";
import { executeSkill } from "./index.js";

let testDir: string;
let server: ReturnType<typeof createServer> | undefined;
const requests: Array<{ method: string; path: string }> = [];

async function startM20Stub(): Promise<string> {
  requests.length = 0;
  server = createServer((req: IncomingMessage, res: ServerResponse) => {
    requests.push({ method: req.method ?? "GET", path: req.url ?? "/" });
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ code: 0, success: true, data: { ok: true } }));
  });
  await new Promise<void>((resolve, reject) => {
    server?.once("error", reject);
    server?.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("M20 stub listen failed");
  return `http://127.0.0.1:${address.port}`;
}

async function stopM20Stub(): Promise<void> {
  const current = server;
  server = undefined;
  if (!current) return;
  await new Promise<void>((resolve, reject) => {
    current.close((err) => (err ? reject(err) : resolve()));
  });
}

describe("executeSkill domain pack handlers", () => {
  beforeAll(async () => {
    await preloadDomainPacks(getPlatformRuntimeContext().loader, { packIds: ["robotics"] });
  });

  beforeEach(() => {
    testDir = allocateAgentDataDir("domain-pack-handler");
    resetTelemetryCacheForTests();
  });

  afterEach(async () => {
    await stopM20Stub();
    resetTelemetryCacheForTests();
    releaseAgentDataDir(testDir);
  });

  it("delegates M20 query skills to the active robotics Domain Pack", async () => {
    const m20BaseUrl = await startM20Stub();
    process.env.ACTIVE_DOMAIN = "robotics";
    saveSettings({
      deployment_id: "dep-robot-pilot-001",
      active_domain: "robotics",
      domain_configs: {
        robotics: {
          m20_base_url: m20BaseUrl,
          default_robot_id: "m20-001",
        },
      },
    });

    const result = await executeSkill(
      {
        skill: "robot.query_status",
        target: {},
        parameters: {},
      },
      { user_id: "owner-001" },
    );

    expect(result.reply).toBe("M20 状态已读取。");
    expect(requests.map((r) => r.path).sort()).toEqual([
      "/body/obstacle",
      "/body/sensors",
      "/body/status",
    ]);
  });

  it("delegates robot inspection skills to the active robotics Domain Pack", async () => {
    const m20BaseUrl = await startM20Stub();
    process.env.ACTIVE_DOMAIN = "robotics";
    saveSettings({
      deployment_id: "dep-robot-pilot-001",
      active_domain: "robotics",
      domain_configs: {
        robotics: {
          m20_base_url: m20BaseUrl,
          default_robot_id: "m20-001",
          waypoints: [{ waypoint_id: "dock", points: [{ x: 0, y: 0 }] }],
        },
      },
    });

    const result = await executeSkill(
      {
        skill: "robot.start_inspection",
        target: {},
        parameters: { waypoint_id: "dock", source: "body" },
      },
      { user_id: "owner-001" },
    );

    expect(result.reply).toBe("巡检取证完成：dock 未见明显异常。");
    expect(requests.map((r) => r.path)).toContain("/vision/inspect");
    expect(result.params.task).toMatchObject({
      deployment_id: "dep-robot-pilot-001",
      robot_id: "m20-001",
      waypoint_id: "dock",
      status: "completed",
    });
  });

  it("delegates greenhouse query skills to the active agriculture Domain Pack", async () => {
    saveSettings({
      deployment_id: "dep-gh-pilot-001",
      active_domain: "agriculture",
    });
    upsertTelemetry([
      {
        entity_id: "gh-001",
        temperature_c: 27.5,
        humidity_percent: 72,
        vent_status: "closed",
        fan_status: "off",
      },
    ]);

    const result = await executeSkill(
      {
        skill: "greenhouse.query_status",
        target: { greenhouse_id: "gh-001" },
        parameters: {},
      },
      { user_id: "owner-001" },
    );

    expect(result.reply).toBe("gh-001 当前温度 27.5°C，湿度 72%，通风 closed，风机 off。");
    expect(result.params).toMatchObject({
      entity_id: "gh-001",
      temperature_c: 27.5,
      humidity_percent: 72,
    });
  });

  it("delegates greenhouse alert query skills to the active agriculture Domain Pack", async () => {
    saveSettings({
      deployment_id: "dep-gh-pilot-001",
      active_domain: "agriculture",
    });
    setAlertRule({
      entity_id: "gh-001",
      metric: "temperature_c",
      operator: ">",
      value: 28,
      updated_by: "owner-001",
    });

    const result = await executeSkill(
      {
        skill: "alert.query_threshold",
        target: { greenhouse_id: "gh-001" },
        parameters: {},
      },
      { user_id: "owner-001" },
    );

    expect(result.reply).toContain("当前报警阈值");
    expect(result.reply).toContain("28°C");
    expect(result.params).toMatchObject({
      entity_id: "gh-001",
      count: 1,
    });
  });

  it("delegates report schedule query skills to the active agriculture Domain Pack", async () => {
    saveSettings({
      deployment_id: "dep-gh-pilot-001",
      active_domain: "agriculture",
    });
    upsertSchedule({
      user_id: "owner-001",
      entity_ids: ["gh-001", "gh-002"],
      interval_minutes: 15,
    });

    const result = await executeSkill(
      {
        skill: "report.query_schedule",
        target: {},
        parameters: {},
      },
      { user_id: "owner-001" },
    );

    expect(result.reply).toBe("定时汇报：1号棚、2号棚 每 15 分钟推送温湿度。");
    expect(result.params.schedule).toMatchObject({
      deployment_id: "dep-gh-pilot-001",
      user_id: "owner-001",
      entity_ids: ["gh-001", "gh-002"],
      interval_minutes: 15,
    });
  });

  it("delegates irrigation status query skills to the active agriculture Domain Pack", async () => {
    saveSettings({
      deployment_id: "dep-gh-pilot-001",
      active_domain: "agriculture",
    });
    seedCanonicalSimRegistry();

    const result = await executeSkill(
      {
        skill: "irrigation.query_status",
        target: { zone_id: "zone-a" },
        parameters: {},
      },
      { user_id: "owner-001" },
    );

    expect(result.reply).toContain("A区");
    expect(result.reply).toContain("当前无灌溉记录");
    expect(result.params).toMatchObject({
      zone_id: "zone-a",
      count: 1,
      any_active: false,
    });
  });

  it("delegates greenhouse physical reply skills to the active agriculture Domain Pack", async () => {
    saveSettings({
      deployment_id: "dep-gh-pilot-001",
      active_domain: "agriculture",
    });

    const result = await executeSkill(
      {
        skill: "greenhouse.set_mode",
        target: { greenhouse_id: "gh-001" },
        parameters: { mode: "night_vent", temp_high_c: 30, temp_low_c: 28 },
      },
      { user_id: "owner-001" },
    );

    expect(result.reply).toBe(
      "已启用 gh-001 夜间通风：温度 ≥30°C 自动开帘、≤28°C 自动关帘（边缘网关本地执行）。",
    );
    expect(result.params).toMatchObject({
      entity_id: "gh-001",
      mode: "night_vent",
      temp_high_c: 30,
      temp_low_c: 28,
    });
  });

  it("delegates alert event history query skills to the active agriculture Domain Pack", async () => {
    saveSettings({
      deployment_id: "dep-gh-pilot-001",
      active_domain: "agriculture",
    });
    appendAlertEvent({
      deployment_id: "dep-gh-pilot-001",
      entity_id: "gh-001",
      event_type: "threshold",
      message: "gh-001 温度超过阈值",
    });

    const result = await executeSkill(
      {
        skill: "alert.query_today",
        target: { greenhouse_id: "gh-001" },
        parameters: {},
      },
      { user_id: "owner-001" },
    );

    expect(result.reply).toContain("今日报警（1 条）");
    expect(result.reply).toContain("温度超过阈值");
    expect(result.params).toMatchObject({ count: 1 });
  });

  it("delegates operation log query skills to the active agriculture Domain Pack", async () => {
    saveSettings({
      deployment_id: "dep-gh-pilot-001",
      active_domain: "agriculture",
    });
    appendOperationLog({
      user_id: "owner-001",
      skill: "greenhouse.open_vent",
      intent_source: "llm",
      model: "test",
      params: { entity_id: "gh-001" },
      result: "sent",
      message: "通风/设备指令已下发",
    });

    const result = await executeSkill(
      {
        skill: "log.query_today",
        target: { greenhouse_id: "gh-001" },
        parameters: {},
      },
      { user_id: "owner-001" },
    );

    expect(result.reply).toContain("owner-001 greenhouse.open_vent");
    expect(result.reply).toContain("sent");
    expect(result.params).toMatchObject({ count: 1 });
  });

  it("delegates command status query skills to the active agriculture Domain Pack", async () => {
    saveSettings({
      deployment_id: "dep-gh-pilot-001",
      active_domain: "agriculture",
    });
    seedCanonicalSimRegistry();
    const now = new Date().toISOString();
    createCommand({
      message_type: "command",
      protocol_version: "0.1",
      command_id: "cmd-gh-001-open",
      idempotency_key: "idem-gh-001-open",
      deployment_id: "dep-gh-pilot-001",
      entity_id: "gh-001",
      node_id: "node-sim-gh-001",
      device_id: "vent-sim-gh-001",
      device_type: "vent_motor",
      action: "open",
      parameters: { duration_seconds: 600 },
      issued_by: {
        user_id: "owner-001",
        role: "owner",
        platform: "test",
        conversation_id: "test-conv",
      },
      created_at: now,
      expires_at: new Date(Date.now() + 30_000).toISOString(),
    });

    const result = await executeSkill(
      {
        skill: "command.query_status",
        target: { greenhouse_id: "gh-001" },
        parameters: { action: "open_vent" },
      },
      { user_id: "owner-001" },
    );

    expect(result.reply).toContain("开侧帘");
    expect(result.params).toMatchObject({
      command_id: "cmd-gh-001-open",
      status: "created",
      action: "open",
    });
  });

  it("delegates greenhouse NDVI skills to the active agriculture Domain Pack", async () => {
    saveSettings({
      deployment_id: "dep-gh-pilot-001",
      active_domain: "agriculture",
      satellite_plots: [
        {
          plot_id: "plot-gh-001",
          entity_id: "gh-001",
          west: 120.1,
          south: 30.1,
          east: 120.2,
          north: 30.2,
        },
      ],
    });
    writeNdviCacheForTests({
      plot_id: "plot-gh-001",
      ndvi_mean: 0.66,
      observed_at: "2026-06-01T08:00:00.000Z",
      source: "test-cache",
    });

    const result = await executeSkill(
      {
        skill: "satellite.query_ndvi",
        target: { greenhouse_id: "gh-001" },
        parameters: {},
      },
      { user_id: "owner-001" },
    );

    expect(result.reply).toContain("plot-gh-001");
    expect(result.reply).toContain("0.66");
  });

  it("delegates greenhouse task skills to the active agriculture Domain Pack", async () => {
    saveSettings({
      deployment_id: "dep-gh-pilot-001",
      active_domain: "agriculture",
    });

    const created = await executeSkill(
      {
        skill: "tasks.create_task",
        target: {},
        parameters: {
          title: "下午巡棚",
          greenhouse_id: "gh-001",
          due_date: "2026-06-02",
        },
      },
      { user_id: "owner-001" },
    );
    expect(created.reply).toContain("已创建农事任务");
    expect(created.params.title).toBe("下午巡棚");

    const listed = await executeSkill(
      {
        skill: "tasks.query_task",
        target: {},
        parameters: { status: "pending" },
      },
      { user_id: "owner-001" },
    );
    expect(listed.reply).toContain("下午巡棚");
    expect(listed.params.count).toBe(1);
  });

  it("delegates greenhouse agronomy and policy skills to the active agriculture Domain Pack", async () => {
    saveSettings({
      deployment_id: "dep-gh-pilot-001",
      active_domain: "agriculture",
    });

    const pest = await executeSkill(
      {
        skill: "agronomy.query_pest",
        target: {},
        parameters: { query: "高湿霉病" },
      },
      { user_id: "owner-001" },
    );
    expect(pest.reply).toContain("1.");

    const policy = await executeSkill(
      {
        skill: "policy.apply_suggestion",
        target: {},
        parameters: {},
      },
      { user_id: "owner-001" },
    );
    expect(policy.reply).toContain("当前没有待采纳的策略建议");
  });
});
