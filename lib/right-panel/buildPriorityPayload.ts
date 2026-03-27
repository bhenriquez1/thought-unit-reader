import type { ActivePageContext, PageClassification, PageSignals, PriorityPayload } from "@/lib/readerContracts";

function topEvidence(signals: PageSignals, count = 5): string[] {
  return (signals.paragraphSignals || [])
    .filter((p) => !p.suppress)
    .sort((a, b) => b.yieldScore - a.yieldScore)
    .slice(0, count)
    .map((p) => p.text);
}

export function buildPriorityPayload(ctx: ActivePageContext, classification: PageClassification, signals: PageSignals): PriorityPayload {
  const pageType = classification.pageType;
  const evidence = topEvidence(signals, 5);

  if (signals.pageRole && ["cover", "contents", "chapter_opener", "section_opener", "copyright_frontmatter", "image_scan_heavy"].includes(signals.pageRole)) {
    return {
      pageRole: `This is a ${signals.pageRole.replace(/_/g, " ")} page.`,
      primaryGoal: "Orient the learner to structure and context before deep study.",
      mainIdeas: topEvidence(signals, 3),
      whyItMatters: ["Navigation and scope framing"],
      whatToRemember: ["Use this page for orientation, not deep concept extraction."],
    };
  }

  if (pageType === "diagnostic") {
    return {
      pageRole: "This page is testing whether the learner can execute the target skill under exam conditions.",
      primaryGoal: "Find the tested method and avoid the trap pattern.",
      mainIdeas: evidence.length ? evidence.slice(0, 4) : ["Identify tested skill", "Identify first move"],
      whyItMatters: ["Exam readiness", "Procedural fluency", "Concept transfer"],
      whatToRemember: ["What is being asked", "What framework applies", "What common mistake to avoid"],
    };
  }

  if (pageType === "overview") {
    return {
      pageRole: "This page introduces the topic and frames what later pages will build.",
      primaryGoal: "Compress the chapter frame into a short map.",
      mainIdeas: evidence.length ? evidence.slice(0, 3) : [ctx.sectionTitle || "Core frame"],
      whyItMatters: ["Prevents fragmented memorization"],
      whatToRemember: ["Big picture first", "Then details"],
    };
  }

  if (pageType === "clinical") {
    return {
      pageRole: "This page supports recognition, interpretation, and decision-making in a clinical context.",
      primaryGoal: "Extract findings, implication, and next decision.",
      mainIdeas: evidence.length ? evidence.slice(0, 3) : ["Clinical relevance", "Recognition cues"],
      whyItMatters: ["Differential accuracy", "Safer management decisions"],
      whatToRemember: ["Sign → interpretation → implication"],
    };
  }

  if (pageType === "formula") {
    return {
      pageRole: "This page teaches a symbolic rule that must be recognized and applied correctly.",
      primaryGoal: "Map symbols, pattern, and valid usage.",
      mainIdeas: evidence.length ? evidence.slice(0, 3) : ["Variable meaning", "Transformation pattern"],
      whyItMatters: ["Faster pattern recognition in questions"],
      whatToRemember: ["Symbol meaning", "Usage condition", "Trap sign"],
    };
  }

  return {
    pageRole: "This page advances the current topic using evidence-ranked blocks.",
    primaryGoal: "Keep only highest-yield ideas and suppress filler.",
    mainIdeas: evidence.length ? evidence : [ctx.pageText.slice(0, 160)],
    whyItMatters: ["Supports downstream reasoning in this chapter"],
    whatToRemember: evidence.length ? evidence.slice(0, 2) : ["Use evidence from page text"],
  };
}
