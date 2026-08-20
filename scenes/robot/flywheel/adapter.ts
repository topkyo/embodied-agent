import { createFlywheelAdapter } from "@embodied-agent/domain-sdk";

export const runDomainFlywheel = createFlywheelAdapter({
  packId: "robotics",
  command: ["tsx", "scripts/domain-flywheel-robotics.ts"],
  rejectArgs: true,
});
