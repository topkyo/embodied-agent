import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UserManagementPanel } from "./UserManagementPanel";
import { renderWithProviders } from "../../test-utils";
import type { PrincipalUser } from "../../api";

const listPrincipalUsers = vi.fn();
const createPrincipalUser = vi.fn();
const updatePrincipalUser = vi.fn();
const deletePrincipalUser = vi.fn();

vi.mock("../../api", () => ({
  listPrincipalUsers: () => listPrincipalUsers(),
  createPrincipalUser: (...args: unknown[]) => createPrincipalUser(...args),
  updatePrincipalUser: (...args: unknown[]) => updatePrincipalUser(...args),
  deletePrincipalUser: (...args: unknown[]) => deletePrincipalUser(...args),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

const seedUsers: PrincipalUser[] = [
  { user_id: "user-1", role: "owner", deployment_id: "dep-1", display_name: "Alice" },
  { user_id: "user-2", role: "operator", deployment_id: "dep-1", display_name: "Bob" },
];

function mockUsersApi(users: PrincipalUser[] = seedUsers) {
  listPrincipalUsers.mockResolvedValue({ users });
}

describe("UserManagementPanel", () => {
  it("renders an empty message when no principal users exist", async () => {
    mockUsersApi([]);

    renderWithProviders({
      initialEntries: ["/scenes/greenhouse/ops/users"],
      lang: "en",
      children: <UserManagementPanel />,
    });

    await waitFor(() => {
      expect(screen.getByText("No users")).toBeInTheDocument();
    });
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("lists principal users and their roles", async () => {
    mockUsersApi();

    renderWithProviders({
      initialEntries: ["/scenes/greenhouse/ops/users"],
      lang: "en",
      children: <UserManagementPanel />,
    });

    await waitFor(() => {
      expect(screen.getByDisplayValue("Alice")).toBeInTheDocument();
    });
    expect(screen.getByText("user-1")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Bob")).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(document.querySelector(".ops-table-wrap")).toBeTruthy();
  });

  it("creates a new user after filling the form", async () => {
    const user = userEvent.setup();
    mockUsersApi([]);
    createPrincipalUser.mockResolvedValue({ ok: true, user: { user_id: "user-3" } });
    listPrincipalUsers.mockResolvedValueOnce({ users: [] }).mockResolvedValueOnce({
      users: [{ user_id: "user-3", role: "worker", deployment_id: "dep-1", display_name: "Carol" }],
    });

    renderWithProviders({
      initialEntries: ["/scenes/greenhouse/ops/users"],
      lang: "en",
      children: <UserManagementPanel />,
    });

    await waitFor(() => {
      expect(screen.getByText("No users")).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText("User ID"), "user-3");
    await user.type(screen.getByPlaceholderText("Display name"), "Carol");
    await user.type(screen.getByPlaceholderText("Site"), "dep-1");
    await user.click(screen.getByRole("button", { name: "Add user" }));

    await waitFor(() => {
      expect(screen.getByText("user-3 saved")).toBeInTheDocument();
    });
    expect(createPrincipalUser).toHaveBeenCalledWith({
      user_id: "user-3",
      role: "worker",
      deployment_id: "dep-1",
      display_name: "Carol",
    });
    expect(listPrincipalUsers.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("updates an existing user from the table row", async () => {
    const user = userEvent.setup();
    mockUsersApi();
    updatePrincipalUser.mockResolvedValue({ ok: true, user: seedUsers[0] });

    renderWithProviders({
      initialEntries: ["/scenes/greenhouse/ops/users"],
      lang: "en",
      children: <UserManagementPanel />,
    });

    await waitFor(() => {
      expect(screen.getByDisplayValue("Alice")).toBeInTheDocument();
    });

    const row = screen.getByDisplayValue("Alice").closest("tr") as HTMLElement;
    const nameInput = within(row).getByDisplayValue("Alice");
    fireEvent.change(nameInput, { target: { value: "Alicia" } });
    await user.click(within(row).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updatePrincipalUser).toHaveBeenCalledWith("user-1", expect.objectContaining({ display_name: "Alicia" }));
    });
    expect(listPrincipalUsers.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("deletes a user after confirmation", async () => {
    const user = userEvent.setup();
    mockUsersApi();
    deletePrincipalUser.mockResolvedValue({ ok: true });

    renderWithProviders({
      initialEntries: ["/scenes/greenhouse/ops/users"],
      lang: "en",
      children: <UserManagementPanel />,
    });

    await waitFor(() => {
      expect(screen.getByDisplayValue("Alice")).toBeInTheDocument();
    });

    const row = screen.getByDisplayValue("Alice").closest("tr") as HTMLElement;
    await user.click(within(row).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "Confirm delete" })).toBeInTheDocument();
    });
    const dialog = screen.getByRole("dialog", { name: "Confirm delete" });
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(deletePrincipalUser).toHaveBeenCalledWith("user-1");
    });
    expect(listPrincipalUsers.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("displays a load error when the API fails", async () => {
    listPrincipalUsers.mockRejectedValue(new Error("network error"));

    renderWithProviders({
      initialEntries: ["/scenes/greenhouse/ops/users"],
      lang: "en",
      children: <UserManagementPanel />,
    });

    await waitFor(() => {
      expect(screen.getByText("network error")).toBeInTheDocument();
    });
  });

  it("paginates across large user lists", async () => {
    const user = userEvent.setup();
    const lots = Array.from({ length: 55 }, (_, i) => ({
      user_id: `user-${i}`,
      role: "worker" as const,
      deployment_id: "dep-1",
      display_name: `User ${i}`,
    }));
    mockUsersApi(lots);

    renderWithProviders({
      initialEntries: ["/scenes/greenhouse/ops/users"],
      lang: "en",
      children: <UserManagementPanel />,
    });

    await waitFor(() => {
      expect(screen.getByDisplayValue("User 0")).toBeInTheDocument();
    });
    expect(screen.queryByDisplayValue("User 50")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => {
      expect(screen.getByDisplayValue("User 50")).toBeInTheDocument();
    });
    expect(screen.queryByDisplayValue("User 0")).not.toBeInTheDocument();
    expect(screen.getByText("Page 2 / 2")).toBeInTheDocument();
  });
});
