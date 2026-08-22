export function clarificationMessage(hint?: string): string {
  if (hint) {
    return hint;
  }
  return "没太听懂您的意思。请补充目标、动作或必要参数。";
}

export function serviceUnavailableMessage(): string {
  return "具身 Agent 服务暂不可用，请稍后再试。";
}
