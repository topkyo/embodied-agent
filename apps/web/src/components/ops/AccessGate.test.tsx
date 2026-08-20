import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { AccessGate } from "./AccessGate";
import { renderWithProviders } from "../../test-utils";

describe("AccessGate", () => {
  it("renders role_insufficient with primary and secondary actions", () => {
    renderWithProviders({
      lang: "en",
      children: (
        <AccessGate
          reason="role_insufficient"
          title="Admin access required"
          body="Admins only"
          primaryAction={{ to: "/login", label: "Admin sign-in" }}
          secondaryAction={{ to: "/scenes/greenhouse/ops", label: "Back to scene ops" }}
        />
      ),
    });

    expect(screen.getByRole("heading", { name: /Admin access required/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Admin sign-in/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back to scene ops/i })).toBeInTheDocument();
  });

  it("renders pack_disabled with pack name", () => {
    renderWithProviders({
      lang: "en",
      children: (
        <AccessGate
          reason="pack_disabled"
          packName="Greenhouse"
          primaryAction={{ to: "/start/wechat", label: "Back to WeChat start" }}
        />
      ),
    });

    expect(screen.getByText("Greenhouse")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back to WeChat start/i })).toBeInTheDocument();
  });
});
