// lib/notelab/conceptEvidenceWorkspace.ts
// Pure Phase-4 NoteLab assembly helpers. NoteLab does not read or re-analyse a
// PDF: it composes already-grounded Surgeon evidence, already-saved Professor
// snapshots, the current study model, and the shared Knowledge Graph.

import { buildSurgeonEvidenceId, type GroundedSurgeonAnnotation } from "@/lib/highlights/groundSurgeonQuotes";
import type { CurrentPageStudyModel } from "@/lib/insights/currentPageStudyModel";
import type { KnowledgeNode } from "@/lib/knowledge/knowledgeGraphSchema";
import type { WhiteboardLessonSnapshot } from "@/lib/knowledge/whiteboardLessonSnapshotStore";

export interface NoteLabPageIdentity {
  documentId: string;
  pageNumber: number;
  pageTruthKey: string;
}

export interface CanonicalTextbookEvidence {
  id: string;
  documentId: string;
  pageNumber: number;
  pageTruthKey: string;
  exactText: string;
  canonicalType: GroundedSurgeonAnnotation["canonicalType"];
  reason: string;
  importance: GroundedSurgeonAnnotation["importance"];
  confidence: number;
  groundingState: GroundedSurgeonAnnotation["groundingState"];
}

export interface RecallMaterialPreview {
  id: string;
  kind: "explain-back" | "misconception-repair" | "question";
  prompt: string;
  sourceSnapshotId: string | null;
}

export interface RelatedConceptPreview {
  id: string;
  title: string;
  role: string;
  sourcePages: number[];
  relationship: "parent" | "child" | "related" | "same-page";
}

/** A study model is renderable only under the exact page/text truth it was
 * synthesized from. Missing pageTruthKey is legacy/ambiguous and is rejected. */
export function studyModelMatchesPage(
  model: CurrentPageStudyModel | null | undefined,
  identity: NoteLabPageIdentity,
): model is CurrentPageStudyModel {
  return Boolean(model)
    && model!.page === identity.pageNumber
    && model!.pageTruthKey === identity.pageTruthKey;
}

/** Convert current Surgeon output into immutable source-evidence cards. The
 * caller must provide the pageTruthKey owned by the Surgeon plan; stale output
 * produces an empty list instead of being re-keyed onto the current page. */
export function buildCanonicalTextbookEvidence(params: {
  identity: NoteLabPageIdentity;
  surgeonPageTruthKey: string | null | undefined;
  groundedAnnotations: GroundedSurgeonAnnotation[];
}): CanonicalTextbookEvidence[] {
  const { identity, surgeonPageTruthKey, groundedAnnotations } = params;
  if (surgeonPageTruthKey !== identity.pageTruthKey) return [];

  return groundedAnnotations.map((annotation, index) => ({
    id: buildSurgeonEvidenceId(identity.documentId, identity.pageNumber, index),
    documentId: identity.documentId,
    pageNumber: identity.pageNumber,
    pageTruthKey: identity.pageTruthKey,
    exactText: annotation.groundedText,
    canonicalType: annotation.canonicalType,
    reason: annotation.reason,
    importance: annotation.importance,
    confidence: annotation.confidence,
    groundingState: annotation.groundingState,
  }));
}

/** Keep the active canonical Thought Unit when it belongs to this Surgeon
 * evidence set; otherwise retain the page set. This avoids an unrelated stale
 * focus id hiding valid current-page evidence. */
export function selectEvidenceForConcept(
  evidence: CanonicalTextbookEvidence[],
  activeUnitId: string | null | undefined,
): CanonicalTextbookEvidence[] {
  if (!activeUnitId) return evidence;
  const focused = evidence.filter(item => item.id === activeUnitId);
  return focused.length > 0 ? focused : evidence;
}

/** Global reading focus may briefly retain an id from the page just left.
 * Return it only when a current-page canonical artifact proves ownership. */
export function selectCurrentPageFocusId(params: {
  focusedUnitId: string | null | undefined;
  evidence: CanonicalTextbookEvidence[];
  studyModel?: CurrentPageStudyModel | null;
  knowledgeNodes: KnowledgeNode[];
  pageNumber: number;
}): string | null {
  const { focusedUnitId, evidence, studyModel, knowledgeNodes, pageNumber } = params;
  if (!focusedUnitId) return null;
  const inSurgeon = evidence.some(item => item.id === focusedUnitId);
  const inStudyModel = studyModel?.visualAnchors?.some(
    anchor => anchor.id === focusedUnitId || (anchor as typeof anchor & { evidenceRefId?: string }).evidenceRefId === focusedUnitId,
  ) ?? false;
  const inGraph = knowledgeNodes.some(node =>
    node.sourcePages.includes(pageNumber)
    && (node.id === focusedUnitId || node.canonicalAnchorId === focusedUnitId),
  );
  return inSurgeon || inStudyModel || inGraph ? focusedUnitId : null;
}

/** Professor snapshots must match all three identity dimensions. A snapshot
 * from the same page number under an older extraction is stale and excluded. */
export function selectProfessorSnapshots(
  snapshots: WhiteboardLessonSnapshot[],
  identity: NoteLabPageIdentity,
  activeUnitId?: string | null,
): WhiteboardLessonSnapshot[] {
  const exact = snapshots.filter(snapshot =>
    snapshot.documentId === identity.documentId
    && snapshot.pageNumber === identity.pageNumber
    && snapshot.pageTruthKey === identity.pageTruthKey
  );
  const focused = activeUnitId
    ? exact.filter(snapshot => snapshot.conceptIds.includes(activeUnitId) || snapshot.thoughtUnitIds.includes(activeUnitId))
    : exact;
  return (focused.length > 0 ? focused : exact)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Build Recall-ready previews only from material already present in the
 * canonical workspace. This is deterministic and deliberately makes no API
 * request; Phase 4 Recall can consume the same snapshot/unit references. */
export function buildRecallMaterialPreview(params: {
  snapshots: WhiteboardLessonSnapshot[];
  studyModel?: CurrentPageStudyModel | null;
}): RecallMaterialPreview[] {
  const { snapshots, studyModel } = params;
  const material: RecallMaterialPreview[] = [];

  for (const snapshot of snapshots.slice(0, 1)) {
    for (const step of snapshot.teachingSteps) {
      const label = step.label.trim();
      if (label) {
        material.push({
          id: `${snapshot.lessonId}:explain:${step.stepId}`,
          kind: "explain-back",
          prompt: `Explain ${label} in your own words.`,
          sourceSnapshotId: snapshot.lessonId,
        });
      }
      const misconception = step.misconceptionLabel?.trim();
      if (misconception) {
        material.push({
          id: `${snapshot.lessonId}:repair:${step.stepId}`,
          kind: "misconception-repair",
          prompt: `What is wrong with: “${misconception}”?`,
          sourceSnapshotId: snapshot.lessonId,
        });
      }
    }
  }

  for (const [index, prompt] of (studyModel?.miniTest ?? []).entries()) {
    const text = prompt.trim();
    if (!text) continue;
    material.push({
      id: `study-model-question:${index}:${text.slice(0, 32)}`,
      kind: "question",
      prompt: text,
      sourceSnapshotId: null,
    });
  }

  const seen = new Set<string>();
  return material.filter(item => {
    const key = item.prompt.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 6);
}

/** Resolve related concepts from the existing Knowledge Graph. Direct graph
 * relationships win; same-page nodes are a truthful structural fallback, not
 * a second AI interpretation. */
export function buildRelatedConceptPreviews(
  nodes: KnowledgeNode[],
  activeUnitId: string | null | undefined,
  pageNumber: number,
): RelatedConceptPreview[] {
  const focused = nodes.find(node => node.id === activeUnitId || node.canonicalAnchorId === activeUnitId)
    ?? nodes.find(node => node.sourcePages.includes(pageNumber));
  if (!focused) return [];

  const relationById = new Map<string, RelatedConceptPreview["relationship"]>();
  focused.parentNodeIds.forEach(id => relationById.set(id, "parent"));
  focused.childNodeIds.forEach(id => relationById.set(id, "child"));
  focused.relatedNodeIds.forEach(id => relationById.set(id, "related"));

  let related = nodes.filter(node => relationById.has(node.id));
  if (related.length === 0) {
    related = nodes.filter(node => node.id !== focused.id && node.sourcePages.includes(pageNumber));
  }

  return related.slice(0, 6).map(node => ({
    id: node.id,
    title: node.title,
    role: node.role,
    sourcePages: node.sourcePages,
    relationship: relationById.get(node.id) ?? "same-page",
  }));
}
