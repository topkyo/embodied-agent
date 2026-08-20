#include "node_runtime.h"
#include "node_cmd.h"
#include "node_config.h"
#include "node_reg.h"

void nodeRuntimeSetup() {
  nodeConfigSetup();
  nodeCmdSetup();
}

void nodeRuntimeLoop(PubSubClient &mqtt) {
  if (!nodeRegIsRegistered()) return;
  nodeConfigLoop(mqtt);
  nodeCmdLoop(mqtt);
}

void nodeRuntimeDispatch(PubSubClient &mqtt, char *topic, byte *payload,
                         unsigned int length) {
  nodeConfigOnMessage(mqtt, topic, payload, length);
  nodeCmdOnMessage(mqtt, topic, payload, length);
}