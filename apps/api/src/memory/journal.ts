import { createMemoryJournal, type MemoryJournal } from "@embodied-agent/memory";
import { dataRoot } from "../fs/deployment-path.js";
import { commandStoreBackend, sqlitePath } from "../state/config.js";

let journal: MemoryJournal | null = null;
let journalDataRoot: string | null = null;

export function getMemoryJournal(): MemoryJournal {
  const root = dataRoot();
  if (!journal || journalDataRoot !== root) {
    journal?.closeSqlite?.();
    journal = createMemoryJournal({
      dataRoot: root,
      commandBackend: commandStoreBackend(),
      sqlitePath: sqlitePath(),
    });
    journalDataRoot = root;
  }
  return journal;
}

export function resetMemoryJournalForTest(): void {
  journal?.closeSqlite?.();
  journal = null;
  journalDataRoot = null;
}
