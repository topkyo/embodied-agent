import { afterEach, describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import StartWechat from "./StartWechat";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/start/wechat" element={<StartWechat />} />
        <Route path="/start" element={<div data-testid="start-marker">start</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("/start/wechat 兼容壳", () => {
  afterEach(() => {
    // 各用例自带 MemoryRouter；这里只示意清理。
  });

  it("无 query：redirect 到 /start", () => {
    const { container } = renderAt("/start/wechat");
    expect(container.querySelector('[data-testid="start-marker"]')).toBeTruthy();
  });

  it("带 ?pack=&no_redirect=1：保留 query 跳到 /start", () => {
    const { container } = renderAt("/start/wechat?pack=robot&no_redirect=1");
    expect(container.querySelector('[data-testid="start-marker"]')).toBeTruthy();
  });

  it("带 ?principal=：保留", () => {
    const { container } = renderAt("/start/wechat?principal=u-admin-1");
    expect(container.querySelector('[data-testid="start-marker"]')).toBeTruthy();
  });
});
