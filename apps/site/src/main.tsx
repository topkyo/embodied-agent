import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Analytics } from "@vercel/analytics/react";
import App from "./App";
import { LanguageProvider } from "./contexts/LanguageContext";
import "./design/tokens.css";
import "./design/utilities.css";
import "./design/marketing.css";
import "./design/marketing-pages.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LanguageProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </LanguageProvider>
    <Analytics debug={import.meta.env.DEV} />
  </StrictMode>,
);
