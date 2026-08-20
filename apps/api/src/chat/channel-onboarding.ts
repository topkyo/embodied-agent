import { getPrimaryDomainPackContract } from "../domain-packs/loader.js";
import { getPlatformRuntimeContext } from "../runtime/context.js";
import { getEffectiveSettings } from "../settings/store.js";

export const CHANNEL_HELP_KEYWORDS = ["帮助", "菜单", "你好", "help", "start"] as const;

export function isChannelHelpKeyword(text: string): boolean {
  const t = text.trim().toLowerCase();
  return (CHANNEL_HELP_KEYWORDS as readonly string[]).some((k) => k.toLowerCase() === t);
}

export function formatChannelOnboardingTip(examples: string[] | undefined): string {
  const cleaned = (examples ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 4);
  if (cleaned.length === 0) {
    return "已绑定，可以直接发指令。回复「帮助」查看示例。";
  }
  const lines = cleaned.map((e) => `· ${e}`).join("\n");
  return `已绑定，可以直接发指令。\n试试：\n${lines}\n回复「帮助」可再次查看。`;
}

/** 业务回复已发出后，是否应追加首次 onboarding tip（帮助关键词与已落标均跳过）。 */
export function shouldAppendChannelWelcomeTip(
  isHelpKeyword: boolean,
  channelWelcomeSentAt: string | undefined,
): boolean {
  return !isHelpKeyword && !channelWelcomeSentAt;
}

/** 从 active pack manifest 取 examples；异常/缺失 → undefined */
export function resolveActiveChannelOnboardingExamples(): string[] | undefined {
  try {
    const settings = getEffectiveSettings();
    const contract = getPrimaryDomainPackContract(getPlatformRuntimeContext().loader, settings);
    return contract.core.manifest.channelOnboarding?.examples;
  } catch {
    return undefined;
  }
}
