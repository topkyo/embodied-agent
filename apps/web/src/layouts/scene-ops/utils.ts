import { type AdminDomainPackCatalogEntry, type PublicDomainPackCatalogEntry } from "../../api";

export function publicToAdminCatalog(
  entries: PublicDomainPackCatalogEntry[],
): AdminDomainPackCatalogEntry[] {
  return entries.map(({ id, display_name, status, active, capabilities }) => ({
    id,
    display_name,
    status,
    active,
    capabilities,
  }));
}

export const MOBILE_MQ = "(max-width: 860px)";
