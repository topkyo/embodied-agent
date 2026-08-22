import type { ReactNode } from "react";
import { Banner } from "../primitives/Banner";
import { useLanguage } from "../../contexts/LanguageContext";

export interface AsyncStateProps {
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  emptyText?: string;
  onRetry?: () => void;
  children?: ReactNode;
  /** 加载中仍有数据时是否渲染 children（用于轮询刷新） */
  keepChildrenOnLoad?: boolean;
}

/** 统一加载 / 空 / 错误态；成功时渲染 children。 */
export function AsyncState({
  loading,
  error,
  empty,
  emptyText,
  onRetry,
  children,
  keepChildrenOnLoad = false,
}: AsyncStateProps) {
  const { t } = useLanguage();
  const hasChildren = children != null && children !== false;

  // 有缓存数据时错误/加载不卸载 children（轮询场景）
  if (error && !(keepChildrenOnLoad && hasChildren)) {
    return (
      <div className="async-state async-state--error" aria-live="polite">
        <Banner variant="error">{error}</Banner>
        {onRetry ? (
          <div className="async-state__actions">
            <button type="button" className="btn btn--primary" onClick={onRetry}>
              {t("sceneOps.common.retry")}
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  if (loading && !keepChildrenOnLoad) {
    return (
      <p className="muted u-text-sm async-state async-state--loading" aria-live="polite">
        {t("sceneOps.common.loading")}
      </p>
    );
  }

  if (empty && !hasChildren) {
    return (
      <p className="muted u-text-sm async-state async-state--empty" aria-live="polite">
        {emptyText ?? t("sceneOps.common.empty")}
      </p>
    );
  }

  return (
    <>
      {error ? (
        <div className="async-state async-state--error" aria-live="polite">
          <Banner variant="error">{error}</Banner>
          {onRetry ? (
            <div className="async-state__actions">
              <button type="button" className="btn btn--primary" onClick={onRetry}>
                {t("sceneOps.common.retry")}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      {loading && keepChildrenOnLoad ? (
        <p className="muted u-text-sm async-state async-state--loading" aria-live="polite">
          {t("sceneOps.common.loading")}
        </p>
      ) : null}
      {children}
    </>
  );
}
