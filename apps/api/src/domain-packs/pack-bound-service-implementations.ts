import { formatPestAdviceReply } from "../integrations/agronomy/pests.js";
import {
  fetchNdviForPlot,
  formatNdviReply,
  resolveNdviPlot,
} from "../integrations/satellite/ndvi.js";

/**
 * pack-bound service 实现，按 serviceKey 索引。
 * Domain Pack 通过 contract.capabilities[].requiredServices 声明需要的 serviceKey；
 * apps/api 加载 active contract 时按 requiredServiceKeys 自动挑选实现并 registerPackBoundDomainServices。
 * 新增 pack 复用已有 serviceKey 不需要改本表；全新外部集成服务仍需在此追加实现（合理平台职责）。
 */
export const packBoundServiceImplementations: Record<string, Record<string, unknown>> = {
  satelliteNdvi: {
    resolvePlot: resolveNdviPlot,
    fetchForPlot: fetchNdviForPlot,
    formatReply: formatNdviReply,
  },
  agronomyPests: {
    formatReply: formatPestAdviceReply,
  },
};
