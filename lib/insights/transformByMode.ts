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
  PageInsightModel,
  StoryBlock,
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
  switch (mode) {
    case "insight":
      return buildInsightView(pageModel, role, depth, story);
    case "explain":
      return buildExplainView(pageModel, role, depth, story);
    case "compare":
      return buildCompareView(pageModel, role, depth, story);
    case "relation":
      return buildRelationView(pageModel, role, depth, story);
    case "apply":
    case "apply_test":
      return buildApplyView(pageModel, role, depth, story);
    default:
      return buildInsightView(pageModel, role, depth, story);
  }
}

// ---------------------------------------------------------------------------
// Block-first step builder — produces structurally richer steps than toStep()
// ---------------------------------------------------------------------------

function toStepFromBlock(args: {
  index: number;
  mode: GuidedMode;
  role: GuidedRole;
  depth: GuidedDepth;
  label: string;
  block: StoryBlock;
}): GuidedReadStep {
  const evidenceLimit = args.depth === "quick" ? 1 : args.depth === "standard" ? 2 : 3;
  const primary = roleSentence(args.role, args.block.text);
  const secondary = args.block.support[0] ? roleSentence(args.role, args.block.support[0]) : undefined;
  // support[1..] + block.evidence feed the evidence list (deeper than primaryText/secondaryText)
  const evidenceCandidates = [
    ...args.block.support.slice(1),
    ...args.block.evidence,
  ].filter((t) => isRenderableSentence(t));
  const evidence = (evidenceCandidates.length ? evidenceCandidates : [args.block.text])
    .slice(0, evidenceLimit)
    .map((text, i) => ({
      id: `${args.mode}-${args.index + 1}-blk-${i}`,
      paragraphIndex: args.index,
      text: roleSentence(args.role, text),
    }));

  return {
    id: `${args.mode}-${args.index + 1}`,
    stepNumber: args.index + 1,
    label: args.label,
    primaryText: isRenderableSentence(primary) ? primary : "No grounded sentence was extracted for this step.",
    secondaryText: secondary && isRenderableSentence(secondary) ? secondary : undefined,
    mode: args.mode,
    role: args.role,
    confidence: args.block.score,
    evidence,
  };
}

function hasText(block: StoryBlock | null | undefined): block is StoryBlock {
  return Boolean(block?.text && isRenderableSentence(block.text));
}

// ---------------------------------------------------------------------------
// Mode builders
// ---------------------------------------------------------------------------

function buildInsightView(pageModel: PageInsightModel, role: GuidedRole, depth: GuidedDepth, story: PageStory | null): GuidedReadView {
  const maxSteps = stepCount(depth);

  if (story) {
    const blockSequence: Array<{ block: StoryBlock | null; label: string }> = [
      { block: story.mainIdeaBlock, label: roleLabels(role, "insight", 0) },
      { block: story.mechanismBlock, label: roleLabels(role, "insight", 1) },
      { block: story.applicationBlock, label: roleLabels(role, "insight", 2) },
      { block: story.trapBlock, label: roleLabels(role, "insight", 3) },
    ];
    const usable = blockSequence.filter((b) => hasText(b.block));
    if (usable.length >= 2) {
      const steps = usable.slice(0, maxSteps).map(({ block, label }, index) =>
        toStepFromBlock({ index, mode: "insight", role, depth, label, block: block! }),
      );
      return {
        pagePurpose: roleSentence(role, story.mainIdeaBlock?.text || story.mainIdea || pageModel.pageSummary || "Find the strongest signal before details"),
        steps,
        supportTitle: "Main points",
        supportBullets: dedupe([story.mainIdea, ...story.support, ...story.weakSupport]).slice(0, bulletCount(depth)),
      };
    }
  }

  const top = ensurePaths(pageModel.decisionPaths, depth);
  return {
    pagePurpose: roleSentence(role, `Notice-first read: ${pageModel.pageSummary || "Find the strongest signal before details"}`),
    steps: top.map((path, index) =>
      toStep({ index, mode: "insight", role, depth, label: roleLabels(role, "insight", index), primaryText: roleSentence(role, chooseByRole(role, path.condition, path.interpretation, path.implication)), secondaryText: depth === "deep" ? roleSentence(role, index === 0 ? path.interpretation : path.implication) : undefined, path }),
    ),
    supportTitle: "Main points",
    supportBullets: dedupe(pageModel.topTakeaways).slice(0, bulletCount(depth)),
  };
}

function buildExplainView(pageModel: PageInsightModel, role: GuidedRole, depth: GuidedDepth, story: PageStory | null): GuidedReadView {
  const maxSteps = stepCount(depth);

  if (story) {
    const blockSequence: Array<{ block: StoryBlock | null; label: string }> = [
      { block: story.mechanismBlock, label: roleLabels(role, "explain", 0) },
      { block: story.mainIdeaBlock, label: roleLabels(role, "explain", 1) },
      { block: story.relationBlock, label: roleLabels(role, "explain", 2) },
      { block: story.trapBlock, label: roleLabels(role, "explain", 3) },
    ];
    const usable = blockSequence.filter((b) => hasText(b.block));
    if (usable.length >= 2) {
      const steps = usable.slice(0, maxSteps).map(({ block, label }, index) =>
        toStepFromBlock({ index, mode: "explain", role, depth, label, block: block! }),
      );
      return {
        pagePurpose: roleSentence(role, `Mechanism read: ${story.mechanismBlock?.text || story.supportingLogic[0] || pageModel.pageSummary || "Understand why this works"}`),
        steps,
        supportTitle: "Causal chain",
        supportBullets: dedupe([
          story.mechanismBlock?.text,
          ...story.mechanismBlock?.support || [],
          ...story.supportingLogic,
        ]).slice(0, bulletCount(depth)),
      };
    }
  }

  const top = ensurePaths(pageModel.decisionPaths, depth);
  return {
    pagePurpose: roleSentence(role, `Mechanism read: ${pageModel.pageSummary || "Understand why this works"}`),
    steps: top.map((path, index) =>
      toStep({ index, mode: "explain", role, depth, label: roleLabels(role, "explain", index), primaryText: roleSentence(role, index === 0 ? path.interpretation : index === 1 ? path.implication : path.nextMove), secondaryText: roleSentence(role, index === 0 ? `Because ${path.condition}` : path.trap || path.condition), path }),
    ),
    supportTitle: "Causal chain",
    supportBullets: dedupe(top.flatMap((entry) => [entry.condition, entry.implication])).slice(0, bulletCount(depth)),
  };
}

function buildCompareView(pageModel: PageInsightModel, role: GuidedRole, depth: GuidedDepth, story: PageStory | null): GuidedReadView {
  const maxSteps = stepCount(depth);

  if (story) {
    const blockSequence: Array<{ block: StoryBlock | null; label: string }> = [
      { block: story.distinctionBlock, label: roleLabels(role, "compare", 0) },
      { block: story.mechanismBlock, label: roleLabels(role, "compare", 1) },
      { block: story.applicationBlock, label: roleLabels(role, "compare", 2) },
      { block: story.trapBlock, label: roleLabels(role, "compare", 3) },
    ];
    const usable = blockSequence.filter((b) => hasText(b.block));
    if (usable.length >= 2) {
      const steps = usable.slice(0, maxSteps).map(({ block, label }, index) =>
        toStepFromBlock({ index, mode: "compare", role, depth, label, block: block! }),
      );
      return {
        pagePurpose: roleSentence(role, `Discrimination read: ${story.distinctionBlock?.text || story.comparisonSignals[0] || pageModel.pageSummary || "Separate look-alike ideas"}`),
        steps,
        supportTitle: "Do-not-confuse",
        supportBullets: dedupe([
          story.distinctionBlock?.text,
          ...story.distinctionBlock?.support || [],
          ...story.comparisonSignals,
          story.trapBlock?.text,
        ]).slice(0, bulletCount(depth)),
      };
    }
  }

  const comparePaths = pageModel.decisionPaths.filter((entry) => entry.template === "comparison");
  const top = ensurePaths(comparePaths.length ? comparePaths : pageModel.decisionPaths, depth);
  return {
    pagePurpose: roleSentence(role, `Discrimination read: ${pageModel.pageSummary || "Separate look-alike ideas"}`),
    steps: top.map((path, index) =>
      toStep({ index, mode: "compare", role, depth, label: roleLabels(role, "compare", index), primaryText: roleSentence(role, index === 0 ? path.condition : index === 1 ? path.implication : path.nextMove), secondaryText: roleSentence(role, path.trap || path.interpretation), path }),
    ),
    supportTitle: "Do-not-confuse",
    supportBullets: dedupe(top.flatMap((entry) => [entry.trap, entry.implication, entry.nextMove])).slice(0, bulletCount(depth)),
  };
}

function buildRelationView(pageModel: PageInsightModel, role: GuidedRole, depth: GuidedDepth, story: PageStory | null): GuidedReadView {
  const maxSteps = stepCount(depth);

  if (story) {
    const blockSequence: Array<{ block: StoryBlock | null; label: string }> = [
      { block: story.relationBlock, label: roleLabels(role, "relation", 0) },
      { block: story.mainIdeaBlock, label: roleLabels(role, "relation", 1) },
      { block: story.applicationBlock, label: roleLabels(role, "relation", 2) },
      { block: story.distinctionBlock || story.mechanismBlock, label: roleLabels(role, "relation", 3) },
    ];
    const usable = blockSequence.filter((b) => hasText(b.block));
    if (usable.length >= 2) {
      const steps = usable.slice(0, maxSteps).map(({ block, label }, index) =>
        toStepFromBlock({ index, mode: "relation", role, depth, label, block: block! }),
      );
      return {
        pagePurpose: roleSentence(role, `Workflow context: ${story.relationBlock?.text || story.relationSignals[0] || pageModel.pageSummary || "Place this page in sequence"}`),
        steps,
        supportTitle: "Before / here / after",
        supportBullets: dedupe([
          story.relationBlock?.text,
          ...story.relationBlock?.support || [],
          ...story.relationSignals,
        ]).slice(0, bulletCount(depth)),
      };
    }
  }

  const top = ensurePaths(pageModel.decisionPaths, depth);
  return {
    pagePurpose: roleSentence(role, `Workflow context: ${pageModel.pageSummary || "Place this page in sequence"}`),
    steps: top.map((path, index) =>
      toStep({ index, mode: "relation", role, depth, label: roleLabels(role, "relation", index), primaryText: roleSentence(role, index === 0 ? `Before this, ${path.condition}` : index === 1 ? `On this page, ${path.interpretation}` : `After this, ${path.nextMove}`), secondaryText: depth === "quick" ? undefined : roleSentence(role, path.implication), path }),
    ),
    supportTitle: "Before / here / after",
    supportBullets: dedupe(top.flatMap((entry) => [entry.condition, entry.interpretation, entry.nextMove])).slice(0, bulletCount(depth)),
  };
}

function buildApplyView(pageModel: PageInsightModel, role: GuidedRole, depth: GuidedDepth, story: PageStory | null): GuidedReadView {
  const maxSteps = stepCount(depth);

  if (story) {
    const blockSequence: Array<{ block: StoryBlock | null; label: string }> = [
      { block: story.applicationBlock, label: roleLabels(role, "apply", 0) },
      { block: story.mainIdeaBlock, label: roleLabels(role, "apply", 1) },
      { block: story.mechanismBlock, label: roleLabels(role, "apply", 2) },
      { block: story.trapBlock, label: roleLabels(role, "apply", 3) },
    ];
    const usable = blockSequence.filter((b) => hasText(b.block));
    if (usable.length >= 2) {
      const steps = usable.slice(0, maxSteps).map(({ block, label }, index) =>
        toStepFromBlock({ index, mode: "apply", role, depth, label, block: block! }),
      );
      return {
        pagePurpose: roleSentence(role, `Apply read: ${story.applicationBlock?.text || story.applySignals[0] || pageModel.pageSummary || "Apply the rule to a concrete case"}`),
        steps,
        supportTitle: "Apply signals",
        supportBullets: dedupe([
          story.applicationBlock?.text,
          ...story.applicationBlock?.support || [],
          ...story.applySignals,
        ]).slice(0, bulletCount(depth)),
      };
    }
  }

  return buildScenario({ pageModel, role, depth });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function roleLabels(role: GuidedRole, mode: GuidedMode, index: number): string {
  const labels: Record<GuidedMode, string[]> = {
    insight: role === "expert" ? ["Indicator", "Inference", "Rule", "Pitfall"] : role === "operator" ? ["Signal", "Read", "Action", "Miss"] : ["Start here", "Notice", "This means", "Do not miss"],
    explain: role === "expert" ? ["Mechanism", "Effect", "Consequence", "Boundary"] : role === "operator" ? ["Why", "Change", "Result", "Failure mode"] : ["Main reason", "How", "What follows", "Why it matters"],
    compare: role === "expert" ? ["Look-alike", "Separator", "Decision rule", "Trap"] : role === "operator" ? ["Looks similar", "Difference", "Rule", "Miss"] : ["Looks similar", "What separates it", "Why it matters", "Do not confuse"],
    relation: role === "expert" ? ["Upstream", "Current", "Downstream", "System effect"] : role === "operator" ? ["Before", "Here", "Next", "Impact"] : ["Before this", "On this page", "What follows", "Why this matters"],
    apply: ["Case", "Key Clue", "Next Move", "Wrong Move"],
    apply_test: ["Case", "Key Clue", "Next Move", "Wrong Move"],
  };
  return labels[mode]?.[index] || `Step ${index + 1}`;
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
