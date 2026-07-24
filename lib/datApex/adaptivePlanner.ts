// lib/datApex/adaptivePlanner.ts
// Converts DatReadinessState into a topic-weighted practice plan.
//
// The plan distributes a target question count across topics in inverse proportion
// to mastery: weak topics get more questions, mastered topics get fewer.
// This makes practice sessions automatically target the student's weakest areas.

import type { DatReadinessState } from "./types";
import type { DatSectionId } from "./blueprint";
import { getSectionTopology } from "./blueprintTopology";
import { ACTIVE_DAT_BLUEPRINT } from "./activeBlueprint";

export interface TopicAllocation {
  topicId: string;
  label: string;
  questionCount: number;
  accuracy: number;
  /** Blueprint target percentage weight for this topic. */
  blueprintPct: number;
}

export interface AdaptivePlan {
  sectionId: DatSectionId;
  totalQuestions: number;
  allocations: TopicAllocation[];
  /** True when readiness data is sufficient to drive adaptation. */
  isAdaptive: boolean;
}

const MIN_WEAKNESS_ACCURACY = 0.0; // floor
const BLUEPRINT_WEIGHT     = 0.4;  // how much blueprint targets pull vs pure weakness
const WEAKNESS_WEIGHT      = 0.6;  // how much weakness history pulls

export function buildAdaptivePlan(
  sectionId: DatSectionId,
  readiness: DatReadinessState | null,
  targetQuestions = 20,
): AdaptivePlan {
  const topo = getSectionTopology(sectionId);
  if (!topo || !topo.topics.length) {
    return { sectionId, totalQuestions: 0, allocations: [], isAdaptive: false };
  }

  // Get blueprint target percentages
  const blueprintPcts: Record<string, number> = {};
  for (const section of ACTIVE_DAT_BLUEPRINT.sections) {
    for (const sub of section.subSections) {
      if (sub.id === sectionId) {
        for (const tw of sub.topicWeights) {
          blueprintPcts[tw.topicId] = tw.targetPct;
        }
      }
    }
  }

  // Get readiness accuracy per topic
  const topicAccuracies: Record<string, number> = {};
  if (readiness) {
    for (const [key, acc] of Object.entries(readiness.topicAccuracy)) {
      const [sec, topicId] = key.split(":");
      if (sec === sectionId) topicAccuracies[topicId] = acc;
    }
  }

  const hasReadiness = Object.keys(topicAccuracies).length > 0;

  // Compute composite weight for each topic
  const weights: { topicId: string; weight: number }[] = topo.topics.map((topic) => {
    const bpPct = (blueprintPcts[topic.topicId] ?? topic.targetPct) / 100;
    const accuracy = topicAccuracies[topic.topicId] ?? 0.5; // assume 50% if unknown
    // Weakness = 1 − accuracy; higher weakness → more questions
    const weaknessDrive = Math.max(MIN_WEAKNESS_ACCURACY, 1 - accuracy);

    const weight = hasReadiness
      ? BLUEPRINT_WEIGHT * bpPct + WEAKNESS_WEIGHT * weaknessDrive
      : bpPct; // fall back to pure blueprint when no history

    return { topicId: topic.topicId, weight };
  });

  // Normalize weights
  const totalWeight = weights.reduce((s, w) => s + w.weight, 0);
  if (totalWeight === 0) {
    return { sectionId, totalQuestions: 0, allocations: [], isAdaptive: false };
  }

  // Distribute questions — minimum 1 per topic if target allows
  const rawCounts = weights.map((w) => ({
    ...w,
    raw: (w.weight / totalWeight) * targetQuestions,
  }));

  // Floor pass
  let allocated = rawCounts.map((w) => ({ ...w, count: Math.max(1, Math.floor(w.raw)) }));
  let remaining = targetQuestions - allocated.reduce((s, w) => s + w.count, 0);

  // Distribute remainder to topics with largest fractional parts
  if (remaining > 0) {
    const byFraction = [...allocated]
      .map((w, i) => ({ i, frac: w.raw - Math.floor(w.raw) }))
      .sort((a, b) => b.frac - a.frac);

    for (let k = 0; k < remaining && k < byFraction.length; k++) {
      allocated[byFraction[k].i].count++;
    }
  }

  const allocations: TopicAllocation[] = allocated.map((w) => {
    const topic = topo.topics.find((t) => t.topicId === w.topicId)!;
    return {
      topicId:      w.topicId,
      label:        topic.label,
      questionCount: w.count,
      accuracy:     topicAccuracies[w.topicId] ?? -1, // -1 = no data
      blueprintPct: blueprintPcts[w.topicId] ?? topic.targetPct,
    };
  });

  return {
    sectionId,
    totalQuestions: allocations.reduce((s, a) => s + a.questionCount, 0),
    allocations,
    isAdaptive: hasReadiness,
  };
}
