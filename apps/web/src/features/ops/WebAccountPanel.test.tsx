import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WebAccountPanel } from "./WebAccountPanel";
import { getFetchUrl, jsonResponse, mockAppFetch, renderWithProviders } from "../../test-utils";
import type { WebAccountSummary } from "../../api/auth";

afterEach(() => {
  vi.restoreAllMocks();
});

const seedAccounts: WebAccountSummary[] = [
  {
    user_id: "u-admin",
    role: "admin",
    display_name: "Local Admin",
    email: "admin@example.com",
    created_at: "2026-01-01T00:00:00.000Z",
  },
];

function mockWebAccountsApi(initial: WebAccountSummary[] = seedAccounts) {
  let accounts = [...initial];
  return mockAppFetch({
    authMe: { user_id: "u-admin", role: "admin", display_name: "Local Admin" },
    routes: [
      (url, init) => {
        if (!url.includes("/auth/accounts") || url.includes("/account/")) return null;
        if ((init?.method ?? "GET").toUpperCase() === "GET") {
          return jsonResponse({ accounts });
        }
        return null;
      },
      (url, init) => {
        if (
          !url.includes("/auth/account/create") ||
          (init?.method ?? "").toUpperCase() !== "POST"
        ) {
          return null;
        }
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          email: string;
          password: string;
          display_name?: string;
          role?: "admin" | "user";
        };
        const created: WebAccountSummary = {
          user_id: `u-${body.email.split("@")[0] ?? "new"}`,
          role: body.role ?? "user",
          display_name: body.display_name?.trim() || body.email,
          email: body.email,
          created_at: "2026-07-09T00:00:00.000Z",
        };
        accounts = [...accounts, created];
        return jsonResponse({
          user_id: created.user_id,
          role: created.role,
          display_name: created.display_name,
        });
      },
      (url, init) => {
        if (
          !url.includes("/auth/account/password") ||
          (init?.method ?? "").toUpperCase() !== "POST"
        ) {
          return null;
        }
        return jsonResponse({ ok: true });
      },
    ],
  });
}

describe("WebAccountPanel", () => {
  it("lists accounts then updates the table after create (hard closed loop)", async () => {
    const user = userEvent.setup();
    const fetchMock = mockWebAccountsApi();

    renderWithProviders({
      initialEntries: ["/scenes/greenhouse/ops/users"],
      lang: "en",
      children: <WebAccountPanel />,
    });

    await waitFor(() => {
      expect(screen.getByText("admin@example.com")).toBeInTheDocument();
    });
    expect(screen.getByRole("heading", { name: /Workbench users/i })).toBeInTheDocument();
    // Primary columns are name / role / email; raw user_id is secondary under name.
    expect(screen.getByText("Local Admin")).toBeInTheDocument();
    expect(screen.getByText("u-admin")).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: /User ID/i })).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Display name/i })).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Email"), "field@example.com");
    await user.type(screen.getByPlaceholderText("Password"), "password1");
    await user.type(screen.getByPlaceholderText("Display name"), "Field User");
    await user.click(screen.getByRole("button", { name: "Create user" }));

    await waitFor(() => {
      expect(screen.getByText(/Created user field@example.com/i)).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText("field@example.com")).toBeInTheDocument();
    });
    expect(screen.getByText("Field User")).toBeInTheDocument();

    const createCalls = fetchMock.mock.calls.filter(
      ([input, init]) =>
        getFetchUrl(input).includes("/auth/account/create") &&
        (init?.method ?? "").toUpperCase() === "POST",
    );
    expect(createCalls).toHaveLength(1);
    const listCalls = fetchMock.mock.calls.filter(
      ([input, init]) =>
        getFetchUrl(input).includes("/auth/accounts") &&
        !getFetchUrl(input).includes("/account/") &&
        (init?.method ?? "GET").toUpperCase() === "GET",
    );
    // mount list + post-create reload
    expect(listCalls.length).toBeGreaterThanOrEqual(2);
  });

  it("sets password for an existing account and shows success banner", async () => {
    const user = userEvent.setup();
    mockWebAccountsApi();

    renderWithProviders({
      initialEntries: ["/scenes/greenhouse/ops/users"],
      lang: "en",
      children: <WebAccountPanel />,
    });

    await waitFor(() => {
      expect(screen.getByText("Local Admin")).toBeInTheDocument();
    });

    const row = screen.getByText("Local Admin").closest("tr");
    expect(row).toBeTruthy();
    // user_id remains available as secondary mono under the display name
    expect(within(row as HTMLElement).getByText("u-admin")).toBeInTheDocument();
    await user.click(within(row as HTMLElement).getByRole("button", { name: "Set password" }));
    await user.type(
      within(row as HTMLElement).getByPlaceholderText(/Set new password/i),
      "newpass12",
    );
    await user.click(within(row as HTMLElement).getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(screen.getByText(/Updated password for u-admin/i)).toBeInTheDocument();
    });
  });
});
