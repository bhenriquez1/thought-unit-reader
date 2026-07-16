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
//   bookId             — the document
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
  id:                 string;         // stable: "kn_{bookId}_{hash}"
  bookId:             string;
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

export interface KnowledgeNodeProgress {
  nodeId: string;

  understandingScore: number;   // 0–100
  recallScore:        number;   // 0–100
  memoryStrength:     number;   // 0–100; decays via forgetting curve
  masteryScore:       number;   // 0–100; composite
  confidenceScore:    number;   // 0–100; learner self-report

  lastStudiedAt:     string | null;   // ISO
  lastReviewedAt:    string | null;
  nextReviewAt:      string | null;   // scheduled by spaced-repetition
  predictedForgetAt: string | null;   // forgetting-curve estimate

  missCount:        number;
  correctCount:     number;
  confusionNodeIds: string[];   // nodeIds the learner confuses with this one
}

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
