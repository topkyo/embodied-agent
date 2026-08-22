import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SceneOpsReadinessBadge } from "./SceneOpsReadinessBadge";
import { AuthProvider } from "../../contexts/AuthContext";
import { LanguageProvider } from "../../contexts/LanguageContext";
import { renderWithProviders } from "../../test-utils";

const mockState = vi.hoisted(() => ({
  value: {
    loading: false,
    error: null as string | null,
    data: null as unknown,
    blockingIssue: null as {
      code: string;
      label: string;
      detail: string;
      severity: "error" | "warning";
    } | null,
    ready: false,
    blocked: false,
    refresh: () => {},
  },
}));

vi.mock("../../contexts/SceneOpsReadinessContext", () => ({
  useSceneOpsReadiness: () => mockState.value,
}));

describe("SceneOpsReadinessBadge", () => {
  it("shows ready badge when ready", () => {
    mockState.value = {
      ...mockState.value,
      loading: false,
      error: null,
      ready: true,
      blocked: false,
      data: {},
      blockingIssue: null,
    };
    renderWithProviders({
      initialEntries: ["/"],
      lang: "en",
      children: <SceneOpsReadinessBadge />,
    });
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });

  it("shows human blocked label for mqtt/transport", () => {
    mockState.value = {
      ...mockState.value,
      loading: false,
      error: null,
      ready: false,
      blocked: true,
      data: {},
      blockingIssue: {
        code: "mqtt_transport",
        label: "Transport",
        detail: "broker down",
        severity: "error",
      },
    };
    renderWithProviders({
      initialEntries: ["/"],
      lang: "en",
      children: <SceneOpsReadinessBadge />,
    });
    expect(screen.getByText(/Message bus down/)).toBeInTheDocument();
  });

  it("shows human label for Domain Registry (not raw English)", () => {
    mockState.value = {
      ...mockState.value,
      loading: false,
      error: null,
      ready: false,
      blocked: true,
      data: {},
      blockingIssue: {
        code: "domain_registry",
        label: "Domain Registry",
        detail: "registry missing greenhouse",
        severity: "error",
      },
    };
    renderWithProviders({
      initialEntries: ["/"],
      lang: "en",
      children: <SceneOpsReadinessBadge />,
    });
    expect(screen.getByText(/Device binding not ready/)).toBeInTheDocument();
    expect(screen.queryByText(/Domain Registry/)).not.toBeInTheDocument();
  });

  it("shows unavailable when error", () => {
    mockState.value = {
      ...mockState.value,
      loading: false,
      error: "network down",
      ready: false,
      blocked: false,
      data: null,
      blockingIssue: null,
    };
    renderWithProviders({
      initialEntries: ["/"],
      lang: "en",
      children: <SceneOpsReadinessBadge />,
    });
    expect(screen.getByText("Unknown")).toBeInTheDocument();
  });

  it("applies flip class when transitioning blocked to ready", async () => {
    mockState.value = {
      ...mockState.value,
      loading: false,
      error: null,
      ready: false,
      blocked: true,
      data: {},
      blockingIssue: {
        code: "mqtt_transport",
        label: "Transport",
        detail: "broker down",
        severity: "error",
      },
    };
    const { container, rerender } = renderWithProviders({
      initialEntries: ["/"],
      lang: "en",
      children: <SceneOpsReadinessBadge />,
    });

    mockState.value = {
      ...mockState.value,
      ready: true,
      blocked: false,
      blockingIssue: null,
    };
    rerender(
      <LanguageProvider>
        <MemoryRouter initialEntries={["/"]}>
          <AuthProvider>
            <SceneOpsReadinessBadge />
          </AuthProvider>
        </MemoryRouter>
      </LanguageProvider>,
    );

    await waitFor(() => {
      expect(container.querySelector(".readiness-badge--flipped")).toBeTruthy();
    });
  });
});
