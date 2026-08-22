#include "node_heartbeat.h"
#include "node_config.h"
#include "node_gps.h"
#include "node_reg.h"
#include <WiFi.h>
#include <ArduinoJson.h>

#ifndef FIRMWARE_VERSION
#define FIRMWARE_VERSION "esp32-node-0.2.0"
#endif
#ifndef HEARTBEAT_INTERVAL_MS
#define HEARTBEAT_INTERVAL_MS 30000
#endif

static unsigned long gLastHeartbeatMs = 0;

static void publishHeartbeat(PubSubClient &mqtt) {
  StaticJsonDocument<512> doc;
  doc["message_type"] = "heartbeat";
  doc["protocol_version"] = "0.1";
  doc["deployment_id"] = nodeRegDeploymentId();
  doc["node_id"] = nodeRegNodeId();
  doc["firmware_version"] = FIRMWARE_VERSION;
  doc["config_version"] = nodeConfigReady() ? nodeConfigVersion() : 0;
  doc["uptime_ms"] = millis();
  doc["wifi_rssi"] = WiFi.RSSI();

  char reportedAt[32];
  if (nodeGpsFormatUtc(reportedAt, sizeof(reportedAt))) {
    doc["reported_at"] = reportedAt;
  }

  const char *token = nodeRegNodeToken();
  if (token && token[0]) doc["node_token"] = token;

  double lat = 0;
  double lng = 0;
  float accuracy_m = 0;
  uint8_t fix_quality = 0;
  if (nodeGpsRead(&lat, &lng, &accuracy_m, &fix_quality)) {
    JsonObject gps = doc["gps"].to<JsonObject>();
    gps["latitude"] = lat;
    gps["longitude"] = lng;
    if (accuracy_m > 0) gps["accuracy_m"] = accuracy_m;
    gps["fix_quality"] = fix_quality;
  }

  String topic = String("deployments/") + nodeRegDeploymentId() + "/nodes/" +
                 nodeRegNodeId() + "/heartbeat";
  String body;
  serializeJson(doc, body);
  if (mqtt.publish(topic.c_str(), body.c_str())) {
    Serial.printf(
        "[node-hb] published %s gps=%s\n",
        topic.c_str(),
        nodeGpsHasFix() ? "yes" : "no");
  } else {
    Serial.println("[node-hb] publish failed");
  }
}

void nodeHeartbeatSetup() { gLastHeartbeatMs = 0; }

void nodeHeartbeatLoop(PubSubClient &mqtt) {
  if (!nodeRegIsRegistered() || !mqtt.connected()) return;
  unsigned long now = millis();
  if (gLastHeartbeatMs != 0 && now - gLastHeartbeatMs < HEARTBEAT_INTERVAL_MS) {
    return;
  }
  gLastHeartbeatMs = now;
  publishHeartbeat(mqtt);
}