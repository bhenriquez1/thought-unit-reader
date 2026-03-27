import type { ActivePageContext, ExplainPayload, PageClassification, PageSignals } from "@/lib/readerContracts";
import type { ReasoningModeProfile } from "./modeProfile";
import { adaptLineForMode } from "./modeProfile";

function evidenceByKind(signals: PageSignals, kind: string, limit = 3): string[] {
  return (signals.paragraphSignals || [])
    .filter((p) => !p.suppress && (kind === "any" || p.kind === kind))
    .sort((a, b) => b.yieldScore - a.yieldScore)
    .slice(0, limit)
    .map((p) => p.text);
}

export function buildExplainPayload(_ctx: ActivePageContext, classification: PageClassification, signals: PageSignals, mode?: ReasoningModeProfile): ExplainPayload {
  const t = classification.pageType;
  const core = evidenceByKind(signals, "any", mode?.label === "expert" ? 6 : mode?.label === "student" ? 4 : 5).map((line) => mode ? adaptLineForMode(line, mode) : line);
  const mechanismBlocks = evidenceByKind(signals, "mechanism", 3);
  const definitionBlocks = evidenceByKind(signals, "definition", 3);

  if (signals.pageRole && ["cover", "contents", "chapter_opener", "section_opener", "copyright_frontmatter", "image_scan_heavy"].includes(signals.pageRole)) {
    return {
      meaning: `This page role is ${signals.pageRole.replace(/_/g, " ")} and mostly structural.`,
      mechanism: "Use it to map chapter scope and sequence.",
      stepwiseBreakdown: ["Identify structural cues", "Locate next teaching section", "Defer deep memorization"],
      application: ["Jump to dense teaching pages for study output"],
    };
  }

  if (t === "diagnostic") {
    return {
      meaning: core[0] || "This item set checks whether you can choose the right solving framework.",
      mechanism: mechanismBlocks[0] || "Pattern recognition comes first, then execution.",
      stepwiseBreakdown: mode?.label === "student"
        ? ["Spot the problem type", "Pick the rule", "Solve step by step", "Check common mistake"]
        : ["Identify problem type", "Choose governing rule", "Execute", "Check trap"],
      application: mode?.label === "expert" ? ["Practice timed", "Audit first-step errors", "Stress-test with close distractors"] : ["Practice timed", "Audit first-step errors"],
    };
  }

  if (t === "formula") {
    return {
      meaning: definitionBlocks[0] || core[0] || "What the expression represents.",
      mechanism: mechanismBlocks[0] || core[1] || "Why the algebraic structure works.",
      stepwiseBreakdown: ["Define symbols", "Identify pattern family", "Transform/expand", "Check use conditions"],
      application: ["When to use", "When not to use", "Common substitution traps"],
    };
  }

  if (t === "clinical") {
    return {
      meaning: core[0] || "What sign or symptom pattern is being recognized.",
      mechanism: mechanismBlocks[0] || core[1] || "Why this pattern occurs and what it implies.",
      stepwiseBreakdown: ["Recognize finding", "Interpret significance", "Differentiate alternatives", "Choose action"],
      application: ["Differential diagnosis", "Treatment implication"],
    };
  }

  return {
    meaning: definitionBlocks[0] || core[0] || "Define the key concept in plain language.",
    mechanism: mechanismBlocks[0] || core[1] || "Explain why the concept works.",
    stepwiseBreakdown: core.slice(0, 4).length ? core.slice(0, 4) : ["Extract claim", "Find mechanism", "Connect context", "Apply"],
    application: mode?.label === "expert" ? ["One recall question", "One mechanism probe", "One application question"] : ["One recall question", "One application question"],
  };
}
