export const GREENHOUSE_PACK_ID = "agriculture" as const;

export const GREENHOUSE_PACK = {
  id: GREENHOUSE_PACK_ID,
  displayName: "农业领域",
  status: "live" as const,
  eval: {
    golden: "eval/intent-golden.zh.jsonl",
    matrixExtra: "eval/sim-matrix-extra.jsonl",
    matrixWechat: "eval/sim-matrix-wechat.jsonl",
    matrixNegative: "eval/sim-matrix-negative.jsonl",
  },
  channelOnboarding: {
    examples: ["1号棚温度多少", "开通风", "1号棚关风机"],
  },
} as const;
