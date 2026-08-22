import { z } from "zod";

export const deploymentSchema = z.object({
  deployment_id: z.string().min(1),
  name: z.string().min(1),
  timezone: z.string().min(1),
  status: z.enum(["active", "disabled"]),
});

export const registryEntitySchema = z.object({
  entity_id: z.string().min(1),
  entity_type: z.string().min(1),
  domain_id: z.string().min(1),
  deployment_id: z.string().min(1),
  name: z.string().min(1),
  aliases: z.array(z.string().min(1)),
  status: z.enum(["active", "disabled"]),
  metadata: z.record(z.unknown()).optional(),
});

export const deviceTypeSchema = z.string().min(1);

export const nodeStatusSchema = z.enum(["pending", "active", "disabled", "maintenance"]);

export const nodeSchema = z.object({
  node_id: z.string().min(1),
  deployment_id: z.string().min(1),
  entity_id: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  firmware_version: z.string().optional(),
  config_version: z.number().int().nonnegative().optional(),
  status: nodeStatusSchema,
  registered_at: z.string().datetime().optional(),
  last_seen_at: z.string().datetime().optional(),
});

export const deviceSchema = z.object({
  device_id: z.string().min(1),
  deployment_id: z.string().min(1),
  entity_id: z.string().min(1).optional(),
  device_type: deviceTypeSchema,
  name: z.string().min(1),
  aliases: z.array(z.string().min(1)),
  node_id: z.string().min(1),
  status: z.enum(["active", "offline", "maintenance", "disabled"]),
  capabilities: z.array(z.string().min(1)).optional(),
  transport: z.string().min(1).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type Deployment = z.infer<typeof deploymentSchema>;
export type RegistryEntity = z.infer<typeof registryEntitySchema>;
export type Device = z.infer<typeof deviceSchema>;
export type Node = z.infer<typeof nodeSchema>;
export type NodeStatus = z.infer<typeof nodeStatusSchema>;
