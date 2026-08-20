import ConceptScenePage from "./ConceptScenePage";

export default function SceneAquaculture() {
  return (
    <ConceptScenePage
      config={{
        slug: "aquaculture",
        badgeVariant: "next",
        showBadgeText: true,
        showBoundaryLink: true,
        showTrio: true,
      }}
    />
  );
}
