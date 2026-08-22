import type { z } from "zod";
import type { IntentPayload } from "./schemas/intent.js";
import type { DomainPackEvalPaths, DomainPackManifest } from "./domain-pack-manifest.js";
import type {
  DomainPackOpsSchema,
  DomainPackPhysicalSkillDefinition,
  OpsControlResolveInput,
} from "./domain-pack-ops.js";
import type {
  DomainPackCommandBuilder,
  DomainPackCommandReplies,
  DomainPackContext,
  DomainPackIntentProcessing,
  DomainPackNlgConfig,
  DomainPackPhysicalExecutor,
  DomainPackRuntime,
  DomainPackRuntimeReadiness,
  DomainPackSafetyPolicy,
  DomainPackStructuralOverrides,
  DomainPackTargetResolver,
} from "./domain-pack-handlers.js";

export type DomainPackCore = {
  manifest: DomainPackManifest;
  skills: {
    p0: readonly string[];
    p1: readonly string[];
    physical: readonly string[];
    /** ops_schema control.actions 的人类可读 display 真源；须覆盖 physical 中每项。 */
    physicalDefinitions?: readonly DomainPackPhysicalSkillDefinition[];
  };
  intentSchemas: readonly z.ZodTypeAny[];
  prompt: {
    section: string;
    contract: string;
    processing?: DomainPackIntentProcessing;
  };
  eval: DomainPackEvalPaths;
  structuralOverrides: DomainPackStructuralOverrides;
  targetResolver: DomainPackTargetResolver;
  safety?: DomainPackSafetyPolicy;
  commandAdapter?: {
    commandBuilder?: DomainPackCommandBuilder;
    physicalExecutor?: DomainPackPhysicalExecutor;
    commandReplies?: DomainPackCommandReplies;
  };
  readiness?: DomainPackRuntimeReadiness;
  sceneRuntime: DomainPackRuntime;
  context: DomainPackContext;
};

export type DomainPackCapabilityKind =
  | "scene"
  | "nlg"
  | "ops"
  | "evidence"
  | "skill-handler"
  | "command-replies"
  | "clarification"
  | "pre-dispatch"
  | "conversation"
  | "mode-store"
  | "proactive-alerts"
  | "scheduled-reports"
  | "policy-suggestions"
  | "command-hooks"
  | "digest"
  | "weekly-advice"
  | "weather-proactive"
  | "satellite"
  | "extension";

export type DomainPackCapabilityBase = {
  kind: DomainPackCapabilityKind;
  id?: string;
  requiredServices?: readonly string[];
};

export type SceneCapability = DomainPackCapabilityBase & {
  kind: "scene";
  runtime: DomainPackRuntime;
};

export type NlgCapability = DomainPackCapabilityBase & {
  kind: "nlg";
  config: DomainPackNlgConfig;
};

export type OpsCapability = DomainPackCapabilityBase & {
  kind: "ops";
  schema?: DomainPackOpsSchema;
  resolveControlAction?: (input: OpsControlResolveInput) => IntentPayload;
};

export type EvidenceCapability = DomainPackCapabilityBase & {
  kind: "evidence";
  eval: DomainPackEvalPaths;
  readiness?: DomainPackRuntimeReadiness;
};

export type DomainPackCapability =
  | SceneCapability
  | NlgCapability
  | OpsCapability
  | EvidenceCapability
  | (DomainPackCapabilityBase & {
      kind: Exclude<DomainPackCapabilityKind, "scene" | "nlg" | "ops" | "evidence">;
      value?: unknown;
    });

export type DomainPackContract = {
  core: DomainPackCore;
  capabilities: readonly DomainPackCapability[];
};

export type DomainPackFactoryContext = {
  storage?: {
    dataRoot: () => string;
    atomicWriteJson: (path: string, data: unknown) => void;
  };
};

export type DomainPackContractFactory = (options?: DomainPackFactoryContext) => DomainPackContract;
