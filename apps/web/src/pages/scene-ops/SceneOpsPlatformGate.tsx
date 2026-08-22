import { Navigate, useLocation, useParams } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { resolvePackBySlug } from "../../lib/domain-packs";
import { AsyncState } from "../../components/ops/AsyncState";
import SceneOpsPlatform from "./SceneOpsPlatform";
import SceneOpsPlatformDenied from "./SceneOpsPlatformDenied";

export default function SceneOpsPlatformGate() {
  const { packSlug = "" } = useParams<{ packSlug: string }>();
  const pack = resolvePackBySlug(packSlug);
  const { user, loading, isAdmin } = useAuth();
  const location = useLocation();
  const fromPath = `${location.pathname}${location.search || ""}`;

  if (loading) {
    return (
      <section className="settings settings-console">
        <AsyncState loading />
      </section>
    );
  }

  if (!user) {
    // 匿名 → 不再弹 admin_required 拒绝壳，统一让 顶部 「登录」 链接 承担；
    // 直接 redirect /login state.from = 当前 ops/platform 路径，登录后回弹这里。
    return <Navigate to="/login" state={{ from: fromPath }} replace />;
  }

  if (!isAdmin) {
    // Authenticated but not admin — explicit denial, not "settings failed".
    return <SceneOpsPlatformDenied pack={pack} />;
  }

  return <SceneOpsPlatform />;
}
