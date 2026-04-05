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
  const purposeByMode =
    args.mode === "explain"
      ? story.shadowRecall.reveal.mechanism || story.mainIdea
      : args.mode === "compare"
        ? story.shadowRecall.reveal.distinction || story.mainIdea
        : args.mode === "relation"
          ? story.steps[1]?.content || story.mainIdea
          : args.mode === "apply" || args.mode === "apply_test"
            ? story.shadowRecall.reveal.application || story.mainIdea
            : story.mainIdea;

  return {
    pagePurpose: purposeByMode || transformed.pagePurpose,
    steps: transformed.steps.map((step, index) => {
      const matchingStoryStep = story.steps[index];
      return {
        ...step,
        primaryText: step.primaryText || matchingStoryStep?.content || story.mainIdea,
        secondaryText: step.secondaryText || matchingStoryStep?.support[0],
      };
    }),
    supportTitle: `Grounded support (${modeName})`,
    supportBullets: [story.mainIdea, ...story.support, ...story.weakSupport].slice(0, args.depth === "quick" ? 2 : args.depth === "standard" ? 4 : 6),
  };
}
