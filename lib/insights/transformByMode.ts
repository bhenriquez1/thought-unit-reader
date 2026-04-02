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
  const top = ensurePaths(pageModel.decisionPaths, depth);
  const steps = top.map((path, index) =>
    toStep({
      index,
      mode: "insight",
      role,
      label: roleLabels(role, "insight", index),
      primaryText: chooseByRole(role, path.condition, path.interpretation, path.implication),
      secondaryText: index === 0 ? path.interpretation : path.implication,
      path,
    }),
  );

  return {
    pagePurpose: `Notice-first read: ${pageModel.pageSummary || "Find the strongest signal before details."}`,
    steps,
    supportTitle: "Main points",
    supportBullets: dedupe(pageModel.topTakeaways).slice(0, bulletCount(depth)),
  };
}

function buildExplainView(pageModel: PageInsightModel, role: GuidedRole, depth: GuidedDepth): GuidedReadView {
  const top = ensurePaths(pageModel.decisionPaths, depth);
  const steps = top.map((path, index) =>
    toStep({
      index,
      mode: "explain",
      role,
      label: roleLabels(role, "explain", index),
      primaryText: index === 0 ? path.interpretation : index === 1 ? path.implication : path.nextMove,
      secondaryText: index === 0 ? `Because: ${path.condition}` : path.trap,
      path,
    }),
  );

  return {
    pagePurpose: `Mechanism read: ${pageModel.pageSummary || "Understand why this works."}`,
    steps,
    supportTitle: "Causal chain",
    supportBullets: dedupe(top.flatMap((entry) => [entry.condition, entry.implication])).slice(0, bulletCount(depth)),
  };
}

function buildCompareView(pageModel: PageInsightModel, role: GuidedRole, depth: GuidedDepth): GuidedReadView {
  const comparePaths = pageModel.decisionPaths.filter((entry) => entry.template === "comparison");
  const source = comparePaths.length ? comparePaths : pageModel.decisionPaths;
  const top = ensurePaths(source, depth);

  const steps = top.map((path, index) =>
    toStep({
      index,
      mode: "compare",
      role,
      label: roleLabels(role, "compare", index),
      primaryText: index === 0 ? path.condition : index === 1 ? path.implication : path.nextMove,
      secondaryText: path.trap || path.interpretation,
      path,
    }),
  );

  return {
    pagePurpose: `Discrimination read: ${pageModel.pageSummary || "Separate look-alike ideas."}`,
    steps,
    supportTitle: "Do-not-confuse",
    supportBullets: dedupe(top.flatMap((entry) => [entry.trap, entry.implication, entry.nextMove])).slice(0, bulletCount(depth)),
  };
}

function buildRelationView(pageModel: PageInsightModel, role: GuidedRole, depth: GuidedDepth): GuidedReadView {
  const top = ensurePaths(pageModel.decisionPaths, depth);
  const steps = top.map((path, index) =>
    toStep({
      index,
      mode: "relation",
      role,
      label: roleLabels(role, "relation", index),
      primaryText: index === 0 ? `Before: ${path.condition}` : index === 1 ? `Here: ${path.interpretation}` : `After: ${path.nextMove}`,
      secondaryText: path.implication,
      path,
    }),
  );

  return {
    pagePurpose: `Workflow context: ${pageModel.pageSummary || "Place this page in sequence."}`,
    steps,
    supportTitle: "Before / here / after",
    supportBullets: dedupe(top.flatMap((entry) => [entry.condition, entry.interpretation, entry.nextMove])).slice(0, bulletCount(depth)),
  };
}

function ensurePaths(paths: DecisionPath[], depth: GuidedDepth): DecisionPath[] {
  const needed = depth === "quick" ? 2 : depth === "standard" ? 3 : 4;
  if (paths.length >= needed) return paths.slice(0, needed);
  if (!paths.length) {
    return Array.from({ length: needed }, (_, index) => fallbackPath(index));
  }
  const expanded = [...paths];
  let i = 0;
  while (expanded.length < needed) {
    const from = paths[i % paths.length];
    expanded.push({ ...from, id: `${from.id}-clone-${expanded.length}` });
    i += 1;
  }
  return expanded.slice(0, needed);
}

function fallbackPath(index: number): DecisionPath {
  return {
    id: `fallback-${index}`,
    template: "operator",
    condition: "Key clue from this page.",
    interpretation: "Interpret the clue before acting.",
    implication: "This changes what should happen next.",
    nextMove: "Use the rule on a concrete example.",
    trap: "Do not confuse the clue with the conclusion.",
    evidence: ["No explicit evidence line was extracted; use page summary context."],
    confidence: 0.5,
    sourceParagraphIds: [],
  };
}

function roleLabels(role: GuidedRole, mode: GuidedMode, index: number): string {
  const labels: Record<GuidedMode, string[]> = {
    insight: role === "expert"
      ? ["Signal", "Inference", "Rule", "Pitfall"]
      : role === "operator"
        ? ["Signal", "Read", "Action impact", "Miss"]
        : ["Start here", "Notice this", "This means", "Do not miss"],
    explain: role === "expert"
      ? ["Mechanism", "Effect", "Consequence", "Boundary"]
      : role === "operator"
        ? ["Why it works", "What changes", "Operational effect", "Failure mode"]
        : ["Main reason", "How it works", "What follows", "Why it matters"],
    compare: role === "expert"
      ? ["Look-alike", "Separating signal", "Decision rule", "Trap"]
      : role === "operator"
        ? ["Looks similar", "Difference", "Operational rule", "Miss"]
        : ["Looks similar", "What separates it", "Why distinction matters", "Do not confuse"],
    relation: role === "expert"
      ? ["Upstream", "Current node", "Downstream", "System effect"]
      : role === "operator"
        ? ["Before", "Here", "Next", "Impact"]
        : ["Before this", "On this page", "What follows", "Why this matters"],
    apply: ["Scenario", "Clue", "Next move", "Wrong move"],
    apply_test: ["Scenario", "Clue", "Next move", "Wrong move"],
  };
  return labels[mode][index] || `Step ${index + 1}`;
}

function chooseByRole(role: GuidedRole, general: string, operator: string, expert: string): string {
  if (role === "expert") return expert;
  if (role === "operator") return operator;
  return general;
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
