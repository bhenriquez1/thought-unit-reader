// Phase 4B — deterministic retrieval sessions assembled from artifacts the
// product already trusts. This module never reads a PDF and never calls AI.

import type { WhiteboardLessonSnapshot } from "@/lib/knowledge/whiteboardLessonSnapshotStore";
import {
  selectProfessorSnapshots,
  type CanonicalTextbookEvidence,
  type NoteLabPageIdentity,
} from "@/lib/notelab/conceptEvidenceWorkspace";
import { canonicalHash, newBlueprint } from "./recall2Store";
import type { RecallBlueprint, RecallCategory } from "./recall2Types";

export type CanonicalRecallMode = "concept" | "professor-snapshot" | "misconception-repair";

export interface CanonicalRecallIdentity extends NoteLabPageIdentity {
  /** Filename-derived grouping label only; never participates in identity checks. */
  bookId: string;
  knowledgeNodeId: string | null;
}

export interface CanonicalRecallModeBundle {
  mode: CanonicalRecallMode;
  title: string;
  description: string;
  cards: RecallBlueprint[];
}

const CATEGORY_BY_CANONICAL_TYPE: Record<string, RecallCategory> = {
  definition: "recognition",
  mechanism: "procedure",
  procedure: "procedure",
  decision: "clinical",
  comparison: "understanding",
  trap: "mistake",
  clinicalPearl: "clinical",
  supportingEvidence: "transfer",
};

function stableCard(params: {
  identity: CanonicalRecallIdentity;
  mode: CanonicalRecallMode;
  artifactId: string;
  front: string;
  back: string;
  category: RecallCategory;
  sourceLabel: string;
  canonicalUnitId?: string;
  sourceSnapshotId?: string;
  misconception?: string;
  hint?: string;
  learningObjective?: string;
  createdAt: string;
}): RecallBlueprint {
  const { identity } = params;
  return {
    ...newBlueprint(params.front, params.back, params.category, {
      bookId: identity.bookId,
      pageNumber: identity.pageNumber,
      documentId: identity.documentId,
      pageTruthKey: identity.pageTruthKey,
      knowledgeNodeId: identity.knowledgeNodeId ?? undefined,
      canonicalUnitId: params.canonicalUnitId,
      sourceLabel: params.sourceLabel,
      sourceKind: params.mode === "concept" ? "canonical-thought-unit" : params.mode,
      sourceSnapshotId: params.sourceSnapshotId,
      misconception: params.misconception,
      hint: params.hint,
      learningObjective: params.learningObjective,
    }),
    id: `bp-canonical-${params.mode}-${canonicalHash(`${identity.documentId}|${identity.pageNumber}|${identity.pageTruthKey}|${params.artifactId}`)}`,
    createdAt: params.createdAt.slice(0, 10),
    dueDate: params.createdAt.slice(0, 10),
  };
}

function evidenceBelongsToPage(evidence: CanonicalTextbookEvidence, identity: CanonicalRecallIdentity): boolean {
  return evidence.documentId === identity.documentId
    && evidence.pageNumber === identity.pageNumber
    && evidence.pageTruthKey === identity.pageTruthKey;
}

/**
 * Build the three active-retrieval modes from canonical Surgeon evidence and
 * saved Professor snapshots. Stale or ambiguously identified artifacts are
 * excluded; an empty mode stays empty instead of falling back to page number.
 */
export function buildCanonicalRecallModes(params: {
  identity: CanonicalRecallIdentity;
  evidence: CanonicalTextbookEvidence[];
  snapshots: WhiteboardLessonSnapshot[];
  createdAt?: string;
}): CanonicalRecallModeBundle[] {
  const { identity } = params;
  const createdAt = params.createdAt ?? new Date().toISOString();
  const evidence = params.evidence.filter(item => evidenceBelongsToPage(item, identity));
  const snapshots = selectProfessorSnapshots(params.snapshots, identity);

  const conceptCards = evidence.map(item => stableCard({
    identity,
    mode: "concept",
    artifactId: item.id,
    front: `Explain the ${item.canonicalType} the Surgeon marked because: ${item.reason}`,
    back: item.exactText,
    category: CATEGORY_BY_CANONICAL_TYPE[item.canonicalType] ?? "understanding",
    sourceLabel: "Surgeon Thought Unit",
    canonicalUnitId: item.id,
    hint: `Reconstruct the idea before checking the textbook evidence.`,
    learningObjective: `Explain this ${item.canonicalType} accurately in your own words.`,
    createdAt,
  }));

  const professorCards: RecallBlueprint[] = [];
  for (const snapshot of snapshots) {
    for (const step of snapshot.teachingSteps) {
      professorCards.push(stableCard({
        identity,
        mode: "professor-snapshot",
        artifactId: `${snapshot.lessonId}:step:${step.stepId}`,
        front: `Reconstruct Professor step ${step.stepId + 1}: ${step.label}`,
        back: step.narration.trim() || step.label,
        category: "understanding",
        sourceLabel: "Professor Snapshot",
        canonicalUnitId: snapshot.thoughtUnitIds[0],
        sourceSnapshotId: snapshot.lessonId,
        hint: `Replay the teaching sequence from memory before revealing it.`,
        learningObjective: `Reproduce the saved lesson step without regenerating the page.`,
        createdAt,
      }));
    }
  }

  const misconceptionCards: RecallBlueprint[] = [];
  for (const item of evidence.filter(candidate => candidate.canonicalType === "trap")) {
    misconceptionCards.push(stableCard({
      identity,
      mode: "misconception-repair",
      artifactId: `${item.id}:trap`,
      front: `Identify and repair this textbook trap: ${item.reason}`,
      back: item.exactText,
      category: "mistake",
      sourceLabel: "Surgeon Trap",
      canonicalUnitId: item.id,
      misconception: item.reason,
      hint: `State the tempting mistake, then replace it with the exact rule.`,
      learningObjective: `Correct a known misconception using grounded textbook evidence.`,
      createdAt,
    }));
  }
  for (const snapshot of snapshots) {
    for (const step of snapshot.teachingSteps) {
      const misconception = step.misconceptionLabel?.trim();
      if (!misconception) continue;
      misconceptionCards.push(stableCard({
        identity,
        mode: "misconception-repair",
        artifactId: `${snapshot.lessonId}:repair:${step.stepId}`,
        front: `What is wrong with “${misconception}”, and what should replace it?`,
        back: step.narration.trim() || `Professor crossed out: ${misconception}`,
        category: "mistake",
        sourceLabel: "Professor Snapshot",
        canonicalUnitId: snapshot.thoughtUnitIds[0],
        sourceSnapshotId: snapshot.lessonId,
        misconception,
        hint: `Recall why Professor crossed this statement out.`,
        learningObjective: `Repair the misconception preserved in the saved lesson.`,
        createdAt,
      }));
    }
  }

  return [
    {
      mode: "concept",
      title: "Concept Explain-back",
      description: "Explain canonical Surgeon Thought Units from memory.",
      cards: conceptCards,
    },
    {
      mode: "professor-snapshot",
      title: "Professor Snapshot",
      description: "Replay the exact teaching sequence already saved in Whiteboard.",
      cards: professorCards,
    },
    {
      mode: "misconception-repair",
      title: "Misconception Repair",
      description: "Correct Surgeon traps and Professor cross-outs.",
      cards: misconceptionCards,
    },
  ];
}
