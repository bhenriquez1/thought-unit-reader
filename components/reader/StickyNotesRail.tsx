// components/reader/StickyNotesRail.tsx
// C1 — Reader Sticky Notes. Quick, page-linked annotations that live in the
// Reader's left panel (the PDF-viewer pane) — distinct from NoteLab's
// permanent, polished notebook (components/notelab/*). A sticky note is a
// fast "leave a marker here" action while reading, not a synthesized study
// artifact.
//
// Mounted as an absolutely-positioned overlay inside the PDF-viewer pane,
// the same technique this file's caller (pages/index.tsx) already uses for
// AskPagePanel — it never touches the Reader/RightPanel width split.

import React, { useEffect, useState, useCallback } from "react";
import {
  createStickyNote,
  updateStickyNoteText,
  deleteStickyNote,
  getStickyNotesForDocument,
  type StickyNote,
} from "@/lib/stickyNotes/stickyNoteStore";

interface Props {
  documentId: string;
  pageTruthKey: string;
  pageNumber: number;
  /** Navigates the Reader to a given page — wired to pages/index.tsx's syncToPage. */
  onJumpToPage: (page: number) => void;
}

const QUICK_PROMPTS = [
  "Ask Professor about this",
  "I don't understand this mechanism",
  "Important for DAT",
  "Review before exam",
];

export default function StickyNotesRail({ documentId, pageTruthKey, pageNumber, onJumpToPage }: Props) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<StickyNote[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [scope, setScope] = useState<"page" | "book">("page");
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    if (!documentId) return;
    try {
      const all = await getStickyNotesForDocument(documentId);
      setNotes(all);
    } catch {
      // Storage failure is non-fatal — the rail just shows nothing until retried.
    } finally {
      setLoaded(true);
    }
  }, [documentId]);

  // Re-fetches on open, and again on every page turn while open, so a note
  // created on another page this session shows up without re-opening the rail.
  useEffect(() => { if (open) refresh(); }, [open, pageNumber, refresh]);

  const handleAdd = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || !documentId || saving) return;
    setSaving(true);
    try {
      await createStickyNote({ documentId, pageTruthKey, pageNumber, text: trimmed });
      setDraft("");
      await refresh();
    } finally {
      setSaving(false);
    }
  }, [documentId, pageTruthKey, pageNumber, saving, refresh]);

  const handleEdit = useCallback(async (id: string, text: string) => {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, text } : n)));
    await updateStickyNoteText(id, text);
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    await deleteStickyNote(id);
  }, []);

  const pageCount = notes.filter((n) => n.pageNumber === pageNumber).length;
  const visible = scope === "page" ? notes.filter((n) => n.pageNumber === pageNumber) : notes;

  return (
    <>
      {/* Always-visible toggle tab, fixed to the left edge of the PDF pane. */}
      <button
        onClick={() => setOpen((o) => !o)}
        className={`absolute left-0 top-24 z-30 flex items-center gap-1.5 rounded-r-lg border border-l-0 border-amber-500/30 bg-slate-950/90 px-2.5 py-2 text-xs font-semibold text-amber-200 shadow-lg backdrop-blur-sm transition-colors hover:bg-slate-900 ${open ? "opacity-0 pointer-events-none" : ""}`}
        aria-label="Open sticky notes"
        aria-expanded={open}
      >
        <span>📝</span>
        {pageCount > 0 && <span className="tabular-nums">{pageCount}</span>}
      </button>

      {open && (
        <div className="absolute left-0 top-0 bottom-0 z-40 flex w-[300px] flex-col border-r border-white/10 bg-slate-950/97 shadow-2xl backdrop-blur-md">
          {/* Header */}
          <div className="flex-shrink-0 border-b border-white/10 px-3 py-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-widest text-amber-300">📝 Sticky Notes</span>
              <button
                onClick={() => setOpen(false)}
                className="rounded p-1 text-slate-500 hover:bg-white/10 hover:text-white"
                aria-label="Close sticky notes"
              >
                ✕
              </button>
            </div>
            <div className="mt-2 flex gap-1">
              <button
                onClick={() => setScope("page")}
                className={`flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                  scope === "page" ? "bg-amber-600/20 text-amber-200 border border-amber-600/30" : "text-slate-400 hover:bg-white/5"
                }`}
              >
                This page ({pageCount})
              </button>
              <button
                onClick={() => setScope("book")}
                className={`flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                  scope === "book" ? "bg-amber-600/20 text-amber-200 border border-amber-600/30" : "text-slate-400 hover:bg-white/5"
                }`}
              >
                All pages ({notes.length})
              </button>
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
            {loaded && visible.length === 0 && (
              <p className="text-xs text-slate-500 italic px-1">
                {scope === "page" ? "No notes on this page yet." : "No notes in this book yet."}
              </p>
            )}
            {visible.map((note) => (
              <div key={note.id} className="rounded-lg border border-white/10 bg-white/5 p-2.5">
                <div className="flex items-center justify-between mb-1.5">
                  <button
                    onClick={() => onJumpToPage(note.pageNumber)}
                    className="text-[10px] font-semibold text-amber-400/80 hover:text-amber-300 hover:underline"
                    title="Jump back to this page"
                  >
                    Page {note.pageNumber} →
                  </button>
                  <button
                    onClick={() => handleDelete(note.id)}
                    className="text-[10px] text-slate-500 hover:text-red-400"
                    aria-label="Delete note"
                  >
                    Delete
                  </button>
                </div>
                <textarea
                  defaultValue={note.text}
                  onBlur={(e) => { if (e.target.value.trim() !== note.text) handleEdit(note.id, e.target.value.trim()); }}
                  rows={2}
                  className="w-full resize-none rounded-md bg-transparent text-sm text-slate-200 placeholder-slate-600 focus:outline-none"
                />
              </div>
            ))}
          </div>

          {/* Compose */}
          <div className="flex-shrink-0 border-t border-white/10 p-3 space-y-2">
            <div className="flex flex-wrap gap-1">
              {QUICK_PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => setDraft(p)}
                  className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-slate-400 hover:bg-white/10 hover:text-slate-200"
                >
                  {p}
                </button>
              ))}
            </div>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={`Add a note for page ${pageNumber}…`}
              rows={2}
              className="w-full resize-none rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500/40"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleAdd(draft); }
              }}
            />
            <button
              onClick={() => handleAdd(draft)}
              disabled={saving || !draft.trim()}
              className="w-full rounded-lg bg-amber-600/80 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? "Saving…" : "Add note"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
