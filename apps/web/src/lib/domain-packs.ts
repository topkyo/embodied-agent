/** Web 侧场景目录：运行态 Domain Pack 与营销概念场景显式区分。 */

export type DomainPackWebStatus = "live" | "next" | "planned";
export type RuntimeDomainPackId = "agriculture" | "robotics" | "industrial" | "aquaculture";
export type DomainPackRuntimeStatus = "live" | "placeholder" | "concept";

type DomainPackBaseMeta = {
  slug: string;
  displayNameKey: string;
  status: DomainPackWebStatus;
  runtimeStatus: DomainPackRuntimeStatus;
  scenePath: string;
};

export type LiveDomainPackMeta = DomainPackBaseMeta & {
  packId: RuntimeDomainPackId;
  runtimeStatus: "live";
  opsPath: string;
  opsEnabled: true;
};

export type PlaceholderDomainPackMeta = DomainPackBaseMeta & {
  packId: RuntimeDomainPackId;
  runtimeStatus: "placeholder";
  opsEnabled: false;
};

export type ConceptSceneMeta = DomainPackBaseMeta & {
  runtimeStatus: "concept";
  opsEnabled: false;
};

export type DomainPackMeta = LiveDomainPackMeta | PlaceholderDomainPackMeta | ConceptSceneMeta;

import { RUNTIME_DOMAIN_PACK_CATALOG } from "./domain-packs.runtime.generated.js";

const CONCEPT_DOMAIN_PACK_CATALOG = [
  {
    slug: "coldchain",
    displayNameKey: "scenes.coldchain.title",
    status: "planned",
    runtimeStatus: "concept",
    scenePath: "/scenes/coldchain",
    opsEnabled: false,
  },
] as const satisfies readonly DomainPackMeta[];

export const DOMAIN_PACK_CATALOG: readonly DomainPackMeta[] = [
  ...RUNTIME_DOMAIN_PACK_CATALOG,
  ...CONCEPT_DOMAIN_PACK_CATALOG,
];

export function resolvePackBySlug(slug: string): DomainPackMeta | undefined {
  return DOMAIN_PACK_CATALOG.find((p) => p.slug === slug);
}

export function resolvePackById(packId: string): DomainPackMeta | undefined {
  return DOMAIN_PACK_CATALOG.find((p) => "packId" in p && p.packId === packId);
}

export function isLiveOpsPack(pack: DomainPackMeta): pack is LiveDomainPackMeta {
  return pack.opsEnabled;
}

/** 微信开始 deep link：?no_redirect=1 阻止绑定后自动跳转 */
export function buildWechatStartUrl(opts?: { noRedirect?: boolean }): string {
  if (opts?.noRedirect) return "/start/wechat?no_redirect=1";
  return "/start/wechat";
}

/** Web 路径映射；调用方必须先用 API runtime catalog 判断 pack 是否 live/active。 */
export function adminPlatformPath(packSlug: string): string | null {
  const pack = resolvePackBySlug(packSlug);
  if (!pack?.opsEnabled) return null;
  return `${pack.opsPath}/platform`;
}

/** Web 路径映射；调用方必须先用 API runtime catalog 判断 pack 是否 live/active。 */
export function sceneOpsEntryPath(pack: DomainPackMeta): string | null {
  return pack.opsEnabled ? pack.opsPath : null;
}
