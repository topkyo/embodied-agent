import {
  configurePlatformDomainServiceCatalog,
  registerPackBoundDomainServices,
  syncActivePackBoundDomainServices,
  type PlatformRuntimeContext,
} from "@embodied-agent/runtime";
import type { DomainPackContract } from "@embodied-agent/core";
import { buildWeeklyAdviceText } from "../advice/weekly-threshold.js";
import { queryAlertEventsToday } from "../alerts/alert-events.js";
import {
  filterAlertRules,
  formatAlertRule,
  removeAlertRule,
  setAlertRule,
} from "../alerts/threshold-store.js";
import { findCommandsForUser, getCommand, listCommands } from "../commands/store.js";
import { appendOperationLog, queryLogsToday } from "../db/log.js";
import { packBoundServiceImplementations } from "./pack-bound-service-implementations.js";
import { setPendingClarification } from "../policy/pending-clarification.js";
import { loadRegistry } from "@embodied-agent/node";
import {
  disableSchedulesForUser,
  listSchedulesForUser,
  upsertSchedule,
} from "../report/schedule-store.js";
import { applyPolicySuggestion, listPolicySuggestions } from "../scene/policy-suggestions.js";
import { handleWeatherSkill } from "../skills/handlers/weather.js";
import { createSceneTask, listSceneTasks } from "../tasks/tasks-store.js";
import { getAllTelemetry, getTelemetry } from "../telemetry/store.js";
import { appendDomainDataRow, listDomainDataRows } from "./domain-data-store.js";
import { getSceneMode } from "@embodied-agent/runtime";
import { getPlatformRuntimeContext } from "../runtime/context.js";

const platformDomainServices = {
  commands: {
    get: getCommand,
    findForUser: findCommandsForUser,
    list: listCommands,
  },
  deviceRegistry: {
    entityIdFromDeviceId(deviceId: string): string | undefined {
      return loadRegistry().devices.find((device) => device.device_id === deviceId)?.entity_id;
    },
    listDevices: () => loadRegistry().devices,
  },
  telemetry: {
    getByEntityId: getTelemetry,
    getAll: getAllTelemetry,
  },
  mode: {
    getByEntityId: (entityId: string) => getSceneMode(getPlatformRuntimeContext(), entityId),
  },
  alertRules: {
    filter: filterAlertRules,
    format: formatAlertRule,
  },
  reportSchedules: {
    listForUser: listSchedulesForUser,
  },
  alertEvents: {
    queryToday: queryAlertEventsToday,
  },
  operationLogs: {
    queryToday: queryLogsToday,
  },
  domainDataStore: {
    append: appendDomainDataRow,
    list: listDomainDataRows,
  },
  sceneTasks: {
    create: createSceneTask,
    list: listSceneTasks,
  },
  weeklyAdvice: {
    buildText: buildWeeklyAdviceText,
  },
  policySuggestions: {
    list: listPolicySuggestions,
    apply: applyPolicySuggestion,
  },
  weather: {
    handle: handleWeatherSkill,
  },
} as const;

/**
 * 显式初始化平台 domain service catalog 与 runtime services。
 * 消除 import-time 副作用：原本在模块加载时立即调用 configure*，现改为由 runtime init / 测试 setup 显式调用。
 * 幂等：基于 holder 状态判断，同一 ctx 重复调用安全。
 */
export function initPlatformDomainServices(ctx: PlatformRuntimeContext): void {
  if (ctx.services.hasCatalog()) return;
  configurePlatformDomainServiceCatalog(ctx.services, platformDomainServices);
  ctx.services.configureRuntimeServices({
    preDispatchServices: {
      pendingClarification: {
        set: setPendingClarification,
      },
      operationLogs: {
        append: appendOperationLog,
      },
      alertRules: {
        set: setAlertRule,
        remove: removeAlertRule,
      },
      reportSchedules: {
        upsert: upsertSchedule,
        disableForUser: disableSchedulesForUser,
      },
    },
  });
}

/** @internal tests */
export function resetPlatformDomainServicesForTest(): void {
  // ctx 模式下幂等性基于 holder.hasCatalog()，无需模块级 flag 重置。
  // 保留此函数以兼容既有测试 import；调用方应通过创建新 ctx 来获得干净状态。
}

/**
 * 按 active contract 的 requiredServices 自动挑选 pack-bound service 实现并 register + sync。
 * Domain Pack 通过 contract.capabilities[].requiredServices 声明依赖；apps/api 按 serviceKey 提供 impl。
 * 新增 pack 复用已有 serviceKey 无需改本表；全新外部集成仍需在 packBoundServiceImplementations 追加实现。
 */
export function syncActivePackServicesForContract(
  ctx: PlatformRuntimeContext,
  packId: string,
  contract: DomainPackContract,
): void {
  const requiredKeys = new Set<string>();
  for (const capability of contract.capabilities) {
    for (const key of capability.requiredServices ?? []) {
      requiredKeys.add(key);
    }
  }
  const picked: Record<string, unknown> = {};
  for (const key of requiredKeys) {
    const impl = packBoundServiceImplementations[key];
    if (impl) {
      picked[key] = impl;
    }
  }
  if (Object.keys(picked).length > 0) {
    registerPackBoundDomainServices(ctx.services, packId, picked);
  }
  syncActivePackBoundDomainServices(ctx.services, packId);
}

export { syncActivePackBoundDomainServices };
