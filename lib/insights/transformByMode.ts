import { buildScenario } from "@/lib/insights/buildScenario";
import { toExpertSentence, toGeneralSentence, toOperatorSentence } from "@/lib/insights/sentenceCleanup";
import { isRenderableSentence } from "@/lib/insights/isRenderableSentence";
import type {
  DecisionPath,
  GuidedDepth,
  GuidedMode,
  GuidedReadStep,
  GuidedReadView,
  GuidedRole,
  OperatorCard,
  OperatorCardKind,
  PageInsightModel,
} from "@/lib/insights/types";
import type { PageStory } from "@/lib/insights/buildPageStory";

type TransformArgs = {
  pageModel: PageInsightModel;
  mode: GuidedMode;
  role: GuidedRole;
  depth: GuidedDepth;
  pageStory?: PageStory | null;
};

export function transformByMode({ pageModel, mode, role, depth, pageStory }: TransformArgs): GuidedReadView {
  const story = pageStory || pageModel.pageStory || null;
  if (story) {
    return buildOperatorCardView(story, mode, role, depth);
  }
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

function buildOperatorCardView(story: PageStory, mode: GuidedMode, role: GuidedRole, depth: GuidedDepth): GuidedReadView {
  const cards = cardsByMode(story, mode);
  const steps = cards
    .slice(0, stepCount(depth))
    .map((card, index) => cardToStep(card, index, mode, role));

  return {
    pagePurpose: roleSentence(role, story.patternBlock?.trigger || story.mainIdea || story.shortNarrative || "Focus on the page pattern."),
    steps,
    cards,
    supportTitle: "Grounded support",
    supportBullets: dedupe([story.mainIdea, ...story.support, ...story.weakSupport]).slice(0, bulletCount(depth)),
  };
}

function buildInsightView(pageModel: PageInsightModel, role: GuidedRole, depth: GuidedDepth): GuidedReadView {
  const top = ensurePaths(pageModel.decisionPaths, depth);
  return {
    pagePurpose: roleSentence(role, `Notice-first read: ${pageModel.pageSummary || "Find the strongest signal before details"}`),
    steps: top.map((path, index) =>
      toStep({
        index,
        mode: "insight",
        role,
        depth,
        label: roleLabels(role, "insight", index),
        primaryText: roleSentence(role, chooseByRole(role, path.condition, path.interpretation, path.implication)),
        secondaryText: depth === "deep" ? roleSentence(role, index === 0 ? path.interpretation : path.implication) : undefined,
        path,
      }),
    ),
    supportTitle: "Main points",
    supportBullets: dedupe(pageModel.topTakeaways).slice(0, bulletCount(depth)),
  };
}

function buildExplainView(pageModel: PageInsightModel, role: GuidedRole, depth: GuidedDepth): GuidedReadView {
  const top = ensurePaths(pageModel.decisionPaths, depth);
  return {
    pagePurpose: roleSentence(role, `Mechanism read: ${pageModel.pageSummary || "Understand why this works"}`),
    steps: top.map((path, index) =>
      toStep({
        index,
        mode: "explain",
        role,
        depth,
        label: roleLabels(role, "explain", index),
        primaryText: roleSentence(role, index === 0 ? path.interpretation : index === 1 ? path.implication : path.nextMove),
        secondaryText: roleSentence(role, index === 0 ? `Because ${path.condition}` : path.trap || path.condition),
        path,
      }),
    ),
    supportTitle: "Causal chain",
    supportBullets: dedupe(top.flatMap((entry) => [entry.condition, entry.interpretation, entry.implication, entry.nextMove])).slice(0, bulletCount(depth)),
  };
}

function buildCompareView(pageModel: PageInsightModel, role: GuidedRole, depth: GuidedDepth): GuidedReadView {
  const comparePaths = pageModel.decisionPaths.filter((entry) => entry.template === "comparison");
  const top = ensurePaths(comparePaths.length ? comparePaths : pageModel.decisionPaths, depth);
  return {
    pagePurpose: roleSentence(role, `Discrimination read: ${pageModel.pageSummary || "Separate look-alike ideas"}`),
    steps: top.map((path, index) =>
      toStep({
        index,
        mode: "compare",
        role,
        depth,
        label: roleLabels(role, "compare", index),
        primaryText: roleSentence(role, index === 0 ? path.condition : index === 1 ? path.implication : path.nextMove),
        secondaryText: roleSentence(role, path.trap || path.interpretation),
        path,
      }),
    ),
    supportTitle: "Do-not-confuse",
    supportBullets: dedupe(top.flatMap((entry) => [entry.trap, entry.implication, entry.nextMove])).slice(0, bulletCount(depth)),
  };
}

function buildRelationView(pageModel: PageInsightModel, role: GuidedRole, depth: GuidedDepth): GuidedReadView {
  const top = ensurePaths(pageModel.decisionPaths, depth);
  return {
    pagePurpose: roleSentence(role, `Workflow context: ${pageModel.pageSummary || "Place this page in sequence"}`),
    steps: top.map((path, index) =>
      toStep({
        index,
        mode: "relation",
        role,
        depth,
        label: roleLabels(role, "relation", index),
        primaryText: roleSentence(role, index === 0 ? `Before this, ${path.condition}` : index === 1 ? `On this page, ${path.interpretation}` : `After this, ${path.nextMove}`),
        secondaryText: depth === "quick" ? undefined : roleSentence(role, path.implication),
        path,
      }),
    ),
    supportTitle: "Before / here / after",
    supportBullets: dedupe(top.flatMap((entry) => [entry.condition, entry.interpretation, entry.nextMove])).slice(0, bulletCount(depth)),
  };
}

function ensurePaths(paths: DecisionPath[], depth: GuidedDepth): DecisionPath[] {
  const needed = stepCount(depth);
  if (paths.length >= needed) return paths.slice(0, needed);
  if (!paths.length) return Array.from({ length: needed }, (_, index) => fallbackPath(index));
  const expanded = [...paths];
  while (expanded.length < needed) {
    const from = paths[expanded.length % paths.length];
    expanded.push({ ...from, id: `${from.id}-clone-${expanded.length}` });
  }
  return expanded.slice(0, needed);
}

function fallbackPath(index: number): DecisionPath {
  return {
    id: `fallback-${index}`,
    template: "operator",
    condition: "a key clue appears on this page",
    interpretation: "the clue should be interpreted before action",
    implication: "this changes what should happen next",
    nextMove: "apply the rule to a concrete example",
    trap: "do not confuse the clue with the conclusion",
    evidence: ["No explicit evidence line was extracted; use page summary context."],
    confidence: 0.5,
    sourceParagraphIds: [],
  };
}

function toCard(kind: OperatorCardKind, title: string, primary?: string | null, bullets: Array<string | null | undefined> = [], severity?: "low" | "medium" | "high"): OperatorCard | null {
  if (!primary || !isRenderableSentence(primary)) return null;
  return {
    id: `${kind}-${title.toLowerCase().replace(/\s+/g, "-")}`,
    kind,
    title,
    primary,
    bullets: dedupe(bullets.filter(Boolean) as string[]),
    severity,
  };
}

function cardsByMode(story: PageStory, mode: GuidedMode): OperatorCard[] {
  const pattern = toCard("pattern", "Pattern", story.patternBlock?.trigger || story.mainIdeaBlock?.text || story.mainIdea, [
    story.patternBlock?.context,
    story.mainIdeaBlock?.support?.[0],
  ]);
  const decision = toCard("decision", "Decision", story.decisionBlock?.action || story.applicationBlock?.text, [
    ...(story.decisionBlock?.nextSteps || []),
    story.decisionBlock?.threshold ? `Use when: ${story.decisionBlock.threshold}` : undefined,
  ]);
  const application = toCard("application", "Application", story.applicationBlock?.text || story.applySignals[0], [
    ...(story.applicationBlock?.support || []),
    story.decisionBlock?.nextSteps?.[0],
  ]);
  const mechanism = toCard("mechanism", "Mechanism", story.mechanismBlock?.text || story.supportingLogic[0], [
    ...(story.mechanismBlock?.support || []),
    ...(story.mechanismBlock?.evidence || []).slice(0, 2),
  ]);
  const distinction = toCard("distinction", "Distinction", story.distinctionBlock?.text || story.comparisonSignals[0], story.distinctionBlock?.support || []);
  const relation = toCard("relation", "Relation", story.relationBlock?.text || story.relationSignals[0], story.relationBlock?.support || []);
  const trap = toCard(
    "trap",
    "Trap",
    story.trapBlock?.trap || story.trap?.sentence,
    [story.trapBlock?.whyWrong, story.trapBlock?.confusionWith, story.trapBlock?.consequence],
    story.trapBlock?.severity || "medium",
  );

  const keep = (items: Array<OperatorCard | null>) => items.filter(Boolean) as OperatorCard[];
  if (mode === "explain") return keep([pattern, mechanism, relation, trap]);
  if (mode === "compare") return keep([pattern, distinction, trap]);
  if (mode === "relation") return keep([pattern, relation, mechanism, trap]);
  if (mode === "apply" || mode === "apply_test") return keep([pattern, decision, application, trap]);
  return keep([pattern, decision, mechanism, trap]);
}

function cardToStep(card: OperatorCard, index: number, mode: GuidedMode, role: GuidedRole): GuidedReadStep {
  return {
    id: `${mode}-${index + 1}`,
    stepNumber: index + 1,
    label: card.title,
    primaryText: roleSentence(role, card.primary),
    secondaryText: card.bullets.length ? roleSentence(role, card.bullets[0]) : undefined,
    mode,
    role,
    confidence: 0.75,
    evidence: card.bullets.slice(0, 2).map((text, evidenceIndex) => ({
      id: `${card.id}-ev-${evidenceIndex}`,
      paragraphIndex: index,
      text: roleSentence(role, text),
    })),
  };
}

function roleLabels(role: GuidedRole, mode: GuidedMode, index: number): string {
  const labels: Record<GuidedMode, string[]> = {
    insight: role === "expert" ? ["Indicator", "Inference", "Rule", "Pitfall"] : role === "operator" ? ["Signal", "Read", "Action", "Miss"] : ["Start here", "Notice", "This means", "Do not miss"],
    explain: role === "expert" ? ["Mechanism", "Effect", "Consequence", "Boundary"] : role === "operator" ? ["Why", "Change", "Result", "Failure mode"] : ["Main reason", "How", "What follows", "Why it matters"],
    compare: role === "expert" ? ["Look-alike", "Separator", "Decision rule", "Trap"] : role === "operator" ? ["Looks similar", "Difference", "Rule", "Miss"] : ["Looks similar", "What separates it", "Why it matters", "Do not confuse"],
    relation: role === "expert" ? ["Upstream", "Current", "Downstream", "System effect"] : role === "operator" ? ["Before", "Here", "Next", "Impact"] : ["Before this", "On this page", "What follows", "Why this matters"],
    apply: ["Scenario", "Clue", "Next move", "Wrong move"],
    apply_test: ["Scenario", "Clue", "Next move", "Wrong move"],
  };
  return labels[mode][index] || `Step ${index + 1}`;
}

function roleSentence(role: GuidedRole, text: string): string {
  if (role === "expert") return toExpertSentence(text);
  if (role === "operator") return toOperatorSentence(text);
  return toGeneralSentence(text);
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
  depth: GuidedDepth;
  label: string;
  primaryText: string;
  secondaryText?: string;
  path: DecisionPath;
}): GuidedReadStep {
  const evidenceLimit = args.depth === "quick" ? 1 : args.depth === "standard" ? 2 : 3;
  const evidence = (args.path.evidence.length ? args.path.evidence : [args.primaryText]).slice(0, evidenceLimit).map((text, evidenceIndex) => ({
    id: `${args.path.id}-ev-${evidenceIndex}`,
    paragraphIndex: args.index,
    text: roleSentence(args.role, text),
  }));

  return {
    id: `${args.mode}-${args.index + 1}`,
    stepNumber: args.index + 1,
    label: args.label,
    primaryText: isRenderableSentence(args.primaryText) ? args.primaryText : "No grounded sentence was extracted for this step.",
    secondaryText: args.secondaryText && isRenderableSentence(args.secondaryText) ? args.secondaryText : undefined,
    mode: args.mode,
    role: args.role,
    confidence: args.path.confidence,
    evidence,
  };
}

function stepCount(depth: GuidedDepth): number {
  return depth === "quick" ? 2 : depth === "standard" ? 3 : 4;
}

function bulletCount(depth: GuidedDepth): number {
  return depth === "quick" ? 1 : depth === "standard" ? 3 : 4;
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
    out.push(toGeneralSentence(clean));
  }
  return out;
}
