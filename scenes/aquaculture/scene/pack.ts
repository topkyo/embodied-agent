import type { DomainPackContract, DomainPackCore, DomainPackManifest } from "@embodied-agent/core";
import {
  assembleDomainPackContract,
  defineDomainPackCore,
  packRootFromModuleUrl,
  resolvePackEvalPaths,
} from "@embodied-agent/domain-sdk";
import { AQUACULTURE_PACK } from "../manifest.js";
import {
  AQUACULTURE_P0_SKILLS,
  AQUACULTURE_P1_SKILLS,
  AQUACULTURE_PHYSICAL_SKILLS,
} from "../skills.js";
import { aquacultureIntentSchemas } from "../schemas/intent-aquaculture.js";
import { SCENE_SKILL_PROMPT_SECTION } from "../prompt/scene-skills.js";
import { tryStructuralIntentOverride } from "../structural/structural-intent.js";
import {
  isAquaculturePhysicalControlSkill,
  resolveAquacultureDeviceTarget,
} from "./target-resolver.js";
import {
  SCENE_SKILL_IDS,
  isSceneSkillId,
  resolveSceneForTrigger,
  resolveSceneFromIntent,
  evaluateOutcomeSuccess,
  sceneSuccessMetric,
  riskLevelForScene,
  riskLevelForPhysicalSkill,
  outcomeThresholdsForScene,
} from "./registry.js";
import { buildAquacultureSceneContext } from "./context.js";

export function createDomainPackCore(): DomainPackCore {
  const manifest: DomainPackManifest = {
    id: AQUACULTURE_PACK.id,
    displayName: AQUACULTURE_PACK.displayName,
    status: AQUACULTURE_PACK.status,
    eval: resolvePackEvalPaths(
      packRootFromModuleUrl(import.meta.url, "@embodied-agent/domain-aquaculture"),
      AQUACULTURE_PACK.eval,
    ),
  };

  return defineDomainPackCore({
    manifest,
    skills: {
      p0: AQUACULTURE_P0_SKILLS,
      p1: AQUACULTURE_P1_SKILLS,
      physical: AQUACULTURE_PHYSICAL_SKILLS,
    },
    intentSchemas: aquacultureIntentSchemas,
    prompt: {
      section: SCENE_SKILL_PROMPT_SECTION,
      contract: "",
    },
    eval: manifest.eval,
    structuralOverrides: {
      tryStructuralIntentOverride,
    },
    targetResolver: {
      isPhysicalControlSkill: isAquaculturePhysicalControlSkill,
      resolveDeviceTarget: resolveAquacultureDeviceTarget,
    },
    sceneRuntime: {
      sceneSkillIds: SCENE_SKILL_IDS,
      isSceneSkillId,
      resolveSceneForTrigger,
      resolveSceneFromIntent,
      evaluateOutcomeSuccess,
      sceneSuccessMetric,
      riskLevelForScene,
      riskLevelForPhysicalSkill,
      outcomeThresholdsForScene,
    },
    context: {
      buildDeploymentContext: buildAquacultureSceneContext,
    },
  });
}

export function createDomainPackContract(): DomainPackContract {
  return assembleDomainPackContract(createDomainPackCore());
}
