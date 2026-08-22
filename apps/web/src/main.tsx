import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Analytics } from "@vercel/analytics/react";
import App from "./App";
import { LanguageProvider } from "./contexts/LanguageContext";
import "./design/tokens.css";
import "./design/utilities.css";
import "./design/marketing-pages.css";
import "./design/app-shell.css";
import "./design/console-settings.css";
import "./design/console-layout.css";
import "./design/action-flow.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LanguageProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </LanguageProvider>
    {/* Vercel Web Analytics: 页面浏览、事件追踪。生产环境仅在 Vercel 项目启用 Analytics 后上报；dev 用 debug 验证 */}
    <Analytics debug={import.meta.env.DEV} />
  </StrictMode>,
);
