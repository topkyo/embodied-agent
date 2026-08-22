import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type NavTheme = "dark" | "light";

const MarketingNavContext = createContext<{
  theme: NavTheme;
  setTheme: (t: NavTheme) => void;
} | null>(null);

export function MarketingNavProvider({
  children,
  initialTheme = "light",
}: {
  children: ReactNode;
  initialTheme?: NavTheme;
}) {
  const [theme, setTheme] = useState<NavTheme>(initialTheme);
  const value = useMemo(() => ({ theme, setTheme }), [theme]);
  return <MarketingNavContext.Provider value={value}>{children}</MarketingNavContext.Provider>;
}

export function useMarketingNav() {
  const ctx = useContext(MarketingNavContext);
  if (!ctx) throw new Error("useMarketingNav outside provider");
  return ctx;
}
