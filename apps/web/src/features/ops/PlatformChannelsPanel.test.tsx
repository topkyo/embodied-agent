import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { PlatformChannelsPanel } from "./PlatformChannelsPanel";
import { renderWithProviders } from "../../test-utils";

vi.mock("./PlatformBind", () => ({
  PlatformBind: () => <div data-testid="platform-bind">PlatformBind</div>,
}));

describe("PlatformChannelsPanel", () => {
  it("renders title, description and WeChat hint in English", () => {
    renderWithProviders({
      initialEntries: ["/"],
      lang: "en",
      children: <PlatformChannelsPanel />,
    });

    expect(screen.getByRole("heading", { name: /Platform channels/i })).toBeInTheDocument();
    expect(screen.getByText(/Messaging channel entry points/i)).toBeInTheDocument();
    expect(screen.getByText(/WeChat iLink binding:/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /WeChat/i })).toHaveAttribute(
      "href",
      "/start?no_redirect=1",
    );
    expect(screen.getByTestId("platform-bind")).toBeInTheDocument();
  });

  it("renders only WeChat hint in Chinese without WhatsApp bind flow", () => {
    renderWithProviders({
      initialEntries: ["/"],
      lang: "zh",
      children: <PlatformChannelsPanel />,
    });

    expect(screen.getByRole("heading", { name: /平台通道/i })).toBeInTheDocument();
    expect(screen.getByText(/微信 iLink 扫码绑定请前往/i)).toBeInTheDocument();
    expect(screen.queryByTestId("platform-bind")).not.toBeInTheDocument();
  });

  it("links to the WeChat start page with no_redirect", () => {
    renderWithProviders({
      initialEntries: ["/"],
      lang: "en",
      children: <PlatformChannelsPanel />,
    });

    const link = screen.getByRole("link", { name: /WeChat/i });
    expect(link).toHaveAttribute("href", "/start?no_redirect=1");
  });

  it("does not render enterprise or SMS channel shells", () => {
    renderWithProviders({
      initialEntries: ["/"],
      lang: "en",
      children: <PlatformChannelsPanel />,
    });

    expect(screen.queryByText(/Enterprise WeChat/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/SMS/i)).not.toBeInTheDocument();
  });
});
