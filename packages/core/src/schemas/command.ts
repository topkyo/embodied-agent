import { z } from "zod";
import { deviceTypeSchema } from "./device.js";

export const commandActionSchema = z.string().min(1);

export const commandMessageSchema = z.object({
  message_type: z.literal("command"),
  protocol_version: z.literal("0.1"),
  command_id: z.string().min(1),
  intent_id: z.string().min(1).optional(),
  idempotency_key: z.string().min(1),
  deployment_id: z.string().min(1),
  entity_id: z.string().min(1).optional(),
  node_id: z.string().min(1),
  node_token: z.string().min(1).optional(),
  config_version: z.number().int().nonnegative().optional(),
  device_id: z.string().min(1),
  device_type: deviceTypeSchema,
  action: commandActionSchema,
  parameters: z.record(z.unknown()).optional(),
  safety_limits: z
    .object({
      max_duration_seconds: z.number().int().positive().optional(),
      require_manual_override_clear: z.boolean().optional(),
      require_limit_switch_check: z.boolean().optional(),
      interlock_group: z.string().optional(),
    })
    .optional(),
  issued_by: z.object({
    user_id: z.string().min(1),
    role: z.string().min(1),
    platform: z.string().min(1),
    conversation_id: z.string().min(1),
  }),
  created_at: z.string().datetime(),
  expires_at: z.string().datetime(),
});

export const commandEventSchema = z.object({
  message_type: z.literal("command_event"),
  protocol_version: z.literal("0.1"),
  event_id: z.string().min(1),
  command_id: z.string().min(1),
  idempotency_key: z.string().min(1),
  deployment_id: z.string().min(1),
  node_id: z.string().min(1),
  config_version: z.number().int().nonnegative().optional(),
  device_id: z.string().min(1),
  status: z.enum(["acknowledged", "running", "completed", "failed", "rejected"]),
  runtime_limit_seconds: z.number().int().positive().optional(),
  result: z.record(z.unknown()).optional(),
  error: z
    .object({
      code: z.string().min(1),
      message: z.string().min(1),
    })
    .optional(),
  occurred_at: z.string().datetime(),
});

export type CommandMessage = z.infer<typeof commandMessageSchema>;
export type CommandEvent = z.infer<typeof commandEventSchema>;

export const nodeEventSchema = z.object({
  message_type: z.literal("node_event"),
  protocol_version: z.literal("0.1"),
  event_id: z.string().min(1),
  event_type: z.enum(["config_applied", "config_rejected"]),
  deployment_id: z.string().min(1),
  node_id: z.string().min(1),
  node_token: z.string().min(1).optional(),
  config_version: z.number().int().nonnegative(),
  occurred_at: z.string().datetime(),
  error: z
    .object({
      code: z.string().min(1),
      message: z.string().min(1),
    })
    .optional(),
});

export type NodeEvent = z.infer<typeof nodeEventSchema>;
