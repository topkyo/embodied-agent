import { Navigate, Route, Routes } from "react-router-dom";
import AppErrorBoundary from "./components/AppErrorBoundary";
import DocumentTitle from "./components/DocumentTitle";
import RequireAuth from "./components/RequireAuth";
import { AuthProvider } from "./contexts/AuthContext";
import WorkbenchLayout from "./layouts/WorkbenchLayout";
import Login from "./pages/Login";
import Start from "./pages/Start";
import StartWechat from "./pages/StartWechat";
import Pair from "./pages/Pair";
import SceneOpsLayout from "./layouts/SceneOpsLayout";
import SceneOpsOverview from "./pages/scene-ops/SceneOpsOverview";
import SceneOpsSettings from "./pages/scene-ops/SceneOpsSettings";
import SceneOpsDevices from "./pages/scene-ops/SceneOpsDevices";
import SceneOpsReview from "./pages/scene-ops/SceneOpsReview";
import SceneOpsControl from "./pages/scene-ops/SceneOpsControl";
import SceneOpsPlatformGate from "./pages/scene-ops/SceneOpsPlatformGate";
import SceneOpsUsers from "./pages/scene-ops/SceneOpsUsers";
import SceneOpsSchemaExtension from "./pages/scene-ops/SceneOpsSchemaExtension";
import NotFound from "./pages/NotFound";

export default function App() {
  return (
    <AppErrorBoundary>
      <DocumentTitle />
      <Routes>
        <Route path="/" element={<Navigate to="/start" replace />} />

        <Route element={<WorkbenchLayout />}>
          <Route path="/login" element={<Login />} />
          <Route path="/start" element={<Start />} />
          <Route path="/start/wechat" element={<StartWechat />} />
        </Route>

        <Route
          path="/scenes/:packSlug/ops"
          element={
            <AuthProvider>
              <RequireAuth>
                <SceneOpsLayout />
              </RequireAuth>
            </AuthProvider>
          }
        >
          <Route index element={<SceneOpsOverview />} />
          <Route path="control" element={<SceneOpsControl />} />
          <Route path="settings" element={<SceneOpsSettings />} />
          <Route path="devices" element={<SceneOpsDevices />} />
          <Route path="devices/pair" element={<Pair />} />
          <Route path="review" element={<SceneOpsReview />} />
          <Route path="platform" element={<SceneOpsPlatformGate />} />
          {/* A′：飞轮 UI 在 platform#flywheel，不再误跳 review */}
          <Route
            path="flywheel"
            element={<Navigate to={{ pathname: "platform", hash: "flywheel" }} replace />}
          />
          <Route path="users" element={<SceneOpsUsers />} />
          {/*
            Phase 2.5：不再把 * 一律吞进 SchemaExtension。
            SchemaExtension 仅在 schema kind=extension tab 匹配时渲染；否则内部 → NotFound。
            内置 path 已在上方显式声明。
          */}
          <Route path="*" element={<SceneOpsSchemaExtension />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </AppErrorBoundary>
  );
}
