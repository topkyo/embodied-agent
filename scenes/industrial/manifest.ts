export const INDUSTRIAL_PACK_ID = "industrial" as const;

export const INDUSTRIAL_PACK = {
  id: INDUSTRIAL_PACK_ID,
  displayName: "工业安能卫士",
  status: "live" as const,
  eval: {
    golden: "eval/intent-golden.zh.jsonl",
    matrixExtra: "eval/sim-matrix-extra.jsonl",
    matrixWechat: "eval/sim-matrix-wechat.jsonl",
    matrixNegative: "eval/sim-matrix-negative.jsonl",
  },
  channelOnboarding: {
    examples: ["1号柜温度多少", "开排风", "停排风"],
  },
} as const;
