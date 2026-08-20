export type DemoSceneSlug = "greenhouse" | "robot" | "industrial";

const DEMO_API_ENV: Record<DemoSceneSlug, keyof ImportMetaEnv> = {
  greenhouse: "VITE_DEMO_API_GREENHOUSE",
  robot: "VITE_DEMO_API_ROBOT",
  industrial: "VITE_DEMO_API_INDUSTRIAL",
};

export function resolveDemoApiBase(scene: DemoSceneSlug): string | null {
  const raw = import.meta.env[DEMO_API_ENV[scene]]?.trim();
  if (!raw) return null;
  return raw.replace(/\/$/, "");
}

export function hasDemoApiConfigured(scene: DemoSceneSlug): boolean {
  return resolveDemoApiBase(scene) != null;
}
