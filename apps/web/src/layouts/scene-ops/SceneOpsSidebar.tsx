import { useEffect, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { useLanguage } from "../../contexts/LanguageContext";
import { type NavGroup, type NavGroupId } from "./types";

type SceneOpsSidebarProps = {
  base: string;
  navGroups: NavGroup[];
  drawerOpen: boolean;
  setDrawerOpen: (value: boolean) => void;
  isMobile: boolean;
  sidebarId: string;
  /** Narrow viewports: secondary actions live in the drawer foot. */
  onUnbindClick: () => void;
};

export function SceneOpsSidebar({
  base,
  navGroups,
  drawerOpen,
  setDrawerOpen,
  isMobile,
  sidebarId,
  onUnbindClick,
}: SceneOpsSidebarProps) {
  const { t } = useLanguage();
  const [collapsedGroups, setCollapsedGroups] = useState<Partial<Record<NavGroupId, boolean>>>({});
  const sidebarHidden = isMobile && !drawerOpen;

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen, setDrawerOpen]);

  const toggleGroup = (groupId: NavGroupId) => {
    setCollapsedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  return (
    <>
      <aside
        id={sidebarId}
        className={`console-sidebar${drawerOpen ? " open" : ""}`}
        aria-label={t("sceneOps.nav.label")}
        aria-hidden={sidebarHidden || undefined}
        {...(sidebarHidden ? { inert: true } : {})}
      >
        <nav className="console-sidebar-nav">
          {navGroups.map((group) => {
            const open = !collapsedGroups[group.id];
            const panelId = `${sidebarId}-${group.id}`;
            return (
              <div key={group.id} className="console-nav-group" data-group={group.id}>
                <button
                  type="button"
                  className="console-nav-group-toggle"
                  aria-expanded={open}
                  aria-controls={panelId}
                  onClick={() => toggleGroup(group.id)}
                >
                  <span className="console-nav-group-label">{t(group.key)}</span>
                  <ChevronDown
                    size={14}
                    aria-hidden
                    className={`console-nav-group-chevron${open ? " is-open" : ""}`}
                  />
                </button>
                <div
                  id={panelId}
                  className={`console-nav-group-panel${open ? " is-open" : ""}`}
                  role="group"
                  aria-label={t(group.key)}
                >
                  <div className="console-nav-group-panel-inner">
                    {group.items.map((item) => (
                      <NavLink
                        key={item.to || "index"}
                        to={item.to ? `${base}/${item.to}` : base}
                        end={item.end}
                        onClick={() => setDrawerOpen(false)}
                      >
                        <item.icon size={17} aria-hidden />
                        {item.key ? t(item.key) : item.label}
                      </NavLink>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </nav>
        <div className="console-sidebar-foot ops-console-sidebar-secondary">
          <Link to="/start" className="link-accent-sm" onClick={() => setDrawerOpen(false)}>
            {t("nav.backStart")}
          </Link>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setDrawerOpen(false);
              onUnbindClick();
            }}
            data-testid="ops-unbind-drawer"
          >
            {t("sceneOps.unbind.topbarLabel")}
          </button>
        </div>
      </aside>
      {drawerOpen && (
        <button
          type="button"
          className="console-drawer-backdrop"
          aria-label={t("console.nav.close")}
          onClick={() => setDrawerOpen(false)}
        />
      )}
    </>
  );
}
