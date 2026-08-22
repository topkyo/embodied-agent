#!/usr/bin/env tsx
/**
 * Domain L3 场景技能层冒烟：registry、outcome 评分、admin 形状（可选连运行中 API）。
 *
 * 用法：
 *   AGENT_DATA_DIR=$(mktemp -d) npx tsx scripts/scene-l3-smoke.ts
 *   AGENT_DATA_DIR=.agentstack/dev-profiles/greenhouse/data npx tsx scripts/scene-l3-smoke.ts --api
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { preloadDomainPacks } from "../apps/api/src/domain-packs/loader.js";
import { createAndSetPlatformRuntimeContext } from "../apps/api/src/runtime/context.js";
import { configureDomainPackLoader } from "../apps/api/src/domain-packs/loader.js";
import { getSceneSkillIds, resolveSceneForTrigger } from "../apps/api/src/scene/registry.js";
import {
  clearSceneOutcomesForTest,
  listSceneOutcomes,
} from "../apps/api/src/scene/outcome-store.js";
import { evaluateSceneOutcomeFromCommand } from "../apps/api/src/scene/evaluate-outcome.js";
import { riskLevelForScene } from "../apps/api/src/scene/risk-level.js";
import { buildPilotRoiSummary } from "../apps/api/src/scene/roi-report.js";
import type { CommandRecord } from "../apps/api/src/commands/types.js";

const API = (process.env.API_URL ?? "http://127.0.0.1:3001").replace(/\/$/, "");
const WITH_API = process.argv.includes("--api");

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

function mockCompletedRecord(): CommandRecord {
  const now = new Date().toISOString();
  return {
    command_id: "cmd-smoke-1",
    status: "completed",
    created_at: now,
    updated_at: now,
    scene_skill_id: "night_ventilation_control",
    user_confirmed: true,
    command: {
      message_type: "command",
      protocol_version: "0.1",
      command_id: "cmd-smoke-1",
      idempotency_key: "smoke",
      deployment_id: "dep-gh-pilot-001",
      node_id: "node-sim-gh-001",
      device_id: "vent-sim-gh-001",
      device_type: "vent_motor",
      action: "open",
      parameters: { duration_seconds: 600 },
      issued_by: {
        user_id: "owner-001",
        role: "owner",
        platform: "wechat",
        conversation_id: "wx-smoke",
      },
      created_at: now,
      expires_at: now,
    },
    telemetry_flywheel: {
      before: {
        entity_id: "gh-001",
        temperature_c: 32,
        humidity_percent: 78,
        captured_at: now,
      },
      after: {
        entity_id: "gh-001",
        temperature_c: 30.5,
        humidity_percent: 72,
        captured_at: now,
      },
    },
  };
}

async function main() {
  if (!process.env.AGENT_DATA_DIR) {
    process.env.AGENT_DATA_DIR = mkdtempSync(join(tmpdir(), "scene-l3-smoke-"));
    process.env.DEPLOYMENT_ID = "dep-gh-pilot-001";
    process.env.ACTIVE_DOMAIN = "agriculture";
  }
  console.log("AGENT_DATA_DIR=", process.env.AGENT_DATA_DIR);

  const ctx = createAndSetPlatformRuntimeContext();
  configureDomainPackLoader(ctx.loader, {}, ctx.services);
  await preloadDomainPacks(ctx.loader);
  assert(getSceneSkillIds().length === 8, "8 scene skills registered");
  assert(
    resolveSceneForTrigger({ type: "sustained_temp_l2" }) === "night_ventilation_control",
    "sustained L2 maps to night ventilation",
  );

  clearSceneOutcomesForTest("dep-gh-pilot-001");
  const row = evaluateSceneOutcomeFromCommand(mockCompletedRecord());
  assert(row?.success === true, "outcome success when delta temp < -0.5");
  assert(row?.entity_id === "gh-001", "outcome stores platform entity_id");
  assert(
    typeof row?.metrics.temperature_delta_c === "number" &&
      Math.abs(row.metrics.temperature_delta_c + 1.5) < 0.001,
    "outcome stores temperature delta in metrics",
  );
  assert(listSceneOutcomes("dep-gh-pilot-001").length === 1, "outcome persisted");
  assert(riskLevelForScene(ctx, "high_temp_emergency_response") === "L2", "risk level");
  const roi = buildPilotRoiSummary("dep-gh-pilot-001", 7);
  assert(roi.scene_total === 1, "roi reads outcomes");

  if (WITH_API) {
    const res = await fetch(`${API}/admin/scene-outcomes`, {
      headers: { "x-admin-token": process.env.ADMIN_TOKEN ?? "dev-admin" },
    });
    assert(res.ok, `GET /admin/scene-outcomes status ${res.status}`);
    const body = (await res.json()) as { outcomes?: unknown[] };
    assert(Array.isArray(body.outcomes), "admin outcomes array");
    console.log("[smoke] API outcomes count:", body.outcomes?.length ?? 0);
  }

  console.log("::DOMAIN_L3_SMOKE_PASSED::");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
