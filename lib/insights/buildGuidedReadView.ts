import { transformByMode } from "@/lib/insights/transformByMode";
import type { GuidedDepth, GuidedMode, GuidedReadView, GuidedRole, PageInsightModel } from "@/lib/insights/types";
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
      return {
        ...step,
        label: template?.label || step.label,
        primaryText: template?.primary || step.primaryText || matchingStoryStep?.content || story.mainIdea,
        secondaryText: template?.secondary || step.secondaryText || matchingStoryStep?.support[0],
      };
    }),
    supportTitle: `Grounded support (${modeName})`,
    supportBullets: [story.mainIdea, ...story.support, ...story.weakSupport].slice(0, args.depth === "quick" ? 2 : args.depth === "standard" ? 4 : 6),
  };
}

function modeTemplates(mode: GuidedMode, story: PageStory, transformed: GuidedReadView) {
  const base = transformed.steps;
  if (mode === "explain") {
    return {
      purpose: story.mechanismBlock?.text || story.supportingLogic[0] || story.shadowRecall.reveal.mechanism || story.mainIdea,
      steps: [
        { label: "Mechanism", primary: story.mechanismBlock?.text || story.supportingLogic[0] || story.shadowRecall.reveal.mechanism || base[0]?.primaryText, secondary: story.mechanismBlock?.support[0] || story.support[0] },
        { label: "Effect", primary: story.supportingLogic[1] || story.steps[1]?.content || base[1]?.primaryText, secondary: story.support[1] },
        { label: "Consequence", primary: story.supportingLogic[2] || story.steps[2]?.content || base[2]?.primaryText, secondary: story.support[2] },
        { label: "Boundary", primary: story.trapBlock?.text || story.trapSignals[0] || story.trap?.sentence || base[3]?.primaryText, secondary: story.trapBlock?.support[0] || story.weakSupport[0] },
      ],
    };
  }
  if (mode === "compare") {
    return {
      purpose: story.distinctionBlock?.text || story.comparisonSignals[0] || story.shadowRecall.reveal.distinction || story.mainIdea,
      steps: [
        { label: "Look-Alike", primary: story.distinctionBlock?.text || story.comparisonSignals[0] || story.steps[0]?.content || base[0]?.primaryText, secondary: story.distinctionBlock?.support[0] || story.support[0] },
        { label: "Separator", primary: story.comparisonSignals[1] || story.shadowRecall.reveal.distinction || base[1]?.primaryText, secondary: story.distinctionBlock?.support[1] || story.support[1] },
        { label: "Decision Rule", primary: story.comparisonSignals[2] || story.applySignals[0] || base[2]?.primaryText, secondary: story.support[2] },
        { label: "Trap", primary: story.trapBlock?.text || story.trapSignals[0] || story.trap?.sentence || base[3]?.primaryText, secondary: story.trapBlock?.support[0] || story.weakSupport[0] },
      ],
    };
  }
  if (mode === "relation") {
    return {
      purpose: story.relationBlock?.text || story.relationSignals[0] || story.steps[0]?.content || story.mainIdea,
      steps: [
        { label: "Before", primary: story.relationBlock?.text || story.relationSignals[0] || story.steps[0]?.content || base[0]?.primaryText, secondary: story.relationBlock?.support[0] || story.support[0] },
        { label: "Current Node", primary: story.relationSignals[1] || story.steps[1]?.content || base[1]?.primaryText, secondary: story.relationBlock?.support[1] || story.support[1] },
        { label: "Downstream", primary: story.relationSignals[2] || story.steps[2]?.content || base[2]?.primaryText, secondary: story.support[2] },
        { label: "System Effect", primary: story.relationSignals[3] || story.shadowRecall.reveal.application || base[3]?.primaryText, secondary: story.weakSupport[0] },
      ],
    };
  }
  if (mode === "apply" || mode === "apply_test") {
    return {
      purpose: story.decisionBlock?.action || story.applicationBlock?.text || story.applySignals[0] || story.shadowRecall.reveal.application || story.mainIdea,
      steps: [
        { label: "Case", primary: story.patternBlock?.trigger || story.applicationBlock?.text || story.applySignals[0] || story.steps[0]?.content || base[0]?.primaryText, secondary: story.patternBlock?.context || story.applicationBlock?.support[0] || story.support[0] },
        { label: "Key Clue", primary: story.decisionBlock?.threshold || story.applySignals[1] || story.mainIdeaBlock?.text || story.mainIdea || base[1]?.primaryText, secondary: story.applicationBlock?.support[1] || story.support[1] },
        { label: "Next Move", primary: story.decisionBlock?.action || story.applySignals[2] || story.shadowRecall.reveal.application || base[2]?.primaryText, secondary: story.decisionBlock?.nextSteps[0] || story.applicationBlock?.support[2] || story.support[2] },
        { label: "Wrong Move", primary: story.decisionBlock?.avoid[0] || story.trapBlock?.text || story.trapSignals[0] || story.trap?.sentence || base[3]?.primaryText, secondary: story.trapBlock?.support[0] || story.weakSupport[0] },
      ],
    };
  }
  return {
    purpose: story.patternBlock?.trigger || story.mainIdeaBlock?.text || story.mainIdea,
    steps: [
      { label: "Pattern", primary: story.patternBlock?.trigger || story.mainIdeaBlock?.text || story.mainIdea || base[0]?.primaryText, secondary: story.patternBlock?.context || story.mainIdeaBlock?.support[0] || story.support[0] },
      { label: "Decision", primary: story.decisionBlock?.action || story.shadowRecall.reveal.application || base[1]?.primaryText, secondary: story.decisionBlock?.nextSteps[0] || story.support[1] },
      { label: "Mechanism", primary: story.mechanismBlock?.text || story.steps[1]?.content || base[2]?.primaryText, secondary: story.mechanismBlock?.support[0] || story.support[2] },
      { label: "Trap", primary: story.decisionBlock?.avoid[0] || story.trapBlock?.text || story.trap?.sentence || base[3]?.primaryText, secondary: story.trapBlock?.support[0] || story.weakSupport[0] },
    ],
  };
}
