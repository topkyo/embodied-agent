import { useLanguage } from "../contexts/LanguageContext";
import { useDomainPack } from "../contexts/DomainPackContext";
import { Banner } from "./primitives/Banner";

/** 平台设置服务当前 deployment 的单 active Domain Pack。 */
export function SharedPlatformBanner() {
  const { t } = useLanguage();
  const currentPack = useDomainPack();

  return (
    <Banner variant="ok">
      {t("sceneOps.platform.sharedBanner", {
        current: t(currentPack.displayNameKey),
        packId: currentPack.packId,
      })}
    </Banner>
  );
}
