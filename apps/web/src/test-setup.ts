import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { clearOpsRole } from "./lib/ops-role";

// matchMedia — happy-dom 有但行为受限
if (!globalThis.matchMedia) {
  globalThis.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    media: "",
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: () => true,
  });
}

class IntersectionObserverStub {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = () => [];
}
globalThis.IntersectionObserver =
  IntersectionObserverStub as unknown as typeof IntersectionObserver;

class ResizeObserverStub {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

globalThis.scrollTo = vi.fn() as unknown as typeof globalThis.scrollTo;

afterEach(() => {
  cleanup();
  clearOpsRole();
  vi.restoreAllMocks();
});
