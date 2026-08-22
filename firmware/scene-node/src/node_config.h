#pragma once

#include <Arduino.h>
#include <PubSubClient.h>

/** 订阅 retained config，解析 devices 与 config_version（DRY_RUN，不驱动 GPIO）。 */
void nodeConfigSetup();
void nodeConfigLoop(PubSubClient &mqtt);
void nodeConfigOnMessage(PubSubClient &mqtt, const char *topic, const byte *payload,
                         unsigned int length);

int nodeConfigVersion();
bool nodeConfigReady();
bool nodeConfigHasDevice(const char *device_id);
/** 返回 config 中设备的 channel；未找到返回 nullptr */
const char *nodeConfigDeviceChannel(const char *device_id);
const char *nodeConfigTopic();