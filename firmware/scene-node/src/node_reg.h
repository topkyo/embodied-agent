#pragma once

#include <Arduino.h>
#include <PubSubClient.h>

/** SoftAP 配网 + MQTT pairing 收码 + HTTP /nodes/register */
void nodeRegSetup(PubSubClient &mqtt);
void nodeRegLoop(PubSubClient &mqtt);

bool nodeRegIsRegistered();
const char *nodeRegNodeId();
const char *nodeRegDeploymentId();
const char *nodeRegNodeToken();