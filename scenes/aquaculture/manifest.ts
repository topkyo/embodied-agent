export const AQUACULTURE_PACK_ID = "aquaculture" as const;

export const AQUACULTURE_PACK = {
  id: AQUACULTURE_PACK_ID,
  displayName: "水产管家",
  status: "placeholder" as const,
  eval: {
    golden: "eval/intent-golden.zh.jsonl",
    matrixExtra: "eval/sim-matrix-extra.jsonl",
    matrixWechat: "eval/sim-matrix-wechat.jsonl",
    matrixNegative: "eval/sim-matrix-negative.jsonl",
  },
} as const;
