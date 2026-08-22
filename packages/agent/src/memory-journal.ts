import { createMemoryJournal, type MemoryJournal } from "@embodied-agent/memory";
import { resolveAgentDataDir as dataRoot } from "@embodied-agent/platform";
import type { AgentRuntimeBindings } from "./runtime-bindings.js";

let journal: MemoryJournal | null = null;
let journalDataRoot: string | null = null;

export function getAgentMemoryJournal(bindings: AgentRuntimeBindings): MemoryJournal {
  const root = dataRoot();
  if (!journal || journalDataRoot !== root) {
    journal?.closeSqlite?.();
    const config = bindings.getMemoryJournalConfig();
    journal = createMemoryJournal({
      dataRoot: root,
      commandBackend: config.commandBackend,
      sqlitePath: config.sqlitePath,
    });
    journalDataRoot = root;
  }
  return journal;
}

/** @internal tests */
export function resetAgentMemoryJournalForTest(): void {
  journal?.closeSqlite?.();
  journal = null;
  journalDataRoot = null;
}
