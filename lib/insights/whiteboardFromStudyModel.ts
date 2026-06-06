// lib/insights/whiteboardFromStudyModel.ts
// Converts a CurrentPageStudyModel into WhiteboardStep[] with NO API call.
// One brain, many views: finalStudyModel → Whiteboard.

import type { WhiteboardStep } from "@/lib/WhiteboardExplanationService";
import type { CurrentPageStudyModel } from "@/lib/insights/currentPageStudyModel";

export function buildWhiteboardStepsFromStudyModel(
  model: CurrentPageStudyModel,
): WhiteboardStep[] {
  const steps: WhiteboardStep[] = [];
  const sn = model.studyNotes;

  if (model.pageThesis) {
    steps.push({
      type: "text",
      title: "Page Thesis",
      description: model.pageThesis,
      visualPrompt: "Large bold header with underline",
      payload: { kind: "title" },
    });
  }

  if (sn?.whyThisMatters) {
    steps.push({
      type: "text",
      title: "Why This Matters",
      description: sn.whyThisMatters,
      visualPrompt: "Callout box with arrow",
      payload: { kind: "highlight", color: "#fef08a" },
    });
  }

  if (sn?.keyMechanism) {
    steps.push({
      type: "draw",
      title: "Key Mechanism",
      description: sn.keyMechanism,
      visualPrompt: "Flow diagram with labeled arrows",
      payload: { kind: "mechanism" },
    });
  }

  if (sn?.commonConfusion) {
    steps.push({
      type: "text",
      title: "Watch Out",
      description: sn.commonConfusion,
      visualPrompt: "Red warning box",
      payload: { kind: "trap", color: "#fca5a5" },
    });
  }

  for (const cb of (model.conceptBlocks ?? []).slice(0, 3)) {
    steps.push({
      type: "draw",
      title: cb.title,
      description: cb.pattern + (cb.mechanism ? `\n\n${cb.mechanism}` : ""),
      visualPrompt: "Concept map with pattern and mechanism",
      payload: { kind: "concept" },
    });
  }

  return steps;
}
