import type { ActivePageContext, PageClassification, PriorityPayload } from "@/lib/readerContracts";

function evidenceLines(ctx: ActivePageContext, count = 4): string[] {
  return ctx.paragraphTexts
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 28)
    .slice(0, count);
}

export function buildPriorityPayload(ctx: ActivePageContext, classification: PageClassification): PriorityPayload {
  const pageType = classification.pageType;
  const evidence = evidenceLines(ctx, 4);

  if (pageType === "diagnostic") {
    return {
      pageRole: "This page is testing whether the learner can execute the target skill under exam conditions.",
      primaryGoal: "Recognize the underlying concept, choose the right solving framework, and avoid surface-level traps.",
      mainIdeas: evidence.length ? evidence.slice(0, 4) : ["Identify tested skill", "Identify first move"],
      whyItMatters: ["Exam readiness", "Procedural fluency", "Concept transfer"],
      whatToRemember: ["What is being asked", "What framework applies", "What common mistake to avoid"],
    };
  }

  if (pageType === "overview") {
    return {
      pageRole: "This page introduces the topic and frames what later pages will build.",
      primaryGoal: "Anchor the big picture before memorizing details.",
      mainIdeas: evidence.length ? evidence.slice(0, 3) : ["Why this topic matters", "Core idea"],
      whyItMatters: ["Prevents fragmented learning"],
      whatToRemember: ["Frame first, details second"],
    };
  }

  if (pageType === "clinical") {
    return {
      pageRole: "This page supports recognition, interpretation, and decision-making in a clinical context.",
      primaryGoal: "Recognize findings and connect them to implications.",
      mainIdeas: evidence.length ? evidence.slice(0, 3) : ["Clinical relevance", "Recognition cues"],
      whyItMatters: ["Faster diagnosis", "Safer management"],
      whatToRemember: ["Sign → interpretation → implication"],
    };
  }

  if (pageType === "formula") {
    return {
      pageRole: "This page provides a symbolic rule set that must be understood structurally.",
      primaryGoal: "Map symbols to meaning and pattern usage.",
      mainIdeas: evidence.length ? evidence.slice(0, 3) : ["Variable meaning", "Transformation pattern"],
      whyItMatters: ["Improves transfer to problems"],
      whatToRemember: ["Variable meanings", "When to use", "Common misuse"],
    };
  }

  return {
    pageRole: "This page advances the current topic based on extracted evidence.",
    primaryGoal: "Extract the claim and its practical consequence from this page.",
    mainIdeas: evidence.length ? evidence : [ctx.pageText.slice(0, 160)],
    whyItMatters: ["Supports downstream reasoning in this chapter"],
    whatToRemember: evidence.length ? evidence.slice(0, 2) : ["Use evidence from the page text"],
  };
}
