import { KeyRound, Loader2 } from "lucide-react";
import type { TranslateFn } from "./settings-form-types";

export function SettingsSubmitButton({ t, saving }: { t: TranslateFn; saving: boolean }) {
  return (
    <div className="settings-actions">
      <button type="submit" className="btn primary" disabled={saving} aria-busy={saving}>
        {saving ? (
          <Loader2 size={17} className="u-spin" aria-hidden />
        ) : (
          <KeyRound size={17} aria-hidden />
        )}
        {saving ? t("settings.btn.saving") : t("settings.btn.save")}
      </button>
    </div>
  );
}
