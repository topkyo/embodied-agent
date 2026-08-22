import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { unbindWechat } from "../../api/bindings";
import { AdminFetchError } from "../../api/admin-fetch";

export function useUnbind() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const [confirmUnbind, setConfirmUnbind] = useState(false);
  const [unbindError, setUnbindError] = useState<string | null>(null);
  const [unbinding, setUnbinding] = useState(false);

  const onUnbindClick = useCallback(() => {
    setUnbindError(null);
    setConfirmUnbind(true);
  }, []);

  const onUnbindCancel = useCallback(() => {
    if (unbinding) return;
    setConfirmUnbind(false);
  }, [unbinding]);

  const onUnbindConfirm = useCallback(async () => {
    setUnbinding(true);
    try {
      await unbindWechat();
      await logout();
      setConfirmUnbind(false);
      navigate("/login", { replace: true });
    } catch (e) {
      const message =
        e instanceof AdminFetchError ? e.message : e instanceof Error ? e.message : String(e);
      setUnbindError(message);
      setUnbinding(false);
    }
  }, [logout, navigate]);

  return {
    confirmUnbind,
    setConfirmUnbind,
    unbindError,
    unbinding,
    onUnbindClick,
    onUnbindCancel,
    onUnbindConfirm,
  };
}
