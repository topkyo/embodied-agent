import type { DomainPackCommandHooks } from "@embodied-agent/core";
import {
  buildGreenhousePostIrrigationVentilationPlan,
  isGreenhousePostIrrigationCommand,
} from "./post-irrigation.js";
import { buildGreenhouseDeviceEfficiencyPlan } from "./device-efficiency.js";

/** greenhouse 场景调参：24h 内失败 ≥3 次触发设备效率通知。 */
const DEVICE_FAILURE_NOTIFY_THRESHOLD = 3;

export const GREENHOUSE_COMMAND_HOOKS: DomainPackCommandHooks = {
  buildCompletedCommandPlan({ command, entityId }) {
    if (!isGreenhousePostIrrigationCommand(command)) return null;
    if (!entityId) {
      throw new Error(`灌溉完成指令缺少 entity_id：${command.command_id}`);
    }
    return buildGreenhousePostIrrigationVentilationPlan(entityId);
  },

  buildDeviceFailurePlan({ deviceId, entityId, failureCount }) {
    return buildGreenhouseDeviceEfficiencyPlan({
      deviceId,
      greenhouseId: entityId,
      failureCount,
    });
  },

  shouldNotifyDeviceFailure({ failureCount }) {
    return failureCount >= DEVICE_FAILURE_NOTIFY_THRESHOLD;
  },
};
