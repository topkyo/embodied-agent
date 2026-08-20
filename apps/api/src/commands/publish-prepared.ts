import type { CommandMessage } from "@embodied-agent/core";
import type { MqttCommandPublisher } from "@embodied-agent/node";
import { prepareCommandForPublish, type PrepareCommandResult } from "@embodied-agent/node";
import { getNodeToken } from "@embodied-agent/node";
import { markCommandFailed, markCommandSent, patchCommandConfigVersion } from "./store.js";

export type PublishPreparedOutcome = { ok: true } | { ok: false; code: string; message: string };

export async function publishPreparedCommand(opts: {
  command: CommandMessage;
  commandId: string;
  deploymentId: string;
  mqtt: MqttCommandPublisher;
  waitMs: number;
}): Promise<PublishPreparedOutcome> {
  const prepared = await prepareCommandForPublish(opts.command, opts.mqtt, {
    waitMs: opts.waitMs,
  });
  if (!prepared.ok) {
    markCommandFailed(
      opts.commandId,
      {
        code: prepared.code,
        message: prepared.message,
      },
      opts.deploymentId,
    );
    return { ok: false, code: prepared.code, message: prepared.message };
  }
  patchCommandConfigVersion(opts.commandId, prepared.config_version, opts.deploymentId);
  const nodeToken = getNodeToken(opts.deploymentId, prepared.command.node_id);
  if (!nodeToken) {
    markCommandFailed(
      opts.commandId,
      {
        code: "node_token_missing",
        message: "节点未签发 node_token，拒绝下发 MQTT 指令",
      },
      opts.deploymentId,
    );
    return {
      ok: false,
      code: "node_token_missing",
      message: "节点未签发 node_token，拒绝下发 MQTT 指令",
    };
  }
  const signedCommand: CommandMessage = {
    ...prepared.command,
    node_token: nodeToken,
  };
  try {
    await opts.mqtt.publishCommand(signedCommand);
    markCommandSent(opts.commandId, opts.deploymentId);
    return { ok: true };
  } catch {
    markCommandFailed(
      opts.commandId,
      {
        code: "mqtt_publish_failed",
        message: "MQTT 下发失败",
      },
      opts.deploymentId,
    );
    return {
      ok: false,
      code: "mqtt_publish_failed",
      message: "MQTT 下发失败",
    };
  }
}

export type { PrepareCommandResult };
