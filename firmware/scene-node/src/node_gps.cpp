#include "node_gps.h"

#ifndef GPS_ENABLE
#define GPS_ENABLE 1
#endif

#if GPS_ENABLE
#include <TinyGPSPlus.h>
#include <HardwareSerial.h>

#ifndef GPS_RX_PIN
#define GPS_RX_PIN 16
#endif
#ifndef GPS_TX_PIN
#define GPS_TX_PIN 17
#endif
#ifndef GPS_BAUD
#define GPS_BAUD 9600
#endif

static TinyGPSPlus gGps;
static HardwareSerial *gGpsSerial = nullptr;
#endif

void nodeGpsSetup() {
#if GPS_ENABLE
  gGpsSerial = &Serial2;
  gGpsSerial->begin(GPS_BAUD, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);
  Serial.printf(
      "[node-gps] UART2 rx=%d tx=%d baud=%d\n",
      GPS_RX_PIN,
      GPS_TX_PIN,
      GPS_BAUD);
#else
  Serial.println("[node-gps] disabled (GPS_ENABLE=0)");
#endif
}

void nodeGpsLoop() {
#if GPS_ENABLE
  if (!gGpsSerial) return;
  while (gGpsSerial->available() > 0) {
    gGps.encode(gGpsSerial->read());
  }
#endif
}

bool nodeGpsHasFix() {
#if GPS_ENABLE
  return gGps.location.isValid();
#else
  return false;
#endif
}

bool nodeGpsRead(
    double *latitude,
    double *longitude,
    float *accuracy_m,
    uint8_t *fix_quality) {
#if GPS_ENABLE
  if (!gGps.location.isValid()) return false;
  if (latitude) *latitude = gGps.location.lat();
  if (longitude) *longitude = gGps.location.lng();
  if (accuracy_m) {
    *accuracy_m = gGps.hdop.isValid() ? gGps.hdop.value() * 5.0f : 0.0f;
  }
  if (fix_quality) {
    *fix_quality = gGps.altitude.isValid() ? 2 : 1;
  }
  return true;
#else
  (void)latitude;
  (void)longitude;
  (void)accuracy_m;
  (void)fix_quality;
  return false;
#endif
}

bool nodeGpsFormatUtc(char *buf, size_t len) {
#if GPS_ENABLE
  if (!gGps.date.isValid() || !gGps.time.isValid() || len < 21) return false;
  snprintf(
      buf,
      len,
      "%04d-%02d-%02dT%02d:%02d:%02d.000Z",
      gGps.date.year(),
      gGps.date.month(),
      gGps.date.day(),
      gGps.time.hour(),
      gGps.time.minute(),
      gGps.time.second());
  return true;
#else
  (void)buf;
  (void)len;
  return false;
#endif
}