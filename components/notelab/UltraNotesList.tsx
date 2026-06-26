"use client";
// components/notelab/UltraNotesList.tsx
// Top-student notes — IDB-primary reads, delete confirmation modal, collapsible concepts.

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  getAllUltraNotesAsync,
  getAllUltraNotes,
  deleteUltraNote,
  saveUltraNote,
  formatUltraNoteText,
  type UltraNote,
  type NoteSubject,
} from "@/lib/notelab/ultraNoteStore";
import { buildRecallSetFromNote, buildRecallSetFromNoteCard, saveRecallSet } from "@/lib/recalllab/recallStore";
import { downloadNoteMarkdown, downloadNotePdf, downloadNoteDocx, downloadNotesMarkdown, downloadNotesPdf, downloadNotesDocx } from "@/lib/notelab/exportNote";
import { findRelatedNotes } from "@/lib/notelab/relatedNotes";
import type { NoteCard as NoteCardData } from "@/lib/insights/synthesizeTeachingOutput";
import NoteCardGrid from "@/components/notelab/NoteCardGrid";
import {
  PROFESSION_MODES,
  getStoredProfessionMode,
  setStoredProfessionMode,
  getSectionLens,
  getProfessorFieldLabel,
  getConceptFieldLabel,
  type ProfessionMode,
} from "@/lib/notelab/professionModes";

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
}

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

export default function UltraNotesList({ bookId, onNavigateToPage, refreshKey, onCardsGenerated, onOpenWhiteboard, onExplainCard }: UltraNotesListProps) {
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
  const mountedRef = useRef(true);
  const noteRefs = useRef<Map<string, HTMLDivElement>>(new Map());

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
        console.log("[NOTELAB_RENDER_COUNT]", { total: all.length, filtered: filtered.length, bookId: bookId ?? "all" });
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
    console.log("[NOTELAB_DELETE_CLICK]", { id: note.id, topic: note.topic, page: note.pageNumber, bookId: note.bookId });
    setConfirmDelete(note);
  }

  async function executeDelete() {
    const note = confirmDelete;
    if (!note) return;
    console.log("[NOTELAB_DELETE_CONFIRMED]", { id: note.id, topic: note.topic, page: note.pageNumber });

    // Optimistic UI — remove immediately
    setNotes((prev) => prev.filter((n) => n.id !== note.id));
    setConfirmDelete(null);
    if (expandedId === note.id) setExpandedId(null);

    try {
      await deleteUltraNote(note.id); // logs NOTELAB_IDB_DELETE + NOTELAB_LOCAL_DELETE internally
      console.log("[NOTELAB_DELETE_SUCCESS]", { id: note.id, topic: note.topic, page: note.pageNumber });
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

  // ── Concept star toggle ──────────────────────────────────────────────────

  async function handleToggleConceptStar(note: UltraNote, ordinal: number) {
    const current = note.starredConcepts ?? [];
    const next = current.includes(ordinal) ? current.filter((o) => o !== ordinal) : [...current, ordinal];
    const updated: UltraNote = { ...note, starredConcepts: next };
    setNotes((prev) => prev.map((n) => (n.id === note.id ? updated : n)));
    try {
      await saveUltraNote(updated);
    } catch (e) {
      console.error("[NOTELAB_STAR_SAVE_FAILED]", String(e));
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
    setHighlightedNoteId(target.id);
    setTimeout(() => {
      noteRefs.current.get(target.id)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 60);
    setTimeout(() => setHighlightedNoteId((cur) => (cur === target.id ? null : cur)), 1600);
  }

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

  if (notes.length === 0) {
    return (
      <>
        {confirmDelete && (
          <DeleteModal note={confirmDelete} onConfirm={executeDelete} onCancel={() => setConfirmDelete(null)} />
        )}
        <ModeSelector mode={mode} onChange={handleModeChange} />
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
  for (const note of notes) {
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
      <ModeSelector mode={mode} onChange={handleModeChange} />
      <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "14px" }}>
        {usedSubjects.map((subject) => {
          const byBook = bySubject.get(subject)!;
          const isCollapsed = collapsedSubjects.has(subject);
          const totalCount = [...byBook.values()].reduce((n, arr) => n + arr.length, 0);

          return (
            <div key={subject} style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", overflow: "hidden", background: "rgba(8,16,32,0.6)" }}>
              {/* Subject header */}
              <div
                onClick={() => toggleSubject(subject)}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", cursor: "pointer", userSelect: "none", background: "rgba(255,255,255,0.04)" }}
              >
                <span style={{ fontSize: 17 }}>{SUBJECT_ICON[subject]}</span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>{subject}</span>
                <span style={{ fontSize: 11, color: "rgba(148,163,184,0.55)" }}>{totalCount} note{totalCount !== 1 ? "s" : ""}</span>
                <span style={{ fontSize: 11, color: "rgba(148,163,184,0.35)", marginLeft: 4 }}>{isCollapsed ? "▶" : "▼"}</span>
              </div>

              {!isCollapsed && [...byBook.entries()].map(([bid, bookNotes]) => {
                const bookKey = `${subject}:${bid}`;
                const isBookCollapsed = collapsedBooks.has(bookKey);

                return (
                  <div key={bid} style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                    {!bookId && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 18px" }}>
                        <div
                          onClick={() => toggleBook(bookKey)}
                          style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0, cursor: "pointer", userSelect: "none" }}
                        >
                          <span style={{ fontSize: 13 }}>📖</span>
                          <span style={{ flex: 1, fontSize: 12, color: "rgba(148,163,184,0.8)", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {bookNotes[0]?.bookTitle || bid}
                          </span>
                        </div>
                        <ExportAllMenu notes={bookNotes} title={bookNotes[0]?.bookTitle || bid} mode={mode} />
                        <span onClick={() => toggleBook(bookKey)} style={{ fontSize: 11, color: "rgba(148,163,184,0.35)", cursor: "pointer", userSelect: "none" }}>{isBookCollapsed ? "▶" : "▼"}</span>
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
                              onToggle={() => setExpandedId(isExpanded ? null : note.id)}
                              onCopy={() => handleCopy(note)}
                              onDelete={() => requestDelete(note)}
                              onNavigate={onNavigateToPage}
                              onCardsGenerated={onCardsGenerated}
                              onOpenWhiteboard={onOpenWhiteboard}
                              onExplainCard={onExplainCard}
                              onToggleConceptStar={(ordinal) => handleToggleConceptStar(note, ordinal)}
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
  note, allNotes, mode, isExpanded, copiedId, highlighted, cardRef, onToggle, onCopy, onDelete, onNavigate, onCardsGenerated, onOpenWhiteboard, onExplainCard, onToggleConceptStar, onJumpToNote,
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
  onNavigate?: (page: number) => void;
  onCardsGenerated?: (setId: string) => void;
  onOpenWhiteboard?: (note: UltraNote, card?: NoteCardData) => void;
  onExplainCard?: (note: UltraNote, card: NoteCardData) => void;
  onToggleConceptStar: (ordinal: number) => void;
  onJumpToNote: (target: UltraNote) => void;
}) {
  const [cardsSaved, setCardsSaved] = useState(false);
  const [cardsSaving, setCardsSaving] = useState(false);

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

  async function handleGenerateCardFromNoteCard(noteCard: NoteCardData) {
    try {
      const set = buildRecallSetFromNoteCard(note, noteCard, { sourceLabel: "notelab" });
      await saveRecallSet(set);
      onCardsGenerated?.(set.id);
    } catch (e) {
      console.error("[NOTELAB_NOTECARD_CARDS_SAVE_FAILED]", String(e));
    }
  }

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
          <div style={{ fontSize: 11, color: "rgba(148,163,184,0.65)", display: "flex", gap: 10 }}>
            <span>Page {note.pageNumber}</span>
            <span>·</span>
            <span>{new Date(note.createdAt).toLocaleDateString()}</span>
            {note.bookTitle && <><span>·</span><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{note.bookTitle}</span></>}
          </div>
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          style={{ flexShrink: 0, padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.07)", color: "#f87171", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
        >
          🗑
        </button>
        <span style={{ fontSize: 11, color: "rgba(148,163,184,0.4)", flexShrink: 0 }}>{isExpanded ? "▲" : "▼"}</span>
      </div>

      {/* Expanded body */}
      {isExpanded && (
        <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 10 }}>

          {/* Adaptive Notebook cards (AI-curated or derived) — takes priority over both
              older tiers below, which remain as fallbacks for notes synthesized before
              noteCards existed. */}
          {note.noteCards?.length ? (
            <NoteCardGrid
              noteCards={note.noteCards}
              note={note}
              onNavigateToPage={onNavigate}
              onGenerateCard={(n, c) => handleGenerateCardFromNoteCard(c)}
              onOpenWhiteboard={onOpenWhiteboard ? (n, c) => onOpenWhiteboard(n, c) : undefined}
              onExplainCard={onExplainCard}
            />
          ) : hasNewSchema(note.sections) ? (
            <SectionsView sections={note.sections!} mode={mode} />
          ) : (
            <>
              {/* Core Idea */}
              {note.coreIdea && (() => {
                const lens = getSectionLens(mode, "Core Idea");
                return (
                  <NoteBlock accent="#fbbf24" bg="rgba(251,191,36,0.06)" icon={lens?.icon ?? "🧠"} label={(lens?.label ?? "Core Idea").toUpperCase()}>
                    <div style={{ fontSize: 14, color: "rgba(255,255,255,0.92)", lineHeight: 1.7 }}>{note.coreIdea}</div>
                  </NoteBlock>
                );
              })()}

              {/* Professor Notes */}
              {note.professorNotes && <ProfessorSection notes={note.professorNotes} mode={mode} />}

              {/* Mini Table — condensed pattern/trap/rule overview across all concepts */}
              {note.concepts.length > 1 && <ConceptMiniTable concepts={note.concepts} mode={mode} />}

              {/* Concept blocks — each collapsible */}
              {note.concepts.length > 0 && note.concepts.map((c) => (
                <ConceptBlock
                  key={c.ordinal}
                  concept={c}
                  mode={mode}
                  note={note}
                  starred={note.starredConcepts?.includes(c.ordinal) ?? false}
                  onToggleStar={() => onToggleConceptStar(c.ordinal)}
                  onCardsGenerated={onCardsGenerated}
                />
              ))}
            </>
          )}

          {/* Memory shortcuts + Mini Test — only for legacy notes (noteCards/new-schema sections embed these) */}
          {!note.noteCards?.length && !hasNewSchema(note.sections) && note.memoryShortcuts.length > 0 && (() => {
            const lens = getSectionLens(mode, "Memory Hook");
            return (
              <NoteBlock accent="#a78bfa" bg="rgba(167,139,250,0.05)" icon={lens?.icon ?? "🧠"} label={(lens?.label ?? "Memory Hooks").toUpperCase()}>
                {note.memoryShortcuts.map((s, i) => (
                  <div key={i} style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", lineHeight: 1.65, marginBottom: i < note.memoryShortcuts.length - 1 ? 6 : 0 }}>
                    👉 {s}
                  </div>
                ))}
              </NoteBlock>
            );
          })()}

          {!note.noteCards?.length && !hasNewSchema(note.sections) && note.miniTest && note.miniTest.length > 0 && (() => {
            const lens = getSectionLens(mode, "Recall Questions");
            return (
              <NoteBlock accent="#6ee7b7" bg="rgba(52,211,153,0.05)" icon={lens?.icon ?? "📝"} label={(lens?.label ?? "Recall Questions").toUpperCase()}>
                {note.miniTest.map((q, i) => (
                  <div key={i} style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", lineHeight: 1.65, marginBottom: 4 }}>
                    {i + 1}. {q}
                  </div>
                ))}
              </NoteBlock>
            );
          })()}

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

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
            <button
              type="button"
              onClick={handleGenerateCards}
              disabled={cardsSaving}
              style={{
                flex: 2,
                padding: "9px 0",
                borderRadius: 8,
                border: cardsSaved ? "1px solid rgba(99,102,241,0.5)" : "1px solid rgba(99,102,241,0.2)",
                background: cardsSaved ? "rgba(99,102,241,0.14)" : "rgba(99,102,241,0.06)",
                color: cardsSaved ? "#a5b4fc" : "#818cf8",
                fontSize: 12,
                fontWeight: 700,
                cursor: cardsSaving ? "wait" : "pointer",
                opacity: cardsSaving ? 0.6 : 1,
                transition: "all 0.18s",
              }}
            >
              {cardsSaving ? "Saving…" : cardsSaved ? "✓ Cards saved to Recall Lab" : "🎯 Generate Cards from Note"}
            </button>
            {onOpenWhiteboard && (
              <button type="button" onClick={() => onOpenWhiteboard(note)} style={actionBtn("#6ee7b7")}>
                🖼️ Whiteboard
              </button>
            )}
            {onNavigate && (
              <button type="button" onClick={() => onNavigate(note.pageNumber)} style={actionBtn("#3b82f6")}>
                Go to page {note.pageNumber}
              </button>
            )}
            <button type="button" onClick={onCopy} style={actionBtn(copiedId === note.id ? "#10b981" : "#6b7280")}>
              {copiedId === note.id ? "✓ Copied" : "Copy"}
            </button>
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
  "Core Idea":         { accent: "#fbbf24", bg: "rgba(251,191,36,0.06)",  icon: "🎯" },
  "Must Know":         { accent: "#38bdf8", bg: "rgba(56,189,248,0.05)",  icon: "📌" },
  "Mechanism":         { accent: "#34d399", bg: "rgba(52,211,153,0.05)",  icon: "⚙️" },
  "DAT/Dental Trap":   { accent: "#f87171", bg: "rgba(248,113,113,0.06)", icon: "⚠️" },
  "Memory Hook":       { accent: "#a78bfa", bg: "rgba(167,139,250,0.05)", icon: "🧠" },
  "Recall Questions":  { accent: "#6ee7b7", bg: "rgba(110,231,183,0.05)", icon: "📝" },
  "Source":            { accent: "#64748b", bg: "rgba(100,116,139,0.06)", icon: "📖" },
  "Clinical Reasoning": { accent: "#c084fc", bg: "rgba(192,132,252,0.05)", icon: "🧩" },
  "Common Mistake":     { accent: "#fb7185", bg: "rgba(251,113,133,0.06)", icon: "❌" },
  "Exam Strategy":      { accent: "#fbbf24", bg: "rgba(251,191,36,0.05)",  icon: "🎯" },
  "Connection Map":     { accent: "#22d3ee", bg: "rgba(34,211,238,0.05)",  icon: "🔗" },
  "Clinical Pearl":     { accent: "#facc15", bg: "rgba(250,204,21,0.06)",  icon: "💎" },
  "Summary":            { accent: "#fbbf24", bg: "rgba(251,191,36,0.05)",  icon: "🧾" },
};

// Expert-notebook reading order for the card grid below. Sort, not filter —
// any label absent from this list (future section) still renders, just last,
// instead of silently disappearing (the lesson from Phase 4's SUBJECT_ORDER).
const SECTION_ORDER = [
  "Core Idea", "Must Know", "Mechanism", "Clinical Reasoning", "DAT/Dental Trap",
  "Common Mistake", "Memory Hook", "Exam Strategy", "Connection Map",
  "Clinical Pearl", "Recall Questions", "Summary", "Source",
];

function SectionsView({ sections, mode }: { sections: import("@/lib/notelab/ultraNoteStore").NoteSection[]; mode: ProfessionMode }) {
  const ordered = [...sections].sort((a, b) => {
    const ai = SECTION_ORDER.indexOf(a.label);
    const bi = SECTION_ORDER.indexOf(b.label);
    return (ai === -1 ? SECTION_ORDER.length : ai) - (bi === -1 ? SECTION_ORDER.length : bi);
  });
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
      {ordered.map((sec) => {
        const style = SECTION_STYLE[sec.label] ?? { accent: "#94a3b8", bg: "rgba(148,163,184,0.05)", icon: "•" };
        const lens = getSectionLens(mode, sec.label);
        const label = lens?.label ?? sec.label;
        const icon = lens?.icon ?? style.icon;
        return (
          <div key={sec.label} style={{ borderRadius: 9, border: `1px solid ${style.accent}28`, background: style.bg, padding: "10px 13px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: style.accent, marginBottom: 7 }}>
              {icon} {label.toUpperCase()}
            </div>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.9)", lineHeight: 1.75, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {sec.content}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const NEW_SCHEMA_LABELS = new Set(["Core Idea", "Must Know", "Mechanism", "DAT/Dental Trap", "Memory Hook", "Recall Questions", "Summary", "Source"]);

function hasNewSchema(sections?: import("@/lib/notelab/ultraNoteStore").NoteSection[]): boolean {
  if (!sections?.length) return false;
  return sections.some((s) => NEW_SCHEMA_LABELS.has(s.label));
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
