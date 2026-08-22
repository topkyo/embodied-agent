import { Navigate, useLocation } from "react-router-dom";

/**
 * /start/wechat 兼容壳。
 *
 * 历史路径（marketing site 深链、ops 顶栏"绑定微信"按钮、用户收藏）仍以
 * `/start/wechat?pack=&no_redirect=&principal=` 形式存在；本页只是把同一 search
 * 转到 /start 一体化页（picker + QR + CTAs）。
 *
 * 历史 QR 渲染逻辑在 apps/web/src/pages/Start.tsx。
 */
export default function StartWechat() {
  const { search } = useLocation();
  return <Navigate to={`/start${search ?? ""}`} replace />;
}
