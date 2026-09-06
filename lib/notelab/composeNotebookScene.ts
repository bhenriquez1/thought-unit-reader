// lib/notelab/composeNotebookScene.ts
// L13 (NoteLab visual-execution correction) — composeNoteNotebookSceneInBackground
// used to live as a local function inside components/reader/RightPanel.tsx's
// GenerateNoteButton closure, reachable only from the initial "Generate Ultra
// Note" save. Brian's report asked for an explicit Retry action when
// composition fails or a note is stuck showing "Nothing composed here yet"
// — that means components/notelab/UltraNotesList.tsx (a different component)
// needs to call the exact same composition logic, not a second, drifting
// copy of it. Lifted here, unchanged in behavior, so both callers share one
// implementation.
//
// Also the origin of UltraNote.notebookSceneStatus's four values: every
// branch below sets it before returning, so a note's status always reflects
// what actually happened on its most recent composition attempt.

import {
  saveUltraNote, getNotesByBookAsync, isUltraNotePersisted, type UltraNote,
} from "./ultraNoteStore";
import { requestNotebookPlan, finalizeNotebookScene, summarizeExistingNotebookScene } from "./notebookPlanner";
import { runNotebookDesignerStep } from "./notebookDesignerAgent";
import { gatherConceptNotebookContent } from "./conceptAccumulation";
import { mergeDeterministicContentIntoScene } from "./deterministicNotebookBlocks";
import { getCanonicalUnitsByPage } from "@/lib/canonical/store";
import { recordLearningEvent } from "@/lib/knowledge/recordLearningEvent";

function recordNoteLabExposure(note: UltraNote) {
  if (!note.knowledgeNodeId || !note.documentId) return;
  recordLearningEvent(
    note.knowledgeNodeId, note.documentId,
    { kind: "exposure", sourceType: "notelab", occurredAt: new Date().toISOString(), sourceId: note.id },
    note.pageTruthKey,
  ).catch((err) => console.error("[NOTELAB_EXPOSURE_RECORD_ERROR]", { noteId: note.id, err: err instanceof Error ? err.message : String(err) }));
}

/** Shared by both the "no canonical units" branch and the AI-failure
 *  fallback below: recompute the note's deterministic (student/derived)
 *  blocks and persist them as its notebookScene — but only when there's
 *  actually something to show. A note with no studentNotes and no
 *  resolvable Study Page sections stays without a notebookScene, status
 *  "empty" rather than "ready", so UltraNotesList.tsx's genuinely-empty
 *  copy stays accurate instead of claiming a blank Visual Notebook exists. */
async function saveDeterministicNotebookScene(
  note: UltraNote, bookId: string, pageNumber: number, extra: Partial<UltraNote> = {},
) {
  const scene = mergeDeterministicContentIntoScene(note.notebookScene ?? null, note, { bookId, pageNumber });
  if (scene.blocks.length === 0) {
    await saveUltraNote({ ...note, ...extra, notebookSceneStatus: "empty" });
    return;
  }
  await saveUltraNote({ ...note, ...extra, notebookScene: scene, notebookSceneStatus: "ready" });
}

/** P3 — the general "Generate Ultra Note" save path's own notebookScene
 *  synthesis, modeled on WhiteboardPanel.tsx's composeNotebookSceneInBackground.
 *  Simpler than that one: there's no taught lesson here to extract narration
 *  from or fall back to recomposing, so with zero canonical units to ground
 *  a synthesis in, the note falls to its own deterministic content (student
 *  notes + migrated Study Page sections) — real content, never invented.
 *
 *  Called both right after a fresh save (RightPanel.tsx, unawaited — "save
 *  fast, compose later") and from UltraNotesList.tsx's Retry action on an
 *  existing note whose last attempt is "failed" or "empty". Either caller
 *  should set notebookSceneStatus: "pending" on the note BEFORE calling this,
 *  so the UI shows "composing" rather than the stale prior state while this
 *  runs. */
export async function composeNoteNotebookSceneInBackground(savedNote: UltraNote, documentId: string) {
  try {
    const units = await getCanonicalUnitsByPage(documentId, savedNote.pageNumber - 1);

    const existingNotes = await getNotesByBookAsync(savedNote.bookId);
    const existingNote = existingNotes.find((n) => n.pageNumber === savedNote.pageNumber) ?? savedNote;

    if (units.length === 0) {
      // Correction (Study Page migration) — zero canonical units means no
      // AI synthesis can run (nothing to ground it in), but the student's
      // own notes and the deterministic Study Page sections (Big Idea/Key
      // Facts/etc. — the same reorganization getCanonicalNotebookSections
      // already performs) are real content that must still render as a
      // notebook, never vanish silently for lack of an AI call.
      await saveDeterministicNotebookScene(existingNote, savedNote.bookId, savedNote.pageNumber);
      recordNoteLabExposure(existingNote);
      return;
    }

    const relatedConceptKnowledge = savedNote.knowledgeNodeId
      ? await gatherConceptNotebookContent(savedNote.knowledgeNodeId, savedNote.id)
      : null;

    const baseOpts = {
      bookId: savedNote.bookId,
      bookTitle: savedNote.bookTitle,
      pageNumber: savedNote.pageNumber,
      studentNotes: existingNote.studentNotes ?? null,
      existingNotebookSummary: existingNote.notebookScene ? summarizeExistingNotebookScene(existingNote.notebookScene) : null,
      relatedConceptKnowledge,
    };

    // ND1 — the NoteLab Designer Agent's bounded quality check: generate
    // once, and if the result is too thin/ungrounded/text-heavy, generate
    // exactly one more time with concrete corrective feedback. Never more
    // than one retry (see notebookDesignerAgent.ts's own header comment on
    // why — this pipeline's single AI call already runs close to the
    // platform's serverless timeout ceiling).
    const { scene, diagnostic, retried } = await runNotebookDesignerStep({
      generate: async (correctionFeedback) => {
        const plan = await requestNotebookPlan(units, { ...baseOpts, correctionFeedback });
        return { plan, scene: finalizeNotebookScene(plan, units, baseOpts) };
      },
    });
    // Correction (NoteLab pipeline diagnostics) — "Add diagnostics:
    // visualPlanGenerated / visualPrimitiveCount / ... /
    // persistenceSaveSuccess / persistenceLoadSuccess." A thrown error from
    // the designer step lands in the catch below, never silently returning
    // undefined, so reaching this line already proves visualPlanGenerated.
    console.log("[NOTELAB_GENERATE_DIAGNOSTIC]", {
      noteId: savedNote.id, visualPlanGenerated: true, visualPrimitiveCount: scene.blocks.length,
      qualityPassed: diagnostic.passed, rejectReasons: diagnostic.rejectReasons, retried,
    });

    // Correction (Study Page migration) — the AI scene never sees the
    // student's own notes or the note's legacy Study Page fields as
    // renderable primitives, only as prompt context (see
    // buildNotebookPlannerUserPrompt's MULTI-SOURCE CONTEXT section); fold
    // both in as real blocks so the Visual Notebook is the complete "one
    // note," not just its AI-composed portion.
    const mergedScene = mergeDeterministicContentIntoScene(scene, existingNote, {
      bookId: savedNote.bookId, pageNumber: savedNote.pageNumber,
    });

    const latestNotes = await getNotesByBookAsync(savedNote.bookId);
    const latest = latestNotes.find((n) => n.pageNumber === savedNote.pageNumber) ?? savedNote;
    await saveUltraNote({ ...latest, notebookScene: mergedScene, notebookSceneError: undefined, notebookSceneStatus: "ready" });
    recordNoteLabExposure(latest);

    const persisted = await isUltraNotePersisted(savedNote.id);
    console.log("[NOTELAB_GENERATE_DIAGNOSTIC]", { noteId: savedNote.id, persistenceSaveSuccess: persisted });
  } catch (err) {
    const message = (err as any)?.message ?? String(err);
    console.error("[NOTELAB_GENERATE_BACKGROUND_ERROR]", err);
    // "Show an explicit recoverable error... rather than reverting to the
    // old card view [silently]." Persisted onto the note itself (not just
    // logged) since this background task has no live UI to report to —
    // the next time UltraNotesList reloads this note, it can show the
    // student something went wrong instead of an unexplained blank tab.
    // Even on an AI failure, still fall back to whatever deterministic
    // (student/derived) content the note itself has — "never silently
    // lost" covers a failed synthesis, not only a missing one. Status is
    // always "failed" here regardless of whether that fallback found real
    // content, so Retry stays offered — a partial deterministic scene is
    // not the same as a successful composition.
    try {
      const latestNotes = await getNotesByBookAsync(savedNote.bookId);
      const latest = latestNotes.find((n) => n.pageNumber === savedNote.pageNumber) ?? savedNote;
      const scene = mergeDeterministicContentIntoScene(latest.notebookScene ?? null, latest, {
        bookId: savedNote.bookId, pageNumber: savedNote.pageNumber,
      });
      await saveUltraNote({
        ...latest,
        ...(scene.blocks.length > 0 ? { notebookScene: scene } : {}),
        notebookSceneError: message.slice(0, 200),
        notebookSceneStatus: "failed",
      });
    } catch (persistErr) {
      console.error("[NOTELAB_GENERATE_BACKGROUND_ERROR]", { persistenceSaveSuccess: false, persistErr });
    }
  }
}
