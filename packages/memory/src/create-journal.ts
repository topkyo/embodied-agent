import { createFileMemoryJournal } from "./backends/file.js";
import { createSqliteMemoryJournal } from "./backends/sqlite.js";
import type { MemoryJournal } from "./journal.js";
import type { MemoryJournalConfig } from "./types.js";

export function createMemoryJournal(config: MemoryJournalConfig): MemoryJournal {
  if (config.commandBackend === "sqlite") {
    return createSqliteMemoryJournal(config);
  }
  return createFileMemoryJournal(config);
}
