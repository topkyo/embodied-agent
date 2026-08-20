import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { MemoryJournal } from "../journal.js";
import { createSqliteMemoryJournal } from "./sqlite.js";

const DEPLOYMENT_ID = "dep-industrial-ci-001";

function record(commandId: string) {
  return {
    command_id: commandId,
    command: {
      command_id: commandId,
      deployment_id: DEPLOYMENT_ID,
      action: "start",
      issued_by: { user_id: "u1" },
    },
    status: "created",
    updated_at: "2026-07-03T00:00:00.000Z",
  };
}

describe("SqliteMemoryJournal", () => {
  const journals: MemoryJournal[] = [];

  function createJournal(): MemoryJournal {
    const dataRoot = mkdtempSync(join(tmpdir(), "memory-sqlite-test-"));
    const journal = createSqliteMemoryJournal({
      dataRoot,
      commandBackend: "sqlite",
      sqlitePath: join(dataRoot, "commands.sqlite"),
    });
    journals.push(journal);
    return journal;
  }

  afterEach(() => {
    for (const journal of journals.splice(0)) journal.closeSqlite?.();
  });

  it("requires explicit sqlitePath", () => {
    expect(() =>
      createSqliteMemoryJournal({
        dataRoot: mkdtempSync(join(tmpdir(), "memory-sqlite-test-")),
        commandBackend: "sqlite",
      }),
    ).toThrow(/SQLITE_PATH/);
  });

  it("appends and reloads commands", () => {
    const journal = createJournal();
    journal.appendCommand(DEPLOYMENT_ID, record("cmd-1"));
    journal.upsertCommand?.({ ...record("cmd-1"), status: "completed" });

    const loaded = journal.loadCommands(DEPLOYMENT_ID) as Array<{ status: string }>;
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.status).toBe("completed");
    expect(journal.getCommand?.("cmd-1", DEPLOYMENT_ID)).toBeDefined();
  });

  it("appendCommand partitions by explicit deploymentId when record lacks one", () => {
    const journal = createJournal();
    const withoutDeployment = {
      ...record("cmd-no-dep"),
      command: { command_id: "cmd-no-dep", action: "start" },
    };
    journal.appendCommand(DEPLOYMENT_ID, withoutDeployment);
    const loaded = journal.loadCommands(DEPLOYMENT_ID) as Array<{ command_id: string }>;
    expect(loaded.map((r) => r.command_id)).toContain("cmd-no-dep");
  });

  it("upsertCommand throws when deployment_id is missing everywhere", () => {
    const journal = createJournal();
    const withoutDeployment = {
      ...record("cmd-no-dep-2"),
      command: { command_id: "cmd-no-dep-2", action: "start" },
    };
    expect(() => journal.upsertCommand?.(withoutDeployment)).toThrow(/deployment_id/);
  });

  it("keeps journals with different sqlitePath isolated in the same process", () => {
    const journalA = createJournal();
    const journalB = createJournal();

    journalA.appendCommand(DEPLOYMENT_ID, record("cmd-a"));
    journalB.appendCommand(DEPLOYMENT_ID, record("cmd-b"));

    const idsA = (journalA.loadCommands(DEPLOYMENT_ID) as Array<{ command_id: string }>).map(
      (r) => r.command_id,
    );
    const idsB = (journalB.loadCommands(DEPLOYMENT_ID) as Array<{ command_id: string }>).map(
      (r) => r.command_id,
    );

    expect(idsA).toEqual(["cmd-a"]);
    expect(idsB).toEqual(["cmd-b"]);
  });

  it("closeSqlite only closes its own path and allows reopening", () => {
    const journalA = createJournal();
    const journalB = createJournal();

    journalA.appendCommand(DEPLOYMENT_ID, record("cmd-a"));
    journalB.appendCommand(DEPLOYMENT_ID, record("cmd-b"));

    journalA.closeSqlite?.();
    expect(
      (journalB.loadCommands(DEPLOYMENT_ID) as Array<{ command_id: string }>).map(
        (r) => r.command_id,
      ),
    ).toEqual(["cmd-b"]);

    // 重新访问 A 的路径会重开连接，数据仍在。
    expect(
      (journalA.loadCommands(DEPLOYMENT_ID) as Array<{ command_id: string }>).map(
        (r) => r.command_id,
      ),
    ).toEqual(["cmd-a"]);
  });

  it("queryCommands filters user_id/action/entity_id, orders by updated_at desc, and applies limit", () => {
    const journal = createJournal();
    // match-older 先插入且 command_id 字典序在前，确保结果顺序只能来自 ORDER BY updated_at DESC。
    const rows = [
      {
        command_id: "a-match-older",
        command: {
          command_id: "a-match-older",
          deployment_id: DEPLOYMENT_ID,
          action: "open",
          entity_id: "gh-001",
          issued_by: { user_id: "u1" },
        },
        status: "created",
        updated_at: "2026-07-03T02:00:00.000Z",
      },
      {
        command_id: "b-match-newest",
        command: {
          command_id: "b-match-newest",
          deployment_id: DEPLOYMENT_ID,
          action: "open",
          entity_id: "gh-001",
          issued_by: { user_id: "u1" },
        },
        status: "created",
        updated_at: "2026-07-03T03:00:00.000Z",
      },
      {
        command_id: "wrong-user",
        command: {
          command_id: "wrong-user",
          deployment_id: DEPLOYMENT_ID,
          action: "open",
          entity_id: "gh-001",
          issued_by: { user_id: "u2" },
        },
        status: "created",
        updated_at: "2026-07-03T04:00:00.000Z",
      },
      {
        command_id: "wrong-action",
        command: {
          command_id: "wrong-action",
          deployment_id: DEPLOYMENT_ID,
          action: "close",
          entity_id: "gh-001",
          issued_by: { user_id: "u1" },
        },
        status: "created",
        updated_at: "2026-07-03T05:00:00.000Z",
      },
      {
        command_id: "missing-entity",
        command: {
          command_id: "missing-entity",
          deployment_id: DEPLOYMENT_ID,
          action: "open",
          device_id: "vent-sim-gh-001",
          issued_by: { user_id: "u1" },
        },
        status: "created",
        updated_at: "2026-07-03T06:00:00.000Z",
      },
    ];
    for (const row of rows) {
      journal.upsertCommand?.(row);
    }

    const filtered = journal.queryCommands(DEPLOYMENT_ID, {
      user_id: "u1",
      action: "open",
      entity_id: "gh-001",
      limit: 2,
    }) as Array<{ command_id: string }>;

    expect(filtered.map((r) => r.command_id)).toEqual(["b-match-newest", "a-match-older"]);

    const limited = journal.queryCommands(DEPLOYMENT_ID, {
      user_id: "u1",
      action: "open",
      entity_id: "gh-001",
      limit: 1,
    }) as Array<{ command_id: string }>;
    expect(limited.map((r) => r.command_id)).toEqual(["b-match-newest"]);
  });
});
