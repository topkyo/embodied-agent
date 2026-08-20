export {
  buildAlertMessage,
  defaultAlertMetricFormatter,
  metricBreaches,
  metricValue,
  ruleKey,
} from "./evaluator.js";
export {
  evaluateThresholdBreach,
  thresholdAlertKey,
  type ThresholdBreachEvaluation,
} from "./threshold-scan.js";
export {
  isSustainedThresholdMet,
  nextSustainedEpisodeTick,
  shouldEvaluateSustainedL1,
  shouldEvaluateSustainedL2,
  type SustainedEpisodeSnapshot,
} from "./sustained.js";
export type { AlertMetricFormatter } from "./evaluator.js";
export type { AlertMetricOperator, AlertRule, EntityTelemetrySnapshot } from "./types.js";
