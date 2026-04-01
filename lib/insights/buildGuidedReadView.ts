import type { PanelDepth, PanelMode, PanelRole } from "@/lib/insights/buildPanelView";
import type { DecisionPath, GuidedReadStep, GuidedReadView, PageInsightModel } from "@/lib/insights/types";

function stepCount(depth: PanelDepth): number {
  return depth === "quick" ? 2 : depth === "standard" ? 3 : 4;
}

function labels(mode: PanelMode, role: PanelRole): string[] {
  if (mode === "explain") return role === "general" ? ["Start here", "Why it works", "What follows", "Do not miss"] : ["Claim", "Reason", "Mechanism", "Consequence"];
  if (mode === "compare") return ["Looks similar", "Separating signal", "Why it matters", "Trap"];
  if (mode === "relation") return ["Before this", "On this page", "What follows", "Why it matters"];
  if (mode === "apply") return role === "general" ? ["Scenario clue", "What it means", "Next move", "Wrong move"] : ["Signal", "Read", "Action", "Miss"];
  return role === "expert" ? ["Key signal", "Implication", "Consequence", "Rule"] : ["Start here", "Notice this", "What changes", "Do not miss"];
}

function pickPaths(pageModel: PageInsightModel, mode: PanelMode): DecisionPath[] {
  if (mode === "compare") return pageModel.decisionPaths.filter((p) => p.template === "comparison");
  if (mode === "relation") return pageModel.decisionPaths.filter((p) => p.template !== "comparison");
  if (mode === "explain") return pageModel.decisionPaths.filter((p) => p.template === "science" || p.template === "clinical");
  if (mode === "apply") return pageModel.decisionPaths.filter((p) => p.nextMove || p.trap);
  return pageModel.decisionPaths;
}

export function buildGuidedReadView(args: {
  pageModel: PageInsightModel;
  mode: PanelMode;
  role: PanelRole;
  depth: PanelDepth;
}): GuidedReadView {
  const { pageModel, mode, role, depth } = args;
  const count = stepCount(depth);
  const names = labels(mode, role);
  const paths = (pickPaths(pageModel, mode).length ? pickPaths(pageModel, mode) : pageModel.decisionPaths).slice(0, count);

  const steps: GuidedReadStep[] = paths.map((path, index) => ({
    id: `${mode}-${path.id}-${index}`,
    stepNumber: index + 1,
    label: names[index] || `Step ${index + 1}`,
    primaryText: role === "expert" ? path.interpretation : path.condition,
    secondaryText: mode === "explain" ? path.implication : mode === "apply" ? path.nextMove : path.trap || path.implication,
    mode,
    role,
    evidence: path.evidence.slice(0, 2).map((text, idx) => ({ id: `${path.id}-ev-${idx}`, text })),
    confidence: path.confidence,
  }));

  const supportTitle =
    mode === "compare" ? "Confusion risk" :
    mode === "relation" ? "Before / Here / After" :
    mode === "apply" ? "Fast rule" :
    mode === "explain" ? "Why this works" :
    "What matters most";

  const supportBullets = pageModel.topTakeaways.slice(0, depth === "quick" ? 2 : depth === "standard" ? 3 : 5);

  return {
    pagePurpose: pageModel.pageSummary,
    steps,
    supportTitle,
    supportBullets,
  };
}
