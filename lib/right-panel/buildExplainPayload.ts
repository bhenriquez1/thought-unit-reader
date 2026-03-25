import type { ActivePageContext, ExplainPayload, PageClassification } from "@/lib/readerContracts";

export function buildExplainPayload(ctx: ActivePageContext, classification: PageClassification): ExplainPayload {
  const t = classification.pageType;
  if (t === "diagnostic") {
    return {
      meaning: "This question set is checking underlying concept execution, not just final answers.",
      mechanism: "The solving framework works when you classify the problem type before computation.",
      stepwiseBreakdown: ["Identify problem type", "Choose governing rule", "Execute", "Check trap"],
      application: ["Use this in timed drills", "Audit first-step errors"],
    };
  }
  if (t === "formula") {
    return {
      meaning: "What this formula represents in the system.",
      mechanism: "Why the structure of the formula works.",
      stepwiseBreakdown: ["Define symbols", "Identify pattern", "Show relationship", "Indicate valid usage"],
      application: ["When to use", "When not to use", "How to recognize in problems"],
    };
  }
  if (t === "clinical") {
    return {
      meaning: "What clinical sign or finding is being recognized.",
      mechanism: "Why it happens and what that means biologically/clinically.",
      stepwiseBreakdown: ["Recognize", "Interpret", "Infer implication", "Choose action"],
      application: ["Use in differential diagnosis", "Use in treatment planning"],
    };
  }

  return {
    meaning: "Define the concept in plain language.",
    mechanism: "Explain why it works, using causal links where possible.",
    stepwiseBreakdown: ["Name concept", "Define simply", "Distinguish from neighbors", "Use it"],
    application: ["Write one recall Q", "Write one applied Q"],
  };
}
