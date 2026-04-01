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

function roleAdapt(line: string, role: PanelRole): string {
  if (role === "expert") return line.replace(/\bshould\b/gi, "must").replace(/\bit is\b/gi, "");
  if (role === "operator") return line;
  return line
    .replace(/\bclinical\b/gi, "practical")
    .replace(/\bdifferential\b/gi, "distinction")
    .replace(/\bpathology\b/gi, "underlying issue");
}

export function buildPanelView(input: {
  pageModel: PageInsightModel;
  mode: PanelMode;
  role: PanelRole;
  depth: PanelDepth;
}): PanelView {
  const { pageModel, mode, role, depth } = input;
  const rolePrefix = role === "expert" ? "Expert read:" : role === "operator" ? "Operator read:" : "General read:";
  const summary = `${rolePrefix} ${pageModel.pageSummary}`;
  const baseSequences = trimByDepth(pageModel.decisionPaths, depth);
  const baseBullets = trimByDepth(pageModel.topTakeaways, depth).map((line) => roleAdapt(line, role));

  if (mode === "compare") {
    const sequences = trimByDepth(baseSequences.filter((entry) => entry.template === "comparison"), depth);
    return {
      title: "Compare",
      summary,
      bullets: baseBullets,
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
      bullets: [
        ...baseBullets,
        ...trimByDepth(baseSequences.map((entry) => roleAdapt(entry.implication, role)), depth === "quick" ? "quick" : "standard"),
      ].slice(0, depth === "deep" ? 5 : depth === "standard" ? 3 : 2),
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
      bullets: [
        ...baseBullets,
        ...trimByDepth(baseSequences.map((entry) => roleAdapt(entry.interpretation, role)), "quick"),
      ].slice(0, depth === "deep" ? 4 : depth === "standard" ? 3 : 2),
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
      bullets: [
        ...baseBullets,
        ...trimByDepth(baseSequences.map((entry) => roleAdapt(entry.nextMove, role)), "quick"),
      ].slice(0, depth === "deep" ? 4 : depth === "standard" ? 3 : 2),
      sequences: sequences.length ? sequences : trimByDepth(baseSequences, depth),
      evidence: trimByDepth(sequences.flatMap((entry) => entry.evidence), depth),
      confusionRisk: sequences.find((entry) => entry.trap)?.trap,
    };
  }

  return {
    title: "Insight",
    summary,
    bullets: baseBullets,
    sequences: trimByDepth(baseSequences, depth),
    evidence: trimByDepth(baseSequences.flatMap((entry) => entry.evidence), depth),
    confusionRisk: baseSequences.find((entry) => entry.trap)?.trap,
  };
}
