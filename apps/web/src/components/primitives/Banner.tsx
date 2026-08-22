export function Banner({
  variant,
  children,
  onRetry,
  retryLabel = "Retry",
}: {
  variant: "error" | "ok";
  children: React.ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div className={`banner ${variant}`} role="status" aria-live="polite">
      <div className="banner__body">{children}</div>
      {onRetry ? (
        <button type="button" className="btn btn--ghost banner__retry" onClick={onRetry}>
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}
