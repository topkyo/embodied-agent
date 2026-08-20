import ConceptScenePage from "./ConceptScenePage";

export default function SceneColdchain() {
  return (
    <ConceptScenePage
      config={{
        slug: "coldchain",
        badgeVariant: "plan",
        showBadgeText: true,
        showBoundaryLink: true,
        showTrio: true,
      }}
    />
  );
}
