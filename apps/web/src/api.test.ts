import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminFetchError, fetchDomainPacks, fetchPublicDomainPacks } from "./api";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AdminFetchError", () => {
  it("exposes status and parsed body", () => {
    const err = new AdminFetchError("failed", 401, { error: "unauthorized" });
    expect(err.name).toBe("AdminFetchError");
    expect(err.status).toBe(401);
    expect(err.body).toEqual({ error: "unauthorized" });
    expect(err.message).toBe("failed");
  });
});

describe("fetchDomainPacks", () => {
  it("loads the runtime catalog from the admin API", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          catalog: [
            {
              id: "agriculture",
              display_name: "农业领域",
              status: "live",
              active: true,
              capabilities: {
                digest: true,
                weatherProactive: true,
                satellite: true,
              },
              readiness: {
                pack_id: "agriculture",
                display_name: "农业领域",
                status: "live",
                readiness: "ready",
                deliverable: true,
                eval: {
                  golden_rows: 1,
                  matrix_extra_rows: 1,
                  matrix_wechat_rows: 1,
                  matrix_negative_rows: 1,
                },
                issues: [],
              },
              ops_schema: {
                schema_version: 1,
                pack_id: "agriculture",
                display_name: "农业领域",
                status: "live",
                navigation: {
                  tabs: [
                    {
                      id: "overview",
                      label: "Overview",
                      route: "",
                      kind: "overview",
                      enabled: true,
                    },
                  ],
                },
                settings: {
                  fields: [
                    {
                      id: "active_domain",
                      label: "Active Domain Pack",
                      scope: "platform",
                      type: "string",
                      control: "text",
                      save_target: "settings",
                      required: true,
                    },
                  ],
                },
                devices: {
                  binding: {
                    required_transports: ["mqtt"],
                    physical_skills: ["vent.start"],
                    required_nodes: ["node-gh-001-a"],
                  },
                },
                control: {
                  actions: [
                    {
                      id: "vent.start",
                      label: "vent.start",
                      skill: "vent.start",
                      physical: true,
                      requires_confirmation: true,
                    },
                  ],
                },
                eval_evidence: {
                  slices: [
                    {
                      id: "golden",
                      label: "Golden",
                      path: "eval/golden.jsonl",
                      required: true,
                    },
                  ],
                },
              },
            },
          ],
          active_domain: "agriculture",
          deployment_id: "dep-gh-pilot-001",
          primary_pack_id: "agriculture",
          active_error: null,
          active_ops_schema: {
            schema_version: 1,
            pack_id: "agriculture",
            display_name: "农业领域",
            status: "live",
            navigation: { tabs: [] },
            settings: { fields: [] },
            devices: {
              binding: {
                required_transports: ["mqtt"],
                physical_skills: ["vent.start"],
                required_nodes: [],
              },
            },
            control: { actions: [] },
            eval_evidence: { slices: [] },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const data = await fetchDomainPacks();

    expect(fetchMock).toHaveBeenCalledWith(
      "/admin/domain-packs",
      expect.objectContaining({
        headers: expect.any(Headers),
        credentials: "include",
      }),
    );
    expect(data.catalog.map((pack) => pack.id)).toEqual(["agriculture"]);
    expect(data.active_domain).toBe("agriculture");
    expect(data.catalog[0]?.capabilities?.satellite).toBe(true);
    expect(data.active_ops_schema?.devices.binding.required_transports).toEqual(["mqtt"]);
    expect(data.catalog[0]?.ops_schema?.settings.fields[0]?.id).toBe("active_domain");
    expect(data.catalog[0]?.ops_schema?.control.actions[0]?.skill).toBe("vent.start");
  });
});

describe("fetchPublicDomainPacks", () => {
  it("loads the public runtime catalog without admin headers", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          catalog: [
            {
              id: "robotics",
              display_name: "机器人领域",
              status: "live",
              active: false,
            },
          ],
          active_domain: "agriculture",
          deployment_id: "dep-gh-pilot-001",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const data = await fetchPublicDomainPacks();

    expect(fetchMock).toHaveBeenCalledWith("/domain-packs");
    expect(data.catalog[0]).toMatchObject({ id: "robotics", status: "live" });
    expect(data.catalog[0]?.capabilities).toBeUndefined();
  });
});
