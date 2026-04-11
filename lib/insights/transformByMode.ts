import { toOperatorSentence, toGeneralSentence } from "@/lib/insights/sentenceCleanup";
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
    return buildOperatorCardView(story, role, depth);
  }
  return buildOperatorView(pageModel, role, depth);
}

function buildOperatorCardView(story: PageStory, role: GuidedRole, depth: GuidedDepth): GuidedReadView {
  const cards = operatorCards(story);
  const steps = cards
    .slice(0, stepCount(depth))
    .map((card, index) => cardToStep(card, index, role));

  return {
    pagePurpose: roleSentence(role, story.patternBlock?.trigger || story.mainIdea || story.shortNarrative || "Focus on the page pattern."),
    steps,
    cards,
    supportTitle: "Grounded support",
    supportBullets: dedupe([story.mainIdea, ...story.support, ...story.weakSupport]).slice(0, bulletCount(depth)),
  };
}

// Operator View when no story is available — fall back to decision path data.
function buildOperatorView(pageModel: PageInsightModel, role: GuidedRole, depth: GuidedDepth): GuidedReadView {
  const top = ensurePaths(pageModel.decisionPaths, depth);
  // Operator step labels: Signal → Rule → Mechanism → Action
  const labels = ["Signal", "Rule", "Mechanism", "Action"];
  return {
    pagePurpose: roleSentence(role, pageModel.pageSummary || "Identify the strongest signal on this page."),
    steps: top.map((path, index) =>
      toStep({
        index,
        mode: "insight",
        role,
        depth,
        label: labels[index] || `Step ${index + 1}`,
        primaryText: roleSentence(role, index === 0 ? path.condition : index === 1 ? path.interpretation : index === 2 ? path.implication : path.nextMove),
        secondaryText: depth === "deep" ? roleSentence(role, index === 0 ? path.interpretation : path.trap || path.implication) : undefined,
        path,
      }),
    ),
    supportTitle: "Grounded support",
    supportBullets: dedupe(pageModel.topTakeaways).slice(0, bulletCount(depth)),
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

// Always returns the operator card set: Signal, Rule, Mechanism, Trap.
function operatorCards(story: PageStory): OperatorCard[] {
  const pattern = toCard("pattern", "Signal", story.patternBlock?.trigger || story.mainIdeaBlock?.text || story.mainIdea, [
    story.patternBlock?.context,
    story.mainIdeaBlock?.support?.[0],
  ]);
  const decision = toCard("decision", "Rule", story.decisionBlock?.action || story.bottomLineBlock?.text || story.applicationBlock?.text, [
    ...(story.decisionBlock?.nextSteps || []),
    story.decisionBlock?.threshold ? `Use when: ${story.decisionBlock.threshold}` : undefined,
  ]);
  const mechanism = toCard("mechanism", "Mechanism", story.mechanismBlock?.text || story.supportingLogic[0], [
    ...(story.mechanismBlock?.support || []),
    ...(story.mechanismBlock?.evidence || []).slice(0, 2),
  ]);
  const trap = toCard(
    "trap",
    "Trap",
    story.trapBlock?.trap || story.trap?.sentence,
    [story.trapBlock?.whyWrong, story.trapBlock?.confusionWith, story.trapBlock?.consequence],
    story.trapBlock?.severity || "medium",
  );

  const keep = (items: Array<OperatorCard | null>) => items.filter(Boolean) as OperatorCard[];
  return keep([pattern, decision, mechanism, trap]);
}

function cardToStep(card: OperatorCard, index: number, role: GuidedRole): GuidedReadStep {
  return {
    id: `insight-${index + 1}`,
    stepNumber: index + 1,
    label: card.title,
    primaryText: roleSentence(role, card.primary),
    secondaryText: card.bullets.length ? roleSentence(role, card.bullets[0]) : undefined,
    mode: "insight",
    role,
    confidence: 0.75,
    evidence: card.bullets.slice(0, 2).map((text, evidenceIndex) => ({
      id: `${card.id}-ev-${evidenceIndex}`,
      paragraphIndex: index,
      text: roleSentence(role, text),
    })),
  };
}

function roleSentence(role: GuidedRole, text: string): string {
  if (role === "operator" || role === "expert") return toOperatorSentence(text);
  return toGeneralSentence(text);
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
  // Operator View always shows up to 5 steps; depth controls the cap.
  return depth === "quick" ? 3 : depth === "standard" ? 4 : 5;
}

function bulletCount(depth: GuidedDepth): number {
  return depth === "quick" ? 2 : depth === "standard" ? 4 : 6;
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
