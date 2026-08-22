import { useEffect, useId, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { PlatformSettingsForm } from "../../features/settings/PlatformSettingsForm";
import { DomainPackOpsSchemaPanel } from "../../features/ops/DomainPackOpsSchemaPanel";
import { PlatformMoatPanels } from "../../features/ops/PlatformMoatPanels";
import { PlatformReadinessPanel } from "../../features/ops/PlatformReadinessPanel";
import { PlatformChannelsPanel } from "../../features/ops/PlatformChannelsPanel";
import { useLanguage } from "../../contexts/LanguageContext";

const PLATFORM_TABS = ["health", "config", "advanced"] as const;
export type PlatformTab = (typeof PLATFORM_TABS)[number];

function parsePlatformTab(raw: string | null): PlatformTab {
  if (raw === "config" || raw === "advanced" || raw === "health") return raw;
  return "health";
}

/** 平台底座：健康 / 配置 / 高级 Tab；`?tab=` 深度链接同步。 */
export default function SceneOpsPlatform() {
  const { t } = useLanguage();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parsePlatformTab(searchParams.get("tab"));
  const [flywheelOpen, setFlywheelOpen] = useState(false);
  const [channelsOpen, setChannelsOpen] = useState(false);
  const [schemaOpen, setSchemaOpen] = useState(false);
  const tablistId = useId();

  useEffect(() => {
    if (location.hash === "#flywheel") {
      setFlywheelOpen(true);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("tab", "advanced");
          return next;
        },
        { replace: true },
      );
    }
  }, [location.hash, setSearchParams]);

  function setTab(next: PlatformTab) {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.set("tab", next);
        return params;
      },
      { replace: true },
    );
  }

  return (
    <section className="settings settings-console">
      <div
        className="ops-platform-tabs"
        role="tablist"
        aria-label={t("sceneOps.platform.tablistLabel")}
        id={tablistId}
      >
        {PLATFORM_TABS.map((id) => {
          const selected = tab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              id={`${tablistId}-${id}`}
              className={`ops-platform-tab${selected ? " is-active" : ""}`}
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              aria-controls={`${tablistId}-panel`}
              onClick={() => setTab(id)}
            >
              {t(`sceneOps.platform.tab.${id}`)}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`${tablistId}-panel`}
        aria-labelledby={`${tablistId}-${tab}`}
        className="ops-platform-tabpanel"
      >
        {tab === "health" && <PlatformReadinessPanel />}

        {tab === "config" && <PlatformSettingsForm hideHeader />}

        {tab === "advanced" && (
          <>
            <details
              className="ops-platform-details"
              open={channelsOpen}
              onToggle={(e) => setChannelsOpen((e.target as HTMLDetailsElement).open)}
            >
              <summary className="ops-platform-details-summary">
                {t("console.channels.title")}
              </summary>
              <p className="muted ops-platform-details-lead">{t("console.channels.desc")}</p>
              <PlatformChannelsPanel />
            </details>

            <details
              id="flywheel"
              className="ops-platform-details"
              open={flywheelOpen}
              onToggle={(e) => setFlywheelOpen((e.target as HTMLDetailsElement).open)}
            >
              <summary className="ops-platform-details-summary">
                {t("sceneOps.platform.flywheelTitle")}
              </summary>
              <p className="muted ops-platform-details-lead">
                {t("sceneOps.platform.flywheelDesc")}
              </p>
              <PlatformMoatPanels />
            </details>

            <details
              className="ops-platform-details"
              open={schemaOpen}
              onToggle={(e) => setSchemaOpen((e.target as HTMLDetailsElement).open)}
            >
              <summary className="ops-platform-details-summary">
                {t("sceneOps.platform.advancedSchemaTitle")}
              </summary>
              <p className="muted ops-platform-details-lead">
                {t("sceneOps.platform.advancedSchemaLead")}
              </p>
              <DomainPackOpsSchemaPanel />
            </details>
          </>
        )}
      </div>
    </section>
  );
}
