import { useCallback, useEffect, useState } from "react";
import { useMarketingNav } from "../contexts/MarketingNavContext";

/** Toggle marketing nav dark/light when a full-bleed hero scrolls past the sticky bar. */
export function useHeroNavTheme(enabled = true) {
  const [heroEl, setHeroEl] = useState<HTMLElement | null>(null);
  const { setTheme } = useMarketingNav();

  const heroRef = useCallback((node: HTMLElement | null) => {
    setHeroEl(node);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setTheme("light");
      return;
    }
    if (!heroEl) {
      setTheme(enabled ? "dark" : "light");
      return;
    }

    setTheme("dark");

    const navH = parseInt(
      getComputedStyle(document.documentElement).getPropertyValue("--sf-nav-h") || "52",
      10,
    );

    const obs = new IntersectionObserver(
      ([entry]) => {
        setTheme(entry?.isIntersecting ? "dark" : "light");
      },
      { threshold: 0, rootMargin: `-${navH}px 0px 0px 0px` },
    );
    obs.observe(heroEl);
    return () => {
      obs.disconnect();
      setTheme("light");
    };
  }, [enabled, heroEl, setTheme]);

  return heroRef;
}
