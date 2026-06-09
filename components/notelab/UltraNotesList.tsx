"use client";
// components/notelab/UltraNotesList.tsx
// Displays Ultra Notes saved from the right panel's "Generate Ultra Note" button.
// Notes are grouped by subject folder → book, then sorted newest first.

import React, { useCallback, useEffect, useState } from "react";
import {
  getAllUltraNotes,
  deleteUltraNote,
  formatUltraNoteText,
  type UltraNote,
  type NoteSubject,
} from "@/lib/notelab/ultraNoteStore";
import { buildRecallSetFromNote, saveRecallSet } from "@/lib/recalllab/recallStore";

interface UltraNotesListProps {
  bookId?: string;
  onNavigateToPage?: (pageNumber: number) => void;
  /** Increment this to force a re-read from localStorage after a note is saved */
  refreshKey?: number;
  onCardsGenerated?: (setId: string) => void;
}

const SUBJECT_ORDER: NoteSubject[] = ["Biology", "Calculus", "Dental / Clinical", "General Notes"];

const SUBJECT_ICON: Record<NoteSubject, string> = {
  "Biology": "🧬",
  "Calculus": "📐",
  "Dental / Clinical": "🦷",
  "General Notes": "📝",
};

export default function UltraNotesList({ bookId, onNavigateToPage, refreshKey, onCardsGenerated }: UltraNotesListProps) {
  const [notes, setNotes] = useState<UltraNote[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [collapsedSubjects, setCollapsedSubjects] = useState<Set<NoteSubject>>(new Set());
  const [collapsedBooks, setCollapsedBooks] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<UltraNote | null>(null);

  const reload = useCallback(() => {
    const all = getAllUltraNotes();
    const filtered = bookId ? all.filter((n) => n.bookId === bookId) : all;
    console.log("[NOTELAB_RELOAD]", {
      totalInStorage: all.length,
      bookId: bookId ?? null,
      filteredCount: filtered.length,
    });
    setNotes(filtered);
  }, [bookId]);

  useEffect(() => { reload(); }, [reload, refreshKey]);

  useEffect(() => {
    const handler = () => {
      reload();
      const current = getAllUltraNotes();
      const count = bookId ? current.filter(n => n.bookId === bookId).length : current.length;
      console.log("[NOTELAB_STATE_COUNT]", { count, bookId });
    };
    window.addEventListener("note-lab-updated", handler);
    return () => window.removeEventListener("note-lab-updated", handler);
  }, [reload, bookId]);

  function requestDelete(note: UltraNote) {
    console.log("[NOTELAB_DELETE_CLICK]", { id: note.id, topic: note.topic, page: note.pageNumber });
    setConfirmDelete(note);
  }

  async function confirmDeleteNote() {
    if (!confirmDelete) return;
    const { id, topic, pageNumber } = confirmDelete;
    console.log("[NOTELAB_DELETE_CONFIRMED]", { id, topic, page: pageNumber });
    setConfirmDelete(null);
    try {
      await deleteUltraNote(id);
      reload();
      console.log("[NOTELAB_DELETE_SUCCESS]", { id, topic, page: pageNumber });
    } catch (e) {
      console.error("[NOTELAB_DELETE_FAILED]", { id, error: String(e) });
    }
  }

  async function handleCopy(note: UltraNote) {
    const text = formatUltraNoteText(note);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(note.id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      // clipboard not available — silently skip
    }
  }

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

  if (notes.length === 0) {
    return (
      <>
        {confirmDelete && <DeleteModal note={confirmDelete} onConfirm={confirmDeleteNote} onCancel={() => setConfirmDelete(null)} />}
        <div style={{ padding: "32px 24px", textAlign: "center", color: "rgba(148,163,184,0.7)" }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>📝</div>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>No notes yet</div>
        <div style={{ fontSize: 12, lineHeight: 1.6 }}>
          Open any instructional page and click{" "}
          <span style={{ color: "#fcd34d" }}>⚡ Generate Ultra Note</span> in the right panel.
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
      {confirmDelete && <DeleteModal note={confirmDelete} onConfirm={confirmDeleteNote} onCancel={() => setConfirmDelete(null)} />}
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px 12px" }}>
      {usedSubjects.map((subject) => {
        const byBook = bySubject.get(subject)!;
        const isSubjectCollapsed = collapsedSubjects.has(subject);
        const totalCount = [...byBook.values()].reduce((n, arr) => n + arr.length, 0);

        return (
          <div key={subject} style={{ borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", overflow: "hidden", background: "rgba(8,16,32,0.6)" }}>
            {/* Subject header */}
            <div
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", cursor: "pointer", userSelect: "none", background: "rgba(255,255,255,0.04)" }}
              onClick={() => toggleSubject(subject)}
            >
              <span style={{ fontSize: 16 }}>{SUBJECT_ICON[subject]}</span>
              <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>{subject}</span>
              <span style={{ fontSize: 10, color: "rgba(148,163,184,0.6)" }}>{totalCount} note{totalCount !== 1 ? "s" : ""}</span>
              <span style={{ fontSize: 10, color: "rgba(148,163,184,0.4)", marginLeft: 4 }}>{isSubjectCollapsed ? "▶" : "▼"}</span>
            </div>

            {!isSubjectCollapsed && [...byBook.entries()].map(([bid, bookNotes]) => {
              const bookKey = `${subject}:${bid}`;
              const isBookCollapsed = collapsedBooks.has(bookKey);
              const bookLabel = bid.length > 32 ? bid.slice(0, 32) + "…" : bid;

              return (
                <div key={bid} style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                  {/* Book sub-header (only shown when viewing all books, not filtered to one) */}
                  {!bookId && (
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 16px", cursor: "pointer", userSelect: "none" }}
                      onClick={() => toggleBook(bookKey)}
                    >
                      <span style={{ fontSize: 12 }}>📖</span>
                      <span style={{ flex: 1, fontSize: 11, color: "rgba(148,163,184,0.8)", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {bookNotes[0]?.bookTitle || bookLabel}
                      </span>
                      <span style={{ fontSize: 10, color: "rgba(148,163,184,0.4)" }}>{isBookCollapsed ? "▶" : "▼"}</span>
                    </div>
                  )}

                  {(!bookId || !isBookCollapsed) && !isBookCollapsed && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "0 8px 8px" }}>
                      {bookNotes.map((note) => {
                        const isExpanded = expandedId === note.id;
                        return (
                          <NoteCard
                            key={note.id}
                            note={note}
                            isExpanded={isExpanded}
                            copiedId={copiedId}
                            onToggle={() => setExpandedId(isExpanded ? null : note.id)}
                            onCopy={() => handleCopy(note)}
                            onDelete={() => requestDelete(note)}
                            onNavigate={onNavigateToPage}
                            onCardsGenerated={onCardsGenerated}
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

function DeleteModal({ note, onConfirm, onCancel }: { note: UltraNote; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)" }}>
      <div style={{ background: "#0f172a", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 14, padding: "24px 28px", maxWidth: 380, width: "90%", boxShadow: "0 24px 64px rgba(0,0,0,0.6)" }}>
        <div style={{ fontSize: 18, marginBottom: 10 }}>🗑️</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.9)", marginBottom: 6 }}>Delete this note?</div>
        <div style={{ fontSize: 12, color: "rgba(148,163,184,0.8)", marginBottom: 4 }}>{note.topic}</div>
        <div style={{ fontSize: 11, color: "rgba(148,163,184,0.5)", marginBottom: 20 }}>Page {note.pageNumber} · {new Date(note.createdAt).toLocaleDateString()}</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" onClick={onCancel} style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
            Cancel
          </button>
          <button type="button" onClick={onConfirm} style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: "1px solid rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.12)", color: "#f87171", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            Delete permanently
          </button>
        </div>
      </div>
    </div>
  );
}

function NoteCard({
  note,
  isExpanded,
  copiedId,
  onToggle,
  onCopy,
  onDelete,
  onNavigate,
  onCardsGenerated,
}: {
  note: UltraNote;
  isExpanded: boolean;
  copiedId: string | null;
  onToggle: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onNavigate?: (page: number) => void;
  onCardsGenerated?: (setId: string) => void;
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
      setTimeout(() => setCardsSaved(false), 2200);
    } catch (e) {
      console.error("[NOTELAB_CARDS_SAVE_FAILED]", String(e));
    } finally {
      setCardsSaving(false);
    }
  }
  return (
    <div
      style={{
        borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.07)",
        background: "rgba(11,20,40,0.7)",
        overflow: "hidden",
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 14px",
          cursor: "pointer",
          userSelect: "none",
        }}
        onClick={onToggle}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#fcd34d", marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            ⚡ {note.topic}
          </div>
          <div style={{ fontSize: 10, color: "rgba(148,163,184,0.7)" }}>
            Page {note.pageNumber} · {new Date(note.createdAt).toLocaleDateString()}
          </div>
        </div>
        <span style={{ fontSize: 11, color: "rgba(148,163,184,0.5)", flexShrink: 0 }}>
          {isExpanded ? "▲" : "▼"}
        </span>
      </div>

      {/* Expanded body */}
      {isExpanded && (
        <div style={{ padding: "0 14px 14px" }}>
          {/* Core Idea */}
          <div style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 8, background: "rgba(245,200,66,0.06)", border: "1px solid rgba(245,200,66,0.15)" }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: "#fbbf24", marginBottom: 4 }}>🧠 CORE IDEA</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.9)", lineHeight: 1.6 }}>{note.coreIdea}</div>
          </div>

          {/* Professor Notes — OpenAI synthesis teaching sections */}
          {note.professorNotes && <ProfessorNotesSection notes={note.professorNotes} />}

          {/* Concept blocks */}
          {note.concepts.map((c) => (
            <div key={c.ordinal} style={{ marginBottom: 10, padding: "10px 12px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "white", marginBottom: 8 }}>🧩 {c.ordinal}️⃣ {c.title}</div>
              {c.pattern && <NoteRow label="P — Pattern" text={c.pattern} color="#8fd3ff" />}
              {c.surgicalReason && <NoteRow label="⚡ Surgical Reason" text={c.surgicalReason} color="#ffd580" />}
              {c.trap && <NoteRow label="❗ Trap" text={c.trap} color="#ff9da1" />}
              {c.rule && <NoteRow label="🔥 Rule" text={c.rule} color="#ffb86b" />}
            </div>
          ))}

          {/* Memory shortcuts */}
          {note.memoryShortcuts.length > 0 && (
            <div style={{ marginBottom: 10, padding: "8px 12px", borderRadius: 8, background: "rgba(96,165,250,0.05)", border: "1px solid rgba(96,165,250,0.12)" }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: "#93c5fd", marginBottom: 6 }}>🧠 MEMORY SHORTCUT</div>
              {note.memoryShortcuts.map((s, i) => (
                <div key={i} style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", lineHeight: 1.6 }}>👉 {s}</div>
              ))}
            </div>
          )}

          {/* Mini Test — OpenAI synthesis questions */}
          {note.miniTest && note.miniTest.length > 0 && (
            <div style={{ marginBottom: 10, padding: "10px 12px", borderRadius: 8, background: "rgba(52,211,153,0.04)", border: "1px solid rgba(52,211,153,0.12)" }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: "#6ee7b7", marginBottom: 8 }}>📝 MINI TEST</div>
              {note.miniTest.map((q, i) => (
                <div key={i} style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", lineHeight: 1.6, marginBottom: 4 }}>{i + 1}. {q}</div>
              ))}
            </div>
          )}

          {/* External Study Links — clickable OpenAI-generated search queries */}
          {note.externalStudyLinks && note.externalStudyLinks.length > 0 && (
            <div style={{ marginBottom: 10, padding: "8px 12px", borderRadius: 8, background: "rgba(139,92,246,0.04)", border: "1px solid rgba(139,92,246,0.12)" }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: "#c4b5fd", marginBottom: 6 }}>📚 EXTERNAL STUDY LINKS</div>
              {note.externalStudyLinks.map((l, i) => {
                const base = l.type === "textbook-search"
                  ? "https://scholar.google.com/scholar?q="
                  : "https://www.google.com/search?q=";
                const href = `${base}${encodeURIComponent(l.searchQuery)}`;
                const icon = l.type === "textbook-search" ? "📖" : l.type === "reference" ? "🔗" : "📄";
                return (
                  <a key={i} href={href} target="_blank" rel="noopener noreferrer"
                    style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 12, color: "#c4b5fd", lineHeight: 1.6, textDecoration: "underline", textDecorationStyle: "dotted", marginBottom: 2 }}>
                    <span style={{ flexShrink: 0 }}>{icon}</span>
                    <span>{l.label}</span>
                  </a>
                );
              })}
            </div>
          )}
          {/* Related Teaching Videos — OpenAI-generated YouTube search queries */}
          {note.relatedVideoQueries && note.relatedVideoQueries.length > 0 && (
            <div style={{ marginBottom: 10, padding: "8px 12px", borderRadius: 8, background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.12)" }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: "#fca5a5", marginBottom: 6 }}>📺 RELATED TEACHING VIDEOS</div>
              {note.relatedVideoQueries.map((q, i) => {
                const href = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
                return (
                  <a key={i} href={href} target="_blank" rel="noopener noreferrer"
                    style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 12, color: "#fca5a5", lineHeight: 1.6, textDecoration: "underline", textDecorationStyle: "dotted", marginBottom: 2 }}>
                    <span style={{ flexShrink: 0 }}>▶</span>
                    <span>{q}</span>
                  </a>
                );
              })}
            </div>
          )}

          {/* Generate Cards button */}
          <button
            type="button"
            onClick={handleGenerateCards}
            disabled={cardsSaving}
            style={{
              width: "100%",
              padding: "8px 0",
              borderRadius: 8,
              border: cardsSaved ? "1px solid rgba(99,102,241,0.5)" : "1px solid rgba(99,102,241,0.2)",
              background: cardsSaved ? "rgba(99,102,241,0.12)" : "rgba(99,102,241,0.06)",
              color: cardsSaved ? "#a5b4fc" : "#818cf8",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.06em",
              cursor: cardsSaving ? "wait" : "pointer",
              marginBottom: 8,
              transition: "all 0.18s",
              opacity: cardsSaving ? 0.6 : 1,
            }}
          >
            {cardsSaving ? "Saving…" : cardsSaved ? "✓ Cards saved to Recall Lab" : "🎯 Generate Cards from Note"}
          </button>

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 8 }}>
            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate(note.pageNumber)}
                style={actionBtnStyle("#3b82f6")}
              >
                Go to page {note.pageNumber}
              </button>
            )}
            <button type="button" onClick={onCopy} style={actionBtnStyle(copiedId === note.id ? "#10b981" : "#6b7280")}>
              {copiedId === note.id ? "✓ Copied" : "Copy text"}
            </button>
            <button type="button" onClick={onDelete} style={actionBtnStyle("#ef4444")}>
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ProfessorNotesSection({ notes }: { notes: NonNullable<import("@/lib/notelab/ultraNoteStore").UltraNote["professorNotes"]> }) {
  const rows: Array<{ icon: string; label: string; text: string; color: string }> = [
    { icon: "💡", label: "Why This Matters",  text: notes.whyItMatters    ?? "", color: "#fbbf24" },
    { icon: "⚙️", label: "Key Mechanism",     text: notes.keyMechanism    ?? "", color: "#38bdf8" },
    { icon: "⚠️", label: "Common Confusion",  text: notes.commonConfusion ?? "", color: "#f87171" },
    { icon: "🧠", label: "Quick Memory",      text: notes.memoryAnchor    ?? "", color: "#a78bfa" },
    { icon: "🔗", label: "Reasoning Flow",    text: notes.reasoningFlow   ?? "", color: "#6ee7b7" },
    { icon: "🎓", label: "Exam Signal",       text: notes.examSignal      ?? "", color: "#fca5a5" },
  ].filter((r) => r.text.length > 0);
  if (!rows.length) return null;
  return (
    <div style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 8, background: "rgba(96,165,250,0.04)", border: "1px solid rgba(96,165,250,0.1)" }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: "#93c5fd", marginBottom: 8 }}>🧑‍🏫 PROFESSOR NOTES</div>
      {rows.map((r) => (
        <div key={r.label} style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: r.color, marginBottom: 2 }}>{r.icon} {r.label}</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", lineHeight: 1.55 }}>{r.text}</div>
        </div>
      ))}
    </div>
  );
}

function NoteRow({ label, text, color }: { label: string; text: string; color: string }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", lineHeight: 1.55 }}>{text}</div>
    </div>
  );
}

function actionBtnStyle(color: string): React.CSSProperties {
  return {
    flex: 1,
    padding: "6px 0",
    borderRadius: 7,
    border: `1px solid ${color}44`,
    background: `${color}14`,
    color,
    fontSize: 11,
    fontWeight: 600,
    cursor: "pointer",
  };
}
