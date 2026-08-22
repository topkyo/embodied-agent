import { LlmUnavailableError } from "@embodied-agent/agent";
import { SttUnavailableError } from "@embodied-agent/agent";

export const USER_REPLY = {
  sttFailed: "没听清，请再说一遍或打字。",
  needContent: "请发送文字或语音。",
  llmUnavailable: "具身 Agent 暂不可用，请稍后再试。",
  notBound: "尚未绑定账号，请联系安装人员。",
  integrationAuthFailed: "集成鉴权失败。",
} as const;

export function replyForChatInputError(e: unknown): { reply: string; status: number } {
  if (e instanceof SttUnavailableError) {
    return { reply: USER_REPLY.sttFailed, status: 200 };
  }
  if (e instanceof LlmUnavailableError) {
    const msg = e.message;
    if (msg.includes("需要 text") || msg.includes("audio")) {
      return { reply: USER_REPLY.needContent, status: 200 };
    }
    return { reply: USER_REPLY.llmUnavailable, status: 503 };
  }
  throw e;
}
