import { beforeAll, beforeEach } from "vitest";
import { clearEffectiveSettingsCacheForTest } from "../settings/store.js";
import { bindRuntimeLayers } from "../runtime/bindings.js";
import {
  preloadAllDomainPacksForReadiness,
  resolveDomainPackContractById,
} from "../domain-packs/loader.js";
import {
  initPlatformDomainServices,
  syncActivePackServicesForContract,
} from "../domain-packs/services.js";
import {
  createAndSetPlatformRuntimeContext,
  getPlatformRuntimeContextIfExists,
  setPlatformRuntimeContext,
} from "../runtime/context.js";

// 模块加载时创建并初始化一次共享 ctx（services/loader 状态在 ctx 对象上持久）。
const ctx = createAndSetPlatformRuntimeContext();
initPlatformDomainServices(ctx);
bindRuntimeLayers();
await preloadAllDomainPacksForReadiness(ctx.loader);
syncActivePackServicesForContract(
  ctx,
  "agriculture",
  resolveDomainPackContractById(ctx.loader, "agriculture"),
);

// 每个测试文件 beforeAll 之前运行：将共享 ctx 写入当前 async 上下文，
// 覆盖测试文件 beforeAll 内的 getPlatformRuntimeContext() 调用。
beforeAll(async () => {
  setPlatformRuntimeContext(ctx);
  bindRuntimeLayers();
  await preloadAllDomainPacksForReadiness(ctx.loader);
});

beforeEach(async () => {
  clearEffectiveSettingsCacheForTest();
  process.env.NODE_ENV ??= "test";
  process.env.DEPLOYMENT_ID ??= "dep-gh-pilot-001";
  process.env.ACTIVE_DOMAIN ??= "agriculture";
  // ALS 在 async 边界可能丢失；每个测试前幂等恢复 ctx 并重新绑定 + 预加载。
  if (!getPlatformRuntimeContextIfExists()) {
    setPlatformRuntimeContext(ctx);
  }
  bindRuntimeLayers();
  // bindRuntimeLayers 重配的是「当前 ALS ctx」的 loader（configure 会清空
  // factory/preload 缓存）。脚本测试文件（scripts/lib/*.test.ts）在自己的
  // beforeAll 里绑定 scriptCtx，此时当前 ctx ≠ 共享 ctx；预加载必须对准
  // 当前 ctx，否则 scriptCtx 缓存被清后不再预加载，pack 解析失败。
  const current = getPlatformRuntimeContextIfExists() ?? ctx;
  await preloadAllDomainPacksForReadiness(current.loader);
});
