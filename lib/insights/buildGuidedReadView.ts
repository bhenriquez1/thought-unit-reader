import { transformByMode } from "@/lib/insights/transformByMode";
import type { GuidedDepth, GuidedMode, GuidedReadView, GuidedRole, OperatorCard, OperatorCardKind, PageInsightModel } from "@/lib/insights/types";
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

  const modeName = args.mode === "apply" ? "apply/test" : args.mode;
  const templates = modeTemplates(args.mode, story, transformed);
  const maxSteps = args.depth === "quick" ? 2 : args.depth === "standard" ? 3 : 4;

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
    cards: buildOperatorCards(args.mode, story),
    supportTitle: `Grounded support (${modeName})`,
    supportBullets: [story.mainIdea, ...story.support, ...story.weakSupport].slice(0, args.depth === "quick" ? 2 : args.depth === "standard" ? 4 : 6),
  };
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

function buildOperatorCards(mode: GuidedMode, story: PageStory): OperatorCard[] {
  const pattern = toCard("pattern", "Pattern", story.patternBlock?.trigger || story.mainIdea, [story.patternBlock?.context]);
  const decision = toCard("decision", "Decision", story.decisionBlock?.action || story.applicationBlock?.text, [
    ...(story.decisionBlock?.nextSteps || []),
    story.decisionBlock?.avoid?.[0] ? `Avoid: ${story.decisionBlock.avoid[0]}` : undefined,
    story.decisionBlock?.threshold ? `Use when: ${story.decisionBlock.threshold}` : undefined,
  ]);
  const mechanism = toCard("mechanism", "Mechanism", story.mechanismBlock?.text || story.supportingLogic[0], [
    ...(story.mechanismBlock?.support || []),
    ...(story.mechanismBlock?.evidence || []).slice(0, 2),
  ]);
  const distinction = toCard("distinction", "Distinction", story.distinctionBlock?.text || story.comparisonSignals[0], story.distinctionBlock?.support || []);
  const relation = toCard("relation", "Relation", story.relationBlock?.text || story.relationSignals[0], story.relationBlock?.support || []);
  const application = toCard("application", "Application", story.applicationBlock?.text || story.applySignals[0], [
    ...(story.applicationBlock?.support || []),
    story.decisionBlock?.nextSteps?.[0],
  ]);
  const trap = toCard("trap", "Trap", story.trapBlock?.trap || story.trap?.sentence, [
    story.trapBlock?.whyWrong,
    story.trapBlock?.consequence ? `Consequence: ${story.trapBlock.consequence}` : undefined,
  ], story.trapBlock?.severity || "medium");

  const compact = (cards: Array<OperatorCard | null>) => cards.filter(Boolean) as OperatorCard[];
  if (mode === "explain") return compact([pattern, mechanism, relation, trap]);
  if (mode === "compare") return compact([pattern, distinction, trap]);
  if (mode === "relation") return compact([pattern, relation, mechanism, trap]);
  if (mode === "apply" || mode === "apply_test") return compact([pattern, decision, application, trap]);
  return compact([pattern, decision, mechanism, trap]);
}

function modeTemplates(mode: GuidedMode, story: PageStory, transformed: GuidedReadView) {
  const base = transformed.steps;
  const trapPrimary = story.trapBlock?.trap || story.trapSignals[0] || story.trap?.sentence;
  const trapSecondary = story.trapBlock?.whyWrong || story.weakSupport[0];
  const trapEvidence = (story.trapBlock ? [story.trapBlock.whyWrong, story.trapBlock.consequence, story.trapBlock.confusionWith].filter(Boolean) as string[] : story.trapSignals.slice(1));

  if (mode === "explain") {
    return {
      purpose: story.mechanismBlock?.text || story.supportingLogic[0] || story.shadowRecall.reveal.mechanism || story.mainIdea,
      steps: [
        { label: "Mechanism", primary: story.mechanismBlock?.text || story.supportingLogic[0] || story.shadowRecall.reveal.mechanism || base[0]?.primaryText, secondary: story.mechanismBlock?.support.slice(0, 2).join(" — ") || story.support[0], evidence: story.mechanismBlock?.evidence || [] },
        { label: "Effect", primary: story.supportingLogic[1] || story.steps[1]?.content || base[1]?.primaryText, secondary: story.support.slice(0, 2).join(" — ") || story.support[1], evidence: story.mechanismBlock?.support.slice(2) || [] },
        { label: "Consequence", primary: story.supportingLogic[2] || story.steps[2]?.content || base[2]?.primaryText, secondary: story.support[2], evidence: story.supportingLogic.slice(3) || [] },
        { label: "Boundary", primary: trapPrimary || base[3]?.primaryText, secondary: trapSecondary, evidence: trapEvidence },
      ],
    };
  }
  if (mode === "compare") {
    return {
      purpose: story.distinctionBlock?.text || story.comparisonSignals[0] || story.shadowRecall.reveal.distinction || story.mainIdea,
      steps: [
        { label: "Look-Alike", primary: story.distinctionBlock?.text || story.comparisonSignals[0] || story.steps[0]?.content || base[0]?.primaryText, secondary: story.distinctionBlock?.support.slice(0, 2).join(" — ") || story.support[0], evidence: story.distinctionBlock?.evidence || [] },
        { label: "Separator", primary: story.comparisonSignals[1] || story.shadowRecall.reveal.distinction || base[1]?.primaryText, secondary: story.distinctionBlock?.support[1] || story.support[1], evidence: story.comparisonSignals.slice(2) || [] },
        { label: "Decision Rule", primary: story.comparisonSignals[2] || story.applySignals[0] || base[2]?.primaryText, secondary: story.support[2], evidence: story.applySignals.slice(1) || [] },
        { label: "Trap", primary: trapPrimary || base[3]?.primaryText, secondary: trapSecondary, evidence: trapEvidence },
      ],
    };
  }
  if (mode === "relation") {
    return {
      purpose: story.relationBlock?.text || story.relationSignals[0] || story.steps[0]?.content || story.mainIdea,
      steps: [
        { label: "Before", primary: story.relationBlock?.text || story.relationSignals[0] || story.steps[0]?.content || base[0]?.primaryText, secondary: story.relationBlock?.support.slice(0, 2).join(" — ") || story.support[0], evidence: story.relationBlock?.evidence || [] },
        { label: "Current Node", primary: story.relationSignals[1] || story.steps[1]?.content || base[1]?.primaryText, secondary: story.relationBlock?.support[1] || story.support[1], evidence: story.relationSignals.slice(2) || [] },
        { label: "Downstream", primary: story.relationSignals[2] || story.steps[2]?.content || base[2]?.primaryText, secondary: story.support[2], evidence: story.relationSignals.slice(3) || [] },
        { label: "System Effect", primary: story.relationSignals[3] || story.shadowRecall.reveal.application || base[3]?.primaryText, secondary: story.weakSupport[0], evidence: story.relationBlock?.support.slice(2) || [] },
      ],
    };
  }
  if (mode === "apply" || mode === "apply_test") {
    return {
      purpose: story.decisionBlock?.action || story.applicationBlock?.text || story.applySignals[0] || story.shadowRecall.reveal.application || story.mainIdea,
      steps: [
        { label: "Case", primary: story.patternBlock?.trigger || story.applicationBlock?.text || story.applySignals[0] || story.steps[0]?.content || base[0]?.primaryText, secondary: story.patternBlock?.context || story.applicationBlock?.support.slice(0, 2).join(" — ") || story.support[0], evidence: story.applicationBlock?.evidence || [] },
        { label: "Key Clue", primary: story.decisionBlock?.threshold || story.applySignals[1] || story.mainIdeaBlock?.text || story.mainIdea || base[1]?.primaryText, secondary: story.applicationBlock?.support[1] || story.support[1], evidence: story.mainIdeaBlock?.evidence || [] },
        { label: "Next Move", primary: story.decisionBlock?.action || story.applySignals[2] || story.shadowRecall.reveal.application || base[2]?.primaryText, secondary: (story.decisionBlock?.nextSteps || []).slice(0, 2).join(" — ") || story.applicationBlock?.support[2] || story.support[2], evidence: story.applicationBlock?.support.slice(3) || [] },
        { label: "Wrong Move", primary: trapPrimary || base[3]?.primaryText, secondary: trapSecondary, evidence: trapEvidence },
      ],
    };
  }
  return {
    purpose: story.patternBlock?.trigger || story.mainIdeaBlock?.text || story.mainIdea,
    steps: [
      { label: "Pattern", primary: story.patternBlock?.trigger || story.mainIdeaBlock?.text || story.mainIdea || base[0]?.primaryText, secondary: story.patternBlock?.context || story.mainIdeaBlock?.support.slice(0, 2).join(" — ") || story.support[0], evidence: story.mainIdeaBlock?.evidence || [] },
      { label: "Decision", primary: story.decisionBlock?.action || story.shadowRecall.reveal.application || base[1]?.primaryText, secondary: story.decisionBlock?.nextSteps[0] || story.support[1], evidence: (story.decisionBlock?.nextSteps || []).slice(1) },
      { label: "Mechanism", primary: story.mechanismBlock?.text || story.steps[1]?.content || base[2]?.primaryText, secondary: story.mechanismBlock?.support.slice(0, 2).join(" — ") || story.support[2], evidence: story.mechanismBlock?.evidence || [] },
      { label: "Trap", primary: trapPrimary || base[3]?.primaryText, secondary: trapSecondary, evidence: trapEvidence },
    ],
  };
}
