import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { OpsPageHeader } from "./OpsPageHeader";
import { renderWithProviders } from "../../test-utils";

describe("OpsPageHeader", () => {
  it("renders title, subtitle, eyebrow, and actions", () => {
    renderWithProviders({
      children: (
        <OpsPageHeader
          eyebrow="Review"
          title="Scene review"
          subtitle="Outcomes and policy"
          actions={<button type="button">Refresh</button>}
        />
      ),
    });

    expect(screen.getByText("Review")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Scene review/i })).toBeInTheDocument();
    expect(screen.getByText("Outcomes and policy")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Refresh/i })).toBeInTheDocument();
  });
});
