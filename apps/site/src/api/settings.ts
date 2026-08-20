export type PublicDomainPackCatalogEntry = {
  id: string;
  display_name: string;
  web_slug: string;
  status: "live" | "placeholder";
  active: boolean;
};

export type PublicDomainPacksResponse = {
  catalog: PublicDomainPackCatalogEntry[];
  active_domain: string;
  deployment_id: string;
};

export async function fetchPublicDomainPacks(): Promise<PublicDomainPacksResponse> {
  const res = await fetch("/domain-packs");
  if (!res.ok) {
    throw new Error(`domain_packs_http_${res.status}`);
  }
  return (await res.json()) as PublicDomainPacksResponse;
}

export type AdminOverviewEntity = {
  entity_id: string;
  entity_type: string;
  domain_id?: string;
  name?: string;
  telemetry?: Record<string, unknown>;
  reported_at?: string;
  stale: boolean;
};

export type AdminOverview = {
  deployment_id: string;
  deployment_name: string;
  entities: AdminOverviewEntity[];
};
