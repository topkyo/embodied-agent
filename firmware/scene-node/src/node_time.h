#pragma once

#include <Arduino.h>

/** WiFi 连接后尝试 NTP；格式化 command_event occurred_at（ISO8601 或 bench 回退） */
void nodeTimeSetup();
void nodeTimeLoop();
bool nodeTimeFormatOccurredAt(char *buf, size_t len);