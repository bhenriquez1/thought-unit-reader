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
      purpose: story.mechanisms[0] || story.shadowRecall.reveal.mechanism || story.mainIdea,
      steps: [
        { label: "Mechanism", primary: story.mechanisms[0] || base[0]?.primaryText, secondary: story.support[0] },
        { label: "Effect", primary: story.mechanisms[1] || base[1]?.primaryText, secondary: story.support[1] },
        { label: "Consequence", primary: story.mechanisms[2] || base[2]?.primaryText, secondary: story.support[2] },
        { label: "Boundary", primary: story.trapSignals[0] || base[3]?.primaryText, secondary: story.weakSupport[0] },
      ],
    };
  }
  if (mode === "compare") {
    return {
      purpose: story.distinctions[0] || story.shadowRecall.reveal.distinction || story.mainIdea,
      steps: [
        { label: "Look-Alike", primary: story.support[0] || base[0]?.primaryText, secondary: story.distinctions[0] },
        { label: "Separator", primary: story.distinctions[0] || base[1]?.primaryText, secondary: story.distinctions[1] },
        { label: "Decision Rule", primary: story.applications[0] || base[2]?.primaryText, secondary: story.support[1] },
        { label: "Trap", primary: story.trapSignals[0] || base[3]?.primaryText, secondary: story.weakSupport[0] },
      ],
    };
  }
  if (mode === "relation") {
    return {
      purpose: story.relations[0] || story.narrativeLead || story.mainIdea,
      steps: [
        { label: "Before", primary: story.relations[0] || base[0]?.primaryText, secondary: story.support[0] },
        { label: "Current Node", primary: story.relations[1] || story.mainIdea || base[1]?.primaryText, secondary: story.support[1] },
        { label: "Downstream", primary: story.relations[2] || story.applications[0] || base[2]?.primaryText, secondary: story.support[2] },
        { label: "System Effect", primary: story.relations[3] || story.weakSupport[0] || base[3]?.primaryText, secondary: story.weakSupport[1] },
      ],
    };
  }
  if (mode === "apply" || mode === "apply_test") {
    return {
      purpose: story.applications[0] || story.shadowRecall.reveal.application || story.mainIdea,
      steps: [
        { label: "Case", primary: story.applications[0] || base[0]?.primaryText, secondary: story.support[0] },
        { label: "Key Clue", primary: story.mainIdea || base[1]?.primaryText, secondary: story.distinctions[0] || story.support[1] },
        { label: "Next Move", primary: story.applications[1] || base[2]?.primaryText, secondary: story.support[2] },
        { label: "Wrong Move", primary: story.trapSignals[0] || base[3]?.primaryText, secondary: story.weakSupport[0] },
      ],
    };
  }
  return {
    purpose: story.mainIdea,
    steps: [
      { label: "Main Signal", primary: story.mainIdea || base[0]?.primaryText, secondary: story.support[0] },
      { label: "Interpretation", primary: story.narrativeLead || base[1]?.primaryText, secondary: story.support[1] },
      { label: "Rule", primary: story.applications[0] || base[2]?.primaryText, secondary: story.support[2] },
      { label: "Pitfall", primary: story.trapSignals[0] || base[3]?.primaryText, secondary: story.weakSupport[0] },
    ],
  };
}
