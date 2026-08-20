export { defaultDataRoot, resetAgentDataRootCache, resolveAgentDataDir } from "./data-dir.js";
export { DEPLOYMENT_ID_SEGMENT, isValidDeploymentIdSegment } from "./deployment-id.js";
export { deploymentDataDir, deploymentScopedPath, ensureDeploymentDir } from "./deployment-path.js";
export { atomicWriteJson, atomicWriteText } from "./atomic.js";
export { pruneJsonlByRetention } from "./jsonl-retention.js";
export {
  decryptSecret,
  encryptSecret,
  isEncryptedSecret,
  maybeDecryptSecret,
  maybeEncryptSecret,
} from "./secrets-crypto.js";
export { mqttConnectOptions, type MqttConnectOptions } from "./mqtt-connect-options.js";
export {
  FileLockBusyError,
  matrixTimeoutMs,
  validateFileLockStaleConfig,
  withFileLock,
  withFileLockSync,
} from "./file-lock.js";
export { createLogger, type LogFields, type LogLevel, type Logger } from "./logger.js";
export {
  createMetricsRegistry,
  type Counter,
  type Gauge,
  type Histogram,
  type LabelSet,
  type MetricsRecorder,
  type MetricsRegistry,
} from "./metrics.js";
export { allocateAgentDataDir, releaseAgentDataDir } from "./isolated-data-dir.js";
export { safeEqualString } from "./auth/constant-time.js";
export {
  DEPLOYMENT_TOPIC_PREFIX,
  nodeCommandTopic,
  nodeConfigTopic,
  nodeEventsTopic,
  nodeEventsSubscription,
  nodeHeartbeatTopic,
  nodeHeartbeatSubscription,
  nodeTelemetryTopic,
  nodeTelemetrySubscription,
  pairingInstallCodeTopic,
  parseDeploymentIdFromMqttTopic,
  parseNodeScopedMqttTopic,
  type NodeScopedMqttTopic,
  type NodeScopedMqttTopicKind,
} from "./mqtt-topics.js";
