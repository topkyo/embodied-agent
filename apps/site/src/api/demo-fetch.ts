import type { AdminOverview } from "./settings.js";
import { resolveDemoApiBase, type DemoSceneSlug } from "../demo/config.js";

export class DemoFetchError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "DemoFetchError";
  }
}

export async function fetchDemoOverview(scene: DemoSceneSlug): Promise<AdminOverview> {
  const base = resolveDemoApiBase(scene);
  if (!base) {
    throw new DemoFetchError("demo_api_not_configured", 0);
  }
  const res = await fetch(`${base}/admin/overview`);
  if (!res.ok) {
    throw new DemoFetchError(`demo_overview_http_${res.status}`, res.status);
  }
  return (await res.json()) as AdminOverview;
}
