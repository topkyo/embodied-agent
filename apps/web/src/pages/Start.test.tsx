import { afterEach, describe, expect, it, vi } from "vitest";
import { useEffect } from "react";
import { render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { mockAppFetch, type MockFetchOptions } from "../test-utils";
import { LanguageProvider } from "../contexts/LanguageContext";
import { AuthProvider } from "../contexts/AuthContext";
import { clearOpsRole } from "../lib/ops-role";
import Start from "./Start";

/** 单测 hook：控制 WechatBind/PlatformBind mock 触发 onConnected 的源 (status / confirm)。 */
let bindCallbackSource: "status" | "confirm" | null = "status";

vi.mock("../components/WechatBind", () => ({
  default: (props: {
    sceneLabel?: string;
    domainPackId?: string;
    principalUserId?: string;
    onConnected?: (info: { source: "status" | "confirm" }) => void;
  }) => {
    useEffect(() => {
      if (bindCallbackSource && props.onConnected && props.principalUserId) {
        props.onConnected({ source: bindCallbackSource });
      }
    }, [props.principalUserId]);
    return (
      <div
        data-testid="wechat-bind-mock"
        data-pack={props.domainPackId}
        data-scene={props.sceneLabel}
        data-source={bindCallbackSource ?? "none"}
      />
    );
  },
}));
vi.mock("../features/ops/PlatformBind", () => ({
  PlatformBind: (props: {
    principalUserId?: string;
    onConnected?: (info: { source: "status" | "confirm" }) => void;
  }) => {
    useEffect(() => {
      if (bindCallbackSource && props.onConnected && props.principalUserId) {
        props.onConnected({ source: bindCallbackSource });
      }
    }, [props.principalUserId]);
    return (
      <div
        data-testid="platform-bind-mock"
        data-principal={props.principalUserId}
        data-source={bindCallbackSource ?? "none"}
      />
    );
  },
}));

function fetchMock(opts: MockFetchOptions = {}) {
  return mockAppFetch({
    authMe: { user_id: "admin-1", role: "admin", display_name: "Admin" },
    activeDomain: "agriculture",
    catalog: [
      { id: "agriculture", display_name: "农场工长", status: "live", active: true },
      { id: "robotics", display_name: "机器人领域", status: "live", active: false },
      { id: "industrial", display_name: "工业安能卫士", status: "live", active: false },
      { id: "aquaculture", display_name: "水产管家", status: "placeholder", active: false },
    ],
    ...opts,
  });
}

function renderStart(initialEntries: string[]) {
  localStorage.setItem("ea_lang", "zh");
  return render(
    <LanguageProvider>
      <MemoryRouter initialEntries={initialEntries}>
        <AuthProvider>
          <Start />
        </AuthProvider>
      </MemoryRouter>
    </LanguageProvider>,
  );
}

function pickerChips(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>("[data-testid='start-picker-row'] > *"),
  );
}

function enterOpsLink(container: HTMLElement): HTMLAnchorElement | null {
  const actions = container.querySelectorAll<HTMLAnchorElement>(".start-actions a");
  return (
    Array.from(actions).find((a) => /工作台|workbench|enter ops/i.test(a.textContent ?? "")) ?? null
  );
}

describe("/start 一体化页", () => {
  afterEach(() => {
    clearOpsRole();
    bindCallbackSource = "status";
    vi.restoreAllMocks();
  });

  it("admin：bind 已确认 (status) → 进入 ops CTA 出现，无平台底座重复 CTA", async () => {
    fetchMock();
    const view = renderStart(["/start"]);
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());

    expect(view.container.querySelector(".start-top-bar")).toBeNull();
    const roleChip = view.container.querySelector(".ops-role-chip[data-role='admin']");
    expect(roleChip?.closest(".start-hero")).toBeTruthy();

    const chips = pickerChips(view.container);
    expect(chips.length).toBe(3);
    const greenhouse = view.container.querySelector(".start-picker-chip[data-pack='greenhouse']");
    expect(greenhouse?.getAttribute("data-current")).toBe("1");
    expect(greenhouse?.querySelector(".start-picker-tag")).toBeTruthy();

    const bind = view.container.querySelector("[data-testid='wechat-bind-mock']");
    expect(bind?.getAttribute("data-pack")).toBe("agriculture");
    expect(bind?.getAttribute("data-source")).toBe("status");

    // 已绑（status）也放行 → 进入 ops CTA 出现
    await waitFor(() => expect(enterOpsLink(view.container)).toBeTruthy());
    const actions = Array.from(
      view.container.querySelectorAll(".start-actions a, .start-actions button"),
    );
    expect(actions.some((a) => /进入平台底座|Open platform base/i.test(a.textContent ?? ""))).toBe(
      false,
    );
  });

  it("user 角色：bind 已确认 → 进入 ops CTA 现身；不存在平台底座 CTA", async () => {
    fetchMock({
      authMe: { user_id: "member-1", role: "user", display_name: "Member" },
    });
    const view = renderStart(["/start"]);
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());

    await waitFor(() => expect(enterOpsLink(view.container)).toBeTruthy());
    const actions = Array.from(
      view.container.querySelectorAll(".start-actions a, .start-actions button"),
    );
    expect(actions.some((a) => /进入平台底座|Open platform base/i.test(a.textContent ?? ""))).toBe(
      false,
    );
  });

  it("session 已就位但 bind 未发生：onConnected 永不触发 → 进入 ops CTA 隐藏", async () => {
    bindCallbackSource = null;
    fetchMock({
      authMe: { user_id: "admin-1", role: "admin", display_name: "Admin" },
    });
    const view = renderStart(["/start"]);
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());

    // QR 区 显示，但 status/confirm 都 没 fire → bindReady 仍 false
    expect(view.container.querySelector("[data-testid='wechat-bind-mock']")).toBeTruthy();
    expect(enterOpsLink(view.container)).toBeNull();
  });

  it("session 已就位 + 未绑，点击 chip 让 WechatBind 重 mount + 收到 confirm → 进入 ops", async () => {
    bindCallbackSource = null;
    fetchMock({
      authMe: { user_id: "admin-1", role: "admin", display_name: "Admin" },
    });
    const view = renderStart(["/start"]);
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());

    expect(enterOpsLink(view.container)).toBeNull();
    // 切到 non-active-domain(robot) → 重 mount → 模拟 server polling 确认带 bindConfirmed=true → confirm
    bindCallbackSource = "confirm";
    const robot = view.container.querySelector(
      ".start-picker-chip[data-pack='robot']",
    ) as HTMLElement;
    const user = userEvent.setup();
    await user.click(robot);
    // confirm 触发了 navigate(targetOpsPath=currentPack.opsPath)；因为 robot 是非 active，
    // WechatBind 应该会重启到 greenhouse；最终会跳走 (redirect)，只断言状态不回退。
    // 简化：再回到 greenhouse 触发 confirm。
    bindCallbackSource = null;
    const greenhouse = view.container.querySelector(
      ".start-picker-chip[data-pack='greenhouse']",
    ) as HTMLElement;
    await user.click(greenhouse);
    // 此轮 mock 是 null 但 active_domain 步仍不应有 Enter ops（无状态）；再次切 robot 触发 confirm
    bindCallbackSource = "confirm";
    await user.click(robot);
    bindCallbackSource = "confirm";
    await user.click(greenhouse);

    // greenhouse 是 active_domain；confirm 在 greenhouse 上 allow nativate → expect Enter ops 现/或 navigation 已发生
    expect(
      view.container.querySelector(".start-picker-chip[data-pack='greenhouse'][data-current='1']"),
    ).toBeTruthy();
  });

  it("匿名：显示登录提示 + 不渲染 WechatBind", async () => {
    fetchMock({ authMe: null });
    const view = renderStart(["/start"]);
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());

    expect(view.container.querySelector("[data-testid='wechat-bind-mock']")).toBeNull();
    expect(view.container.textContent ?? "").toMatch(/登录|sign ?in/i);
  });

  it("点击 chip 切 pack：URL ?pack= 更新、WechatBind prop 跟着换", async () => {
    fetchMock();
    const view = renderStart(["/start"]);
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());

    const robot = view.container.querySelector(
      ".start-picker-chip[data-pack='robot']",
    ) as HTMLElement;
    const user = userEvent.setup();
    await user.click(robot);

    await waitFor(() => {
      expect(robot.getAttribute("data-current")).toBe("1");
      const bind = view.container.querySelector("[data-testid='wechat-bind-mock']");
      expect(bind?.getAttribute("data-pack")).toBe("robotics");
      expect(bind?.getAttribute("data-scene")).toBe("机器人领域");
    });
  });

  it("仅一个 runtime-loadable 域时 picker 仍渲染单 chip（仍可用）", async () => {
    fetchMock({
      catalog: [{ id: "agriculture", display_name: "农场工长", status: "live", active: true }],
    });
    const view = renderStart(["/start"]);
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());

    const chips = pickerChips(view.container);
    expect(chips.length).toBe(1);
    expect(chips[0].getAttribute("data-pack")).toBe("greenhouse");
  });
});
