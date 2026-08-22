import { afterEach, describe, expect, it } from "vitest";
import {
  commandAckTimeoutMs,
  commandDeliveryTtlMs,
  commandMaxRetries,
  commandRetryIntervalMs,
} from "./config.js";

describe("commandDeliveryTtlMs", () => {
  afterEach(() => {
    delete process.env.COMMAND_DELIVERY_TTL_MS;
  });

  it("returns default 30000 when env is unset", () => {
    delete process.env.COMMAND_DELIVERY_TTL_MS;
    expect(commandDeliveryTtlMs()).toBe(30_000);
  });

  it("returns parsed value when env is a positive integer", () => {
    process.env.COMMAND_DELIVERY_TTL_MS = "60000";
    expect(commandDeliveryTtlMs()).toBe(60_000);
  });

  it("falls back to default when value is zero", () => {
    process.env.COMMAND_DELIVERY_TTL_MS = "0";
    expect(commandDeliveryTtlMs()).toBe(30_000);
  });

  it("falls back to default when value is negative", () => {
    process.env.COMMAND_DELIVERY_TTL_MS = "-1";
    expect(commandDeliveryTtlMs()).toBe(30_000);
  });

  it("falls back to default when value is NaN", () => {
    process.env.COMMAND_DELIVERY_TTL_MS = "abc";
    expect(commandDeliveryTtlMs()).toBe(30_000);
  });
});

describe("commandAckTimeoutMs", () => {
  afterEach(() => {
    delete process.env.COMMAND_ACK_TIMEOUT_MS;
  });

  it("returns default 15000 when env is unset", () => {
    delete process.env.COMMAND_ACK_TIMEOUT_MS;
    expect(commandAckTimeoutMs()).toBe(15_000);
  });

  it("returns parsed value when env is a positive integer", () => {
    process.env.COMMAND_ACK_TIMEOUT_MS = "45000";
    expect(commandAckTimeoutMs()).toBe(45_000);
  });

  it("falls back to default when value is zero", () => {
    process.env.COMMAND_ACK_TIMEOUT_MS = "0";
    expect(commandAckTimeoutMs()).toBe(15_000);
  });

  it("falls back to default when value is NaN", () => {
    process.env.COMMAND_ACK_TIMEOUT_MS = "not-a-number";
    expect(commandAckTimeoutMs()).toBe(15_000);
  });
});

describe("commandRetryIntervalMs", () => {
  afterEach(() => {
    delete process.env.COMMAND_RETRY_INTERVAL_MS;
  });

  it("returns default 5000 when env is unset", () => {
    delete process.env.COMMAND_RETRY_INTERVAL_MS;
    expect(commandRetryIntervalMs()).toBe(5_000);
  });

  it("returns parsed value when env is a positive integer", () => {
    process.env.COMMAND_RETRY_INTERVAL_MS = "10000";
    expect(commandRetryIntervalMs()).toBe(10_000);
  });

  it("falls back to default when value is zero", () => {
    process.env.COMMAND_RETRY_INTERVAL_MS = "0";
    expect(commandRetryIntervalMs()).toBe(5_000);
  });

  it("falls back to default when value is negative", () => {
    process.env.COMMAND_RETRY_INTERVAL_MS = "-100";
    expect(commandRetryIntervalMs()).toBe(5_000);
  });
});

describe("commandMaxRetries", () => {
  afterEach(() => {
    delete process.env.COMMAND_MAX_RETRIES;
  });

  it("returns default 2 when env is unset", () => {
    delete process.env.COMMAND_MAX_RETRIES;
    expect(commandMaxRetries()).toBe(2);
  });

  it("returns parsed value when env is a non-negative integer", () => {
    process.env.COMMAND_MAX_RETRIES = "5";
    expect(commandMaxRetries()).toBe(5);
  });

  it("allows zero retries", () => {
    process.env.COMMAND_MAX_RETRIES = "0";
    expect(commandMaxRetries()).toBe(0);
  });

  it("falls back to default when value is negative", () => {
    process.env.COMMAND_MAX_RETRIES = "-1";
    expect(commandMaxRetries()).toBe(2);
  });

  it("falls back to default when value is NaN", () => {
    process.env.COMMAND_MAX_RETRIES = "invalid";
    expect(commandMaxRetries()).toBe(2);
  });
});
