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

/** 微信开始 / 领域展开主展示顺序 */
export const WECHAT_PRIMARY_PACK_SLUGS = [
  "greenhouse",
  "robot",
  "industrial",
  "aquaculture",
] as const;

/** 探索更多（含规划中的 Domain Pack） */
export const EXPLORE_PACK_SLUGS = ["coldchain"] as const;

export function resolvePackBySlug(slug: string): DomainPackMeta | undefined {
  return DOMAIN_PACK_CATALOG.find((p) => p.slug === slug);
}

export function resolvePackById(packId: string): DomainPackMeta | undefined {
  return DOMAIN_PACK_CATALOG.find((p) => "packId" in p && p.packId === packId);
}

export function isLiveOpsPack(pack: DomainPackMeta): pack is LiveDomainPackMeta {
  return pack.opsEnabled;
}

export type SceneEntryResolve = {
  pack?: DomainPackMeta;
  slug: string;
  /** URL 中 scene 无效；不会隐式回退到 LIVE pack */
  unknownScene: boolean;
};

/** ?scene=farm | greenhouse | aquaculture …；无效 slug 失败可见。 */
export function resolveSceneEntry(scene: string | null | undefined): SceneEntryResolve {
  if (!scene?.trim()) {
    return { slug: "", unknownScene: false };
  }
  const rawSlug = scene.trim();
  const pack = resolvePackBySlug(rawSlug);
  if (!pack) {
    return { slug: rawSlug, unknownScene: true };
  }
  return { pack, slug: pack.slug, unknownScene: false };
}

export type WechatStartRole = "user" | "installer";

export function resolveRoleFromParam(role: string | null | undefined): WechatStartRole {
  return role === "installer" ? "installer" : "user";
}

/** URL ?role= 仅 user/installer 时锁定 Tab */
export function isRoleLockedParam(role: string | null | undefined): boolean {
  return role === "user" || role === "installer";
}

/** 微信开始 deep link：?scene=&role=&no_redirect=1 */
export function buildWechatStartUrl(opts?: {
  scene?: string;
  role?: WechatStartRole;
  noRedirect?: boolean;
}): string {
  const params = new URLSearchParams();
  if (opts?.scene?.trim()) params.set("scene", opts.scene.trim());
  if (opts?.role) params.set("role", opts.role);
  if (opts?.noRedirect) params.set("no_redirect", "1");
  const q = params.toString();
  return q ? `/start/wechat?${q}` : "/start/wechat";
}

/** Web 路径映射；调用方必须先用 API runtime catalog 判断 pack 是否 live/active。 */
export function installerPlatformPath(packSlug: string): string | null {
  const pack = resolvePackBySlug(packSlug);
  if (!pack?.opsEnabled) return null;
  return `${pack.opsPath}/platform`;
}

/** Web 路径映射；调用方必须先用 API runtime catalog 判断 pack 是否 live/active。 */
export function sceneOpsEntryPath(pack: DomainPackMeta): string | null {
  return pack.opsEnabled ? pack.opsPath : null;
}

export function listWechatPrimaryPacks(): DomainPackMeta[] {
  return WECHAT_PRIMARY_PACK_SLUGS.map((slug) => resolvePackBySlug(slug)).filter(
    (p): p is DomainPackMeta => Boolean(p),
  );
}

export function listWechatExplorePacks(): DomainPackMeta[] {
  return EXPLORE_PACK_SLUGS.map((slug) => resolvePackBySlug(slug)).filter(
    (p): p is DomainPackMeta => Boolean(p),
  );
}

/** 无独立 pack 的探索场景页（银龄/宠物等） */
export const EXPLORE_SCENE_SLUGS = ["elderly", "pet"] as const;
