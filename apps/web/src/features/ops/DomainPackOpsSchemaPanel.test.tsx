import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DomainPackOpsSchemaPanel } from "./DomainPackOpsSchemaPanel";
import { renderWithProviders } from "../../test-utils";
import { DomainPackProvider } from "../../contexts/DomainPackContext";
import type { DomainPackOpsSchema } from "../../api";
import type { LiveDomainPackMeta } from "../../lib/domain-packs";

afterEach(() => {
  vi.restoreAllMocks();
});

const pack: LiveDomainPackMeta = {
  packId: "agriculture",
  slug: "greenhouse",
  displayNameKey: "nav.farm",
  status: "live",
  runtimeStatus: "live",
  scenePath: "/scenes/greenhouse",
  opsPath: "/scenes/greenhouse/ops",
  opsEnabled: true,
};

const schema: DomainPackOpsSchema = {
  schema_version: 1,
  pack_id: "agriculture",
  display_name: "Greenhouse",
  status: "live",
  navigation: {
    tabs: [
      { id: "overview", label: "Overview", route: "/overview", kind: "overview", enabled: true },
      { id: "devices", label: "Devices", route: "/devices", kind: "devices", enabled: false },
      { id: "platform", label: "Platform", route: "/platform", kind: "platform", enabled: false },
    ],
  },
  settings: {
    fields: [
      {
        id: "mqtt_url",
        label: "MQTT URL",
        scope: "platform",
        type: "string",
        control: "text",
        save_target: "settings",
        required: true,
      },
      {
        id: "threshold",
        label: "Threshold",
        scope: "domain",
        type: "number",
        control: "number",
        save_target: "domain_config",
        required: false,
      },
    ],
  },
  devices: {
    binding: {
      required_transports: ["mqtt"],
      physical_skills: ["vent", "irrigate", "fan"],
      required_nodes: ["gh-001"],
    },
  },
  control: {
    actions: [
      {
        id: "vent",
        label: "Vent",
        skill: "vent",
        physical: true,
        requires_confirmation: true,
      },
      {
        id: "stop",
        label: "Stop",
        skill: "stop",
        physical: false,
        requires_confirmation: false,
      },
    ],
  },
  eval_evidence: {
    slices: [
      { id: "golden", label: "Golden", path: "/golden", required: true },
      { id: "matrix_extra", label: "Extra", path: "/extra", required: false },
    ],
  },
};

function renderWithSchema(opts: {
  schema?: DomainPackOpsSchema | null;
  loading?: boolean;
  error?: string;
  reload?: () => Promise<void>;
}) {
  const reload = opts.reload ?? vi.fn().mockResolvedValue(undefined);
  return renderWithProviders({
    initialEntries: ["/scenes/greenhouse/ops/platform"],
    lang: "en",
    children: (
      <DomainPackProvider
        pack={pack}
        activeOpsSchema={opts.schema ?? null}
        adminLoading={opts.loading ?? false}
        adminError={opts.error ?? null}
        reload={reload}
      >
        <DomainPackOpsSchemaPanel />
      </DomainPackProvider>
    ),
  });
}

describe("DomainPackOpsSchemaPanel", () => {
  it("shows a loading state while the schema is loading", () => {
    renderWithSchema({ loading: true });

    expect(screen.getByText("Refreshing")).toBeInTheDocument();
  });

  it("shows an error message when schema loading fails", () => {
    renderWithSchema({ error: "schema fetch failed" });

    expect(screen.getByText("Ops schema fetch failed: schema fetch failed")).toBeInTheDocument();
  });

  it("shows a no-schema message when none is available", () => {
    renderWithSchema({ schema: null });

    expect(screen.getByText("The active pack does not expose an ops schema.")).toBeInTheDocument();
  });

  it("renders the schema summary and surface tables", async () => {
    renderWithSchema({ schema });

    await waitFor(() => {
      expect(screen.getByText("agriculture · v1")).toBeInTheDocument();
    });
    expect(screen.getByText("mqtt")).toBeInTheDocument();
    expect(screen.getByText("3", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("overview")).toBeInTheDocument();
    expect(screen.getByText("1/3 enabled")).toBeInTheDocument();
    expect(screen.getByText(/mqtt_url:text/)).toBeInTheDocument();
    expect(screen.getByText("1 required")).toBeInTheDocument();
    expect(screen.getByText("vent, stop")).toBeInTheDocument();
    expect(screen.getByText("1 confirm")).toBeInTheDocument();
  });

  it("calls reload when the refresh button is clicked", async () => {
    const user = userEvent.setup();
    const reload = vi.fn().mockResolvedValue(undefined);
    renderWithSchema({ schema, reload });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Refresh" })).toBeEnabled();
    });

    await user.click(screen.getByRole("button", { name: "Refresh" }));

    expect(reload).toHaveBeenCalledTimes(1);
  });
});
