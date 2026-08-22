import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createMemoryJournal } from "./create-journal.js";

describe("FileMemoryJournal", () => {
  let dataRoot: string;

  afterEach(() => {
    delete process.env.AGENT_DATA_DIR;
  });

  it("writes and reads command logs under deployments/{id}/", () => {
    dataRoot = mkdtempSync(join(tmpdir(), "memory-test-"));
    const journal = createMemoryJournal({
      dataRoot,
      commandBackend: "file",
    });
    const deploymentId = "dep-gh-pilot-001";
    const record = {
      command_id: "cmd-1",
      command: {
        command_id: "cmd-1",
        deployment_id: deploymentId,
        action: "open",
        issued_by: { user_id: "u1" },
      },
      status: "created",
      created_at: "2026-06-10T00:00:00.000Z",
      updated_at: "2026-06-10T00:00:00.000Z",
    };

    journal.saveCommands(deploymentId, [record]);
    const loaded = journal.loadCommands(deploymentId);
    expect(loaded).toHaveLength(1);
    expect((loaded[0] as typeof record).command_id).toBe("cmd-1");

    const path = join(dataRoot, "deployments", deploymentId, "command-logs.jsonl");
    expect(readFileSync(path, "utf8")).toContain("cmd-1");
  });

  it("queryCommands filters by user_id", () => {
    dataRoot = mkdtempSync(join(tmpdir(), "memory-test-"));
    const journal = createMemoryJournal({
      dataRoot,
      commandBackend: "file",
    });
    const deploymentId = "dep-gh-pilot-001";
    journal.saveCommands(deploymentId, [
      {
        command_id: "a",
        command: { issued_by: { user_id: "u1" }, action: "open" },
        updated_at: "2026-06-10T02:00:00.000Z",
      },
      {
        command_id: "b",
        command: { issued_by: { user_id: "u2" }, action: "close" },
        updated_at: "2026-06-10T01:00:00.000Z",
      },
    ]);

    const rows = journal.queryCommands(deploymentId, {
      user_id: "u1",
      limit: 10,
    });
    expect(rows).toHaveLength(1);
    expect((rows[0] as { command_id: string }).command_id).toBe("a");
  });

  it("queryCommands filters by explicit entity_id", () => {
    dataRoot = mkdtempSync(join(tmpdir(), "memory-test-"));
    const journal = createMemoryJournal({
      dataRoot,
      commandBackend: "file",
    });
    const deploymentId = "dep-gh-pilot-001";
    journal.saveCommands(deploymentId, [
      {
        command_id: "a",
        command: { entity_id: "gh-001", action: "open" },
        updated_at: "2026-06-10T02:00:00.000Z",
      },
      {
        command_id: "b",
        command: { entity_id: "gh-002", action: "open" },
        updated_at: "2026-06-10T01:00:00.000Z",
      },
      {
        command_id: "c",
        command: { device_id: "vent-sim-gh-001", action: "open" },
        updated_at: "2026-06-10T00:00:00.000Z",
      },
    ]);

    const rows = journal.queryCommands(deploymentId, {
      entity_id: "gh-001",
      limit: 10,
    });
    expect(rows).toHaveLength(1);
    expect((rows[0] as { command_id: string }).command_id).toBe("a");
  });

  it("sqlite queryCommands filters by explicit entity_id", () => {
    dataRoot = mkdtempSync(join(tmpdir(), "memory-test-"));
    const journal = createMemoryJournal({
      dataRoot,
      commandBackend: "sqlite",
      sqlitePath: join(dataRoot, "commands.sqlite"),
    });
    const deploymentId = "dep-gh-pilot-001";
    const records = [
      {
        command_id: "a",
        command: {
          command_id: "a",
          deployment_id: deploymentId,
          entity_id: "gh-001",
          action: "open",
        },
        status: "created",
        updated_at: "2026-06-10T02:00:00.000Z",
      },
      {
        command_id: "b",
        command: {
          command_id: "b",
          deployment_id: deploymentId,
          entity_id: "gh-002",
          action: "open",
        },
        status: "created",
        updated_at: "2026-06-10T01:00:00.000Z",
      },
      {
        command_id: "c",
        command: {
          command_id: "c",
          deployment_id: deploymentId,
          device_id: "vent-sim-gh-001",
          action: "open",
        },
        status: "created",
        updated_at: "2026-06-10T00:00:00.000Z",
      },
    ];
    for (const record of records) {
      journal.upsertCommand?.(record);
    }

    const rows = journal.queryCommands(deploymentId, {
      entity_id: "gh-001",
      limit: 10,
    });
    expect(rows).toHaveLength(1);
    expect((rows[0] as { command_id: string }).command_id).toBe("a");
    journal.closeSqlite?.();
  });

  it("appendCommand keeps append-only history and latest snapshot on load", () => {
    dataRoot = mkdtempSync(join(tmpdir(), "memory-test-append-"));
    const journal = createMemoryJournal({
      dataRoot,
      commandBackend: "file",
    });
    const deploymentId = "dep-gh-pilot-001";
    const base = {
      command_id: "cmd-append-1",
      command: { command_id: "cmd-append-1", deployment_id: deploymentId, action: "open" },
      status: "created",
      created_at: "2026-06-10T00:00:00.000Z",
      updated_at: "2026-06-10T00:00:00.000Z",
    };
    journal.appendCommand(deploymentId, base);
    journal.appendCommand(deploymentId, {
      ...base,
      status: "sent",
      updated_at: "2026-06-10T00:00:01.000Z",
    });
    const path = join(dataRoot, "deployments", deploymentId, "command-logs.jsonl");
    const lines = readFileSync(path, "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    const loaded = journal.loadCommands(deploymentId) as { status: string }[];
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.status).toBe("sent");
  });

  it("fails visibly on corrupt command JSONL rows", () => {
    dataRoot = mkdtempSync(join(tmpdir(), "memory-test-corrupt-"));
    const journal = createMemoryJournal({
      dataRoot,
      commandBackend: "file",
    });
    const deploymentId = "dep-gh-pilot-001";
    const dir = join(dataRoot, "deployments", deploymentId);
    mkdirSync(dir, { recursive: true });
    const path = join(dir, "command-logs.jsonl");
    writeFileSync(path, "{not-json}\n", "utf8");

    expect(() => journal.loadCommands(deploymentId)).toThrow(/JSONL 无法读取或校验失败/);
    expect(() => journal.queryCommands(deploymentId, { limit: 10 })).toThrow(
      /JSONL 无法读取或校验失败/,
    );
  });
});
