import { useCallback, useEffect, useMemo, useState } from "react";
import { ShieldCheck } from "lucide-react";
import {
  createPrincipalUser,
  deletePrincipalUser,
  listPrincipalUsers,
  updatePrincipalUser,
  type PrincipalUser,
} from "../../api";
import { ConfirmDialog } from "../../components/ops/ConfirmDialog";
import { useLanguage } from "../../contexts/LanguageContext";
import { Banner } from "../../components/primitives/Banner";
import { PanelTitle } from "../../components/primitives/PanelTitle";
import { UserRow } from "./UserRow";

/** 列表较长时先分页；>50 持续增长时再做虚拟化。 */
const PAGE_SIZE = 50;

export function UserManagementPanel() {
  const { t } = useLanguage();
  const [users, setUsers] = useState<PrincipalUser[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [draft, setDraft] = useState<PrincipalUser>({
    user_id: "",
    role: "worker",
    deployment_id: "",
    display_name: "",
  });

  const reload = useCallback(async () => {
    try {
      const res = await listPrincipalUsers();
      setUsers(res.users ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const totalPages = Math.max(1, Math.ceil(users.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageUsers = useMemo(
    () => users.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE),
    [users, safePage],
  );

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  async function saveUser(user: PrincipalUser) {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const existing = users.find((u) => u.user_id === user.user_id);
      if (existing) {
        await updatePrincipalUser(user.user_id, user);
      } else {
        await createPrincipalUser(user);
      }
      setMsg(t("console.users.saved", { user_id: user.user_id }));
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function removeUser(user_id: string) {
    setBusy(true);
    setErr(null);
    setDeleteTarget(null);
    try {
      await deletePrincipalUser(user_id);
      setMsg(t("console.users.deleted", { user_id }));
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="users-config" className="settings-panel">
      <PanelTitle
        icon={<ShieldCheck size={20} aria-hidden />}
        title={t("sceneOps.users.fieldPrincipalsTitle")}
        text={t("sceneOps.users.fieldPrincipalsLead")}
      />
      {err && <Banner variant="error">{err}</Banner>}
      {msg && <Banner variant="ok">{msg}</Banner>}
      {users.length === 0 ? (
        <p className="muted">{t("settings.users.empty")}</p>
      ) : (
        <>
          {/* TODO(web): 列表持续 >50 时改为虚拟化，避免仅分页的滚动成本 */}
          <div className="ops-table-wrap">
            <table className="ops-table ops-data-table">
              <thead>
                <tr>
                  <th>{t("settings.users.col.id")}</th>
                  <th>{t("settings.users.col.name")}</th>
                  <th>{t("settings.users.col.role")}</th>
                  <th>{t("settings.users.col.deployment")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pageUsers.map((u) => (
                  <UserRow
                    key={u.user_id}
                    user={u}
                    busy={busy}
                    onSave={saveUser}
                    onDelete={(id) => setDeleteTarget(id)}
                    t={t}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {users.length > PAGE_SIZE && (
            <div className="actions form-grid-spaced u-mt-field">
              <button
                type="button"
                className="btn btn--ghost"
                disabled={busy || safePage <= 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                {t("sceneOps.common.prevPage")}
              </button>
              <span className="muted u-text-sm">
                {t("sceneOps.common.pageStatus", {
                  page: String(safePage + 1),
                  total: String(totalPages),
                })}
              </span>
              <button
                type="button"
                className="btn btn--ghost"
                disabled={busy || safePage >= totalPages - 1}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              >
                {t("sceneOps.common.nextPage")}
              </button>
            </div>
          )}
        </>
      )}
      <div className="form-grid form-grid-spaced">
        <input
          value={draft.user_id}
          onChange={(e) => setDraft({ ...draft, user_id: e.target.value })}
          placeholder={t("settings.users.col.id")}
        />
        <input
          value={draft.display_name ?? ""}
          onChange={(e) => setDraft({ ...draft, display_name: e.target.value })}
          placeholder={t("settings.users.col.name")}
        />
        <select
          value={draft.role}
          onChange={(e) => setDraft({ ...draft, role: e.target.value as PrincipalUser["role"] })}
        >
          {(["owner", "operator", "worker", "viewer", "readonly"] as const).map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <input
          value={draft.deployment_id}
          onChange={(e) => setDraft({ ...draft, deployment_id: e.target.value })}
          placeholder={t("settings.users.col.deployment")}
        />
        <button
          type="button"
          className="btn"
          disabled={busy || !draft.user_id.trim()}
          onClick={() => void saveUser(draft)}
        >
          {t("settings.users.btn.add")}
        </button>
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={t("sceneOps.users.confirmDeleteTitle")}
        message={t("sceneOps.users.confirmDelete", { user_id: deleteTarget ?? "" })}
        confirmLabel={t("settings.users.btn.delete")}
        cancelLabel={t("sceneOps.common.cancel")}
        danger
        onConfirm={() => {
          if (deleteTarget) void removeUser(deleteTarget);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  );
}
