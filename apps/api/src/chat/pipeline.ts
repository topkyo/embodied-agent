import { createFetchLlmClient, LlmUnavailableError, type LlmClient } from "@embodied-agent/agent";
import { getEffectiveSettings } from "../settings/store.js";
import { getAgentRuntimeContext } from "../runtime/agent-context.js";
import { buildDeploymentContextSync } from "@embodied-agent/agent";
import { runChatPipeline } from "@embodied-agent/chat-runtime";
import type { MqttCommandPublisher, MqttContext } from "@embodied-agent/node";
import { createChatPipelinePorts } from "./pipeline-ports.js";

export type { NormalizedChatMessage } from "./types.js";
export type ChatPipelineResult = import("@embodied-agent/chat-runtime").ChatPipelineResult;
export type ChatPipelineDeps =
  import("@embodied-agent/chat-runtime").ChatPipelineDeps<MqttCommandPublisher>;

export async function processChatMessage(
  msg: import("./types.js").NormalizedChatMessage,
  deps: ChatPipelineDeps,
  mqttCtx?: MqttContext,
): Promise<ChatPipelineResult> {
  const chatPorts = createChatPipelinePorts(mqttCtx);
  return runChatPipeline(msg, deps, chatPorts);
}

function unavailableClient(): LlmClient {
  return {
    async completeJson() {
      throw new LlmUnavailableError(
        "请在 Web 配置台填写 LLM API Key（OpenAI / DeepSeek），或设置 LLM_API_KEY。",
      );
    },
    async completeText() {
      throw new LlmUnavailableError(
        "请在 Web 配置台填写 LLM API Key（OpenAI / DeepSeek），或设置 LLM_API_KEY。",
      );
    },
  };
}

export function resolveLlmFromSettings(overrides?: Partial<ChatPipelineDeps>): ChatPipelineDeps {
  const { bindings } = getAgentRuntimeContext();
  if (overrides?.llmClient) {
    return {
      llmClient: overrides.llmClient,
      model: overrides.model ?? "test",
      deploymentContext: overrides.deploymentContext ?? buildDeploymentContextSync(bindings),
      mqtt: overrides.mqtt,
      mqttEnabled: overrides.mqttEnabled,
      mqttUrl: overrides.mqttUrl,
    };
  }

  const s = getEffectiveSettings();
  const deploymentContext = buildDeploymentContextSync(bindings);

  if (!s.llm_api_key) {
    return {
      llmClient: unavailableClient(),
      model: s.llm_model,
      deploymentContext,
      mqtt: overrides?.mqtt,
      mqttEnabled: overrides?.mqttEnabled ?? true,
      mqttUrl: s.mqtt_url,
    };
  }

  return {
    llmClient: createFetchLlmClient({
      apiKey: s.llm_api_key,
      baseUrl: s.llm_base_url,
      model: s.llm_model,
      thinking: s.llm_thinking,
    }),
    model: s.llm_model,
    deploymentContext,
    mqtt: overrides?.mqtt,
    mqttEnabled: overrides?.mqttEnabled ?? true,
    mqttUrl: s.mqtt_url,
  };
}

export function resolveLlmFromEnv(): { client: LlmClient; model: string } {
  const deps = resolveLlmFromSettings();
  return { client: deps.llmClient, model: deps.model };
}

export function getLlmClientOrThrow(): { client: LlmClient; model: string } {
  return resolveLlmFromEnv();
}
