import { createFlywheelAdapter } from "@embodied-agent/domain-sdk";

export const runDomainFlywheel = createFlywheelAdapter({
  packId: "industrial",
  command: ["tsx", "scripts/domain-flywheel-industrial.ts"],
  rejectArgs: true,
});
