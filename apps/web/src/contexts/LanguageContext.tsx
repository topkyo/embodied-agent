import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from "react";
import { Lang, t as translate, getCurrentLang } from "../i18n";
import { suggestLang, type LangSuggest } from "../api";

interface LanguageContextType {
  lang: Lang;
  setLang: (l: Lang, isManual?: boolean) => void;
  t: (key: string, params?: Record<string, string>) => string;
  isAuto: boolean;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const STORAGE_KEY = "ea_lang";
const SUGGEST_COOKIE = "ea_lang_suggest";

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return match ? decodeURIComponent(match[2]) : null;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("zh");
  const [isAuto, setIsAuto] = useState(true);

  // Initialize language (URL ?lang= > localStorage > cookie/geo suggest > browser > zh)
  useEffect(() => {
    if (typeof window === "undefined") return;
    // URL `?lang=` 跨 app 跳转显式入参优先于 localStorage
    const current = new URL(window.location.href);
    const urlLang = current.searchParams.get("lang");
    if (urlLang === "zh" || urlLang === "en") {
      setLangState(urlLang);
      setIsAuto(false);
      localStorage.setItem(STORAGE_KEY, urlLang);
      // consume: replace history so user-visible URL no longer carries ?lang
      current.searchParams.delete("lang");
      const nextQs = current.searchParams.toString();
      const next =
        current.pathname + (nextQs ? `?${nextQs}` : "") + current.hash;
      window.history.replaceState({}, "", next);
      return;
    }

    const stored = localStorage.getItem(STORAGE_KEY) as Lang | null;
    if (stored === "zh" || stored === "en") {
      setLangState(stored);
      setIsAuto(false);
      return;
    }

    // Try cookie set by previous Vercel middleware or other (sync, fallback to fetch)
    const cookieSuggest = getCookie(SUGGEST_COOKIE) as Lang | null;
    if (cookieSuggest === "zh" || cookieSuggest === "en") {
      setLangState(cookieSuggest);
      setIsAuto(true);
      localStorage.setItem(STORAGE_KEY, cookieSuggest); // persist the auto choice for future
      return;
    }

    // Fallback: fetch from server (works on Vercel + self-host via headers)
    suggestLang()
      .then((res: LangSuggest) => {
        const suggested = res.lang;
        setLangState(suggested);
        setIsAuto(true);
        localStorage.setItem(STORAGE_KEY, suggested);
      })
      .catch(() => {
        // Final fallback to browser
        const browser = navigator.language?.startsWith("en") ? "en" : "zh";
        setLangState(browser);
        setIsAuto(true);
        localStorage.setItem(STORAGE_KEY, browser);
      });
  }, []);

  const setLang = useCallback((l: Lang, isManual = false) => {
    setLangState(l);
    localStorage.setItem(STORAGE_KEY, l);
    if (isManual) {
      setIsAuto(false);
    }
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string>) => {
      return translate(key, lang, params);
    },
    [lang],
  );

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    }
  }, [lang]);

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, isAuto }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    // Fallback for components outside provider (rare)
    const lang = getCurrentLang();
    return {
      lang,
      setLang: () => {},
      t: (key: string, params?: Record<string, string>) => translate(key, lang, params),
      isAuto: true,
    };
  }
  return ctx;
}
