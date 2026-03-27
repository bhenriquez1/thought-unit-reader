import type { ActivePageContext, ExplainPayload, PageClassification } from "@/lib/readerContracts";

function pickEvidence(ctx: ActivePageContext): string[] {
  return ctx.paragraphTexts
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 20)
    .slice(0, 5);
}

export function buildExplainPayload(ctx: ActivePageContext, classification: PageClassification): ExplainPayload {
  const t = classification.pageType;
  const evidence = pickEvidence(ctx);

  if (t === "diagnostic") {
    return {
      meaning: evidence[0] || "This question set checks conceptual execution, not just final answers.",
      mechanism: evidence[1] || "The solving framework works when you classify the problem type before computation.",
      stepwiseBreakdown: ["Identify problem type", "Choose governing rule", "Execute", "Check trap"],
      application: ["Use this in timed drills", "Audit first-step errors"],
    };
  }

  if (t === "formula") {
    return {
      meaning: evidence[0] || "What this formula represents in the system.",
      mechanism: evidence[1] || "Why the structure of the formula works.",
      stepwiseBreakdown: ["Define symbols", "Identify pattern", "Show relationship", "Indicate valid usage"],
      application: ["When to use", "When not to use", "How to recognize in problems"],
    };
  }

  if (t === "clinical") {
    return {
      meaning: evidence[0] || "What clinical sign or finding is being recognized.",
      mechanism: evidence[1] || "Why it happens and what that means clinically.",
      stepwiseBreakdown: ["Recognize", "Interpret", "Infer implication", "Choose action"],
      application: ["Use in differential diagnosis", "Use in treatment planning"],
    };
  }

  return {
    meaning: evidence[0] || "Define the concept in plain language from this page.",
    mechanism: evidence[1] || "Explain why it works using visible causal links.",
    stepwiseBreakdown: evidence.slice(0, 4).length ? evidence.slice(0, 4) : ["Extract claim", "Find mechanism", "Link to context", "Apply"],
    application: ["Write one recall Q", "Write one application Q"],
  };
}
