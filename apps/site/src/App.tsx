import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import DocumentTitle from "./components/DocumentTitle";
import Nodes from "./pages/Nodes";
import PlatformHome from "./pages/PlatformHome";
import ScenesList from "./pages/ScenesList";
import SceneGreenhouse from "./pages/SceneGreenhouse";
import SceneIndustrial from "./pages/SceneIndustrial";
import SceneRobot from "./pages/SceneRobot";
import SceneAquaculture from "./pages/SceneAquaculture";
import SceneColdchain from "./pages/SceneColdchain";
import SceneElderly from "./pages/SceneElderly";
import ScenePet from "./pages/ScenePet";
import MarketingLayout from "./layouts/MarketingLayout";
import NotFound from "./pages/NotFound";

const DesignLab = lazy(() => import("./pages/DesignLab"));

export default function App() {
  return (
    <>
      <DocumentTitle />
      <Routes>
        <Route path="/scenes/greenhouse" element={<SceneGreenhouse />} />
        <Route path="/scenes/robot" element={<SceneRobot />} />
        <Route path="/scenes/aquaculture" element={<SceneAquaculture />} />
        <Route path="/scenes/coldchain" element={<SceneColdchain />} />
        <Route path="/scenes/industrial" element={<SceneIndustrial />} />
        <Route path="/scenes/elderly" element={<SceneElderly />} />
        <Route path="/scenes/pet" element={<ScenePet />} />

        <Route element={<MarketingLayout />}>
          <Route path="/" element={<PlatformHome />} />
          <Route path="/nodes" element={<Nodes />} />
          <Route path="/scenes" element={<ScenesList />} />
          {import.meta.env.DEV && (
            <Route
              path="/design-lab"
              element={
                <Suspense fallback={null}>
                  <DesignLab />
                </Suspense>
              }
            />
          )}
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}
