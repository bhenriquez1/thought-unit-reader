import type { InsightsPayload, PageClassification } from "@/lib/readerContracts";

export function buildInsightsPayload(classification: PageClassification): InsightsPayload {
  if (classification.pageType === "diagnostic") {
    return {
      highYield: ["Identify tested skill pattern before solving"],
      traps: ["Wrong setup", "Sign/formula misuse"],
      hiddenConnections: ["Recurring test families"],
      whatYouMayMiss: ["First-step clue hidden in wording"],
    };
  }
  if (classification.pageType === "clinical") {
    return {
      highYield: ["Implication of signs/findings"],
      traps: ["Confusing similar diagnoses"],
      hiddenConnections: ["Finding changes treatment logic"],
      whatYouMayMiss: ["Severity or contraindication context"],
    };
  }
  if (classification.pageType === "overview") {
    return {
      highYield: ["Big-picture frame for the chapter"],
      traps: ["Memorizing details before structure"],
      hiddenConnections: ["Later concepts this intro unlocks"],
      whatYouMayMiss: ["Scope boundaries of this section"],
    };
  }
  return {
    highYield: ["Core idea and one practical use"],
    traps: ["Term confusion", "Isolated memorization"],
    hiddenConnections: ["Prerequisite and downstream links"],
    whatYouMayMiss: ["What differentiates similar concepts"],
  };
}
