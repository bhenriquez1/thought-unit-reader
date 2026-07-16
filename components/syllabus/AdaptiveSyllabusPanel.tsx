// components/syllabus/AdaptiveSyllabusPanel.tsx
// UI panel for the Universal Adaptive Syllabus Engine.
// Shows document classification, chapter list with importance/difficulty/study time,
// prerequisites, recommended study order, and study roadmap phases.
// Persists one AdaptiveSyllabus per bookId via useAdaptiveSyllabusStore.

import React, { useState, useCallback, useMemo } from "react";
import type { TocNode } from "@/lib/readerContracts";
import { extractStructureCandidates, buildSampleContent } from "@/lib/syllabus/structureExtractor";
import { classifyDocument } from "@/lib/syllabus/documentClassifier";
import { useAdaptiveSyllabusStore } from "@/lib/syllabus/adaptiveSyllabusStore";
import type {
  AdaptiveSyllabus,
  AdaptiveChapter,
  DocumentClassification,
  StructureSource,
} from "@/lib/syllabus/syllabusSchema";

// ── Profile display names ──────────────────────────────────────────────────

const PROFILE_LABELS: Record<string, string> = {
  general:   "General",
  nursing:   "Nursing / Medical",
  dat:       "DAT / Pre-Dental",
  dental:    "Dental",
  biology:   "Biology / MCAT",
  chemistry: "Chemistry",
  physics:   "Physics",
  math:      "Mathematics",
  cs:        "Computer Science",
  law:       "Law",
  history:   "History / Humanities",
};

// ── Source provenance badge ────────────────────────────────────────────────

const SOURCE_COLORS: Record<StructureSource, string> = {
  bookmark:    "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  toc:         "bg-blue-500/20 text-blue-300 border-blue-500/30",
  heading:     "bg-slate-500/20 text-slate-300 border-slate-500/30",
  uploaded:    "bg-violet-500/20 text-violet-300 border-violet-500/30",
  "ai-inferred": "bg-amber-500/20 text-amber-300 border-amber-500/30",
};

const SOURCE_LABELS: Record<StructureSource, string> = {
  bookmark:    "Bookmark",
  toc:         "TOC",
  heading:     "Heading",
  uploaded:    "Uploaded",
  "ai-inferred": "AI",
};

function SourceBadge({ source }: { source: StructureSource }) {
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${SOURCE_COLORS[source]}`}>
      {SOURCE_LABELS[source]}
    </span>
  );
}

// ── Mini bar chart ─────────────────────────────────────────────────────────

function MiniBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-1 w-12 rounded-full bg-slate-700/60">
      <div className={`h-1 rounded-full ${color}`} style={{ width: `${Math.min(100, value)}%` }} />
    </div>
  );
}

// ── Review frequency badge ─────────────────────────────────────────────────

const FREQ_STYLES: Record<string, string> = {
  once:     "bg-slate-500/20 text-slate-400",
  twice:    "bg-blue-500/20 text-blue-300",
  frequent: "bg-amber-500/20 text-amber-300",
};

// ── Chapter card ───────────────────────────────────────────────────────────

interface ChapterCardProps {
  chapter:     AdaptiveChapter;
  index:       number;
  allChapters: AdaptiveChapter[];
  onJump?:     (page: number) => void;
}

function ChapterCard({ chapter, index, allChapters, onJump }: ChapterCardProps) {
  const [expanded, setExpanded] = useState(false);

  const importanceColor =
    chapter.importance >= 80 ? "bg-rose-400" :
    chapter.importance >= 50 ? "bg-amber-400" : "bg-slate-400";

  const difficultyColor =
    chapter.difficulty >= 75 ? "bg-rose-400" :
    chapter.difficulty >= 45 ? "bg-amber-400" : "bg-emerald-400";

  const prereqTitles = chapter.prerequisites
    .map(id => allChapters.find(c => c.candidateId === id)?.title)
    .filter(Boolean) as string[];

  return (
    <div className="rounded-lg border border-white/10 bg-slate-900/40 overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full text-left px-3 py-2.5 hover:bg-slate-800/40 transition-colors"
      >
        <div className="flex items-start gap-2">
          <span className="shrink-0 mt-0.5 text-[10px] font-bold text-slate-500 w-5 text-right">
            {index + 1}.
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[11px] font-semibold text-white ${chapter.level === 1 ? "" : "text-slate-300"}`}>
                {chapter.title}
              </span>
              <SourceBadge source={chapter.source} />
            </div>

            <div className="mt-1.5 flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1">
                <span className="text-[9px] uppercase tracking-wide text-slate-500">Importance</span>
                <MiniBar value={chapter.importance} color={importanceColor} />
                <span className="text-[10px] text-slate-400">{chapter.importance}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[9px] uppercase tracking-wide text-slate-500">Difficulty</span>
                <MiniBar value={chapter.difficulty} color={difficultyColor} />
                <span className="text-[10px] text-slate-400">{chapter.difficulty}</span>
              </div>
              <span className="text-[10px] text-slate-400">
                ~{chapter.estimatedStudyHours.toFixed(1)}h
              </span>
              <span className={`text-[9px] rounded px-1.5 py-0.5 font-medium ${FREQ_STYLES[chapter.reviewFrequency]}`}>
                Review: {chapter.reviewFrequency}
              </span>
            </div>

            {chapter.startPage > 0 && (
              <div className="mt-1 text-[9px] text-slate-500">
                {chapter.endPage
                  ? `p.${chapter.startPage}–${chapter.endPage}`
                  : `p.${chapter.startPage}+`}
              </div>
            )}
          </div>

          <span className="shrink-0 text-slate-600 text-xs mt-0.5">{expanded ? "▾" : "▸"}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-white/5 px-3 py-2 space-y-2">
          {chapter.concepts.length > 0 && (
            <div>
              <div className="text-[9px] uppercase tracking-widest text-slate-500 mb-1">Key Concepts</div>
              <div className="flex flex-wrap gap-1">
                {chapter.concepts.map((c, i) => (
                  <span key={i} className="rounded bg-indigo-500/15 border border-indigo-500/20 px-1.5 py-0.5 text-[10px] text-indigo-300">
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}

          {prereqTitles.length > 0 && (
            <div>
              <div className="text-[9px] uppercase tracking-widest text-slate-500 mb-1">Prerequisites</div>
              <div className="flex flex-wrap gap-1">
                {prereqTitles.map((t, i) => (
                  <span key={i} className="rounded bg-rose-500/10 border border-rose-500/20 px-1.5 py-0.5 text-[10px] text-rose-300">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {onJump && chapter.startPage > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); onJump(chapter.startPage); }}
              className="text-[10px] font-medium text-indigo-300 hover:text-indigo-200"
            >
              Jump to p.{chapter.startPage} →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Classification badge ───────────────────────────────────────────────────

function ClassificationBadge({ classification }: { classification: DocumentClassification }) {
  const pct = Math.round(classification.confidence * 100);
  const color =
    pct >= 80 ? "text-emerald-300 border-emerald-500/30 bg-emerald-500/10" :
    pct >= 55 ? "text-amber-300 border-amber-500/30 bg-amber-500/10" :
                "text-rose-300 border-rose-500/30 bg-rose-500/10";

  return (
    <div className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 ${color}`}>
      <span className="text-[11px] font-semibold">{classification.docType}</span>
      <span className="text-[10px] opacity-70">·</span>
      <span className="text-[10px] font-medium">{pct}% match</span>
      {classification.isMultiDisciplinary && (
        <span className="text-[9px] opacity-70">· multi-disciplinary</span>
      )}
    </div>
  );
}

// ── Study roadmap ──────────────────────────────────────────────────────────

function StudyRoadmap({ phases }: { phases: string[] }) {
  if (!phases.length) return null;

  return (
    <div className="rounded-lg border border-white/10 bg-slate-900/40 px-3 py-2">
      <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-indigo-400">Study Roadmap</div>
      <div className="flex items-center gap-1 flex-wrap">
        {phases.map((phase, i) => (
          <React.Fragment key={i}>
            <span className="rounded bg-indigo-500/15 border border-indigo-500/20 px-2 py-1 text-[10px] font-medium text-indigo-300">
              {phase}
            </span>
            {i < phases.length - 1 && (
              <span className="text-slate-600 text-xs">→</span>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────

interface AdaptiveSyllabusPanelProps {
  bookId:      string;
  bookTitle:   string;
  filename?:   string;
  tocNodes:    TocNode[];
  pageCount:   number;
  onJumpToPage?: (page: number) => void;
  getPageText:   (page: number) => string;
}

export default function AdaptiveSyllabusPanel({
  bookId,
  bookTitle,
  filename,
  tocNodes,
  pageCount,
  onJumpToPage,
  getPageText,
}: AdaptiveSyllabusPanelProps) {
  const { syllabi, setSyllabus, clearSyllabus } = useAdaptiveSyllabusStore();
  const storedSyllabus = syllabi[bookId] ?? null;

  const [generating, setGenerating]       = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const [profileOverride, setProfileOverride] = useState<string | null>(null);
  const [sortBy, setSortBy]               = useState<"order" | "importance" | "difficulty">("order");

  // Deterministic extraction — no AI
  const candidates = useMemo(
    () => extractStructureCandidates(tocNodes, pageCount),
    [tocNodes, pageCount],
  );

  // Document classification — heuristic, no AI
  const classification: DocumentClassification = useMemo(() => {
    const tocTitles = candidates.map(c => c.title);
    const sampleText = getPageText(1) + " " + getPageText(2) + " " + getPageText(3);
    return classifyDocument(filename ?? bookTitle, tocTitles, sampleText);
  }, [filename, bookTitle, candidates, getPageText]);

  const effectiveProfileId = profileOverride ?? storedSyllabus?.selectedProfileId ?? classification.detectedProfileId;

  const handleGenerate = useCallback(async () => {
    if (candidates.length === 0) return;
    setGenerating(true);
    setError(null);

    const sampleContent = buildSampleContent(candidates, getPageText);

    try {
      const res = await fetch("/api/generate-syllabus", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookId,
          bookTitle,
          candidates,
          classification,
          totalPages:        pageCount,
          selectedProfileId: effectiveProfileId,
          sampleContent,
        }),
      });

      const data = await res.json() as { syllabus?: AdaptiveSyllabus; error?: string };

      if (!res.ok || data.error) {
        setError(data.error ?? `Server error ${res.status}`);
        return;
      }

      if (data.syllabus) {
        setSyllabus(bookId, data.syllabus);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setGenerating(false);
    }
  }, [bookId, bookTitle, candidates, classification, pageCount, effectiveProfileId, getPageText, setSyllabus]);

  // Sort chapters by selected criterion
  const sortedChapters = useMemo(() => {
    if (!storedSyllabus) return [];
    const chs = [...storedSyllabus.chapters];
    if (sortBy === "importance") chs.sort((a, b) => b.importance - a.importance);
    else if (sortBy === "difficulty") chs.sort((a, b) => b.difficulty - a.difficulty);
    else chs.sort((a, b) => a.recommendedOrder - b.recommendedOrder);
    return chs;
  }, [storedSyllabus, sortBy]);

  // ── No TOC structure detected ──────────────────────────────────────────

  if (candidates.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4 text-center">
        <div className="text-[11px] text-slate-500">
          No structural chapters detected in this book.
          Upload a course syllabus below to enable adaptive study.
        </div>
      </div>
    );
  }

  // ── Panel ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">
      {/* ── Document classification header ── */}
      <div className="rounded-xl border border-white/10 bg-slate-900/60 p-3 space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="text-[10px] font-bold uppercase tracking-widest text-indigo-400">
            AI Adaptive Syllabus
          </div>
          {storedSyllabus && (
            <button
              onClick={() => clearSyllabus(bookId)}
              className="text-[10px] text-slate-500 hover:text-slate-300"
            >
              Clear
            </button>
          )}
        </div>

        <ClassificationBadge classification={classification} />

        {classification.confidence < 0.55 && !storedSyllabus && (
          <div className="rounded border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[10px] text-amber-300">
            Low classification confidence. Select a profile manually below for better results.
          </div>
        )}

        {/* Profile selector */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-500 shrink-0">Profile:</span>
          <select
            value={effectiveProfileId}
            onChange={e => setProfileOverride(e.target.value)}
            className="flex-1 rounded bg-slate-800 border border-white/10 px-2 py-1 text-[10px] text-slate-200 focus:outline-none focus:border-indigo-400/50"
          >
            {Object.entries(PROFILE_LABELS).map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
        </div>

        {/* Candidate summary */}
        <div className="text-[10px] text-slate-500">
          {candidates.filter(c => c.level === 1).length} chapter{candidates.filter(c => c.level === 1).length !== 1 ? "s" : ""}
          {" · "}
          {candidates.filter(c => c.level >= 2).length} section{candidates.filter(c => c.level >= 2).length !== 1 ? "s" : ""}
          {" · "}
          {pageCount} pages
        </div>

        {/* Generate button */}
        <button
          onClick={handleGenerate}
          disabled={generating || candidates.length === 0}
          className={`w-full rounded-lg py-2 text-[11px] font-semibold transition-all ${
            generating
              ? "bg-indigo-600/40 text-indigo-300 cursor-not-allowed"
              : "bg-indigo-600 hover:bg-indigo-500 text-white"
          }`}
        >
          {generating
            ? "Generating adaptive syllabus…"
            : storedSyllabus
            ? "Regenerate AI Syllabus"
            : "Generate AI Syllabus"}
        </button>

        {error && (
          <div className="rounded border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-[10px] text-rose-300">
            {error}
          </div>
        )}
      </div>

      {/* ── Syllabus content ── */}
      {storedSyllabus && (
        <>
          {/* Study roadmap */}
          {storedSyllabus.studyRoadmap.length > 0 && (
            <StudyRoadmap phases={storedSyllabus.studyRoadmap} />
          )}

          {/* Total study time */}
          {storedSyllabus.chapters.length > 0 && (
            <div className="flex items-center gap-3 flex-wrap rounded-lg border border-white/10 bg-slate-900/40 px-3 py-2 text-[10px] text-slate-400">
              <span>
                <span className="font-semibold text-white">
                  {storedSyllabus.chapters.reduce((s, c) => s + c.estimatedStudyHours, 0).toFixed(0)}h
                </span>{" "}
                total study time
              </span>
              <span>·</span>
              <span>{storedSyllabus.chapters.length} sections</span>
              <span>·</span>
              <span>Generated {new Date(storedSyllabus.generatedAt).toLocaleDateString()}</span>
            </div>
          )}

          {/* Validation issues */}
          {storedSyllabus.validationIssues && storedSyllabus.validationIssues.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 space-y-1">
              <div className="text-[9px] font-bold uppercase tracking-widest text-amber-400">
                Syllabus Warnings
              </div>
              {storedSyllabus.validationIssues.map((issue, i) => (
                <div key={i} className="text-[10px] text-amber-300">{issue.message}</div>
              ))}
            </div>
          )}

          {/* Sort controls */}
          <div className="flex items-center gap-2">
            <span className="text-[9px] uppercase tracking-wide text-slate-500">Sort:</span>
            {(["order", "importance", "difficulty"] as const).map(key => (
              <button
                key={key}
                onClick={() => setSortBy(key)}
                className={`text-[10px] px-2 py-0.5 rounded transition-colors capitalize ${
                  sortBy === key
                    ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                    : "text-slate-400 hover:text-slate-300"
                }`}
              >
                {key === "order" ? "Recommended" : key}
              </button>
            ))}
          </div>

          {/* Chapter list */}
          <div className="space-y-1.5">
            {sortedChapters.map((chapter, i) => (
              <ChapterCard
                key={chapter.candidateId}
                chapter={chapter}
                index={i}
                allChapters={storedSyllabus.chapters}
                onJump={onJumpToPage}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
