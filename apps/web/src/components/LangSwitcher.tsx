import { useLanguage } from "../contexts/LanguageContext";

type LangSwitcherProps = {
  className?: string;
};

export default function LangSwitcher({ className = "" }: LangSwitcherProps) {
  const { lang, setLang, isAuto, t } = useLanguage();
  const rootClass = ["lang-switcher", className].filter(Boolean).join(" ");
  return (
    <div className={rootClass} role="group" aria-label={t("lang.aria")}>
      <button
        type="button"
        className={lang === "zh" ? "active" : ""}
        onClick={() => setLang("zh", true)}
        aria-pressed={lang === "zh"}
      >
        {t("lang.zh")}
      </button>
      <button
        type="button"
        className={lang === "en" ? "active" : ""}
        onClick={() => setLang("en", true)}
        aria-pressed={lang === "en"}
      >
        {t("lang.en")}
      </button>
      {isAuto && (
        <span className="auto-hint" title={t("lang.autoHint")}>
          {t("lang.auto")}
        </span>
      )}
    </div>
  );
}
