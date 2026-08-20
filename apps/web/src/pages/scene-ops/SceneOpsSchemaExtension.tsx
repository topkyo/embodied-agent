import { Boxes } from "lucide-react";
import { useParams } from "react-router-dom";
import { PanelTitle } from "../../components/primitives/PanelTitle";
import { useActiveOpsSchema, useDomainPack } from "../../contexts/DomainPackContext";
import { useLanguage } from "../../contexts/LanguageContext";
import type { DomainPackOpsTab } from "../../api";
import NotFound from "../NotFound";

function normalizeRoute(route: string | undefined): string {
  return (route ?? "").replace(/^\/+|\/+$/g, "");
}

function findExtensionTab(
  tabs: readonly DomainPackOpsTab[],
  route: string,
): DomainPackOpsTab | undefined {
  return tabs.find(
    (tab) => tab.enabled && tab.kind === "extension" && normalizeRoute(tab.route) === route,
  );
}

/**
 * Phase 2.5：仅匹配 schema `kind=extension` 的 tab；真正未知路由 → NotFound。
 * 调试 schema 表格仅 DEV 可见。
 */
export default function SceneOpsSchemaExtension() {
  const pack = useDomainPack();
  const { t } = useLanguage();
  const params = useParams();
  const route = normalizeRoute(params["*"]);
  const { schema, error, loading } = useActiveOpsSchema();
  const packSchema = schema?.pack_id === pack.packId ? schema : null;
  const tab = packSchema ? findExtensionTab(packSchema.navigation.tabs, route) : undefined;

  if (loading) {
    return (
      <section className="settings settings-console">
        <p className="muted">{t("common.loading")}</p>
      </section>
    );
  }

  // 无匹配 extension tab（含 schema 未声明 / 非 admin 无 schema）→ 真正 404
  if (!tab) {
    return <NotFound />;
  }

  // admin schema 错误时仍已匹配不到 tab 会走 NotFound；此处 error 仅在有 tab 时理论上少见
  return (
    <section className="settings settings-console">
      <div className="settings-grid">
        <section className="settings-panel">
          <PanelTitle
            icon={<Boxes size={20} aria-hidden />}
            title={tab.label || t("sceneOps.extension.title")}
            text={`${packSchema?.display_name ?? pack.displayNameKey} · ${tab.route}`}
          />
          {error && <p className="muted">{t("console.schema.extensionError", { error })}</p>}
          {import.meta.env.DEV && packSchema && (
            <table className="ops-table readiness-pack-table">
              <thead>
                <tr>
                  <th>{t("sceneOps.extension.col.contract")}</th>
                  <th>{t("sceneOps.extension.col.value")}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{t("sceneOps.extension.row.pack")}</td>
                  <td>
                    {packSchema.pack_id} · v{packSchema.schema_version}
                  </td>
                </tr>
                <tr>
                  <td>{t("sceneOps.extension.row.route")}</td>
                  <td>{tab.route}</td>
                </tr>
                <tr>
                  <td>{t("sceneOps.extension.row.settingsFields")}</td>
                  <td>{packSchema.settings.fields.length}</td>
                </tr>
                <tr>
                  <td>{t("sceneOps.extension.row.controlActions")}</td>
                  <td>{packSchema.control.actions.length}</td>
                </tr>
                <tr>
                  <td>{t("sceneOps.extension.row.evalSlices")}</td>
                  <td>{packSchema.eval_evidence.slices.length}</td>
                </tr>
              </tbody>
            </table>
          )}
        </section>
      </div>
    </section>
  );
}
