export type DomainPackStatus = "live" | "placeholder";

export type DomainPackEvalPaths = {
  golden: string;
  matrixExtra: string;
  matrixWechat: string;
  matrixNegative: string;
};

export type DomainPackChannelOnboarding = {
  examples: string[];
};

export type DomainPackManifest = {
  id: string;
  displayName: string;
  status: DomainPackStatus;
  eval: DomainPackEvalPaths;
  channelOnboarding?: DomainPackChannelOnboarding;
};

export type DomainPackCapabilities = {
  digest?: boolean;
  weeklyAdvice?: boolean;
  weatherProactive?: boolean;
  scheduledReports?: boolean;
  policySuggestions?: boolean;
  satellite?: boolean;
};

export type DomainPackReadinessStatus = "ready" | "blocked" | "placeholder";

export type DomainPackReadinessIssue = {
  code: string;
  message: string;
  severity: "error" | "warning";
};

export type DomainPackEvalEvidence = {
  golden_rows: number;
  matrix_extra_rows: number;
  matrix_wechat_rows: number;
  matrix_negative_rows: number;
  valid_rows?: number;
  invalid_rows?: number;
  covered_skills?: string[];
  missing_required_skills?: string[];
};

export type DomainPackReadiness = {
  pack_id: string;
  display_name: string;
  status: DomainPackStatus;
  readiness: DomainPackReadinessStatus;
  deliverable: boolean;
  eval: DomainPackEvalEvidence;
  issues: DomainPackReadinessIssue[];
};
