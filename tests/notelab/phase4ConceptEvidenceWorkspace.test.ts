import {
  buildCanonicalTextbookEvidence,
  buildRecallMaterialPreview,
  buildRelatedConceptPreviews,
  selectCurrentPageFocusId,
  selectEvidenceForConcept,
  selectProfessorSnapshots,
  studyModelMatchesPage,
  type NoteLabPageIdentity,
} from "@/lib/notelab/conceptEvidenceWorkspace";
import { learningSourceMatchesPageIdentity } from "@/lib/learningHub/learningSourceStore";
import type { GroundedSurgeonAnnotation } from "@/lib/highlights/groundSurgeonQuotes";
import type { KnowledgeNode } from "@/lib/knowledge/knowledgeGraphSchema";
import type { WhiteboardLessonSnapshot } from "@/lib/knowledge/whiteboardLessonSnapshotStore";

const identity: NoteLabPageIdentity = {
  documentId: "resolved-doc-a",
  pageNumber: 12,
  pageTruthKey: "resolved-doc-a::12::t",
};

function grounded(text: string, originalIndex = 0): GroundedSurgeonAnnotation {
  return {
    canonicalType: "mechanism",
    exactQuote: text,
    groundedText: text,
    reason: "Explains the causal sequence",
    importance: "critical",
    treatment: "mechanismBrace",
    spanScope: "fullSentence",
    groundingState: "exact",
    confidence: 1,
    originalIndex,
  };
}

function snapshot(overrides: Partial<WhiteboardLessonSnapshot> = {}): WhiteboardLessonSnapshot {
  return {
    lessonId: "lesson-current",
    documentId: identity.documentId,
    pageNumber: identity.pageNumber,
    pageTruthKey: identity.pageTruthKey,
    conceptIds: [],
    thoughtUnitIds: ["surgeon-resolved-doc-a-12-0"],
    visualGrammar: "flow",
    professorPlanVersion: 1,
    sceneGraphVersion: "vsg-1",
    teachingSteps: [{
      stepId: 0,
      label: "Pressure creates retention",
      narration: "First connect pressure to the seal.",
      misconceptionLabel: "Retention is only adhesion",
    }],
    createdAt: "2026-08-10T12:00:00.000Z",
    ...overrides,
  };
}

describe("Phase 4 NoteLab canonical evidence", () => {
  it("builds stable Surgeon evidence under the resolved document/page identity", () => {
    const result = buildCanonicalTextbookEvidence({
      identity,
      surgeonPageTruthKey: identity.pageTruthKey,
      groundedAnnotations: [grounded("Exact textbook sentence.")],
    });

    expect(result).toEqual([expect.objectContaining({
      id: "surgeon-resolved-doc-a-12-0",
      documentId: identity.documentId,
      pageNumber: 12,
      pageTruthKey: identity.pageTruthKey,
      exactText: "Exact textbook sentence.",
      confidence: 1,
    })]);
  });

  it("rejects Surgeon output from an older text truth instead of re-keying it", () => {
    expect(buildCanonicalTextbookEvidence({
      identity,
      surgeonPageTruthKey: "resolved-doc-a::12::old",
      groundedAnnotations: [grounded("Stale sentence.")],
    })).toEqual([]);
  });

  it("focuses an exact canonical Thought Unit but ignores an unrelated stale focus id", () => {
    const evidence = buildCanonicalTextbookEvidence({
      identity,
      surgeonPageTruthKey: identity.pageTruthKey,
      groundedAnnotations: [grounded("One."), grounded("Two.", 1)],
    });
    expect(selectEvidenceForConcept(evidence, evidence[1].id)).toEqual([evidence[1]]);
    expect(selectEvidenceForConcept(evidence, "stale-focus")).toEqual(evidence);
  });

  it("drops a global reading-focus id unless a current-page artifact proves it belongs", () => {
    const evidence = buildCanonicalTextbookEvidence({
      identity,
      surgeonPageTruthKey: identity.pageTruthKey,
      groundedAnnotations: [grounded("Current concept.")],
    });
    expect(selectCurrentPageFocusId({
      focusedUnitId: evidence[0].id,
      evidence,
      studyModel: null,
      knowledgeNodes: [],
      pageNumber: 12,
    })).toBe(evidence[0].id);
    expect(selectCurrentPageFocusId({
      focusedUnitId: "previous-page-unit",
      evidence,
      studyModel: null,
      knowledgeNodes: [],
      pageNumber: 12,
    })).toBeNull();
  });
});

describe("Phase 4 NoteLab exact page reuse", () => {
  it("keeps only Professor snapshots matching document, page, and pageTruthKey", () => {
    const current = snapshot();
    const wrongDocument = snapshot({ lessonId: "wrong-doc", documentId: "resolved-doc-b" });
    const wrongPage = snapshot({ lessonId: "wrong-page", pageNumber: 13 });
    const oldTruth = snapshot({ lessonId: "old-truth", pageTruthKey: "resolved-doc-a::12::old" });

    expect(selectProfessorSnapshots([wrongDocument, oldTruth, current, wrongPage], identity))
      .toEqual([current]);
  });

  it("derives explain-back and misconception repair from the saved snapshot without an API call", () => {
    expect(buildRecallMaterialPreview({ snapshots: [snapshot()] })).toEqual([
      expect.objectContaining({ kind: "explain-back", sourceSnapshotId: "lesson-current" }),
      expect.objectContaining({ kind: "misconception-repair", sourceSnapshotId: "lesson-current" }),
    ]);
  });

  it("requires the current study model's exact pageTruthKey", () => {
    const currentModel = { page: 12, pageTruthKey: identity.pageTruthKey } as any;
    const legacyModel = { page: 12 } as any;
    const staleModel = { page: 12, pageTruthKey: "resolved-doc-a::12::old" } as any;
    expect(studyModelMatchesPage(currentModel, identity)).toBe(true);
    expect(studyModelMatchesPage(legacyModel, identity)).toBe(false);
    expect(studyModelMatchesPage(staleModel, identity)).toBe(false);
  });

  it("rejects legacy, filename-only, page-only, and stale supplemental sources", () => {
    expect(learningSourceMatchesPageIdentity({
      documentId: identity.documentId,
      pageNumber: identity.pageNumber,
      pageTruthKey: identity.pageTruthKey,
    }, identity)).toBe(true);
    expect(learningSourceMatchesPageIdentity({ pageNumber: identity.pageNumber }, identity)).toBe(false);
    expect(learningSourceMatchesPageIdentity({
      documentId: identity.documentId,
      pageNumber: identity.pageNumber,
      pageTruthKey: "resolved-doc-a::12::old",
    }, identity)).toBe(false);
  });
});

describe("Phase 4 NoteLab related concepts", () => {
  const node = (overrides: Partial<KnowledgeNode>): KnowledgeNode => ({
    id: "node-a",
    documentId: identity.documentId,
    bookId: "display-name.pdf",
    chapterCandidateId: null,
    canonicalAnchorId: "surgeon-resolved-doc-a-12-0",
    title: "Retention",
    summary: "",
    exactSourceText: "",
    sourcePages: [12],
    citations: [],
    profileId: "default",
    role: "Core Concept",
    importance: 90,
    difficulty: 50,
    parentNodeIds: [],
    childNodeIds: [],
    relatedNodeIds: [],
    learningObjectives: [],
    misconceptions: [],
    examples: [],
    applications: [],
    ...overrides,
  });

  it("prefers direct Knowledge Graph relationships", () => {
    const focused = node({ relatedNodeIds: ["node-b"] });
    const related = node({ id: "node-b", canonicalAnchorId: "anchor-b", title: "Surface tension", sourcePages: [15] });
    expect(buildRelatedConceptPreviews([focused, related], focused.canonicalAnchorId, 12))
      .toEqual([expect.objectContaining({ id: "node-b", relationship: "related" })]);
  });
});
