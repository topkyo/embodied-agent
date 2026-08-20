#pragma once

#include <PubSubClient.h>

/** 注册后订阅 config/commands，统一 MQTT 消息分发。 */
void nodeRuntimeSetup();
void nodeRuntimeLoop(PubSubClient &mqtt);
void nodeRuntimeDispatch(PubSubClient &mqtt, char *topic, byte *payload,
                         unsigned int length);