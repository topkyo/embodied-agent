import { Link } from "react-router-dom";
import { Link2 } from "lucide-react";
import { useLanguage } from "../../contexts/LanguageContext";
import { PanelTitle } from "../../components/primitives/PanelTitle";
import { PlatformBind } from "./PlatformBind";

/** 平台级通道：微信入口 +（en）WhatsApp；无企微/SMS 空壳。 */
export function PlatformChannelsPanel() {
  const { t, lang } = useLanguage();

  return (
    <section id="channels" className="settings-panel integration-panel">
      <PanelTitle
        icon={<Link2 size={20} aria-hidden />}
        title={t("console.channels.title")}
        text={t("console.channels.desc")}
      />
      <p className="muted channels-hint">
        {t("console.channels.wechatHint")}{" "}
        <Link to="/start?no_redirect=1" className="link-accent-strong">
          {t("nav.wechat")}
        </Link>
      </p>
      {lang === "en" && (
        <div className="integration-catalog">
          <PlatformBind />
        </div>
      )}
    </section>
  );
}
