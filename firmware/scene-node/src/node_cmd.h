#pragma once

#include <Arduino.h>
#include <PubSubClient.h>

/** 订阅 commands，校验 config_version，DRY_RUN 执行并上报 command_event。 */
void nodeCmdSetup();
void nodeCmdLoop(PubSubClient &mqtt);
void nodeCmdOnMessage(PubSubClient &mqtt, const char *topic, const byte *payload,
                      unsigned int length);

const char *nodeCmdTopic();