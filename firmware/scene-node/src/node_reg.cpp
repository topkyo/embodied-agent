#include "node_reg.h"
#include "node_runtime.h"
#include <WiFi.h>
#include <WiFiManager.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <ArduinoJson.h>
#include <PubSubClient.h>

#ifndef DEPLOYMENT_ID
#define DEPLOYMENT_ID "dep-gh-pilot-001"
#endif
#ifndef MQTT_HOST
#define MQTT_HOST "127.0.0.1"
#endif
#ifndef API_HOST
#define API_HOST MQTT_HOST
#endif
#ifndef API_PORT
#define API_PORT 3001
#endif
#ifndef MQTT_PORT
#define MQTT_PORT 1883
#endif
#ifndef MQTT_USERNAME
#define MQTT_USERNAME ""
#endif
#ifndef MQTT_PASSWORD
#define MQTT_PASSWORD ""
#endif
#ifndef NODE_ID
#define NODE_ID "node-esp32-unset"
#endif

static Preferences prefs;
static String gNodeId;
static String gNodeToken;
static String gDeploymentId = DEPLOYMENT_ID;
static String gPairingTopic;
static bool gRegistered = false;
static bool gPairingSubscribed = false;

static String buildNodeId() {
#ifdef NODE_ID_ASSIGNED
  return String(NODE_ID);
#else
  uint8_t mac[6];
  WiFi.macAddress(mac);
  char buf[32];
  snprintf(buf, sizeof(buf), "node-esp-%02x%02x%02x", mac[3], mac[4], mac[5]);
  return String(buf);
#endif
}

static void loadPrefs() {
  prefs.begin("df-node", true);
  gNodeToken = prefs.getString("token", "");
  gRegistered = prefs.getBool("registered", false) && gNodeToken.length() > 0;
  prefs.end();
}

static void saveToken(const String &token) {
  prefs.begin("df-node", false);
  prefs.putString("token", token);
  prefs.putBool("registered", true);
  prefs.end();
  gNodeToken = token;
  gRegistered = true;
}

static bool httpRegister(const String &installCode) {
  HTTPClient http;
  String url = String("http://") + API_HOST + ":" + String(API_PORT) + "/nodes/register";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  StaticJsonDocument<768> doc;
  doc["deployment_id"] = gDeploymentId;
  doc["install_code"] = installCode;
  doc["node_id"] = gNodeId;
  doc["firmware_version"] = "esp32-node-reg-0.1";
  JsonObject caps = doc["capabilities"].to<JsonObject>();
  JsonArray sensors = caps["sensors"].to<JsonArray>();
  JsonObject s0 = sensors.add<JsonObject>();
  s0["channel"] = "i2c:0x44";
  JsonArray metrics = s0["metrics"].to<JsonArray>();
  metrics.add("temperature_c");
  metrics.add("humidity_percent");
  JsonArray actuators = caps["actuators"].to<JsonArray>();
  JsonObject a0 = actuators.add<JsonObject>();
  a0["channel"] = "relay:vent_left";
  a0["device_type"] = "vent_motor";
  JsonArray actions = a0["actions"].to<JsonArray>();
  actions.add("open");
  actions.add("close");
  actions.add("stop");

  String body;
  serializeJson(doc, body);
  int code = http.POST(body);
  String resp = http.getString();
  http.end();

  Serial.printf("[node-reg] register HTTP %d %s\n", code, resp.c_str());
  if (code != 200) return false;

  StaticJsonDocument<512> out;
  if (deserializeJson(out, resp)) return false;
  const char *token = out["node_token"];
  if (!token) return false;
  saveToken(token);
  Serial.println("[node-reg] ::REGISTERED:: pending");
  return true;
}

static void onPairingMessage(char *topic, byte *payload, unsigned int length) {
  StaticJsonDocument<512> doc;
  if (deserializeJson(doc, payload, length)) return;
  const char *code = doc["install_code"];
  if (!code) return;
  Serial.printf("[node-reg] pairing code received: %s\n", code);
  if (gRegistered) {
    Serial.println("[node-reg] already registered, ignore");
    return;
  }
  httpRegister(String(code));
}

static void ensurePairingSubscribe(PubSubClient &mqtt) {
  if (gRegistered || gPairingSubscribed || !mqtt.connected()) return;
  gPairingTopic = String("deployments/") + gDeploymentId + "/pairing/" + gNodeId + "/install_code";
  mqtt.subscribe(gPairingTopic.c_str());
  gPairingSubscribed = true;
  Serial.printf("[node-reg] subscribed %s\n", gPairingTopic.c_str());
}

void nodeRegSetup(PubSubClient &mqtt) {
  gNodeId = buildNodeId();
  loadPrefs();
  Serial.printf("[node-reg] node_id=%s registered=%d\n", gNodeId.c_str(), gRegistered);

  WiFiManager wm;
  wm.setConfigPortalTimeout(180);
  String apName = String("DF-Node-") + gNodeId.substring(gNodeId.length() - 4);
  if (!wm.autoConnect(apName.c_str())) {
    Serial.println("[node-reg] WiFi config failed, restart");
    delay(1000);
    ESP.restart();
  }
  Serial.printf("[node-reg] WiFi OK %s\n", WiFi.localIP().toString().c_str());

  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback([](char *topic, byte *payload, unsigned int len) {
    if (gPairingTopic.length() && String(topic) == gPairingTopic) {
      onPairingMessage(topic, payload, len);
      return;
    }
    nodeRuntimeDispatch(mqtt, topic, payload, len);
  });
}

void nodeRegLoop(PubSubClient &mqtt) {
  if (!mqtt.connected()) {
    gPairingSubscribed = false;
    if (WiFi.status() == WL_CONNECTED) {
      String clientId = String("df-node-") + gNodeId;
      const char *user = MQTT_USERNAME[0] ? MQTT_USERNAME : nullptr;
      const char *pass = MQTT_PASSWORD[0] ? MQTT_PASSWORD : nullptr;
      if (mqtt.connect(clientId.c_str(), user, pass)) {
        Serial.println("[node-reg] MQTT connected");
      }
    }
  } else {
    ensurePairingSubscribe(mqtt);
  }
  mqtt.loop();
}

bool nodeRegIsRegistered() { return gRegistered; }
const char *nodeRegNodeId() { return gNodeId.c_str(); }
const char *nodeRegDeploymentId() { return gDeploymentId.c_str(); }
const char *nodeRegNodeToken() { return gNodeToken.c_str(); }
