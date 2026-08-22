import type { AdminOverview } from "../../api";
import type { useLanguage } from "../../contexts/LanguageContext";
import { SiteViewPanel } from "../../features/ops/SiteViewPanel";

type IndustrialOverviewPanelProps = {
  overview: AdminOverview;
  t: ReturnType<typeof useLanguage>["t"];
  executing?: boolean;
};

/** industrial overview 扩展：挂载可复用现场视图（首版仅柜体示意）。 */
export function IndustrialOverviewPanel({ overview, t, executing }: IndustrialOverviewPanelProps) {
  return <SiteViewPanel overview={overview} t={t} executing={executing} />;
}
