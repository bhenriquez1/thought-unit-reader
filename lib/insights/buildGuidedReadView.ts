import { transformByMode } from "@/lib/insights/transformByMode";
import { buildPageStory } from "@/lib/insights/buildPageStory";
import type { GuidedDepth, GuidedMode, GuidedReadView, GuidedRole, PageInsightModel } from "@/lib/insights/types";

export type { GuidedMode, GuidedRole, GuidedDepth };

export function buildGuidedReadView(args: {
  pageModel: PageInsightModel;
  mode: GuidedMode;
  role: GuidedRole;
  depth: GuidedDepth;
  pageClass?: string;
}): GuidedReadView {
  const story = buildPageStory({
    pageClass: args.pageClass || "prose",
    pageModel: args.pageModel,
    role: args.role,
    depth: args.depth,
    mode: args.mode === "apply" ? "apply_test" : args.mode,
  });

  if (!story) {
    return transformByMode(args);
  }

  return {
    pagePurpose: story.narrative,
    steps: story.steps.map((step) => ({
      id: `story-${step.id}`,
      stepNumber: step.id,
      label: step.title,
      primaryText: step.content,
      secondaryText: step.support[0],
      mode: args.mode,
      role: args.role,
      confidence: step.score,
      evidence: step.evidence.map((line, index) => ({
        id: `story-${step.id}-ev-${index}`,
        paragraphIndex: step.id - 1,
        text: line,
      })),
    })),
    supportTitle: "Grounded support",
    supportBullets: [story.mainIdea, ...story.support, ...story.weakSupport].slice(0, args.depth === "quick" ? 2 : args.depth === "standard" ? 4 : 6),
  };
}
