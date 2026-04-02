import { buildScenario } from "@/lib/insights/buildScenario";
import type {
  DecisionPath,
  GuidedDepth,
  GuidedMode,
  GuidedReadStep,
  GuidedReadView,
  GuidedRole,
  PageInsightModel,
} from "@/lib/insights/types";

type TransformArgs = {
  pageModel: PageInsightModel;
  mode: GuidedMode;
  role: GuidedRole;
  depth: GuidedDepth;
};

export function transformByMode({ pageModel, mode, role, depth }: TransformArgs): GuidedReadView {
  switch (mode) {
    case "insight":
      return buildInsightView(pageModel, role, depth);
    case "explain":
      return buildExplainView(pageModel, role, depth);
    case "compare":
      return buildCompareView(pageModel, role, depth);
    case "relation":
      return buildRelationView(pageModel, role, depth);
    case "apply":
    case "apply_test":
      return buildScenario({ pageModel, role, depth });
    default:
      return buildInsightView(pageModel, role, depth);
  }
}

function buildInsightView(pageModel: PageInsightModel, role: GuidedRole, depth: GuidedDepth): GuidedReadView {
  const steps = pickPaths(pageModel.decisionPaths, depth).map((path, index) =>
    toStep({
      index,
      mode: "insight",
      role,
      label: ["Start here", "Notice this", "This means", "Do not miss"][index] || `Step ${index + 1}`,
      primaryText: path.condition,
      secondaryText: path.interpretation,
      path,
    }),
  );

  return {
    pagePurpose: pageModel.pageSummary || "Main idea and signal on this page.",
    steps,
    supportTitle: "What matters most",
    supportBullets: dedupe(pageModel.topTakeaways).slice(0, bulletCount(depth)),
  };
}

function buildExplainView(pageModel: PageInsightModel, role: GuidedRole, depth: GuidedDepth): GuidedReadView {
  const steps = pickPaths(pageModel.decisionPaths, depth).map((path, index) =>
    toStep({
      index,
      mode: "explain",
      role,
      label: ["Mechanism", "Effect", "Consequence", "Boundary"][index] || `Step ${index + 1}`,
      primaryText: path.interpretation,
      secondaryText: path.implication,
      path,
    }),
  );

  return {
    pagePurpose: `Why this works: ${pageModel.pageSummary}`,
    steps,
    supportTitle: "Why this works",
    supportBullets: dedupe(pageModel.decisionPaths.map((entry) => entry.implication)).slice(0, bulletCount(depth)),
  };
}

function buildCompareView(pageModel: PageInsightModel, role: GuidedRole, depth: GuidedDepth): GuidedReadView {
  const source = pageModel.decisionPaths.filter((entry) => entry.template === "comparison");
  const paths = pickPaths(source.length ? source : pageModel.decisionPaths, depth);
  const steps = paths.map((path, index) =>
    toStep({
      index,
      mode: "compare",
      role,
      label: ["Looks similar", "Separating signal", "Decision rule", "Trap"][index] || `Step ${index + 1}`,
      primaryText: path.condition,
      secondaryText: path.trap || path.implication,
      path,
    }),
  );

  return {
    pagePurpose: `How to distinguish similar ideas: ${pageModel.pageSummary}`,
    steps,
    supportTitle: "Confusion risk",
    supportBullets: dedupe(pageModel.decisionPaths.map((entry) => entry.trap || entry.implication)).slice(0, bulletCount(depth)),
  };
}

function buildRelationView(pageModel: PageInsightModel, role: GuidedRole, depth: GuidedDepth): GuidedReadView {
  const steps = pickPaths(pageModel.decisionPaths, depth).map((path, index) =>
    toStep({
      index,
      mode: "relation",
      role,
      label: ["Before this", "On this page", "What follows", "System effect"][index] || `Step ${index + 1}`,
      primaryText: path.interpretation,
      secondaryText: path.nextMove,
      path,
    }),
  );

  return {
    pagePurpose: `Where this fits: ${pageModel.pageSummary}`,
    steps,
    supportTitle: "Before / here / after",
    supportBullets: dedupe(pageModel.decisionPaths.map((entry) => entry.nextMove || entry.implication)).slice(0, bulletCount(depth)),
  };
}

function toStep(args: {
  index: number;
  mode: GuidedMode;
  role: GuidedRole;
  label: string;
  primaryText: string;
  secondaryText?: string;
  path: DecisionPath;
}): GuidedReadStep {
  const evidenceText = args.path.evidence[0] || args.primaryText;
  return {
    id: `${args.mode}-${args.index + 1}`,
    stepNumber: args.index + 1,
    label: args.label,
    primaryText: args.primaryText,
    secondaryText: args.secondaryText,
    mode: args.mode,
    role: args.role,
    confidence: args.path.confidence,
    evidence: [{ id: `${args.path.id}-ev`, paragraphIndex: args.index, text: evidenceText }],
  };
}

function pickPaths(paths: DecisionPath[], depth: GuidedDepth): DecisionPath[] {
  return paths.slice(0, depth === "quick" ? 2 : depth === "standard" ? 3 : 4);
}

function bulletCount(depth: GuidedDepth): number {
  return depth === "quick" ? 2 : depth === "standard" ? 3 : 4;
}

function dedupe(items: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const clean = (item || "").trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}
