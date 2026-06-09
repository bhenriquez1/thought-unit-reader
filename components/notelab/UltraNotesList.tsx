"use client";
// components/notelab/UltraNotesList.tsx
// Displays Ultra Notes saved from the right panel's "Generate Ultra Note" button.
// Notes are grouped by subject folder → book, then sorted newest first.

import React, { useCallback, useEffect, useState } from "react";
import {
  getAllUltraNotes,
  getAllUltraNotesAsync,
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

  const reload = useCallback(async () => {
    const all = await getAllUltraNotesAsync();
    const filtered = bookId ? all.filter((n) => n.bookId === bookId) : all;
    console.log("[NOTELAB_RELOAD]", {
      totalInStorage: all.length,
      bookId: bookId ?? null,
      filteredCount: filtered.length,
      driver: localStorage.getItem("ultraNotes_in_idb") === "1" ? "indexeddb" : "localstorage",
    });
    setNotes(filtered);
  }, [bookId]);

  useEffect(() => { reload(); }, [reload, refreshKey]);

  // Reload when saveUltraNote dispatches "note-lab-updated" (mirrors RecallLab's recall-lab-updated pattern)
  useEffect(() => {
    const handler = () => {
      reload();
    };
    window.addEventListener("note-lab-updated", handler);
    return () => window.removeEventListener("note-lab-updated", handler);
  }, [reload, bookId]);

  async function handleDelete(id: string) {
    await deleteUltraNote(id);
    reload();
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
      <div style={{ padding: "32px 24px", textAlign: "center", color: "rgba(148,163,184,0.7)" }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>📝</div>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>No notes yet</div>
        <div style={{ fontSize: 12, lineHeight: 1.6 }}>
          Open any instructional page and click{" "}
          <span style={{ color: "#fcd34d" }}>⚡ Generate Ultra Note</span> in the right panel.
        </div>
      </div>
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
                            onDelete={() => handleDelete(note.id)}
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
  );
}

// ── Color-coded block specs ────────────────────────────────────────────────
// Matches the user's desired: Core Idea (blue), High Yield (gold), Mechanism (purple),
// Common Trap (red), Recall Question (teal), Exam Pearl (orange)

const BLOCK_STYLES = {
  coreIdea:  { bg: "rgba(59,130,246,0.08)",  border: "rgba(59,130,246,0.22)",  label: "#60a5fa",  icon: "📘" },
  highYield: { bg: "rgba(245,158,11,0.08)",  border: "rgba(245,158,11,0.22)",  label: "#fbbf24",  icon: "📗" },
  mechanism: { bg: "rgba(139,92,246,0.08)",  border: "rgba(139,92,246,0.22)",  label: "#a78bfa",  icon: "🧠" },
  trap:      { bg: "rgba(239,68,68,0.08)",   border: "rgba(239,68,68,0.22)",   label: "#f87171",  icon: "⚠️" },
  recall:    { bg: "rgba(20,184,166,0.08)",  border: "rgba(20,184,166,0.22)",  label: "#2dd4bf",  icon: "🔁" },
  examPearl: { bg: "rgba(251,146,60,0.08)",  border: "rgba(251,146,60,0.22)",  label: "#fb923c",  icon: "🎯" },
  memory:    { bg: "rgba(99,102,241,0.08)",  border: "rgba(99,102,241,0.22)",  label: "#818cf8",  icon: "💡" },
  concept:   { bg: "rgba(255,255,255,0.03)", border: "rgba(255,255,255,0.09)", label: "#e2e8f0",  icon: "🧩" },
  datFact:   { bg: "rgba(34,197,94,0.07)",   border: "rgba(34,197,94,0.2)",    label: "#4ade80",  icon: "⭐" },
} as const;

function NoteBlock({
  style,
  title,
  children,
  defaultCollapsed = false,
}: {
  style: typeof BLOCK_STYLES[keyof typeof BLOCK_STYLES];
  title: string;
  children: React.ReactNode;
  defaultCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  return (
    <div style={{ marginBottom: 14, borderRadius: 11, background: style.bg, border: `1px solid ${style.border}`, overflow: "hidden" }}>
      <div
        style={{ display: "flex", alignItems: "center", gap: 7, padding: "11px 15px", cursor: "pointer", userSelect: "none" }}
        onClick={() => setCollapsed(c => !c)}
      >
        <span style={{ fontSize: 14 }}>{style.icon}</span>
        <span style={{ flex: 1, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: style.label }}>{title}</span>
        <span style={{ fontSize: 10, color: style.label, opacity: 0.55 }}>{collapsed ? "▶" : "▼"}</span>
      </div>
      {!collapsed && (
        <div style={{ padding: "0 15px 14px" }}>
          {children}
        </div>
      )}
    </div>
  );
}

function BlockText({ text }: { text: string }) {
  return (
    <div style={{
      fontSize: 15,
      color: "rgba(255,255,255,0.92)",
      lineHeight: 1.7,
      wordBreak: "break-word",
      whiteSpace: "pre-wrap",
    }}>{text}</div>
  );
}

function exportNoteMarkdown(note: UltraNote): string {
  const lines: string[] = [`# ${note.topic}`, `**Page ${note.pageNumber}**`, ""];
  lines.push("## 📘 Core Idea", note.coreIdea, "");
  const pn = note.professorNotes;
  if (pn?.whyItMatters)    lines.push("## 📗 High Yield — Why This Matters", pn.whyItMatters, "");
  if (pn?.keyMechanism)    lines.push("## 🧠 Mechanism", pn.keyMechanism, "");
  if (pn?.reasoningFlow)   lines.push("### Reasoning Flow", pn.reasoningFlow, "");
  if (pn?.commonConfusion) lines.push("## ⚠️ Common DAT Trap", pn.commonConfusion, "");
  if (pn?.examSignal)      lines.push("## 🎯 Exam Pearl", pn.examSignal, "");
  if (pn?.memoryAnchor)    lines.push("## 💡 Memory Hook", pn.memoryAnchor, "");
  if (note.memoryShortcuts.length > 0) { lines.push("### Memory Shortcuts"); note.memoryShortcuts.forEach(s => lines.push(`- ${s}`)); lines.push(""); }
  if (note.concepts.length > 0) { lines.push("## 🧩 Concept Blocks"); note.concepts.forEach(c => { lines.push(`### ${c.title}`); if (c.pattern) lines.push(`**Pattern:** ${c.pattern}`); if (c.surgicalReason) lines.push(`**Why:** ${c.surgicalReason}`); if (c.trap) lines.push(`**Trap:** ${c.trap}`); if (c.rule) lines.push(`**Rule:** ${c.rule}`); lines.push(""); }); }
  if (note.miniTest && note.miniTest.length > 0) { lines.push("## 🔁 Recall Questions"); note.miniTest.forEach((q, i) => lines.push(`${i + 1}. ${q}`)); lines.push(""); }
  return lines.join("\n");
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
    } catch (err) {
      console.error("[NOTELAB_GENERATE_CARDS_FAIL]", String(err));
    } finally {
      setCardsSaving(false);
    }
  }

  function handleExportMd() {
    const md = exportNoteMarkdown(note);
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${note.topic.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const pn = note.professorNotes;

  return (
    <div style={{ borderRadius: 13, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(10,18,38,0.9)", overflow: "hidden" }}>
      {/* Header row */}
      <div
        style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", cursor: "pointer", userSelect: "none", background: "rgba(255,255,255,0.03)" }}
        onClick={onToggle}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#fcd34d", marginBottom: 3, lineHeight: 1.4, wordBreak: "break-word" }}>
            ⚡ {note.topic}
          </div>
          <div style={{ fontSize: 11, color: "rgba(148,163,184,0.65)", display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span>p.{note.pageNumber}</span>
            <span>·</span>
            <span>{new Date(note.createdAt).toLocaleDateString()}</span>
            <span>·</span>
            <span>{note.subject}</span>
            {note.concepts.length > 0 && <><span>·</span><span style={{ color: "rgba(167,139,250,0.7)" }}>{note.concepts.length} concepts</span></>}
          </div>
        </div>
        <span style={{ fontSize: 11, color: "rgba(148,163,184,0.4)", flexShrink: 0 }}>{isExpanded ? "▲" : "▼"}</span>
      </div>

      {/* Expanded body */}
      {isExpanded && (
        <div style={{ padding: "14px 16px 18px" }}>

          {/* 1. Core Idea — blue */}
          <NoteBlock style={BLOCK_STYLES.coreIdea} title="CORE IDEA">
            <BlockText text={note.coreIdea} />
          </NoteBlock>

          {/* 2. High Yield — gold */}
          {pn?.whyItMatters && (
            <NoteBlock style={BLOCK_STYLES.highYield} title="HIGH YIELD — WHY THIS MATTERS">
              <BlockText text={pn.whyItMatters} />
            </NoteBlock>
          )}

          {/* 3. Mechanism — purple */}
          {(pn?.keyMechanism || pn?.reasoningFlow) && (
            <NoteBlock style={BLOCK_STYLES.mechanism} title="MECHANISM">
              {pn.keyMechanism && <BlockText text={pn.keyMechanism} />}
              {pn.reasoningFlow && (
                <div style={{ marginTop: pn.keyMechanism ? 8 : 0, fontFamily: "monospace", fontSize: 13, color: "#a78bfa", lineHeight: 1.7 }}>
                  {pn.reasoningFlow}
                </div>
              )}
            </NoteBlock>
          )}

          {/* 4. Common DAT Trap — red */}
          {pn?.commonConfusion && (
            <NoteBlock style={BLOCK_STYLES.trap} title="COMMON DAT TRAP">
              <BlockText text={pn.commonConfusion} />
            </NoteBlock>
          )}

          {/* 5. Exam Pearl — orange */}
          {pn?.examSignal && (
            <NoteBlock style={BLOCK_STYLES.examPearl} title="EXAM PEARL">
              <BlockText text={pn.examSignal} />
            </NoteBlock>
          )}

          {/* 6. Memory Hook — indigo */}
          {(pn?.memoryAnchor || note.memoryShortcuts.length > 0) && (
            <NoteBlock style={BLOCK_STYLES.memory} title="MEMORY HOOK">
              {pn?.memoryAnchor && <BlockText text={pn.memoryAnchor} />}
              {note.memoryShortcuts.map((s, i) => (
                <div key={i} style={{ fontSize: 14, color: "rgba(255,255,255,0.8)", lineHeight: 1.6, marginTop: pn?.memoryAnchor ? 6 : 0 }}>👉 {s}</div>
              ))}
            </NoteBlock>
          )}

          {/* 7. Concept blocks */}
          {note.concepts.length > 0 && (
            <NoteBlock style={BLOCK_STYLES.concept} title={`CONCEPT BLOCKS (${note.concepts.length})`}>
              {note.concepts.map((c) => (
                <ConceptBlock key={c.ordinal} concept={c} />
              ))}
            </NoteBlock>
          )}

          {/* 8. Recall Questions — teal */}
          {note.miniTest && note.miniTest.length > 0 && (
            <NoteBlock style={BLOCK_STYLES.recall} title="RECALL QUESTIONS">
              {note.miniTest.map((q, i) => (
                <div key={i} style={{ fontSize: 14, color: "rgba(255,255,255,0.85)", lineHeight: 1.65, marginBottom: 6, paddingLeft: 4 }}>
                  <span style={{ color: "#2dd4bf", fontWeight: 700, marginRight: 6 }}>{i + 1}.</span>{q}
                </div>
              ))}
            </NoteBlock>
          )}

          {/* External Study Links */}
          {note.externalStudyLinks && note.externalStudyLinks.length > 0 && (
            <div style={{ marginBottom: 10, padding: "10px 12px", borderRadius: 10, background: "rgba(139,92,246,0.05)", border: "1px solid rgba(139,92,246,0.14)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: "#c4b5fd", marginBottom: 6 }}>📚 STUDY RESOURCES</div>
              {note.externalStudyLinks.map((l, i) => {
                const base = l.type === "textbook-search" ? "https://scholar.google.com/scholar?q=" : "https://www.google.com/search?q=";
                const href = `${base}${encodeURIComponent(l.searchQuery)}`;
                return (
                  <a key={i} href={href} target="_blank" rel="noopener noreferrer"
                    style={{ display: "flex", gap: 6, fontSize: 13, color: "#c4b5fd", lineHeight: 1.6, textDecoration: "underline", textDecorationStyle: "dotted", marginBottom: 3 }}>
                    <span>{l.type === "textbook-search" ? "📖" : "🔗"}</span><span>{l.label}</span>
                  </a>
                );
              })}
            </div>
          )}

          {/* Related Videos */}
          {note.relatedVideoQueries && note.relatedVideoQueries.length > 0 && (
            <div style={{ marginBottom: 10, padding: "10px 12px", borderRadius: 10, background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.14)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: "#fca5a5", marginBottom: 6 }}>📺 RELATED VIDEOS</div>
              {note.relatedVideoQueries.map((q, i) => (
                <a key={i} href={`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`} target="_blank" rel="noopener noreferrer"
                  style={{ display: "flex", gap: 6, fontSize: 13, color: "#fca5a5", lineHeight: 1.6, textDecoration: "underline", textDecorationStyle: "dotted", marginBottom: 3 }}>
                  <span>▶</span><span>{q}</span>
                </a>
              ))}
            </div>
          )}

          {/* Action row */}
          <div style={{ display: "flex", gap: 7, marginTop: 8 }}>
            <button
              type="button"
              onClick={handleGenerateCards}
              disabled={cardsSaving}
              style={actionBtnStyle(cardsSaved ? "#10b981" : "#818cf8", true)}
            >
              {cardsSaving ? "…" : cardsSaved ? "✓ In Recall Lab" : "🎯 → Recall Lab"}
            </button>
            <button type="button" onClick={handleExportMd} style={actionBtnStyle("#6b7280")}>
              ⬇ .md
            </button>
            <button type="button" onClick={onCopy} style={actionBtnStyle(copiedId === note.id ? "#10b981" : "#6b7280")}>
              {copiedId === note.id ? "✓" : "Copy"}
            </button>
            {onNavigate && (
              <button type="button" onClick={() => onNavigate(note.pageNumber)} style={actionBtnStyle("#3b82f6")}>
                p.{note.pageNumber}
              </button>
            )}
            <button
              type="button"
              onClick={onDelete}
              style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid rgba(239,68,68,0.35)", background: "rgba(239,68,68,0.12)", color: "#f87171", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
            >
              🗑 Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ConceptRow({ label, text, color }: { label: string; text: string; color: string }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 14, color: "rgba(255,255,255,0.88)", lineHeight: 1.65, wordBreak: "break-word", whiteSpace: "pre-wrap" }}>{text}</div>
    </div>
  );
}

function ConceptBlock({ concept }: { concept: { ordinal: number; title: string; pattern?: string; surgicalReason?: string; trap?: string | null; rule?: string } }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div style={{ marginBottom: 10, borderRadius: 9, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.09)", overflow: "hidden" }}>
      <div
        style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 13px", cursor: "pointer", userSelect: "none" }}
        onClick={() => setCollapsed(c => !c)}
      >
        <span style={{ fontSize: 12, color: "#e2e8f0", fontWeight: 700 }}>{concept.ordinal}.</span>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.95)" }}>{concept.title}</span>
        <span style={{ fontSize: 10, color: "rgba(148,163,184,0.4)" }}>{collapsed ? "▶" : "▼"}</span>
      </div>
      {!collapsed && (
        <div style={{ padding: "0 13px 12px" }}>
          {concept.pattern        && <ConceptRow label="PATTERN"  text={concept.pattern}        color="#8fd3ff" />}
          {concept.surgicalReason && <ConceptRow label="WHY"      text={concept.surgicalReason} color="#ffd580" />}
          {concept.trap           && <ConceptRow label="⚠ TRAP"   text={concept.trap}           color="#ff9da1" />}
          {concept.rule           && <ConceptRow label="RULE"     text={concept.rule}           color="#ffb86b" />}
        </div>
      )}
    </div>
  );
}

function actionBtnStyle(color: string, flex = false): React.CSSProperties {
  return {
    ...(flex ? { flex: 1 } : {}),
    padding: "8px 12px",
    borderRadius: 8,
    border: `1px solid ${color}44`,
    background: `${color}14`,
    color,
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
    transition: "all 0.15s",
    whiteSpace: "nowrap" as const,
  };
}
