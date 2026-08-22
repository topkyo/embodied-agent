import { describe, expect, it } from "vitest";
import { DEPLOYMENT_ID_SEGMENT, isValidDeploymentIdSegment } from "./deployment-id.js";

describe("DEPLOYMENT_ID_SEGMENT", () => {
  it("matches simple alphanumeric ids", () => {
    expect(DEPLOYMENT_ID_SEGMENT.test("dep001")).toBe(true);
    expect(DEPLOYMENT_ID_SEGMENT.test("abc")).toBe(true);
  });

  it("matches ids with hyphens and underscores", () => {
    expect(DEPLOYMENT_ID_SEGMENT.test("dep-001")).toBe(true);
    expect(DEPLOYMENT_ID_SEGMENT.test("dep_001")).toBe(true);
    expect(DEPLOYMENT_ID_SEGMENT.test("my-deployment_id")).toBe(true);
  });

  it("rejects ids starting with non-alphanumeric", () => {
    expect(DEPLOYMENT_ID_SEGMENT.test("-dep001")).toBe(false);
    expect(DEPLOYMENT_ID_SEGMENT.test("_dep001")).toBe(false);
    expect(DEPLOYMENT_ID_SEGMENT.test(".dep001")).toBe(false);
  });

  it("rejects ids with special characters", () => {
    expect(DEPLOYMENT_ID_SEGMENT.test("dep.001")).toBe(false);
    expect(DEPLOYMENT_ID_SEGMENT.test("dep/001")).toBe(false);
    expect(DEPLOYMENT_ID_SEGMENT.test("dep 001")).toBe(false);
    expect(DEPLOYMENT_ID_SEGMENT.test("dep@001")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(DEPLOYMENT_ID_SEGMENT.test("")).toBe(false);
  });

  it("accepts ids at the 64-character limit", () => {
    const id64 = "a".repeat(64);
    expect(DEPLOYMENT_ID_SEGMENT.test(id64)).toBe(true);
  });

  it("rejects ids exceeding 64 characters", () => {
    const id65 = "a".repeat(65);
    expect(DEPLOYMENT_ID_SEGMENT.test(id65)).toBe(false);
  });
});

describe("isValidDeploymentIdSegment", () => {
  it("returns true for valid alphanumeric ids", () => {
    expect(isValidDeploymentIdSegment("dep001")).toBe(true);
    expect(isValidDeploymentIdSegment("my-deployment")).toBe(true);
    expect(isValidDeploymentIdSegment("a_b_c")).toBe(true);
  });

  it("returns false for empty string", () => {
    expect(isValidDeploymentIdSegment("")).toBe(false);
  });

  it("returns false for ids containing double dots", () => {
    expect(isValidDeploymentIdSegment("..")).toBe(false);
    expect(isValidDeploymentIdSegment("dep..001")).toBe(false);
    expect(isValidDeploymentIdSegment("a..b")).toBe(false);
  });

  it("returns false for ids with path separators", () => {
    expect(isValidDeploymentIdSegment("dep/001")).toBe(false);
    expect(isValidDeploymentIdSegment("dep\\001")).toBe(false);
  });

  it("returns false for ids with spaces", () => {
    expect(isValidDeploymentIdSegment("dep 001")).toBe(false);
  });

  it("returns true for single character id", () => {
    expect(isValidDeploymentIdSegment("a")).toBe(true);
  });

  it("returns true for numeric-only ids", () => {
    expect(isValidDeploymentIdSegment("123456")).toBe(true);
  });

  it("returns false for ids exceeding 64 chars", () => {
    expect(isValidDeploymentIdSegment("a".repeat(65))).toBe(false);
  });

  it("returns true for ids at exactly 64 chars", () => {
    expect(isValidDeploymentIdSegment("a".repeat(64))).toBe(true);
  });

  it("returns false for ids with unicode characters", () => {
    expect(isValidDeploymentIdSegment("部署001")).toBe(false);
  });
});
