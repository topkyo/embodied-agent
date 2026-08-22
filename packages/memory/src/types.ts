/** Persisted command journal row (deployment-scoped JSONL / SQLite). */
export type CommandJournalRecord = {
  command_id: string;
  command: Record<string, unknown>;
  status: string;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
};

export type CommandFilter = {
  user_id?: string;
  action?: string;
  entity_id?: string;
  limit?: number;
};

export type OutcomeRecord = {
  ts: string;
  deployment_id: string;
  [key: string]: unknown;
};

export type IntentFailureRecord = {
  id: string;
  utterance: string;
  recorded_at: string;
  [key: string]: unknown;
};

export type MemoryJournalConfig = {
  dataRoot: string;
  commandBackend: "file" | "sqlite";
  sqlitePath?: string;
};
