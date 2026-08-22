export type CatalogEntry = {
  id: string;
  display_name: string;
  status: "live" | "placeholder";
  active: boolean;
};

export const DEFAULT_CATALOG: CatalogEntry[] = [
  { id: "agriculture", display_name: "农场工长", status: "live", active: true },
  { id: "robotics", display_name: "机器人领域", status: "live", active: false },
  { id: "industrial", display_name: "工业安能卫士", status: "live", active: false },
];

export function settingsFixture(opts: { activeDomain?: string; deploymentId?: string } = {}) {
  return {
    deployment_id: opts.deploymentId ?? "dep-1",
    active_domain: opts.activeDomain ?? "agriculture",
  };
}

export function domainPacksFixture(
  opts: {
    activeDomain?: string;
    deploymentId?: string;
    catalog?: CatalogEntry[];
    activeOpsSchema?: unknown;
  } = {},
) {
  const activeDomain = opts.activeDomain ?? "agriculture";
  const catalog = (opts.catalog ?? DEFAULT_CATALOG).map((entry) => ({
    ...entry,
    active: entry.id === activeDomain,
  }));
  return {
    catalog,
    active_domain: activeDomain,
    deployment_id: opts.deploymentId ?? "dep-1",
    active_ops_schema: opts.activeOpsSchema ?? null,
  };
}

export function publicDomainPacksFixture(
  opts: {
    activeDomain?: string;
    catalog?: CatalogEntry[];
  } = {},
) {
  const activeDomain = opts.activeDomain ?? "agriculture";
  const catalog = (opts.catalog ?? DEFAULT_CATALOG).map((entry) => ({
    ...entry,
    active: entry.id === activeDomain,
  }));
  return {
    catalog,
    active_domain: activeDomain,
  };
}
