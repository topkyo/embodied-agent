import ConceptScenePage from "./ConceptScenePage";

export default function SceneElderly() {
  return (
    <ConceptScenePage
      config={{
        slug: "elderly",
        badgeVariant: "plan",
        heroChildren: true,
        showWechatCta: true,
      }}
    />
  );
}
