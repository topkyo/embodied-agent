import type {
  CommandFilter,
  CommandJournalRecord,
  IntentFailureRecord,
  OutcomeRecord,
} from "./types.js";

export type { CommandFilter, CommandJournalRecord, IntentFailureRecord, OutcomeRecord };

/** Deployment-scoped persistence port (spec §8). */
export interface MemoryJournal {
  loadCommands(deploymentId: string): CommandJournalRecord[];
  saveCommands(deploymentId: string, records: CommandJournalRecord[]): void;
  appendCommand(deploymentId: string, record: CommandJournalRecord): void;
  queryCommands(deploymentId: string, filter: CommandFilter): CommandJournalRecord[];

  appendOutcome(deploymentId: string, record: OutcomeRecord): void;
  readOutcomeLines(deploymentId: string): string[];
  writeOutcomeLines(deploymentId: string, lines: string[]): void;

  loadIntentFailures(deploymentId: string): IntentFailureRecord[];
  saveIntentFailures(deploymentId: string, records: IntentFailureRecord[]): void;
  appendIntentFailure(deploymentId: string, record: IntentFailureRecord): void;

  /** Sqlite command backend only */
  upsertCommand?(record: CommandJournalRecord): void;
  getCommand?(commandId: string, deploymentId: string): CommandJournalRecord | undefined;
  deleteCommands?(deploymentId: string): void;
  importCommandsFromJsonl?(deploymentId: string): number;
  closeSqlite?(): void;
}
