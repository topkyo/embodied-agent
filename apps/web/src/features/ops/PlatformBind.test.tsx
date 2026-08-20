import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlatformBind } from "./PlatformBind";
import { renderWithProviders } from "../../test-utils";
import type { Binding } from "../../api";

const mockApi = vi.hoisted(() => ({
  listBindings: vi.fn<() => Promise<{ bindings: Binding[] }>>(),
  issueBindingCode: vi.fn<
    (principal_user_id: string, ttl_minutes?: number) => Promise<{
      ok: boolean;
      code: string;
      principal_user_id: string;
      expires_at: string;
    }>
  >(),
  claimBindingCode: vi.fn<
    (
      code: string,
      platform: string,
      platform_user_id: string,
    ) => Promise<{ ok: boolean; binding: Binding }>
  >(),
  manualBind: vi.fn<
    (
      platform: string,
      platform_user_id: string,
      principal_user_id: string,
    ) => Promise<{ ok: boolean; binding: Binding }>
  >(),
}));

vi.mock("../../api", () => mockApi);
vi.mock("@vercel/analytics", () => ({ track: vi.fn() }));

const principalUserId = "u-test";

const unboundBindings: Binding[] = [];

const boundBindings: Binding[] = [
  {
    platform: "whatsapp",
    platform_user_id: "+1234567890",
    principal_user_id: principalUserId,
    bound_at: "2026-01-01T00:00:00Z",
  },
];

function setClipboard() {
  const writeText = vi.fn();
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
    writable: true,
  });
  return writeText;
}

describe("PlatformBind", () => {
  beforeEach(() => {
    mockApi.listBindings.mockReset();
    mockApi.issueBindingCode.mockReset();
    mockApi.claimBindingCode.mockReset();
    mockApi.manualBind.mockReset();
  });

  it("issues a binding code and displays it", async () => {
    const user = userEvent.setup();
    mockApi.listBindings.mockResolvedValue({ bindings: unboundBindings });
    mockApi.issueBindingCode.mockResolvedValue({
      ok: true,
      code: "ABC123",
      principal_user_id: principalUserId,
      expires_at: "2026-07-14T12:00:00Z",
    });

    renderWithProviders({
      initialEntries: ["/"],
      lang: "en",
      children: <PlatformBind principalUserId={principalUserId} />,
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Generate Code/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Generate Code/i }));

    await waitFor(() => {
      expect(screen.getByText("ABC123")).toBeInTheDocument();
    });
    expect(mockApi.issueBindingCode).toHaveBeenCalledWith(principalUserId, 30);
  });

  it("shows connected state when already bound and supports rebind", async () => {
    const user = userEvent.setup();
    mockApi.listBindings.mockResolvedValue({ bindings: boundBindings });
    mockApi.issueBindingCode.mockResolvedValue({
      ok: true,
      code: "REBIND99",
      principal_user_id: principalUserId,
      expires_at: "2026-07-14T12:00:00Z",
    });

    renderWithProviders({
      initialEntries: ["/"],
      lang: "en",
      children: <PlatformBind principalUserId={principalUserId} />,
    });

    await waitFor(() => {
      expect(screen.getByText(/WhatsApp connected/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Rebind/i }));

    await waitFor(() => {
      expect(screen.getByText("REBIND99")).toBeInTheDocument();
    });
  });

  it("completes a manual bind without a code", async () => {
    const user = userEvent.setup();
    mockApi.listBindings.mockResolvedValue({ bindings: unboundBindings });
    mockApi.manualBind.mockResolvedValue({
      ok: true,
      binding: boundBindings[0]!,
    });

    renderWithProviders({
      initialEntries: ["/"],
      lang: "en",
      children: <PlatformBind principalUserId={principalUserId} />,
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/\+1xxxxxxxx/i)).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText(/\+1xxxxxxxx/i), "+1234567890");
    await user.click(screen.getByRole("button", { name: /^Bind$/i }));

    await waitFor(() => {
      expect(screen.getByText(/Binding successful/i)).toBeInTheDocument();
    });
    expect(mockApi.manualBind).toHaveBeenCalledWith("whatsapp", "+1234567890", principalUserId);
  });

  it("claims an issued code when a code is present", async () => {
    const user = userEvent.setup();
    mockApi.listBindings.mockResolvedValue({ bindings: unboundBindings });
    mockApi.issueBindingCode.mockResolvedValue({
      ok: true,
      code: "CLAIM88",
      principal_user_id: principalUserId,
      expires_at: "2026-07-14T12:00:00Z",
    });
    mockApi.claimBindingCode.mockResolvedValue({
      ok: true,
      binding: boundBindings[0]!,
    });

    renderWithProviders({
      initialEntries: ["/"],
      lang: "en",
      children: <PlatformBind principalUserId={principalUserId} />,
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Generate Code/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Generate Code/i }));

    await waitFor(() => {
      expect(screen.getByText("CLAIM88")).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText(/\+1xxxxxxxx/i), "+1234567890");
    await user.click(screen.getByRole("button", { name: /^Bind$/i }));

    await waitFor(() => {
      expect(screen.getByText(/Binding successful/i)).toBeInTheDocument();
    });
    expect(mockApi.claimBindingCode).toHaveBeenCalledWith("CLAIM88", "whatsapp", "+1234567890");
  });

  it("notifies onConnected when bound from status and after confirmation", async () => {
    const user = userEvent.setup();
    const onConnected = vi.fn();
    mockApi.listBindings.mockResolvedValue({ bindings: boundBindings });

    renderWithProviders({
      initialEntries: ["/"],
      lang: "en",
      children: <PlatformBind principalUserId={principalUserId} onConnected={onConnected} />,
    });

    await waitFor(() => {
      expect(onConnected).toHaveBeenCalledWith({ source: "status" });
    });

    mockApi.issueBindingCode.mockResolvedValue({
      ok: true,
      code: "CONFIRM01",
      principal_user_id: principalUserId,
      expires_at: "2026-07-14T12:00:00Z",
    });
    mockApi.claimBindingCode.mockResolvedValue({
      ok: true,
      binding: boundBindings[0]!,
    });

    await user.click(screen.getByRole("button", { name: /Rebind/i }));
    await waitFor(() => {
      expect(screen.getByText("CONFIRM01")).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText(/\+1xxxxxxxx/i), "+1234567890");
    await user.click(screen.getByRole("button", { name: /^Bind$/i }));

    await waitFor(() => {
      expect(onConnected).toHaveBeenLastCalledWith({ source: "confirm" });
    });
  });

  it("copies the issued code to the clipboard", async () => {
    const user = userEvent.setup();
    const writeText = setClipboard();
    mockApi.listBindings.mockResolvedValue({ bindings: unboundBindings });
    mockApi.issueBindingCode.mockResolvedValue({
      ok: true,
      code: "COPY01",
      principal_user_id: principalUserId,
      expires_at: "2026-07-14T12:00:00Z",
    });

    renderWithProviders({
      initialEntries: ["/"],
      lang: "en",
      children: <PlatformBind principalUserId={principalUserId} />,
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Generate Code/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Generate Code/i }));

    await waitFor(() => {
      expect(screen.getByText("COPY01")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Copy Code/i }));

    expect(writeText).toHaveBeenCalledWith("COPY01");
  });

  it("compact mode hides title and manual bind but still allows claim", async () => {
    const user = userEvent.setup();
    mockApi.listBindings.mockResolvedValue({ bindings: unboundBindings });
    mockApi.issueBindingCode.mockResolvedValue({
      ok: true,
      code: "COMPACT1",
      principal_user_id: principalUserId,
      expires_at: "2026-07-14T12:00:00Z",
    });
    mockApi.claimBindingCode.mockResolvedValue({
      ok: true,
      binding: boundBindings[0]!,
    });

    renderWithProviders({
      initialEntries: ["/"],
      lang: "en",
      children: <PlatformBind compact principalUserId={principalUserId} />,
    });

    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: /WhatsApp Business/i })).not.toBeInTheDocument();
    });
    expect(screen.queryByText(/Complete Binding Manually/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Generate Code/i }));

    await waitFor(() => {
      expect(screen.getByText("COMPACT1")).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText(/\+1xxxxxxxx/i), "+1234567890");
    await user.click(screen.getByRole("button", { name: /^Bind$/i }));

    await waitFor(() => {
      expect(screen.getByText(/Binding successful/i)).toBeInTheDocument();
    });
  });
});
