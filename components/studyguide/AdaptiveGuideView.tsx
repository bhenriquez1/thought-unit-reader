"use client";

// components/studyguide/AdaptiveGuideView.tsx
// Renders the student-dependent adaptive guide output from buildAdaptiveGuide().
//
// Design principles:
//  • Empty sections are never rendered.
//  • Confidence/mastery percentages are only shown when real recall data exists.
//  • AI-generated interpretations are visually distinct from exact source evidence.
//  • Every unit card supports: Save to Workspace, Go to Source, Quiz Me,
//    Explain with Chief Resident, Open Whiteboard.

import React, { useState } from "react";
import type { AdaptiveGuide, AdaptiveSection, AdaptableUnit, ConceptConfidence } from "@/lib/adaptiveGuide/adaptiveGuideEngine";
import type { LearnerState } from "@/lib/adaptiveGuide/studentProfile";
import { useWorkspaceStore } from "@/lib/workspace/workspaceStore";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AdaptiveGuideViewCallbacks {
  bookId: string;
  currentPage?: number;
  onNavigateToPage?: (page: number) => void;
  onQuizUnit?: (unitId: string, text: string) => void;
  onExplainUnit?: (unitId: string, text: string) => void;
  onWhiteboardUnit?: (title: string, text: string) => void;
  /** True when the student has real recall history (not a stub empty profile) */
  hasRealProfileData?: boolean;
}

// ── Learner state colors ───────────────────────────────────────────────────────

const STATE_BADGE: Record<LearnerState, { bg: string; text: string; label: string }> = {
  "first-read":    { bg: "bg-sky-900/40 border border-sky-700/50",     text: "text-sky-300",     label: "First Read" },
  "second-read":   { bg: "bg-indigo-900/40 border border-indigo-700/50", text: "text-indigo-300", label: "Second Read" },
  "active-recall": { bg: "bg-emerald-900/40 border border-emerald-700/50", text: "text-emerald-300", label: "Active Recall" },
  "needs-review":  { bg: "bg-amber-900/40 border border-amber-700/50",  text: "text-amber-300",   label: "Needs Review" },
};

// ── Mission banner ────────────────────────────────────────────────────────────

function MissionBanner({ guide }: { guide: AdaptiveGuide }) {
  const [collapsed, setCollapsed] = useState(false);
  const badge = STATE_BADGE[guide.learnerState];

  return (
    <div className={`rounded-xl p-4 ${badge.bg} mb-1`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[15px]">🎯</span>
          <span className={`text-[11px] font-bold uppercase tracking-widest ${badge.text}`}>
            {badge.label}
          </span>
          <span className="text-[10px] text-slate-500">·</span>
          <span className="text-[10px] text-slate-500">{guide.mission.estimatedMinutes} min</span>
        </div>
        <button
          onClick={() => setCollapsed(c => !c)}
          className="text-[10px] text-slate-600 hover:text-slate-400"
        >
          {collapsed ? "▸" : "▾"}
        </button>
      </div>

      {!collapsed && (
        <>
          <p className="text-[12px] text-slate-300 leading-relaxed mb-2">
            {guide.mission.focusHint}
          </p>
          <div className="flex flex-col gap-1">
            {guide.mission.successCriteria.map((c, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <span className="text-[10px] text-slate-600 mt-0.5">○</span>
                <span className="text-[11px] text-slate-400 leading-snug">{c}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Confidence meters ─────────────────────────────────────────────────────────

function ConfidenceBar({ confidence, hasData }: { confidence: ConceptConfidence; hasData: boolean }) {
  const pct = confidence.confidence;
  const barColor = pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-sky-500" : "bg-amber-500";
  const trendIcon = confidence.trend === "rising" ? "↑" : confidence.trend === "falling" ? "↓" : confidence.trend === "stable" ? "→" : "";

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-[11px] text-slate-400 truncate">{confidence.label}</span>
          {hasData && (
            <span className={`text-[10px] font-mono ml-1 flex-shrink-0 ${pct >= 80 ? "text-emerald-400" : pct >= 50 ? "text-sky-400" : "text-amber-400"}`}>
              {pct}% {trendIcon}
            </span>
          )}
        </div>
        {hasData && (
          <div className="h-1 rounded-full bg-white/8 overflow-hidden">
            <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Unit card ─────────────────────────────────────────────────────────────────

function UnitCard({
  unit, bookId, currentPage, callbacks, sourceLabel,
}: {
  unit: AdaptableUnit;
  bookId: string;
  currentPage?: number;
  callbacks: AdaptiveGuideViewCallbacks;
  sourceLabel?: "ai" | "source";
}) {
  const [saved, setSaved] = useState(false);
  const workspace = useWorkspaceStore();

  const handleSave = () => {
    workspace.addFavorite(
      bookId,
      unit.title ?? unit.text.slice(0, 60),
      unit.text.slice(0, 200),
      unit.canonicalType,
      unit.pageNumber ?? currentPage,
    );
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="group rounded-lg border border-white/6 bg-white/3 px-3 py-2.5 hover:bg-white/5 transition-colors">
      {/* Source badge — distinguishes exact evidence from AI interpretation */}
      {sourceLabel && (
        <div className="mb-1">
          {sourceLabel === "source" ? (
            <span className="inline-block rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wider bg-sky-900/40 text-sky-400 border border-sky-700/30 font-mono">
              ▣ Source
            </span>
          ) : (
            <span className="inline-block rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wider bg-purple-900/40 text-purple-400 border border-purple-700/30 font-mono">
              ✦ AI Guide
            </span>
          )}
        </div>
      )}

      {unit.title && (
        <div className="text-[12px] font-semibold text-white/80 mb-0.5">{unit.title}</div>
      )}
      <p className="text-[12px] text-slate-400 leading-relaxed">{unit.text}</p>

      {/* Action row — appears on hover */}
      <div className="mt-2 flex flex-wrap gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={handleSave}
          className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
            saved ? "bg-emerald-800/50 text-emerald-300" : "bg-white/6 text-slate-400 hover:bg-emerald-900/40 hover:text-emerald-300"
          }`}
        >
          {saved ? "✓ Saved" : "⭐ Save"}
        </button>
        {(unit.pageNumber ?? currentPage) && (
          <button
            onClick={() => callbacks.onNavigateToPage?.(unit.pageNumber ?? currentPage!)}
            className="rounded px-2 py-0.5 text-[10px] text-slate-400 hover:bg-sky-900/40 hover:text-sky-300 bg-white/6 transition-colors"
          >
            ↗ Source
          </button>
        )}
        {callbacks.onQuizUnit && (
          <button
            onClick={() => callbacks.onQuizUnit?.(unit.id, unit.text)}
            className="rounded px-2 py-0.5 text-[10px] text-slate-400 hover:bg-indigo-900/40 hover:text-indigo-300 bg-white/6 transition-colors"
          >
            🎯 Quiz
          </button>
        )}
        {callbacks.onExplainUnit && (
          <button
            onClick={() => callbacks.onExplainUnit?.(unit.id, unit.text)}
            className="rounded px-2 py-0.5 text-[10px] text-slate-400 hover:bg-amber-900/40 hover:text-amber-300 bg-white/6 transition-colors"
          >
            🩺 Explain
          </button>
        )}
        {callbacks.onWhiteboardUnit && unit.title && (
          <button
            onClick={() => callbacks.onWhiteboardUnit?.(unit.title!, unit.text)}
            className="rounded px-2 py-0.5 text-[10px] text-slate-400 hover:bg-slate-700 hover:text-slate-200 bg-white/6 transition-colors"
          >
            🖼 Whiteboard
          </button>
        )}
      </div>
    </div>
  );
}

// ── Section renderer ──────────────────────────────────────────────────────────

function SectionBlock({
  section, bookId, currentPage, callbacks,
}: {
  section: AdaptiveSection;
  bookId: string;
  currentPage?: number;
  callbacks: AdaptiveGuideViewCallbacks;
}) {
  const [open, setOpen] = useState(true);
  const urgentBorder = section.urgency === "high" ? "border-amber-700/50 bg-amber-950/20" : "border-white/6 bg-white/2";

  return (
    <div className={`rounded-xl border ${urgentBorder} overflow-hidden`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white/4 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[12px] text-white/70 font-semibold truncate">{section.heading}</span>
          {section.urgency === "high" && (
            <span className="flex-shrink-0 rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wider bg-amber-900/50 text-amber-400 font-bold">Priority</span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          {section.actionLabel && section.actionType && (
            <span className="text-[10px] text-slate-500">{section.actionLabel}</span>
          )}
          <span className="text-slate-600 text-[10px]">{open ? "▾" : "▸"}</span>
        </div>
      </button>

      {open && (
        <div className="px-3 pb-3 flex flex-col gap-2">
          {section.body && (
            <p className="text-[11px] text-slate-500 italic">{section.body}</p>
          )}
          {section.units?.map(unit => (
            <UnitCard
              key={unit.id}
              unit={unit}
              bookId={bookId}
              currentPage={currentPage}
              callbacks={callbacks}
              sourceLabel={unit.id.startsWith("gen-") ? "ai" : "source"}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface AdaptiveGuideViewProps {
  guide: AdaptiveGuide;
  callbacks: AdaptiveGuideViewCallbacks;
}

export default function AdaptiveGuideView({ guide, callbacks }: AdaptiveGuideViewProps) {
  const { bookId, currentPage, hasRealProfileData } = callbacks;

  // Only show confidence scores when we have real recall data
  const showConfidence = hasRealProfileData && guide.confidenceByType.length > 0;

  return (
    <div className="flex flex-col gap-3">
      {/* Mission */}
      <MissionBanner guide={guide} />

      {/* Confidence breakdown — only with real data */}
      {showConfidence && (
        <div className="rounded-xl border border-white/6 bg-white/2 px-3 py-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
            Confidence by Concept Type
          </div>
          <div className="flex flex-col gap-2">
            {guide.confidenceByType.map(c => (
              <ConfidenceBar key={c.canonicalType} confidence={c} hasData={hasRealProfileData ?? false} />
            ))}
          </div>
        </div>
      )}

      {/* Sections — no empty sections rendered */}
      {guide.sections
        .filter(s => !s.units || s.units.length > 0)
        .map(section => (
          <SectionBlock
            key={section.id}
            section={section}
            bookId={bookId}
            currentPage={currentPage}
            callbacks={callbacks}
          />
        ))
      }

      {/* Empty state */}
      {guide.sections.filter(s => !s.units || s.units.length > 0).length === 0 && (
        <div className="py-8 text-center text-[12px] text-slate-600 italic">
          No adaptive content available for this page yet. Open the PDF reader and navigate to a page with content.
        </div>
      )}

      {/* Footer — source vs AI distinction note */}
      <div className="pt-1 border-t border-white/6 flex items-center gap-3 text-[10px] text-slate-600">
        <span className="flex items-center gap-1">
          <span className="inline-block rounded px-1 py-0.5 bg-sky-900/30 text-sky-500 font-mono text-[9px]">▣ Source</span>
          exact textbook evidence
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block rounded px-1 py-0.5 bg-purple-900/30 text-purple-500 font-mono text-[9px]">✦ AI Guide</span>
          AI-generated interpretation
        </span>
      </div>
    </div>
  );
}
