import type { FastifyInstance } from "fastify";
import { toPublicSettings, getEffectiveSettings } from "../../settings/store.js";
import { requireAdmin } from "../admin-auth.js";
import { listPublicAdminTokens } from "../../settings/admin-tokens.js";
import { registerSettingsTokenRoutes } from "./settings-tokens.js";
import { registerSettingsPutRoute } from "./settings-put.js";
import { registerSettingsMiscRoutes } from "./settings-misc.js";

export function registerAdminSettingsRoutes(app: FastifyInstance): void {
  app.get("/admin/settings", async (request, reply) => {
    if (!requireAdmin(request)) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    return {
      ...toPublicSettings(getEffectiveSettings()),
      admin_tokens: listPublicAdminTokens(),
    };
  });

  registerSettingsTokenRoutes(app);
  registerSettingsPutRoute(app);
  registerSettingsMiscRoutes(app);
}
