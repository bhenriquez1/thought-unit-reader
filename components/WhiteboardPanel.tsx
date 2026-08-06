// components/WhiteboardPanel.tsx
"use client";

import React, { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { buildNoteFromStudyModel, saveUltraNote } from "@/lib/notelab/ultraNoteStore";
import { buildRecallSetFromNote, saveRecallSet } from "@/lib/recalllab/recallStore";
import { saveStudyGuide } from "@/lib/studyguide/studyGuideStore";
import type { StudyGuideRecord } from "@/lib/studyguide/types";
import dynamic from "next/dynamic";
const TldrawCanvas = dynamic(() => import("@/components/whiteboard/TldrawCanvas"), { ssr: false });
import type { NoteCard } from "@/lib/insights/synthesizeTeachingOutput";
import type { CurrentPageStudyModel } from "@/lib/insights/currentPageStudyModel";
import { deriveNoteCardsFromStudyModel } from "@/lib/notelab/deriveNoteCards";
import {
  computeVSGState, noteCardsToCanonicalEntries, pageRoleToWhiteboardGrammar,
  type VSGState,
} from "@/lib/whiteboard/visualSceneGraph";
import type { CanonicalEntryInput } from "@/lib/whiteboard/canonicalRelationshipGraph";

// SOLE Whiteboard rendering pipeline: Current Page -> Professor Lesson
// Planner (TldrawCanvas + useProfessorLesson) -> tldraw Lesson -> Render.
// This panel used to also run a second, independent pipeline — a
// /api/whiteboard-explain "diagram" call plus a separate /api/whiteboard-image
// AI-illustration call, both feeding the legacy <Whiteboard> slideshow
// component. That machinery is retired: it produced a second, inconsistent
// visual for the same page, could auto-trigger on mount, and gave the
// NoteLab/Recall/StudyGuide save buttons below a fake sense of readiness
// (enabled once the OLD pipeline finished, independent of whether the real
// Whiteboard had actually taught anything). Nothing here calls OpenAI or any
// other AI endpoint directly — this component only assembles a
// VisualSceneGraph from already-computed page content and hands it to
// TldrawCanvas, exactly like SurgeonAnnotationPlan's highlight overlay.

const DEV = process.env.NODE_ENV === "development";

type Props = {
  concept: string;
  context: string;
  lessonTitle?: string;

  currentPage?: number;
  /** The app's real page-identity key (lib/useActivePageIntelligence.ts) —
   *  every Professor Lesson Planner request/response is tied to this, exactly
   *  like the Surgeon Annotation pipeline. Falls back to a bookId::page
   *  synthetic key when not provided (e.g. older call sites). */
  pageTruthKey?: string;

  /** Full study model — the page's shared understanding object. Source of
   *  truth for the save-to-NoteLab/Recall/StudyGuide actions below. */
  studyModel?: Record<string, unknown> | null;
  /** Raw page text top-to-bottom — currently unused here, kept for callers
   *  that still pass it (harmless). */
  pageText?: string;

  /** Level 4 sync: called when the active Whiteboard step changes (fires with evidenceRefId or null) */
  onAnchorStep?: (anchorId: string | null) => void;
  /** Level 4 sync: when set, Whiteboard jumps to the step whose evidenceRefId matches */
  activeAnchorId?: string | null;

  /** Metadata for save actions */
  bookId?: string;
  bookTitle?: string;
  pageTitle?: string | null;
  knowledgeNodeId?: string | null;
  /** Preferred layout grammar from the active annotation pack — drives whiteboard layout selection.
   *  "anatomy" → hub-spoke; "case-map" → hub-spoke; "timeline" / "pathway" / "worked-solution" → flow.
   *  Overridden by pageTeachingType when that's available — see below. */
  whiteboardGrammar?: string;
  /**
   * The current page's classifier value — SurgeonAnnotationPlan.pageRole
   * (lib/insights/pageAnnotationPlan.ts), decided fresh from THIS page by
   * the same pipeline that drives highlight selection. When present, this
   * (via pageRoleToWhiteboardGrammar) picks the Whiteboard's teaching
   * grammar INSTEAD of the static per-book whiteboardGrammar prop above —
   * "what kind of page is this?" answered from the page's own content, not
   * a book-wide setting.
   */
  pageTeachingType?: string | null;
  /**
   * Canonical thought units for this page.
   * When provided, the VSG is built directly from these; otherwise the panel
   * falls back to deriving them from noteCards in the study model.
   */
  canonicalEntries?: CanonicalEntryInput[];
  /** Opens Chief Resident modal for the current page — wires the "🩺 Teach" button. */
  onOpenChiefResident?: () => void;
};

export default function WhiteboardPanel({
  concept,
  context,
  lessonTitle = "Whiteboard Lesson",

  currentPage,
  pageTruthKey,
  studyModel,
  onAnchorStep,
  activeAnchorId,
  bookId,
  bookTitle,
  pageTitle,
  knowledgeNodeId,
  whiteboardGrammar,
  pageTeachingType,
  canonicalEntries,
  onOpenChiefResident,
}: Props) {
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const teachNoteCards = useMemo((): NoteCard[] => {
    const sm = studyModel as any;
    if (!sm) return [];
    if (Array.isArray(sm.noteCards) && sm.noteCards.length > 0) return sm.noteCards as NoteCard[];
    try { return deriveNoteCardsFromStudyModel(sm as CurrentPageStudyModel); } catch { return []; }
  }, [studyModel]);

  // "What kind of page is this?" — decided fresh from the current page by
  // the same classifier that shapes highlight selection (pageRole), not a
  // static per-book setting. Falls back to the book-level whiteboardGrammar
  // prop only when no page classification is available yet.
  const effectiveGrammar = useMemo(
    () => (pageTeachingType ? pageRoleToWhiteboardGrammar(pageTeachingType) : (whiteboardGrammar ?? "flow")),
    [pageTeachingType, whiteboardGrammar],
  );

  const vsgState = useMemo((): VSGState => {
    const entries =
      canonicalEntries && canonicalEntries.length > 0
        ? canonicalEntries
        : noteCardsToCanonicalEntries(teachNoteCards);
    return computeVSGState(entries, effectiveGrammar, {
      pageNumber: currentPage,
    });
  }, [canonicalEntries, teachNoteCards, effectiveGrammar, currentPage]);

  // Stable key for tldraw's own IndexedDB canvas persistence — keyed by
  // pageTruthKey (documentId + pageNumber + text-ready flag), not just
  // bookId + pageNumber. A re-extraction that produces different text for
  // the SAME page slot changes pageTruthKey, so it gets a genuinely
  // distinct persistence key instead of silently sharing storage with
  // whatever was cached under the old extraction. (clearTeachingLayer's
  // unconditional clear on every mount/lessonPlan change already prevents
  // stale shapes from ever being visible even without this — this closes
  // the gap at the storage-key level too, not just the render level.)
  // Falls back to the same bookId::pageNumber synthetic key already used
  // for the pageTruthKey prop below when a real pageTruthKey isn't passed.
  const effectivePageTruthKey = pageTruthKey ?? (bookId && currentPage != null ? `${bookId}::${currentPage}` : undefined);
  const canvasStorageKey = bookId && effectivePageTruthKey
    ? `${bookId}_${effectivePageTruthKey}`
    : undefined;

  const [isOpen, setIsOpen] = useState(true);

  const flashAction = (msg: string) => {
    setActionMessage(msg);
    window.setTimeout(() => setActionMessage(null), 2200);
  };

  const effectiveTopic = (studyModel as any)?.pageThesis || pageTitle || lessonTitle;

  /** Save to NoteLab — reuses the existing ultraNoteStore save path, sourced
   *  from studyModel (the shared page-understanding object), never from a
   *  retired diagram-specific plan. */
  const handleSaveToNoteLab = async () => {
    if (!studyModel) return;
    try {
      const note = buildNoteFromStudyModel(studyModel as any, {
        bookId: bookId ?? "book",
        pageNumber: currentPage ?? 0,
        topic: effectiveTopic,
        bookTitle,
      });
      await saveUltraNote(note);
      flashAction("✅ Saved to NoteLab");
    } catch (err) {
      console.error("[WHITEBOARD_SAVE_NOTELAB_ERROR]", err);
      flashAction("⚠ Could not save to NoteLab");
    }
  };

  /** Create Recall Card — reuses the existing recallStore save path. */
  const handleCreateRecallCard = async () => {
    if (!studyModel) return;
    try {
      const note = buildNoteFromStudyModel(studyModel as any, {
        bookId: bookId ?? "book",
        pageNumber: currentPage ?? 0,
        topic: effectiveTopic,
        bookTitle,
      });
      const set = buildRecallSetFromNote(note);
      await saveRecallSet(set);
      flashAction("✅ Recall card created");
    } catch (err) {
      console.error("[WHITEBOARD_RECALL_CARD_ERROR]", err);
      flashAction("⚠ Could not create recall card");
    }
  };

  /** Add to Study Guide — built directly from studyModel's conceptBlocks/
   *  studyNotes, the same shared page-understanding object every other
   *  Whiteboard/NoteLab/Recall feature reads from. */
  const handleAddToStudyGuide = async () => {
    const sm = studyModel as unknown as CurrentPageStudyModel | null;
    if (!sm) return;
    try {
      const record: StudyGuideRecord = {
        id: `sg-${bookId ?? "book"}-${currentPage ?? "p"}-${Date.now()}`,
        bookId: bookId ?? "book",
        mode: "visual",
        chapterTitle: effectiveTopic,
        topic: effectiveTopic,
        priority: "Medium",
        mustKnow: [],
        datFacts: [],
        mechanisms: (sm.conceptBlocks ?? [])
          .filter(b => b.mechanism)
          .map(b => ({ title: b.title, steps: [b.mechanism as string] })),
        traps: (sm.conceptBlocks ?? []).filter(b => b.trap).map(b => b.trap as string),
        recallQuestions: [],
        memoryHooks: sm.studyNotes?.quickMemory ? [sm.studyNotes.quickMemory] : [],
        dailyTasks: [],
        sourceLabels: ["Whiteboard"],
        createdAt: Date.now(),
      };
      await saveStudyGuide(record);
      flashAction("✅ Saved to Study Sheet");
    } catch (err) {
      console.error("[WHITEBOARD_STUDYGUIDE_ERROR]", err);
      flashAction("⚠ Could not save to Study Sheet");
    }
  };

  DEV && console.log("[WHITEBOARD_PANEL_RENDER]", { page: currentPage ?? null, hasStudyModel: !!studyModel, vsgStatus: vsgState.status });

  return (
    <AnimatePresence initial={false}>
      {isOpen && (
        <motion.aside
          key="wb-panel"
          initial={{ x: 24, opacity: 0, scale: 0.98 }}
          animate={{ x: 0, opacity: 1, scale: 1 }}
          exit={{ x: 24, opacity: 0, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 260, damping: 24 }}
          className="flex flex-col gap-3"
        >
          {/* ── Interactive canvas — the ONLY rendering pipeline ──────────────
              Current Page -> Professor Lesson Planner -> tldraw Lesson -> Render.
              TldrawCanvas owns its own Play/Pause/Previous/Next/Restart controls
              and its own no-fallback failure state (clean retry, never stale
              content from another page); nothing here substitutes for that. */}
          {vsgState.status === "empty" ? (
            <div style={{ padding: "24px 16px", textAlign: "center", color: "#64748b", fontSize: 13 }}>
              {vsgState.reason}
            </div>
          ) : (
            <div style={{ position: "relative" }}>
              {vsgState.status === "error" && (
                <div style={{ padding: "6px 12px", background: "rgba(239,68,68,0.1)", borderBottom: "1px solid rgba(239,68,68,0.2)", fontSize: 11, color: "#fca5a5" }}>
                  Diagram engine error — showing basic canvas. {vsgState.error}
                </div>
              )}
              <div style={{ height: 520 }}>
                <TldrawCanvas
                  noteCards={teachNoteCards}
                  pageTitle={(studyModel as any)?.pageThesis ?? lessonTitle ?? null}
                  onAnchorClick={onAnchorStep ?? undefined}
                  activeAnchorId={activeAnchorId}
                  whiteboardGrammar={effectiveGrammar}
                  vsg={vsgState.status === "ready" ? vsgState.vsg : undefined}
                  storageKey={canvasStorageKey}
                  documentId={bookId}
                  pageTruthKey={effectivePageTruthKey}
                  activeCanonicalUnitId={knowledgeNodeId ?? null}
                  pageTeachingType={pageTeachingType ?? null}
                />
              </div>
            </div>
          )}

          {/* ── Bottom actions ─────────────────────────────────────────────── */}
          <div className="flex items-center gap-2 flex-wrap border-t border-gray-800 pt-2">
            <button onClick={handleSaveToNoteLab} disabled={!studyModel} className="text-xs px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-40">
              📓 Save to NoteLab
            </button>
            <button onClick={handleCreateRecallCard} disabled={!studyModel} className="text-xs px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-40">
              🧠 Create Recall Card
            </button>
            <button onClick={handleAddToStudyGuide} disabled={!studyModel} className="text-xs px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-40">
              📚 Save to Study Sheet
            </button>
            {onOpenChiefResident && (
              <button onClick={onOpenChiefResident} className="text-xs px-2 py-1 rounded bg-gray-800 hover:bg-gray-700">
                🩺 Teach
              </button>
            )}
            <button onClick={() => setIsOpen(false)} className="ml-auto text-xs px-2 py-1 rounded bg-gray-800 hover:bg-gray-700">
              ✖
            </button>
            {actionMessage && <span className="text-xs text-emerald-300">{actionMessage}</span>}
          </div>
        </motion.aside>
      )}

      {/* Collapsed launcher */}
      {!isOpen && (
        <motion.button
          key="wb-open"
          initial={{ x: 12, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 12, opacity: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 24 }}
          onClick={() => setIsOpen(true)}
          className="self-end text-xs bg-yellow-500 text-black px-3 py-1 rounded shadow"
          title="Show whiteboard"
        >
          ✨ Whiteboard
        </motion.button>
      )}
    </AnimatePresence>
  );
}
