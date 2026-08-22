/** AUTO-GENERATED from domain-packs.json — run: npm run codegen:web-catalog */
import type { DomainPackMeta } from "./domain-packs.js";

export const RUNTIME_DOMAIN_PACK_CATALOG = [
  {
    packId: "agriculture",
    slug: "greenhouse",
    displayNameKey: "nav.farm",
    status: "live",
    runtimeStatus: "live",
    scenePath: "/scenes/greenhouse",
    opsPath: "/scenes/greenhouse/ops",
    opsEnabled: true,
  },
  {
    packId: "robotics",
    slug: "robot",
    displayNameKey: "scenes.robot.title",
    status: "live",
    runtimeStatus: "live",
    scenePath: "/scenes/robot",
    opsPath: "/scenes/robot/ops",
    opsEnabled: true,
  },
  {
    packId: "industrial",
    slug: "industrial",
    displayNameKey: "scenes.industrial.title",
    status: "live",
    runtimeStatus: "live",
    scenePath: "/scenes/industrial",
    opsPath: "/scenes/industrial/ops",
    opsEnabled: true,
  },
  {
    packId: "aquaculture",
    slug: "aquaculture",
    displayNameKey: "scenes.aquaculture.title",
    status: "next",
    runtimeStatus: "placeholder",
    scenePath: "/scenes/aquaculture",
    opsEnabled: false,
  },
] as const satisfies readonly DomainPackMeta[];
