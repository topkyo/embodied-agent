export const ROBOT_PACK_ID = "robotics" as const;

export const ROBOT_PACK = {
  id: ROBOT_PACK_ID,
  displayName: "机器人领域",
  status: "live" as const,
  eval: {
    golden: "eval/intent-golden.zh.jsonl",
    matrixExtra: "eval/sim-matrix-extra.jsonl",
    matrixWechat: "eval/sim-matrix-wechat.jsonl",
    matrixNegative: "eval/sim-matrix-negative.jsonl",
  },
  channelOnboarding: {
    examples: ["机器人状态", "去充电桩", "停止导航"],
  },
} as const;
