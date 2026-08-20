import { createFlywheelAdapter } from "@embodied-agent/domain-sdk";

export const runDomainFlywheel = createFlywheelAdapter({
  packId: "agriculture",
  command: ["bash", "scripts/domain-flywheel-agriculture.sh"],
  allowedArgs: ["--allow-skip"],
});
