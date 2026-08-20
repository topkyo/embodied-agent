import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { deploymentScopedPath } from "@embodied-agent/core";
import { atomicWriteText } from "@embodied-agent/platform";
import type { MemoryJournal } from "../journal.js";
import type {
  CommandFilter,
  CommandJournalRecord,
  IntentFailureRecord,
  MemoryJournalConfig,
  OutcomeRecord,
} from "../types.js";

const COMMAND_LOG = "command-logs.jsonl";
const OUTCOME_LOG = "scene-outcomes.jsonl";
const INTENT_FAILURES = "intent-failures.jsonl";

function readJsonlLines<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  const rows: T[] = [];
  for (const [index, line] of readFileSync(path, "utf8").trim().split("\n").entries()) {
    if (!line) continue;
    try {
      rows.push(JSON.parse(line) as T);
    } catch (e) {
      throw new Error(
        `JSONL 无法读取或校验失败：${path}:${index + 1} ${
          e instanceof Error ? e.message : String(e)
        }`,
        { cause: e },
      );
    }
  }
  return rows;
}

function latestByCommandId<T extends { command_id?: string; updated_at?: string }>(rows: T[]): T[] {
  const byId = new Map<string, T>();
  for (const row of rows) {
    const id = row.command_id?.trim();
    if (!id) continue;
    const existing = byId.get(id);
    if (!existing || (row.updated_at ?? "") >= (existing.updated_at ?? "")) {
      byId.set(id, row);
    }
  }
  return [...byId.values()];
}

function appendJsonlLine(path: string, record: unknown): void {
  mkdirSync(path.slice(0, path.lastIndexOf("/")), { recursive: true });
  appendFileSync(path, `${JSON.stringify(record)}\n`, "utf8");
}

function commandPath(dataRoot: string, deploymentId: string): string {
  return deploymentScopedPath(dataRoot, deploymentId, COMMAND_LOG);
}

function outcomePath(dataRoot: string, deploymentId: string): string {
  return deploymentScopedPath(dataRoot, deploymentId, OUTCOME_LOG);
}

function intentFailuresPath(dataRoot: string, deploymentId: string): string {
  return deploymentScopedPath(dataRoot, deploymentId, INTENT_FAILURES);
}

export function createFileMemoryJournal(config: MemoryJournalConfig): MemoryJournal {
  const { dataRoot } = config;

  return {
    loadCommands(deploymentId: string): CommandJournalRecord[] {
      return latestByCommandId(
        readJsonlLines<CommandJournalRecord>(commandPath(dataRoot, deploymentId)),
      );
    },

    saveCommands(deploymentId: string, records: CommandJournalRecord[]): void {
      atomicWriteText(
        commandPath(dataRoot, deploymentId),
        records.length > 0 ? `${records.map((r) => JSON.stringify(r)).join("\n")}\n` : "",
      );
    },

    appendCommand(deploymentId: string, record: CommandJournalRecord): void {
      appendJsonlLine(commandPath(dataRoot, deploymentId), record);
    },

    queryCommands(deploymentId: string, filter: CommandFilter): CommandJournalRecord[] {
      let rows = latestByCommandId(
        readJsonlLines<CommandJournalRecord>(commandPath(dataRoot, deploymentId)),
      );

      if (filter.user_id) {
        rows = rows.filter((r) => {
          const issuedBy = r.command.issued_by as { user_id?: string } | undefined;
          return issuedBy?.user_id === filter.user_id;
        });
      }
      if (filter.action) {
        rows = rows.filter((r) => r.command.action === filter.action);
      }
      if (filter.entity_id) {
        rows = rows.filter((r) => r.command.entity_id === filter.entity_id);
      }
      const limit = filter.limit ?? Number.MAX_SAFE_INTEGER;
      return rows
        .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""))
        .slice(0, limit);
    },

    appendOutcome(deploymentId: string, record: OutcomeRecord): void {
      const path = outcomePath(dataRoot, deploymentId);
      mkdirSync(path.slice(0, path.lastIndexOf("/")), { recursive: true });
      appendFileSync(path, `${JSON.stringify(record)}\n`, "utf8");
    },

    readOutcomeLines(deploymentId: string): string[] {
      const path = outcomePath(dataRoot, deploymentId);
      if (!existsSync(path)) return [];
      return readFileSync(path, "utf8").trim().split("\n").filter(Boolean);
    },

    writeOutcomeLines(deploymentId: string, lines: string[]): void {
      const path = outcomePath(dataRoot, deploymentId);
      mkdirSync(path.slice(0, path.lastIndexOf("/")), { recursive: true });
      writeFileSync(path, lines.length ? `${lines.join("\n")}\n` : "", "utf8");
    },

    loadIntentFailures(deploymentId: string): IntentFailureRecord[] {
      const rows = readJsonlLines<IntentFailureRecord & { id?: string; recorded_at?: string }>(
        intentFailuresPath(dataRoot, deploymentId),
      );
      const byId = new Map<string, IntentFailureRecord>();
      for (const row of rows) {
        const id = row.id?.trim();
        if (!id) continue;
        const existing = byId.get(id);
        if (!existing || (row.recorded_at ?? "") >= (existing.recorded_at ?? "")) {
          byId.set(id, row);
        }
      }
      return [...byId.values()];
    },

    saveIntentFailures(deploymentId: string, records: IntentFailureRecord[]): void {
      atomicWriteText(
        intentFailuresPath(dataRoot, deploymentId),
        records.length > 0 ? `${records.map((r) => JSON.stringify(r)).join("\n")}\n` : "",
      );
    },

    appendIntentFailure(deploymentId: string, record: IntentFailureRecord): void {
      const path = intentFailuresPath(dataRoot, deploymentId);
      mkdirSync(path.slice(0, path.lastIndexOf("/")), { recursive: true });
      appendFileSync(path, `${JSON.stringify(record)}\n`, "utf8");
    },
  };
}
