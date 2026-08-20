export {
  DEFAULT_CATALOG,
  domainPacksFixture,
  publicDomainPacksFixture,
  settingsFixture,
  type CatalogEntry,
} from "./fixtures";
export {
  getFetchUrl,
  jsonResponse,
  mockAppFetch,
  type FetchRouteHandler,
  type MockFetchOptions,
} from "./fetch";
export { renderWithProviders, RouteStub, type RenderWithProvidersOptions } from "./render";
export { clearOpsRole, setOpsRoleFromAuth } from "../lib/ops-role";
import { clearOpsRole as clearOpsRoleImpl } from "../lib/ops-role";

/** 测试前后重置 ops-role 单例（test-setup afterEach 已默认调用 clearOpsRole） */
export function resetOpsAuthForTests(): void {
  clearOpsRoleImpl();
}
