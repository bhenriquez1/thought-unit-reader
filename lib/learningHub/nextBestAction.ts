// lib/learningHub/nextBestAction.ts
// L6 (Learning Hub orchestration correction, Section 9) — "Learning Hub
// should recommend actions ('What should I do next?'), not just show
// stats." Learning Hub previously only ever offered one CTA
// (chapterProgress.ts's nextTopicRecommendation — "read the next unread
// page"), regardless of whether the student actually had a concept overdue
// for review or a weak concept that needed remediation first. This is ONE
// ranked recommendation over the canonical KnowledgeNodeProgress state,
// replacing that single always-"read forward" CTA.
//
// Priority order mirrors the correction's own worked example (Section 14 —
// read → Professor explains → NoteLab note → Recall miss → weakness marked
// → Learning Hub recommends NoteLab+Professor review → improvement →
// TestLab confirms mastery): a concept overdue for review is more urgent
// than a concept that's merely weak, which is more urgent than reading new
// material forward. This intentionally does NOT reimplement "due" or
// "weak" detection — it reuses the exact same selectors Learning Hub's own
// KnowledgeStatePanel and TestLab's own weak-areas exam scope already use
// (selectDueForRecall/selectWeakNodes), so "the same concept means the
// same thing" everywhere it's mentioned.

import type { KnowledgeNode, KnowledgeNodeProgress } from "@/lib/knowledge/knowledgeGraphSchema";
import { selectDueForRecall } from "./knowledgeStateSelectors";
import { selectWeakNodes } from "@/lib/examEngine/examScope";
import type { NextTopicRecommendation } from "@/lib/syllabus/chapterProgress";

export type RecommendedModule = "reader" | "notelab" | "recall" | "testlab";

export interface DeepLinkTarget {
  module: RecommendedModule;
  bookId?: string;
  page?: number;
  knowledgeNodeId?: string;
}

export interface NextBestAction {
  reason: string;
  /** Real evidence backing this recommendation — pulled from the concept's
   *  own KnowledgeNodeProgress.evidence audit log where available, never
   *  fabricated. */
  sourceEvidence: string[];
  conceptIds: string[];
  priority: "high" | "medium" | "low";
  recommendedModule: RecommendedModule;
  deepLinkTarget: DeepLinkTarget;
}

export interface NextBestActionInputs {
  nodes: KnowledgeNode[];
  progressByNodeId: Map<string, KnowledgeNodeProgress>;
  nextTopicRecommendation: NextTopicRecommendation | null;
  bookId?: string;
  weakAccuracyThreshold?: number;
  minAttemptsForSignal?: number;
}

const DEFAULT_WEAK_ACCURACY_THRESHOLD = 60;
const DEFAULT_MIN_ATTEMPTS_FOR_SIGNAL = 3;

function recentEvidence(progress: KnowledgeNodeProgress | undefined, fallback: string): string[] {
  const details = (progress?.evidence ?? []).slice(-3).map((e) => e.detail).filter((d): d is string => !!d);
  return details.length > 0 ? details : [fallback];
}

export function buildNextBestAction(inputs: NextBestActionInputs): NextBestAction | null {
  const dueForRecall = selectDueForRecall({ nodes: inputs.nodes, progressByNodeId: inputs.progressByNodeId, maxItems: 1 });
  if (dueForRecall.length > 0) {
    const node = dueForRecall[0];
    const progress = inputs.progressByNodeId.get(node.id);
    return {
      reason: `"${node.title}" is due for review`,
      sourceEvidence: recentEvidence(progress, `scheduled for review as of ${progress?.nextReviewAt ?? "now"}`),
      conceptIds: [node.id],
      priority: "high",
      recommendedModule: "recall",
      deepLinkTarget: { module: "recall", bookId: inputs.bookId, knowledgeNodeId: node.id },
    };
  }

  const weakNodes = selectWeakNodes({
    nodes: inputs.nodes,
    progressByNodeId: inputs.progressByNodeId,
    weakAccuracyThreshold: inputs.weakAccuracyThreshold ?? DEFAULT_WEAK_ACCURACY_THRESHOLD,
    minAttemptsForSignal: inputs.minAttemptsForSignal ?? DEFAULT_MIN_ATTEMPTS_FOR_SIGNAL,
  });
  if (weakNodes.length > 0) {
    const node = weakNodes[0];
    const progress = inputs.progressByNodeId.get(node.id);
    const attempts = (progress?.successfulRecallCount ?? 0) + (progress?.failedRecallCount ?? 0);
    return {
      reason: `"${node.title}" is still shaky — review it before testing yourself again`,
      sourceEvidence: recentEvidence(progress, `${progress?.failedRecallCount ?? 0} of ${attempts} recent recall attempts missed`),
      conceptIds: [node.id],
      priority: "high",
      recommendedModule: "notelab",
      deepLinkTarget: { module: "notelab", bookId: inputs.bookId, knowledgeNodeId: node.id },
    };
  }

  if (inputs.nextTopicRecommendation) {
    const rec = inputs.nextTopicRecommendation;
    return {
      reason: `${rec.chapterTitle} — ${rec.reason}`,
      sourceEvidence: [rec.reason],
      conceptIds: [],
      priority: "medium",
      recommendedModule: "reader",
      deepLinkTarget: { module: "reader", bookId: inputs.bookId, page: rec.page },
    };
  }

  return null;
}
