import type { DecisionPath, PageInsightModel } from "@/lib/insights/types";

export type PanelMode = "insight" | "explain" | "compare" | "relation" | "apply";
export type PanelRole = "general" | "operator" | "expert";
export type PanelDepth = "quick" | "standard" | "deep";

export type PanelView = {
  title: string;
  summary: string;
  bullets: string[];
  sequences: DecisionPath[];
  evidence: string[];
  confusionRisk?: string;
};

function trimByDepth<T>(items: T[], depth: PanelDepth): T[] {
  const cap = depth === "quick" ? 1 : depth === "standard" ? 2 : 3;
  return items.slice(0, cap);
}

export function buildPanelView(input: {
  pageModel: PageInsightModel;
  mode: PanelMode;
  role: PanelRole;
  depth: PanelDepth;
}): PanelView {
  const { pageModel, mode, role, depth } = input;
  const rolePrefix = role === "expert" ? "Compressed expert read:" : role === "operator" ? "Operator read:" : "General read:";
  const summary = `${rolePrefix} ${pageModel.pageSummary}`;
  const baseSequences = trimByDepth(pageModel.decisionPaths, depth);

  if (mode === "compare") {
    const sequences = trimByDepth(baseSequences.filter((entry) => entry.template === "comparison"), depth);
    return {
      title: "Compare",
      summary,
      bullets: trimByDepth(pageModel.topTakeaways, depth),
      sequences: sequences.length ? sequences : trimByDepth(baseSequences, depth),
      evidence: trimByDepth(baseSequences.flatMap((entry) => entry.evidence), depth),
      confusionRisk: baseSequences.find((entry) => entry.trap)?.trap,
    };
  }

  if (mode === "relation") {
    const sequences = trimByDepth(baseSequences.filter((entry) => entry.template !== "comparison"), depth);
    return {
      title: "Relation",
      summary,
      bullets: trimByDepth(pageModel.topTakeaways, depth),
      sequences,
      evidence: trimByDepth(sequences.flatMap((entry) => entry.evidence), depth),
      confusionRisk: sequences.find((entry) => entry.trap)?.trap,
    };
  }

  if (mode === "explain") {
    const sequences = trimByDepth(baseSequences.filter((entry) => entry.template === "science" || entry.template === "clinical"), depth);
    return {
      title: "Explain",
      summary,
      bullets: trimByDepth(pageModel.topTakeaways, depth),
      sequences: sequences.length ? sequences : trimByDepth(baseSequences, depth),
      evidence: trimByDepth(baseSequences.flatMap((entry) => entry.evidence), depth),
      confusionRisk: sequences.find((entry) => entry.trap)?.trap,
    };
  }

  if (mode === "apply") {
    const sequences = trimByDepth(baseSequences.filter((entry) => entry.nextMove || entry.trap), depth);
    return {
      title: "Apply/Test",
      summary,
      bullets: trimByDepth(pageModel.topTakeaways, depth),
      sequences: sequences.length ? sequences : trimByDepth(baseSequences, depth),
      evidence: trimByDepth(sequences.flatMap((entry) => entry.evidence), depth),
      confusionRisk: sequences.find((entry) => entry.trap)?.trap,
    };
  }

  return {
    title: "Insight",
    summary,
    bullets: trimByDepth(pageModel.topTakeaways, depth),
    sequences: trimByDepth(baseSequences, depth),
    evidence: trimByDepth(baseSequences.flatMap((entry) => entry.evidence), depth),
    confusionRisk: baseSequences.find((entry) => entry.trap)?.trap,
  };
}
