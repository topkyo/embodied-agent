import type { ReactNode } from "react";

export type SceneHeroProps = {
  sceneId?: string;
  headline: string;
  lead?: string;
  badge?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  variant?: "default" | "greenhouse";
  className?: string;
};

function renderHeadline(headline: string) {
  return headline.split("\n").map((line, index) => (
    <span key={`${line}-${index}`}>
      {index > 0 ? <br /> : null}
      {line}
    </span>
  ));
}

const VARIANT_CLASS: Record<string, { header: string; inner: string; isHero: boolean }> = {
  greenhouse: {
    header: "hero-greenhouse",
    inner: "hero-inner hero-greenhouse-inner",
    isHero: true,
  },
  default: { header: "scene-hero", inner: "scene-hero-inner", isHero: false },
};

export default function SceneHero({
  sceneId,
  headline,
  lead,
  badge,
  actions,
  children,
  variant = "default",
  className = "",
}: SceneHeroProps) {
  const vc = VARIANT_CLASS[variant] ?? VARIANT_CLASS.default;
  const headerClass = `${vc.header} ${className}`.trim();

  return (
    <header className={headerClass}>
      <div className={vc.inner}>
        {vc.isHero ? (
          <>
            <div className="hero-copy">
              {sceneId ? <p className="scene-id">{sceneId}</p> : null}
              <h1 className="display">{renderHeadline(headline)}</h1>
              {lead ? <p className="lead on-dark">{lead}</p> : null}
              {badge ? <div className="hero-proof-line">{badge}</div> : null}
              {actions ? <div className="actions">{actions}</div> : null}
            </div>
            {children}
          </>
        ) : (
          <>
            {sceneId ? <p className="scene-id">{sceneId}</p> : null}
            <h1 className="display">{renderHeadline(headline)}</h1>
            {lead ? <p className="lead on-dark">{lead}</p> : null}
            {badge ? <div className="hero-proof-line">{badge}</div> : null}
            {actions ? <div className="actions">{actions}</div> : null}
            {children}
          </>
        )}
      </div>
    </header>
  );
}
