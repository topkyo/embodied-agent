import type { FastifyInstance } from "fastify";
import { registerAdminAuditHook } from "../../admin/audit.js";
import { registerAdminOverviewRoutes } from "../admin-overview.js";
import { registerAdminSettingsRoutes } from "./settings.js";
import { registerAdminOperationsRoutes } from "./operations.js";
import { registerAdminRegistryRoutes } from "./registry.js";
import { registerAdminBindingsRoutes } from "./bindings.js";
import { registerAdminNodesRoutes } from "./nodes.js";
import { registerAdminSceneRoutes } from "./scene.js";
import { registerAdminUsersRoutes } from "./users.js";
import { registerAdminDomainPacksRoutes } from "./domain-packs.js";
import { registerAdminDomainIntentRoutes } from "./domain-intents.js";
import { registerAdminFlywheelRoutes } from "./flywheel.js";
import { registerDomainPackAdminExtensionRoutes } from "../../domain-packs/admin-extensions.js";

export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  registerAdminAuditHook(app);
  registerAdminSettingsRoutes(app);
  registerAdminOperationsRoutes(app);
  registerAdminRegistryRoutes(app);
  registerAdminBindingsRoutes(app);
  registerAdminNodesRoutes(app);
  registerAdminSceneRoutes(app);
  registerAdminUsersRoutes(app);
  registerAdminDomainPacksRoutes(app);
  registerAdminDomainIntentRoutes(app);
  registerAdminFlywheelRoutes(app);
  await registerDomainPackAdminExtensionRoutes(app);
  await registerAdminOverviewRoutes(app);
}
