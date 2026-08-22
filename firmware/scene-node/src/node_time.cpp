#include "node_time.h"
#include "node_gps.h"
#include <WiFi.h>
#include <time.h>

static bool gNtpStarted = false;
static bool gTimeReady = false;

void nodeTimeSetup() {
  gNtpStarted = false;
  gTimeReady = false;
}

void nodeTimeLoop() {
  if (WiFi.status() != WL_CONNECTED || gNtpStarted) return;
  configTime(0, 0, "ntp.aliyun.com", "pool.ntp.org");
  gNtpStarted = true;
  for (int i = 0; i < 15; i++) {
    time_t now = time(nullptr);
    if (now > 1700000000) {
      gTimeReady = true;
      Serial.println("[node-time] NTP synced");
      return;
    }
    delay(200);
  }
  Serial.println("[node-time] NTP sync pending (using bench timestamp)");
}

bool nodeTimeFormatOccurredAt(char *buf, size_t len) {
  if (!buf || len < 8) return false;
  if (nodeGpsFormatUtc(buf, len)) return true;
  if (gTimeReady) {
    time_t now = time(nullptr);
    struct tm *gmt = gmtime(&now);
    if (gmt) {
      strftime(buf, len, "%Y-%m-%dT%H:%M:%SZ", gmt);
      return true;
    }
  }
  snprintf(buf, len, "bench+%lums", millis());
  return true;
}