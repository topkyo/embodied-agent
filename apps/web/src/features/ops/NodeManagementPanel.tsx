/**
 * 对外入口：实现已拆至 `features/ops/nodes/`。
 * 保留本路径 re-export，兼容 `features/ops/NodeManagementPanel` import。
 */
export {
  NodeManagementPanel,
  formatNodeEntityLabel,
  formatNodeTechTitle,
  relativeAgeFromIso,
  type RelativeAge,
} from "./nodes/NodeManagementPanel";
