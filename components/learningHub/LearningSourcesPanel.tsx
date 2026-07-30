"use client";

// components/learningHub/LearningSourcesPanel.tsx
// Learning Sources — attach supplemental study materials (lecture notes, articles,
// videos, research papers) to a book. The AI extracts high-yield thought units from
// each source and grounds them against the learner's existing textbook concepts.
//
// Grounding constraint: supplemental material enriches textbook concepts.
// It never silently replaces or overwrites any textbook-grounded unit.

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { KnowledgeNode } from "@/lib/knowledge/knowledgeGraphSchema";
import {
  type LearningSource,
  type LearningSourceType,
  type ExtractedThoughtUnit,
  PROVENANCE_LABELS,
  PROVENANCE_COLORS,
  genSourceId,
  genUnitId,
  deleteSource,
  loadSourcesForBook,
  saveSource,
  updateSource,
} from "@/lib/learningHub/learningSourceStore";
import { saveLearningSourceHighlights } from "@/lib/highlights/savedHighlightsStore";
import type { ExtractedThoughtUnitRaw } from "@/pages/api/learning-source-extract";

// ── Constants ─────────────────────────────────────────────────────────────────

const SOURCE_TYPE_OPTIONS: { value: LearningSourceType; icon: string }[] = [
  { value: "lecture_notes", icon: "🎓" },
  { value: "article",       icon: "📄" },
  { value: "video",         icon: "🎬" },
  { value: "audio",         icon: "🎙️" },
  { value: "research",      icon: "🔬" },
  { value: "other",         icon: "📎" },
];

const ANCHOR_TYPE_ICONS: Record<string, string> = {
  coreIdea:    "💡",
  mechanism:   "⚙️",
  application: "🔧",
  trap:        "⚠️",
  definition:  "📖",
  keyDetail:   "🔑",
  memoryAnchor:"🧠",
  formula:     "∑",
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface LearningSourcesPanelProps {
  bookId: string;
  kgNodes: KnowledgeNode[];
  onNavigateToPage?: (page: number) => void;
}

interface AddFormState {
  label:     string;
  type:      LearningSourceType;
  text:      string;
  url:       string;
}

const EMPTY_FORM: AddFormState = {
  label: "",
  type:  "lecture_notes",
  text:  "",
  url:   "",
};

// ── Sub-components ────────────────────────────────────────────────────────────

function ProvenanceBadge({ type }: { type: LearningSourceType }) {
  const c = PROVENANCE_COLORS[type];
  return (
    <span
      className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full shrink-0"
      style={{ color: c.text, background: c.bg, border: `1px solid ${c.border}55` }}
    >
      {PROVENANCE_LABELS[type]}
    </span>
  );
}

function ThoughtUnitCard({ unit, provenanceType }: { unit: ExtractedThoughtUnit; provenanceType: LearningSourceType }) {
  const c = PROVENANCE_COLORS[provenanceType];
  const icon = ANCHOR_TYPE_ICONS[unit.anchorType] ?? "📌";
  return (
    <div
      className="rounded-lg border p-2.5 flex flex-col gap-1.5"
      style={{ borderColor: `${c.border}44`, background: c.bg }}
    >
      <div className="flex items-center gap-1.5">
        <span className="text-[10px]">{icon}</span>
        <span className="text-[8px] font-bold uppercase tracking-wider" style={{ color: c.text }}>
          {unit.anchorType}
        </span>
        {unit.conceptTitle && unit.conceptTitle !== "General" && (
          <span className="text-[8px] text-slate-500 ml-auto truncate max-w-[50%]">
            ↔ {unit.conceptTitle}
          </span>
        )}
      </div>
      <p className="text-[10.5px] text-white/85 leading-snug">{unit.text}</p>
      {unit.grounding && (
        <p className="text-[9px] text-slate-500 leading-snug italic">{unit.grounding}</p>
      )}
      {unit.reason && (
        <p className="text-[8px] font-semibold" style={{ color: c.text }}>{unit.reason}</p>
      )}
    </div>
  );
}

function SourceCard({
  source,
  expanded,
  onToggle,
  onDelete,
}: {
  source:    LearningSource;
  expanded:  boolean;
  onToggle:  () => void;
  onDelete:  () => void;
}) {
  const c = PROVENANCE_COLORS[source.type];
  const icon = SOURCE_TYPE_OPTIONS.find(o => o.value === source.type)?.icon ?? "📎";

  return (
    <div
      className="rounded-xl border transition-all"
      style={{ borderColor: expanded ? c.border : `${c.border}55`, background: c.bg }}
    >
      {/* Header row */}
      <button
        type="button"
        className="w-full flex items-center gap-2 p-3 text-left"
        onClick={onToggle}
      >
        <span className="text-base shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-semibold text-white/90 truncate">{source.label}</span>
            <ProvenanceBadge type={source.type} />
          </div>
          <div className="text-[9px] text-slate-500 mt-0.5">
            {source.thoughtUnits.length} thought unit{source.thoughtUnits.length !== 1 ? "s" : ""}
            {source.url && (
              <span className="ml-1.5 truncate max-w-[120px] inline-block align-bottom" title={source.url}>
                · {source.url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 30)}
              </span>
            )}
          </div>
        </div>
        <span className="text-slate-600 text-[10px] shrink-0">{expanded ? "▲" : "▼"}</span>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t px-3 pb-3 pt-2.5 space-y-2" style={{ borderColor: `${c.border}33` }}>
          {source.thoughtUnits.length === 0 ? (
            <p className="text-[10px] text-slate-500">No thought units extracted yet.</p>
          ) : (
            source.thoughtUnits.map(u => (
              <ThoughtUnitCard key={u.id} unit={u} provenanceType={source.type} />
            ))
          )}
          <button
            type="button"
            onClick={onDelete}
            className="mt-1 text-[9px] text-rose-400/70 hover:text-rose-400 transition-colors"
          >
            Remove source
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function LearningSourcesPanel({
  bookId,
  kgNodes,
  onNavigateToPage: _onNavigateToPage,
}: LearningSourcesPanelProps) {
  const [sources,     setSources]     = useState<LearningSource[]>([]);
  const [expandedId,  setExpandedId]  = useState<string | null>(null);
  const [showAdd,     setShowAdd]     = useState(false);
  const [form,        setForm]        = useState<AddFormState>(EMPTY_FORM);
  const [extracting,  setExtracting]  = useState(false);
  const [extractError,setExtractError]= useState<string | null>(null);
  const formRef = useRef<HTMLTextAreaElement>(null);

  // Load sources on mount / bookId change
  useEffect(() => {
    if (!bookId) return;
    let alive = true;
    loadSourcesForBook(bookId).then(s => { if (alive) setSources(s); }).catch(() => {});
    return () => { alive = false; };
  }, [bookId]);

  const openAddForm = () => {
    setForm(EMPTY_FORM);
    setExtractError(null);
    setShowAdd(true);
    setTimeout(() => formRef.current?.focus(), 50);
  };

  const handleDelete = useCallback(async (id: string) => {
    await deleteSource(id).catch(() => {});
    setSources(prev => prev.filter(s => s.id !== id));
    if (expandedId === id) setExpandedId(null);
  }, [expandedId]);

  const handleExtract = async () => {
    if (!form.text.trim() || !form.label.trim()) {
      setExtractError("Please fill in the source name and paste the source text.");
      return;
    }

    setExtracting(true);
    setExtractError(null);

    try {
      const conceptTitles = kgNodes.map(n => n.title);
      const provenanceLabel = PROVENANCE_LABELS[form.type];

      const resp = await fetch("/api/learning-source-extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceText:    form.text,
          sourceLabel:   provenanceLabel,
          conceptTitles,
        }),
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const data = await resp.json() as { thoughtUnits: ExtractedThoughtUnitRaw[]; provider: string; error?: string };

      if (data.error && data.thoughtUnits.length === 0) {
        throw new Error(data.error);
      }

      const units: ExtractedThoughtUnit[] = data.thoughtUnits.map(u => ({
        ...u,
        id: genUnitId(),
      }));

      const newSource: LearningSource = {
        id:           genSourceId(),
        bookId,
        label:        form.label.trim(),
        type:         form.type,
        text:         form.text,
        url:          form.url.trim() || undefined,
        thoughtUnits: units,
        createdAt:    Date.now(),
      };

      await saveSource(newSource);

      // Persist extracted units as SavedHighlight records so they show in
      // the syllabus thought-unit tree. sourceType="learning-source" keeps
      // them clearly distinct from textbook-grounded highlights.
      if (units.length > 0) {
        await saveLearningSourceHighlights(
          bookId,
          newSource.id,
          provenanceLabel,
          units.map(u => ({ text: u.text, anchorType: u.anchorType, reason: u.reason })),
        ).catch(() => {});
      }

      setSources(prev => [newSource, ...prev]);
      setExpandedId(newSource.id);
      setShowAdd(false);
      setForm(EMPTY_FORM);
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : "Extraction failed — try again.");
    } finally {
      setExtracting(false);
    }
  };

  const totalUnits = sources.reduce((n, s) => n + s.thoughtUnits.length, 0);

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Learning Sources</div>
          {sources.length > 0 && (
            <div className="text-[9px] text-slate-600 mt-0.5">
              {sources.length} source{sources.length !== 1 ? "s" : ""} · {totalUnits} thought unit{totalUnits !== 1 ? "s" : ""}
            </div>
          )}
        </div>
        {!showAdd && (
          <button
            type="button"
            onClick={openAddForm}
            className="text-[10px] font-semibold px-2.5 py-1 rounded-lg bg-indigo-700/30 hover:bg-indigo-600/40 border border-indigo-500/30 text-indigo-300 transition-colors"
          >
            + Add Source
          </button>
        )}
      </div>

      {/* Grounding notice */}
      <div className="rounded-lg border border-amber-500/20 bg-amber-950/20 px-3 py-2 text-[9px] text-amber-300/70 leading-relaxed">
        Supplemental material <span className="font-semibold">enriches</span> your textbook concepts — it does not replace them.
        Extracted thought units are tagged with their source and grounded against the closest textbook concept.
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="rounded-xl border border-indigo-500/30 bg-indigo-950/20 p-3 space-y-3">
          <div className="text-[10px] font-bold text-indigo-300">New Learning Source</div>

          {/* Source type picker */}
          <div>
            <div className="text-[8px] font-bold uppercase tracking-wider text-slate-500 mb-1">Source Type</div>
            <div className="flex flex-wrap gap-1.5">
              {SOURCE_TYPE_OPTIONS.map(o => {
                const active = form.type === o.value;
                const c = PROVENANCE_COLORS[o.value];
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, type: o.value }))}
                    className="flex items-center gap-1 text-[9px] font-semibold px-2 py-1 rounded-full border transition-all"
                    style={active
                      ? { color: c.text, background: c.bg, borderColor: c.border }
                      : { color: "#64748b", background: "transparent", borderColor: "#334155" }
                    }
                  >
                    <span>{o.icon}</span>
                    <span>{PROVENANCE_LABELS[o.value]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Label */}
          <div>
            <div className="text-[8px] font-bold uppercase tracking-wider text-slate-500 mb-1">Source Name</div>
            <input
              type="text"
              value={form.label}
              onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
              placeholder='e.g. "Prof. Rivera — Genetics Lecture 4"'
              className="w-full rounded-lg border border-white/10 bg-slate-900/60 px-2.5 py-1.5 text-[10px] text-white/90 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50"
            />
          </div>

          {/* Optional URL */}
          <div>
            <div className="text-[8px] font-bold uppercase tracking-wider text-slate-500 mb-1">URL (optional)</div>
            <input
              type="url"
              value={form.url}
              onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
              placeholder="https://..."
              className="w-full rounded-lg border border-white/10 bg-slate-900/60 px-2.5 py-1.5 text-[10px] text-white/90 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50"
            />
          </div>

          {/* Source text */}
          <div>
            <div className="text-[8px] font-bold uppercase tracking-wider text-slate-500 mb-1">Source Text</div>
            <textarea
              ref={formRef}
              value={form.text}
              onChange={e => setForm(f => ({ ...f, text: e.target.value }))}
              placeholder="Paste transcript, article text, lecture notes, or any study material…"
              rows={8}
              className="w-full rounded-lg border border-white/10 bg-slate-900/60 px-2.5 py-2 text-[10px] text-white/90 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 resize-y leading-relaxed"
            />
            <div className="text-[8px] text-slate-600 mt-0.5">
              {form.text.length > 0 ? `${form.text.length.toLocaleString()} chars` : "Up to 6,000 chars processed per extraction"}
            </div>
          </div>

          {extractError && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-950/20 px-2.5 py-1.5 text-[9px] text-rose-300">
              {extractError}
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExtract}
              disabled={extracting || !form.text.trim() || !form.label.trim()}
              className="flex-1 rounded-lg border border-indigo-500/40 bg-indigo-700/40 hover:bg-indigo-600/50 disabled:opacity-40 disabled:pointer-events-none px-3 py-1.5 text-[10px] font-semibold text-indigo-200 transition-colors"
            >
              {extracting ? "Extracting thought units…" : "Extract Thought Units →"}
            </button>
            <button
              type="button"
              onClick={() => { setShowAdd(false); setExtractError(null); }}
              className="px-3 py-1.5 text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Source list */}
      {sources.length === 0 && !showAdd ? (
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
          <div className="text-4xl">📚</div>
          <div className="text-[11px] font-medium text-slate-400">No learning sources yet</div>
          <div className="text-[9.5px] text-slate-600 max-w-xs leading-relaxed">
            Add lecture notes, articles, videos, or research papers. The AI extracts
            key thought units and grounds them against your textbook concepts.
          </div>
          <button
            type="button"
            onClick={openAddForm}
            className="mt-1 text-[10px] font-semibold px-3 py-1.5 rounded-lg bg-indigo-700/30 hover:bg-indigo-600/40 border border-indigo-500/30 text-indigo-300 transition-colors"
          >
            + Add Your First Source
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {sources.map(s => (
            <SourceCard
              key={s.id}
              source={s}
              expanded={expandedId === s.id}
              onToggle={() => setExpandedId(prev => prev === s.id ? null : s.id)}
              onDelete={() => handleDelete(s.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
