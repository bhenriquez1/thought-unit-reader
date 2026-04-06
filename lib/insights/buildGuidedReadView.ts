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
  const templates = modeTemplates(args.mode, story, transformed, args.pageClass);
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

function modeTemplates(mode: GuidedMode, story: PageStory, transformed: GuidedReadView, pageClass?: string) {
  const base = transformed.steps;
  if (pageClass === "table_heavy" || pageClass === "mixed_visual" || pageClass === "form_page") {
    return {
      purpose: story.mainIdea,
      steps: [
        { label: "Core Signal", primary: story.mainIdea || base[0]?.primaryText, secondary: story.support[0] },
        { label: "Decode", primary: story.steps[1]?.content || base[1]?.primaryText, secondary: story.support[1] },
        { label: "Interpret", primary: story.shadowRecall.reveal.application || base[2]?.primaryText, secondary: story.support[2] },
        { label: "Common Miss", primary: story.trap?.sentence || base[3]?.primaryText, secondary: story.weakSupport[0] },
      ],
    };
  }
  if (mode === "explain") {
    return {
      purpose: story.shadowRecall.reveal.mechanism || story.mainIdea,
      steps: [
        { label: "Mechanism", primary: story.shadowRecall.reveal.mechanism || base[0]?.primaryText, secondary: story.support[0] },
        { label: "Effect", primary: story.steps[1]?.content || base[1]?.primaryText, secondary: story.support[1] },
        { label: "Consequence", primary: story.steps[2]?.content || base[2]?.primaryText, secondary: story.support[2] },
        { label: "Boundary", primary: story.trap?.sentence || base[3]?.primaryText, secondary: story.weakSupport[0] },
      ],
    };
  }
  if (mode === "compare") {
    return {
      purpose: story.shadowRecall.reveal.distinction || story.mainIdea,
      steps: [
        { label: "Look-Alike", primary: story.steps[0]?.content || base[0]?.primaryText, secondary: story.support[0] },
        { label: "Separator", primary: story.shadowRecall.reveal.distinction || base[1]?.primaryText, secondary: story.support[1] },
        { label: "Decision Rule", primary: story.shadowRecall.reveal.application || base[2]?.primaryText, secondary: story.support[2] },
        { label: "Trap", primary: story.trap?.sentence || base[3]?.primaryText, secondary: story.weakSupport[0] },
      ],
    };
  }
  if (mode === "relation") {
    return {
      purpose: story.steps[0]?.content || story.mainIdea,
      steps: [
        { label: "Before", primary: story.steps[0]?.content || base[0]?.primaryText, secondary: story.support[0] },
        { label: "Current Node", primary: story.steps[1]?.content || base[1]?.primaryText, secondary: story.support[1] },
        { label: "Downstream", primary: story.steps[2]?.content || base[2]?.primaryText, secondary: story.support[2] },
        { label: "System Effect", primary: story.shadowRecall.reveal.application || base[3]?.primaryText, secondary: story.weakSupport[0] },
      ],
    };
  }
  if (mode === "apply" || mode === "apply_test") {
    return {
      purpose: story.shadowRecall.reveal.application || story.mainIdea,
      steps: [
        { label: "Case", primary: story.steps[0]?.content || base[0]?.primaryText, secondary: story.support[0] },
        { label: "Key Clue", primary: story.mainIdea || base[1]?.primaryText, secondary: story.support[1] },
        { label: "Next Move", primary: story.shadowRecall.reveal.application || base[2]?.primaryText, secondary: story.support[2] },
        { label: "Wrong Move", primary: story.trap?.sentence || base[3]?.primaryText, secondary: story.weakSupport[0] },
      ],
    };
  }
  return {
    purpose: story.mainIdea,
    steps: [
      { label: "Main Signal", primary: story.mainIdea || base[0]?.primaryText, secondary: story.support[0] },
      { label: "Interpretation", primary: story.steps[1]?.content || base[1]?.primaryText, secondary: story.support[1] },
      { label: "Rule", primary: story.shadowRecall.reveal.application || base[2]?.primaryText, secondary: story.support[2] },
      { label: "Pitfall", primary: story.trap?.sentence || base[3]?.primaryText, secondary: story.weakSupport[0] },
    ],
  };
}
