"use client";

// components/reader/ThoughtUnitNavigator.tsx
//
// Level 2 of the LeftPanel evolution: a clickable list of the current page's
// thought units (grouped by kind), instead of just colored highlight rects.
// Reuses the same evidenceRefId-based focus mechanism that PDF-overlay clicks
// already use (pages/index.tsx's onEvidenceFocus/onPdfHighlightFocus), so
// clicking an entry here jumps to the PDF, glows the highlight, and starts
// speech from that thought unit exactly like clicking the highlight itself
// — no separate "play" plumbing needed. The "Explain" button is the one new
// hook, wired to pages/index.tsx's openExplainStepForThoughtUnit.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useReadingFocusStore } from "@/lib/readingFocus/readingFocusStore";
import type { ParagraphKind } from "@/lib/readerContracts";
import { getKindLabel, getKindGroups, groupThoughtUnits } from "@/lib/insights/domainPresets";
import { getImportanceTier, tierGlyph, DEFAULT_COLLAPSE_AT_OR_BELOW_STARS } from "@/lib/insights/importanceTiers";
import { tokenizeWords } from "@/lib/speech/wordSync";
import DomainModeSelector from "./DomainModeSelector";
import { getPageProgress, markProgress, type ProgressStep } from "@/lib/reader/thoughtUnitProgress";

export interface ThoughtUnitNavigatorEntry {
  id: string;
  text: string;
  kind: ParagraphKind;
  /** Source page — rendered in each card's meta row. */
  page?: number;
  /** Anchor score/confidence, when the pipeline provides one. */
  confidence?: number;
  /** AI-assigned 1-5 importance (5 = "Master This") — drives this card's star badge,
   *  layered on top of (not replacing) the group-level ordinal tier above it. */
  priorityTier?: number;
  /** ≤10-word AI rationale ("why a professor would underline this") — rendered as the
   *  card's one-line explanation when present, in place of re-showing the full snippet twice. */
  reason?: string;
  /** Short human-readable heading for the card. Falls back to a derived title from `text`
   *  when absent — no entry currently provides this field, but future AI schema additions can. */
  title?: string;
  /** Best-effort "Lines X–Y" locator estimated from the anchor's character offset within the
   *  page text — PDF.js exposes no per-line geometry through this pipeline, so this is an
   *  approximation (assumes ~90 chars/line), not an exact line count. */
  lineRange?: string;
  /** Alias IDs — the speech system may use any of these to reference this entry.
   *  Checked alongside `id` by matchesAnchor() so word sync fires regardless of
   *  which ID path the sentence-to-anchor matcher took. */
  evidenceRefId?: string;
  canonicalUnitId?: string;
  sourceAnchorId?: string;
}

// Returns true if the given anchorId (from activeSpokenWord) refers to this entry,
// checking all alias ID fields so the match is robust against different ID paths
// (ExpertAnchor.evidenceRefId vs VisualAnchor.id vs HighlightTarget.id).
function matchesAnchor(anchorId: string | null | undefined, entry: ThoughtUnitNavigatorEntry): boolean {
  if (!anchorId) return false;
  return (
    anchorId === entry.id ||
    (entry.evidenceRefId !== undefined && anchorId === entry.evidenceRefId) ||
    (entry.canonicalUnitId !== undefined && anchorId === entry.canonicalUnitId) ||
    (entry.sourceAnchorId !== undefined && anchorId === entry.sourceAnchorId)
  );
}

// Best-effort short heading derived from a thought unit's verbatim text when no
// AI-authored title is available — first clause/sentence, word-boundary truncated.
function deriveCardTitle(text: string, maxLen = 60): string {
  const firstClause = text.split(/(?<=[.!?])\s/)[0] ?? text;
  const trimmed = firstClause.trim();
  if (trimmed.length <= maxLen) return trimmed;
  const cut = trimmed.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 20 ? cut.slice(0, lastSpace) : cut).trim() + "…";
}

// Colors stay constant across domain presets — only the label text changes
// (via getKindLabel) — so the navigator's visual identity doesn't shift
// every time the detected/overridden preset changes. Exported so the Level 4
// page roadmap (ThoughtRoadmap) renders the same groups in matching colors.
export const KIND_COLORS: Record<string, { color: string; bg: string }> = {
  // MASTER — yellow
  thesis:       { color: "#fde047", bg: "rgba(253,224,71,0.12)" },
  definition:   { color: "#fde047", bg: "rgba(253,224,71,0.12)" },
  // PROCEDURE — blue
  mechanism:    { color: "#93c5fd", bg: "rgba(147,197,253,0.12)" },
  formula:      { color: "#93c5fd", bg: "rgba(147,197,253,0.12)" },
  // DECISION — orange
  application:  { color: "#fb923c", bg: "rgba(251,146,60,0.12)" },
  comparison:   { color: "#fb923c", bg: "rgba(251,146,60,0.12)" },
  keyDetail:    { color: "#fb923c", bg: "rgba(251,146,60,0.12)" },
  keyAnatomy:   { color: "#fb923c", bg: "rgba(251,146,60,0.12)" },
  // TRAP — red
  trap:         { color: "#fca5a5", bg: "rgba(252,165,165,0.12)" },
  // PEARL — green
  clinical:     { color: "#86efac", bg: "rgba(134,239,172,0.12)" },
  memoryAnchor: { color: "#86efac", bg: "rgba(134,239,172,0.12)" },
  dat_fact:     { color: "#86efac", bg: "rgba(134,239,172,0.12)" },
};
export const FALLBACK_COLOR = { color: "#cbd5e1", bg: "rgba(203,213,225,0.10)" };

// Group display label — currently a passthrough to the preset's own
// kindGroup label (e.g. "Procedure Step"). Kept as its own function (not
// inlined at the two call sites) since ThoughtRoadmap imports it too, so
// both views stay guaranteed to agree on a group's display label.
export function groupDisplayLabel(representativeKind: string, itemCount: number, fallbackLabel: string): string {
  return fallbackLabel;
}

// Marks the word at activeSpokenWord.wordIndex within this card's own snippet text.
// Pure string-splitting — entry.text is tokenized independently of whatever text
// Speech is actually reading (which may be formula-converted/sliced), so this is
// an approximation, not an exact echo of the spoken word.
function renderSnippetWithActiveWord(
  text: string,
  activeSpokenWord: { anchorId: string | null; wordIndex: number; word: string } | null | undefined,
  entryId: string,
): React.ReactNode {
  if (!activeSpokenWord || activeSpokenWord.anchorId !== entryId) return text;
  const words = tokenizeWords(text);
  const target = words[activeSpokenWord.wordIndex];
  if (!target) {
    console.warn("[THOUGHT_UNIT_SYNC_MISS]", {
      step: "THOUGHT_UNIT_LEFTPANEL_WORD",
      reason: "wordIndex out of range for entry text",
      entryId,
      wordIndex: activeSpokenWord.wordIndex,
      wordCount: words.length,
      textPreview: text.slice(0, 60),
    });
    return text;
  }
  console.log("[LEFT_PANEL_WORD_SYNC_RENDERED]", {
    entryId,
    wordIndex: activeSpokenWord.wordIndex,
    word: activeSpokenWord.word,
    matchedWord: text.slice(target.start, target.end),
  });
  return (
    <>
      {text.slice(0, target.start)}
      <mark
        style={{
          background: "rgba(253,224,71,0.55)",
          color: "inherit",
          borderRadius: "2px",
          padding: "0 1px",
        }}
      >
        {text.slice(target.start, target.end)}
      </mark>
      {text.slice(target.end)}
    </>
  );
}

export default function ThoughtUnitNavigator({
  entries,
  focusedId,
  onJump,
  onExplain,
  onOpenRecall,
  onOpenNote,
  presetId = "universal",
  detectedPresetLabel,
  overridePresetId,
  onPresetChange,
  emptyReason,
  bookId,
  pageNumber,
}: {
  entries: ThoughtUnitNavigatorEntry[];
  focusedId?: string | null;
  onJump: (id: string) => void;
  onExplain?: (id: string) => void;
  /** Seeds a Recall Lab review session from this thought unit. */
  onOpenRecall?: (id: string) => void;
  /** Seeds a NoteLab note from this thought unit. */
  onOpenNote?: (id: string) => void;
  /** Level 4 domain preset id (from lib/insights/domainPresets) — relabels kind groups only. */
  presetId?: string;
  /** When provided alongside overridePresetId/onPresetChange, renders the "MODE: X" picker
   *  inline in this navigator's own header instead of as a separate sibling component. */
  detectedPresetLabel?: string;
  overridePresetId?: string | null;
  onPresetChange?: (presetId: string | null) => void;
  emptyReason?: string | null;
  bookId?: string;
  pageNumber?: number;
}) {
  // Primitive subscriptions — each selector returns a primitive so Zustand's
  // Object.is check succeeds when the value is unchanged, preventing this component
  // from re-rendering on every Zustand tick where the values haven't actually changed.
  const activeAnchorId  = useReadingFocusStore(s => s.thoughtUnitId);
  const activeWordIndex = useReadingFocusStore(s => s.wordIndex);
  const activeWord      = useReadingFocusStore(s => s.word);
  const activeSentText  = useReadingFocusStore(s => s.sentenceText);
  // Reconstitute the shape that renderSnippetWithActiveWord and matchesAnchor expect,
  // but only create a new object when at least one primitive actually changed.
  const activeSpokenWord = React.useMemo(
    () => (activeWord || activeSentText)
      ? { anchorId: activeAnchorId, wordIndex: activeWordIndex, word: activeWord ?? "", sentenceText: activeSentText ?? undefined }
      : null,
    [activeAnchorId, activeWordIndex, activeWord, activeSentText],
  );
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Guided teach-loop / PDF-click focus: scroll the active card into view, same
  // pattern RightPanel.tsx already uses for its own Study Notes cards — without
  // this, a focused entry only changed its border color and could sit off-screen.
  const activeEntryRef = useRef<HTMLDivElement | null>(null);
      useEffect(() => {
        if (focusedId) activeEntryRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        if (focusedId && bookId && pageNumber) {
          markProgress(bookId, pageNumber, focusedId, "read");
          // Re-read progress after marking
          setProgressMap(getPageProgress(bookId, pageNumber, entries.map((e) => e.id)));
        }
      }, [focusedId]); // eslint-disable-line react-hooks/exhaustive-deps
      useEffect(() => {
        if (!activeSpokenWord?.anchorId) return;
        const matchedEntry = entries.find((e) => matchesAnchor(activeSpokenWord.anchorId, e));
        console.log("[LEFT_PANEL_WORD_SYNC_VISIBLE]", {
          activeAnchorId: activeSpokenWord.anchorId,
          matchedEntryId: matchedEntry?.id ?? null,
          word: activeSpokenWord.word,
          wordIndex: activeSpokenWord.wordIndex,
          matched: !!matchedEntry,
        });
        if (matchedEntry) {
          activeEntryRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
        } else {
          console.warn("[THOUGHT_UNIT_SYNC_MISS]", {
            step: "THOUGHT_UNIT_LEFTPANEL_TARGET",
            reason: "anchorId not matched by any ThoughtUnitNavigator entry — card will not show isSpeaking",
            anchorId: activeSpokenWord.anchorId,
            entryIds: entries.slice(0, 5).map(e => e.id),
            entryEvidenceRefIds: entries.slice(0, 5).map(e => e.evidenceRefId),
          });
        }
      }, [activeSpokenWord?.anchorId]); // scroll on anchor change only, not every word

  // Level 3: when the preset defines kindGroups (e.g. DAT's Concepts/Mechanisms/
  // Traps/High-Yield Facts), several raw kinds merge into one navigator section.
  // Presets without kindGroups keep today's exact one-section-per-kind behavior.
  // Shared with ThoughtRoadmap (Level 4) so both views agree on sectioning.
  const grouped = useMemo(() => {
    const groups = groupThoughtUnits(entries, presetId);
    return groups.map((g) => ({
      ...g,
      items: [...g.items].sort((a, b) => {
        const aLine = parseInt(a.lineRange ?? "999", 10);
        const bLine = parseInt(b.lineRange ?? "999", 10);
        return aLine - bLine;
      }),
    }));
  }, [entries, presetId]);

  const [progressMap, setProgressMap] = useState<Map<string, Set<ProgressStep>>>(new Map());

  useEffect(() => {
    if (!bookId || !pageNumber) return;
    setProgressMap(getPageProgress(bookId, pageNumber, entries.map((e) => e.id)));
  }, [bookId, pageNumber, entries, focusedId]);

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId); else next.add(groupId);
      return next;
    });
  };

  const TIER_ACTION_LABEL: Record<number, string> = {
    5: "Understand first",
    4: "Apply",
    3: "Support",
    2: "Avoid",
    1: "Remember",
  };

  const header = (
    <div className="flex items-center justify-between gap-2 px-1">
      <span className="text-[9px] font-bold uppercase tracking-widest text-white/30 shrink-0">
        Page Guide
      </span>
      {detectedPresetLabel !== undefined && onPresetChange && (
        <DomainModeSelector
          detectedPresetLabel={detectedPresetLabel}
          overridePresetId={overridePresetId ?? null}
          onChange={onPresetChange}
        />
      )}
    </div>
  );

  if (entries.length === 0) {
    const skeletonGroups = getKindGroups(presetId);
    return (
      <div className="flex flex-col gap-2 px-1.5" data-testid="thought-unit-navigator">
        {header}
        {skeletonGroups ? (
          <div className="flex flex-col gap-1.5">
            {skeletonGroups.map((g, i) => {
              const representativeKind = g.kinds[0];
              const colors = KIND_COLORS[representativeKind] ?? FALLBACK_COLOR;
              const tier = getImportanceTier(i);
              return (
                <div key={g.id} className="flex flex-col gap-1">
                  {/* Skeleton uses the same chapter-header style as populated state, dimmed */}
                  <div
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md opacity-40"
                    style={{
                      background: `linear-gradient(90deg, ${colors.color}22 0%, transparent 100%)`,
                      borderLeft: `3px solid ${colors.color}`,
                    }}
                  >
                    <span className="text-[10px] font-black uppercase tracking-widest truncate" style={{ color: colors.color }}>
                      {g.label}
                    </span>
                    <span className="text-[9px] shrink-0" style={{ color: colors.color }}>
                      {tierGlyph(tier.stars, representativeKind)}
                    </span>
                  </div>
                  <div
                    className="mx-1 rounded-md px-2 py-2 opacity-30"
                    style={{ background: colors.bg, border: `1px solid ${colors.color}22` }}
                  >
                    <div className="h-1.5 rounded bg-white/10 w-3/4 mb-1.5" />
                    <div className="h-1.5 rounded bg-white/10 w-1/2" />
                  </div>
                </div>
              );
            })}
            <div className="px-2 pt-1 text-[9px] text-white/25 italic leading-relaxed">
              Analyzing page…
              {emptyReason ? <span className="mt-1 block text-amber-200/40">({emptyReason})</span> : null}
            </div>
          </div>
        ) : (
          <div className="px-2.5 py-3 text-[10.5px] text-white/45 leading-relaxed">
            Analyzing page…
            {emptyReason ? <span className="mt-1 block text-amber-200/70">({emptyReason})</span> : null}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 px-1.5" data-testid="thought-unit-navigator">
      {header}
      <div className="flex items-center gap-1.5 flex-wrap px-1" data-testid="thought-unit-summary-strip">
        {grouped.map(({ id, label, representativeKind, items }, groupIndex) => {
          const colors = KIND_COLORS[representativeKind] ?? FALLBACK_COLOR;
          const baseLabel = label ?? getKindLabel(presetId, representativeKind as ParagraphKind);
          const meta = { ...colors, label: groupDisplayLabel(representativeKind, items.length, baseLabel) };
          const tier = getImportanceTier(groupIndex);
          return (
            <span
              key={`summary-${id}`}
              className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[8px] font-semibold tracking-tight"
              style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.color}33` }}
              title={`${tier.label} priority`}
            >
              <span>{tierGlyph(tier.stars, representativeKind)}</span>
              <span className="uppercase">{meta.label}</span>
              {items.length > 1 && <span className="opacity-70">×{items.length}</span>}
            </span>
          );
        })}
      </div>
      {grouped.map(({ id, label, representativeKind, items }, groupIndex) => {
        const colors = KIND_COLORS[representativeKind] ?? FALLBACK_COLOR;
        const baseLabel = label ?? getKindLabel(presetId, representativeKind as ParagraphKind);
        const meta = { ...colors, label: groupDisplayLabel(representativeKind, items.length, baseLabel) };
        // Adaptive Thought Unit Engine: groups arrive in the preset's own expert-priority
        // order, so ordinal position doubles as an importance tier — low tiers (Supporting/
        // Minor) start collapsed, same as an expert skimming past the supporting detail.
        const tier = getImportanceTier(groupIndex);
        const userToggled = collapsedGroups.has(id);
        const defaultCollapsed = tier.stars <= DEFAULT_COLLAPSE_AT_OR_BELOW_STARS;
        const isCollapsed = defaultCollapsed !== userToggled;
        return (
          <React.Fragment key={id}>
          <div className="flex flex-col gap-1">
            {/* Full-width colored chapter header — replaces old small-dot layout */}
            <button
              type="button"
              onClick={() => toggleGroup(id)}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-opacity hover:opacity-90"
              style={{
                background: `linear-gradient(90deg, ${meta.color}22 0%, transparent 100%)`,
                borderLeft: `3px solid ${meta.color}`,
              }}
            >
              <span
                className="text-[10px] font-black uppercase tracking-widest truncate"
                style={{ color: meta.color }}
              >
                {meta.label}
              </span>
              <span
                className="text-[9px] shrink-0"
                style={{ color: meta.color }}
                title={`${tier.label} priority`}
                data-testid="importance-stars"
              >
                {tierGlyph(tier.stars, representativeKind)}
              </span>
              <span
                className="text-[8.5px] rounded-full px-1.5 py-0.5 font-semibold shrink-0"
                style={{ background: `${meta.color}25`, color: meta.color }}
              >
                {items.length}
              </span>
              {tier.stars >= 4 && (
                <span className="text-[7.5px] italic shrink-0" style={{ color: `${meta.color}99` }}>
                  {TIER_ACTION_LABEL[tier.stars] ?? ""}
                </span>
              )}
              <span className="ml-auto text-[9px] text-white/35">{isCollapsed ? "▸" : "▾"}</span>
            </button>
            {!isCollapsed && items.map((entry) => {
              const focused = entry.id === focusedId;
              const isSpeaking = matchesAnchor(activeSpokenWord?.anchorId, entry);
              if (isSpeaking) {
                console.log("[THOUGHT_UNIT_LEFTPANEL_TARGET]", {
                  entryId: entry.id,
                  anchorId: activeSpokenWord?.anchorId,
                  isSpeaking: true,
                  matchedBy: activeSpokenWord?.anchorId === entry.id ? "id"
                    : activeSpokenWord?.anchorId === entry.evidenceRefId ? "evidenceRefId"
                    : activeSpokenWord?.anchorId === entry.canonicalUnitId ? "canonicalUnitId"
                    : "sourceAnchorId",
                });
              }
              const isActive = focused || isSpeaking;
              // Normalize anchorId to entry.id so renderSnippetWithActiveWord's internal
              // guard (activeSpokenWord.anchorId !== entryId) matches correctly even when
              // the speech system used an alias (evidenceRefId, canonicalUnitId, etc.).
              const effectiveSpokenWord = isSpeaking && activeSpokenWord
                ? { ...activeSpokenWord, anchorId: entry.id }
                : activeSpokenWord;
              return (
                <div
                  key={entry.id}
                  ref={isActive ? activeEntryRef : undefined}
                  role="button"
                  tabIndex={0}
                  onClick={() => { console.log("[PARENT_WRITE:ThoughtUnitNavigator] onJump", entry.id); onJump(entry.id); }}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { console.log("[PARENT_WRITE:ThoughtUnitNavigator] onJump (key)", entry.id); onJump(entry.id); } }}
                  className="group relative flex flex-col gap-1 rounded-md px-2 py-1.5 cursor-pointer"
                  style={{
                    background: isSpeaking
                      ? meta.bg.replace("0.12", "0.25")
                      : focused ? meta.bg.replace("0.12", "0.28") : meta.bg,
                    border: `1px solid ${meta.color}${isSpeaking ? "cc" : focused ? "88" : "33"}`,
                    boxShadow: isSpeaking
                      ? `0 0 10px ${meta.color}44, inset 0 0 6px ${meta.color}10`
                      : undefined,
                    transition: "all 0.2s ease",
                  }}
                  data-testid="thought-unit-entry"
                >
                  {entry.priorityTier !== undefined && (
                    <span
                      className="absolute top-1 right-1.5 text-[7px] tracking-tighter text-white/45"
                      title={`Priority ${entry.priorityTier}/5`}
                      data-testid="anchor-priority-stars"
                    >
                      {tierGlyph(entry.priorityTier, entry.kind)}
                    </span>
                  )}
                  <span
                    className="text-[9px] font-semibold uppercase tracking-wide pr-6 flex items-center gap-1"
                    style={{ color: meta.color }}
                    data-testid="thought-unit-category"
                  >
                    {meta.label}
                    {isSpeaking && (
                      <span className="animate-pulse text-emerald-300" style={{ fontSize: "8px" }}>◎ live</span>
                    )}
                  </span>
                  <span
                    className="text-[10.5px] font-semibold leading-snug text-white/90 whitespace-normal break-words"
                    data-testid="thought-unit-title"
                  >
                    {entry.title ?? deriveCardTitle(entry.text)}
                  </span>
                  <span
                    className="text-[10px] leading-snug text-white/70"
                    style={isActive ? {
                      whiteSpace: "normal",
                      overflowWrap: "anywhere",
                    } : {
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {renderSnippetWithActiveWord(entry.text, effectiveSpokenWord, entry.id)}
                  </span>
                  {entry.reason && (
                    <span className="text-[9px] italic leading-snug text-white/45" data-testid="thought-unit-explanation">
                      {entry.reason}
                    </span>
                  )}
                  {(entry.page !== undefined || entry.lineRange) && (
                    <span className="text-[8.5px] text-white/35 tracking-tight" data-testid="thought-unit-location">
                      {entry.page !== undefined ? `Page ${entry.page}` : null}
                      {entry.page !== undefined && entry.lineRange ? " · " : null}
                      {entry.lineRange ? `Lines ${entry.lineRange}` : null}
                    </span>
                  )}
                  {(() => {
                    const progress = progressMap.get(entry.id);
                    if (!progress || progress.size === 0) return null;
                    const steps: { key: ProgressStep; label: string }[] = [
                      { key: "read", label: "Read" },
                      { key: "speech", label: "Speech" },
                      { key: "explained", label: "Explained" },
                      { key: "quiz", label: "Quiz" },
                      { key: "mastered", label: "Mastered" },
                    ];
                    return (
                      <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
                        {steps.map(({ key, label }) => (
                          <span
                            key={key}
                            className={`text-[8px] tracking-tight ${progress.has(key) ? "text-emerald-400" : "text-white/20"}`}
                          >
                            {progress.has(key) ? "✔" : "○"} {label}
                          </span>
                        ))}
                      </div>
                    );
                  })()}
                  {(onExplain || onOpenRecall || onOpenNote) && (
                    <div className="self-end flex items-center gap-2 opacity-0 group-hover:opacity-100">
                      {onOpenNote && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onOpenNote(entry.id); }}
                          className="text-[9px] text-white/40 hover:text-white/80 transition-colors"
                          title="Save a note on this anchor"
                        >
                          📝 Note
                        </button>
                      )}
                      {onOpenRecall && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onOpenRecall(entry.id); }}
                          className="text-[9px] text-white/40 hover:text-white/80 transition-colors"
                          title="Open in Recall Lab"
                        >
                          🧠 Recall
                        </button>
                      )}
                      {onExplain && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onExplain(entry.id); }}
                          className="text-[9px] text-white/40 hover:text-white/80 transition-colors"
                          title="Explain this"
                        >
                          💬 Explain
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {groupIndex < grouped.length - 1 && (
            <div className="flex justify-center py-0.5">
              <span className="text-[9px] text-white/20">↓</span>
            </div>
          )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
