import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import AdminOnlyShell from "./AdminOnlyShell";
import { DomainPackProvider } from "../../contexts/DomainPackContext";
import { setOpsRoleFromAuth, renderWithProviders } from "../../test-utils";
import type { LiveDomainPackMeta } from "../../lib/domain-packs";

const greenhousePack: LiveDomainPackMeta = {
  slug: "greenhouse",
  displayNameKey: "scenes.farm.tag",
  status: "live",
  runtimeStatus: "live",
  scenePath: "/scenes/greenhouse",
  packId: "agriculture",
  opsPath: "/scenes/greenhouse/ops",
  opsEnabled: true,
};

describe("AdminOnlyShell", () => {
  it("已登录 user：primary CTA 指向场景工作台，不被误导去 /login；次级 「返回领域」", () => {
    setOpsRoleFromAuth({ user_id: "u1", role: "user", display_name: "U" });

    renderWithProviders({
      initialEntries: ["/scenes/greenhouse/ops/users"],
      lang: "en",
      children: (
        <DomainPackProvider pack={greenhousePack}>
          <AdminOnlyShell eyebrowKey="console.nav.users" bodyKey="sceneOps.adminOnly.users" />
        </DomainPackProvider>
      ),
    });

    expect(screen.getByRole("heading", { name: /Admin access required/i })).toBeInTheDocument();
    const primaryCta = screen.getByRole("link", { name: /Back to scene ops/i });
    expect(primaryCta).toHaveAttribute("href", "/scenes/greenhouse/ops");
    // 不是 「Sign in / 去登录」 这类 误导性 CTA 在 user 已登录状态出现
    expect(screen.queryByRole("link", { name: /^Sign in$/i })).toBeNull();
    expect(screen.getByRole("link", { name: /Back to domains/i })).toHaveAttribute(
      "href",
      "/start",
    );
  });
});
