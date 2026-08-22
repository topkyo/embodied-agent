#pragma once

#include <PubSubClient.h>

/** 注册成功后周期性 MQTT heartbeat（含可选 GPS） */
void nodeHeartbeatSetup();
void nodeHeartbeatLoop(PubSubClient &mqtt);