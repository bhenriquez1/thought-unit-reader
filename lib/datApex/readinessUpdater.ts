// lib/datApex/readinessUpdater.ts
// Merges a new DatApexResult into the rolling DatReadinessState and persists to IDB.
//
// Uses an exponential moving average (α = 0.3) so recent attempts carry more weight
// than older ones, but the full history isn't thrown away.

import type { DatApexResult, DatReadinessState, ReadinessBand } from "./types";
import type { DatSectionId } from "./blueprint";
import { ACTIVE_DAT_BLUEPRINT } from "./activeBlueprint";
import { saveReadinessState, loadReadinessState } from "./idbStore";

const EMA_ALPHA = 0.3; // higher = newer results weight more

function emaUpdate(existing: number, incoming: number, isFirst: boolean): number {
  if (isFirst) return incoming;
  return EMA_ALPHA * incoming + (1 - EMA_ALPHA) * existing;
}

function bandFromAccuracy(accuracy: number): ReadinessBand {
  if (accuracy >= 0.82) return "exam-ready";
  if (accuracy >= 0.70) return "strong";
  if (accuracy >= 0.58) return "competitive";
  if (accuracy >= 0.44) return "developing";
  return "foundation";
}

function overallBand(sectionBands: Record<string, ReadinessBand>): ReadinessBand {
  const order: ReadinessBand[] = ["foundation", "developing", "competitive", "strong", "exam-ready"];
  const bands = Object.values(sectionBands);
  if (!bands.length) return "foundation";
  // Overall band = average position across sections
  const avgIdx = bands.reduce((sum, b) => sum + order.indexOf(b), 0) / bands.length;
  return order[Math.round(avgIdx)];
}

export async function updateReadinessAfterAttempt(
  userId: string,
  result: DatApexResult,
): Promise<DatReadinessState> {
  const existing = await loadReadinessState(userId);
  const now = new Date().toISOString();

  const prevTopicAccuracy: Record<string, number> = existing?.topicAccuracy ?? {};
  const prevSectionBands: Record<string, ReadinessBand> = existing?.sectionBands ?? {};
  const isFirstAttempt = !existing;

  // Merge section bands and topic accuracy
  const newSectionBands: Record<string, ReadinessBand> = { ...prevSectionBands };
  const newTopicAccuracy: Record<string, number> = { ...prevTopicAccuracy };

  for (const sr of result.sectionResults) {
    newSectionBands[sr.sectionId] = bandFromAccuracy(sr.accuracy);

    for (const [topicId, acc] of Object.entries(sr.topicAccuracy)) {
      const compositeKey = `${sr.sectionId}:${topicId}`;
      const prev = prevTopicAccuracy[compositeKey];
      newTopicAccuracy[compositeKey] = emaUpdate(prev ?? 0, acc, isFirstAttempt || prev === undefined);
    }
  }

  const updatedState: DatReadinessState = {
    userId,
    overallBand:          overallBand(newSectionBands),
    sectionBands:         newSectionBands,
    topicAccuracy:        newTopicAccuracy,
    totalAttempts:        (existing?.totalAttempts ?? 0) + 1,
    totalQuestionsAnswered: (existing?.totalQuestionsAnswered ?? 0) + result.totalQuestions,
    lastActivityAt:       now,
    updatedAt:            now,
  };

  await saveReadinessState(updatedState);
  return updatedState;
}

/* ─── Derived helpers ────────────────────────────────────────────────────────── */

/** Returns the weakest topics across all sections, sorted by accuracy ascending.
 *  topicKey format: "${sectionId}:${topicId}" */
export function weakestTopics(
  readiness: DatReadinessState,
  limit = 5,
): Array<{ sectionId: DatSectionId; topicId: string; accuracy: number }> {
  return Object.entries(readiness.topicAccuracy)
    .map(([key, acc]) => {
      const [sectionId, topicId] = key.split(":") as [DatSectionId, string];
      return { sectionId, topicId, accuracy: acc };
    })
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, limit);
}
