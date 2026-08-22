import type Database from "better-sqlite3";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { deploymentScopedPath } from "@embodied-agent/core";
import type { MemoryJournal } from "../journal.js";
import type { CommandJournalRecord, MemoryJournalConfig } from "../types.js";
import { createFileMemoryJournal } from "./file.js";

const COMMAND_LOG = "command-logs.jsonl";

const require = createRequire(import.meta.url);
type DatabaseFactory = typeof Database;
let DatabaseCtor: DatabaseFactory | null = null;
// 按 sqlitePath 缓存连接：同进程多个不同路径的 journal 必须各自独立，不允许串库。
const dbByPath = new Map<string, Database.Database>();

function loadDatabase(): DatabaseFactory {
  DatabaseCtor ??= require("better-sqlite3") as DatabaseFactory;
  return DatabaseCtor;
}

function database(sqlitePath: string): Database.Database {
  const cached = dbByPath.get(sqlitePath);
  if (cached) return cached;
  const dir = dirname(sqlitePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const Database = loadDatabase();
  const db = new Database(sqlitePath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS commands (
      deployment_id TEXT NOT NULL,
      command_id TEXT NOT NULL,
      record_json TEXT NOT NULL,
      status TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (deployment_id, command_id)
    );
    CREATE INDEX IF NOT EXISTS idx_commands_deployment_status ON commands(deployment_id, status);
  `);
  dbByPath.set(sqlitePath, db);
  return db;
}

/**
 * 分区键优先级：显式入参 > record.command.deployment_id；两者都缺失时抛错，
 * 不允许静默写入空分区（否则 loadCommands 永远查不到，等同于丢数据）。
 */
function resolveRecordDeploymentId(record: CommandJournalRecord, explicit?: string): string {
  const fromRecord = String(
    (record.command as { deployment_id?: string }).deployment_id ?? "",
  ).trim();
  const id = explicit?.trim() || fromRecord;
  if (!id) {
    throw new Error(`command ${record.command_id} 缺少 deployment_id，拒绝写入 sqlite 指令后端`);
  }
  return id;
}

function upsertRecord(
  sqlitePath: string,
  record: CommandJournalRecord,
  explicitDeploymentId?: string,
): void {
  const deployment_id = resolveRecordDeploymentId(record, explicitDeploymentId);
  database(sqlitePath)
    .prepare(
      `INSERT INTO commands (deployment_id, command_id, record_json, status, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(deployment_id, command_id) DO UPDATE SET
         record_json = excluded.record_json,
         status = excluded.status,
         updated_at = excluded.updated_at`,
    )
    .run(
      deployment_id,
      record.command_id,
      JSON.stringify(record),
      record.status,
      record.updated_at,
    );
}

export function createSqliteMemoryJournal(config: MemoryJournalConfig): MemoryJournal {
  if (!config.sqlitePath?.trim()) {
    throw new Error("COMMAND_STORE=sqlite 需要显式配置 SQLITE_PATH");
  }
  const sqlitePath = config.sqlitePath.trim();
  const fileJournal = createFileMemoryJournal(config);

  return {
    ...fileJournal,

    loadCommands(deploymentId: string): CommandJournalRecord[] {
      const rows = database(sqlitePath)
        .prepare(`SELECT record_json FROM commands WHERE deployment_id = ?`)
        .all(deploymentId) as { record_json: string }[];
      return rows.map((r) => JSON.parse(r.record_json) as CommandJournalRecord);
    },

    saveCommands(): void {
      throw new Error("saveCommands 不适用于 sqlite 指令后端");
    },

    appendCommand(deploymentId: string, record: CommandJournalRecord): void {
      upsertRecord(sqlitePath, record, deploymentId);
    },

    queryCommands(deploymentId: string, filter) {
      const conditions = ["deployment_id = ?"];
      const params: unknown[] = [deploymentId];
      if (filter.user_id) {
        conditions.push("json_extract(record_json, '$.command.issued_by.user_id') = ?");
        params.push(filter.user_id);
      }
      if (filter.action) {
        conditions.push("json_extract(record_json, '$.command.action') = ?");
        params.push(filter.action);
      }
      if (filter.entity_id) {
        conditions.push("json_extract(record_json, '$.command.entity_id') = ?");
        params.push(filter.entity_id);
      }
      let sql = `SELECT record_json FROM commands WHERE ${conditions.join(" AND ")} ORDER BY updated_at DESC`;
      if (filter.limit != null) {
        sql += " LIMIT ?";
        params.push(filter.limit);
      }
      const rows = database(sqlitePath)
        .prepare(sql)
        .all(...params) as { record_json: string }[];
      return rows.map((r) => JSON.parse(r.record_json) as CommandJournalRecord);
    },

    upsertCommand(record: CommandJournalRecord): void {
      upsertRecord(sqlitePath, record);
    },

    getCommand(commandId: string, deploymentId: string): CommandJournalRecord | undefined {
      const row = database(sqlitePath)
        .prepare(`SELECT record_json FROM commands WHERE deployment_id = ? AND command_id = ?`)
        .get(deploymentId, commandId) as { record_json: string } | undefined;
      if (!row) return undefined;
      return JSON.parse(row.record_json) as CommandJournalRecord;
    },

    deleteCommands(deploymentId: string): void {
      database(sqlitePath)
        .prepare(`DELETE FROM commands WHERE deployment_id = ?`)
        .run(deploymentId);
    },

    importCommandsFromJsonl(deploymentId: string): number {
      const path = deploymentScopedPath(config.dataRoot, deploymentId, COMMAND_LOG);
      if (!existsSync(path)) return 0;
      let count = 0;
      for (const line of readFileSync(path, "utf8").trim().split("\n")) {
        if (!line) continue;
        try {
          const record = JSON.parse(line) as CommandJournalRecord;
          upsertRecord(sqlitePath, record, deploymentId);
          count++;
        } catch {
          // skip
        }
      }
      return count;
    },

    closeSqlite(): void {
      const cached = dbByPath.get(sqlitePath);
      if (cached) {
        cached.close();
        dbByPath.delete(sqlitePath);
      }
    },
  };
}
