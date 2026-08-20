import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { fetchPlatformReadiness, type PlatformReadiness } from "../api";
import { useInterval } from "../hooks/useInterval";

const READINESS_POLL_MS = 30_000;

export type SceneOpsReadinessIssue = {
  code: string;
  label: string;
  detail: string;
  severity: "error" | "warning";
};

export type SceneOpsReadinessState = {
  loading: boolean;
  error: string | null;
  data: PlatformReadiness | null;
  blockingIssue: SceneOpsReadinessIssue | null;
  ready: boolean;
  blocked: boolean;
  refresh: () => void;
};

const SceneOpsReadinessContext = createContext<SceneOpsReadinessState | null>(null);

/** 导出供单元测试锁 ready/blocked 选择语义 */
export function selectBlockingIssue(data: PlatformReadiness | null): SceneOpsReadinessIssue | null {
  if (!data) return null;

  const fromCheck =
    data.checks.find((check) => !check.ok && check.severity === "error") ??
    data.checks.find((check) => !check.ok) ??
    null;
  if (fromCheck) {
    return {
      code: fromCheck.id,
      label: fromCheck.label,
      detail: fromCheck.detail,
      severity: fromCheck.severity,
    };
  }

  const runtimeIssue =
    data.runtime_issues.find((issue) => issue.severity === "error") ??
    data.runtime_issues.find((issue) => issue.severity === "warning") ??
    null;
  if (runtimeIssue) {
    return {
      code: runtimeIssue.code,
      label: runtimeIssue.code,
      detail: runtimeIssue.message,
      severity: runtimeIssue.severity,
    };
  }

  return null;
}

export function SceneOpsReadinessProvider({
  scopeKey,
  children,
}: {
  scopeKey: string;
  children: ReactNode;
}) {
  const [data, setData] = useState<PlatformReadiness | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchPlatformReadiness());
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setData(null);
    setError(null);
    setLoading(true);
    void refresh();
  }, [refresh, scopeKey]);

  useInterval(() => void refresh(), READINESS_POLL_MS, { visibleOnly: true });

  const blockingIssue = useMemo(() => selectBlockingIssue(data), [data]);
  const ready = Boolean(data?.ready);
  const blocked = Boolean(data) && !ready;

  const value = useMemo<SceneOpsReadinessState>(
    () => ({
      loading,
      error,
      data,
      blockingIssue,
      ready,
      blocked,
      refresh: () => void refresh(),
    }),
    [blocked, blockingIssue, data, error, loading, ready, refresh],
  );

  return (
    <SceneOpsReadinessContext.Provider value={value}>{children}</SceneOpsReadinessContext.Provider>
  );
}

export function useSceneOpsReadiness(): SceneOpsReadinessState {
  const value = useContext(SceneOpsReadinessContext);
  if (!value) {
    throw new Error("useSceneOpsReadiness outside SceneOpsReadinessProvider");
  }
  return value;
}
