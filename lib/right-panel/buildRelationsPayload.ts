import type { ActivePageContext, PageClassification, RelationsPayload } from "@/lib/readerContracts";

export function buildRelationsPayload(ctx: ActivePageContext, classification: PageClassification): RelationsPayload {
  const base = ctx.paragraphTexts.filter(Boolean).slice(0, 3);
  if (classification.pageType === "clinical") {
    return {
      prerequisites: ["Relevant anatomy/pathology principles"],
      currentLinks: ["Sign-symptom-diagnosis-treatment chain"],
      downstreamLinks: ["Management decisions", "Complication prevention"],
    };
  }
  if (classification.pageType === "formula") {
    return {
      prerequisites: ["Symbol meanings", "Core algebra rules"],
      currentLinks: ["Related identities and transformations"],
      downstreamLinks: ["Future problem families using this identity"],
    };
  }
  return {
    prerequisites: base.slice(0, 1),
    currentLinks: base.slice(0, 2),
    downstreamLinks: base.slice(1, 3),
  };
}
