import { render, type RenderResult } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../contexts/AuthContext";
import { LanguageProvider } from "../contexts/LanguageContext";

export function RouteStub({ testId, label }: { testId: string; label?: string }) {
  return <div data-testid={testId}>{label ?? testId}</div>;
}

export type RenderWithProvidersOptions = {
  /** 默认 `["/"]`；依赖 useParams 的用例须传真实 ops 路径。 */
  initialEntries?: string[];
  children: ReactNode;
  lang?: "zh" | "en";
};

/**
 * MemoryRouter + LanguageProvider + AuthProvider。
 * 路由须与 App 同构（如 /scenes/:packSlug/ops/*），否则 useParams 为空。
 * 测试可用 setOpsRoleFromAuth 注入 session（AuthProvider 订阅模块缓存）。
 */
export function renderWithProviders({
  initialEntries = ["/"],
  children,
  lang = "en",
}: RenderWithProvidersOptions): RenderResult {
  localStorage.setItem("ea_lang", lang);
  return render(
    <LanguageProvider>
      <MemoryRouter initialEntries={initialEntries}>
        <AuthProvider>{children}</AuthProvider>
      </MemoryRouter>
    </LanguageProvider>,
  );
}
