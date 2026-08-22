import { bindNodeRuntime, resetNodeRuntimeBindingsForTest } from "../runtime-bindings.js";

bindNodeRuntime({
  getNodeHeartbeat: () => undefined,
  getNodeHeartbeatConfigVersion: () => undefined,
});

export { resetNodeRuntimeBindingsForTest };
