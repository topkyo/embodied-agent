import { type ReactNode } from "react";
import { type DomainPackMeta, type LiveDomainPackMeta } from "../../lib/domain-packs";
import { type PublicDomainPackCatalogEntry } from "../../api";
import SceneOpsDisabled from "../../pages/scene-ops/SceneOpsDisabled";

type SceneOpsGuardProps = {
  pack: DomainPackMeta | undefined;
  catalogLoading: boolean;
  catalogError: string | null;
  publicCatalog: PublicDomainPackCatalogEntry[];
  activeDomain: string | null;
  activeDomainError: string | null;
  children: (livePack: LiveDomainPackMeta) => ReactNode;
};

export function SceneOpsGuard({
  pack,
  catalogLoading,
  catalogError,
  publicCatalog,
  activeDomain,
  activeDomainError,
  children,
}: SceneOpsGuardProps) {
  if (!pack) {
    return <SceneOpsDisabled reason="unknown" />;
  }

  if (!pack.opsEnabled) {
    return <SceneOpsDisabled reason="disabled" pack={pack} />;
  }

  if (catalogLoading) {
    return <SceneOpsDisabled reason="checking_active_domain" pack={pack} />;
  }

  if (catalogError) {
    return <SceneOpsDisabled reason="catalog_error" pack={pack} detail={catalogError} />;
  }

  const runtimeEntry = publicCatalog.find((entry) => entry.id === pack.packId);
  const isActiveLive =
    runtimeEntry?.status === "live" && activeDomain === pack.packId && !activeDomainError;

  if (!isActiveLive) {
    return (
      <SceneOpsDisabled
        reason="inactive_domain"
        pack={pack}
        detail={
          activeDomainError ??
          `${activeDomain ?? "missing"} / runtime=${runtimeEntry?.status ?? "missing"}`
        }
      />
    );
  }

  return <>{children(pack)}</>;
}
