// lib/knowledge/knowledgeGraphSchema.ts
// Universal Knowledge Graph — identity and learning-state types.
// NOT YET IMPLEMENTED. Schema defined here for the next PR.
//
// Separation principle: KnowledgeNode is content identity (book-derived, stable).
// KnowledgeNodeProgress is user state (mutable, per-user, per-session).
// Keeping them separate makes persistence, versioning, and future multi-user
// support clean — the node graph can be rebuilt from the book without losing
// user progress, and progress can be reset without touching the node graph.
//
// Connection to existing systems:
//   canonicalAnchorId → existing anchor system (adaptive-study-sheet anchors)
//   chapterCandidateId → AdaptiveSyllabus.structureCandidates[].id
//   profileId → ExpertProfile.id (determines role labels, importance framing)
//
// Every Avrrio module (Reader, NoteLab, Recall Lab, Study Plan, Expert Brain,
// Whiteboard, Study Guide, Analytics) will become a view over this graph.
// One click on a node synchronizes all modules simultaneously.

export interface KnowledgeNode {
  id:                 string;        // stable, book-scoped: "kn_{bookId}_{hash}"
  bookId:             string;
  chapterCandidateId: string | null; // links to AdaptiveSyllabus chapter (null if sub-chapter level)
  canonicalAnchorId:  string;        // links to the source passage anchor
  title:              string;
  exactText:          string;        // verbatim source excerpt
  page:               number;
  role:               string;        // profile-specific: "Core Concept" | "Mechanism" | "Algorithm" | ...
  profileId:          string;        // active ExpertProfile when node was created
  parentNodeIds:      string[];
  childNodeIds:       string[];
  relatedNodeIds:     string[];
}

export interface KnowledgeNodeProgress {
  nodeId:             string;
  understandingScore: number;        // 0–100
  recallScore:        number;        // 0–100
  memoryStrength:     number;        // 0–100; decays via forgetting curve
  masteryScore:       number;        // 0–100; composite
  lastReviewedAt:     string | null; // ISO timestamp
}
