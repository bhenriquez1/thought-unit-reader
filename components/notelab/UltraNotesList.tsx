"use client";
// components/notelab/UltraNotesList.tsx
// Top-student notes — IDB-primary reads, delete confirmation modal, collapsible concepts.

// M6 — this is the default NoteLab view; its own diagnostic logs used to
// fire unconditionally (every render, every delete click) even in
// production, matching no other file's convention in this app. Gated the
// same way WhiteboardPanel.tsx and every other DEV-gated file already does.
const DEV = process.env.NODE_ENV === "development";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  getAllUltraNotesAsync,
  getAllUltraNotes,
  deleteUltraNote,
  saveUltraNote,
  formatUltraNoteText,
  getCanonicalNotebookSections,
  type UltraNote,
  type NoteSubject,
} from "@/lib/notelab/ultraNoteStore";
import { buildRecallSetFromNote, buildRecallSetFromNotebookBlock, saveRecallSet } from "@/lib/recalllab/recallStore";
import type { FinalizedNotebookBlock } from "@/lib/notelab/notebookScene";
import { mergeDeterministicContentIntoScene } from "@/lib/notelab/deterministicNotebookBlocks";
import { useReadingFocusStore } from "@/lib/readingFocus/readingFocusStore";
import { downloadNoteMarkdown, downloadNotePdf, downloadNoteDocx, downloadNotesMarkdown, downloadNotesPdf, downloadNotesDocx } from "@/lib/notelab/exportNote";
import { findRelatedNotes } from "@/lib/notelab/relatedNotes";
import type { NoteCard as NoteCardData } from "@/lib/insights/synthesizeTeachingOutput";
import {
  PROFESSION_MODES,
  getStoredProfessionMode,
  setStoredProfessionMode,
  getSectionLens,
  getProfessorFieldLabel,
  getConceptFieldLabel,
  type ProfessionMode,
} from "@/lib/notelab/professionModes";
import NotebookCanvas from "@/components/notelab/NotebookCanvas";
import KnowledgeNodeBadge from "@/components/knowledge/KnowledgeNodeBadge";
import { useKnowledgeSelectionStore } from "@/lib/knowledge/knowledgeSelectionStore";

interface UltraNotesListProps {
  bookId?: string;
  onNavigateToPage?: (pageNumber: number) => void;
  refreshKey?: number;
  onCardsGenerated?: (setId: string) => void;
  /** "Open in Whiteboard" — draws this note's core idea as a visual diagram.
   *  `card` is set when triggered from an Adaptive Notebook card rather than the note as a whole. */
  onOpenWhiteboard?: (note: UltraNote, card?: NoteCardData) => void;
  /** Adaptive Notebook card's "💬 Explain" action — seeds the Explain This Step panel */
  onExplainCard?: (note: UltraNote, card: NoteCardData) => void;
  /** N4 — a selected object on the persistent tldraw notebook canvas asked
   *  "Ask Professor": seeds Professor Whiteboard with that block's own
   *  content, not the whole note. */
  onAskProfessorAboutBlock?: (note: UltraNote, block: FinalizedNotebookBlock) => void;
  /** Fires whenever a note expands/collapses — lets the NoteLab 3-column shell
   *  bind its left ThoughtUnitNavigator rail to whichever note is open. */
  onActiveNoteChange?: (note: UltraNote | null) => void;
  /** Verbatim text of a left-rail thought unit the user just clicked. */
  focusedAnchorText?: string | null;
  /** When set, auto-expands and scrolls to the note with this knowledgeNodeId. */
  focusedKnowledgeNodeId?: string | null;
}

const TOOL_BTN: React.CSSProperties = {
  padding: "3px 10px",
  borderRadius: 6,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.04)",
  color: "rgba(203,213,225,0.85)",
  fontSize: 11,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap" as const,
};

const SUBJECT_ORDER: NoteSubject[] = [
  "Biology",
  "Calculus",
  "Chemistry",
  "Physics",
  "Computer Science",
  "Law",
  "Nursing / Pharmacology",
  "Dental / Clinical",
  "General Notes",
];

const SUBJECT_ICON: Record<NoteSubject, string> = {
  "Biology":               "🧬",
  "Calculus":              "📐",
  "Chemistry":             "🧪",
  "Physics":               "⚛️",
  "Computer Science":      "💻",
  "Law":                   "⚖️",
  "Nursing / Pharmacology":"💊",
  "Dental / Clinical":     "🦷",
  "General Notes":         "📝",
};

export default function UltraNotesList({ bookId, onNavigateToPage, refreshKey, onCardsGenerated, onOpenWhiteboard, onAskProfessorAboutBlock, onActiveNoteChange, focusedKnowledgeNodeId }: UltraNotesListProps) {
  // Start from LS mirror for instant render; IDB async fills in on mount
  const [notes, setNotes] = useState<UltraNote[]>(() => {
    const all = getAllUltraNotes();
    return bookId ? all.filter((n) => n.bookId === bookId) : all;
  });
  const [expandedId, setExpandedId]       = useState<string | null>(null);
  const [copiedId, setCopiedId]           = useState<string | null>(null);
  const [collapsedSubjects, setCollapsedSubjects] = useState<Set<NoteSubject>>(new Set());
  const [collapsedBooks, setCollapsedBooks]       = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<UltraNote | null>(null);
  const [mode, setMode] = useState<ProfessionMode>(() => getStoredProfessionMode());
  const [highlightedNoteId, setHighlightedNoteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const mountedRef = useRef(true);
  const noteRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const searchRef = useRef<HTMLInputElement>(null);

  function handleModeChange(next: ProfessionMode) {
    setMode(next);
    setStoredProfessionMode(next);
  }

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  const reload = useCallback(async () => {
    try {
      const all = await getAllUltraNotesAsync();
      const filtered = bookId ? all.filter((n) => n.bookId === bookId) : all;
      if (mountedRef.current) {
        setNotes(filtered);
        DEV && console.log("[NOTELAB_RENDER_COUNT]", { total: all.length, filtered: filtered.length, bookId: bookId ?? "all" });
      }
    } catch (e) {
      console.warn("[NOTELAB_RELOAD_FAIL]", String(e));
    }
  }, [bookId]);

  // IDB load on mount
  useEffect(() => { reload(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reload on refreshKey change
  useEffect(() => { reload(); }, [refreshKey, reload]);

  // Listen for saves from other parts of the app
  useEffect(() => {
    const handler = () => { reload(); };
    window.addEventListener("note-lab-updated", handler);
    return () => window.removeEventListener("note-lab-updated", handler);
  }, [reload]);

  // ── Delete flow ──────────────────────────────────────────────────────────

  function requestDelete(note: UltraNote) {
    DEV && console.log("[NOTELAB_DELETE_CLICK]", { id: note.id, topic: note.topic, page: note.pageNumber, bookId: note.bookId });
    setConfirmDelete(note);
  }

  async function executeDelete() {
    const note = confirmDelete;
    if (!note) return;
    DEV && console.log("[NOTELAB_DELETE_CONFIRMED]", { id: note.id, topic: note.topic, page: note.pageNumber });

    // Optimistic UI — remove immediately
    setNotes((prev) => prev.filter((n) => n.id !== note.id));
    setConfirmDelete(null);
    if (expandedId === note.id) { setExpandedId(null); onActiveNoteChange?.(null); }

    try {
      await deleteUltraNote(note.id); // logs NOTELAB_IDB_DELETE + NOTELAB_LOCAL_DELETE internally
      DEV && console.log("[NOTELAB_DELETE_SUCCESS]", { id: note.id, topic: note.topic, page: note.pageNumber });
      // Reload from IDB to confirm deletion persisted
      await reload();
    } catch (e) {
      console.error("[NOTELAB_DELETE_FAILED]", { id: note.id, error: String(e) });
      // Restore note in UI if delete failed
      await reload();
    }
  }

  // ── Copy ─────────────────────────────────────────────────────────────────

  async function handleCopy(note: UltraNote) {
    const text = formatUltraNoteText(note);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(note.id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch { /* silently skip */ }
  }

  // ── Duplicate ────────────────────────────────────────────────────────────

  async function handleDuplicate(note: UltraNote) {
    const now = Date.now();
    const copy: UltraNote = { ...note, id: `note-${now}`, topic: `${note.topic} (copy)`, createdAt: now };
    setNotes((prev) => [copy, ...prev]);
    try {
      await saveUltraNote(copy);
    } catch (e) {
      console.error("[NOTELAB_DUPLICATE_FAILED]", String(e));
      await reload();
    }
  }

  // ── Jump to related note ─────────────────────────────────────────────────

  function handleJumpToNote(target: UltraNote) {
    const subject = target.subject ?? "General Notes";
    setCollapsedSubjects((prev) => {
      const next = new Set(prev);
      next.delete(subject);
      return next;
    });
    setCollapsedBooks((prev) => {
      const next = new Set(prev);
      next.delete(`${subject}:${target.bookId}`);
      return next;
    });
    setExpandedId(target.id);
    onActiveNoteChange?.(target);
    setHighlightedNoteId(target.id);
    setTimeout(() => {
      noteRefs.current.get(target.id)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 60);
    setTimeout(() => setHighlightedNoteId((cur) => (cur === target.id ? null : cur)), 1600);
  }

  // ── KG node focus: auto-expand + scroll to matching note ─────────────────

  useEffect(() => {
    if (!focusedKnowledgeNodeId) return;
    const match = notes.find((n) => n.knowledgeNodeId === focusedKnowledgeNodeId);
    if (!match) return;
    const subject = match.subject ?? "General Notes";
    setCollapsedSubjects((prev) => { const next = new Set(prev); next.delete(subject); return next; });
    setCollapsedBooks((prev) => { const next = new Set(prev); next.delete(`${subject}:${match.bookId}`); return next; });
    setExpandedId(match.id);
    onActiveNoteChange?.(match);
    setHighlightedNoteId(match.id);
    setTimeout(() => { noteRefs.current.get(match.id)?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, 60);
    setTimeout(() => setHighlightedNoteId((cur) => (cur === match.id ? null : cur)), 1600);
  }, [focusedKnowledgeNodeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Collapse toggles ──────────────────────────────────────────────────────

  function toggleSubject(subject: NoteSubject) {
    setCollapsedSubjects((prev) => {
      const next = new Set(prev);
      if (next.has(subject)) next.delete(subject); else next.add(subject);
      return next;
    });
  }

  function toggleBook(bookKey: string) {
    setCollapsedBooks((prev) => {
      const next = new Set(prev);
      if (next.has(bookKey)) next.delete(bookKey); else next.add(bookKey);
      return next;
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const q = searchQuery.trim().toLowerCase();
  const filteredNotes = q
    ? notes.filter((n) =>
        n.topic.toLowerCase().includes(q) ||
        (n.coreIdea ?? "").toLowerCase().includes(q) ||
        n.concepts.some((c) => c.title.toLowerCase().includes(q) || c.pattern.toLowerCase().includes(q)) ||
        (n.bookTitle ?? "").toLowerCase().includes(q)
      )
    : notes;

  if (notes.length === 0) {
    return (
      <>
        {confirmDelete && (
          <DeleteModal note={confirmDelete} onConfirm={executeDelete} onCancel={() => setConfirmDelete(null)} />
        )}
        <div style={{ padding: "40px 24px", textAlign: "center", color: "rgba(148,163,184,0.7)" }}>
          <div style={{ fontSize: 40, marginBottom: 14 }}>📝</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.85)", marginBottom: 8 }}>No notes yet</div>
          <div style={{ fontSize: 13, lineHeight: 1.7 }}>
            Open any instructional page and click{" "}
            <span style={{ color: "#fcd34d", fontWeight: 700 }}>⚡ Generate Ultra Note</span> in the right panel.
          </div>
        </div>
      </>
    );
  }

  // Group: subject → bookId → notes (newest first per group)
  const bySubject = new Map<NoteSubject, Map<string, UltraNote[]>>();
  for (const note of filteredNotes) {
    const subject: NoteSubject = note.subject ?? "General Notes";
    if (!bySubject.has(subject)) bySubject.set(subject, new Map());
    const byBook = bySubject.get(subject)!;
    if (!byBook.has(note.bookId)) byBook.set(note.bookId, []);
    byBook.get(note.bookId)!.push(note);
  }
  const usedSubjects = SUBJECT_ORDER.filter((s) => bySubject.has(s));

  return (
    <>
      {confirmDelete && (
        <DeleteModal note={confirmDelete} onConfirm={executeDelete} onCancel={() => setConfirmDelete(null)} />
      )}
      {/* Search bar */}
      <div style={{ padding: "10px 14px 4px", display: "flex", gap: 8, alignItems: "center" }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "5px 10px" }}>
          <span style={{ fontSize: 13, color: "rgba(148,163,184,0.5)" }}>🔍</span>
          <input
            ref={searchRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Search ${notes.length} note${notes.length !== 1 ? "s" : ""}…`}
            style={{ flex: 1, background: "none", border: "none", outline: "none", color: "rgba(255,255,255,0.85)", fontSize: 12, caretColor: "#818cf8" }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => { setSearchQuery(""); searchRef.current?.focus(); }}
              style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(148,163,184,0.5)", fontSize: 13, padding: 0, lineHeight: 1 }}
            >
              ×
            </button>
          )}
        </div>
      </div>
      <ModeSelector mode={mode} onChange={handleModeChange} />

      {/* No search results */}
      {q && filteredNotes.length === 0 && (
        <div style={{ padding: "32px 24px", textAlign: "center", color: "rgba(148,163,184,0.6)" }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>🔍</div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>No notes match "{searchQuery}"</div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "10px 14px 14px" }}>
        {usedSubjects.map((subject) => {
          const byBook = bySubject.get(subject)!;
          const isCollapsed = !q && collapsedSubjects.has(subject);
          const totalCount = [...byBook.values()].reduce((n, arr) => n + arr.length, 0);

          return (
            <div key={subject} style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", overflow: "hidden", background: "rgba(8,16,32,0.6)" }}>
              {/* Subject header */}
              <div
                onClick={() => !q && toggleSubject(subject)}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", cursor: q ? "default" : "pointer", userSelect: "none", background: "rgba(255,255,255,0.04)" }}
              >
                <span style={{ fontSize: 17 }}>{SUBJECT_ICON[subject]}</span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>{subject}</span>
                <span style={{ fontSize: 11, color: "rgba(148,163,184,0.55)" }}>{totalCount} note{totalCount !== 1 ? "s" : ""}</span>
                {!q && <span style={{ fontSize: 11, color: "rgba(148,163,184,0.35)", marginLeft: 4 }}>{isCollapsed ? "▶" : "▼"}</span>}
              </div>

              {!isCollapsed && [...byBook.entries()].map(([bid, bookNotes]) => {
                const bookKey = `${subject}:${bid}`;
                const isBookCollapsed = !q && collapsedBooks.has(bookKey);

                return (
                  <div key={bid} style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                    {!bookId && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 18px" }}>
                        <div
                          onClick={() => !q && toggleBook(bookKey)}
                          style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0, cursor: q ? "default" : "pointer", userSelect: "none" }}
                        >
                          <span style={{ fontSize: 13 }}>📖</span>
                          <span style={{ flex: 1, fontSize: 12, color: "rgba(148,163,184,0.8)", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {bookNotes[0]?.bookTitle || bid}
                          </span>
                        </div>
                        <ExportAllMenu notes={bookNotes} title={bookNotes[0]?.bookTitle || bid} mode={mode} />
                        {!q && <span onClick={() => toggleBook(bookKey)} style={{ fontSize: 11, color: "rgba(148,163,184,0.35)", cursor: "pointer", userSelect: "none" }}>{isBookCollapsed ? "▶" : "▼"}</span>}
                      </div>
                    )}

                    {!isBookCollapsed && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 10px 10px" }}>
                        {bookNotes.map((note) => {
                          const isExpanded = expandedId === note.id;
                          return (
                            <NoteCard
                              key={note.id}
                              note={note}
                              allNotes={notes}
                              mode={mode}
                              isExpanded={isExpanded}
                              copiedId={copiedId}
                              highlighted={highlightedNoteId === note.id}
                              cardRef={(el) => {
                                if (el) noteRefs.current.set(note.id, el);
                                else noteRefs.current.delete(note.id);
                              }}
                              onToggle={() => {
                                const next = isExpanded ? null : note.id;
                                setExpandedId(next);
                                onActiveNoteChange?.(next ? note : null);
                              }}
                              onCopy={() => handleCopy(note)}
                              onDelete={() => requestDelete(note)}
                              onDuplicate={() => handleDuplicate(note)}
                              onNavigate={onNavigateToPage}
                              onCardsGenerated={onCardsGenerated}
                              onOpenWhiteboard={onOpenWhiteboard}
                              onAskProfessorAboutBlock={onAskProfessorAboutBlock}
                              onJumpToNote={handleJumpToNote}
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </>
  );
}

// ── Delete confirmation modal ──────────────────────────────────────────────

function DeleteModal({ note, onConfirm, onCancel }: { note: UltraNote; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#0d1628", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 16, padding: "28px 30px", maxWidth: 400, width: "92%", boxShadow: "0 24px 60px rgba(0,0,0,0.7)" }}
      >
        <div style={{ fontSize: 30, textAlign: "center", marginBottom: 14 }}>🗑️</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.95)", textAlign: "center", marginBottom: 8 }}>
          Delete this note permanently?
        </div>
        <div style={{ fontSize: 13, color: "#fbbf24", fontWeight: 600, textAlign: "center", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          ⚡ {note.topic}
        </div>
        <div style={{ fontSize: 12, color: "rgba(148,163,184,0.6)", textAlign: "center", marginBottom: 24 }}>
          Page {note.pageNumber} · {note.bookTitle ?? note.bookId}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            onClick={onCancel}
            style={{ flex: 1, padding: "10px 0", borderRadius: 9, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.75)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{ flex: 1, padding: "10px 0", borderRadius: 9, border: "1px solid rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.12)", color: "#f87171", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
          >
            Delete permanently
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ModeSelector — profession lens switcher (Surgeon/Pilot/Dental/Default) ─

function ModeSelector({ mode, onChange }: { mode: ProfessionMode; onChange: (m: ProfessionMode) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px 0" }}>
      <span style={{ fontSize: 12, color: "rgba(148,163,184,0.7)", fontWeight: 600 }}>🎭 Lens:</span>
      <select
        value={mode}
        onChange={(e) => onChange(e.target.value as ProfessionMode)}
        style={{
          flex: "0 0 auto",
          padding: "5px 9px",
          borderRadius: 7,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "#0d1628",
          color: "rgba(255,255,255,0.88)",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {PROFESSION_MODES.map((m) => (
          <option key={m.id} value={m.id}>{m.icon} {m.label}</option>
        ))}
      </select>
    </div>
  );
}

// ── NoteCard ──────────────────────────────────────────────────────────────

function NoteCard({
  note, allNotes, mode, isExpanded, copiedId, highlighted, cardRef, onToggle, onCopy, onDelete, onDuplicate, onNavigate, onCardsGenerated, onOpenWhiteboard, onAskProfessorAboutBlock, onJumpToNote,
}: {
  note: UltraNote;
  allNotes: UltraNote[];
  mode: ProfessionMode;
  isExpanded: boolean;
  copiedId: string | null;
  highlighted?: boolean;
  cardRef?: (el: HTMLDivElement | null) => void;
  onToggle: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onNavigate?: (page: number) => void;
  onCardsGenerated?: (setId: string) => void;
  onOpenWhiteboard?: (note: UltraNote, card?: NoteCardData) => void;
  onAskProfessorAboutBlock?: (note: UltraNote, block: FinalizedNotebookBlock) => void;
  onJumpToNote: (target: UltraNote) => void;
}) {
  const setSelectedKgNodeId = useKnowledgeSelectionStore((s) => s.setSelectedNodeId);
  const [cardsSaved, setCardsSaved] = useState(false);
  const [cardsSaving, setCardsSaving] = useState(false);
  const [noteView, setNoteView] = useState<"page" | "notebook">(() => note.notebookScene ? "notebook" : "page");
  const [studentDraft, setStudentDraft] = useState(note.studentNotes ?? "");
  const [studentSaveState, setStudentSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    setStudentDraft(note.studentNotes ?? "");
    setNoteView(note.notebookScene ? "notebook" : "page");
  }, [note.id, note.studentNotes, note.notebookScene]);

  async function handleSaveStudentNotes() {
    if (studentSaveState === "saving") return;
    setStudentSaveState("saving");
    try {
      const updated: UltraNote = { ...note, studentNotes: studentDraft.trim() || undefined };
      // Correction (Study Page migration) — composeNoteNotebookSceneInBackground
      // (RightPanel.tsx) is the only other writer of notebookScene, and it only
      // runs right after a "Generate Ultra Note" save. Writing notes directly
      // from the notebook itself (this button) never went through that path,
      // so without this the notebook's own handwritten_text block would go
      // stale the moment a student edited their notes here. No AI call needed —
      // this is the same deterministic merge, purely local.
      const scene = mergeDeterministicContentIntoScene(updated.notebookScene ?? null, updated, {
        bookId: updated.bookId, pageNumber: updated.pageNumber,
      });
      await saveUltraNote(scene.blocks.length > 0 ? { ...updated, notebookScene: scene } : updated);
      setStudentSaveState("saved");
      setTimeout(() => setStudentSaveState("idle"), 1800);
    } catch (error) {
      console.error("[NOTELAB_STUDENT_LAYER_SAVE_FAILED]", String(error));
      setStudentSaveState("error");
    }
  }

  async function handleGenerateCards() {
    if (cardsSaving) return;
    setCardsSaving(true);
    try {
      const set = buildRecallSetFromNote(note, { sourceLabel: "notelab" });
      await saveRecallSet(set);
      setCardsSaved(true);
      onCardsGenerated?.(set.id);
      setTimeout(() => setCardsSaved(false), 2500);
    } catch (e) {
      console.error("[NOTELAB_CARDS_SAVE_FAILED]", String(e));
    } finally {
      setCardsSaving(false);
    }
  }

  // N4 — "Practice in Recall" on a selected notebook-canvas object.
  async function handlePracticeRecallBlock(block: FinalizedNotebookBlock) {
    try {
      const set = buildRecallSetFromNotebookBlock(note, block, { sourceLabel: "notelab" });
      await saveRecallSet(set);
      onCardsGenerated?.(set.id);
    } catch (e) {
      console.error("[NOTELAB_NOTEBOOK_BLOCK_CARDS_SAVE_FAILED]", String(e));
    }
  }

  // N4 — "View Source": navigate to the block's page AND focus the exact
  // source thought unit, same setThoughtUnit call TldrawCanvas.tsx's own
  // shape-selection handler already uses for Professor's canvas.
  function handleViewSourceBlock(block: FinalizedNotebookBlock) {
    if (block.canonicalUnitId) useReadingFocusStore.getState().setThoughtUnit(block.canonicalUnitId);
    onNavigate?.(block.page ?? note.pageNumber);
  }

  // N4 — "Jump to Reader": a coarser page-level jump, no claimed in-page anchor.
  function handleJumpToReaderBlock(block: FinalizedNotebookBlock) {
    onNavigate?.(block.page ?? note.pageNumber);
  }

  const canonicalSections = getCanonicalNotebookSections(note);
  const sectionEvidence = (note.sections ?? [])
    .filter((section) => section.label === "Source" || section.label === "Source Evidence")
    .map((section, index) => ({ id: `section-source-${index}`, text: section.content, kind: "source" }));
  const sourceEvidence = [
    ...(note.visualAnchors?.map((anchor) => ({ id: anchor.id, text: anchor.exactText, kind: anchor.role })) ?? []),
    ...(note.highlightAnchors?.map((anchor, index) => ({ id: `highlight-${index}`, text: anchor.text, kind: anchor.anchorType })) ?? []),
    ...sectionEvidence,
  ].filter((entry, index, entries) => entry.text.trim() && entries.findIndex((candidate) => candidate.text === entry.text) === index);

  return (
    <div
      ref={cardRef}
      style={{
        borderRadius: 12,
        border: highlighted ? "1px solid rgba(252,211,77,0.7)" : "1px solid rgba(255,255,255,0.08)",
        boxShadow: highlighted ? "0 0 0 3px rgba(252,211,77,0.18)" : "none",
        background: "rgba(10,18,38,0.8)",
        overflow: "hidden",
        transition: "border-color 0.3s, box-shadow 0.3s",
      }}
    >
      {/* Header */}
      <div
        onClick={onToggle}
        style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", cursor: "pointer", userSelect: "none" }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#fcd34d", marginBottom: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            ⚡ {note.topic}
          </div>
          <div style={{ fontSize: 11, color: "rgba(148,163,184,0.65)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span>Page {note.pageNumber}</span>
            <span>·</span>
            <span>{new Date(note.createdAt).toLocaleDateString()}</span>
            {note.bookTitle && <><span>·</span><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{note.bookTitle}</span></>}
            {note.knowledgeNodeId && (
              <KnowledgeNodeBadge
                role={note.visualAnchors?.[0]?.role ?? "Concept"}
                onClick={() => setSelectedKgNodeId(note.knowledgeNodeId!)}
              />
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={onDuplicate}
            title="Duplicate note"
            style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid rgba(99,102,241,0.25)", background: "rgba(99,102,241,0.07)", color: "#a5b4fc", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
          >
            ⊕
          </button>
          <button
            type="button"
            onClick={onDelete}
            title="Delete note"
            style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.07)", color: "#f87171", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
          >
            🗑
          </button>
        </div>
        <span style={{ fontSize: 11, color: "rgba(148,163,184,0.4)", flexShrink: 0 }}>{isExpanded ? "▲" : "▼"}</span>
      </div>

      {/* Note toolbar — visible when expanded */}
      {isExpanded && (
        <div style={{ display: "flex", gap: 6, padding: "0 16px 10px", flexWrap: "wrap" }}>
          {onOpenWhiteboard && (
            <button type="button" onClick={() => onOpenWhiteboard(note)} style={TOOL_BTN}>🖼️ Whiteboard</button>
          )}
          <button type="button" onClick={onCopy} style={TOOL_BTN}>
            {copiedId === note.id ? "✅ Copied" : "📋 Copy"}
          </button>
          <button type="button" onClick={() => onNavigate?.(note.pageNumber)} style={TOOL_BTN}>📍 p.{note.pageNumber}</button>
          <button type="button" onClick={handleGenerateCards} disabled={cardsSaving} style={TOOL_BTN}>
            {cardsSaving ? "⏳" : cardsSaved ? "✅ Cards saved" : "🎯 Recall cards"}
          </button>
          <button type="button" onClick={() => downloadNoteMarkdown(note, mode)} style={TOOL_BTN}>⬇️ Export</button>
        </div>
      )}

      {/* Expanded body — one permanent notebook page, not a second analysis dashboard. */}
      {isExpanded && (
        <div
          data-testid="visual-notebook-page"
          style={{
            margin: "0 12px 16px",
            padding: "18px clamp(14px, 3vw, 30px) 24px",
            display: "flex",
            flexDirection: "column",
            gap: 14,
            borderRadius: 14,
            border: "1px solid rgba(148,163,184,0.18)",
            background: "linear-gradient(180deg, rgba(248,250,252,0.075), rgba(15,23,42,0.74))",
            boxShadow: "0 18px 45px rgba(0,0,0,0.24), inset 3px 0 0 rgba(56,189,248,0.18)",
          }}
        >
          <div style={{ borderBottom: "1px solid rgba(148,163,184,0.16)", paddingBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.16em", color: "#67e8f9", textTransform: "uppercase" }}>Visual notebook</div>
            <h2 style={{ margin: "5px 0 0", fontSize: 22, lineHeight: 1.25, color: "rgba(255,255,255,0.96)", fontWeight: 760 }}>{note.topic}</h2>
            <div style={{ marginTop: 6, fontSize: 11, color: "rgba(203,213,225,0.62)" }}>
              {note.bookTitle ?? note.bookId} · PDF page {note.pageNumber}{note.printedPageLabel ? ` · printed ${note.printedPageLabel}` : ""}
            </div>
          </div>

          {/* A composed canvas is the primary notebook. The structured study
              page is its accessible/readable companion, never the retired
              Study Sheet or generated-card dashboard. */}
          {note.notebookScene && (
          <div data-testid="notebook-view-switcher" style={{ display: "flex", gap: 6, borderBottom: "1px solid rgba(255,255,255,0.07)", paddingBottom: 8 }}>
            {(["notebook", "page"] as const).map((tab) => {
              const active = noteView === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setNoteView(tab)}
                  style={{
                    padding: "5px 12px",
                    borderRadius: 7,
                    border: active ? "1px solid rgba(252,211,77,0.5)" : "1px solid rgba(255,255,255,0.1)",
                    background: active ? "rgba(252,211,77,0.1)" : "transparent",
                    color: active ? "#fcd34d" : "rgba(148,163,184,0.7)",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  {tab === "notebook" ? "🖊️ Visual notebook" : "📄 Study page"}
                </button>
              );
            })}
          </div>
          )}

          {/* Notebook tab — the real, persistent, student-editable tldraw
              canvas (N3). storageKey is per-note so each note's composed
              scene and any student edits to it persist independently. */}
          {noteView === "notebook" && note.notebookScene && (
            <NotebookCanvas
              scene={note.notebookScene}
              storageKey={`notelab-notebook-${note.id}`}
              notebookId={note.id}
              documentId={note.documentId}
              pageTruthKey={note.pageTruthKey}
              onViewSource={handleViewSourceBlock}
              onJumpToReader={handleJumpToReaderBlock}
              onAskProfessor={onAskProfessorAboutBlock ? (block) => onAskProfessorAboutBlock(note, block) : undefined}
              onPracticeRecall={handlePracticeRecallBlock}
            />
          )}

          {/* Canonical permanent study page. Historical note shapes are
              migrated by getCanonicalNotebookSections; no old renderer can
              become the learner-facing fallback. */}
          {noteView === "page" && <>

          {note.tags && note.tags.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {note.tags.map((tag, i) => (
                <span
                  key={i}
                  style={{ padding: "2px 8px", borderRadius: 999, border: "1px solid rgba(148,163,184,0.3)", background: "rgba(148,163,184,0.08)", color: "rgba(226,232,240,0.85)", fontSize: 10.5, fontWeight: 600 }}
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}

          <SectionsView sections={canonicalSections} mode={mode} />

          <NoteBlock accent="#38bdf8" bg="rgba(56,189,248,0.04)" icon="✍️" label="MY NOTES">
            <textarea
              value={studentDraft}
              onChange={(event) => { setStudentDraft(event.target.value); setStudentSaveState("idle"); }}
              placeholder="Write your own explanation, worked steps, questions, or memory cues. AI regeneration will not overwrite this layer."
              rows={5}
              style={{ width: "100%", resize: "vertical", borderRadius: 8, border: "1px solid rgba(125,211,252,0.2)", background: "rgba(2,6,23,0.6)", color: "rgba(255,255,255,0.9)", padding: "10px 11px", fontSize: 13, lineHeight: 1.6 }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
              <button type="button" onClick={handleSaveStudentNotes} disabled={studentSaveState === "saving"} style={TOOL_BTN}>
                {studentSaveState === "saving" ? "Saving…" : studentSaveState === "saved" ? "✓ Saved" : studentSaveState === "error" ? "Retry save" : "Save my notes"}
              </button>
            </div>
          </NoteBlock>

          {/* Correction (Evidence-as-provenance) — a per-item "View Source"
              action, not a standing Evidence workspace: collapsed by
              default, scoped to this note's own page, and each item jumps
              straight back to its own source passage rather than opening a
              second surface competing with the note itself. */}
          {sourceEvidence.length ? (
            <details style={{ borderRadius: 10, border: "1px solid rgba(148,163,184,0.14)", background: "rgba(15,23,42,0.4)", padding: "10px 12px" }}>
              <summary style={{ cursor: "pointer", color: "rgba(203,213,225,0.72)", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em" }}>
                SOURCE REFERENCES · PDF PAGE {note.pageNumber}
              </summary>
              <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 10 }}>
                {sourceEvidence.slice(0, 8).map((anchor) => (
                    <button
                      type="button"
                      key={anchor.id}
                      onClick={() => onNavigate?.(note.pageNumber)}
                      title="View source"
                      style={{ textAlign: "left", borderRadius: 8, border: "1px solid rgba(148,163,184,0.12)", background: "rgba(255,255,255,0.025)", color: "rgba(226,232,240,0.78)", padding: "8px 10px", fontSize: 12, lineHeight: 1.5, cursor: "pointer" }}
                    >
                      <span style={{ color: "#67e8f9", fontSize: 9, fontWeight: 700, textTransform: "uppercase" }}>{anchor.kind}</span>
                      <br />{anchor.text}
                    </button>
                  ))}
              </div>
            </details>
          ) : null}


          {/* External Study Links */}
          {note.externalStudyLinks && note.externalStudyLinks.length > 0 && (
            <NoteBlock accent="#c4b5fd" bg="rgba(139,92,246,0.04)" icon="📚" label="STUDY LINKS">
              {note.externalStudyLinks.map((l, i) => {
                const base = l.type === "textbook-search" ? "https://scholar.google.com/scholar?q=" : "https://www.google.com/search?q=";
                return (
                  <a key={i} href={`${base}${encodeURIComponent(l.searchQuery)}`} target="_blank" rel="noopener noreferrer"
                    style={{ display: "block", fontSize: 13, color: "#c4b5fd", lineHeight: 1.6, textDecoration: "underline dotted", marginBottom: 3 }}>
                    {l.type === "textbook-search" ? "📖" : "🔗"} {l.label}
                  </a>
                );
              })}
            </NoteBlock>
          )}

          {/* Related Notes — keyword-overlap heuristic, no AI */}
          {(() => {
            const related = findRelatedNotes(note, allNotes, 3);
            if (related.length === 0) return null;
            return (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7, alignItems: "center" }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "rgba(34,211,238,0.75)" }}>🔗 RELATED NOTES</span>
                {related.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onJumpToNote(r); }}
                    style={{
                      padding: "4px 10px",
                      borderRadius: 999,
                      border: "1px solid rgba(34,211,238,0.3)",
                      background: "rgba(34,211,238,0.08)",
                      color: "#67e8f9",
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {r.topic} · p{r.pageNumber}
                  </button>
                ))}
              </div>
            );
          })()}

          </> /* end noteView === "page" */}

          {/* Export options */}
          <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
            <ExportMenu
              onMarkdown={() => downloadNoteMarkdown(note, mode)}
              onPdf={() => downloadNotePdf(note, mode)}
              onDocx={() => downloadNoteDocx(note, mode)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── SectionsView — renders new-schema sections (Core Idea, Must Know, etc.) ───

const SECTION_STYLE: Record<string, { accent: string; bg: string; icon: string }> = {
  "Big Idea":                       { accent: "#fbbf24", bg: "rgba(251,191,36,0.06)",  icon: "💡" },
  "Core Concepts":                  { accent: "#60a5fa", bg: "rgba(96,165,250,0.05)",  icon: "🧩" },
  "Definitions":                    { accent: "#38bdf8", bg: "rgba(56,189,248,0.05)",  icon: "📖" },
  "Equations and Variables":        { accent: "#c084fc", bg: "rgba(192,132,252,0.05)", icon: "∑" },
  "Worked Example":                 { accent: "#34d399", bg: "rgba(52,211,153,0.05)",  icon: "✏️" },
  "Graph / Figure":                 { accent: "#a78bfa", bg: "rgba(167,139,250,0.05)", icon: "📈" },
  "Biological / Real-World Application": { accent: "#22d3ee", bg: "rgba(34,211,238,0.05)", icon: "🧬" },
  "Common Mistakes":                { accent: "#fb7185", bg: "rgba(251,113,133,0.06)", icon: "⚠️" },
  "Memory Trick":                   { accent: "#a78bfa", bg: "rgba(167,139,250,0.05)", icon: "🧠" },
  "Exam Signal":                    { accent: "#f59e0b", bg: "rgba(245,158,11,0.05)", icon: "🎯" },
  "Recall Questions":               { accent: "#6ee7b7", bg: "rgba(110,231,183,0.05)", icon: "❓" },
  "Structured Notes":               { accent: "#94a3b8", bg: "rgba(148,163,184,0.05)", icon: "📝" },
  "Key Facts / Clinical Pearls":    { accent: "#facc15", bg: "rgba(250,204,21,0.05)", icon: "💎" },
  "Mechanism / Process":            { accent: "#34d399", bg: "rgba(52,211,153,0.05)", icon: "⚙️" },
  "Clinical Reasoning":             { accent: "#c084fc", bg: "rgba(192,132,252,0.05)", icon: "🧠" },
  "Decision / Concept Map":         { accent: "#22d3ee", bg: "rgba(34,211,238,0.05)", icon: "↔️" },
  "Clinical / Application Connection": { accent: "#38bdf8", bg: "rgba(56,189,248,0.05)", icon: "🦷" },
  "Common Mistakes / Clinical Risks": { accent: "#fb7185", bg: "rgba(251,113,133,0.06)", icon: "⚠️" },
  "Exam-Important Concepts":        { accent: "#f59e0b", bg: "rgba(245,158,11,0.05)", icon: "🎯" },
  "Source Evidence":                { accent: "#64748b", bg: "rgba(100,116,139,0.06)", icon: "📍" },
  "Chief Concern / Problem":        { accent: "#fbbf24", bg: "rgba(251,191,36,0.06)",  icon: "🎯" },
  "Why This Matters Clinically":    { accent: "#38bdf8", bg: "rgba(56,189,248,0.05)",  icon: "📌" },
  "Diagnostic Reasoning":           { accent: "#c084fc", bg: "rgba(192,132,252,0.05)", icon: "🧩" },
  "Procedure Logic":                { accent: "#34d399", bg: "rgba(52,211,153,0.05)",  icon: "⚙️" },
  "Decision Tree":                  { accent: "#22d3ee", bg: "rgba(34,211,238,0.05)",  icon: "🌳" },
  "Danger Zone":                    { accent: "#f87171", bg: "rgba(248,113,113,0.06)", icon: "⚠️" },
  "Complication Risk":              { accent: "#fb923c", bg: "rgba(251,146,60,0.06)",  icon: "🚧" },
  "Clinical Pearl":                 { accent: "#facc15", bg: "rgba(250,204,21,0.06)",  icon: "💎" },
  "Common Mistake":                 { accent: "#fb7185", bg: "rgba(251,113,133,0.06)", icon: "❌" },
  "Case-Style Recall Questions":    { accent: "#6ee7b7", bg: "rgba(110,231,183,0.05)", icon: "📝" },
  "Connection Map":                 { accent: "#22d3ee", bg: "rgba(34,211,238,0.05)",  icon: "🔗" },
  "Exam Strategy":                  { accent: "#fbbf24", bg: "rgba(251,191,36,0.05)",  icon: "🎓" },
  "Memory Hook":                    { accent: "#a78bfa", bg: "rgba(167,139,250,0.05)", icon: "🧠" },
  "Summary":                        { accent: "#fbbf24", bg: "rgba(251,191,36,0.05)",  icon: "🧾" },
  "Source":                         { accent: "#64748b", bg: "rgba(100,116,139,0.06)", icon: "📖" },
};

// Expert-notebook reading order for the card grid below. Sort, not filter —
// any label absent from this list (future section) still renders, just last,
// instead of silently disappearing (the lesson from Phase 4's SUBJECT_ORDER).
const SECTION_ORDER = [
  "Big Idea", "Structured Notes", "Key Facts / Clinical Pearls", "Core Concepts", "Definitions", "Mechanism / Process", "Clinical Reasoning", "Decision / Concept Map", "Clinical / Application Connection", "Common Mistakes / Clinical Risks", "Exam-Important Concepts", "Equations and Variables",
  "Worked Example", "Graph / Figure", "Biological / Real-World Application",
  "Common Mistakes", "Memory Trick", "Exam Signal", "Recall Questions", "Source Evidence",
  "Chief Concern / Problem", "Why This Matters Clinically", "Diagnostic Reasoning",
  "Procedure Logic", "Decision Tree", "Danger Zone", "Complication Risk",
  "Clinical Pearl", "Common Mistake", "Case-Style Recall Questions",
  "Connection Map", "Exam Strategy", "Memory Hook", "Summary", "Source",
];

function SectionsView({ sections, mode }: { sections: import("@/lib/notelab/ultraNoteStore").NoteSection[]; mode: ProfessionMode }) {
  // Provenance belongs in the expandable evidence inspector below the page,
  // not as a competing card inside the learner's notebook.
  const ordered = sections.filter((section) => section.label !== "Source Evidence" && section.label !== "Source").sort((a, b) => {
    const ai = SECTION_ORDER.indexOf(a.label);
    const bi = SECTION_ORDER.indexOf(b.label);
    return (ai === -1 ? SECTION_ORDER.length : ai) - (bi === -1 ? SECTION_ORDER.length : bi);
  });
  return (
    <div data-testid="adaptive-notebook-sections" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, alignItems: "start" }}>
      {ordered.map((sec) => {
        const style = SECTION_STYLE[sec.label] ?? { accent: "#94a3b8", bg: "rgba(148,163,184,0.05)", icon: "•" };
        const lens = getSectionLens(mode, sec.label);
        const label = lens?.label ?? sec.label;
        const icon = lens?.icon ?? style.icon;
        return (
          <section key={sec.label} style={{ gridColumn: sec.label === "Big Idea" || sec.label === "Mechanism / Process" || sec.label === "Decision / Concept Map" ? "1 / -1" : undefined, borderRadius: 10, borderTop: `3px solid ${style.accent}80`, background: style.bg, padding: sec.label === "Big Idea" ? "16px 18px" : "12px 14px", breakInside: "avoid" }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: style.accent, marginBottom: 7 }}>
              {icon} {label.toUpperCase()}
            </div>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.9)", lineHeight: 1.75, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {sec.content}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// N1 (NoteLab adaptivity correction) — this used to gate on a fixed
// allowlist of known section labels (NEW_SCHEMA_LABELS), so a note whose
// sections came from buildNoteFromStudyModel's fixed 14-slot template (or
// its since-removed "math-textbook" sibling) would render via SectionsView,
// while a note whose sections were derived from model.noteCards' adaptive,
// AI-chosen titles — anything from "Must Know" to a concept's own title —
// often did NOT match the allowlist and silently fell through to the
// legacy coreIdea/concept-block layout instead. Any note with sections has
// them because buildNoteFromStudyModel actually built them (always at
// least a "Source" entry) — there's no longer a separate "old schema" to
// distinguish from a "new" one, so presence is the only signal needed.
function hasNewSchema(sections?: import("@/lib/notelab/ultraNoteStore").NoteSection[]): boolean {
  return !!sections?.length;
}

// ── ConceptMiniTable — condensed multi-concept overview (NoteLab v2) ──────

function ConceptMiniTable({ concepts, mode }: { concepts: import("@/lib/notelab/ultraNoteStore").UltraNoteConcept[]; mode: ProfessionMode }) {
  return (
    <div style={{ borderRadius: 9, border: "1px solid rgba(255,255,255,0.08)", overflow: "hidden" }}>
      <div style={{ padding: "8px 13px", background: "rgba(255,255,255,0.03)", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: "rgba(148,163,184,0.65)" }}>
        📋 MINI TABLE
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr>
            <th style={{ padding: "6px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "rgba(148,163,184,0.5)" }}></th>
            <th style={{ padding: "6px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "rgba(148,163,184,0.5)" }}>{getConceptFieldLabel(mode, "pattern").toUpperCase()}</th>
            <th style={{ padding: "6px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "rgba(148,163,184,0.5)" }}>{getConceptFieldLabel(mode, "trap").toUpperCase()}</th>
          </tr>
        </thead>
        <tbody>
          {concepts.map((c) => (
            <tr key={c.ordinal} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <td style={{ padding: "7px 10px", verticalAlign: "top", fontWeight: 700, color: "rgba(255,255,255,0.85)", whiteSpace: "nowrap" }}>
                {c.ordinal}. {c.title}
              </td>
              <td style={{ padding: "7px 10px", verticalAlign: "top", color: "rgba(255,255,255,0.7)" }}>
                {c.pattern ?? "—"}
              </td>
              <td style={{ padding: "7px 10px", verticalAlign: "top", color: "#fca5a5" }}>
                {c.trap ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── ConceptBlock — individually collapsible ───────────────────────────────

function ConceptBlock({
  concept, mode, note, starred, onToggleStar, onCardsGenerated,
}: {
  concept: import("@/lib/notelab/ultraNoteStore").UltraNoteConcept;
  mode: ProfessionMode;
  note: UltraNote;
  starred: boolean;
  onToggleStar: () => void;
  onCardsGenerated?: (setId: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(true);
  const [cardSaving, setCardSaving] = useState(false);
  const [cardSaved, setCardSaved] = useState(false);

  function handleToggleStar(e: React.MouseEvent) {
    e.stopPropagation();
    onToggleStar();
  }

  async function handleGenerateCard(e: React.MouseEvent) {
    e.stopPropagation();
    if (cardSaving) return;
    setCardSaving(true);
    try {
      const set = buildRecallSetFromNote(note, { sourceLabel: "notelab", conceptOrdinals: [concept.ordinal] });
      await saveRecallSet(set);
      setCardSaved(true);
      onCardsGenerated?.(set.id);
      setTimeout(() => setCardSaved(false), 2500);
    } catch (err) {
      console.error("[NOTELAB_CONCEPT_CARD_SAVE_FAILED]", String(err));
    } finally {
      setCardSaving(false);
    }
  }

  return (
    <div style={{ borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", overflow: "hidden" }}>
      <div
        onClick={() => setCollapsed((c) => !c)}
        style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 13px", cursor: "pointer", userSelect: "none", background: "rgba(255,255,255,0.03)" }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.9)", flex: 1 }}>
          🧩 {concept.ordinal}. {concept.title}
        </span>
        <button
          type="button"
          onClick={handleToggleStar}
          title="Star this concept"
          style={{ flexShrink: 0, padding: "3px 7px", borderRadius: 6, border: starred ? "1px solid rgba(252,211,77,0.5)" : "1px solid rgba(255,255,255,0.12)", background: starred ? "rgba(252,211,77,0.14)" : "rgba(255,255,255,0.04)", color: starred ? "#fcd34d" : "rgba(148,163,184,0.7)", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
        >
          {starred ? "⭐" : "☆"}
        </button>
        <button
          type="button"
          onClick={handleGenerateCard}
          disabled={cardSaving}
          title="Generate a recall card from this concept"
          style={{ flexShrink: 0, padding: "3px 7px", borderRadius: 6, border: cardSaved ? "1px solid rgba(99,102,241,0.5)" : "1px solid rgba(99,102,241,0.2)", background: cardSaved ? "rgba(99,102,241,0.14)" : "rgba(99,102,241,0.06)", color: cardSaved ? "#a5b4fc" : "#818cf8", fontSize: 11, fontWeight: 600, cursor: cardSaving ? "wait" : "pointer", opacity: cardSaving ? 0.6 : 1 }}
        >
          {cardSaving ? "…" : cardSaved ? "✓" : "🃏"}
        </button>
        <span style={{ fontSize: 10, color: "rgba(148,163,184,0.35)" }}>{collapsed ? "▶" : "▼"}</span>
      </div>
      {!collapsed && (
        <div style={{ padding: "0 13px 12px", display: "flex", flexDirection: "column", gap: 7 }}>
          {concept.pattern        && <NoteRow label={getConceptFieldLabel(mode, "pattern")}        text={concept.pattern}        color="#7dd3fc" />}
          {concept.surgicalReason && <NoteRow label={getConceptFieldLabel(mode, "surgicalReason")} text={concept.surgicalReason} color="#fde68a" />}
          {concept.trap           && <NoteRow label={getConceptFieldLabel(mode, "trap")}           text={concept.trap}           color="#fca5a5" />}
          {concept.rule           && <NoteRow label={getConceptFieldLabel(mode, "rule")}            text={concept.rule}           color="#fcd34d" />}
        </div>
      )}
    </div>
  );
}

// ── ProfessorSection ──────────────────────────────────────────────────────

function ProfessorSection({ notes, mode }: { notes: NonNullable<UltraNote["professorNotes"]>; mode: ProfessionMode }) {
  const rows: Array<{ icon: string; label: string; text: string; color: string }> = [
    { icon: "💡", label: getProfessorFieldLabel(mode, "whyItMatters"),    text: notes.whyItMatters    ?? "", color: "#fbbf24" },
    { icon: "⚙️", label: getProfessorFieldLabel(mode, "keyMechanism"),    text: notes.keyMechanism    ?? "", color: "#38bdf8" },
    { icon: "⚠️", label: getProfessorFieldLabel(mode, "commonConfusion"), text: notes.commonConfusion ?? "", color: "#f87171" },
    { icon: "🧠", label: getProfessorFieldLabel(mode, "memoryAnchor"),    text: notes.memoryAnchor    ?? "", color: "#a78bfa" },
    { icon: "🔗", label: getProfessorFieldLabel(mode, "reasoningFlow"),   text: notes.reasoningFlow   ?? "", color: "#6ee7b7" },
    { icon: "🎓", label: getProfessorFieldLabel(mode, "examSignal"),      text: notes.examSignal      ?? "", color: "#fca5a5" },
  ].filter((r) => r.text.length > 0);

  if (!rows.length) return null;
  return (
    <NoteBlock accent="#93c5fd" bg="rgba(96,165,250,0.04)" icon="🧑‍🏫" label="PROFESSOR NOTES">
      {rows.map((r) => (
        <div key={r.label} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: r.color, marginBottom: 3 }}>
            {r.icon} {r.label}
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", lineHeight: 1.65 }}>{r.text}</div>
        </div>
      ))}
    </NoteBlock>
  );
}

// ── Reusable block wrapper ────────────────────────────────────────────────

function NoteBlock({ accent, bg, icon, label, children }: {
  accent: string; bg: string; icon: string; label: string; children: React.ReactNode;
}) {
  return (
    <div style={{ borderRadius: 9, border: `1px solid ${accent}22`, background: bg, padding: "11px 13px" }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.13em", color: accent, marginBottom: 8 }}>
        {icon} {label}
      </div>
      {children}
    </div>
  );
}

function NoteRow({ label, text, color }: { label: string; text: string; color: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", lineHeight: 1.65, wordBreak: "break-word" }}>{text}</div>
    </div>
  );
}

// ── ExportMenu — small popover offering Markdown / PDF download ──────────

function ExportMenu({ onMarkdown, onPdf, onDocx }: { onMarkdown: () => void; onPdf: () => Promise<void>; onDocx?: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState<"pdf" | "docx" | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  async function handlePdf() {
    setExporting("pdf");
    try {
      await onPdf();
    } catch (e) {
      console.error("[NOTELAB_EXPORT_PDF_FAILED]", String(e));
    } finally {
      setExporting(null);
      setOpen(false);
    }
  }

  async function handleDocx() {
    if (!onDocx) return;
    setExporting("docx");
    try {
      await onDocx();
    } catch (e) {
      console.error("[NOTELAB_EXPORT_DOCX_FAILED]", String(e));
    } finally {
      setExporting(null);
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} style={{ position: "relative", flexShrink: 0 }}>
      <button type="button" onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }} style={{ ...actionBtn("#c4b5fd"), flex: "none", padding: "9px 12px" }}>
        ⬇ Export
      </button>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 20, background: "#0d1628", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 9, boxShadow: "0 10px 30px rgba(0,0,0,0.5)", overflow: "hidden", minWidth: 140 }}
        >
          <button type="button" onClick={() => { onMarkdown(); setOpen(false); }} style={exportMenuItem}>
            📄 Markdown (.md)
          </button>
          <button type="button" onClick={handlePdf} disabled={exporting !== null} style={{ ...exportMenuItem, opacity: exporting !== null ? 0.6 : 1, cursor: exporting !== null ? "wait" : "pointer" }}>
            {exporting === "pdf" ? "Generating…" : "🗎 PDF (.pdf)"}
          </button>
          {onDocx && (
            <button type="button" onClick={handleDocx} disabled={exporting !== null} style={{ ...exportMenuItem, opacity: exporting !== null ? 0.6 : 1, cursor: exporting !== null ? "wait" : "pointer" }}>
              {exporting === "docx" ? "Generating…" : "📘 Word (.docx)"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const exportMenuItem: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: "9px 13px",
  fontSize: 12,
  fontWeight: 600,
  color: "rgba(255,255,255,0.85)",
  background: "transparent",
  border: "none",
  cursor: "pointer",
};

function ExportAllMenu({ notes, title, mode }: { notes: UltraNote[]; title: string; mode: ProfessionMode }) {
  return (
    <ExportMenu
      onMarkdown={() => downloadNotesMarkdown(notes, title, mode)}
      onPdf={() => downloadNotesPdf(notes, title, mode)}
      onDocx={() => downloadNotesDocx(notes, title, mode)}
    />
  );
}

function actionBtn(color: string): React.CSSProperties {
  return {
    flex: 1,
    padding: "9px 0",
    borderRadius: 8,
    border: `1px solid ${color}44`,
    background: `${color}12`,
    color,
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  };
}
