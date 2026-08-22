/**
 * Embodied Agent ESP32 Scene Node — 配对与自注册固件入口。
 * 命令执行与 config apply 见 docs/protocol/esp32-node-registration.zh.md；开发闭环用 scripts/node-simulator.ts。
 */
#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#ifdef MQTT_USE_TLS
#include <WiFiClientSecure.h>
#include "mqtt_ca.h"
#endif
#include "node_gps.h"
#include "node_gpio.h"
#include "node_heartbeat.h"
#include "node_reg.h"
#include "node_runtime.h"
#include "node_time.h"

#ifdef MQTT_USE_TLS
WiFiClientSecure wifiClient;
#else
WiFiClient wifiClient;
#endif
PubSubClient mqtt(wifiClient);

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("[boot] Embodied Agent Scene Node");
#ifdef MQTT_USE_TLS
#ifdef MQTT_TLS_INSECURE
  wifiClient.setInsecure();
  Serial.println("[boot] MQTT TLS enabled (insecure / self-signed)");
#else
  if (MQTT_CA_CERT[0] != '\0') {
    wifiClient.setCACert(MQTT_CA_CERT);
    Serial.println("[boot] MQTT TLS enabled (CA verification)");
  } else {
    Serial.println("[boot] MQTT_CA_CERT_PEM empty, refusing to setInsecure");
  }
#endif
#endif
  mqtt.setBufferSize(1024);
  nodeGpsSetup();
  nodeGpioSetup();
  nodeTimeSetup();
  nodeHeartbeatSetup();
  nodeRuntimeSetup();
  nodeRegSetup(mqtt);
}

void loop() {
  nodeGpsLoop();
  nodeTimeLoop();
  nodeRegLoop(mqtt);
  nodeRuntimeLoop(mqtt);
  nodeGpioLoop();
  nodeHeartbeatLoop(mqtt);
}