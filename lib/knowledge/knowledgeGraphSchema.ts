// lib/knowledge/knowledgeGraphSchema.ts
// Universal Knowledge Graph — canonical type definitions.
// NOT YET WIRED UP. Implementation lives in the next PR (Knowledge Graph PR 1).
//
// Core separation principle:
//   KnowledgeNode     — stable content identity, derived from the book.
//                       Survives user progress resets. Can be rebuilt from source.
//   KnowledgeNodeProgress — mutable learner state per node.
//                           Changes constantly; must never alter node identity.
//
// Hierarchy:
//   Book
//   └── Chapter (AdaptiveSyllabus StructureCandidate)
//       └── Section (StructureCandidate, level 2–3)
//           └── KnowledgeNode (Thought Unit → concept)
//               ├── prerequisite
//               ├── mechanism
//               ├── contrast
//               ├── example
//               ├── complication
//               ├── application
//               └── misconception
//
// Cross-system identity keys (every module uses exactly these):
//   documentId         — the RESOLVED, collision-resistant document identity
//                        (see lib/insights/resolveDocumentIdentity.ts). This is
//                        what stableNodeId hashes on and what the dedup
//                        resolver scopes Tier-2 fuzzy matching to — two
//                        different books that happen to share a filename
//                        must never resolve to (or overwrite) the same node.
//   bookId             — the filename-derived book grouping key. Kept
//                        alongside documentId for human-readable "all nodes
//                        in this book" queries (useKnowledgeGraph) — never
//                        used for node-identity/dedup decisions.
//   chapterCandidateId — links to AdaptiveSyllabus.structureCandidates[].id
//   canonicalAnchorId  — links to the source passage anchor (adaptive-study-sheet system)
//   knowledgeNodeId    — this node
//
// Rule: AI may suggest relationships but must not invent node identity.
//       Node identity is grounded in source text only.

export interface SourceCitation {
  anchorId:    string;   // canonicalAnchorId this citation references
  sourceText:  string;   // verbatim excerpt
  page:        number;
  sourceLabel: string;   // "Textbook", "Lecture Notes", "Research", ...
  confidence:  number;   // 0–1
}

export interface KnowledgeNode {
  id:                 string;         // stable: "kn_{documentId}_{hash}" — see stableNodeId()
  documentId:         string;         // resolved, collision-resistant identity — see header comment
  bookId:             string;         // filename-derived grouping key only — never used for dedup
  chapterCandidateId: string | null;  // StructureCandidate.id; null for sub-chapter concepts
  canonicalAnchorId:  string;         // source anchor this node is grounded in

  title:           string;
  summary:         string;
  exactSourceText: string;            // verbatim excerpt from the source document
  sourcePages:     number[];
  citations:       SourceCitation[];

  profileId:  string;   // active ExpertProfile when node was created
  role:       string;   // profile-relative label: "Core Concept" | "Mechanism" | "Algorithm" | "Case" | ...
  importance: number;   // 0–100; set at creation, may be AI-suggested but grounded in profile+syllabus
  difficulty: number;   // 0–100

  parentNodeIds:  string[];
  childNodeIds:   string[];
  relatedNodeIds: string[];

  learningObjectives: string[];
  misconceptions:     string[];
  examples:           string[];
  applications:       string[];
}

// A single citable piece of evidence that this learner's progress on a node
// is grounded in — e.g. "answered a Recall card correctly," "completed a
// Whiteboard lesson," "flagged low confidence in NoteLab." Distinct from
// KnowledgeNode.citations (which cite the SOURCE TEXT the node's content is
// grounded in) — this cites the LEARNER ACTIVITY the progress score is
// grounded in. sourceType intentionally mirrors StudyActivity below plus
// "dat-question" so every module that can produce evidence is representable.
export type LearningEvidenceSourceType =
  | "read" | "expert-brain" | "whiteboard" | "recall" | "notelab" | "dat-question";

export interface LearningEvidenceRef {
  sourceType: LearningEvidenceSourceType;
  sourceId:   string;    // e.g. a RecallCard id, a DAT question id, a whiteboard snapshot id
  occurredAt: string;    // ISO — always passed in by the caller, never Date.now() internally
  detail?:    string;    // short human-readable note, e.g. "rated hard" / "lesson completed"
}

// Summary of this learner's DAT Apex performance on this concept — optional,
// populated only once Phase E wires DAT Apex into the shared event log.
export interface DatPerformanceSummary {
  attempts:        number;
  correct:         number;
  lastAttemptedAt: string | null;   // ISO
  averageTimeMs:   number | null;
}

export interface KnowledgeNodeProgress {
  nodeId: string;
  // Denormalized from the owning KnowledgeNode so progress can be queried
  // per-document without a join — always kept in sync with
  // KnowledgeNode.documentId for the same nodeId. See knowledgeGraphSchema.ts
  // header comment for why this must be the resolved documentId, not bookId.
  documentId:   string;
  // Page identity progress was most recently observed on — nullable because
  // a node can legitimately be referenced from multiple pages/sessions.
  pageTruthKey: string | null;

  understandingScore: number;   // 0–100
  recallScore:        number;   // 0–100
  memoryStrength:     number;   // 0–100; decays via forgetting curve
  masteryScore:       number;   // 0–100; composite — see computeMastery()
  confidenceScore:    number;   // 0–100; learner self-report

  lastStudiedAt:     string | null;   // ISO
  lastReviewedAt:    string | null;
  nextReviewAt:      string | null;   // scheduled by spaced-repetition
  predictedForgetAt: string | null;   // forgetting-curve estimate

  // How many times this concept has been encountered at all (read, taught,
  // quizzed — any StudyActivity), independent of correctness.
  exposureCount: number;

  // successfulRecallCount/failedRecallCount are the canonical names going
  // forward (per the Learning State Engine brief). missCount/correctCount
  // are kept as deprecated aliases, always updated in lockstep by
  // applyLearningEvent() (see learningStateEvents.ts), so any pre-Phase-A
  // reader of the old field names still sees a correct value.
  successfulRecallCount: number;
  failedRecallCount:     number;
  /** @deprecated use failedRecallCount */
  missCount:        number;
  /** @deprecated use successfulRecallCount */
  correctCount:     number;

  confusionNodeIds: string[];   // nodeIds the learner confuses with this one
  // Free-text misconceptions THIS learner has personally exhibited — distinct
  // from KnowledgeNode.misconceptions, which is the content-level list of
  // misconceptions the source material warns about in general.
  observedMisconceptions: string[];

  // Append-only, deterministic activity log — see learningStateEvents.ts.
  // Every field above is a fold over this array; the array is the source of
  // truth, so a progress record can always be recomputed/verified from it.
  evidence: LearningEvidenceRef[];

  // Links to exported Whiteboard lesson snapshots for this concept — empty
  // until Phase B3 (Whiteboard snapshot export) ships; consumed by Phase D
  // (Recall reusing a snapshot as a recall cue).
  whiteboardSnapshotIds: string[];

  // Populated once Phase E wires DAT Apex performance into this same store.
  datPerformance: DatPerformanceSummary | null;
}

// The brief's requested name for this contract — same shape, so every
// future phase can import either name. KnowledgeNodeProgress stays the
// primary exported type (minimizes churn on existing imports); this is a
// pure alias for discoverability and brief-compliance.
export type LearningConceptState = KnowledgeNodeProgress;

// ── Study task (Study Plan PR) ────────────────────────────────────────────
// Defined here so all modules can reference the same activity types.

export type StudyActivity =
  | "read"
  | "expert-brain"
  | "whiteboard"
  | "recall"
  | "practice"
  | "review";

export interface StudyTask {
  knowledgeNodeId:  string;
  activity:         StudyActivity;
  reason:           string;           // why this task was scheduled
  estimatedMinutes: number;
  status:           "planned" | "active" | "complete";
}

// ── Module attachment shape ───────────────────────────────────────────────
// Each module stores its outputs against a node rather than creating
// a separate concept identity. The note, recall card, whiteboard frame,
// etc. all carry this reference so clicking a node can surface them.

export interface NodeModuleRef {
  knowledgeNodeId: string;
  canonicalAnchorId: string;
  chapterCandidateId: string | null;
  sourcePage: number | null;
  sourceText: string | null;
}
