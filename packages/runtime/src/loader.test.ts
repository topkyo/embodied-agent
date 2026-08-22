import { afterEach, describe, expect, it } from "vitest";
import {
  configureDomainPackCatalog,
  configureDomainPackLoader,
  createDomainPackLoaderHolder,
  getDomainPackCatalog,
  getConfiguredRuntimeSettings,
} from "./loader.js";

const TEST_CATALOG = [
  {
    id: "industrial",
    module: "@embodied-agent/domain-industrial",
    displayName: "工业安能卫士",
    webSlug: "industrial",
    status: "live" as const,
  },
  {
    id: "aquaculture",
    module: "@embodied-agent/domain-aquaculture",
    displayName: "水产管家",
    webSlug: "aquaculture",
    status: "placeholder" as const,
  },
];

describe("domain pack loader", () => {
  const holder = createDomainPackLoaderHolder();

  afterEach(() => {
    configureDomainPackLoader(holder, {
      getEffectiveSettings: () => {
        throw new Error("runtime settings provider 未配置。");
      },
    });
  });

  it("validates catalog entries and exposes web-facing catalog", () => {
    configureDomainPackCatalog(holder, TEST_CATALOG);
    expect(getDomainPackCatalog(holder)).toEqual([
      {
        id: "industrial",
        displayName: "工业安能卫士",
        webSlug: "industrial",
        status: "live",
      },
      {
        id: "aquaculture",
        displayName: "水产管家",
        webSlug: "aquaculture",
        status: "placeholder",
      },
    ]);
  });

  it("rejects duplicate catalog ids", () => {
    expect(() =>
      configureDomainPackCatalog(holder, [
        ...TEST_CATALOG,
        {
          id: "industrial",
          module: "@embodied-agent/domain-industrial",
          displayName: "dup",
          webSlug: "industrial-dup",
          status: "live",
        },
      ]),
    ).toThrow(/重复 id/);
  });

  it("reads active_domain from configured runtime settings provider", () => {
    configureDomainPackLoader(holder, {
      catalog: TEST_CATALOG,
      getEffectiveSettings: () => ({
        deployment_id: "dep-test",
        active_domain: "industrial",
      }),
    });
    expect(getConfiguredRuntimeSettings(holder).active_domain).toBe("industrial");
  });
});
