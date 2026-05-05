"use client";
// components/notelab/UltraNotesList.tsx
// Displays Ultra Notes saved from the right panel's "Generate Ultra Note" button.

import React, { useCallback, useEffect, useState } from "react";
import {
  getAllUltraNotes,
  deleteUltraNote,
  formatUltraNoteText,
  type UltraNote,
} from "@/lib/notelab/ultraNoteStore";

interface UltraNotesListProps {
  bookId?: string;
  onNavigateToPage?: (pageNumber: number) => void;
  /** Increment this to force a re-read from localStorage after a note is saved */
  refreshKey?: number;
}

export default function UltraNotesList({ bookId, onNavigateToPage, refreshKey }: UltraNotesListProps) {
  const [notes, setNotes] = useState<UltraNote[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const reload = useCallback(() => {
    const all = getAllUltraNotes();
    setNotes(bookId ? all.filter((n) => n.bookId === bookId) : all);
  }, [bookId]);

  useEffect(() => { reload(); }, [reload, refreshKey]);

  function handleDelete(id: string) {
    deleteUltraNote(id);
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "16px 16px" }}>
      {notes.map((note) => {
        const isExpanded = expandedId === note.id;
        return (
          <div
            key={note.id}
            style={{
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.08)",
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
              onClick={() => setExpandedId(isExpanded ? null : note.id)}
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
                  <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(96,165,250,0.05)", border: "1px solid rgba(96,165,250,0.12)" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: "#93c5fd", marginBottom: 6 }}>🧠 MEMORY SHORTCUT</div>
                    {note.memoryShortcuts.map((s, i) => (
                      <div key={i} style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", lineHeight: 1.6 }}>👉 {s}</div>
                    ))}
                  </div>
                )}

                {/* Action buttons */}
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  {onNavigateToPage && (
                    <button
                      type="button"
                      onClick={() => onNavigateToPage(note.pageNumber)}
                      style={actionBtnStyle("#3b82f6")}
                    >
                      Go to page {note.pageNumber}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleCopy(note)}
                    style={actionBtnStyle(copiedId === note.id ? "#10b981" : "#6b7280")}
                  >
                    {copiedId === note.id ? "✓ Copied" : "Copy text"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(note.id)}
                    style={actionBtnStyle("#ef4444")}
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
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
