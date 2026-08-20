import { useLanguage } from "../../contexts/LanguageContext";
import { useOpsSchema } from "../../contexts/DomainPackContext";
import { OpsPageHeader } from "../../components/ops/OpsPageHeader";
import { NodeManagementPanel } from "../../features/ops/NodeManagementPanel";
import { resolvePackOpsPanelsFromSchema } from "./pack-ops-registry";

export default function SceneOpsDevices() {
  const { t } = useLanguage();
  const panels = resolvePackOpsPanelsFromSchema(useOpsSchema(), "devices");
  const DevicesPanel = panels.DevicesPanel ?? NodeManagementPanel;

  return (
    <section className="settings settings-console">
      <OpsPageHeader
        title={t("console.devices.productTitle")}
        subtitle={t("console.devices.productLead")}
      />
      <DevicesPanel />
    </section>
  );
}
