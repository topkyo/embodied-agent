import { describe, expect, it } from "vitest";
import { createServiceLocator } from "./service-locator.js";

describe("createServiceLocator", () => {
  it("throws when get() is called before bind()", () => {
    const locator = createServiceLocator<{ name: string }>("TestService");
    expect(() => locator.get()).toThrow("TestService must be bound before use");
  });

  it("returns the bound instance after bind()", () => {
    const locator = createServiceLocator<{ name: string }>("TestService");
    const service = { name: "my-service" };
    locator.bind(service);
    expect(locator.get()).toBe(service);
  });

  it("returns the latest binding when re-bound", () => {
    const locator = createServiceLocator<number>("Counter");
    locator.bind(1);
    expect(locator.get()).toBe(1);
    locator.bind(42);
    expect(locator.get()).toBe(42);
  });

  it("throws again after resetForTest()", () => {
    const locator = createServiceLocator<string>("StringService");
    locator.bind("hello");
    expect(locator.get()).toBe("hello");
    locator.resetForTest();
    expect(() => locator.get()).toThrow("StringService must be bound before use");
  });

  it("allows re-binding after resetForTest()", () => {
    const locator = createServiceLocator<string>("StringService");
    locator.bind("first");
    locator.resetForTest();
    locator.bind("second");
    expect(locator.get()).toBe("second");
  });

  it("supports complex object types", () => {
    interface ComplexService {
      doWork: (x: number) => string;
      config: Record<string, unknown>;
    }
    const locator = createServiceLocator<ComplexService>("ComplexService");
    const service: ComplexService = {
      doWork: (x) => `result-${x}`,
      config: { key: "value" },
    };
    locator.bind(service);
    expect(locator.get().doWork(42)).toBe("result-42");
    expect(locator.get().config).toEqual({ key: "value" });
  });

  it("includes the service name in the error message", () => {
    const locator = createServiceLocator<unknown>("MyCustomServiceName");
    expect(() => locator.get()).toThrow("MyCustomServiceName");
  });

  it("resetForTest() is safe to call when never bound", () => {
    const locator = createServiceLocator<unknown>("NeverBound");
    expect(() => locator.resetForTest()).not.toThrow();
    expect(() => locator.get()).toThrow("NeverBound must be bound before use");
  });
});
