import type { FastifyInstance } from "fastify";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { buildDigestMessage, type DigestSlot } from "../digest/builder.js";
import {
  clearWeatherProactiveKeysForTests,
  evaluateWeatherProactivePush,
} from "../weather/proactive-push.js";
import { sendDigestSlotForced } from "../digest/flywheel-dev.js";
import { isFlywheelDevBypass } from "../wechat/outbound.js";
import { evaluateSustainedAlerts } from "../alerts/sustained-push.js";
import { assessFlywheelReady } from "./flywheel-ready.js";
import {
  clearAllPendingConfirm,
  clearPendingConfirm,
  listPendingConfirmsForUser,
  reloadPendingConfirmFromFile,
} from "../policy/pending-confirm.js";
import { atomicWriteJson } from "@embodied-agent/platform";
import { currentDeploymentId, deploymentScopedPath } from "../fs/deployment-path.js";
import { getEffectiveSettings } from "../settings/store.js";
import { clearCommandHooksFlywheelDedup } from "../scene/command-hooks.js";

function devFlywheelEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.ENABLE_DEV_CHAT === "1";
}

function requireFlywheelDev(reply: {
  status: (code: number) => { send: (body: unknown) => unknown };
}): boolean {
  if (!isFlywheelDevBypass()) {
    reply.status(400).send({
      error: "FLYWHEEL_DEV=1 required on API process (non-production only)",
    });
    return false;
  }
  return true;
}

export async function registerDevFlywheelRoutes(app: FastifyInstance): Promise<void> {
  app.post("/dev/flywheel/reset-state", async (_request, reply) => {
    if (!devFlywheelEnabled()) return reply.status(404).send({ error: "not_found" });
    if (!requireFlywheelDev(reply)) return;
    const deployment_id = getEffectiveSettings().deployment_id ?? currentDeploymentId();
    clearCommandHooksFlywheelDedup();
    clearAllPendingConfirm();
    atomicWriteJson(deploymentScopedPath("alert-rules.json", deployment_id), { rules: [] });
    atomicWriteJson(deploymentScopedPath("sustained-anomaly-state.json", deployment_id), {
      episodes: {},
    });
    const cooldownPath = deploymentScopedPath("alert-cooldown.json", deployment_id);
    if (existsSync(cooldownPath)) {
      try {
        const raw = JSON.parse(readFileSync(cooldownPath, "utf8")) as {
          last_fired?: Record<string, string>;
        };
        const last = raw.last_fired ?? {};
        for (const key of Object.keys(last)) {
          if (
            key.startsWith("sustained-l1:") ||
            key.startsWith("sustained-l2:") ||
            key.startsWith("sustained-humidity-l2:")
          ) {
            delete last[key];
          }
        }
        writeFileSync(cooldownPath, `${JSON.stringify({ last_fired: last }, null, 2)}\n`);
      } catch {
        atomicWriteJson(cooldownPath, { last_fired: {} });
      }
    }
    return { ok: true, deployment_id };
  });

  app.get<{ Querystring: { user_id?: string } }>(
    "/dev/flywheel/pending",
    async (request, reply) => {
      if (!devFlywheelEnabled()) return reply.status(404).send({ error: "not_found" });
      if (!requireFlywheelDev(reply)) return;
      const user_id = request.query.user_id?.trim();
      if (!user_id) {
        return reply.status(400).send({ error: "user_id required" });
      }
      reloadPendingConfirmFromFile();
      return { rows: listPendingConfirmsForUser(user_id) };
    },
  );

  app.post<{
    Body: {
      user_id: string;
      conversation_id: string;
      scene_skill_id: string;
    };
  }>("/dev/flywheel/clear-pending", async (request, reply) => {
    if (!devFlywheelEnabled()) return reply.status(404).send({ error: "not_found" });
    if (!requireFlywheelDev(reply)) return;
    const { user_id, conversation_id, scene_skill_id } = request.body ?? {};
    if (!user_id || !conversation_id || !scene_skill_id) {
      return reply.status(400).send({
        error: "user_id, conversation_id, scene_skill_id required",
      });
    }
    reloadPendingConfirmFromFile();
    clearPendingConfirm(user_id, conversation_id, scene_skill_id);
    return { ok: true };
  });

  app.post("/dev/flywheel/tick-sustained", async (_request, reply) => {
    if (!devFlywheelEnabled()) return reply.status(404).send({ error: "not_found" });
    if (!requireFlywheelDev(reply)) return;
    const result = await evaluateSustainedAlerts();
    return { ok: true, ...result };
  });

  app.get("/dev/flywheel/ready", async (_request, reply) => {
    if (!devFlywheelEnabled()) return reply.status(404).send({ error: "not_found" });
    if (!requireFlywheelDev(reply)) return;
    const status = await assessFlywheelReady();
    return {
      ...status,
      flywheel_dev: isFlywheelDevBypass(),
    };
  });

  app.get<{ Querystring: { slot?: string } }>(
    "/dev/flywheel/digest-preview",
    async (request, reply) => {
      if (!devFlywheelEnabled()) return reply.status(404).send({ error: "not_found" });
      if (!requireFlywheelDev(reply)) return;
      const slot = (request.query.slot === "evening" ? "evening" : "morning") as DigestSlot;
      const { getEffectiveSettings } = await import("../settings/store.js");
      const s = getEffectiveSettings();
      const text = buildDigestMessage(slot, s.deployment_name, s.deployment_id);
      return { slot, text };
    },
  );

  app.post<{
    Body: { force_cold?: boolean; force_heat?: boolean };
  }>("/dev/flywheel/weather-proactive", async (request, reply) => {
    if (!devFlywheelEnabled()) return reply.status(404).send({ error: "not_found" });
    if (!requireFlywheelDev(reply)) return;
    const result = await evaluateWeatherProactivePush({
      forceCold: request.body?.force_cold === true,
      forceHeat: request.body?.force_heat === true,
    });
    return { ok: true, ...result };
  });

  app.post("/dev/flywheel/weather-proactive/reset-dedup", async (_request, reply) => {
    if (!devFlywheelEnabled()) return reply.status(404).send({ error: "not_found" });
    if (!requireFlywheelDev(reply)) return;
    clearWeatherProactiveKeysForTests();
    return { ok: true };
  });

  app.post<{ Body: { slot?: string } }>("/dev/flywheel/digest-send", async (request, reply) => {
    if (!devFlywheelEnabled()) return reply.status(404).send({ error: "not_found" });
    if (!requireFlywheelDev(reply)) return;
    const slot = (request.body?.slot === "evening" ? "evening" : "morning") as DigestSlot;
    await sendDigestSlotForced(slot);
    const { getEffectiveSettings } = await import("../settings/store.js");
    const s = getEffectiveSettings();
    const text = buildDigestMessage(slot, s.deployment_name, s.deployment_id);
    return { ok: true, slot, text };
  });
}
