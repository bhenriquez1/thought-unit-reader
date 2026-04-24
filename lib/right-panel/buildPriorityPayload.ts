import type { ActivePageContext, PageClassification, PriorityPayload } from "@/lib/readerContracts";

export function buildPriorityPayload(ctx: ActivePageContext, classification: PageClassification): PriorityPayload {
  const pageType = classification.pageType;
  if (pageType === "diagnostic") {
    return {
      pageRole: "This page is testing whether the learner can execute the target skill under exam conditions.",
      primaryGoal: "Recognize the underlying concept, choose the right solving framework, and avoid surface-level traps.",
      mainIdeas: ["Identify tested skill", "Identify assumed prerequisite", "Identify first move", "Identify likely trap"],
      whyItMatters: ["Exam readiness", "Procedural fluency", "Concept transfer"],
      whatToRemember: ["What is being asked", "What formula or framework applies", "What common mistake to avoid"],
    };
  }
  if (pageType === "overview") {
    return { pageRole: "This page introduces the topic and frames what later pages will build.", primaryGoal: "Anchor the big picture before memorizing details.", mainIdeas: ["Why this topic matters", "Core idea", "Big picture frame"], whyItMatters: ["Prevents fragmented learning"], whatToRemember: ["Frame first, details second"] };
  }
  if (pageType === "clinical") {
    return { pageRole: "This page supports recognition, interpretation, and decision-making in a clinical context.", primaryGoal: "Recognize findings and connect them to implications.", mainIdeas: ["Clinical relevance", "Recognition cues", "Decision supported"], whyItMatters: ["Faster diagnosis", "Safer management"], whatToRemember: ["Sign → interpretation → implication"] };
  }
  if (pageType === "formula") {
    return { pageRole: "This page provides a symbolic rule set that must be understood structurally, not memorized as isolated text.", primaryGoal: "Map symbols to meaning and pattern usage.", mainIdeas: ["Variable meaning", "Transformation pattern"], whyItMatters: ["Improves transfer to problems"], whatToRemember: ["Variable meanings", "When to use", "Common misuse"] };
  }
  const first = ctx.paragraphTexts.find((p) => p.length > 24) || ctx.pageText.slice(0, 180);
  return {
    pageRole: "This page advances understanding for the current topic.",
    primaryGoal: "Extract the core claim and its practical consequence.",
    mainIdeas: [first],
    whyItMatters: ["Builds long-term conceptual structure"],
    whatToRemember: ["Name the key idea", "Recall one use-case"],
  };
}
