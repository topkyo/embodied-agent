import { useEffect, useState } from "react";
import type { PrincipalUser } from "../../api";

export function UserRow({
  user,
  busy,
  onSave,
  onDelete,
  t,
}: {
  user: PrincipalUser;
  busy: boolean;
  onSave: (u: PrincipalUser) => void;
  onDelete: (id: string) => void;
  t: (key: string) => string;
}) {
  const [local, setLocal] = useState(user);
  useEffect(() => setLocal(user), [user]);

  return (
    <tr>
      <td>{local.user_id}</td>
      <td>
        <input
          value={local.display_name ?? ""}
          onChange={(e) => setLocal({ ...local, display_name: e.target.value })}
          className="u-w-full"
        />
      </td>
      <td>
        <select
          value={local.role}
          onChange={(e) => setLocal({ ...local, role: e.target.value as PrincipalUser["role"] })}
        >
          {(["owner", "operator", "worker", "viewer", "readonly"] as const).map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </td>
      <td>
        <input
          value={local.deployment_id}
          onChange={(e) => setLocal({ ...local, deployment_id: e.target.value })}
          className="u-w-full"
        />
      </td>
      <td className="u-nowrap">
        <button type="button" className="btn" disabled={busy} onClick={() => onSave(local)}>
          {t("settings.users.btn.save")}
        </button>{" "}
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => onDelete(local.user_id)}
        >
          {t("settings.users.btn.delete")}
        </button>
      </td>
    </tr>
  );
}
