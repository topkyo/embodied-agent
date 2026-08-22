import {
  z,
  PHYSICAL_PULSE_MAX_SECONDS,
  baseIntent,
  pulseDurationSeconds,
} from "@embodied-agent/core/schemas/intent-primitives.js";

export { PHYSICAL_PULSE_MAX_SECONDS };

const emptyTarget = z.object({}).strict();

const targetGreenhouse = z
  .object({
    greenhouse_id: z.string().min(1).optional(),
    vent_id: z.string().min(1).optional(),
    zone_id: z.string().min(1).optional(),
    fan_id: z.string().min(1).optional(),
  })
  .strict();

const queryStatus = baseIntent.extend({
  skill: z.literal("greenhouse.query_status"),
  target: targetGreenhouse.extend({ greenhouse_id: z.string().min(1) }),
  parameters: z.object({}).strict().optional(),
});

const queryAllStatus = baseIntent.extend({
  skill: z.literal("greenhouse.query_all_status"),
  target: z.object({}).strict(),
  parameters: z.object({}).strict().optional(),
});

const openVent = baseIntent.extend({
  skill: z.literal("greenhouse.open_vent"),
  target: targetGreenhouse.extend({ greenhouse_id: z.string().min(1) }),
  parameters: z
    .object({
      duration_seconds: pulseDurationSeconds,
      vent_id: z.string().min(1).optional(),
    })
    .strict(),
});

const closeVent = baseIntent.extend({
  skill: z.literal("greenhouse.close_vent"),
  target: targetGreenhouse.extend({ greenhouse_id: z.string().min(1) }),
  parameters: z
    .object({
      duration_seconds: pulseDurationSeconds,
      vent_id: z.string().min(1).optional(),
    })
    .strict(),
});

const stopVent = baseIntent.extend({
  skill: z.literal("greenhouse.stop_vent"),
  target: targetGreenhouse.extend({ greenhouse_id: z.string().min(1) }),
  parameters: z
    .object({ vent_id: z.string().min(1).optional() })
    .strict()
    .optional(),
});

const fanStart = baseIntent.extend({
  skill: z.literal("fan.start"),
  target: targetGreenhouse.extend({ fan_id: z.string().min(1) }),
  parameters: z
    .object({
      duration_seconds: pulseDurationSeconds.optional(),
    })
    .strict()
    .optional(),
});

const fanStop = baseIntent.extend({
  skill: z.literal("fan.stop"),
  target: targetGreenhouse.extend({ fan_id: z.string().min(1) }),
  parameters: z.object({}).strict().optional(),
});

const setMode = baseIntent.extend({
  skill: z.literal("greenhouse.set_mode"),
  target: targetGreenhouse.extend({ greenhouse_id: z.string().min(1) }),
  parameters: z.object({
    mode: z.enum(["night_vent", "off"]),
    max_temp_c: z.number().optional(),
    temp_high_c: z.number().optional(),
    temp_low_c: z.number().optional(),
    until_iso: z.string().datetime().optional(),
  }),
});

const irrigationStart = baseIntent.extend({
  skill: z.literal("irrigation.start"),
  target: z
    .object({
      zone_id: z.string().min(1),
      greenhouse_id: z.string().min(1).optional(),
    })
    .strict(),
  parameters: z
    .object({
      duration_seconds: pulseDurationSeconds,
    })
    .strict(),
});

const irrigationStop = baseIntent.extend({
  skill: z.literal("irrigation.stop"),
  target: z
    .object({
      zone_id: z.string().min(1),
      greenhouse_id: z.string().min(1).optional(),
    })
    .strict(),
  parameters: z.object({}).strict().optional(),
});

const irrigationQueryStatus = baseIntent.extend({
  skill: z.literal("irrigation.query_status"),
  target: z
    .object({
      zone_id: z.string().min(1).optional(),
    })
    .strict(),
  parameters: z.object({}).strict().optional(),
});

const setThreshold = baseIntent.extend({
  skill: z.literal("alert.set_threshold"),
  target: targetGreenhouse.extend({ greenhouse_id: z.string().min(1) }),
  parameters: z.object({
    metric: z.enum(["temperature_c", "humidity_percent"]),
    operator: z.enum([">", "<", ">=", "<="]),
    value: z.number(),
    duration_seconds: z.number().int().positive().optional(),
  }),
});

const queryThreshold = baseIntent.extend({
  skill: z.literal("alert.query_threshold"),
  target: targetGreenhouse,
  parameters: z.object({}).strict().optional(),
});

const clearThreshold = baseIntent.extend({
  skill: z.literal("alert.clear_threshold"),
  target: targetGreenhouse.extend({ greenhouse_id: z.string().min(1) }),
  parameters: z
    .object({
      metric: z.enum(["temperature_c", "humidity_percent"]).optional(),
    })
    .strict()
    .optional(),
});

const queryAlertToday = baseIntent.extend({
  skill: z.literal("alert.query_today"),
  target: targetGreenhouse.extend({
    greenhouse_id: z.string().min(1).optional(),
  }),
  parameters: z.object({}).strict().optional(),
});

const queryLogToday = baseIntent.extend({
  skill: z.literal("log.query_today"),
  target: targetGreenhouse.extend({
    greenhouse_id: z.string().min(1).optional(),
  }),
  parameters: z.object({}).strict().optional(),
});

const setReportSchedule = baseIntent.extend({
  skill: z.literal("report.set_schedule"),
  target: emptyTarget,
  parameters: z.object({
    greenhouse_ids: z.array(z.string().min(1)).min(1),
    interval_minutes: z
      .number()
      .int()
      .positive()
      .max(24 * 60),
  }),
});

const cancelReportSchedule = baseIntent.extend({
  skill: z.literal("report.cancel_schedule"),
  target: emptyTarget,
  parameters: z.object({}).strict().optional(),
});

const queryReportSchedule = baseIntent.extend({
  skill: z.literal("report.query_schedule"),
  target: emptyTarget,
  parameters: z.object({}).strict().optional(),
});

const queryCommandStatus = baseIntent.extend({
  skill: z.literal("command.query_status"),
  target: z
    .object({
      greenhouse_id: z.string().min(1).optional(),
    })
    .strict(),
  parameters: z
    .object({
      command_id: z.string().min(1).optional(),
      recent: z.boolean().optional(),
      action: z.string().min(1).optional(),
    })
    .strict(),
});

const weatherQueryForecast = baseIntent.extend({
  skill: z.literal("weather.query_forecast"),
  target: emptyTarget,
  parameters: z
    .object({
      hours: z.number().int().positive().max(72).optional(),
    })
    .strict()
    .optional(),
});

const weatherQueryAlert = baseIntent.extend({
  skill: z.literal("weather.query_alert"),
  target: emptyTarget,
  parameters: z.object({}).strict().optional(),
});

const satelliteQueryNdvi = baseIntent.extend({
  skill: z.literal("satellite.query_ndvi"),
  target: targetGreenhouse
    .extend({
      greenhouse_id: z.string().min(1).optional(),
      plot_id: z.string().min(1).optional(),
    })
    .refine((target) => Boolean(target.greenhouse_id || target.plot_id), {
      message: "satellite.query_ndvi requires greenhouse_id or plot_id",
    }),
  parameters: z.object({}).strict().optional(),
});

const agronomyQueryPest = baseIntent.extend({
  skill: z.literal("agronomy.query_pest"),
  target: emptyTarget,
  parameters: z
    .object({
      query: z.string().min(1),
    })
    .strict(),
});

const tasksQueryTask = baseIntent.extend({
  skill: z.literal("tasks.query_task"),
  target: emptyTarget,
  parameters: z
    .object({
      status: z.enum(["pending", "done", "all"]).optional(),
    })
    .strict()
    .optional(),
});

const tasksCreateTask = baseIntent.extend({
  skill: z.literal("tasks.create_task"),
  target: emptyTarget,
  parameters: z
    .object({
      title: z.string().min(1),
      due_date: z.string().min(1).optional(),
      greenhouse_id: z.string().min(1).optional(),
    })
    .strict(),
});

const adviceQueryWeekly = baseIntent.extend({
  skill: z.literal("advice.query_weekly"),
  target: emptyTarget,
  parameters: z.object({}).strict().optional(),
});

const policyApplySuggestion = baseIntent.extend({
  skill: z.literal("policy.apply_suggestion"),
  target: emptyTarget,
  parameters: z
    .object({
      suggestion_index: z.number().int().min(1).optional(),
      suggestion_id: z.string().min(1).optional(),
    })
    .strict()
    .optional(),
});

export const greenhouseIntentSchemas = [
  queryStatus,
  queryAllStatus,
  openVent,
  closeVent,
  stopVent,
  setMode,
  fanStart,
  fanStop,
  irrigationStart,
  irrigationStop,
  irrigationQueryStatus,
  setThreshold,
  queryThreshold,
  clearThreshold,
  queryAlertToday,
  queryLogToday,
  setReportSchedule,
  cancelReportSchedule,
  queryReportSchedule,
  queryCommandStatus,
  weatherQueryForecast,
  weatherQueryAlert,
  satelliteQueryNdvi,
  agronomyQueryPest,
  tasksQueryTask,
  tasksCreateTask,
  adviceQueryWeekly,
  policyApplySuggestion,
] as const;

export type GreenhouseIntentPayload = z.infer<(typeof greenhouseIntentSchemas)[number]>;
