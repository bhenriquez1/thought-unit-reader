import { transformByMode } from "@/lib/insights/transformByMode";
import type { DecisionDrill, GuidedDepth, GuidedMode, GuidedReadView, GuidedRole, OperatorCard, OperatorCardKind, PageInsightModel } from "@/lib/insights/types";
import type { PageStory } from "@/lib/insights/buildPageStory";

export type { GuidedMode, GuidedRole, GuidedDepth };

export function buildGuidedReadView(args: {
  pageModel: PageInsightModel;
  mode: GuidedMode;
  role: GuidedRole;
  depth: GuidedDepth;
  pageClass?: string;
  pageStory?: PageStory | null;
}): GuidedReadView {
  const transformed = transformByMode(args);
  const story = args.pageStory || args.pageModel.pageStory || null;

  if (!story) {
    return transformed;
  }

  // Operator View always shows something.
  const templates = operatorTemplates(story, transformed);
  // Always show all 5 operator steps.
  const maxSteps = 5;

  return {
    pagePurpose: templates.purpose || transformed.pagePurpose,
    steps: transformed.steps.slice(0, maxSteps).map((step, index) => {
      const matchingStoryStep = story.steps[index];
      const template = templates.steps[index];
      const blockEvidence = template?.evidence ?? [];
      const stepEvidence =
        step.evidence.length && !step.id.endsWith("-blk-0")
          ? step.evidence
          : blockEvidence.map((text: string, i: number) => ({
              id: `${step.id}-blk-${i}`,
              paragraphIndex: index,
              text,
            }));
      return {
        ...step,
        label: template?.label || step.label,
        primaryText: template?.primary || step.primaryText || matchingStoryStep?.content || story.mainIdea,
        secondaryText:
          template?.secondary ||
          step.secondaryText ||
          (matchingStoryStep?.support.filter(Boolean).slice(0, 2).join(" — ") || undefined),
        evidence: stepEvidence.length ? stepEvidence : step.evidence,
      };
    }),
    cards: buildOperatorCards(story),
    // Drill is always built when decision/application data exists — merged from
    // the former Apply/Test mode. Rendered inline in Operator View when available.
    drill: (story.decisionBlock || story.applicationBlock) ? buildDecisionDrill(story) : undefined,
    supportTitle: "Grounded support",
    supportBullets: [story.mainIdea, ...story.support, ...story.weakSupport].slice(0, args.depth === "quick" ? 3 : args.depth === "standard" ? 5 : 7),
  };
}

function buildDecisionDrill(story: PageStory): DecisionDrill {
  const caseCue =
    story.patternBlock?.trigger ||
    story.applicationBlock?.text ||
    story.applySignals[0] ||
    story.mainIdea;

  const bestNextMove =
    story.decisionBlock?.action ||
    story.applySignals[1] ||
    story.applicationBlock?.text ||
    story.mainIdea;

  const why =
    story.mechanismBlock?.text ||
    story.decisionBlock?.threshold ||
    story.supportingLogic[0] ||
    story.support[0] ||
    "";

  const wrongMove =
    story.trapBlock?.trap ||
    story.trap?.sentence ||
    story.trapSignals[0];

  const wrongMoveReason =
    story.trapBlock?.whyWrong ||
    story.trapBlock?.consequence ||
    story.weakSupport[0];

  const examTest = buildExamTest(caseCue, bestNextMove, wrongMove);

  return {
    caseCue,
    caseCueContext: story.patternBlock?.context || story.applicationBlock?.support[0],
    bestNextMove,
    bestNextMoveSteps: (story.decisionBlock?.nextSteps || story.applicationBlock?.support || []).slice(0, 3),
    why,
    wrongMove,
    wrongMoveReason,
    examTest,
    confidence: story.confidence,
  };
}

function buildExamTest(caseCue: string, nextMove: string, wrongMove?: string): string | undefined {
  if (!caseCue || !nextMove) return undefined;
  const cue = caseCue.replace(/\.$/, "").trim();
  const stem = `If ${cue.charAt(0).toLowerCase()}${cue.slice(1)}, what is the best next step?`;
  if (wrongMove) {
    const wrong = wrongMove.replace(/\.$/, "").trim();
    return `${stem} (Not: ${wrong.charAt(0).toLowerCase()}${wrong.slice(1)})`;
  }
  return stem;
}

function toCard(kind: OperatorCardKind, title: string, primary?: string | null, bullets: Array<string | null | undefined> = [], severity?: "low" | "medium" | "high"): OperatorCard | null {
  if (!primary) return null;
  return {
    id: kind,
    kind,
    title,
    primary,
    bullets: bullets.filter(Boolean) as string[],
    severity,
  };
}

function buildOperatorCards(story: PageStory): OperatorCard[] {
  const pattern = toCard("pattern", "Signal", story.patternBlock?.trigger || story.mainIdea, [story.patternBlock?.context]);
  const decision = toCard("decision", "Rule", story.decisionBlock?.action || story.bottomLineBlock?.text || story.applicationBlock?.text, [
    ...(story.decisionBlock?.nextSteps || []),
    story.decisionBlock?.avoid?.[0] ? `Avoid: ${story.decisionBlock.avoid[0]}` : undefined,
    story.decisionBlock?.threshold ? `Use when: ${story.decisionBlock.threshold}` : undefined,
  ]);
  const mechanism = toCard("mechanism", "Mechanism", story.mechanismBlock?.text || story.supportingLogic[0], [
    ...(story.mechanismBlock?.support || []),
    ...(story.mechanismBlock?.evidence || []).slice(0, 2),
  ]);
  const trap = toCard("trap", "Trap", story.trapBlock?.trap || story.trap?.sentence, [
    story.trapBlock?.whyWrong,
    story.trapBlock?.consequence ? `Consequence: ${story.trapBlock.consequence}` : undefined,
  ], story.trapBlock?.severity || "medium");

  const compact = (cards: Array<OperatorCard | null>) => cards.filter(Boolean) as OperatorCard[];
  return compact([pattern, decision, mechanism, trap]);
}

// Operator View template: Signal → Rule → Mechanism → Action → Trap
function operatorTemplates(story: PageStory, transformed: GuidedReadView) {
  const base = transformed.steps;
  const trapPrimary = story.trapBlock?.trap || story.trapSignals[0] || story.trap?.sentence;
  const trapSecondary = story.trapBlock?.whyWrong || story.weakSupport[0];
  const trapEvidence = (story.trapBlock
    ? [story.trapBlock.whyWrong, story.trapBlock.consequence, story.trapBlock.confusionWith].filter(Boolean) as string[]
    : story.trapSignals.slice(1));

  return {
    purpose: story.patternBlock?.trigger || story.mainIdeaBlock?.text || story.mainIdea,
    steps: [
      {
        label: "Signal",
        primary: story.patternBlock?.trigger || story.mainIdeaBlock?.text || story.mainIdea || base[0]?.primaryText,
        secondary: story.patternBlock?.context || story.mainIdeaBlock?.support.slice(0, 2).join(" — ") || story.support[0],
        evidence: story.mainIdeaBlock?.evidence || [],
      },
      {
        label: "Rule",
        // Prefer the irreversible bottom-line takeaway; fall back to decision threshold or action.
        primary: story.bottomLineBlock?.text || story.decisionBlock?.threshold || story.decisionBlock?.action || story.applySignals[0] || base[1]?.primaryText,
        secondary: story.bottomLineBlock?.support[0] || story.decisionBlock?.nextSteps[0] || story.support[1],
        evidence: story.bottomLineBlock?.evidence || (story.decisionBlock?.nextSteps || []).slice(1),
      },
      {
        label: "Mechanism",
        primary: story.mechanismBlock?.text || story.steps[1]?.content || base[2]?.primaryText,
        secondary: story.mechanismBlock?.support.slice(0, 2).join(" — ") || story.support[2],
        evidence: story.mechanismBlock?.evidence || [],
      },
      {
        label: "Action",
        // Distinct from Rule — the executable next move rather than the governing decision.
        primary: story.decisionBlock?.action || story.applicationBlock?.text || story.applySignals[0] || base[3]?.primaryText,
        secondary: (story.decisionBlock?.nextSteps || []).slice(0, 2).join(" — ") || story.applicationBlock?.support[0] || story.support[3],
        evidence: story.applicationBlock?.support?.slice(2) || [],
      },
      {
        label: "Trap",
        primary: trapPrimary || base[4]?.primaryText,
        secondary: trapSecondary,
        evidence: trapEvidence,
      },
    ],
  };
}
