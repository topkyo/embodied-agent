import { afterEach, describe, expect, it } from "vitest";
import { commandStoreBackend, stateBackend, useSqliteCommandStore } from "./config.js";

describe("commandStoreBackend", () => {
  afterEach(() => {
    delete process.env.COMMAND_STORE;
    delete process.env.STATE_BACKEND;
  });

  it("defaults to file when STATE_BACKEND=file", () => {
    delete process.env.COMMAND_STORE;
    process.env.STATE_BACKEND = "file";
    expect(commandStoreBackend()).toBe("file");
    expect(useSqliteCommandStore()).toBe(false);
  });

  it("uses sqlite when STATE_BACKEND=redis without COMMAND_STORE", () => {
    delete process.env.COMMAND_STORE;
    process.env.STATE_BACKEND = "redis";
    expect(commandStoreBackend()).toBe("sqlite");
    expect(useSqliteCommandStore()).toBe(true);
  });

  it("COMMAND_STORE=file overrides redis state backend", () => {
    process.env.STATE_BACKEND = "redis";
    process.env.COMMAND_STORE = "file";
    expect(commandStoreBackend()).toBe("file");
    expect(useSqliteCommandStore()).toBe(false);
  });

  it("fails visibly on invalid STATE_BACKEND", () => {
    process.env.STATE_BACKEND = "memory";
    expect(() => stateBackend()).toThrow(/STATE_BACKEND 只能是 file 或 redis/);
    expect(() => commandStoreBackend()).toThrow(/STATE_BACKEND 只能是 file 或 redis/);
  });

  it("fails visibly on invalid COMMAND_STORE", () => {
    process.env.STATE_BACKEND = "file";
    process.env.COMMAND_STORE = "memory";
    expect(() => commandStoreBackend()).toThrow(/COMMAND_STORE 只能是 file 或 sqlite/);
  });
});
