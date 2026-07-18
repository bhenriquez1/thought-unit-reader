// lib/syllabus/types.ts
// Universal Syllabus Model — canonical document hierarchy with semantic anchors,
// prerequisite edges, and confidence metadata.
//
// Sits above the extraction layer (StructureCandidate) and AI enrichment layer
// (AdaptiveChapter), unifying them into a single IDB-persisted record.
//
// Architecture mandate: add graph references alongside existing persistent fields.
// StructureCandidate and AdaptiveChapter in syllabusSchema.ts are not replaced —
// this model is written to avrrio-syllabus IDB as a parallel record.

export const SYLLABUS_VERSION = 1;

/* ─── Node types ──────────────────────────────────────────────────────────── */

export type SyllabusNodeType =
  | "part" | "chapter" | "section" | "subsection"
  | "concept" | "definition" | "principle" | "procedure"
  | "mechanism" | "example" | "figure" | "table"
  | "equation" | "case-study" | "exercise" | "review-question"
  | "appendix" | "glossary" | "reference";

export type NodeSourceType =
  | "bookmark"     // PDF outline/bookmark — highest confidence
  | "toc"          // Detected TOC page
  | "heading"      // Typography/position-based detection
  | "uploaded"     // User-supplied syllabus
  | "ai-inferred"; // AI-generated, no direct document grounding

/* ─── Canonical anchor ────────────────────────────────────────────────────── */

/**
 * A semantic entity (concept, definition, procedure, principle) extracted
 * from the document. Referenced from SyllabusNode.canonicalAnchorIds[].
 * knowledgeNodeIds is reserved for PR E cross-library matching.
 */
export type CanonicalAnchor = {
  id: string;
  title: string;
  type: "concept" | "definition" | "principle" | "procedure" | "mechanism";
  /** 1–2 sentence summary of what this anchor represents */
  description: string;
  /** IDs of SyllabusNodes where this anchor appears */
  nodeIds: string[];
  /** 0–1 confidence that this anchor is correctly extracted */
  confidence: number;
  /** Reserved for PR E: cross-library knowledge graph node IDs */
  knowledgeNodeIds: string[];
};

/* ─── Syllabus node ───────────────────────────────────────────────────────── */

/**
 * Universal, normalized document hierarchy node.
 * Unifies StructureCandidate (deterministic) with AI enrichment.
 */
export type SyllabusNode = {
  id: string;
  title: string;
  nodeType: SyllabusNodeType;
  parentId?: string;
  pageStart?: number;
  pageEnd?: number;
  source: NodeSourceType;
  /** true = AI-inferred; false = present verbatim in source */
  inferred: boolean;
  /** 0–1 confidence that this node is correctly extracted */
  sourceConfidence: number;

  /* ── Adaptive enrichment (0–1 continuous scores) ─────────────────── */
  /** 0–1 importance relative to the document's learning objectives */
  importance: number;
  /** 0–1 cognitive difficulty */
  difficulty: number;
  estimatedMinutes: number;
  /** 1-indexed recommended study order across the whole document */
  recommendedOrder: number;
  /** 3–6 key concepts covered by this node */
  concepts: string[];
  /** 0–1 AI confidence in enrichment values */
  enrichmentConfidence: number;

  /* ── Graph references (architecture mandate: add alongside, not replace) ─ */
  /** IDs of CanonicalAnchor records introduced or reinforced here */
  canonicalAnchorIds: string[];
  /** Reserved for PR E: knowledge graph node IDs for cross-book matching */
  knowledgeNodeIds: string[];
  /** Back-reference to the StructureCandidate this node was built from */
  chapterCandidateId?: string;
};

/* ─── Prerequisite edge ───────────────────────────────────────────────────── */

export type PrerequisiteEdgeType =
  | "concept-prerequisite"   // must understand concept A before B
  | "skill-prerequisite"     // must be able to do X before Y
  | "domain-prerequisite"    // cross-domain dependency
  | "temporal";              // reflects document reading order

export type PrerequisiteStrength =
  | "required"     // cannot meaningfully learn target without source
  | "recommended"  // strongly benefits from source
  | "helpful";     // mild benefit from source

export type SyllabusEdge = {
  fromNodeId: string;
  toNodeId: string;
  type: PrerequisiteEdgeType;
  strength: PrerequisiteStrength;
  reason: string;
};

/* ─── Universal Syllabus ──────────────────────────────────────────────────── */

export type SyllabusQuality =
  | "canonical"    // rich hierarchy with anchors and graph edges
  | "structural"   // page-range hierarchy without semantic anchors
  | "minimal";     // flat list only, limited enrichment

export type UniversalSyllabus = {
  /** Matches BookIntelligence.documentId */
  documentId: string;
  /** Version of the BookIntelligence record that drove generation */
  bookIntelligenceVersion: number;
  /** Primary domain used to select the reasoning strategy */
  primaryDomain: string;
  nodes: SyllabusNode[];
  anchors: CanonicalAnchor[];
  edges: SyllabusEdge[];
  /** Ordered nodeIds for the recommended study path */
  recommendedOrder: string[];
  /** Human-readable phase labels e.g. ["Foundation", "Core", "Advanced"] */
  studyRoadmap: string[];
  quality: SyllabusQuality;
  computedAt: number;
  version: number;
};
