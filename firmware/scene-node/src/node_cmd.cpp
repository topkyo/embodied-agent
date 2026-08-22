#include "node_cmd.h"
#include "node_config.h"
#include "node_gpio.h"
#include "node_reg.h"
#include "node_time.h"
#include <ArduinoJson.h>

#ifndef CMD_MIN_DURATION_MS
#define CMD_MIN_DURATION_MS 500
#endif
#ifndef CMD_MAX_DURATION_MS
/** 4h 硬件看门狗上限；用户 duration_seconds 在此范围内按原值执行 */
#define CMD_MAX_DURATION_MS (4UL * 3600UL * 1000UL)
#endif

static bool gCmdSubscribed = false;
static String gCmdTopic;

struct PendingCommand {
  bool active;
  String commandId;
  String idempotencyKey;
  String deviceId;
  String channel;
  String action;
  unsigned long startedMs;
  unsigned long durationMs;
};

static PendingCommand gPending = {};
static PubSubClient *gMqtt = nullptr;

static void formatOccurredAt(JsonObject obj) {
  char buf[32];
  if (nodeTimeFormatOccurredAt(buf, sizeof(buf))) {
    obj["occurred_at"] = buf;
  }
}

static void publishEvent(PubSubClient &mqtt, JsonObject fields) {
  StaticJsonDocument<768> doc;
  doc["message_type"] = "command_event";
  doc["protocol_version"] = "0.1";
  const char *token = nodeRegNodeToken();
  if (token && token[0]) doc["node_token"] = token;
  for (JsonPair kv : fields) {
    doc[kv.key().c_str()] = kv.value();
  }
  if (!doc["occurred_at"].is<const char *>()) {
    formatOccurredAt(doc.as<JsonObject>());
  }
  String topic = String("deployments/") + nodeRegDeploymentId() + "/nodes/" +
                 nodeRegNodeId() + "/events";
  String body;
  serializeJson(doc, body);
  mqtt.publish(topic.c_str(), body.c_str());
}

static void rejectCommand(PubSubClient &mqtt, JsonObject cmd, const char *code,
                          const char *message) {
  StaticJsonDocument<256> evt;
  JsonObject root = evt.to<JsonObject>();
  root["event_id"] =
      String("evt-") + String((const char *)cmd["command_id"]) + "-rej";
  root["command_id"] = cmd["command_id"];
  root["idempotency_key"] = cmd["idempotency_key"];
  root["deployment_id"] = nodeRegDeploymentId();
  root["node_id"] = nodeRegNodeId();
  root["device_id"] = cmd["device_id"];
  root["status"] = "rejected";
  JsonObject err = root["error"].to<JsonObject>();
  err["code"] = code;
  err["message"] = message;
  publishEvent(mqtt, root);
}

static bool actionRequiresDuration(const char *action) {
  if (!action) return false;
  return strcmp(action, "open") == 0 || strcmp(action, "start") == 0 ||
         strcmp(action, "close") == 0;
}

static bool actionSupported(const char *action) {
  if (!action) return false;
  return actionRequiresDuration(action) || strcmp(action, "stop") == 0;
}

static int commandDurationSeconds(JsonObject cmd) {
  JsonObject params = cmd["parameters"].as<JsonObject>();
  if (!params["duration_seconds"].is<int>()) return 0;
  return params["duration_seconds"].as<int>();
}

static bool secretEquals(const char *a, const char *b) {
  if (!a || !b) return false;
  size_t lenA = strlen(a);
  size_t lenB = strlen(b);
  if (lenA != lenB) return false;
  unsigned char diff = 0;
  for (size_t i = 0; i < lenA; i++) {
    diff |= static_cast<unsigned char>(a[i] ^ b[i]);
  }
  return diff == 0;
}

static bool tokenMatches(JsonObject cmd) {
  const char *expected = nodeRegNodeToken();
  if (!expected || !expected[0]) return false;
  const char *provided = cmd["node_token"];
  if (!provided || !provided[0]) return false;
  return secretEquals(expected, provided);
}

static bool commandExpired(JsonObject cmd) {
  const char *expires = cmd["expires_at"];
  if (!expires || !expires[0]) return true;
  char nowBuf[32];
  if (!nodeTimeFormatOccurredAt(nowBuf, sizeof(nowBuf))) return true;
  if (strncmp(nowBuf, "bench+", 6) == 0) {
    Serial.println("[node-cmd] reject: clock not synced for expires_at");
    return true;
  }
  return strcmp(nowBuf, expires) > 0;
}

static unsigned long resolveDurationMs(JsonObject cmd) {
  if (String((const char *)cmd["action"]) == "stop") return 0;
  int seconds = commandDurationSeconds(cmd);
  if (seconds <= 0) return 0;
  unsigned long ms = (unsigned long)seconds * 1000UL;
  if (ms < CMD_MIN_DURATION_MS) return CMD_MIN_DURATION_MS;
  if (ms > CMD_MAX_DURATION_MS) return CMD_MAX_DURATION_MS;
  return ms;
}

static void completePending(PubSubClient &mqtt) {
  if (!gPending.active) return;

  unsigned long elapsed = millis() - gPending.startedMs;
  int actualSec = (int)((elapsed + 999) / 1000);

  nodeGpioStopChannel(gPending.channel.c_str());

  StaticJsonDocument<512> done;
  JsonObject doneRoot = done.to<JsonObject>();
  doneRoot["event_id"] = String("evt-") + gPending.commandId + "-done";
  doneRoot["command_id"] = gPending.commandId;
  doneRoot["idempotency_key"] = gPending.idempotencyKey;
  doneRoot["deployment_id"] = nodeRegDeploymentId();
  doneRoot["node_id"] = nodeRegNodeId();
  doneRoot["device_id"] = gPending.deviceId;
  doneRoot["status"] = "completed";
  JsonObject result = doneRoot["result"].to<JsonObject>();
  result["action"] = gPending.action;
  if (gPending.durationMs > 0) {
    result["actual_duration_seconds"] = actualSec;
  }
  publishEvent(mqtt, doneRoot);
  Serial.printf("[node-cmd] completed %s actual=%ds\n", gPending.commandId.c_str(),
                actualSec);

  gPending.active = false;
  gPending.commandId = "";
}

static void startCommand(PubSubClient &mqtt, JsonObject cmd) {
  const char *commandId = cmd["command_id"];
  const char *deviceId = cmd["device_id"];
  const char *action = cmd["action"];
  const char *channel = nodeConfigDeviceChannel(deviceId);
  if (!channel) return;

  unsigned long durationMs = resolveDurationMs(cmd);

  if (!nodeGpioStart(channel, action, durationMs)) {
    rejectCommand(mqtt, cmd, "gpio_busy", "channel busy or gpio start failed");
    return;
  }

  gPending.active = true;
  gPending.commandId = commandId;
  gPending.idempotencyKey = cmd["idempotency_key"].as<const char *>();
  gPending.deviceId = deviceId;
  gPending.channel = channel;
  gPending.action = action;
  gPending.startedMs = millis();
  gPending.durationMs = durationMs;

  if (String(action) == "stop" || durationMs == 0) {
    completePending(mqtt);
  }
}

static void handleCommand(PubSubClient &mqtt, JsonObject cmd) {
  const char *commandId = cmd["command_id"];
  const char *deviceId = cmd["device_id"];
  const char *action = cmd["action"];
  if (!commandId || !deviceId || !action) {
    Serial.println("[node-cmd] reject: missing fields");
    return;
  }

  if (gPending.active) {
    rejectCommand(mqtt, cmd, "device_busy", "previous command still running");
    return;
  }

  if (!tokenMatches(cmd)) {
    rejectCommand(mqtt, cmd, "invalid_node_token", "node_token missing or invalid");
    return;
  }
  if (commandExpired(cmd)) {
    rejectCommand(mqtt, cmd, "command_expired", "command expires_at is in the past");
    return;
  }
  if (nodeGpioEmergencyStopActive()) {
    rejectCommand(mqtt, cmd, "emergency_stop_active", "emergency stop input is active");
    return;
  }
  if (nodeGpioManualOverrideActive()) {
    rejectCommand(mqtt, cmd, "manual_override_active", "manual override input is active");
    return;
  }

  int cv = cmd["config_version"] | 0;
  if (!nodeConfigReady() || cv != nodeConfigVersion()) {
    rejectCommand(mqtt, cmd, "config_version_mismatch",
                  "config version mismatch");
    return;
  }
  const char *channel = nodeConfigDeviceChannel(deviceId);
  if (!channel) {
    rejectCommand(mqtt, cmd, "unknown_device", "device not in current config");
    return;
  }
  if (!actionSupported(action)) {
    rejectCommand(mqtt, cmd, "unsupported_action",
                  "action is not supported by this Scene Node firmware");
    return;
  }
  if (actionRequiresDuration(action) && commandDurationSeconds(cmd) <= 0) {
    rejectCommand(mqtt, cmd, "missing_duration_seconds",
                  "pulse action requires positive duration_seconds");
    return;
  }

  StaticJsonDocument<384> ack;
  JsonObject ackRoot = ack.to<JsonObject>();
  ackRoot["event_id"] = String("evt-") + commandId + "-ack";
  ackRoot["command_id"] = commandId;
  ackRoot["idempotency_key"] = cmd["idempotency_key"];
  ackRoot["deployment_id"] = nodeRegDeploymentId();
  ackRoot["node_id"] = nodeRegNodeId();
  ackRoot["device_id"] = deviceId;
  ackRoot["status"] = "acknowledged";
  publishEvent(mqtt, ackRoot);

  StaticJsonDocument<384> run;
  JsonObject runRoot = run.to<JsonObject>();
  runRoot["event_id"] = String("evt-") + commandId + "-run";
  runRoot["command_id"] = commandId;
  runRoot["idempotency_key"] = cmd["idempotency_key"];
  runRoot["deployment_id"] = nodeRegDeploymentId();
  runRoot["node_id"] = nodeRegNodeId();
  runRoot["device_id"] = deviceId;
  runRoot["status"] = "running";
  unsigned long runtimeMs = resolveDurationMs(cmd);
  if (runtimeMs > 0) {
    runRoot["runtime_limit_seconds"] = (int)((runtimeMs + 999UL) / 1000UL);
  }
  publishEvent(mqtt, runRoot);

  Serial.printf("[node-cmd] start %s %s %s ch=%s\n", deviceId, action, commandId,
                channel);
  startCommand(mqtt, cmd);
}

void nodeCmdSetup() {
  gCmdSubscribed = false;
  gPending.active = false;
  gMqtt = nullptr;
}

void nodeCmdLoop(PubSubClient &mqtt) {
  gMqtt = &mqtt;
  if (!nodeRegIsRegistered() || !mqtt.connected()) {
    gCmdSubscribed = false;
    return;
  }
  if (!gCmdSubscribed) {
    gCmdTopic = String("deployments/") + nodeRegDeploymentId() + "/nodes/" +
                nodeRegNodeId() + "/commands";
    mqtt.subscribe(gCmdTopic.c_str());
    gCmdSubscribed = true;
    Serial.printf("[node-cmd] subscribed %s\n", gCmdTopic.c_str());
  }

  if (!gPending.active || gPending.durationMs == 0) return;
  if (millis() - gPending.startedMs < gPending.durationMs) return;
  completePending(mqtt);
}

void nodeCmdOnMessage(PubSubClient &mqtt, const char *topic, const byte *payload,
                      unsigned int length) {
  if (!gCmdTopic.length() || String(topic) != gCmdTopic) return;
  StaticJsonDocument<1536> doc;
  if (deserializeJson(doc, payload, length)) {
    Serial.println("[node-cmd] command JSON parse failed");
    return;
  }
  handleCommand(mqtt, doc.as<JsonObject>());
}

const char *nodeCmdTopic() { return gCmdTopic.c_str(); }
