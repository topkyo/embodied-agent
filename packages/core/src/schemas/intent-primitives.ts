import { z } from "zod";

export { z };

/** 与固件 CMD_MAX_DURATION_MS 一致的单次脉冲上限（秒） */
export const PHYSICAL_PULSE_MAX_SECONDS = 3600 * 4;

export const pulseDurationSeconds = z.number().int().positive().max(PHYSICAL_PULSE_MAX_SECONDS);

export const baseIntent = z.object({
  intent_id: z.string().min(1).optional(),
  confidence: z.number().min(0).max(1).optional(),
  requires_confirmation: z.boolean().optional(),
  raw_text: z.string().optional(),
});
