#include "node_gpio.h"
#include <string.h>

#ifndef DRY_RUN_GPIO
#define DRY_RUN_GPIO 1
#endif

#ifndef GPIO_VENT_LEFT_PIN
#define GPIO_VENT_LEFT_PIN 25
#endif
#ifndef GPIO_FAN_01_PIN
#define GPIO_FAN_01_PIN 26
#endif
#ifndef GPIO_IRRIGATION_PIN
#define GPIO_IRRIGATION_PIN 27
#endif
#ifndef GPIO_VENT_RIGHT_PIN
#define GPIO_VENT_RIGHT_PIN 32
#endif
#ifndef GPIO_MAX_DURATION_MS
#define GPIO_MAX_DURATION_MS (4UL * 3600UL * 1000UL)
#endif
#ifndef GPIO_SWITCH_DELAY_MS
#define GPIO_SWITCH_DELAY_MS 300
#endif
#ifndef GPIO_MANUAL_OVERRIDE_PIN
#define GPIO_MANUAL_OVERRIDE_PIN 33
#endif
#ifndef GPIO_ESTOP_PIN
#define GPIO_ESTOP_PIN 34
#endif

struct ChannelPin {
  const char *name;
  uint8_t pin;
};

static const ChannelPin kChannels[] = {
    {"relay:vent_left", GPIO_VENT_LEFT_PIN},
    {"relay:fan_01", GPIO_FAN_01_PIN},
    {"relay:irrigation_a", GPIO_IRRIGATION_PIN},
    {"relay:irrigation_b", GPIO_IRRIGATION_PIN},
    {"relay:vent_right", GPIO_VENT_RIGHT_PIN},
};

struct ActiveLoad {
  bool on;
  uint8_t pin;
  char channel[24];
  unsigned long off_at_ms;
};

static ActiveLoad gActive = {};

static int resolvePin(const char *channel) {
  if (!channel) return -1;
  for (const auto &c : kChannels) {
    if (strcmp(c.name, channel) == 0) return c.pin;
  }
  return -1;
}

static bool isPulseAction(const char *action) {
  if (!action) return false;
  return strcmp(action, "open") == 0 || strcmp(action, "start") == 0 ||
         strcmp(action, "close") == 0;
}

static bool isStopAction(const char *action) {
  return action && strcmp(action, "stop") == 0;
}

static void writePin(uint8_t pin, bool high) {
#if DRY_RUN_GPIO
  Serial.printf("[node-gpio] DRY_RUN pin=%u level=%d\n", pin, high ? 1 : 0);
#else
  digitalWrite(pin, high ? HIGH : LOW);
  Serial.printf("[node-gpio] pin=%u level=%d\n", pin, high ? 1 : 0);
#endif
}

static void setupOutputPin(uint8_t pin) {
#if !DRY_RUN_GPIO
  pinMode(pin, OUTPUT);
  digitalWrite(pin, LOW);
#endif
}

static void setupInputPin(uint8_t pin) {
#if !DRY_RUN_GPIO
  pinMode(pin, INPUT_PULLUP);
#endif
}

static bool readSafetyInput(uint8_t pin) {
#if DRY_RUN_GPIO
  (void)pin;
  return false;
#else
  return digitalRead(pin) == HIGH;
#endif
}

bool nodeGpioManualOverrideActive() {
  return readSafetyInput(GPIO_MANUAL_OVERRIDE_PIN);
}

bool nodeGpioEmergencyStopActive() {
  return readSafetyInput(GPIO_ESTOP_PIN);
}

void nodeGpioSetup() {
  memset(&gActive, 0, sizeof(gActive));
#if !DRY_RUN_GPIO
  for (const auto &c : kChannels) {
    setupOutputPin(c.pin);
  }
  setupInputPin(GPIO_MANUAL_OVERRIDE_PIN);
  setupInputPin(GPIO_ESTOP_PIN);
  Serial.println("[node-gpio] dummy-load outputs armed (LOW)");
#else
  Serial.println("[node-gpio] DRY_RUN mode (no pin writes)");
#endif
}

void nodeGpioStopAll() {
  if (gActive.on) {
    writePin(gActive.pin, false);
    gActive.on = false;
    gActive.channel[0] = '\0';
    gActive.off_at_ms = 0;
  }
#if !DRY_RUN_GPIO
  for (const auto &c : kChannels) {
    digitalWrite(c.pin, LOW);
  }
#endif
}

void nodeGpioStopChannel(const char *channel) {
  int pin = resolvePin(channel);
  if (pin < 0) return;
  writePin((uint8_t)pin, false);
  if (gActive.on && gActive.pin == (uint8_t)pin) {
    gActive.on = false;
    gActive.channel[0] = '\0';
    gActive.off_at_ms = 0;
  }
}

bool nodeGpioIsChannelActive(const char *channel) {
  if (!gActive.on || !channel) return false;
  return strcmp(gActive.channel, channel) == 0;
}

bool nodeGpioAnyActive() { return gActive.on; }

bool nodeGpioStart(const char *channel, const char *action,
                   unsigned long duration_ms) {
  if (!channel || !action) return false;

  if (isStopAction(action)) {
    nodeGpioStopChannel(channel);
    return true;
  }

  if (!isPulseAction(action)) {
    Serial.printf("[node-gpio] unsupported action %s\n", action);
    return false;
  }

  int pin = resolvePin(channel);
  if (pin < 0) {
    Serial.printf("[node-gpio] unknown channel %s\n", channel);
    return false;
  }

  if (gActive.on && strcmp(gActive.channel, channel) != 0) {
    Serial.println("[node-gpio] reject: another channel active (interlock)");
    return false;
  }

  if (gActive.on) {
    writePin(gActive.pin, false);
    delay(GPIO_SWITCH_DELAY_MS);
  }

  bool energize = true;

  unsigned long capped = duration_ms;
  if (capped == 0) capped = 500;
  if (capped > GPIO_MAX_DURATION_MS) capped = GPIO_MAX_DURATION_MS;

  writePin((uint8_t)pin, energize);
  strncpy(gActive.channel, channel, sizeof(gActive.channel) - 1);
  gActive.channel[sizeof(gActive.channel) - 1] = '\0';
  gActive.pin = (uint8_t)pin;
  gActive.on = energize;
  gActive.off_at_ms = energize ? (millis() + capped) : 0;
  return true;
}

void nodeGpioLoop() {
  if (!gActive.on || gActive.off_at_ms == 0) return;
  if (millis() < gActive.off_at_ms) return;
  Serial.printf("[node-gpio] local timeout channel=%s\n", gActive.channel);
  nodeGpioStopChannel(gActive.channel);
}