// lib/knowledge/whiteboardLessonSnapshotStore.ts
// Phase B3-3 — persistence for the REUSABLE, SEMANTIC Whiteboard lesson (not
// just a rasterized image). Recall/NoteLab can later reuse this to replay
// the exact same taught lesson as a recall cue, without regenerating it or
// falling back to a flat picture.
//
// Identity discipline, mirroring knowledgeGraphStore.ts:
//   - lessonId is ALWAYS buildProfessorLessonCacheKey({documentId, pageTruthKey,
//     activeCanonicalUnitId}) — see lib/whiteboard/professorLessonPlan.ts. This
//     is a pure function of the RESOLVED, collision-resistant documentId (see
//     lib/insights/resolveDocumentIdentity.ts), never the filename-derived
//     bookId — two different PDFs sharing a filename must never collide here,
//     the same guarantee the Knowledge Graph itself already makes.
//   - saveWhiteboardLessonSnapshot re-checks identity against a live getter
//     (not just the identity closed over when the save was scheduled) right
//     before writing — a save triggered by a lesson completing must not land
//     if the learner has already navigated to a different document/page by
//     the time the async write actually runs.
//   - getWhiteboardLessonSnapshot double-checks the loaded record's own
//     documentId against the documentId being asked for, even though a
//     lessonId collision across documents should already be near-impossible
//     by construction — defense in depth, not the primary guarantee.

import type { ProfessorLessonPlan, Bounds, Point, RelationshipKind } from "@/lib/whiteboard/professorLessonPlan";
import {
  totalTeachingSteps, stepStartIndex, stepEndIndex, stepMisconceptionLabel,
} from "@/lib/whiteboard/professorTimelineEngine";

// ── Types ─────────────────────────────────────────────────────────────────

// C4 (Phase 0 audit) — a step used to reduce to lossy text (label + a
// flattened narration string), discarding every draw-shape/draw-arrow
// action's actual geometry. That was enough to build a text flashcard
// ("Reconstruct Professor step N") but not enough to build a real Visual
// Recall task — hiding one node, removing one arrow, or reconstructing the
// diagram from memory all need to know WHICH shapes/arrows existed and
// where. shapes/labels/arrows below are the minimum structured data that
// preserves; a snapshot's teachingSteps are still lossy relative to the
// full ProfessorLessonPlan (no freehand strokes, no emphasize/camera
// choreography, no timing) — this captures exactly what a static replay-
// and-occlude task needs, not a full lesson re-render.

export interface TeachingStepShape {
  shapeId: string;
  targetId?: string;
  kind: "circle" | "box" | "brace" | "line" | "diamond" | "hexagon" | "cloud";
  bounds: Bounds;
}

export interface TeachingStepLabel {
  shapeId: string;
  targetId?: string;
  text: string;
  x: number;
  y: number;
}

export interface TeachingStepArrow {
  shapeId: string;
  targetId?: string;
  from: Point;
  to: Point;
  relationshipKind?: RelationshipKind;
}

export interface TeachingStepSummary {
  stepId: number;
  /** Short label for this step — the first `write` action's text in range,
   *  falling back to a generic ordinal label if the step drew nothing. */
  label: string;
  /** All `speak` narration text for this step, concatenated in order. */
  narration: string;
  /** Present only when this step's emphasize treatment was "crossOut" — see
   *  stepMisconceptionLabel in professorTimelineEngine.ts. */
  misconceptionLabel: string | null;
  // Optional, same reasoning as every other incrementally-added field in
  // this codebase (UltraNote's documentId/pageTruthKey, KnowledgeNode's KG
  // refs): snapshots saved before this fix genuinely don't have geometry
  // data, and marking these required would misrepresent that — a caller
  // building a Visual Recall task must treat an absent/empty array as "no
  // occlusion task possible for this step," not assume it's always there.
  /** Every shape (node) this step drew, with its real bounds — enough to
   *  render and selectively hide/reveal it in a replay-and-occlude task. */
  shapes?: TeachingStepShape[];
  /** Every write action this step drew, i.e. every label on the canvas —
   *  the full set, not just the first one label above summarizes. */
  labels?: TeachingStepLabel[];
  /** Every arrow this step drew, with its endpoints and relationship kind
   *  (when the lesson script supplied one) — enough to hide/remove or
   *  reconstruct a specific connection. */
  arrows?: TeachingStepArrow[];
}

export interface WhiteboardLessonSnapshot {
  lessonId: string;
  documentId: string;
  pageNumber: number | null;
  pageTruthKey: string;
  conceptIds: string[];
  thoughtUnitIds: string[];
  visualGrammar: string;
  professorPlanVersion: number;
  /** VisualSceneGraph content-hash identity this lesson was built from — see
   *  ProfessorLessonSourceSnapshot.vsgId in professorLessonPlan.ts. Reusing
   *  that existing content-identity mechanism rather than inventing a
   *  parallel "version number" for the same concept. */
  sceneGraphVersion: string;
  teachingSteps: TeachingStepSummary[];
  createdAt: string;
}

export interface WhiteboardLessonIdentity {
  documentId: string;
  pageTruthKey: string;
}

// ── Pure identity predicates ─────────────────────────────────────────────────
// Extracted so both can be verified with plain unit tests, independent of IDB
// (this repo's jest config runs testEnvironment:"node" with no IndexedDB
// polyfill — see tests/canonical/surgeonAnnotationPlanStore.test.ts's header
// comment for the established precedent). Each guards a DIFFERENT moment in
// the lifecycle: identityMatches guards the SAVE (is the identity captured
// when a lesson finished still the current one at write time?);
// snapshotBelongsToDocument guards the LOAD (does a record fetched by
// lessonId actually belong to the document asking for it?).

/** True when `current` (read live, at save time) still matches the identity
 *  the snapshot itself was built under. False means the learner has since
 *  navigated to a different document/page — the save must be rejected, not
 *  silently reattached to whatever is now current. */
export function identityMatches(
  snapshot: Pick<WhiteboardLessonSnapshot, "documentId" | "pageTruthKey">,
  current: WhiteboardLessonIdentity,
): boolean {
  return current.documentId === snapshot.documentId && current.pageTruthKey === snapshot.pageTruthKey;
}

/** True when a loaded record's own documentId matches the documentId being
 *  asked for. Defense in depth against a lessonId collision (documentId is
 *  already baked into buildProfessorLessonCacheKey, making a real collision
 *  across two different documents extremely unlikely) ever letting one
 *  document's saved lesson attach to a different document's progress. */
export function snapshotBelongsToDocument(
  snapshot: Pick<WhiteboardLessonSnapshot, "documentId">,
  documentId: string,
): boolean {
  return snapshot.documentId === documentId;
}

// ── Build the summary from a real ProfessorLessonPlan ───────────────────────

export function buildTeachingStepsSummary(plan: ProfessorLessonPlan): TeachingStepSummary[] {
  const steps: TeachingStepSummary[] = [];
  const total = totalTeachingSteps(plan.actions);
  for (let stepId = 0; stepId < total; stepId++) {
    const start = stepStartIndex(plan.actions, stepId);
    const end = stepEndIndex(plan.actions, stepId);
    if (start < 0) continue;
    const stepActions = plan.actions.slice(start, end + 1);
    const firstWrite = stepActions.find(a => a.type === "write");
    const narration = stepActions
      .filter(a => a.type === "speak")
      .map(a => (a.type === "speak" ? a.text : ""))
      .join(" ")
      .trim();
    const shapes: TeachingStepShape[] = stepActions
      .filter((a): a is Extract<typeof a, { type: "draw-shape" }> => a.type === "draw-shape")
      .map(a => ({ shapeId: a.shapeId, targetId: a.targetId, kind: a.shape, bounds: a.bounds }));
    const labels: TeachingStepLabel[] = stepActions
      .filter((a): a is Extract<typeof a, { type: "write" }> => a.type === "write")
      .map(a => ({ shapeId: a.shapeId, targetId: a.targetId, text: a.text, x: a.x, y: a.y }));
    const arrows: TeachingStepArrow[] = stepActions
      .filter((a): a is Extract<typeof a, { type: "draw-arrow" }> => a.type === "draw-arrow")
      .map(a => ({ shapeId: a.shapeId, targetId: a.targetId, from: a.from, to: a.to, relationshipKind: a.relationshipKind }));
    steps.push({
      stepId,
      label: firstWrite && firstWrite.type === "write" ? firstWrite.text : `Step ${stepId + 1}`,
      narration,
      misconceptionLabel: stepMisconceptionLabel(plan.actions, stepId),
      shapes,
      labels,
      arrows,
    });
  }
  return steps;
}

export function buildWhiteboardLessonSnapshot(params: {
  lessonId: string;
  documentId: string;
  pageNumber: number | null;
  pageTruthKey: string;
  conceptIds: string[];
  thoughtUnitIds: string[];
  plan: ProfessorLessonPlan;
  createdAt: string;
}): WhiteboardLessonSnapshot {
  const { lessonId, documentId, pageNumber, pageTruthKey, conceptIds, thoughtUnitIds, plan, createdAt } = params;
  return {
    lessonId,
    documentId,
    pageNumber,
    pageTruthKey,
    conceptIds,
    thoughtUnitIds,
    visualGrammar: plan.visualGrammar,
    professorPlanVersion: plan.sourceSnapshot.plannerVersion,
    sceneGraphVersion: plan.sourceSnapshot.vsgId,
    teachingSteps: buildTeachingStepsSummary(plan),
    createdAt,
  };
}

// ── IDB persistence ──────────────────────────────────────────────────────────

const IDB_NAME    = "avrrio_whiteboard_lessons_v1";
const IDB_VERSION = 1;
const STORE_NAME   = "lessons";

function openLessonSnapshotIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("IDB unavailable")); return; }
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "lessonId" });
        store.createIndex("documentId", "documentId", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
    req.onblocked = () => reject(new Error("IDB blocked — close other tabs"));
  });
}

/** Saves a lesson snapshot, but only if `getCurrentIdentity()` — evaluated at
 *  write time, not capture time — still matches the snapshot's own
 *  documentId/pageTruthKey. Guards the real race: the learner may have
 *  navigated to a different document/page between the moment a lesson
 *  finished (when this save was scheduled) and the moment this async write
 *  actually runs. A stale write is silently rejected, never partially
 *  applied. */
export async function saveWhiteboardLessonSnapshot(
  snapshot: WhiteboardLessonSnapshot,
  getCurrentIdentity: () => WhiteboardLessonIdentity,
): Promise<{ saved: boolean; reason?: string }> {
  if (!identityMatches(snapshot, getCurrentIdentity())) {
    return { saved: false, reason: "stale-identity" };
  }
  const db = await openLessonSnapshotIDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(snapshot);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
  return { saved: true };
}

/** Loads a snapshot by lessonId, refusing to return it if the record's own
 *  documentId doesn't match the documentId being asked for — defense in
 *  depth against a lessonId collision ever letting one document's saved
 *  lesson attach to a different document's KnowledgeNodeProgress. */
export async function getWhiteboardLessonSnapshot(
  lessonId: string,
  documentId: string,
): Promise<WhiteboardLessonSnapshot | null> {
  const db = await openLessonSnapshotIDB();
  const record = await new Promise<WhiteboardLessonSnapshot | null>((resolve, reject) => {
    const tx  = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(lessonId);
    req.onsuccess = () => resolve((req.result as WhiteboardLessonSnapshot) ?? null);
    req.onerror   = () => reject(req.error);
  });
  if (!record) return null;
  if (!snapshotBelongsToDocument(record, documentId)) return null;
  return record;
}

export async function getWhiteboardLessonSnapshotsByDocument(documentId: string): Promise<WhiteboardLessonSnapshot[]> {
  const db = await openLessonSnapshotIDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).index("documentId").getAll(documentId);
    req.onsuccess = () => resolve((req.result as WhiteboardLessonSnapshot[]) ?? []);
    req.onerror   = () => reject(req.error);
  });
}
