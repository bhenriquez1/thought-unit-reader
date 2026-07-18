// lib/syllabus/normalizer.ts
// Normalization layer: raw AI output → validated UniversalSyllabus.
//
// Mirrors the parseAiResponse design in classify-document.ts:
// all AI output is suspect; safe defaults handle every failure mode.
//
// Returns null only when the JSON is entirely unparseable.
// All other problems (missing fields, wrong types, out-of-range values)
// produce safe normalized defaults.

import type { BookIntelligence } from "@/lib/bookIntelligence/types";
import type { StructureCandidate } from "./syllabusSchema";
import type {
  UniversalSyllabus,
  SyllabusNode,
  CanonicalAnchor,
  SyllabusEdge,
  SyllabusNodeType,
  NodeSourceType,
  SyllabusQuality,
  PrerequisiteEdgeType,
  PrerequisiteStrength,
} from "./types";
import { SYLLABUS_VERSION } from "./types";

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

function clamp01(v: unknown): number {
  return typeof v === "number" ? Math.min(1, Math.max(0, v)) : 0.5;
}

function clampPositive(v: unknown, defaultVal: number): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : defaultVal;
}

const VALID_NODE_TYPES = new Set<SyllabusNodeType>([
  "part", "chapter", "section", "subsection",
  "concept", "definition", "principle", "procedure",
  "mechanism", "example", "figure", "table",
  "equation", "case-study", "exercise", "review-question",
  "appendix", "glossary", "reference",
]);

const VALID_SOURCES = new Set<NodeSourceType>([
  "bookmark", "toc", "heading", "uploaded", "ai-inferred",
]);

const VALID_EDGE_TYPES = new Set<PrerequisiteEdgeType>([
  "concept-prerequisite", "skill-prerequisite", "domain-prerequisite", "temporal",
]);

const VALID_STRENGTHS = new Set<PrerequisiteStrength>([
  "required", "recommended", "helpful",
]);

const VALID_ANCHOR_TYPES = new Set(["concept", "definition", "principle", "procedure", "mechanism"]);

/* ─── Node normalization ──────────────────────────────────────────────────── */

function normalizeNode(
  raw: any,
  index: number,
  candidateIds: Set<string>,
): SyllabusNode {
  const id: string = typeof raw?.id === "string" && raw.id.trim()
    ? raw.id.trim()
    : `node-${index}`;

  const nodeType: SyllabusNodeType = VALID_NODE_TYPES.has(raw?.nodeType)
    ? raw.nodeType as SyllabusNodeType
    : "section";

  const source: NodeSourceType = VALID_SOURCES.has(raw?.source)
    ? raw.source as NodeSourceType
    : "ai-inferred";

  const chapterCandidateId =
    typeof raw?.chapterCandidateId === "string" && candidateIds.has(raw.chapterCandidateId)
      ? raw.chapterCandidateId
      : undefined;

  const concepts: string[] = Array.isArray(raw?.concepts)
    ? (raw.concepts as unknown[]).filter((c): c is string => typeof c === "string").slice(0, 8)
    : [];

  const canonicalAnchorIds: string[] = Array.isArray(raw?.canonicalAnchorIds)
    ? (raw.canonicalAnchorIds as unknown[]).filter((id): id is string => typeof id === "string")
    : [];

  const pageStart =
    typeof raw?.pageStart === "number" && raw.pageStart >= 1
      ? Math.round(raw.pageStart)
      : undefined;

  const pageEnd =
    typeof raw?.pageEnd === "number" && raw.pageEnd >= 1
      ? Math.round(raw.pageEnd)
      : undefined;

  return {
    id,
    title: typeof raw?.title === "string" && raw.title.trim()
      ? raw.title.trim().slice(0, 200)
      : `Section ${index + 1}`,
    nodeType,
    parentId: typeof raw?.parentId === "string" && raw.parentId.trim()
      ? raw.parentId.trim()
      : undefined,
    pageStart,
    pageEnd,
    source,
    inferred: source === "ai-inferred" || raw?.inferred === true,
    sourceConfidence:    clamp01(raw?.sourceConfidence),
    importance:          clamp01(raw?.importance),
    difficulty:          clamp01(raw?.difficulty),
    estimatedMinutes:    clampPositive(raw?.estimatedMinutes, 30),
    recommendedOrder:
      typeof raw?.recommendedOrder === "number" && raw.recommendedOrder >= 1
        ? Math.round(raw.recommendedOrder)
        : index + 1,
    concepts,
    enrichmentConfidence: clamp01(raw?.enrichmentConfidence),
    canonicalAnchorIds,
    knowledgeNodeIds: [],
    chapterCandidateId,
  };
}

/* ─── Anchor normalization ────────────────────────────────────────────────── */

function normalizeAnchor(raw: any, index: number): CanonicalAnchor {
  return {
    id: typeof raw?.id === "string" && raw.id.trim()
      ? raw.id.trim()
      : `anchor-${index}`,
    title: typeof raw?.title === "string" && raw.title.trim()
      ? raw.title.trim().slice(0, 120)
      : `Anchor ${index + 1}`,
    type: VALID_ANCHOR_TYPES.has(raw?.type)
      ? (raw.type as CanonicalAnchor["type"])
      : "concept",
    description: typeof raw?.description === "string"
      ? raw.description.slice(0, 300)
      : "",
    nodeIds: Array.isArray(raw?.nodeIds)
      ? (raw.nodeIds as unknown[]).filter((id): id is string => typeof id === "string")
      : [],
    confidence:      clamp01(raw?.confidence),
    knowledgeNodeIds: [],
  };
}

/* ─── Edge normalization ──────────────────────────────────────────────────── */

function normalizeEdge(raw: any, nodeIds: Set<string>): SyllabusEdge | null {
  if (typeof raw?.fromNodeId !== "string" || typeof raw?.toNodeId !== "string") return null;
  const from = raw.fromNodeId.trim();
  const to   = raw.toNodeId.trim();
  if (!from || !to || from === to) return null;
  if (!nodeIds.has(from) || !nodeIds.has(to)) return null;

  return {
    fromNodeId: from,
    toNodeId:   to,
    type:     VALID_EDGE_TYPES.has(raw?.type)     ? raw.type     : "temporal",
    strength: VALID_STRENGTHS.has(raw?.strength)  ? raw.strength : "recommended",
    reason:   typeof raw?.reason === "string" ? raw.reason.slice(0, 200) : "",
  };
}

/* ─── Quality derivation ──────────────────────────────────────────────────── */

function deriveQuality(
  nodes: SyllabusNode[],
  anchors: CanonicalAnchor[],
  edges: SyllabusEdge[],
): SyllabusQuality {
  if (anchors.length >= 3 && edges.length >= 2) return "canonical";
  if (nodes.some(n => n.pageStart !== undefined)) return "structural";
  return "minimal";
}

/* ─── Candidate-based fallback ────────────────────────────────────────────── */

function synthesizeNodesFromCandidates(candidates: StructureCandidate[]): SyllabusNode[] {
  return candidates.map((c, i) => ({
    id:                  c.id,
    title:               c.title,
    nodeType:            (c.level === 1 ? "chapter" : c.level === 2 ? "section" : "subsection") as SyllabusNodeType,
    pageStart:           c.startPage,
    pageEnd:             c.endPage,
    source:              c.source as NodeSourceType,
    inferred:            false,
    sourceConfidence:    c.confidence,
    importance:          0.5,
    difficulty:          0.5,
    estimatedMinutes:    30,
    recommendedOrder:    i + 1,
    concepts:            [],
    enrichmentConfidence: 0,
    canonicalAnchorIds:  [],
    knowledgeNodeIds:    [],
    chapterCandidateId:  c.id,
  }));
}

/* ─── Public API ──────────────────────────────────────────────────────────── */

/**
 * Parse and normalize a raw AI syllabus response into a UniversalSyllabus.
 * Returns null only if the JSON is entirely unparseable.
 * All other failure modes produce safe normalized defaults.
 */
export function parseSyllabusResponse(
  raw: string,
  documentId: string,
  intelligence: BookIntelligence,
  candidates: StructureCandidate[],
): UniversalSyllabus | null {
  let j: any;
  try {
    j = JSON.parse(raw);
  } catch {
    return null;
  }

  // Accept object only — array/null/primitive → treat as empty
  if (!j || typeof j !== "object" || Array.isArray(j)) j = {};

  const candidateIds = new Set(candidates.map(c => c.id));

  // Normalize nodes — fall back to candidate-synthesized nodes when AI omits them
  let nodes: SyllabusNode[] = Array.isArray(j.nodes)
    ? j.nodes.slice(0, 500).map((n: any, i: number) => normalizeNode(n, i, candidateIds))
    : [];

  if (nodes.length === 0 && candidates.length > 0) {
    nodes = synthesizeNodesFromCandidates(candidates);
  }

  // Deduplicate by ID — keep first occurrence
  const seenNodeIds = new Set<string>();
  const dedupedNodes = nodes.filter(n => {
    if (seenNodeIds.has(n.id)) return false;
    seenNodeIds.add(n.id);
    return true;
  });

  const anchors: CanonicalAnchor[] = Array.isArray(j.anchors)
    ? j.anchors.slice(0, 100).map((a: any, i: number) => normalizeAnchor(a, i))
    : [];

  const edges: SyllabusEdge[] = Array.isArray(j.edges)
    ? j.edges
        .slice(0, 1000)
        .map((e: any) => normalizeEdge(e, seenNodeIds))
        .filter((e): e is SyllabusEdge => e !== null)
    : [];

  // Deduplicate edges — same fromNodeId+toNodeId pair → keep first
  const seenEdgeKeys = new Set<string>();
  const dedupedEdges = edges.filter(e => {
    const key = `${e.fromNodeId}→${e.toNodeId}`;
    if (seenEdgeKeys.has(key)) return false;
    seenEdgeKeys.add(key);
    return true;
  });

  let recommendedOrder: string[] = Array.isArray(j.recommendedOrder)
    ? (j.recommendedOrder as unknown[])
        .filter((id): id is string => typeof id === "string" && seenNodeIds.has(id))
        .slice(0, 500)
    : [];

  // Default: sort by recommendedOrder field when not provided
  if (recommendedOrder.length === 0) {
    recommendedOrder = [...dedupedNodes]
      .sort((a, b) => a.recommendedOrder - b.recommendedOrder)
      .map(n => n.id);
  }

  const studyRoadmap: string[] = Array.isArray(j.studyRoadmap)
    ? (j.studyRoadmap as unknown[]).filter((s): s is string => typeof s === "string").slice(0, 20)
    : [];

  return {
    documentId,
    bookIntelligenceVersion: intelligence.version,
    primaryDomain: intelligence.classification.primaryDomain,
    nodes:           dedupedNodes,
    anchors,
    edges:           dedupedEdges,
    recommendedOrder,
    studyRoadmap,
    quality:         deriveQuality(dedupedNodes, anchors, dedupedEdges),
    computedAt:      Date.now(),
    version:         SYLLABUS_VERSION,
  };
}
