/**
 * 安全面 NODE_ENV 单点信任判断。
 *
 * 安全相关的默认行为（admin token 回落、integration secret 放行、
 * rate-limit 宽松档）一律按生产处理；开发便利必须通过显式声明
 * NODE_ENV=development（或 test）来换取。NODE_ENV 未设置、空串、
 * "production" 或任何其他值都视为生产语义，fail closed。
 */
export function isExplicitDevEnv(): boolean {
  const mode = process.env.NODE_ENV;
  return mode === "development" || mode === "test";
}
