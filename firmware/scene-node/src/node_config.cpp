#include "node_config.h"
#include "node_reg.h"
#include "node_time.h"
#include <ArduinoJson.h>

#ifndef DRY_RUN_GPIO
#define DRY_RUN_GPIO 1
#endif

static int gConfigVersion = 0;
static bool gConfigReady = false;
static bool gConfigSubscribed = false;
static String gConfigTopic;

struct DeviceEntry {
  String device_id;
  String channel;
};

static const int kMaxDevices = 8;
static DeviceEntry gDevices[kMaxDevices];
static int gDeviceCount = 0;

static void resetDevices() {
  gDeviceCount = 0;
  for (int i = 0; i < kMaxDevices; i++) {
    gDevices[i].device_id = "";
    gDevices[i].channel = "";
  }
}

static void publishConfigApplied(PubSubClient &mqtt) {
  StaticJsonDocument<384> doc;
  doc["message_type"] = "node_event";
  doc["protocol_version"] = "0.1";
  doc["event_id"] =
      String("evt-config-") + nodeRegNodeId() + "-" + String(millis());
  doc["event_type"] = "config_applied";
  doc["deployment_id"] = nodeRegDeploymentId();
  doc["node_id"] = nodeRegNodeId();
  const char *token = nodeRegNodeToken();
  if (token && token[0]) doc["node_token"] = token;
  doc["config_version"] = gConfigVersion;
  char occurredAt[32];
  if (nodeTimeFormatOccurredAt(occurredAt, sizeof(occurredAt))) {
    doc["occurred_at"] = occurredAt;
  }

  String topic = String("deployments/") + nodeRegDeploymentId() + "/nodes/" +
                 nodeRegNodeId() + "/events";
  String body;
  serializeJson(doc, body);
  mqtt.publish(topic.c_str(), body.c_str());
  Serial.printf("[node-config] config_applied cv=%d devices=%d\n", gConfigVersion,
                gDeviceCount);
}

static void applyConfig(PubSubClient &mqtt, JsonObject root) {
  int cv = root["config_version"] | 0;
  if (cv <= 0) {
    Serial.println("[node-config] reject config: missing config_version");
    return;
  }
  resetDevices();
  JsonArray devices = root["devices"].as<JsonArray>();
  for (JsonObject d : devices) {
    if (gDeviceCount >= kMaxDevices) break;
    const char *deviceId = d["device_id"];
    const char *channel = d["channel"];
    if (!deviceId) continue;
    gDevices[gDeviceCount].device_id = deviceId;
    gDevices[gDeviceCount].channel = channel ? channel : "";
    gDeviceCount++;
  }
  gConfigVersion = cv;
  gConfigReady = true;
#if DRY_RUN_GPIO
  Serial.printf("[node-config] DRY_RUN apply cv=%d devices=%d\n", gConfigVersion,
                gDeviceCount);
  for (int i = 0; i < gDeviceCount; i++) {
    Serial.printf("  - %s %s\n", gDevices[i].device_id.c_str(),
                  gDevices[i].channel.c_str());
  }
#endif
  publishConfigApplied(mqtt);
}

void nodeConfigSetup() {
  gConfigVersion = 0;
  gConfigReady = false;
  gConfigSubscribed = false;
  resetDevices();
}

void nodeConfigLoop(PubSubClient &mqtt) {
  if (!nodeRegIsRegistered() || !mqtt.connected()) {
    gConfigSubscribed = false;
    return;
  }
  if (gConfigSubscribed) return;
  gConfigTopic = String("deployments/") + nodeRegDeploymentId() + "/nodes/" +
                 nodeRegNodeId() + "/config";
  mqtt.subscribe(gConfigTopic.c_str());
  gConfigSubscribed = true;
  Serial.printf("[node-config] subscribed %s\n", gConfigTopic.c_str());
}

void nodeConfigOnMessage(PubSubClient &mqtt, const char *topic,
                         const byte *payload, unsigned int length) {
  if (!gConfigTopic.length() || String(topic) != gConfigTopic) return;
  StaticJsonDocument<2048> doc;
  if (deserializeJson(doc, payload, length)) {
    Serial.println("[node-config] config JSON parse failed");
    return;
  }
  applyConfig(mqtt, doc.as<JsonObject>());
}

int nodeConfigVersion() { return gConfigVersion; }
bool nodeConfigReady() { return gConfigReady; }
const char *nodeConfigTopic() { return gConfigTopic.c_str(); }

bool nodeConfigHasDevice(const char *device_id) {
  return nodeConfigDeviceChannel(device_id) != nullptr;
}

const char *nodeConfigDeviceChannel(const char *device_id) {
  if (!device_id) return nullptr;
  for (int i = 0; i < gDeviceCount; i++) {
    if (gDevices[i].device_id == device_id) return gDevices[i].channel.c_str();
  }
  return nullptr;
}
