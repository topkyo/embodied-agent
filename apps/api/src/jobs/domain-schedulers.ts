import { startDigestScheduler, stopDigestScheduler } from "../digest/scheduler.js";
import { startNdviScheduler, stopNdviScheduler } from "../integrations/satellite/scheduler.js";
import {
  startWeatherProactiveScheduler,
  stopWeatherProactiveScheduler,
} from "../weather/scheduler.js";

export function stopDomainCapabilitySchedulers(): void {
  stopDigestScheduler();
  stopWeatherProactiveScheduler();
  stopNdviScheduler();
}

export function restartDomainCapabilitySchedulers(): void {
  stopDomainCapabilitySchedulers();
  startDigestScheduler();
  startWeatherProactiveScheduler();
  startNdviScheduler();
}
