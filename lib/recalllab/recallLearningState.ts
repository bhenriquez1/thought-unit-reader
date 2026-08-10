// Phase 4B — bridge an actual Recall 2.0 rating into the shared Learning State.

import { recordLearningEvent } from "@/lib/knowledge/recordLearningEvent";
import type { LearningStateEvent } from "@/lib/knowledge/learningStateEvents";
import type { ConfidenceLevel, RecallBlueprint } from "./recall2Types";

export function confidenceToLearningDifficulty(
  confidence: ConfidenceLevel,
): "easy" | "medium" | "hard" {
  if (confidence === "easy") return "easy";
  if (confidence === "unsure") return "medium";
  return "hard";
}

function atUtcMidnight(date: string): string {
  return `${date.slice(0, 10)}T00:00:00.000Z`;
}

function predictedForgetAt(blueprint: RecallBlueprint, occurredAt: string): string {
  const date = new Date(occurredAt);
  const stabilityDays = Math.max(1, Math.round(blueprint.interval * blueprint.easeFactor));
  date.setUTCDate(date.getUTCDate() + stabilityDays);
  return date.toISOString();
}

/** Pure event assembly, exported so scheduling/progress coupling is testable. */
export function buildRecallLearningEvents(
  blueprint: RecallBlueprint,
  confidence: ConfidenceLevel,
  occurredAt: string,
): LearningStateEvent[] {
  const events: LearningStateEvent[] = [{
    kind: "recall-graded",
    difficulty: confidenceToLearningDifficulty(confidence),
    occurredAt,
    sourceId: blueprint.id,
    nextReviewAt: atUtcMidnight(blueprint.dueDate),
    predictedForgetAt: predictedForgetAt(blueprint, occurredAt),
  }];

  if ((confidence === "guessed" || confidence === "blank") && blueprint.misconception) {
    events.push({
      kind: "misconception-observed",
      misconception: blueprint.misconception,
      occurredAt,
      sourceId: blueprint.id,
    });
  }
  return events;
}

export async function recordRecallBlueprintRating(
  blueprint: RecallBlueprint,
  confidence: ConfidenceLevel,
  occurredAt: string,
): Promise<{ recorded: boolean; reason?: "missing-canonical-identity" }> {
  if (!blueprint.knowledgeNodeId || !blueprint.documentId || !blueprint.pageTruthKey) {
    return { recorded: false, reason: "missing-canonical-identity" };
  }

  for (const event of buildRecallLearningEvents(blueprint, confidence, occurredAt)) {
    await recordLearningEvent(
      blueprint.knowledgeNodeId,
      blueprint.documentId,
      event,
      blueprint.pageTruthKey,
    );
  }
  return { recorded: true };
}
