#pragma once

#include <Arduino.h>

/** 假负载 GPIO：channel 字符串 → 引脚，open/close/start/stop，本地超时关断 */
void nodeGpioSetup();
void nodeGpioLoop();

bool nodeGpioStart(const char *channel, const char *action, unsigned long duration_ms);
void nodeGpioStopChannel(const char *channel);
void nodeGpioStopAll();

bool nodeGpioIsChannelActive(const char *channel);
bool nodeGpioAnyActive();

/** Safety inputs (active-high). DRY_RUN_GPIO returns false. */
bool nodeGpioManualOverrideActive();
bool nodeGpioEmergencyStopActive();