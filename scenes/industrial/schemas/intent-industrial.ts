import { z, baseIntent } from "@embodied-agent/core/schemas/intent-primitives.js";

const targetCabinet = z
  .object({
    cabinet_id: z.string().min(1).optional(),
  })
  .strict();

const queryStatus = baseIntent.extend({
  skill: z.literal("industrial.query_status"),
  target: targetCabinet,
  parameters: z.object({}).strict().optional(),
});

const commandQueryStatus = baseIntent.extend({
  skill: z.literal("command.query_status"),
  target: targetCabinet,
  parameters: z
    .object({
      command_id: z.string().min(1).optional(),
      recent: z.boolean().optional(),
      action: z.enum(["start_exhaust", "stop_exhaust", "start", "stop"]).optional(),
    })
    .strict()
    .optional(),
});

const startExhaust = baseIntent.extend({
  skill: z.literal("industrial.start_exhaust"),
  target: targetCabinet,
  parameters: z
    .object({
      duration_seconds: z.number().int().min(60).max(3600),
    })
    .strict(),
});

const stopExhaust = baseIntent.extend({
  skill: z.literal("industrial.stop_exhaust"),
  target: targetCabinet,
  parameters: z.object({}).strict().optional(),
});

export const industrialIntentSchemas = [
  queryStatus,
  commandQueryStatus,
  startExhaust,
  stopExhaust,
] as const;
