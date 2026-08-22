import { assertDemoReadonlyEnv } from "../demo/readonly.js";
import { initStateBackend } from "../state/init-state.js";
import {
  requireExplicitActiveDomain,
  requireExplicitDeploymentId,
} from "../settings/require-deployment.js";
import { requireProductionSecrets } from "../settings/require-production.js";
import { warnLegacyAdminTokenOnStartup } from "../settings/admin-tokens.js";
import { getPrimaryDomainPackContract, preloadDomainPacks } from "../domain-packs/loader.js";
import {
  initPlatformDomainServices,
  syncActivePackServicesForContract,
} from "../domain-packs/services.js";
import { getEffectiveSettings } from "../settings/store.js";
import { assertRequiredServices } from "@embodied-agent/runtime";
import { bindRuntimeLayers } from "./bindings.js";
import { createAndSetPlatformRuntimeContext } from "./context.js";

let runtimeInitPromise: Promise<void> | null = null;

export async function initRuntime(): Promise<void> {
  if (!runtimeInitPromise) {
    runtimeInitPromise = (async () => {
      if (process.env.NODE_ENV === "production" && !process.env.AGENT_DATA_DIR?.trim()) {
        throw new Error("production 环境必须显式设置 AGENT_DATA_DIR");
      }
      assertDemoReadonlyEnv();
      requireExplicitDeploymentId();
      requireExplicitActiveDomain();
      requireProductionSecrets();
      warnLegacyAdminTokenOnStartup();
      const ctx = createAndSetPlatformRuntimeContext();
      initPlatformDomainServices(ctx);
      bindRuntimeLayers();
      await preloadDomainPacks(ctx.loader);
      const settings = getEffectiveSettings();
      if (!settings.active_domain) {
        throw new Error("active_domain 未配置：preload 后无法同步 pack-bound services。");
      }
      syncActivePackServicesForContract(
        ctx,
        settings.active_domain,
        getPrimaryDomainPackContract(ctx.loader, settings),
      );
      const missing = assertRequiredServices(
        ctx.services,
        getPrimaryDomainPackContract(ctx.loader, settings),
      );
      if (missing.length > 0) {
        throw new Error(
          `active Domain Pack 缺少必需平台服务：${missing.map((issue) => issue.message).join("; ")}`,
        );
      }
      await initStateBackend();
    })();
  }
  await runtimeInitPromise;
}

/** @internal tests */
export function resetRuntimeInitForTests(): void {
  runtimeInitPromise = null;
}
