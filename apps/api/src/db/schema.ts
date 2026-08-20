import type { SkillName } from "@embodied-agent/core";

/** SQLite/Drizzle-ready row shape for operation_logs (MVP in-memory impl in log.ts). */
export type OperationLogRow = {
  id: string;
  ts: string;
  user_id: string;
  skill: SkillName;
  intent_source: "llm";
  model: string;
  params_json: string;
  result: "completed" | "sent" | "rejected" | "clarification" | "failed";
  message: string;
};

export const OPERATION_LOGS_TABLE = "operation_logs";
