import { afterEach, describe, expect, it } from "vitest";
import Fastify from "fastify";
import { registerMetricsRoutes } from "./metrics.js";

describe("metrics routes", () => {
  const env = { ...process.env };

  afterEach(() => {
    process.env = { ...env };
  });

  it("allows unauthenticated scrape when no METRICS_SCRAPE_TOKEN", async () => {
    delete process.env.METRICS_SCRAPE_TOKEN;
    const app = Fastify();
    await registerMetricsRoutes(app);
    const res = await app.inject({ method: "GET", url: "/metrics" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("embodied_uptime_seconds");
    await app.close();
  });

  it("rejects missing token when METRICS_SCRAPE_TOKEN is set", async () => {
    process.env.METRICS_SCRAPE_TOKEN = "scrape-secret";
    const app = Fastify();
    await registerMetricsRoutes(app);
    const res = await app.inject({ method: "GET", url: "/metrics" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("accepts Bearer token when METRICS_SCRAPE_TOKEN is set", async () => {
    process.env.METRICS_SCRAPE_TOKEN = "scrape-secret";
    const app = Fastify();
    await registerMetricsRoutes(app);
    const res = await app.inject({
      method: "GET",
      url: "/metrics",
      headers: { authorization: "Bearer scrape-secret" },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it("accepts x-metrics-token when METRICS_SCRAPE_TOKEN is set", async () => {
    process.env.METRICS_SCRAPE_TOKEN = "scrape-secret";
    const app = Fastify();
    await registerMetricsRoutes(app);
    const res = await app.inject({
      method: "GET",
      url: "/metrics",
      headers: { "x-metrics-token": "scrape-secret" },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
