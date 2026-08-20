import { createLogger } from "@embodied-agent/platform";
import { hasActiveWeatherProactive } from "@embodied-agent/runtime";
import { evaluateWeatherProactivePush } from "./proactive-push.js";
import { getPlatformRuntimeContext } from "../runtime/context.js";

const log = createLogger("weather");

let timer: ReturnType<typeof setInterval> | null = null;

export function startWeatherProactiveScheduler(): void {
  if (timer) return;
  if (!hasActiveWeatherProactive(getPlatformRuntimeContext())) return;
  timer = setInterval(
    () => {
      void evaluateWeatherProactivePush().catch((err) => {
        log.warn("proactive push error", { error: String(err) });
      });
    },
    60 * 60 * 1000,
  );
  void evaluateWeatherProactivePush().catch((err) => {
    log.warn("proactive push initial fire error", { error: String(err) });
  });
}

export function stopWeatherProactiveScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
