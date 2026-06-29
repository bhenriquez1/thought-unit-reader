import React, { useEffect, useMemo, useRef, useState } from "react";
import type { ActivePageContext, ResolvedPanelPayload, RightPanelState } from "@/lib/readerContracts";
import { deriveRecallItems, type SynthesisForRecall } from "@/lib/insights/deriveRecallItems";
import { useGuidedHighlightSync } from "@/hooks/useGuidedHighlightSync";
import { buildGuidedReadView, type GuidedDepth, type GuidedMode, type GuidedRole } from "@/lib/insights/buildGuidedReadView";
import { compressToNote, isFieldRenderable } from "@/lib/insights/sentenceCleanup";
import type { EvidenceAnchor, OperatorCard } from "@/lib/insights/types";
import type { ActivePageIntelligenceSnapshot } from "@/lib/useActivePageIntelligence";
import type { SemanticHighlightKind } from "@/lib/highlights/extractPriorityHighlights";
import type { PageStoryV2 } from "@/lib/insights/buildPageStoryV2";
import type { StoryBlockV2 } from "@/lib/insights/types";
import type { ParagraphNote, ReaderRole } from "@/lib/insights/buildParagraphNotes";
import type { PageStoryV3, ParagraphNoteV3, ReadingStepV3, PageBriefV3 } from "@/lib/insights/buildPageStoryV3";
import { buildNarrativeBlocks, type NarrativeBlock, type NarrativeBlockType } from "@/lib/insights/buildNarrativeBlocks";
import { BlockMath } from "@/components/surgeonView2/MathDisplay";
import { buildShadowRecall, type ShadowRecallModel } from "@/lib/insights/buildShadowRecall";
import { buildNarrativePageView, type NarrativeBuildResult } from "@/lib/insights/buildNarrativePageView";
import type { NarrativeSection } from "@/lib/insights/materializeNarrativeSupport";
import { extractConceptBlocks } from "@/lib/reader/extractConceptBlocks";
import type { ConceptBlock, ReaderPageView } from "@/lib/reader/types";
import { buildUltraPageView, type UltraPageView, type UltraConceptBlock } from "@/lib/insights/buildUltraPageView";
import type { SRIModel, SRISignal, ReadingDepth } from "@/lib/insights/buildSRIModel";
import type { RenderGuidedReadingPathResult } from "@/lib/highlights/renderGuidedReadingPath";
import { buildNoteFromStudyModel, saveUltraNote, getAllUltraNotes, isUltraNotePersisted, inferSubject } from "@/lib/notelab/ultraNoteStore";
import { buildRecallSetFromView, saveRecallSet, getAllRecallSets, isRecallSetPersisted, computeDeckStats, type RecallCard, type CardType } from "@/lib/recalllab/recallStore";
import { persistVisualAnchorsAsHighlights } from "@/lib/highlights/persistAnchorsAsHighlights";
import { isWeakBlock, sanitizeDisplay, renderNoteQualityGate, isSimilarText, isCompleteThought, BOILERPLATE_RE, PUBLISHER_DEBRIS_RE } from "@/lib/insights/renderQualityGate";
import { tokenizeWords } from "@/lib/speech/wordSync";

// Marks the word at activeSpokenWord.wordIndex within this card's own text — same
// approach as ThoughtUnitNavigator.tsx's renderSnippetWithActiveWord, kept local here
// since each consumer tokenizes its own (independently-sourced) display text.
function renderTextWithActiveWord(
  text: string,
  activeSpokenWord: { anchorId: string | null; wordIndex: number; word: string } | null | undefined,
  anchorId: string | null | undefined,
): React.ReactNode {
  if (!activeSpokenWord || !anchorId || activeSpokenWord.anchorId !== anchorId) return text;
  const words = tokenizeWords(text);
  const target = words[activeSpokenWord.wordIndex];
  if (!target) return text;
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

// Validates a synthesis field before it can replace a heuristic field.
// Returns the trimmed text if it passes, or null if it should be rejected.
// NOTE: does NOT call isCompleteThought() — synthesis output is professor-generated text,
// not textbook extraction. The isWeakFragment verb list rejects legitimate synthesis verbs
// like "explains", "exhibits", "governs", "determines". Simpler checks are sufficient here.
function validSynthField(text: string | undefined | null, domain: string | null, fieldName?: string): string | null {
  const tag = fieldName ? `[SYNTH:reject:${fieldName}]` : "[SYNTH:reject]";
  if (!text?.trim()) return null;
  const t = text.trim();
  if (BOILERPLATE_RE.test(t) || PUBLISHER_DEBRIS_RE.test(t)) {
    console.log(tag, "boilerplate/publisher debris →", t.slice(0, 60));
    console.log("[SYNTH_FIELD_REJECTED]", { field: fieldName ?? "unknown", reason: "boilerplate/publisher debris", value: t.slice(0, 80) });
    return null;
  }
  if (domain === "math" && /\bbiologically\b|\borganism\b|\bcell\b|\bprotein\b|\bphysiolog/i.test(t)) {
    console.log(tag, "cross-domain biology on math page →", t.slice(0, 60));
    console.log("[SYNTH_FIELD_REJECTED]", { field: fieldName ?? "unknown", reason: "cross-domain biology on math page", value: t.slice(0, 80) });
    return null;
  }
  if (/^(another\s+(notation|term|way|name|example)|a\s+number\s+of\s+(texts?|books?|authors?)|this\s+(means?|is|refers?)|they\s+(are|were|have)|some\s+(authors?|texts?|books?))\b/i.test(t)) {
    console.log(tag, "vague-opener artifact →", t.slice(0, 60));
    console.log("[SYNTH_FIELD_REJECTED]", { field: fieldName ?? "unknown", reason: "vague-opener artifact", value: t.slice(0, 80) });
    return null;
  }
  return t;
}
import { useTeachingSynthesis } from "./useTeachingSynthesis";
import { buildStudyModel, type CurrentPageStudyModel } from "@/lib/insights/currentPageStudyModel";
import { detectDomainPreset } from "@/lib/insights/domainPresets";
import { cleanThesisLine } from "@/lib/insights/cleanActivePageText";
import StudySpeechPanel, { type StudySpeechPanelHandle } from "./StudySpeechPanel";
import type { ExpertAnchor } from "@/lib/insights/canonicalLeftPanel";

// ---------------------------------------------------------------------------
// Chapter / Unit / Section overview panel — shown when the page is a chapter
// opener or unit opener without enough body text for full synthesis.
// ---------------------------------------------------------------------------

function ChapterPreviewPanel({ ctx, pageRole }: { ctx: ActivePageContext; pageRole: string }) {
  const chapterTitle = ctx.chapterTitle ?? ctx.sectionTitle ?? null;
  const displayTitle = chapterTitle ?? (pageRole === "unit_opener" ? "Unit Overview" : "Chapter Overview");

  const pageText = ctx.pageText ?? "";
  // Extract first 2 non-trivial sentences as the overview blurb
  const rawSentences = pageText.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length > 30);
  const blurb = rawSentences.slice(0, 2).join(" ").trim();

  // Extract recurring capitalized words as key concept candidates
  const tokenRe = /\b([A-Z][a-z]{3,})\b/g;
  const freqMap = new Map<string, number>();
  let m: RegExpExecArray | null;
  const STOP = new Set(["This","These","That","When","Where","What","They","There","Their","After","About","Some","More","Most","With","From","Into","Over","Each"]);
  while ((m = tokenRe.exec(pageText)) !== null) {
    const w = m[1];
    if (!STOP.has(w)) freqMap.set(w, (freqMap.get(w) ?? 0) + 1);
  }
  const keyConcepts = [...freqMap.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([w]) => w);

  const roleLabel =
    pageRole === "chapter_opener" ? "Chapter Overview" :
    pageRole === "unit_opener"    ? "Unit Overview"    :
    pageRole === "section_opener" ? "Section Overview" : "Overview";

  return (
    <div className="rounded-2xl border border-amber-400/20 bg-[#0d1520] p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <span className="text-2xl shrink-0 mt-0.5">📖</span>
        <div>
          <div className="text-[9px] font-bold uppercase tracking-widest text-amber-400/60 mb-0.5">{roleLabel}</div>
          <p className="text-[14px] font-semibold text-white/90 leading-snug">{displayTitle}</p>
        </div>
      </div>

      {/* Overview blurb */}
      {blurb && (
        <div>
          <div className="text-[9px] font-bold uppercase tracking-widest text-white/25 mb-1.5">Overview</div>
          <p className="text-[12.5px] text-white/60 leading-[1.65] line-clamp-4">{blurb}</p>
        </div>
      )}

      {/* Key concepts */}
      {keyConcepts.length > 0 && (
        <div>
          <div className="text-[9px] font-bold uppercase tracking-widest text-white/25 mb-2">Key Concepts Detected</div>
          <div className="flex flex-wrap gap-1.5">
            {keyConcepts.map(c => (
              <span key={c} className="px-2.5 py-0.5 rounded-full bg-indigo-500/12 border border-indigo-400/20 text-[11px] text-indigo-200/65 capitalize">{c}</span>
            ))}
          </div>
        </div>
      )}

      {/* Navigation hint */}
      <div className="pt-3 border-t border-white/6">
        <p className="text-[11px] text-white/28 italic leading-[1.5]">
          Limited extraction available — this is a {roleLabel.toLowerCase()} page.
          Navigate to the next content page to generate full study notes, highlights, and recall cards.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Concept Map — visual A → B → C reasoning chain from synthesis reasoningFlow.
// This is the right panel's causal skeleton made visible.
// ---------------------------------------------------------------------------

function ConceptMapSection({
  reasoningFlow,
  crossLinkHints,
  density,
}: {
  reasoningFlow: string;
  crossLinkHints?: string[];
  density?: { cardPadding: string; headingText: string; bodyText: string };
}) {
  const d = density ?? { cardPadding: "p-4", headingText: "text-[12px]", bodyText: "text-[12px]" };
  const nodes = reasoningFlow.split(/\s*→\s*/).map(n => n.trim()).filter(Boolean);
  if (nodes.length < 2) return null;

  return (
    <div className={`rounded-xl border border-emerald-400/12 bg-[#071a12] ${d.cardPadding}`}>
      <div className={`${d.headingText} font-bold uppercase tracking-[0.14em] text-emerald-300/60 mb-3`}>
        🗺️ Concept Map
      </div>
      {/* Reasoning chain — wraps naturally on narrow panels */}
      <div className="flex flex-wrap items-center gap-1.5">
        {nodes.map((node, i) => (
          <React.Fragment key={i}>
            <div className="rounded-md border border-emerald-400/18 bg-emerald-500/8 px-2.5 py-1 max-w-[140px]">
              <p className="text-[11px] text-emerald-200/80 leading-tight">{node}</p>
            </div>
            {i < nodes.length - 1 && (
              <span className="text-emerald-400/45 text-[14px] font-bold shrink-0 leading-none">→</span>
            )}
          </React.Fragment>
        ))}
      </div>
      {crossLinkHints && crossLinkHints.length > 0 && (
        <div className="mt-3 pt-2 border-t border-white/5">
          <div className={`${d.headingText} font-bold uppercase tracking-[0.14em] text-white/20 mb-1.5`}>Cross-Links</div>
          <div className="flex flex-wrap gap-1.5">
            {crossLinkHints.slice(0, 3).map((hint, i) => (
              <span key={i} className="text-[10px] text-white/35 bg-white/4 rounded px-2 py-0.5">{hint}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function structuralPageIcon(role: string): string {
  switch (role) {
    case "cover":                 return "📕";
    case "title_page":            return "📄";
    case "dedication":            return "💙";
    case "acknowledgements":      return "🙏";
    case "preface":               return "📝";
    case "about_authors":         return "👤";
    case "contents":              return "📋";
    case "copyright_frontmatter": return "©";
    case "chapter_opener":        return "📖";
    case "unit_opener":           return "📦";
    case "section_opener":        return "📑";
    case "glossary":              return "📚";
    case "index":                 return "🔍";
    case "bibliography":          return "📰";
    case "appendix":              return "📎";
    case "image_scan_heavy":      return "🖼️";
    default:                      return "📄";
  }
}

function structuralPageLabel(role: string): string {
  switch (role) {
    case "cover":                 return "Cover page — no study content";
    case "title_page":            return "Title page — no instructional content";
    case "dedication":            return "Dedication — no instructional content";
    case "acknowledgements":      return "Acknowledgements — no instructional content";
    case "preface":               return "Preface — no instructional content";
    case "about_authors":         return "Author biography — no instructional content";
    case "contents":              return "Table of contents — navigate to a content page";
    case "copyright_frontmatter": return "Copyright / front matter — no instructional content";
    case "chapter_opener":        return "Chapter opener — study notes begin on the next page";
    case "unit_opener":           return "Unit opener — study notes begin on the next page";
    case "section_opener":        return "Section opener — study notes begin on the next page";
    case "glossary":              return "Glossary — reference page, no synthesis needed";
    case "index":                 return "Index — reference page, no synthesis needed";
    case "bibliography":          return "Bibliography / References — no instructional content";
    case "appendix":              return "Appendix — navigate to a content page to study";
    case "image_scan_heavy":      return "Image-heavy page — insufficient text for synthesis";
    default:                      return "Structural page — navigate to a learning page";
  }
}

interface RightPanelProps {
  ctx: ActivePageContext;
  state: RightPanelState;
  payload?: ResolvedPanelPayload;
  intelligence: ActivePageIntelligenceSnapshot;
  guidedPath?: RenderGuidedReadingPathResult | null;
  onEvidenceClick?: (snippet: string, evidenceId?: string) => void;
  resolveEvidenceId?: (snippet: string) => string | undefined;
  focusedEvidenceId?: string | null;
  onRoleLabelMap?: (map: Map<string, string>) => void;
  /** Word-level karaoke sync — the same shared state PureReaderView's PDF overlay and
   *  ThoughtUnitNavigator already consume. RightPanel's own evidence cards mark the
   *  active word when their anchor.id matches activeSpokenWord.anchorId. */
  activeSpokenWord?: { anchorId: string | null; wordIndex: number; word: string } | null;
  onNoteSaved?: () => void;
  onStudySetGenerated?: (setId: string) => void;
  /** Called when synthesis resolves with AI-selected highlight anchors for the left panel */
  onSynthHighlightsReady?: (anchors: import("@/lib/insights/synthesizeTeachingOutput").SynthHighlightAnchor[], pageTruthKey: string) => void;
  /** Called when user clicks a cross-link that has an estimated target page */
  onCrossLinkNavigate?: (page: number) => void;
  /** TOC items for resolving cross-link labels to real page numbers */
  tocItems?: import("@/lib/stores/tocStore").TocItem[];
  /** Called when synthesis resolves with the full typed study model */
  onStudyModelReady?: (model: CurrentPageStudyModel, pageTruthKey: string) => void;
  /** Called when the user wants to expand a thought-unit (visualAnchor) into the Recall Lab v2 box layout */
  onOpenThoughtUnit?: (anchorId: string) => void;
  /** Extracted page text — feeds the inline Study Speech "Listen to this page" action */
  activePageText?: string;
  /** Effective domain preset id resolved by the LeftPanel (PureReaderView) — including
   *  any manual override — so RightPanel's visualAnchors ranking and Guided speech
   *  order agree with what the left panel is actually showing. Falls back to
   *  RightPanel's own auto-detection when the left panel hasn't reported one yet. */
  presetId?: string;
  /** Forwarded to the inline StudySpeechPanel so callers (e.g. PDF text-click) can trigger playback */
  speechPanelRef?: React.Ref<StudySpeechPanelHandle>;
  onSpeechEvidenceFocus?: (id: string | null) => void;
  onSpeechSnippetFocus?: (snippet: string | null) => void;
  onSpeechPlayStateChange?: (isReading: boolean) => void;
  /** Fires on every karaoke word-index change, for every speech mode — drives the
   *  live word box in the PDF and the marked word in the active LeftPanel card. */
  onSpeechActiveWordChange?: (anchorId: string | null, wordIndex: number, word: string) => void;
  /** Verbatim text of anchors currently painted on the PDF (PureReaderView's
   *  paint-budgeted effectiveHighlightTargets) — forwarded to the inline
   *  StudySpeechPanel so "Highlight Only" mode reads only what's visible. */
  highlightedAnchorTexts?: string[];
  /** Guided teach-loop "💬 Explain" button — fires with the paused segment's evidenceRefId. */
  onSpeechExplainSegment?: (id: string) => void;
  /** Study Tools column triggers — Whiteboard / Explain This Step / Explain It panels are
   *  rendered by the caller (pages/index.tsx); RightPanel only surfaces the entry points. */
  onOpenWhiteboard?: () => void;
  onOpenExplainStep?: () => void;
  onOpenExplainIt?: () => void;
  canonicalLeftPanelUnits?: ExpertAnchor[];
  activeThoughtUnit?: ExpertAnchor | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// When true: only the synthesis-driven UltraView path renders.
// All legacy fallbacks (ConceptBlocks, Narrative, V3, V2Map, V2Op, Guided) are suppressed.
// Pages that can't build an UltraView show a "study synthesis unavailable" message.
// Heuristic "Understand" section is replaced by a synthesis loading state.
// Set NEXT_PUBLIC_DEBUG_READER=true to reveal the wiring card in the header.
const FORCE_SYNTHESIS_ONLY = true;

const ROLE: GuidedRole = "operator";
const DEPTH: GuidedDepth = "standard";
const MODE: GuidedMode = "insight";

const LOADING_PHASES = [
  "Reading current page…",
  "Writing study notes…",
];

// Derives a human-readable teaching purpose from available domain/concept data.
// Used in both the loading skeleton and the ready-state header.
function derivePageTeachingPurpose(
  domain: string | null | undefined,
  pageKind: string | null | undefined,
  firstConceptRole: string | null | undefined,
  pageObjectiveText?: string | null,
): string {
  if (pageKind === "mathematical_exposition" || domain === "math") {
    return firstConceptRole === "formula" || firstConceptRole === "theorem"
      ? "formula / theorem" : "math procedure";
  }
  if (domain === "clinical") {
    return firstConceptRole === "contrast" ? "clinical comparison" : "clinical reasoning";
  }
  if (domain === "fiction") return "narrative scene";
  if (domain === "science") {
    if (firstConceptRole === "mechanism") return "mechanism page";
    if (firstConceptRole === "definition") return "concept introduction";
    return "science principle";
  }
  if (firstConceptRole === "contrast") return "comparison page";
  if (/strateg|approach|how to|tip|method/i.test(pageObjectiveText ?? "")) return "strategy page";
  if (firstConceptRole === "mechanism") return "mechanism page";
  if (firstConceptRole === "definition") return "concept introduction";
  if (firstConceptRole === "application" || firstConceptRole === "worked_example") return "application page";
  return "concept page";
}

// Progressive skeleton rendered while the page is being analyzed.
// Each phase reveals one more skeleton card, communicating that notes are being built live.
function PageLoadingSkeleton({ phase }: { phase: number }) {
  const hints = [
    "Analyzing domain and page type…",
    "Extracting high-yield concepts…",
    "Building study synthesis…",
  ];
  return (
    <div className="space-y-3">
      {/* Cognition status bar */}
      <div className="rounded-xl border border-emerald-400/20 bg-[#0a1a18] px-4 py-3">
        <div className="flex items-center gap-2.5 mb-1.5">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <span className="text-[12px] font-medium text-emerald-300">
            {LOADING_PHASES[phase] ?? "Writing notes…"}
          </span>
        </div>
        {phase >= 1 && (
          <div className="pl-[18px] space-y-0.5 text-[10px] font-mono text-slate-500">
            {hints.slice(0, phase).map((h, i) => (
              <div key={i}>→ {h}</div>
            ))}
          </div>
        )}
      </div>

      {/* Skeleton: Page Thesis card */}
      {phase >= 1 && (
        <div className="rounded-xl border border-amber-400/15 bg-[#0b1830] px-4 py-4 animate-pulse">
          <div className="mb-2 h-[9px] w-20 rounded bg-amber-400/20" />
          <div className="space-y-2">
            <div className="h-3 w-full rounded bg-white/8" />
            <div className="h-3 w-[83%] rounded bg-white/8" />
          </div>
        </div>
      )}

      {/* Skeleton: Page Understanding card */}
      {phase >= 2 && (
        <div className="rounded-xl border border-white/8 bg-white/2 px-4 py-4 animate-pulse">
          <div className="mb-3 h-[9px] w-32 rounded bg-white/10" />
          <div className="space-y-2">
            {[90, 72].map((w, i) => (
              <div key={i} className="rounded-lg border border-white/6 px-3 py-2.5">
                <div className="mb-1.5 h-[7px] w-14 rounded bg-white/8" />
                <div className="h-2.5 rounded bg-white/6" style={{ width: `${w}%` }} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Skeleton: Concept Blocks card */}
      {phase >= 2 && (
        <div className="rounded-xl border border-white/8 bg-white/2 px-4 py-4 animate-pulse">
          <div className="mb-3 h-[9px] w-28 rounded bg-white/10" />
          <div className="mb-3 flex gap-2">
            {[1, 2].map(i => (
              <div key={i} className="h-6 w-20 rounded-full border border-white/10 bg-white/5" />
            ))}
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#0a1428] px-4 py-4 space-y-2.5">
            <div className="h-3 w-36 rounded bg-white/8" />
            <div className="h-2.5 w-full rounded bg-white/6" />
            <div className="h-2.5 w-[78%] rounded bg-white/6" />
          </div>
        </div>
      )}

      {/* Skeleton: Mini Test */}
      {phase >= 3 && (
        <div className="rounded-xl border border-white/8 bg-white/2 px-4 py-4 animate-pulse">
          <div className="mb-2.5 h-[9px] w-20 rounded bg-white/10" />
          <div className="space-y-2">
            {[88, 72].map((w, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-white/12" />
                <div className="h-2.5 rounded bg-white/6" style={{ width: `${w}%` }} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Universal color system — matches left highlights exactly.
// important=amber, support=blue, additional=sky, warning=rose
const READER_ROLE_STYLES: Record<ReaderRole, { border: string; bg: string; label: string; badge: string; text: string }> = {
  important: {
    border: "border-amber-400/40",
    bg: "bg-amber-500/5",
    label: "text-amber-300",
    badge: "bg-amber-500/20 text-amber-200",
    text: "text-slate-100",
  },
  support: {
    border: "border-blue-400/40",
    bg: "bg-blue-500/5",
    label: "text-blue-300",
    badge: "bg-blue-500/20 text-blue-200",
    text: "text-slate-200",
  },
  additional: {
    border: "border-sky-400/35",
    bg: "bg-sky-500/5",
    label: "text-sky-300",
    badge: "bg-sky-500/20 text-sky-200",
    text: "text-slate-300",
  },
  warning: {
    border: "border-rose-400/50",
    bg: "bg-rose-500/8",
    label: "text-rose-300",
    badge: "bg-rose-500/20 text-rose-200",
    text: "text-slate-100",
  },
};

// SemanticHighlightKind → reader role (for kindMeta fallback)
const KIND_ROLE: Record<SemanticHighlightKind | string, { label: string; color: string }> = {
  main_pattern:        { label: "Important",  color: "text-amber-300" },
  main_mechanism:      { label: "Important",  color: "text-amber-300" },
  support_decision:    { label: "Support",    color: "text-blue-300" },
  support_explanation: { label: "Support",    color: "text-blue-300" },
  trap_warning:        { label: "Warning",    color: "text-rose-300" },
  trap_boundary:       { label: "Warning",    color: "text-rose-300" },
  support_distinction: { label: "Additional", color: "text-sky-300" },
  support_relation:    { label: "Additional", color: "text-sky-300" },
  support_application: { label: "Support",    color: "text-blue-300" },
  weak_caveat:         { label: "Note",       color: "text-slate-400" },
};

function kindMeta(kind: string, shortLabel?: string): { label: string; color: string } {
  if (shortLabel && shortLabel !== kind.replace(/_/g, " ")) {
    const color =
      shortLabel === "Core Principle"    ? "text-amber-300"
      : shortLabel === "Mechanism"       ? "text-teal-300"
      : shortLabel === "Definition"      ? "text-blue-300"
      : shortLabel === "Trap"            ? "text-rose-300"
      : shortLabel === "Rule"            ? "text-violet-300"
      : shortLabel === "Application"     ? "text-purple-300"
      : shortLabel === "Formula / Theorem" ? "text-amber-200"
      : shortLabel === "Clinical Signal" ? "text-emerald-300"
      : shortLabel === "Example"         ? "text-green-300"
      : shortLabel === "Supporting Detail" ? "text-slate-400"
      // legacy labels — keep working during transition
      : shortLabel === "Warning"         ? "text-rose-300"
      : shortLabel === "Important"       ? "text-amber-300"
      : shortLabel === "Support"         ? "text-blue-300"
      : shortLabel === "Additional"      ? "text-sky-300"
      : shortLabel === "Note"            ? "text-slate-400"
      : "text-slate-300";
    return { label: shortLabel, color };
  }
  return KIND_ROLE[kind] ?? { label: kind.replace(/_/g, " "), color: "text-slate-300" };
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function RightPanel({
  ctx,
  state,
  intelligence,
  guidedPath,
  onEvidenceClick,
  resolveEvidenceId,
  focusedEvidenceId,
  onRoleLabelMap,
  activeSpokenWord,
  onNoteSaved,
  onStudySetGenerated,
  onSynthHighlightsReady,
  onCrossLinkNavigate,
  tocItems,
  onStudyModelReady,
  onOpenThoughtUnit,
  activePageText,
  presetId,
  speechPanelRef,
  onSpeechEvidenceFocus,
  onSpeechSnippetFocus,
  onSpeechPlayStateChange,
  onSpeechActiveWordChange,
  highlightedAnchorTexts,
  onSpeechExplainSegment,
  onOpenWhiteboard,
  onOpenExplainStep,
  onOpenExplainIt,
  canonicalLeftPanelUnits = [],
  activeThoughtUnit = null,
}: RightPanelProps) {
  const pageTruthKey = intelligence.pageTruthKey;
  const pageModel = intelligence.pageModel;
  const pageTruth = intelligence.pageTruth;
  const isCurrentPageModel = Boolean(intelligence.isCurrentPage && pageModel && intelligence.status === "ready");
  const panelScrollRef = useRef<HTMLElement>(null);

  // One-click integration: when the left panel/PDF focuses a thought unit,
  // scroll its matching card into view here too — same focusedEvidenceId
  // the PDF overlay glow and ThoughtUnitNavigator active state already key off.
  useEffect(() => {
    if (!focusedEvidenceId || !panelScrollRef.current) return;
    const el = panelScrollRef.current.querySelector(
      `[data-evidence-id="${CSS.escape(focusedEvidenceId)}"]`,
    );
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [focusedEvidenceId]);

  useEffect(() => {
    if (!activeThoughtUnit) return;
    console.log("[RIGHT_PANEL_EXPANSION_SOURCE]", {
      thoughtUnitId: activeThoughtUnit.id,
      source: activeThoughtUnit.source,
      page: activeThoughtUnit.page,
      sourceText: activeThoughtUnit.exactText.slice(0, 80),
      fallbackUsed: activeThoughtUnit.source !== "canonical_left_panel",
    });
    console.log("[RIGHT_PANEL_ACTIVE_UNIT]", { thoughtUnitId: activeThoughtUnit.id });
  }, [activeThoughtUnit]);

  // [TRACE renderIdentity] — logs what document/page/text is being rendered.
  // If documentId or pageNumber in pageModel differs from pageTruthKey, you
  // have a stale render.
  useEffect(() => {
    if (isCurrentPageModel && pageModel) {
      const preview = (pageModel as any).sourceText
        ? String((pageModel as any).sourceText).slice(0, 60)
        : pageModel.paragraphInsights?.[0]?.cleanedText?.slice(0, 60) ?? "(no text)";
      console.log("[TRACE renderIdentity]", {
        pageTruthKey,
        modelDocId: pageModel.documentId,
        modelPage: pageModel.pageNumber,
        preview,
      });
    }
  }, [isCurrentPageModel, pageModel, pageTruthKey]);

  // Hard-reset selected concept block when page/document changes
  const [selectedBlockIndex, setSelectedBlockIndex] = useState(0);
  const renderKey = pageTruthKey;
  useEffect(() => { setSelectedBlockIndex(0); }, [renderKey]);

  // Cognitive density zoom — cycles through 4 reading modes, persisted in sessionStorage.
  // Uses a token map so ALL cards in UltraView scale together, not just the wrapper font-size.
  const DENSITY_TOKENS = {
    compact: { cardPadding: "p-3",    headingText: "text-[11px]", bodyText: "text-[12px]", lineHeight: "leading-snug",    space: "space-y-2" },
    normal:  { cardPadding: "p-4",    headingText: "text-[12px]", bodyText: "text-[13px]", lineHeight: "leading-relaxed", space: "space-y-3" },
    focus:   { cardPadding: "p-5",    headingText: "text-[14px]", bodyText: "text-[15px]", lineHeight: "leading-7",       space: "space-y-4" },
    deep:    { cardPadding: "p-6",    headingText: "text-[16px]", bodyText: "text-[17px]", lineHeight: "leading-8",       space: "space-y-5" },
  } as const;
  type DensityLevel = keyof typeof DENSITY_TOKENS;

  const [rpZoom, setRpZoom] = useState<DensityLevel>(() => {
    try { return (sessionStorage.getItem("rpDensity") as DensityLevel) || "normal"; } catch { return "normal"; }
  });
  const cycleZoom = () => {
    const steps: DensityLevel[] = ["compact", "normal", "focus", "deep"];
    const next = steps[(steps.indexOf(rpZoom) + 1) % steps.length];
    setRpZoom(next);
    try { sessionStorage.setItem("rpDensity", next); } catch {}
  };
  const dt = DENSITY_TOKENS[rpZoom];
  const zoomLabel = rpZoom === "compact" ? "Compact" : rpZoom === "normal" ? "Normal" : rpZoom === "focus" ? "Focus" : "Deep";

  // Loading phase cycling
  const [loadingPhase, setLoadingPhase] = useState(0);
  const loadingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (intelligence.status === "loading") {
      setLoadingPhase(0);
      loadingIntervalRef.current = setInterval(() => {
        setLoadingPhase((p) => (p + 1) % LOADING_PHASES.length);
      }, 700);
    } else {
      if (loadingIntervalRef.current) {
        clearInterval(loadingIntervalRef.current);
        loadingIntervalRef.current = null;
      }
    }
    return () => { if (loadingIntervalRef.current) clearInterval(loadingIntervalRef.current); };
  }, [intelligence.status]);

  // v1 guided view — fallback only
  const guidedView = useMemo(() => {
    if (!pageTruth?.canRenderRightPanel) return null;
    if (!isCurrentPageModel) return null;
    if (!pageModel) return null;
    return buildGuidedReadView({
      pageModel,
      pageStory: intelligence.story || pageModel.pageStory || null,
      mode: MODE, role: ROLE, depth: DEPTH,
      pageClass: intelligence.pageClass || undefined,
    });
  }, [pageTruth?.canRenderRightPanel, isCurrentPageModel, pageModel, intelligence.story, intelligence.pageClass]);

  const resolveFromAnchor = (anchor: EvidenceAnchor) => resolveEvidenceId?.(anchor.text);
  const { selectedStepId, selectStep, clearSelection } = useGuidedHighlightSync({
    steps: guidedView?.steps || [],
    onEvidenceClick,
    resolveEvidenceId: resolveFromAnchor,
    autoFocusOnInit: false,
  });

  useEffect(() => {
    clearSelection();
    onEvidenceClick?.("", undefined);
  }, [pageTruthKey, clearSelection, onEvidenceClick]);

  useEffect(() => {
    if (intelligence.status === "loading") clearSelection();
  }, [intelligence.status, clearSelection]);

  // ---------------------------------------------------------------------------
  // ULTRA view — primary content layer (universal reader)
  // ---------------------------------------------------------------------------

  // Non-instructional gate: suppresses all content views on title/figure/TOC pages
  // MUST be declared before ultraPageView useMemo — normResult is captured in the closure.
  const normResult = intelligence.normResult ?? null;
  const pageIsNonInstructional =
    isCurrentPageModel &&
    intelligence.status !== "loading" &&
    normResult !== null &&
    normResult.shouldRenderFullPanel === false;

  const STRUCTURAL_PAGE_ROLES = new Set([
    // Front matter
    "cover", "title_page", "dedication", "acknowledgements", "preface", "about_authors",
    "copyright_frontmatter",
    // Navigation / structural — chapter_opener, learning_objectives block synthesis
    "contents", "unit_opener", "section_opener", "chapter_opener", "learning_objectives",
    // Back matter
    "glossary", "index", "bibliography", "appendix",
    // Unrenderable
    "image_scan_heavy",
  ]);
  const isStructuralPage = STRUCTURAL_PAGE_ROLES.has(intelligence.pageRole ?? "");


  const ultraPageView = useMemo((): UltraPageView | null => {
    if (!isCurrentPageModel || !pageModel) return null;
    // Pass the already-computed normResult so buildUltraPageView does not
    // re-classify the page from filtered paragraphInsights text — that second
    // classification was downgrading math pages to instructional_prose.
    return buildUltraPageView(pageModel, { existingNormResult: normResult ?? undefined });
  // pageTruthKey ensures mini test + compression reset immediately on page/doc change
  }, [isCurrentPageModel, pageModel, pageTruthKey, normResult]);

  // Educational Interpretation Engine: fires async LLM synthesis once heuristic
  // blocks are ready. Returns null until complete; triggers re-render when done.
  // Use teachingStatement (top-down heading+canonical) NOT coreIdea (heuristic sentence).
  // coreIdea can be a figure caption; teachingStatement comes from normalization confidence scores.
  //
  // CRITICAL: enabled is driven ONLY by active page text + structural gate — NOT by
  // isCurrentPageModel. isCurrentPageModel requires status==="ready" && pageModel &&
  // pageTruth.canRenderRightPanel!==false; on sparse/suppressed pages those are false,
  // which previously blocked synthesis entirely even though ctx.pageText had 4000+ chars.
  // RightPanel is keyed by pageTruthKey (remounts per page) so ctx.pageText is always the
  // active page. This is the root-cause fix for "[WIRE] _synth synthPresent:false".
  const hasUsablePageText = (ctx?.pageText?.length ?? 0) > 500;
  const synthEnabled = !isStructuralPage && (!!ultraPageView || hasUsablePageText);

  // Auto-detected domain preset — same keyword-matching detectDomainPreset() the
  // left panel uses, run independently here on whatever page text RightPanel
  // already has. Only a fallback: the `presetId` prop (the left panel's actual
  // effective preset, including any manual override) wins whenever the caller
  // has reported one, so RightPanel/Guided-speech never disagrees with what's
  // actually displayed in the left panel. Computed here (not just below) so the
  // synthesis call below can pass it through for B3's domain-category prompt injection.
  const detectedPresetId = useMemo(
    () => detectDomainPreset(ctx?.pageText ?? "", ctx?.chapterTitle ?? ctx?.sectionTitle ?? undefined),
    [ctx?.pageText, ctx?.chapterTitle, ctx?.sectionTitle],
  );
  const effectivePresetId = presetId ?? detectedPresetId;

  const {
    synthesis: teachingSynthesis,
    status: synthStatus,
    stage1Status,
    stage2Status,
    stage3Status,
    errorMessage: synthErrorMsg,
    retry: retrySynthesis,
    claudeEnrichment,
  } = useTeachingSynthesis({
    pageTruthKey,
    pageObjective: ultraPageView?.teachingStatement,
    pageThesis:    ultraPageView?.pageThesis ?? undefined,
    pageSummary:   pageModel?.pageSummary ?? undefined,
    // Pass full pageText — cleaner + synthesis hook slices to 1500 internally.
    pageText:      ctx?.pageText ?? undefined,
    domain: (ultraPageView?._debug?.domain) ?? null,
    presetId: effectivePresetId,
    blocks: ultraPageView?.blocks ?? [],
    enabled: synthEnabled,
    pageNumber: ctx?.pageNumber ?? undefined,
  });

  // ── DIAGNOSTIC: [SYNTH_GATE] — fires every time synthEnabled or synthStatus changes ──
  // Answers: "Why is synthesis running/blocked on this page?"
  useEffect(() => {
    console.log("[SYNTH_GATE]", {
      page:                   ctx?.pageNumber ?? null,
      pageRole:               intelligence.pageRole ?? null,
      pageType:               (teachingSynthesis as any)?.pageType ?? null,
      shouldRenderFullPanel:  normResult?.shouldRenderFullPanel ?? null,
      pageIsNonInstructional,
      isStructuralPage,
      synthEnabled,
      synthStatus,
      stage1Status,
      hasUsablePageText,
      ctxPageTextLength:      ctx?.pageText?.length ?? 0,
      ultraPageViewPresent:   !!ultraPageView,
      pageTruthKey,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageTruthKey, synthEnabled, synthStatus]);

  // OpenAI itself confirmed non-instructional — secondary gate for pages heuristics miss.
  // "review_checkpoint" covers: review questions, learning objectives, summaries, checkpoints.
  const openAIConfirmsNonInstructional = teachingSynthesis?.pageType === "review_checkpoint";

  // 30-second UI timeout: if synthesis is still loading after 30s, show a visible error.
  // Resets whenever the page changes or synthesis finishes.
  const [synthTimedOut, setSynthTimedOut] = useState(false);
  const synthUiTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setSynthTimedOut(false);
    if (synthUiTimeoutRef.current) { clearTimeout(synthUiTimeoutRef.current); synthUiTimeoutRef.current = null; }
    if (synthStatus === "loading") {
      synthUiTimeoutRef.current = setTimeout(() => {
        console.warn("[SYNTH_UI_TIMEOUT]", {
          page: ctx?.pageNumber,
          synthStatus,
          stage1Status,
          stage2Status,
          elapsedMs: 30_000,
          message: "Synthesis still loading after 30s — showing timeout UI",
        });
        setSynthTimedOut(true);
      }, 30_000);
    }
    return () => { if (synthUiTimeoutRef.current) { clearTimeout(synthUiTimeoutRef.current); synthUiTimeoutRef.current = null; } };
  }, [synthStatus, pageTruthKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Apply teaching synthesis over heuristic view without re-running the pipeline.
  // Synthesis is the professor layer — it supersedes heuristic sentence extraction,
  // but every synthesis field is validated by validSynthField before replacing a
  // heuristic value. This prevents cross-domain phrasing, publisher artifacts, and
  // incomplete sentences from reaching the rendered cards.
  //
  // When ultraPageView is null (0 heuristic concepts) but synthesis ran via text-fallback,
  // we build a minimal scaffold view so _synth can be attached and studyModel produced.
  const ultraPageViewWithSynthesis = useMemo((): UltraPageView | null => {
    if (!ultraPageView && !teachingSynthesis) return null;

    // Text-fallback scaffold: synthesis ran but heuristic pipeline produced no view.
    // Build a minimal UltraPageView so _synth can be attached and studyModel built.
    // Clean pageThesis + coreIdea to strip running-header debris before display
    // (e.g. "The Chemical Context of Life 29" → "The Chemical Context of Life").
    const rawBaseView: UltraPageView = ultraPageView ?? {
      title:       ctx?.sectionTitle ?? ctx?.chapterTitle ?? `Page ${ctx?.pageNumber ?? ""}`,
      subtitle:    "",
      coreIdea:    teachingSynthesis?.coreIdea ?? "",
      blocks:      [],
      miniTest:    [],
      compression: [],
      steps:       [],
    };
    const baseView: UltraPageView = {
      ...rawBaseView,
      pageThesis: rawBaseView.pageThesis ? (cleanThesisLine(rawBaseView.pageThesis) ?? rawBaseView.pageThesis) : rawBaseView.pageThesis,
      coreIdea:   rawBaseView.coreIdea   ? (cleanThesisLine(rawBaseView.coreIdea)   ?? rawBaseView.coreIdea)   : rawBaseView.coreIdea,
    };

    if (!teachingSynthesis) return baseView;

    const synthDomain: string | null = baseView._debug?.domain ?? null;

    console.log("[TRACE:synthesis]", {
      domain: synthDomain,
      symbolicDensity: baseView._debug?.symbolicDensity ?? "n/a",
      hasSynthesis: true,
      rawBlockCount: baseView.blocks.length,
      synthConceptCount: teachingSynthesis.concepts?.length ?? 0,
      textFallback: !ultraPageView,
    });

    const finalCoreIdea = teachingSynthesis.coreIdea?.length >= 20
      ? teachingSynthesis.coreIdea
      : baseView.coreIdea;

    // Per-concept overlay: synthesis rewrites principle/mechanism/trap/rule/misconception/examHook.
    // Each field is validated before replacing the heuristic value.
    // When baseView.blocks = [] (heuristic found nothing) but synthesis returned concepts,
    // build UltraConceptBlocks directly from synthesis so Concept Blocks section is populated.
    console.log("[CONCEPT_BLOCK_INPUT]", {
      page: ctx?.pageNumber ?? null,
      baseBlockCount: baseView.blocks.length,
      synthConceptCount: teachingSynthesis.concepts?.length ?? 0,
      textFallback: !ultraPageView,
      domain: synthDomain,
    });

    const finalBlocks = teachingSynthesis.concepts?.length
      ? baseView.blocks.length > 0
        // ── Overlay path: heuristic blocks exist, synthesis enriches them ──
        ? baseView.blocks.map((b, i) => {
            const sc = teachingSynthesis.concepts[i];
            if (!sc) return b;

            const safeTitle          = validSynthField(sc.title,       synthDomain);
            const safePattern        = validSynthField(sc.principle,    synthDomain);
            const safeSurgicalReason = validSynthField(sc.mechanism,    synthDomain);
            const safeTrap           = validSynthField(sc.trap,         synthDomain);
            const safeRule           = validSynthField(sc.rule,         synthDomain);
            const safeMisconception  = validSynthField(sc.misconception, synthDomain);
            const safeExamHook       = validSynthField(sc.examHook,     synthDomain);

            console.log(`[TRACE:synth-block-${i}]`, {
              domain: synthDomain,
              heuristicTitle: b.title,
              synthTitle: sc.title ?? null,
              safeTitle: safeTitle ?? "REJECTED",
              heuristicPattern: b.pattern?.slice(0, 60),
              synthPrinciple: sc.principle?.slice(0, 60) ?? null,
              safePattern: safePattern ? safePattern.slice(0, 60) : "REJECTED",
              safeSurgicalReason: safeSurgicalReason ? safeSurgicalReason.slice(0, 60) : "REJECTED",
              safeTrap: safeTrap ? safeTrap.slice(0, 60) : "REJECTED",
              safeRule: safeRule ? safeRule.slice(0, 60) : "REJECTED",
            });

            return {
              ...b,
              title:          safeTitle           ?? b.title,
              pattern:        safePattern        ?? b.pattern,
              surgicalReason: safeSurgicalReason  ?? b.surgicalReason,
              trap:           safeTrap            ?? b.trap,
              rule:           safeRule            ?? b.rule,
              misconception:  safeMisconception   ?? undefined,
              examHook:       safeExamHook        ?? undefined,
            };
          })
        // ── Build path: no heuristic blocks, construct directly from synthesis concepts ──
        : teachingSynthesis.concepts.slice(0, 4).map((sc, i) => {
            const safeTitle     = validSynthField(sc.title,        synthDomain) ?? sc.title ?? `Concept ${i + 1}`;
            const safePattern   = validSynthField(sc.principle,    synthDomain) ?? sc.principle ?? "";
            const safeMechanism = validSynthField(sc.mechanism,    synthDomain) ?? sc.mechanism ?? "";
            const safeTrap      = validSynthField(sc.trap,         synthDomain) ?? sc.trap ?? "";
            const safeRule      = validSynthField(sc.rule,         synthDomain) ?? sc.rule ?? "";
            const block = {
              conceptId:      `synth-${i}`,
              ordinal:        i + 1,
              title:          safeTitle,
              pattern:        safePattern,
              surgicalReason: safeMechanism,
              trap:           safeTrap,
              rule:           safeRule,
              importance:     "high",
              misconception:  sc.misconception ?? undefined,
              examHook:       sc.examHook ?? undefined,
              synthDerived:   true as const,
            };
            console.log(`[CONCEPT_BLOCK_READY]`, {
              index: i, title: block.title?.slice(0, 50),
              pattern: block.pattern?.slice(0, 70),
              mechanism: block.surgicalReason?.slice(0, 60),
            });
            return block;
          })
      : baseView.blocks;

    // Page-level synthesis fields — validated and stored for dedicated display sections.
    // These are surfaced as Study Notes (Why This Matters / Key Mechanism / etc.),
    // NOT buried in STR Compression bullets.
    const vMech     = validSynthField(teachingSynthesis.mechanism,          synthDomain, "mechanism");
    const vTrap     = validSynthField(teachingSynthesis.trap,               synthDomain, "trap");
    const vApply    = validSynthField(teachingSynthesis.application,        synthDomain, "application");
    const vFlow     = validSynthField(teachingSynthesis.reasoningFlow,      synthDomain, "reasoningFlow");
    const vAlert    = validSynthField(teachingSynthesis.misconceptionAlert,  synthDomain, "misconceptionAlert");
    const vExamIdea = validSynthField(teachingSynthesis.examCriticalIdea,   synthDomain, "examCriticalIdea");
    const vMemory   = validSynthField(teachingSynthesis.memoryAnchor,       synthDomain, "memoryAnchor");
    console.log("[TRACE:synth-page-fields]", {
      domain: synthDomain,
      mechanism:   vMech     ? vMech.slice(0, 60)  : `REJECTED: ${teachingSynthesis.mechanism?.slice(0, 60)}`,
      application: vApply    ? vApply.slice(0, 60) : `REJECTED: ${teachingSynthesis.application?.slice(0, 60)}`,
      alert:       vAlert    ? vAlert.slice(0, 60) : `REJECTED: ${teachingSynthesis.misconceptionAlert?.slice(0, 60)}`,
      memoryAnchor: vMemory  ? vMemory.slice(0, 60) : "null",
      examIdea:    vExamIdea ? vExamIdea.slice(0, 60) : "null",
    });
    console.log("[RP_SELECTED_FIELDS]", {
      domain: synthDomain,
      selected: {
        mechanism:          vMech     ? vMech.slice(0, 80)     : null,
        trap:               vTrap     ? vTrap.slice(0, 80)     : null,
        application:        vApply    ? vApply.slice(0, 80)    : null,
        reasoningFlow:      vFlow     ? vFlow.slice(0, 80)     : null,
        misconceptionAlert: vAlert    ? vAlert.slice(0, 80)    : null,
        examCriticalIdea:   vExamIdea ? vExamIdea.slice(0, 80) : null,
        memoryAnchor:       vMemory   ? vMemory.slice(0, 80)   : null,
      },
      rejectedFields: [
        !vMech     && teachingSynthesis.mechanism          ? "mechanism"          : null,
        !vTrap     && teachingSynthesis.trap               ? "trap"               : null,
        !vApply    && teachingSynthesis.application        ? "application"        : null,
        !vFlow     && teachingSynthesis.reasoningFlow      ? "reasoningFlow"      : null,
        !vAlert    && teachingSynthesis.misconceptionAlert ? "misconceptionAlert" : null,
        !vExamIdea && teachingSynthesis.examCriticalIdea   ? "examCriticalIdea"   : null,
        !vMemory   && teachingSynthesis.memoryAnchor       ? "memoryAnchor"       : null,
      ].filter(Boolean),
    });

    const finalCompression = baseView.compression;

    // Mini-tests: prefer synthesis questions (domain-specific) over heuristic templates
    const finalMiniTest = teachingSynthesis.miniTests?.length
      ? teachingSynthesis.miniTests.slice(0, 5)
      : baseView.miniTest;

    // Wiring verification: if this log shows "Cengage…", "Se C tion…", or cross-domain text,
    // then validSynthField is not catching it. If log is clean but UI shows bad text,
    // JSX is rendering from a different source than finalBlocks — check displayView or visibleBlocks.
    console.log("[TRACE RIGHTPANEL FINAL]", {
      component: "RightPanel.tsx > ultraPageViewWithSynthesis",
      domain: synthDomain,
      rawBlockCount: baseView.blocks.length,
      finalBlockCount: finalBlocks.length,
      textFallback: !ultraPageView,
      synthSections: { whyItMatters: !!vApply, keyMechanism: !!vMech, commonConfusion: !!vAlert, memoryAnchor: !!vMemory },
      coreIdea: finalCoreIdea?.slice(0, 80) ?? null,
      finalBlocks: finalBlocks.map((b, i) => ({
        i,
        title: b.title?.slice(0, 50),
        pattern: b.pattern?.slice(0, 70),
        surgicalReason: b.surgicalReason?.slice(0, 70),
        trap: b.trap?.slice(0, 60),
        rule: b.rule?.slice(0, 60),
        conceptRole: b.conceptRole,
        anchorText: b.anchorText?.slice(0, 60),
      })),
    });

    const result = {
      ...baseView,
      coreIdea: finalCoreIdea,
      blocks: finalBlocks,
      compression: finalCompression,
      miniTest: finalMiniTest,
      // Surfaced synthesis sections — displayed as dedicated Study Notes cards
      _synth: {
        whyItMatters:        vApply    ?? null,
        keyMechanism:        vMech     ?? null,
        commonConfusion:     vAlert ?? vTrap ?? null,
        memoryAnchor:        vMemory   ?? null,
        reasoningFlow:       vFlow     ?? null,
        examSignal:          vExamIdea ?? null,
        highlightAnchors:    teachingSynthesis.highlightAnchors ?? null,
        externalStudyLinks:  teachingSynthesis.externalStudyLinks ?? null,
        relatedVideoQueries: teachingSynthesis.relatedVideoQueries ?? null,
        aiConcepts:          teachingSynthesis.concepts ?? null, // OpenAI-reinterpreted concept blocks
        miniTestItems:       teachingSynthesis.miniTestItems ?? null,
        preReadRecallItems:  teachingSynthesis.preReadRecallItems ?? null,
      },
    } as UltraPageView & { _synth: Record<string, unknown> };
    console.log("[SYNTH_ATTACHED]", {
      hasSynth: true,
      page: ctx?.pageNumber ?? null,
      textFallback: !ultraPageView,
      coreIdea: finalCoreIdea?.slice(0, 60) ?? null,
      whyItMatters: !!vApply,
      keyMechanism: !!vMech,
    });
    return result;
  }, [ultraPageView, teachingSynthesis, ctx?.pageNumber, ctx?.sectionTitle, ctx?.chapterTitle]);

  // Typed study model built when synthesis resolves — shared with all downstream features.
  const studyModel = useMemo((): CurrentPageStudyModel | null => {
    const synth = (ultraPageViewWithSynthesis as any)?._synth as Record<string, unknown> | undefined;
    if (!synth || !ultraPageViewWithSynthesis) return null;
    return buildStudyModel(
      ultraPageViewWithSynthesis,
      synth,
      ctx?.documentId ?? "",
      ctx?.pageNumber ?? 0,
      effectivePresetId,
    );
  }, [ultraPageViewWithSynthesis, ctx?.documentId, ctx?.pageNumber, effectivePresetId]);

  // Re-sort blocks to match badge order (left page physical position order).
  const displayView = useMemo((): UltraPageView | null => {
    if (!ultraPageViewWithSynthesis) return null;
    const pageNeighborhoods = guidedPath?.neighborhoods;
    if (!pageNeighborhoods?.length) return ultraPageViewWithSynthesis;

    const byConceptId = new Map(ultraPageViewWithSynthesis.blocks.map((b) => [b.conceptId, b]));
    const ordered: UltraConceptBlock[] = [];
    for (const n of pageNeighborhoods) {
      if (!n.conceptId) continue;
      const block = byConceptId.get(n.conceptId);
      if (block) ordered.push({ ...block, ordinal: ordered.length + 1 });
    }
    for (const block of ultraPageViewWithSynthesis.blocks) {
      if (!ordered.some((b) => b.conceptId === block.conceptId)) {
        ordered.push({ ...block, ordinal: ordered.length + 1 });
      }
    }
    return { ...ultraPageViewWithSynthesis, blocks: ordered };
  }, [ultraPageViewWithSynthesis, guidedPath]);

  // Emit conceptId → roleLabel map so the left panel can label its badges.
  const roleLabelMap = useMemo((): Map<string, string> => {
    if (!ultraPageViewWithSynthesis?.steps) return new Map();
    return new Map(ultraPageViewWithSynthesis.steps.map((s) => [s.conceptId, s.roleLabel]));
  }, [ultraPageViewWithSynthesis]);

  useEffect(() => {
    onRoleLabelMap?.(roleLabelMap);
  }, [roleLabelMap, onRoleLabelMap]);

  // Notify parent with AI-selected highlight anchors and the full study model when synthesis resolves.
  // Uses pageTruthKey as a dependency so switching pages clears the anchors immediately.
  useEffect(() => {
    const anchors = (ultraPageViewWithSynthesis as any)?._synth?.highlightAnchors;
    console.log("[HIGHLIGHT:openai]", {
      count: anchors?.length ?? 0,
      texts: anchors?.map((a: any) => ({ text: a.text?.slice(0, 40), type: a.anchorType })) ?? [],
      pageTruthKey,
    });
    // Proof of what is actually rendered in the right panel at this moment.
    // Correlate with [RIGHT_PANEL_SOURCE] to confirm openai_stage1/openai_stage2/fallback.
    console.log("[RIGHT_PANEL_RENDER]", {
      page:              studyModel?.page ?? null,
      hasStudyModel:     !!studyModel,
      pageThesis:        studyModel?.pageThesis?.slice(0, 100) ?? null,
      conceptBlockCount: studyModel?.conceptBlocks?.length ?? 0,
      conceptTitles:     studyModel?.conceptBlocks?.map(b => b.title.slice(0, 40)) ?? [],
      studyFieldCount:   studyModel ? Object.values(studyModel.studyNotes).filter(Boolean).length : 0,
      whyThisMatters:    studyModel?.studyNotes?.whyThisMatters?.slice(0, 80) ?? null,
      keyMechanism:      studyModel?.studyNotes?.keyMechanism?.slice(0, 80) ?? null,
      commonConfusion:   studyModel?.studyNotes?.commonConfusion?.slice(0, 80) ?? null,
    });
    // ── DIAGNOSTIC: [FINAL_STUDY_MODEL] — proof the model exists and what it contains ──
    console.log("[FINAL_STUDY_MODEL]", {
      page:                  studyModel?.page ?? null,
      thesisExists:          !!studyModel?.pageThesis,
      thesisPreview:         studyModel?.pageThesis?.slice(0, 80) ?? null,
      conceptBlocks:         studyModel?.conceptBlocks?.length ?? 0,
      visualAnchors:         studyModel?.visualAnchors?.length ?? 0,
      highlightAnchors:      studyModel?.highlightAnchors?.length ?? 0,
      studyNotesPopulated:   studyModel ? Object.values(studyModel.studyNotes).filter(Boolean).length : 0,
      checkpoints:           studyModel?.miniTestItems?.length ?? 0,
      preReadRecall:         studyModel?.preReadRecallItems?.length ?? 0,
      willCallOnStudyModelReady: !!(studyModel && onStudyModelReady),
    });

    // Block emit for structural/non-instructional pages — left panel must not receive
    // a study model for chapter openers, learning objectives, or review checkpoint pages.
    const blockEmit = isStructuralPage || openAIConfirmsNonInstructional;
    if (studyModel && onStudyModelReady && !blockEmit) {
      console.log("[WIRE] studyModel accepted", {
        pageTruthKey,
        page: studyModel.page,
        thesis: studyModel.pageThesis?.slice(0, 60),
        anchors: studyModel.highlightAnchors?.length ?? 0,
        preReadRecall: (studyModel as any).preReadRecallItems?.length ?? 0,
      });
      onStudyModelReady(studyModel, pageTruthKey);
    } else if (blockEmit && studyModel) {
      console.log("[SYNTH_BLOCKED]", {
        reason: isStructuralPage ? "structural page role" : "openAI review_checkpoint",
        pageRole: intelligence.pageRole ?? null,
        pageType: teachingSynthesis?.pageType ?? null,
        page: studyModel.page,
      });
    }
  }, [ultraPageViewWithSynthesis, studyModel, pageTruthKey, onStudyModelReady]);

  // Legacy concept blocks — kept for ConceptBlocksView fallback
  const readerPageView = useMemo((): ReaderPageView | null => {
    if (!isCurrentPageModel || !pageModel) return null;
    const view = extractConceptBlocks(pageModel);
    return view.isWeak ? null : view;
  }, [isCurrentPageModel, pageModel, pageTruthKey]);

  // ---------------------------------------------------------------------------
  // Narrative blocks + shadow recall (fallback content layer)
  // ---------------------------------------------------------------------------
  // Sentence-level narrative view — primary story layer (4 semantic sections)
  const narrativePageView = useMemo((): NarrativeBuildResult | null => {
    if (!isCurrentPageModel || !pageModel) return null;
    const candidates = buildSentenceCandidatesFromPageModel(pageModel, pageModel.pageNumber ?? 0);
    if (!candidates.length) return null;
    return buildNarrativePageView({
      candidates,
      pageNumber: pageModel.pageNumber ?? 0,
      pageTitle: pageModel.pageSummary,
      maxSupportPerSection: 3,
    });
  }, [isCurrentPageModel, pageModel]);

  // Legacy 3-block narrative (core/logic/application) — fallback only
  const narrativeBlocks = useMemo((): NarrativeBlock[] => {
    if (!isCurrentPageModel || !pageModel) return [];
    return buildNarrativeBlocks(pageModel, intelligence.storyV3);
  }, [isCurrentPageModel, pageModel, intelligence.storyV3]);

  const shadowRecall = useMemo((): ShadowRecallModel | null => {
    if (!isCurrentPageModel || !pageModel) {
      console.log("[SHADOW_RECALL_RENDER]", { visible: false, reason: !isCurrentPageModel ? "not current page model" : "no pageModel" });
      return null;
    }
    const sr = buildShadowRecall(pageModel, intelligence.storyV3 ?? undefined);
    console.log("[SHADOW_RECALL_RENDER]", { visible: true, pageLabel: sr.pageLabel });
    return sr;
  }, [isCurrentPageModel, pageModel, intelligence.storyV3]);

  const [recallOpen, setRecallOpen] = useState(false);
  // Reset recall reveal when page changes
  useEffect(() => { setRecallOpen(false); }, [pageTruthKey]);

  // ---------------------------------------------------------------------------
  // Rendering decision
  // ---------------------------------------------------------------------------
  const storyV3 = intelligence.storyV3;
  const storyV2 = intelligence.storyV2;

  // V3 is the primary view when paragraph notes exist
  const v3Notes   = storyV3?.paragraphNotes ?? [];
  const v3Path    = storyV3?.readingPath    ?? [];
  const v3Brief   = storyV3?.brief          ?? null;

  // V2 paragraph notes as fallback (rich prose pages that V3 did not activate)
  const v2Notes: ParagraphNote[] = storyV2?.paragraphNotes ?? [];

  // V2 bottom line — suppress if same as first V2 note
  const rawBottomLine = storyV2?.bottomLineBlock?.text ?? storyV2?.signalBlock?.text ?? null;
  const v2FirstKey    = v2Notes[0]?.text.toLowerCase().slice(0, 70) ?? "";
  const v2BottomLineText = (rawBottomLine && rawBottomLine.toLowerCase().slice(0, 70) !== v2FirstKey)
    ? rawBottomLine
    : null;

  // ULTRA = the only render path when FORCE_SYNTHESIS_ONLY=true.
  // Legacy fallbacks are kept in code but suppressed — they bypass all quality gates.
  // Synthesis-scaffold path: when ultraPageView is null but synthesis attached _synth
  // (text-fallback page), render the UltraView from the scaffold so study notes show.
  // Combined non-instructional gate — heuristic OR OpenAI confirmation.
  const pageBlocked = isStructuralPage || pageIsNonInstructional || openAIConfirmsNonInstructional;

  const hasSynthScaffold = Boolean((ultraPageViewWithSynthesis as any)?._synth) && !ultraPageView;
  const showUltraView     = !pageBlocked &&
    ((isCurrentPageModel && Boolean(ultraPageView)) || hasSynthScaffold);
  const showConceptBlocks = !FORCE_SYNTHESIS_ONLY && isCurrentPageModel && !pageBlocked && !showUltraView && Boolean(readerPageView);
  const showNarrativePageView = !FORCE_SYNTHESIS_ONLY && isCurrentPageModel && !pageBlocked && !showUltraView && !showConceptBlocks && Boolean(
    narrativePageView?.narrative.sections.length
  );
  const gate = !showUltraView && !showConceptBlocks;
  const showNarrativeView  = !FORCE_SYNTHESIS_ONLY && isCurrentPageModel && !pageBlocked && gate && !showNarrativePageView && narrativeBlocks.length > 0;
  const showV3View         = !FORCE_SYNTHESIS_ONLY && isCurrentPageModel && !pageBlocked && gate && !showNarrativePageView && !showNarrativeView && v3Notes.length > 0;
  const showV2Map          = !FORCE_SYNTHESIS_ONLY && isCurrentPageModel && !pageBlocked && gate && !showNarrativePageView && !showNarrativeView && !showV3View && v2Notes.length > 0;
  const showV2Operator     = !FORCE_SYNTHESIS_ONLY && isCurrentPageModel && !pageBlocked && gate && !showNarrativePageView && !showNarrativeView && !showV3View && !showV2Map && Boolean(storyV2?.signalBlock);
  const showGuidedView     = !FORCE_SYNTHESIS_ONLY && isCurrentPageModel && !pageBlocked && gate && !showNarrativePageView && !showNarrativeView && !showV3View && !showV2Map && !showV2Operator && Boolean(guidedView);

  // Header status label — shows phase during loading, page teaching purpose when ready
  const headerStatus = intelligence.status === "loading"
    ? LOADING_PHASES[loadingPhase]
    : pageIsNonInstructional
    ? "Not available on this page"
    : (showNarrativePageView || showNarrativeView || showV3View) && v3Brief
    ? v3Brief.pagePurpose
    : showUltraView && ultraPageView
    ? derivePageTeachingPurpose(
        ultraPageView._debug?.domain ?? ultraPageView.domain ?? null,
        normResult?.pageKind,
        ultraPageView.blocks[0]?.conceptRole,
        ultraPageView.teachingStatement,
      )
    : "Current page · ready";

  // Mastery badge — same computeDeckStats() math as RecallLab's MasteryRing,
  // aggregated across every recall set saved for this book (not just this page).
  const masteryPct = useMemo(() => {
    const bookId = ctx?.documentId;
    if (!bookId) return null;
    const cards = getAllRecallSets()
      .filter((s) => s.bookId === bookId)
      .flatMap((s) => s.cards);
    if (cards.length === 0) return null;
    return computeDeckStats(cards).masteryPct;
  }, [ctx?.documentId, ctx?.pageNumber]);

  // [WIRE] RightPanel active — always-on, no NODE_ENV gate.
  // If you see this in production DevTools, the latest build is deployed.
  // viewSource tells you which render path is active. Bad output from a non-ULTRA path
  // means the fallback path is bypassing all quality gates.
  console.log("[WIRE] RightPanel active", {
    build: "BUILD_WIRING_TEST_v1",
    status: intelligence.status,
    isCurrentPageModel,
    pageIsNonInstructional,
    pageKind: normResult?.pageKind,
    shouldRenderFullPanel: normResult?.shouldRenderFullPanel,
    viewSource: showUltraView ? "ULTRA" : showConceptBlocks ? "ConceptBlocks" : showNarrativePageView ? "NarrativePage" : showNarrativeView ? "Narrative" : showV3View ? "V3" : showV2Map ? "V2Map" : showV2Operator ? "V2Op" : showGuidedView ? "Guided" : "none",
    showUltraView,
    showConceptBlocks,
    ultraPageViewPresent: !!ultraPageView,
    displayViewPresent: !!displayView,
    visibleBlockCount: displayView ? displayView.blocks.filter((b) => !isWeakBlock(b, displayView._debug?.domain)).length : 0,
  });

  const openShadowRecall = () => {
    console.log("[SHADOW_RECALL_OPEN]", { hasData: !!shadowRecall, page: ctx?.pageNumber ?? null });
    // DIAGNOSTIC: [SHADOW_RECALL_SOURCE] — which objects are populated when drawer opens?
    console.log("[SHADOW_RECALL_SOURCE]", {
      hasStudyModel:       !!studyModel,
      studyModelPage:      studyModel?.page ?? null,
      hasShadowRecall:     !!shadowRecall,
      shadowRecallNullReason: !shadowRecall
        ? (!isCurrentPageModel ? "isCurrentPageModel=false" : !pageModel ? "pageModel=null" : "unknown")
        : null,
      isCurrentPageModel,
      pageModelPresent:    !!pageModel,
      intelligenceStatus:  intelligence.status,
      pageNumber:          ctx?.pageNumber ?? null,
    });
    setRecallOpen(true);
  };

  return (
    <>
    {/* Shadow Recall drawer — lives at root level (outside aside) so position:fixed
        is never clipped by scroll container. Trigger lives in the Study Tools column below. */}
    <>
      <PreReadRecallDrawer
        open={recallOpen}
        onClose={() => setRecallOpen(false)}
        recall={shadowRecall}
        bookId={ctx?.documentId}
        pageNumber={ctx?.pageNumber}
        preReadRecallItems={studyModel?.preReadRecallItems}
        synthForDerive={teachingSynthesis ? {
          coreIdea:       teachingSynthesis.coreIdea,
          keyMechanism:   teachingSynthesis.mechanism || null,
          commonConfusion: teachingSynthesis.misconceptionAlert || teachingSynthesis.trap || null,
          memoryAnchor:   teachingSynthesis.memoryAnchor || null,
          examSignal:     teachingSynthesis.examCriticalIdea || null,
        } : null}
      />
    </>
    <aside ref={panelScrollRef} className="flex h-full min-h-0 w-full flex-col overflow-y-auto border-l border-white/10 bg-[rgb(11,18,34)] break-words whitespace-normal">
      {/* Header */}
      <div className="border-b border-white/10 px-4 py-3 flex items-center justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-emerald-400">Page Notes</div>
          <div className="mt-0.5 text-[11px] text-slate-500">{headerStatus}</div>
        </div>
        <div className="flex items-center gap-2">
          {masteryPct !== null && (
            <div
              title="Mastery across all Recall Lab cards saved for this book"
              className="flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-semibold"
              style={{
                borderColor: `${masteryPct >= 80 ? "#10b981" : masteryPct >= 40 ? "#f59e0b" : "#60a5fa"}55`,
                color: masteryPct >= 80 ? "#10b981" : masteryPct >= 40 ? "#f59e0b" : "#60a5fa",
                background: `${masteryPct >= 80 ? "#10b981" : masteryPct >= 40 ? "#f59e0b" : "#60a5fa"}14`,
              }}
            >
              <span>🎯</span>
              <span>{masteryPct}% Mastered</span>
            </div>
          )}
          <button
            onClick={cycleZoom}
            title={`Cognitive density: ${zoomLabel} — click to cycle`}
            className="flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-slate-400 hover:text-slate-200 hover:bg-white/10 transition-colors"
          >
            <span>🔤</span>
            <span className="font-medium">{zoomLabel}</span>
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4 p-4 text-white">
        {/* ── STUDY TOOLS — consolidated column: Speech (primary), Whiteboard,
            Explain This Step, Explain It, Shadow Recall ── */}
        <div className="rounded-2xl border border-white/8 bg-[#0a1322] p-3 space-y-2.5">
          <div className="text-[10px] font-bold uppercase tracking-widest text-indigo-300/70 px-0.5">Study Tools</div>
          <StudySpeechPanel
            ref={speechPanelRef}
            studyModel={studyModel}
            pageNumber={ctx?.pageNumber ?? 0}
            bookId={ctx?.documentId}
            activePageText={activePageText ?? ctx?.pageText ?? ""}
            presetId={effectivePresetId}
            onEvidenceFocus={onSpeechEvidenceFocus}
            onSnippetFocus={onSpeechSnippetFocus}
            onPlayStateChange={onSpeechPlayStateChange}
            onActiveWordChange={onSpeechActiveWordChange}
            onExplainSegment={onSpeechExplainSegment}
            highlightedAnchorTexts={highlightedAnchorTexts}
            thoughtUnits={canonicalLeftPanelUnits}
            selectedUnitId={activeThoughtUnit?.id ?? focusedEvidenceId ?? null}
            primary
          />
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={onOpenWhiteboard}
              disabled={!onOpenWhiteboard}
              className="flex items-center gap-1.5 rounded-lg border border-white/8 bg-white/3 px-2.5 py-2 text-[11px] font-medium text-slate-300 hover:bg-white/8 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span>🎨</span> Whiteboard
            </button>
            <button
              onClick={onOpenExplainStep}
              disabled={!onOpenExplainStep}
              className="flex items-center gap-1.5 rounded-lg border border-white/8 bg-white/3 px-2.5 py-2 text-[11px] font-medium text-slate-300 hover:bg-white/8 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span>💬</span> Explain This Step
            </button>
            <button
              onClick={onOpenExplainIt}
              disabled={!onOpenExplainIt}
              className="flex items-center gap-1.5 rounded-lg border border-white/8 bg-white/3 px-2.5 py-2 text-[11px] font-medium text-slate-300 hover:bg-white/8 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span>🎓</span> Explain It
            </button>
            <button
              onClick={openShadowRecall}
              className="flex items-center gap-1.5 rounded-lg border border-violet-500/20 bg-violet-500/5 px-2.5 py-2 text-[11px] font-medium text-violet-300 hover:bg-violet-500/15 transition-colors"
            >
              <span>🕶</span> Shadow Recall
            </button>
          </div>
        </div>

        {activeThoughtUnit && (
          <div
            className="rounded-2xl border border-emerald-400/15 bg-emerald-400/5 p-3 text-xs text-slate-200"
            data-evidence-id={activeThoughtUnit.evidenceRefId}
          >
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-emerald-300/80">
              <span>🧠 Expert Brain</span>
              <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2 py-0.5">
                {activeThoughtUnit.importanceLabel} ★★★★★
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-white/55">
                Confidence {Math.min(98, Math.max(68, activeThoughtUnit.priorityTier * 18))}%
              </span>
            </div>
            <h3 className="mt-2 whitespace-normal break-words text-sm font-semibold leading-snug text-white">{activeThoughtUnit.title}</h3>
            <p className="mt-2 whitespace-normal break-words rounded-xl border border-white/8 bg-black/15 p-2 leading-relaxed text-slate-200">
              {renderTextWithActiveWord(activeThoughtUnit.exactText, activeSpokenWord, activeThoughtUnit.evidenceRefId)}
            </p>
            <div className="mt-3 grid gap-2" data-thought-unit-id={activeThoughtUnit.id}>
              {(() => {
                // Exactly the 4 sections the Expert Brain card owns beyond the
                // Master statement (above) and Confidence/mastery (header badge):
                // Why It Matters, Common Trap, Connection Map, Checkpoint. No
                // category-conditional sections that just re-echo exactText —
                // that duplicates the Master statement paragraph above.
                const isTrap = activeThoughtUnit.category === "trap";
                const pageTrap = isTrap
                  ? activeThoughtUnit
                  : canonicalLeftPanelUnits.find((u) => u.category === "trap");
                const sections: Array<[string, string]> = [
                  ["Why It Matters", activeThoughtUnit.reason],
                  ["Common Trap", pageTrap
                    ? (isTrap ? pageTrap.exactText : `Related danger zone on this page: ${pageTrap.exactText}`)
                    : "No danger zone flagged for this page yet."],
                  ["Connection Map", canonicalLeftPanelUnits
                    .filter((u) => u.id !== activeThoughtUnit.id)
                    .slice(0, 5)
                    .map((u) => `✓ ${u.title}`)
                    .join("\n") || "No linked canonical units yet."],
                  ["Checkpoint", `Which phrase proves this ${activeThoughtUnit.importanceLabel.toLowerCase()}?`],
                ];
                if (activeThoughtUnit.category === "mechanism" || activeThoughtUnit.category === "application" || activeThoughtUnit.category === "formula") {
                  sections.splice(1, 0, ["Procedure Logic", activeThoughtUnit.exactText]);
                }
                if (activeThoughtUnit.category === "clinical") {
                  sections.splice(2, 0, ["Clinical Link", activeThoughtUnit.exactText]);
                }
                if (activeThoughtUnit.category === "memoryAnchor") {
                  sections.splice(2, 0, ["Memory", activeThoughtUnit.exactText]);
                }
                return sections.slice(0, 6).map(([label, body]) => (
                  <div key={label} className="rounded-lg border border-white/8 bg-black/15 p-2">
                    <div className="text-[9px] font-bold uppercase tracking-widest text-white/40">{label}</div>
                    <div className="mt-0.5 whitespace-pre-line text-[11px] leading-relaxed text-slate-300">{body}</div>
                  </div>
                ));
              })()}
              <div className="flex flex-wrap gap-2 pt-1">
                <button type="button" onClick={onOpenExplainStep} className="rounded-lg border border-sky-300/20 bg-sky-300/10 px-2 py-1 text-[11px] font-semibold text-sky-200">Explain</button>
                <button type="button" onClick={onOpenWhiteboard} className="rounded-lg border border-emerald-300/20 bg-emerald-300/10 px-2 py-1 text-[11px] font-semibold text-emerald-200">Whiteboard</button>
                <button type="button" onClick={openShadowRecall} className="rounded-lg border border-violet-300/20 bg-violet-300/10 px-2 py-1 text-[11px] font-semibold text-violet-200">Shadow Recall</button>
              </div>
            </div>
          </div>
        )}

        {/* ── WIRING CARD — dev only, never shown in production studying ── */}
        {process.env.NEXT_PUBLIC_DEBUG_READER === "true" && (
          <div style={{
            fontSize: 9,
            fontFamily: "monospace",
            background: "rgba(0,255,100,0.04)",
            border: "1px solid rgba(0,255,100,0.12)",
            borderRadius: 6,
            padding: "5px 8px",
            color: "#6ee7b7",
            lineHeight: 1.7,
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
            opacity: 0.8,
          }}>
            {[
              `BUILD_WIRING_TEST_v1`,
              `view: ${showUltraView ? "ULTRA ✓" : showConceptBlocks ? "ConceptBlocks (fallback)" : showNarrativePageView ? "NarrativePage (fallback)" : showNarrativeView ? "Narrative (fallback)" : showV3View ? "V3 (fallback)" : showV2Map ? "V2Map (fallback)" : showV2Operator ? "V2Op (fallback)" : showGuidedView ? "Guided (fallback)" : "none"}`,
              `status: ${intelligence.status} | page: ${isCurrentPageModel ? "✓ current" : "✗ mismatch"}`,
              `domain: ${displayView?._debug?.domain ?? "—"} | kind: ${displayView?._debug?.pageKind ?? "—"}`,
              `blocks: ${displayView?.blocks.length ?? 0} raw → ${displayView ? displayView.blocks.filter((b) => !isWeakBlock(b, displayView._debug?.domain)).length : 0} visible`,
              `compression: ${displayView?.compression.length ?? 0} | miniTest: ${displayView?.miniTest.length ?? 0}`,
              `thesis: ${(displayView?.coreIdea ?? "—").slice(0, 50)}`,
            ].join("\n")}
          </div>
        )}

        {/* ── NON-INSTRUCTIONAL PAGE STATE ────────────────────────── */}
        {pageIsNonInstructional && (
          <div className="rounded-2xl border border-white/8 bg-[#071224] px-5 py-6 space-y-2.5">
            <div className="flex items-center gap-2">
              <span className="text-lg">🚫</span>
              <div className="text-[11px] font-bold uppercase tracking-widest text-white/35">
                {inferUnavailablePageLabel(normResult?.pageKind)}
              </div>
            </div>
            <p className="text-[12.5px] text-white/45 leading-[1.6]">
              Instructional synthesis unavailable for this page.
            </p>
            <p className="text-[12px] text-white/28 italic">
              Navigate to a content-rich textbook page to generate study notes, highlights, and recall cards.
            </p>
          </div>
        )}

        {(isStructuralPage || openAIConfirmsNonInstructional) && (() => {
          const role = openAIConfirmsNonInstructional && !isStructuralPage
            ? "review_checkpoint"
            : (intelligence.pageRole ?? "");
          const icon = structuralPageIcon(role);
          const label = isStructuralPage ? structuralPageLabel(role)
            : "Review / checkpoint page — navigate to a content page to generate study notes.";
          return (
            <div className="rounded-2xl border border-amber-400/15 bg-[#0d1520] px-5 py-7 space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-2xl shrink-0">{icon}</span>
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-widest text-amber-400/50 mb-0.5">Overview</div>
                  <p className="text-[13px] font-semibold text-white/70 leading-snug">{label}</p>
                </div>
              </div>
              <p className="text-[12px] text-white/35 italic leading-relaxed">
                Navigate to a content page to generate study notes, highlights, and recall cards.
              </p>
            </div>
          );
        })()}

        {/* Loading / gating state */}
        {!pageIsNonInstructional && !isStructuralPage && renderTruthFallback(pageTruth?.reason || "loading", intelligence.status, !isCurrentPageModel, loadingPhase)}

        {intelligence.status === "error" && (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-900/20 p-4 text-sm text-rose-100">
            Could not build reading path for this page.
          </div>
        )}

        {/* Stage 2 background loading indicator — visible briefly after Stage 1 renders */}
        {stage1Status === "success" && stage2Status === "loading" && (
          <div className="flex items-center gap-2 px-1 py-1">
            <div className="h-1 w-20 overflow-hidden rounded-full bg-white/8">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-indigo-400/35" />
            </div>
            <span className="text-[10px] text-white/25 italic">Loading deep analysis…</span>
          </div>
        )}

        {/* ── PRIMARY: ULTRA View ───────────────────────────────────────── */}
        {showUltraView && displayView && (
          <>
            <UltraViewErrorBoundary>
              <UltraView
                view={displayView}
                selectedBlockIndex={selectedBlockIndex}
                onSelectBlock={setSelectedBlockIndex}
                onAnchorClick={(text) => onEvidenceClick?.(text, undefined)}
                synthStatus={synthStatus}
                synthErrorMsg={synthErrorMsg}
                synthTimedOut={synthTimedOut}
                onCrossLinkNavigate={onCrossLinkNavigate}
                bookId={ctx?.documentId}
                pageNumber={ctx?.pageNumber}
                density={dt}
                claudeEnrichment={claudeEnrichment}
                stage3Status={stage3Status}
                retrySynthesis={retrySynthesis}
                studyModel={studyModel}
                focusedEvidenceId={focusedEvidenceId}
                activeSpokenWord={activeSpokenWord}
                onEvidenceClick={onEvidenceClick}
                onOpenThoughtUnit={onOpenThoughtUnit}
              />
            </UltraViewErrorBoundary>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <GenerateNoteButton
                view={displayView!}
                bookId={ctx.documentId}
                bookTitle={ctx.documentTitle}
                pageNumber={ctx.pageNumber}
                onNoteSaved={onNoteSaved}
                studyModel={studyModel}
              />
              <GenerateStudySetButton
                view={displayView!}
                bookId={ctx.documentId}
                bookTitle={ctx.documentTitle}
                pageNumber={ctx.pageNumber}
                onStudySetGenerated={onStudySetGenerated}
                studyModel={studyModel}
              />
            </div>
          </>
        )}

        {/* ── SYNTHESIS-ONLY: when ultra view unavailable, show clean unavailable state ── */}
        {FORCE_SYNTHESIS_ONLY && isCurrentPageModel && !pageIsNonInstructional && !showUltraView && intelligence.status === "ready" && (
          <div className="rounded-2xl border border-white/8 bg-[#071224] px-4 py-8 text-center">
            <p className="text-[13px] text-white/35 italic">Study synthesis unavailable for this page.</p>
            <p className="mt-1 text-[11px] text-white/20">Try navigating to a content-rich page.</p>
          </div>
        )}

        {/* ── SECONDARY: Concept Blocks View (ULTRA unavailable) ────────── */}
        {showConceptBlocks && readerPageView && (
          <ConceptBlocksView
            view={readerPageView}
            onAnchorClick={(text) => onEvidenceClick?.(text, undefined)}
          />
        )}

        {/* ── FALLBACK 0a. Narrative Page View ─────────────────────────── */}
        {showNarrativePageView && narrativePageView && (
          <NarrativeSections
            sections={narrativePageView.narrative.sections}
            onBlockClick={(text) => onEvidenceClick?.(text, undefined)}
          />
        )}
        {showNarrativePageView && v3Path.length > 0 && (
          <ReadingPathView
            steps={v3Path}
            onStepClick={(text) => onEvidenceClick?.(text, undefined)}
          />
        )}

        {/* ── 0b. Narrative View (legacy 3-block fallback) ──────────────── */}
        {showNarrativeView && (
          <NarrativeBlocksView
            blocks={narrativeBlocks}
            onBlockClick={(text) => onEvidenceClick?.(text, undefined)}
          />
        )}
        {showNarrativeView && v3Path.length > 0 && (
          <ReadingPathView
            steps={v3Path}
            onStepClick={(text) => onEvidenceClick?.(text, undefined)}
          />
        )}

        {/* ── A. V3 Primary View ─────────────────────────────────────────── */}
        {showV3View && v3Brief && <PageBriefCard brief={v3Brief} />}
        {showV3View && v3Path.length > 0 && (
          <ReadingPathView
            steps={v3Path}
            onStepClick={(text) => onEvidenceClick?.(text, undefined)}
          />
        )}
        {showV3View && (
          <V3ParagraphMapView
            notes={v3Notes}
            onNoteClick={(text) => onEvidenceClick?.(text, undefined)}
          />
        )}

        {/* ── B. V2 Paragraph Map (fallback) ────────────────────────────── */}
        {showV2Map && v2BottomLineText && <BottomLineCard text={v2BottomLineText} />}
        {showV2Map && (
          <ParagraphMapView
            notes={v2Notes}
            onNoteClick={(text) => onEvidenceClick?.(text, undefined)}
          />
        )}

        {/* ── C. V2 Operator View (sparse-page fallback) ────────────────── */}
        {showV2Operator && storyV2 && <V2OperatorView storyV2={storyV2} />}

        {/* ── D. v1 Guided View (last resort) ───────────────────────────── */}
        {showGuidedView && guidedView && (
          <GuidedViewFallback
            guidedView={guidedView}
            selectedStepId={selectedStepId}
            focusedEvidenceId={focusedEvidenceId ?? null}
            resolveEvidenceId={resolveEvidenceId}
            selectStep={selectStep}
          />
        )}
      </div>
    </aside>
    </>
  );
}

// ---------------------------------------------------------------------------
// UltraView error boundary — catches render crashes without blanking the panel.
// FORCE_SYNTHESIS_ONLY exposes failures that fallbacks previously masked; this
// ensures those failures show a clear message rather than a white screen.
// ---------------------------------------------------------------------------

class UltraViewErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[WIRE] UltraViewErrorBoundary caught", { error: error.message, componentStack: info.componentStack?.slice(0, 300) });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-2xl border border-rose-400/20 bg-[#1a0808] px-4 py-6 text-center space-y-1">
          <p className="text-[13px] text-rose-300/70">Study notes failed to render for this page.</p>
          <p className="text-[10px] font-mono text-white/20">{this.state.error.message.slice(0, 100)}</p>
          <p className="text-[11px] text-white/25 italic">Try navigating away and back.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// ULTRA View — primary right-panel view
// ---------------------------------------------------------------------------

function PanelSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-[#071224] px-4 py-4 shadow-sm">
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9dc4ff]">
        {title}
      </div>
      {children}
    </section>
  );
}

function BulletLine({ children }: { children: React.ReactNode }) {
  return <li className="leading-6 text-[14px] text-white/90">{children}</li>;
}

// Domain-adaptive right panel field labels and icons.
// Each domain exposes a different cognitive frame to the user.
function domainFieldLabels(domain?: string): {
  pattern: string; reason: string; rule: string; trap: string;
  patternColor: string; reasonColor: string; ruleColor: string; trapColor: string;
} {
  switch (domain) {
    case "math":
      return {
        pattern:      "⚡ Concept",
        reason:       "📥 Given",
        rule:         "→ Result",
        trap:         "⚠️ Trap",
        patternColor: "#8fd3ff",
        reasonColor:  "#ffd580",
        ruleColor:    "#34d399",
        trapColor:    "#ff9da1",
      };
    case "science":
      return {
        pattern:      "📖 Definition",
        reason:       "🧬 Mechanism",
        rule:         "Outcome",
        trap:         "⚠️ Confusion Point",
        patternColor: "#6ee7b7",
        reasonColor:  "#ffd580",
        ruleColor:    "#ffb86b",
        trapColor:    "#ff9da1",
      };
    case "clinical":
      return {
        pattern:      "Finding",
        reason:       "Interpretation",
        rule:         "Next Step",
        trap:         "Failure Mode",
        patternColor: "#93c5fd",
        reasonColor:  "#fde68a",
        ruleColor:    "#34d399",
        trapColor:    "#fca5a5",
      };
    case "fiction":
      return {
        pattern:      "Plot Turn",
        reason:       "Motivation",
        rule:         "Consequence",
        trap:         "Misdirection",
        patternColor: "#d8b4fe",
        reasonColor:  "#fbbf24",
        ruleColor:    "#fb923c",
        trapColor:    "#f87171",
      };
    default:
      return {
        pattern:      "P — Pattern",
        reason:       "⚡ Surgical Reason",
        rule:         "🔥 Rule",
        trap:         "❗ Trap",
        patternColor: "#8fd3ff",
        reasonColor:  "#ffd580",
        ruleColor:    "#ffb86b",
        trapColor:    "#ff9da1",
      };
  }
}

// ---------------------------------------------------------------------------
// SRI Reading Map — expert pre-read briefing (3-5 signals, not a paragraph log)
// ---------------------------------------------------------------------------

const SIGNAL_BORDER: Record<string, string> = {
  deep_understand: "border-amber-400/35",
  memorize:        "border-indigo-400/30",
  clinical_logic:  "border-emerald-400/30",
  formula_logic:   "border-blue-400/30",
  exam_trap:       "border-rose-400/40",
  understand:      "border-lime-400/25",
  skim:            "border-white/8",
  example_only:    "border-white/6",
};

const SIGNAL_BG: Record<string, string> = {
  deep_understand: "bg-amber-500/6",
  memorize:        "bg-indigo-500/6",
  clinical_logic:  "bg-emerald-500/6",
  formula_logic:   "bg-blue-500/6",
  exam_trap:       "bg-rose-500/7",
  understand:      "bg-lime-500/4",
  skim:            "bg-white/2",
  example_only:    "bg-white/2",
};

const DOMAIN_SRI_OVERRIDES: Record<string, Partial<Record<ReadingDepth, { icon: string; label: string }>>> = {
  math: {
    deep_understand: { icon: "🔥", label: "Core Theorem"   },
    formula_logic:   { icon: "∑",  label: "Formula Logic"  },
    understand:      { icon: "🔢", label: "Symbolic Logic" },
    memorize:        { icon: "📌", label: "Formula / Rule" },
    exam_trap:       { icon: "⚠️", label: "Math Trap"      },
  },
  science: {
    deep_understand: { icon: "🔬", label: "Core Biology"    },
    bio_logic:       { icon: "🧬", label: "Bio Mechanism"   },
    understand:      { icon: "🧬", label: "Mechanism"       },
    memorize:        { icon: "📌", label: "Key Fact"        },
    exam_trap:       { icon: "⚠️", label: "Confusion Point" },
    clinical_logic:  { icon: "🔍", label: "Process Logic"   },
  },
  clinical: {
    deep_understand: { icon: "🔍", label: "Finding"        },
    clinical_logic:  { icon: "🏥", label: "Clinical Logic" },
    understand:      { icon: "⚕️", label: "Interpretation" },
    memorize:        { icon: "📋", label: "Protocol"       },
    exam_trap:       { icon: "❗", label: "Failure Mode"   },
  },
};

function ReadingMap({ model, domain }: { model: SRIModel; domain?: string }) {
  // Only show meaningful reading signals — filter out filler depths
  const FILLER_DEPTHS = new Set(["skim", "example_only"]);
  const primary  = model.signals.filter(s => !s.isBackground && !FILLER_DEPTHS.has(s.depth)).slice(0, 5);
  const bgSignal = model.signals.find(s => s.isBackground && !FILLER_DEPTHS.has(s.depth));
  const domainOverrides = domain ? (DOMAIN_SRI_OVERRIDES[domain] ?? {}) : {};
  const [showBg, setShowBg] = React.useState(false);

  return (
    <PanelSection title="Reading Map">
      {/* Page strategy */}
      <p className="mb-3 text-[11px] italic text-white/45 leading-5">{model.pageStrategy}</p>

      {/* Primary signals — 1 dominant + remaining */}
      <div className="space-y-2">
        {primary.map((sig: SRISignal, idx) => {
          const border = SIGNAL_BORDER[sig.depth] ?? SIGNAL_BORDER.skim;
          const bg     = SIGNAL_BG[sig.depth]     ?? SIGNAL_BG.skim;
          const isDominant = idx === 0;
          const override = domainOverrides[sig.depth as ReadingDepth];
          const displayIcon  = override?.icon  ?? sig.icon;
          const displayLabel = override?.label ?? sig.label;
          return (
            <div
              key={sig.depth}
              className={`rounded-xl border px-3 py-2.5 ${border} ${bg}`}
            >
              {/* Label row */}
              <div className="mb-1 flex items-center gap-1.5">
                <span className="text-[13px]">{displayIcon}</span>
                <span
                  className={`text-[10px] font-bold uppercase tracking-[0.14em] ${isDominant ? "text-[11px]" : ""}`}
                  style={{ color: sig.color }}
                >
                  {displayLabel}
                </span>
                {sig.count > 1 && (
                  <span className="ml-auto text-[10px] text-white/25">{sig.count}×</span>
                )}
              </div>
              {/* Primary summary */}
              <p className={`leading-5 text-white/85 ${isDominant ? "text-[13px]" : "text-[12px]"}`}>
                {sig.summary}
              </p>
              {/* Merged bullets from same-depth paragraphs */}
              {sig.details.length > 0 && (
                <ul className="mt-1.5 space-y-0.5">
                  {sig.details.map((d, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-[11px] text-white/55 leading-5">
                      <span className="mt-0.5 shrink-0 text-white/30">•</span>
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {/* Background signal — always collapsed */}
      {bgSignal && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowBg(v => !v)}
            className="flex w-full items-center gap-2 rounded-lg border border-white/6 bg-white/2 px-3 py-2 text-left text-[11px] text-white/35 transition hover:text-white/55"
          >
            <span>{showBg ? "▲" : "▼"}</span>
            <span className="flex-1">{bgSignal.summary}</span>
          </button>
        </div>
      )}
    </PanelSection>
  );
}

function UltraView({
  view,
  selectedBlockIndex,
  onSelectBlock,
  onAnchorClick,
  synthStatus,
  synthErrorMsg,
  synthTimedOut,
  onCrossLinkNavigate,
  bookId,
  pageNumber,
  density,
  claudeEnrichment,
  stage3Status,
  retrySynthesis,
  studyModel,
  focusedEvidenceId,
  activeSpokenWord,
  onEvidenceClick,
  onOpenThoughtUnit,
}: {
  view: UltraPageView;
  selectedBlockIndex: number;
  onSelectBlock: (i: number) => void;
  onAnchorClick: (text: string) => void;
  synthStatus: import("./useTeachingSynthesis").SynthesisStatus;
  synthErrorMsg: string | null;
  synthTimedOut?: boolean;
  onCrossLinkNavigate?: (page: number) => void;
  bookId?: string;
  pageNumber?: number;
  density?: { cardPadding: string; headingText: string; bodyText: string; lineHeight: string; space: string };
  claudeEnrichment?: import("@/lib/insights/claudeEnrichmentClient").ClaudeEnrichmentOutput | null;
  stage3Status?: import("./useTeachingSynthesis").SynthesisStatus;
  retrySynthesis?: () => void;
  /** Study model from the parent — used to find visualAnchor IDs for card click-to-focus */
  studyModel?: CurrentPageStudyModel | null;
  /** Currently focused anchor ID — highlights the matching study card */
  focusedEvidenceId?: string | null;
  /** Word-level karaoke sync — marks the active word within the focused card's text */
  activeSpokenWord?: { anchorId: string | null; wordIndex: number; word: string } | null;
  /** Called when a study card is clicked — focuses the matching left-panel highlight */
  onEvidenceClick?: (snippet: string, evidenceId?: string) => void;
  /** Called when the user wants to expand a thought-unit card into the Recall Lab v2 box layout */
  onOpenThoughtUnit?: (anchorId: string) => void;
}) {
  const d = density ?? { cardPadding: "p-4", headingText: "text-[12px]", bodyText: "text-[13px]", lineHeight: "leading-relaxed", space: "space-y-3" };
  const domain = view.domain ?? view._debug?.domain;
  const labels = domainFieldLabels(domain);
  const isMathDomain = domain === "math";
  const isScienceDomain = domain === "science";

  // Filter weak blocks before rendering
  const rejectedBlocks = view.blocks.filter((b) => isWeakBlock(b, domain));
  const visibleBlocks = view.blocks.filter((b) => !isWeakBlock(b, domain));
  if (rejectedBlocks.length > 0) {
    console.log("[CONCEPT_BLOCK_REJECTED]", {
      page: pageNumber ?? null,
      rejectedCount: rejectedBlocks.length,
      visibleCount: visibleBlocks.length,
      rejected: rejectedBlocks.map(b => ({ title: b.title?.slice(0, 40), synthDerived: !!(b as any).synthDerived })),
    });
  }
  const effectiveIndex = Math.min(selectedBlockIndex, Math.max(0, visibleBlocks.length - 1));
  const selectedBlock = visibleBlocks[effectiveIndex] ?? null;

  // Surfaced synthesis sections — populated once synthesis resolves
  const synth = (view as any)._synth as {
    whyItMatters: string | null;
    keyMechanism: string | null;
    commonConfusion: string | null;
    memoryAnchor: string | null;
    reasoningFlow: string | null;
    examSignal: string | null;
    externalStudyLinks?: Array<{ label: string; searchQuery: string; type: string }> | null;
    relatedVideoQueries?: string[] | null;
    miniTestItems?: Array<{ question: string; type: string; options: string[] | null; correctAnswer: string; explanation: string }> | null;
  } | undefined;
  const hasSynth = !!(synth && (synth.whyItMatters || synth.keyMechanism || synth.commonConfusion || synth.memoryAnchor));

  // ── Specific resource recommendations — AI-resolved exact articles + channel-targeted videos ──
  type ResolvedArticle = { title: string; url: string; source: string; reason: string; score: number };
  type ResolvedVideo   = { channel: string; channelHandle: string; videoTitle: string; searchUrl: string; isVerified?: boolean; reason: string; timestampSeconds: number | null; timestampLabel: string | null; score: number };

  const [resolvedResources, setResolvedResources] = useState<{ articles: ResolvedArticle[]; videos: ResolvedVideo[]; resolved: boolean }>({ articles: [], videos: [], resolved: false });
  const [cohereQueries, setCohereQueries] = useState<{ readings: string[]; videos: string[] }>({ readings: [], videos: [] });

  useEffect(() => {
    setResolvedResources({ articles: [], videos: [], resolved: false });
    setCohereQueries({ readings: [], videos: [] });
    // "Current topic" = the concept card the student actually has open, when one
    // exists — falls back to the page-level thesis only when no block is
    // selected. Without this, Related Reading/Videos stayed pinned to the whole
    // page's broad topic regardless of which concept the student was reading.
    const currentTopic = (selectedBlock?.pattern || selectedBlock?.title || "").trim();
    const thesis = (currentTopic || view.pageThesis || view.coreIdea || "").trim();
    if (!thesis || !hasSynth) { setResolvedResources(r => ({ ...r, resolved: true })); return; }
    const controller = new AbortController();
    const conceptTitles = selectedBlock?.title
      ? [selectedBlock.title]
      : view.blocks.map(b => b.title).filter(Boolean).slice(0, 5);
    const anchorTexts = selectedBlock?.anchorText
      ? [selectedBlock.anchorText]
      : view.blocks.map(b => b.anchorText).filter((t): t is string => !!t).slice(0, 4);
    console.log("[RESOURCES_INPUT]", { thesis: thesis.slice(0, 60), mechanism: synth?.keyMechanism?.slice(0, 50), concepts: conceptTitles.length, scopedToSelectedBlock: !!currentTopic });

    // OpenAI: specific article URLs + channel-targeted videos
    fetch("/api/resolveResources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageThesis: thesis, keyMechanism: synth?.keyMechanism ?? null, conceptTitles, anchorTexts }),
      signal: controller.signal,
    })
      .then(r => r.json())
      .then(data => {
        console.log("[RESOURCES_RESULT]", { articles: (data.articles ?? []).length, videos: (data.videos ?? []).length });
        setResolvedResources({ articles: data.articles ?? [], videos: data.videos ?? [], resolved: true });
      })
      .catch(() => setResolvedResources(r => ({ ...r, resolved: true })));

    // Cohere: topic-based related reading + video search queries (in parallel)
    fetch("/api/cohere-retrieval", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic: thesis, domain, mode: "both", pageText: "" }),
      signal: controller.signal,
    })
      .then(r => r.json())
      .then(data => {
        if (data.provider === "cohere" || data.provider === "fallback") {
          console.log("[COHERE_QUERIES_READY]", { readings: (data.relatedReadings ?? []).length, videos: (data.relatedVideos ?? []).length, provider: data.provider });
          setCohereQueries({ readings: data.relatedReadings ?? [], videos: data.relatedVideos ?? [] });
        }
      })
      .catch(() => {});

    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.coreIdea, view.pageThesis, hasSynth, selectedBlock?.conceptId]);

  const exactArticles = resolvedResources.articles.filter((a) => a.score >= 70 && /^https?:\/\//i.test(a.url));
  const exactVideos = resolvedResources.videos.filter((v) => v.score >= 70 && (v.isVerified || v.searchUrl.includes("youtube.com/watch?v=")));
  useEffect(() => {
    if (!resolvedResources.resolved) return;
    const topic = (view.pageThesis ?? view.coreIdea ?? "").trim();
    [...resolvedResources.articles.map((item) => ({ type: "article", item })), ...resolvedResources.videos.map((item) => ({ type: "video", item }))].forEach(({ type, item }) => {
      const isVideo = type === "video";
      const url = isVideo ? (item as ResolvedVideo).searchUrl : (item as ResolvedArticle).url;
      const source = isVideo ? (item as ResolvedVideo).channel : (item as ResolvedArticle).source;
      const timestamp = isVideo ? (item as ResolvedVideo).timestampLabel : null;
      const exactMatch = isVideo
        ? (item as ResolvedVideo).score >= 70 && ((item as ResolvedVideo).isVerified || url.includes("youtube.com/watch?v="))
        : (item as ResolvedArticle).score >= 70 && /^https?:\/\//i.test(url);
      console.log("[RELATED_RESOURCE_MATCH]", {
        topic: topic.slice(0, 80),
        source,
        exactMatch,
        url,
        timestamp,
      });
    });
  }, [resolvedResources, view.coreIdea, view.pageThesis]);

  // Interactive Mini Test items — structured questions from OpenAI
  const miniTestItems = synth?.miniTestItems ?? null;

  // [WIRE] _synth — always-on synthesis pipeline state.
  // Filter DevTools: "[WIRE] _synth"
  // DIAGNOSIS GUIDE:
  //   hasSynth=true, fields populated → Study Notes will render ✓
  //   hasSynth=false, _synth has values → validSynthField rejected them (check field content)
  //   _synth=undefined → synthesis hook returned null (API fail, abort, or usable blocks=0)
  //   _synth all-null → all page-level synth fields failed validation gate
  // Final render state — proves what UltraView actually has available to display
  console.log("[RIGHT_PANEL_RENDER_FIELDS]", {
    hasSynth,
    synthPresent: synth !== undefined,
    whyItMatters:    synth?.whyItMatters    ?? null,
    keyMechanism:    synth?.keyMechanism    ?? null,
    commonConfusion: synth?.commonConfusion ?? null,
    memoryAnchor:    synth?.memoryAnchor    ?? null,
  });
  console.log("[WIRE] _synth", {
    hasSynth,
    domain,
    synthPresent: synth !== undefined,
    fields: synth ? {
      whyItMatters:    synth.whyItMatters    ? `OK: ${synth.whyItMatters.slice(0, 50)}`    : "null",
      keyMechanism:    synth.keyMechanism    ? `OK: ${synth.keyMechanism.slice(0, 50)}`    : "null",
      commonConfusion: synth.commonConfusion ? `OK: ${synth.commonConfusion.slice(0, 50)}` : "null",
      memoryAnchor:    synth.memoryAnchor    ? `OK: ${synth.memoryAnchor.slice(0, 50)}`    : "null",
      reasoningFlow:   synth.reasoningFlow   ? `OK: ${synth.reasoningFlow.slice(0, 50)}`   : "null",
      examSignal:      synth.examSignal      ? `OK: ${synth.examSignal.slice(0, 50)}`      : "null",
    } : "no _synth on view",
    visibleBlockCount: visibleBlocks.length,
    pageThesis: (view.pageThesis ?? view.coreIdea ?? "—").slice(0, 60),
  });

  // When synthesis has resolved, AI coreIdea is the authoritative governing concept.
  // Use synthStatus === "success" (not hasSynth) so thesis switches even if Study Notes fields
  // were all rejected by validSynthField. view.coreIdea is already set to synthesis.coreIdea
  // when synthesis ran (see finalCoreIdea in ultraPageViewWithSynthesis).
  const rawCoreIdea = (synthStatus === "success" ? view.coreIdea : null) ?? view.pageThesis ?? view.coreIdea;
  const displayCoreIdea =
    view.teachingStatement && !isSimilarText(rawCoreIdea ?? "", view.teachingStatement)
      ? rawCoreIdea
      : (view.teachingStatement ?? rawCoreIdea);

  // Cross-section deduplication: suppress Page Understanding rows that repeat the Page Thesis.
  // A row is suppressed when its content overlaps ≥60% with the thesis (or adjacent field).
  // The same content remains visible inside its concept card — only the summary row is hidden.
  const thesisText = displayCoreIdea ?? "";
  const suppressMainConcept = !!(visibleBlocks[0]?.pattern) &&
    isSimilarText(visibleBlocks[0].pattern, thesisText, 0.60);
  const suppressWhyItMatters = !!(view.whyItMatters) && (
    isSimilarText(view.whyItMatters, thesisText, 0.60) ||
    isSimilarText(view.whyItMatters, visibleBlocks[0]?.surgicalReason ?? "", 0.60)
  );
  const suppressCommonTrap = !!(view.commonTrap) &&
    visibleBlocks.some((b) => b.trap && isSimilarText(b.trap, view.commonTrap!, 0.65));

  // [WIRE] UltraView active — always-on, no NODE_ENV gate.
  // Filter DevTools: "[WIRE] UltraView"
  // If you see this in production, UltraView IS the active render path.
  // If bad text appears but fields show _ready: false → gate IS working, field still rendering → bug in JSX.
  // If field shows _ready: true but text is bad → sanitizeDisplay() needs a new pattern.
  console.log("[WIRE] UltraView active", {
    build: "BUILD_WIRING_TEST_v1",
    component: "RightPanel.tsx > UltraView",
    domain,
    pageType: view._debug?.pageKind ?? "unknown",
    rawBlocksFromView: view.blocks.length,
    visibleBlocksAfterGate: visibleBlocks.length,
    thesis_ready: !!sanitizeDisplay(displayCoreIdea),
    thesis: displayCoreIdea?.slice(0, 80) ?? null,
    whyItMatters_ready: !!sanitizeDisplay(view.whyItMatters),
    commonTrap_ready: !!sanitizeDisplay(view.commonTrap),
    suppressions: { suppressMainConcept, suppressWhyItMatters, suppressCommonTrap },
    visibleBlocks: visibleBlocks.map((b, i) => ({
      i,
      title: b.title?.slice(0, 40),
      role: b.conceptRole ?? "unknown",
      pattern_ready: !!sanitizeDisplay(b.pattern),
      pattern: b.pattern?.slice(0, 60),
      surgicalReason_ready: !!sanitizeDisplay(b.surgicalReason),
      trap_ready: !!sanitizeDisplay(b.trap),
      rule_ready: !!sanitizeDisplay(b.rule),
    })),
  });

  return (
    <div className={d.space}>
      {/* Page Thesis — governing concept for this page */}
      <PanelSection title="Page Thesis">
        {/* One-line summary — heuristic compressed anchor. Hidden once synthesis has completed. */}
        {synthStatus !== "success" && !hasSynth && view.oneLineSummary && (
          <div className={`mb-2 rounded-lg border border-amber-400/40 bg-amber-400/8 ${d.cardPadding}`}>
            <p className={`${d.bodyText} font-semibold ${d.lineHeight} text-amber-200`}>{view.oneLineSummary}</p>
          </div>
        )}
        {/* Page thesis — quality-gated: must be a complete thought, ≥8 words, no boilerplate */}
        {sanitizeDisplay(displayCoreIdea) && (
          <div className={`rounded-xl border border-amber-400/15 bg-[#0b1830] ${d.cardPadding}`}>
            <div className={`mb-2 ${d.headingText} font-semibold uppercase tracking-[0.16em] text-amber-300`}>
              🎯 Page Thesis
            </div>
            <p className={`${d.bodyText} ${d.lineHeight} text-white/90`}>{displayCoreIdea}</p>
          </div>
        )}
      </PanelSection>

      {/* Understand — the four questions a reader needs before concept detail */}
      {/* Study Notes — 5-section teaching layout (synthesis-driven) */}
      {hasSynth && synth && (() => {
        // Helper: find the first visualAnchor for a given sourceField, used for card click-to-focus.
        const cardAnchor = (field: string) =>
          studyModel?.visualAnchors.find(a => a.sourceField === field) ?? null;

        return (
        <PanelSection title="Study Notes">
          <div className={d.space}>
            {/* WHY THIS MATTERS — synthesis application */}
            {synth.whyItMatters && (() => {
              const anchor = cardAnchor("whyThisMatters");
              const isFocused = anchor ? focusedEvidenceId === anchor.id : false;
              return (
              <div
                data-evidence-id={anchor?.id}
                className={`rounded-lg border ${isFocused ? "border-blue-400/50" : "border-blue-400/15"} bg-[#0a1828] ${d.cardPadding} transition-colors`}
                style={{ cursor: anchor ? "pointer" : undefined }}
                onClick={anchor ? () => { onEvidenceClick?.(anchor.exactText, anchor.id); } : undefined}
                title={anchor ? "Click to focus left-panel highlight" : undefined}
              >
                <div className={`mb-0.5 ${d.headingText} font-bold uppercase tracking-[0.14em] text-blue-300/70`}>
                  💡 Why This Matters
                </div>
                <p className={`${d.bodyText} ${d.lineHeight} text-white/85`}>{renderTextWithActiveWord(synth.whyItMatters, isFocused ? activeSpokenWord : null, anchor?.id)}</p>
                {anchor && onOpenThoughtUnit && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onOpenThoughtUnit(anchor.id); }}
                    className="mt-1.5 text-[10px] font-semibold text-blue-300/70 hover:text-blue-200"
                  >
                    🧠 Open in Recall Lab →
                  </button>
                )}
              </div>
              );
            })()}
            {/* KEY MECHANISM — synthesis mechanism */}
            {synth.keyMechanism && (() => {
              const anchor = cardAnchor("keyMechanism");
              const isFocused = anchor ? focusedEvidenceId === anchor.id : false;
              return (
              <div
                data-evidence-id={anchor?.id}
                className={`rounded-lg border ${isFocused ? "border-emerald-400/50" : "border-emerald-400/15"} bg-[#0a1820] ${d.cardPadding} transition-colors`}
                style={{ cursor: anchor ? "pointer" : undefined }}
                onClick={anchor ? () => { onEvidenceClick?.(anchor.exactText, anchor.id); } : undefined}
                title={anchor ? "Click to focus left-panel highlight" : undefined}
              >
                <div className={`mb-0.5 ${d.headingText} font-bold uppercase tracking-[0.14em] text-emerald-300/70`}>
                  ⚙️ Key Mechanism
                </div>
                <p className={`${d.bodyText} ${d.lineHeight} text-white/85`}>{renderTextWithActiveWord(synth.keyMechanism, isFocused ? activeSpokenWord : null, anchor?.id)}</p>
                {anchor && onOpenThoughtUnit && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onOpenThoughtUnit(anchor.id); }}
                    className="mt-1.5 text-[10px] font-semibold text-emerald-300/70 hover:text-emerald-200"
                  >
                    🧠 Open in Recall Lab →
                  </button>
                )}
              </div>
              );
            })()}
            {/* COMMON CONFUSION — synthesis misconceptionAlert */}
            {synth.commonConfusion && (() => {
              const anchor = cardAnchor("commonConfusion");
              const isFocused = anchor ? focusedEvidenceId === anchor.id : false;
              return (
              <div
                data-evidence-id={anchor?.id}
                className={`rounded-lg border ${isFocused ? "border-red-400/50" : "border-red-400/15"} bg-[#1a0a0a] ${d.cardPadding} transition-colors`}
                style={{ cursor: anchor ? "pointer" : undefined }}
                onClick={anchor ? () => { onEvidenceClick?.(anchor.exactText, anchor.id); } : undefined}
                title={anchor ? "Click to focus left-panel highlight" : undefined}
              >
                <div className={`mb-0.5 ${d.headingText} font-bold uppercase tracking-[0.14em] text-red-300/70`}>
                  ⚠️ Common Confusion
                </div>
                <p className={`${d.bodyText} ${d.lineHeight} text-white/85`}>{renderTextWithActiveWord(synth.commonConfusion, isFocused ? activeSpokenWord : null, anchor?.id)}</p>
                {anchor && onOpenThoughtUnit && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onOpenThoughtUnit(anchor.id); }}
                    className="mt-1.5 text-[10px] font-semibold text-red-300/70 hover:text-red-200"
                  >
                    🧠 Open in Recall Lab →
                  </button>
                )}
              </div>
              );
            })()}
            {/* QUICK MEMORY — synthesis memoryAnchor */}
            {synth.memoryAnchor && (() => {
              const anchor = cardAnchor("quickMemory");
              const isFocused = anchor ? focusedEvidenceId === anchor.id : false;
              return (
              <div
                data-evidence-id={anchor?.id}
                className={`rounded-lg border ${isFocused ? "border-purple-400/50" : "border-purple-400/15"} bg-[#150b25] ${d.cardPadding} transition-colors`}
                style={{ cursor: anchor ? "pointer" : undefined }}
                onClick={anchor ? () => { onEvidenceClick?.(anchor.exactText, anchor.id); } : undefined}
                title={anchor ? "Click to focus left-panel highlight" : undefined}
              >
                <div className={`mb-0.5 ${d.headingText} font-bold uppercase tracking-[0.14em] text-purple-300/70`}>
                  🧠 Quick Memory
                </div>
                <p className={`${d.bodyText} ${d.lineHeight} italic text-white/85`}>{renderTextWithActiveWord(synth.memoryAnchor, isFocused ? activeSpokenWord : null, anchor?.id)}</p>
              </div>
              );
            })()}
          </div>
        </PanelSection>
        );
      })()}

      {/* ── CONCEPT MAP — reasoningFlow visualised as a causal A→B→C chain ──
           Shown after Study Notes so the student sees the full reasoning skeleton
           before the detailed concept blocks. Left panel green highlights map to this. */}
      {hasSynth && synth?.reasoningFlow && (
        <PanelSection title="Concept Map">
          <ConceptMapSection
            reasoningFlow={synth.reasoningFlow}
            crossLinkHints={view.crossLinkHints}
            density={d}
          />
        </PanelSection>
      )}

      {/* Expert View — Claude Stage 3 enrichment, shown after Stage 1/2 resolve */}
      {hasSynth && (claudeEnrichment || stage3Status === "loading") && (
        <PanelSection title="Expert View">
          {stage3Status === "loading" && !claudeEnrichment ? (
            <div className="flex flex-col items-center gap-2 py-3">
              <div className="h-1 w-24 overflow-hidden rounded-full bg-white/8">
                <div className="h-full w-1/2 animate-pulse rounded-full bg-amber-400/30" />
              </div>
              <p className="text-[11px] text-white/30 italic">Expert analysis loading…</p>
            </div>
          ) : claudeEnrichment && (
            <div className={d.space}>
              {claudeEnrichment.deepInsight && (
                <div className={`rounded-lg border border-amber-400/15 bg-[#1a1200] ${d.cardPadding}`}>
                  <div className={`mb-0.5 ${d.headingText} font-bold uppercase tracking-[0.14em] text-amber-300/70`}>
                    🔬 Deep Insight
                  </div>
                  <p className={`${d.bodyText} ${d.lineHeight} text-white/85`}>{claudeEnrichment.deepInsight}</p>
                </div>
              )}
              {claudeEnrichment.alternativeExplanation && (
                <div className={`rounded-lg border border-cyan-400/15 bg-[#001820] ${d.cardPadding}`}>
                  <div className={`mb-0.5 ${d.headingText} font-bold uppercase tracking-[0.14em] text-cyan-300/70`}>
                    🔄 Alternative Explanation
                  </div>
                  <p className={`${d.bodyText} ${d.lineHeight} text-white/85`}>{claudeEnrichment.alternativeExplanation}</p>
                </div>
              )}
              {claudeEnrichment.subjectConnection && (
                <div className={`rounded-lg border border-teal-400/15 bg-[#001a18] ${d.cardPadding}`}>
                  <div className={`mb-0.5 ${d.headingText} font-bold uppercase tracking-[0.14em] text-teal-300/70`}>
                    🔗 Subject Connection
                  </div>
                  <p className={`${d.bodyText} ${d.lineHeight} text-white/85`}>{claudeEnrichment.subjectConnection}</p>
                </div>
              )}
              {claudeEnrichment.expertView && (
                <div className={`rounded-lg border border-orange-400/15 bg-[#1a0e00] ${d.cardPadding}`}>
                  <div className={`mb-0.5 ${d.headingText} font-bold uppercase tracking-[0.14em] text-orange-300/70`}>
                    🎓 Expert View
                  </div>
                  <p className={`${d.bodyText} ${d.lineHeight} text-white/85`}>{claudeEnrichment.expertView}</p>
                </div>
              )}
              {claudeEnrichment.expertTrap && (
                <div className={`rounded-lg border border-red-400/20 bg-[#1a0500] ${d.cardPadding}`}>
                  <div className={`mb-0.5 ${d.headingText} font-bold uppercase tracking-[0.14em] text-red-300/70`}>
                    ⚠️ Expert Trap
                  </div>
                  <p className={`${d.bodyText} ${d.lineHeight} text-white/85`}>{claudeEnrichment.expertTrap}</p>
                </div>
              )}
              {claudeEnrichment.formulaRule && (
                <div className={`rounded-lg border border-violet-400/15 bg-[#0e0020] ${d.cardPadding}`}>
                  <div className={`mb-0.5 ${d.headingText} font-bold uppercase tracking-[0.14em] text-violet-300/70`}>
                    📐 Formula / Rule
                  </div>
                  <p className={`${d.bodyText} ${d.lineHeight} text-white/85`}>{claudeEnrichment.formulaRule}</p>
                </div>
              )}
              {claudeEnrichment.workedExampleLogic && (
                <div className={`rounded-lg border border-sky-400/15 bg-[#001520] ${d.cardPadding}`}>
                  <div className={`mb-0.5 ${d.headingText} font-bold uppercase tracking-[0.14em] text-sky-300/70`}>
                    🧮 Worked Example Logic
                  </div>
                  <p className={`${d.bodyText} ${d.lineHeight} text-white/85`}>{claudeEnrichment.workedExampleLogic}</p>
                </div>
              )}
              {claudeEnrichment.practiceCheckpoint && (
                <div className={`rounded-lg border border-green-400/15 bg-[#001500] ${d.cardPadding}`}>
                  <div className={`mb-0.5 ${d.headingText} font-bold uppercase tracking-[0.14em] text-green-300/70`}>
                    ✅ Practice Checkpoint
                  </div>
                  <p className={`${d.bodyText} ${d.lineHeight} text-white/85`}>{claudeEnrichment.practiceCheckpoint}</p>
                </div>
              )}
            </div>
          )}
        </PanelSection>
      )}

      {/* Synthesis loading / error state — shown when hasSynth is false */}
      {!hasSynth && (
        <PanelSection title="Study Notes">
          {synthTimedOut || synthStatus === "error" ? (
            <div className="rounded-lg border border-red-400/20 bg-red-900/10 px-3 py-4 space-y-3">
              <p className="text-[12px] font-semibold text-red-300">
                {synthTimedOut ? "OpenAI synthesis timed out." : "OpenAI synthesis failed."}
              </p>
              <p className="text-[11px] text-red-200/50 leading-[1.6]">
                {synthErrorMsg ?? "Could not generate study notes from this page."}
              </p>
              <button
                onClick={retrySynthesis}
                className="mt-1 rounded-md border border-red-400/30 bg-red-900/20 px-3 py-1.5 text-[11px] font-semibold text-red-300 hover:bg-red-900/35 hover:text-red-200 transition-colors"
              >
                Retry OpenAI synthesis
              </button>
            </div>
          ) : synthStatus === "success" ? (
            /* Stage 1 is done — thesis, highlights, and mini-test are already shown above.
               Stage 2 is refining the deep notes; show progress, not a static "Analyzing". */
            <div className="flex flex-col items-center gap-2 py-4">
              <div className="h-1 w-32 overflow-hidden rounded-full bg-white/8">
                <div className="h-full w-2/3 animate-pulse rounded-full bg-indigo-400/35" />
              </div>
              <p className="text-[12px] text-white/40 italic">Stage 1 ready · deepening study notes…</p>
              <p className="text-[10px] text-white/20">Highlights and thesis are ready now</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-4">
              <div className="h-1 w-32 overflow-hidden rounded-full bg-white/8">
                <div className="h-full w-1/2 animate-pulse rounded-full bg-emerald-400/30" />
              </div>
              <p className="text-[12px] text-white/35 italic">Generating study notes…</p>
              <p className="text-[10px] text-white/20">Stage 1 rendering in ~2s</p>
            </div>
          )}
        </PanelSection>
      )}


      {/* Concept blocks — secondary context, only shown after synthesis resolves */}
      {hasSynth && <PanelSection title="Concept Blocks">
        {visibleBlocks.length === 0 ? (
          /* Fallback: no strong concept blocks — show SRI signals as reading anchor */
          <div className="rounded-xl border border-white/8 bg-[#0a1428] px-4 py-5 space-y-3">
            <p className="text-[12px] italic text-white/40 leading-5">
              No strong concept block found on this page yet — review highlighted source text.
            </p>
            {view.sriModel && view.sriModel.signals
              .filter((s) => !s.isBackground)
              .slice(0, 3)
              .map((sig, i) => (
                <div key={i} className="rounded-lg border border-white/6 bg-white/2 px-3 py-2">
                  <div className="mb-0.5 flex items-center gap-1.5">
                    <span className="text-[12px]">{sig.icon}</span>
                    <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: sig.color }}>{sig.label}</span>
                  </div>
                  <p className="text-[12px] leading-5 text-white/70">{sig.summary}</p>
                </div>
              ))}
          </div>
        ) : (
        <>
        <div className="mb-4 flex flex-wrap gap-2">
          {visibleBlocks.map((block, index) => (
            <button
              key={`${block.ordinal}-${block.title}`}
              type="button"
              onClick={() => { onSelectBlock(index); onAnchorClick(block.anchorText ?? block.pattern); }}
              className={[
                "rounded-full border px-3 py-1.5 text-[12px] transition",
                index === effectiveIndex
                  ? "border-amber-400/40 bg-amber-400/10 text-amber-200"
                  : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10",
              ].join(" ")}
            >
              {block.ordinal} · {block.title}
            </button>
          ))}
        </div>

        {selectedBlock && (() => {
          // Pre-compute all field values through the semantic quality gate.
          // Renders use the gate's return value directly so no raw field ever
          // bypasses the sanitizer. Cross-field dedup prevents the same idea
          // appearing under multiple labels (definition = mechanism = outcome).
          const fPattern  = sanitizeDisplay(selectedBlock.pattern);
          const fGiven    = sanitizeDisplay(selectedBlock.given);
          const fTrans    = selectedBlock.transformation ? sanitizeDisplay(selectedBlock.transformation) : null;
          const fTrap     = sanitizeDisplay(selectedBlock.trap);
          const fDecision = selectedBlock.decision ? sanitizeDisplay(selectedBlock.decision) : null;
          const fExample  = (selectedBlock as UltraConceptBlock & { example?: string }).example
            ? sanitizeDisplay((selectedBlock as UltraConceptBlock & { example?: string }).example)
            : null;
          const fMemHook  = (selectedBlock as UltraConceptBlock & { memoryHook?: string }).memoryHook
            ? sanitizeDisplay((selectedBlock as UltraConceptBlock & { memoryHook?: string }).memoryHook)
            : null;
          // Exact source anchor — the verbatim PDF sentence this block was built from.
          // Shown as a quote (not just a jump-to-PDF button) so the block is visibly
          // traceable to this page, not generic. Suppressed when it just repeats the
          // already-shown pattern/concept line.
          const fAnchorQuote = selectedBlock.anchorText && !isSimilarText(selectedBlock.anchorText, fPattern ?? "", 0.75)
            ? sanitizeDisplay(selectedBlock.anchorText)
            : null;
          const fRecallQuestion = sanitizeDisplay(selectedBlock.recallQuestion);

          // Mechanism field: requires causal language + cannot duplicate pattern
          const fReason = renderNoteQualityGate("mechanism", selectedBlock.surgicalReason, {
            domain,
            otherFields: [fPattern],
          });
          // Rule field: cross-field dedup against pattern + mechanism
          const fRule = renderNoteQualityGate("rule", selectedBlock.rule, {
            domain,
            otherFields: [fPattern, fReason],
          });
          // Math given: uses mechanism gate with pattern as context
          const fMathGiven = renderNoteQualityGate("mechanism", selectedBlock.given ?? selectedBlock.surgicalReason, {
            domain,
            otherFields: [fPattern],
          });
          const fMisc = selectedBlock.misconception
            ? renderNoteQualityGate("general", selectedBlock.misconception, { domain, otherFields: [fPattern, fTrap] })
            : null;
          const fExamHook = selectedBlock.examHook
            ? renderNoteQualityGate("general", selectedBlock.examHook, { domain, otherFields: [fPattern, fRule] })
            : null;
          const fImportance = renderNoteQualityGate("general", selectedBlock.importance, {
            domain, otherFields: [fPattern, fReason],
          });

          return (
          <div className="rounded-2xl border border-white/10 bg-[#0a1428] px-4 py-4">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div className="text-[16px] font-semibold text-white leading-snug">
                {selectedBlock.ordinal}️⃣ {selectedBlock.title}
              </div>
              {(selectedBlock.anchorText || selectedBlock.pattern) && (
                <button
                  type="button"
                  onClick={() => onAnchorClick(selectedBlock.anchorText ?? selectedBlock.pattern)}
                  className="shrink-0 flex items-center gap-1 rounded-lg border border-amber-400/30 bg-amber-400/8 px-2 py-1 text-[11px] font-medium text-amber-300 hover:bg-amber-400/18 transition-colors"
                  title="Jump to this text in the PDF"
                >
                  <span>↗</span>
                  <span>Focus</span>
                </button>
              )}
            </div>
            {fAnchorQuote && (
              <button
                type="button"
                onClick={() => onAnchorClick(selectedBlock.anchorText ?? selectedBlock.pattern)}
                className="mb-3 block w-full rounded-lg border border-amber-400/15 bg-amber-400/4 px-3 py-2 text-left transition-colors hover:bg-amber-400/8"
                title="Jump to this exact text in the PDF"
              >
                <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-300/70">📍 Source (page {pageNumber ?? "—"})</div>
                <p className="text-[12.5px] italic leading-5 text-amber-100/85">"{fAnchorQuote}"</p>
              </button>
            )}
            <div className="space-y-4">
              {/* FIELD 1: Concept/Definition/Finding — primary signal, highest visual weight. */}
              {fPattern && (
                <div className="rounded-lg border border-white/8 bg-white/3 px-3 py-3">
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: labels.patternColor }}>{labels.pattern}</div>
                  {isMathDomain && (selectedBlock.conceptRole === "formula" || selectedBlock.conceptRole === "theorem")
                    ? (
                      <>
                        <BlockMath expr={fPattern} sourceSnippet={fPattern} />
                        {fReason && (
                          <p className="mt-1.5 text-[12px] leading-5 text-white/55 italic">{fReason}</p>
                        )}
                      </>
                    )
                    : <p className="text-[15px] font-medium leading-6 text-white">{fPattern}</p>
                  }
                </div>
              )}

              {/* MATH SCHEMA: Given → Transformation → Result → Decision → Trap → Procedure */}
              {isMathDomain ? (
                <>
                  {fMathGiven && (
                    <div>
                      <div className="mb-1 text-[12px] font-semibold uppercase tracking-[0.14em]" style={{ color: labels.reasonColor }}>{labels.reason}</div>
                      <p className="text-[14px] leading-6 text-white/90">{fMathGiven}</p>
                    </div>
                  )}
                  {fTrans && (
                    <div>
                      <div className="mb-1 text-[12px] font-semibold uppercase tracking-[0.14em]" style={{ color: "#60a5fa" }}>⟶ Transformation</div>
                      <p className="text-[14px] leading-6 text-white/95 font-mono">{fTrans}</p>
                    </div>
                  )}
                  {fRule && (
                    <div>
                      <div className="mb-1 text-[12px] font-semibold uppercase tracking-[0.14em]" style={{ color: labels.ruleColor }}>{labels.rule}</div>
                      <p className="text-[14px] leading-6 text-white/95">{fRule}</p>
                    </div>
                  )}
                  {fDecision && (
                    <div>
                      <div className="mb-1 text-[12px] font-semibold uppercase tracking-[0.14em]" style={{ color: "#a78bfa" }}>✓ Decision</div>
                      <p className="text-[14px] leading-6 text-violet-200/90">{fDecision}</p>
                    </div>
                  )}
                  {fTrap && (
                    <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2">
                      <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: labels.trapColor }}>{labels.trap}</div>
                      <p className="text-[13px] leading-5 text-rose-200/90">{fTrap}</p>
                    </div>
                  )}
                  {selectedBlock.procedureSteps && selectedBlock.procedureSteps.length >= 2 && (
                    <div>
                      <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-sky-400">∑ Procedure</div>
                      <ol className="space-y-1">
                        {selectedBlock.procedureSteps.map((step, i) => (
                          <li key={i} className="flex items-start gap-2 text-[13px] text-white/80 leading-5">
                            <span className="mt-0.5 shrink-0 rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-bold text-sky-300">{i + 1}</span>
                            <span>{step}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </>
              ) : isScienceDomain ? (
                /* SCIENCE SCHEMA: Mechanism → Example → Trap → Rule → Memory Hook */
                <>
                  {fReason && (
                    <div>
                      <div className="mb-1 text-[12px] font-semibold uppercase tracking-[0.14em]" style={{ color: labels.reasonColor }}>{labels.reason}</div>
                      <p className="text-[14px] leading-6 text-white/90">{fReason}</p>
                    </div>
                  )}
                  {fExample && (
                    <div>
                      <div className="mb-1 text-[12px] font-semibold uppercase tracking-[0.14em]" style={{ color: "#86efac" }}>🔍 Example</div>
                      <p className="text-[14px] leading-6 text-green-200/90">{fExample}</p>
                    </div>
                  )}
                  {fTrap && (
                    <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2">
                      <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: labels.trapColor }}>{labels.trap}</div>
                      <p className="text-[13px] leading-5 text-rose-200/90">{fTrap}</p>
                    </div>
                  )}
                  {fRule && (
                    <div>
                      <div className="mb-1 text-[12px] font-semibold uppercase tracking-[0.14em]" style={{ color: labels.ruleColor }}>{labels.rule}</div>
                      <p className="text-[14px] leading-6 text-white/95">{fRule}</p>
                    </div>
                  )}
                  {fMemHook && (
                    <div>
                      <div className="mb-1 text-[12px] font-semibold uppercase tracking-[0.14em]" style={{ color: "#d8b4fe" }}>💡 Memory Hook</div>
                      <p className="text-[13px] leading-6 text-purple-200/85">{fMemHook}</p>
                    </div>
                  )}
                </>
              ) : (
                /* DEFAULT / CLINICAL SCHEMA: Reason → Trap → Rule */
                <>
                  {fReason && (
                    <div>
                      <div className="mb-1 text-[12px] font-semibold uppercase tracking-[0.14em]" style={{ color: labels.reasonColor }}>{labels.reason}</div>
                      <p className="text-[14px] leading-6 text-white/90">{fReason}</p>
                    </div>
                  )}
                  {fTrap && (
                    <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2">
                      <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: labels.trapColor }}>{labels.trap}</div>
                      <p className="text-[13px] leading-5 text-rose-200/90">{fTrap}</p>
                    </div>
                  )}
                  {fRule && (
                    <div>
                      <div className="mb-1 text-[12px] font-semibold uppercase tracking-[0.14em]" style={{ color: labels.ruleColor }}>{labels.rule}</div>
                      <p className="text-[14px] leading-6 text-white/95">{fRule}</p>
                    </div>
                  )}
                </>
              )}

              {/* Shared optional fields — all domains, rendered from pre-computed gate values */}
              {fMisc && (
                <div>
                  <div className="mb-1 text-[12px] font-semibold uppercase tracking-[0.14em] text-rose-400">⚠️ Misconception</div>
                  <p className="text-[13px] leading-6 text-rose-200/85">{fMisc}</p>
                </div>
              )}
              {(fExamHook ?? synth?.examSignal) && (
                <div>
                  <div className="mb-1 text-[12px] font-semibold uppercase tracking-[0.14em] text-violet-400">🎓 Exam Signal</div>
                  <p className="text-[13px] leading-6 text-violet-200/85">{fExamHook ?? synth?.examSignal}</p>
                </div>
              )}
              {!isMathDomain && selectedBlock.procedureSteps && selectedBlock.procedureSteps.length >= 2 && (
                <div>
                  <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-sky-400">∑ Procedure</div>
                  <ol className="space-y-1">
                    {selectedBlock.procedureSteps.map((step, i) => (
                      <li key={i} className="flex items-start gap-2 text-[13px] text-white/80 leading-5">
                        <span className="mt-0.5 shrink-0 rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-bold text-sky-300">{i + 1}</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              {fImportance && (
                <div>
                  <div className="mb-1 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#c7f59b]">🎯 Importance</div>
                  <p className="text-[14px] leading-6 text-white/90">{fImportance}</p>
                </div>
              )}
              {fRecallQuestion && (
                <div className="rounded-lg border border-cyan-400/15 bg-cyan-400/5 px-3 py-2">
                  <div className="mb-1 text-[12px] font-semibold uppercase tracking-[0.14em] text-cyan-300">🧠 Recall Question</div>
                  <p className="text-[14px] leading-6 text-cyan-100/90">{fRecallQuestion}</p>
                </div>
              )}
            </div>
          </div>
          );
        })()}
        </>
        )}
      </PanelSection>}

      {/* Page Checkpoint — after-reading comprehension test (submit-then-reveal) */}
      {miniTestItems?.length ? (
        <MiniTestPanel items={miniTestItems} bookId={bookId ?? ""} pageNumber={pageNumber ?? 0} title="Page Checkpoint" />
      ) : null}

      {/* STR Compression — hidden in synthesis-only mode; synthesis fields now appear in Study Notes */}
      {/* Reading Map — hidden; SRI signals are internal metadata, not student-facing study notes */}

      {/* ── Related Reading — AI-selected exact articles from NIH/MedlinePlus/NCBI/OpenStax ── */}
      {hasSynth ? (
        <PanelSection title="📖 Related Reading">
          {!resolvedResources.resolved ? (
            <p className="text-[12px] text-slate-500 italic">Finding resources…</p>
          ) : exactArticles.length > 0 ? (
            <ul className="space-y-2">
              {exactArticles.map((a, i) => (
                <li key={i} className="rounded-lg border border-white/8 bg-white/3 p-2.5">
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex flex-col gap-0.5"
                    onClick={() => console.log("[RELATED_CLICK_TARGET]", { type: "article", title: a.title, url: a.url, source: a.source })}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[12px] font-medium text-violet-200 group-hover:text-violet-100 leading-snug">{a.title}</span>
                      <span className="shrink-0 rounded bg-violet-900/60 px-1.5 py-0.5 text-[10px] font-semibold text-violet-300">{a.score}%</span>
                    </div>
                    <span className="text-[10px] text-slate-400">{a.source}</span>
                    <span className="text-[10px] text-emerald-300">Exact topic matched · fallback false</span>
                    <span className="text-[11px] text-slate-300 italic mt-0.5">{a.reason}</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12px] text-slate-500 italic">No exact reading match found for this page.</p>
          )}
        </PanelSection>
      ) : null}

      {/* ── Related Videos — relevance-first ranked across all educational creators ── */}
      {hasSynth ? (
        <PanelSection title="📺 Related Videos">
          {!resolvedResources.resolved ? (
            <p className="text-[12px] text-slate-500 italic">Finding videos…</p>
          ) : exactVideos.length > 0 ? (
            <ul className="space-y-2">
              {exactVideos.map((v, i) => {
                const isDirectVideo = v.searchUrl.includes("youtube.com/watch?v=");
                const hasTimestamp  = isDirectVideo && v.timestampSeconds != null && v.timestampSeconds > 0;
                // Build timestamp deep-link URL (ensure t= param is present for direct links)
                const watchUrl = hasTimestamp && v.timestampSeconds
                  ? (() => {
                      try {
                        const u = new URL(v.searchUrl);
                        u.searchParams.set("t", `${Math.floor(v.timestampSeconds)}s`);
                        return u.toString();
                      } catch { return v.searchUrl; }
                    })()
                  : v.searchUrl;
                return (
                <li key={i} className="rounded-lg border border-white/10 bg-white/4 p-2.5">
                  <div className="flex flex-col gap-1.5">
                    {/* Title row */}
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[12px] font-semibold text-red-100 leading-snug">{v.videoTitle}</span>
                      <span className="shrink-0 rounded bg-red-900/60 px-1.5 py-0.5 text-[10px] font-bold text-red-300">{v.score}</span>
                    </div>
                    {/* Creator row */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-medium text-slate-300">{v.channel}</span>
                      {isDirectVideo ? (
                        <span className="rounded bg-emerald-900/50 px-1 py-px text-[9px] font-semibold text-emerald-400">▶ verified</span>
                      ) : (
                        <span className="rounded bg-slate-700/60 px-1 py-px text-[9px] text-slate-400">search</span>
                      )}
                    </div>
                    {/* Why relevant */}
                    <p className="text-[11px] text-slate-400 italic leading-snug">{v.reason}</p>
                    <p className="text-[10px] text-emerald-300">Exact topic matched · fallback false</p>
                    {/* Timestamp + Watch button */}
                    <div className="flex items-center gap-2 mt-0.5">
                      {hasTimestamp && (
                        <span className="inline-flex items-center gap-1 rounded bg-amber-900/40 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                          ⏱ {v.timestampLabel}
                        </span>
                      )}
                      <a
                        href={watchUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-auto inline-flex items-center gap-1 rounded bg-red-700 hover:bg-red-600 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors"
                        onClick={() => console.log("[RELATED_CLICK_TARGET]", { type: "video", title: v.videoTitle, url: watchUrl, channel: v.channel, isVerified: v.isVerified ?? isDirectVideo, hasTimestamp })}
                      >
                        {v.isVerified ?? isDirectVideo
                          ? `▶ Watch${hasTimestamp ? " at timestamp" : ""}`
                          : "🔍 Search YouTube"}
                      </a>
                    </div>
                  </div>
                </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-[12px] text-slate-500 italic">No exact video match found for this page.</p>
          )}
        </PanelSection>
      ) : null}

      {/* ── Cohere: broad search starting points — shown ONLY when the exact-match
           pipeline above found nothing for that category, so a verified exact match
           is never cluttered by unrelated broad-topic search suggestions. ── */}
      {hasSynth && resolvedResources.resolved && (
        (resolvedResources.articles.length === 0 && cohereQueries.readings.length > 0) ||
        (resolvedResources.videos.length === 0 && cohereQueries.videos.length > 0)
      ) ? (
        <PanelSection title="🔍 Broad Search (no exact match found)">
          {resolvedResources.articles.length === 0 && cohereQueries.readings.length > 0 && (
            <div className="mb-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-violet-400/70 mb-1.5">Readings</p>
              <div className="flex flex-wrap gap-1.5">
                {cohereQueries.readings.map((q, i) => (
                  <a
                    key={i}
                    href={`https://www.google.com/search?q=${encodeURIComponent(q)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full border border-violet-500/30 bg-violet-900/20 px-2.5 py-1 text-[11px] text-violet-200 hover:bg-violet-800/40 transition-colors"
                  >
                    {q}
                  </a>
                ))}
              </div>
            </div>
          )}
          {resolvedResources.videos.length === 0 && cohereQueries.videos.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-red-400/70 mb-1.5">Videos</p>
              <div className="flex flex-wrap gap-1.5">
                {cohereQueries.videos.map((q, i) => (
                  <a
                    key={i}
                    href={`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full border border-red-500/30 bg-red-900/20 px-2.5 py-1 text-[11px] text-red-200 hover:bg-red-800/40 transition-colors"
                  >
                    ▶ {q}
                  </a>
                ))}
              </div>
            </div>
          )}
        </PanelSection>
      ) : null}

      {/* ── DEV DIAGNOSTIC OVERLAY — only visible when NEXT_PUBLIC_DEBUG_READER=true ── */}
      {process.env.NEXT_PUBLIC_DEBUG_READER === "true" && (
        <div style={{
          fontSize: 9, fontFamily: "monospace",
          background: "rgba(0,200,255,0.04)", border: "1px solid rgba(0,200,255,0.12)",
          borderRadius: 6, padding: "6px 10px", color: "#7dd3fc",
          lineHeight: 1.8, whiteSpace: "pre-wrap", wordBreak: "break-all",
        }}>
          {[
            `── SYNTHESIS PIPELINE STATE ──`,
            `domain: ${domain ?? "—"} | kind: ${view._debug?.pageKind ?? "—"}`,
            `synthStatus: ${synthStatus} | _synth hydrated: ${synth !== undefined ? "YES" : "NO"}`,
            `hasSynth: ${hasSynth} | ${synthErrorMsg ? "ERR: " + synthErrorMsg.slice(0, 60) : "no error"}`,
            `whyItMatters:    ${synth?.whyItMatters    ? "✓ " + synth.whyItMatters.slice(0, 55)    : "— null"}`,
            `keyMechanism:    ${synth?.keyMechanism    ? "✓ " + synth.keyMechanism.slice(0, 55)    : "— null"}`,
            `commonConfusion: ${synth?.commonConfusion ? "✓ " + synth.commonConfusion.slice(0, 55) : "— null"}`,
            `memoryAnchor:    ${synth?.memoryAnchor    ? "✓ " + synth.memoryAnchor.slice(0, 55)    : "— null"}`,
            `reasoningFlow:   ${synth?.reasoningFlow   ? "✓ " + synth.reasoningFlow.slice(0, 55)   : "— null"}`,
            `examSignal:      ${synth?.examSignal      ? "✓ " + synth.examSignal.slice(0, 55)      : "— null"}`,
            `── RENDER CONTRACT ──`,
            `visibleBlocks: ${visibleBlocks.length} | thesis: ${(view.pageThesis ?? view.coreIdea ?? "—").slice(0, 50)}`,
            `miniTest: ${view.miniTest.length} | resources: ${resolvedResources.articles.length}a ${resolvedResources.videos.length}v`,
          ].join("\n")}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Concept Blocks View — universal reader primary view
// ---------------------------------------------------------------------------

const TIER_STYLES: Record<ConceptBlock["tier"], {
  border: string; bg: string; badge: string; label: string; labelColor: string;
}> = {
  important: {
    border: "border-amber-400/40",
    bg: "bg-amber-500/5",
    badge: "bg-amber-500/20 text-amber-200",
    label: "Important",
    labelColor: "text-amber-300",
  },
  support: {
    border: "border-blue-400/40",
    bg: "bg-blue-500/5",
    badge: "bg-blue-500/20 text-blue-200",
    label: "Support",
    labelColor: "text-blue-300",
  },
  additional: {
    border: "border-sky-400/35",
    bg: "bg-sky-500/5",
    badge: "bg-sky-500/20 text-sky-200",
    label: "Additional",
    labelColor: "text-sky-300",
  },
  trap: {
    border: "border-rose-400/50",
    bg: "bg-rose-500/8",
    badge: "bg-rose-500/20 text-rose-200",
    label: "Trap",
    labelColor: "text-rose-300",
  },
};

const IMPORTANCE_DOT: Record<ConceptBlock["importance"], string> = {
  critical: "bg-amber-400",
  high:     "bg-blue-400",
  medium:   "bg-sky-400",
  low:      "bg-slate-500",
};

function ConceptCard({
  block,
  index,
  onAnchorClick,
}: {
  block: ConceptBlock;
  index: number;
  onAnchorClick: (text: string) => void;
}) {
  const s = TIER_STYLES[block.tier];
  return (
    <button
      onClick={() => onAnchorClick(block.anchorText)}
      className={`w-full rounded-xl border p-4 text-left transition-colors hover:brightness-110 ${s.border} ${s.bg}`}
    >
      {/* Header row */}
      <div className="mb-3 flex items-center gap-2">
        <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${s.badge}`}>
          {index + 1}
        </span>
        <span className={`text-[9px] font-semibold uppercase tracking-wider ${s.labelColor}`}>
          {s.label}
        </span>
        <span className={`ml-auto h-1.5 w-1.5 rounded-full ${IMPORTANCE_DOT[block.importance]}`} />
      </div>

      {/* Title */}
      <p className="mb-2.5 text-[13px] font-semibold leading-snug text-slate-100">
        {block.title}
      </p>

      {/* Fields */}
      <div className="space-y-1.5 text-xs leading-relaxed">
        {block.pattern && (
          <div className="flex gap-2">
            <span className="w-4 shrink-0 text-slate-500">P</span>
            <span className="text-slate-200">{block.pattern}</span>
          </div>
        )}
        {block.reason && (
          <div className="flex gap-2">
            <span className="w-4 shrink-0 text-yellow-400">⚡</span>
            <span className="text-slate-300">{block.reason}</span>
          </div>
        )}
        {block.trap && (
          <div className="flex gap-2">
            <span className="w-4 shrink-0 text-rose-400">❗</span>
            <span className="text-slate-300">{block.trap}</span>
          </div>
        )}
        {block.rule && (
          <div className="flex gap-2">
            <span className="w-4 shrink-0 text-orange-400">🔥</span>
            <span className="text-slate-200">{block.rule}</span>
          </div>
        )}
      </div>
    </button>
  );
}

function ConceptBlocksView({
  view,
  onAnchorClick,
}: {
  view: ReaderPageView;
  onAnchorClick: (text: string) => void;
}) {
  const [miniTestOpen, setMiniTestOpen] = useState(false);

  return (
    <div className="space-y-4">
      {/* Core Idea */}
      {view.coreIdea && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-widest text-amber-400">
            Core Idea
          </div>
          <p className="text-sm font-medium leading-relaxed text-slate-100">{view.coreIdea}</p>
        </div>
      )}

      {/* Concept blocks */}
      <div className="space-y-2">
        {view.concepts.map((block, i) => (
          <ConceptCard
            key={block.id}
            block={block}
            index={i}
            onAnchorClick={onAnchorClick}
          />
        ))}
      </div>

      {/* Mini Test */}
      {view.miniTest.length > 0 && (
        <div className="rounded-2xl border border-slate-600/30 bg-slate-800/30">
          <button
            onClick={() => setMiniTestOpen((o) => !o)}
            className="flex w-full items-center justify-between px-4 py-3 text-left"
          >
            <span className="text-[9px] font-semibold uppercase tracking-widest text-slate-400">
              Page Checkpoint
            </span>
            <span className="text-[10px] text-slate-500">{miniTestOpen ? "▲" : "▼"}</span>
          </button>
          {miniTestOpen && (
            <div className="space-y-2 px-4 pb-4">
              {view.miniTest.map((q, i) => (
                <MiniTestItem key={i} question={q} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Compression */}
      {view.compression && (
        <div className="rounded-xl border border-white/8 bg-slate-900/60 px-4 py-3">
          <div className="mb-1 text-[9px] font-semibold uppercase tracking-widest text-slate-500">
            Compression
          </div>
          <p className="text-xs leading-relaxed text-slate-400">{view.compression}</p>
        </div>
      )}
    </div>
  );
}

function MiniTestItem({ question }: { question: string }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="rounded-xl border border-white/5 bg-slate-900/50 px-3 py-2">
      <p className="text-xs text-slate-300">{question}</p>
      {shown ? (
        <p className="mt-1.5 text-[11px] text-slate-500 italic">Think it through — no answer provided.</p>
      ) : (
        <button
          onClick={() => setShown(true)}
          className="mt-1.5 text-[10px] text-slate-500 underline underline-offset-2 hover:text-slate-400"
        >
          I&apos;ll try it
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Interactive Mini Test Panel (OpenAI structured questions)
// ---------------------------------------------------------------------------

type MiniTestItemData = {
  question: string;
  type: string;
  options: string[] | null;
  correctAnswer: string;
  explanation: string;
};

function MiniTestPanel({
  items,
  bookId,
  pageNumber,
  title = "Page Checkpoint",
  recallSetIdPrefix = "missed",
  topicLabel = "Mini Test Missed",
}: {
  items: MiniTestItemData[];
  bookId: string;
  pageNumber: number;
  title?: string;
  /** Distinguishes this panel's saved-missed RecallSet from another
   *  MiniTestPanel on the same page (e.g. Shadow Recall vs. Page Checkpoint)
   *  so their saves don't collide on the same stable RecallSet id. */
  recallSetIdPrefix?: string;
  topicLabel?: string;
}) {
  const [answers, setAnswers] = useState<string[]>(() => Array(items.length).fill(""));
  const [submitted, setSubmitted] = useState(false);
  const [selfAssess, setSelfAssess] = useState<boolean[]>(() => Array(items.length).fill(false));
  const [savedMissed, setSavedMissed] = useState(false);

  function isCorrect(item: MiniTestItemData, answer: string): boolean {
    return answer.trim().toLowerCase() === item.correctAnswer.trim().toLowerCase();
  }

  function handleSubmit() {
    setSubmitted(true);
  }

  function handleSelfAssess(i: number, correct: boolean) {
    setSelfAssess((prev) => {
      const next = [...prev];
      next[i] = correct;
      return next;
    });
  }

  function handleSaveMissed() {
    const missedCards: RecallCard[] = items
      .flatMap((item, i) => {
        const mcResult = item.type === "multiple-choice" ? isCorrect(item, answers[i]) : null;
        const missed = mcResult === false || (mcResult === null && !selfAssess[i]);
        if (!missed) return [];
        const c: RecallCard = {
          id: `missed-mt-p${pageNumber}-${i}-${Date.now()}`,
          type: "dat-question" as CardType,
          front: item.question,
          back: item.correctAnswer,
          hint: item.explanation || undefined,
          reviewCount: 0,
          isMissed: true,
        };
        return [c];
      });

    if (!missedCards.length) return;

    // Use stable ID so repeated saves upsert rather than duplicate.
    // recallSetIdPrefix keeps Shadow Recall and Page Checkpoint saves on the
    // same page from colliding on (and overwriting) each other's RecallSet.
    const missedId = `rs-${recallSetIdPrefix}-${bookId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40)}-p${pageNumber}`;
    saveRecallSet({
      id: missedId,
      bookId,
      pageNumber,
      subject: inferSubject(bookId),
      topic: `${topicLabel} — Page ${pageNumber}`,
      cards: missedCards,
      createdAt: Date.now(),
    }).catch((e) => console.error("[RECALL_MISSED_SAVE_FAIL]", String(e)));
    setSavedMissed(true);
    setTimeout(() => setSavedMissed(false), 2500);
  }

  const missedCount = submitted
    ? items.filter((item, i) => {
        if (item.type === "multiple-choice") return !isCorrect(item, answers[i]);
        return !selfAssess[i];
      }).length
    : 0;

  return (
    <PanelSection title={title}>
      <div className="space-y-4">
        {items.map((item, i) => {
          const mcGraded = submitted && item.type === "multiple-choice";
          const correct = mcGraded ? isCorrect(item, answers[i]) : null;
          return (
            <div key={i} className="rounded-xl border border-white/8 bg-slate-900/60 p-3 space-y-2">
              <div className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0 text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                  {item.type === "multiple-choice" ? "MC" : item.type === "short-answer" ? "SA" : item.type === "fill-in-the-blank" ? "FIB" : item.type === "trap" ? "TRAP" : "AP"}
                </span>
                <p className="text-[13px] leading-5 text-slate-200">{item.question}</p>
              </div>

              {item.type === "multiple-choice" && item.options ? (
                <div className="space-y-1 pl-5">
                  {item.options.map((opt, oi) => {
                    const selected = answers[i] === opt;
                    const isRightAnswer = opt.trim().toLowerCase() === item.correctAnswer.trim().toLowerCase();
                    let optClass = "text-slate-400";
                    if (submitted) {
                      if (isRightAnswer) optClass = "text-emerald-400 font-semibold";
                      else if (selected && !isRightAnswer) optClass = "text-rose-400 line-through";
                    } else if (selected) {
                      optClass = "text-white";
                    }
                    return (
                      <label key={oi} className={`flex items-center gap-2 cursor-pointer ${submitted ? "pointer-events-none" : ""}`}>
                        <input
                          type="radio"
                          name={`mt-q${i}`}
                          value={opt}
                          checked={selected}
                          onChange={() => setAnswers((prev) => { const n = [...prev]; n[i] = opt; return n; })}
                          disabled={submitted}
                          className="accent-violet-400"
                        />
                        <span className={`text-[13px] ${optClass}`}>{opt}</span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <textarea
                  rows={2}
                  value={answers[i]}
                  onChange={(e) => setAnswers((prev) => { const n = [...prev]; n[i] = e.target.value; return n; })}
                  disabled={submitted}
                  placeholder="Write your answer…"
                  className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-[12px] text-slate-200 placeholder:text-slate-600 resize-none disabled:opacity-60 focus:outline-none focus:ring-1 focus:ring-violet-500/50"
                />
              )}

              {submitted && (
                <div className="space-y-1.5">
                  {item.type === "multiple-choice" ? (
                    <p className={`text-[12px] font-semibold ${correct ? "text-emerald-400" : "text-rose-400"}`}>
                      {correct ? "✓ Correct" : "✗ Incorrect"}
                    </p>
                  ) : (
                    <div className="space-y-1">
                      <p className="text-[11px] text-slate-400 italic">Model answer: <span className="text-slate-200 not-italic">{item.correctAnswer}</span></p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleSelfAssess(i, true)}
                          className={`rounded px-2 py-0.5 text-[11px] font-semibold transition-colors ${selfAssess[i] ? "bg-emerald-600/50 text-emerald-300" : "bg-emerald-900/30 text-emerald-500 hover:bg-emerald-800/40"}`}
                        >
                          ✓ Got it
                        </button>
                        <button
                          onClick={() => handleSelfAssess(i, false)}
                          className={`rounded px-2 py-0.5 text-[11px] font-semibold transition-colors ${!selfAssess[i] && submitted ? "bg-rose-600/50 text-rose-300" : "bg-rose-900/30 text-rose-500 hover:bg-rose-800/40"}`}
                        >
                          ✗ Missed it
                        </button>
                      </div>
                    </div>
                  )}
                  <p className="text-[12px] leading-4 text-slate-400">{item.explanation}</p>
                </div>
              )}
            </div>
          );
        })}

        {!submitted ? (
          <button
            onClick={handleSubmit}
            disabled={answers.every((a) => !a.trim())}
            className="w-full rounded-xl border border-violet-500/30 bg-violet-900/20 py-2 text-[12px] font-bold text-violet-300 hover:bg-violet-800/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Submit Answers
          </button>
        ) : missedCount > 0 ? (
          <button
            onClick={handleSaveMissed}
            disabled={savedMissed}
            className="w-full rounded-xl border border-amber-500/30 bg-amber-900/15 py-2 text-[12px] font-bold text-amber-300 hover:bg-amber-800/25 disabled:opacity-50 transition-colors"
          >
            {savedMissed ? "✓ Saved to Recall Lab" : `💾 Save ${missedCount} Missed to Recall Lab`}
          </button>
        ) : (
          <p className="text-center text-[12px] text-emerald-400 font-semibold">✓ All correct — great work!</p>
        )}
      </div>
    </PanelSection>
  );
}

// ---------------------------------------------------------------------------
// Page Bottom Line card
// ---------------------------------------------------------------------------

function BottomLineCard({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
      <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-widest text-amber-400">Bottom line</div>
      <p className="text-sm font-medium leading-relaxed text-slate-100">{compressToNote(text, "signal")}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// V3 — Page brief card
// ---------------------------------------------------------------------------

function PageBriefCard({ brief }: { brief: PageBriefV3 }) {
  if (!brief.pageBottomLine) return null;
  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
      <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-widest text-amber-400">Bottom line</div>
      <p className="text-sm font-medium leading-relaxed text-slate-100">
        {compressToNote(brief.pageBottomLine, "signal")}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// V3 — Reading path ("Read in this order")
// ---------------------------------------------------------------------------

const STEP_PRIORITY_STYLES: Record<string, { dot: string; label: string; border: string }> = {
  read_first:  { dot: "bg-amber-400",    label: "text-amber-300",  border: "border-amber-400/30 bg-amber-500/5" },
  warning:     { dot: "bg-rose-400",     label: "text-rose-300",   border: "border-rose-400/30 bg-rose-500/5" },
  read_second: { dot: "bg-blue-400",     label: "text-blue-300",   border: "border-blue-400/25 bg-blue-500/5" },
  read_later:  { dot: "bg-slate-500",    label: "text-slate-400",  border: "border-slate-600/30 bg-slate-800/30" },
  optional:    { dot: "bg-slate-600",    label: "text-slate-500",  border: "border-slate-700/20 bg-slate-900/20" },
};

function ReadingPathView({
  steps,
  onStepClick,
}: {
  steps: ReadingStepV3[];
  onStepClick: (text: string) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Read in this order</p>
      {steps.map((step, i) => {
        const s = STEP_PRIORITY_STYLES[step.priority] ?? STEP_PRIORITY_STYLES.read_later;
        return (
          <button
            key={step.id}
            onClick={() => onStepClick(step.note)}
            className={`w-full rounded-xl border p-3 text-left transition-colors hover:brightness-110 ${s.border}`}
          >
            <div className="flex items-start gap-2.5">
              <span className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${s.dot} text-slate-900`}>
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <span className={`text-[9px] font-semibold uppercase tracking-wider ${s.label}`}>{step.label}</span>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-200 line-clamp-2">{step.note}</p>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// V3 — Paragraph note card (richer than V2)
// ---------------------------------------------------------------------------

function V3NoteCard({
  note,
  index,
  onClick,
}: {
  note: ParagraphNoteV3;
  index: number;
  onClick: (text: string) => void;
}) {
  const s = READER_ROLE_STYLES[note.kind];
  const detail = note.warningNote ?? note.actionNote ?? note.whyItMatters;
  return (
    <button
      onClick={() => onClick(note.summarySentence)}
      className={`w-full rounded-xl border p-3.5 text-left transition-colors hover:brightness-110 ${s.border} ${s.bg}`}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${s.badge}`}>
          {index + 1}
        </span>
        <span className={`text-[9px] font-semibold uppercase tracking-wider ${s.label}`}>
          {note.operatorLabel ?? note.kind}
        </span>
      </div>
      <p className={`text-xs leading-relaxed ${s.text}`}>
        {compressToNote(note.summarySentence, note.kind === "warning" ? "trap" : note.kind === "important" ? "signal" : "")}
      </p>
      {detail && detail !== note.summarySentence && (
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
          {compressToNote(detail, "")}
        </p>
      )}
    </button>
  );
}

function V3ParagraphMapView({
  notes,
  onNoteClick,
}: {
  notes: ParagraphNoteV3[];
  onNoteClick: (text: string) => void;
}) {
  const visible = notes.slice(0, 10);
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Paragraph notes</p>
      {visible.map((note, i) => (
        <V3NoteCard key={note.id} note={note} index={i} onClick={onNoteClick} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Paragraph Map (V2 fallback)
// ---------------------------------------------------------------------------

const ROLE_LABEL: Record<ReaderRole, string> = {
  important: "Important",
  support:   "Support",
  additional: "Additional",
  warning:   "Warning",
};

function ParagraphNoteCard({
  note,
  index,
  onClick,
}: {
  note: ParagraphNote;
  index: number;
  onClick: (text: string) => void;
}) {
  const s = READER_ROLE_STYLES[note.role];
  return (
    <button
      onClick={() => onClick(note.text)}
      className={`w-full rounded-xl border p-3.5 text-left transition-colors hover:brightness-110 ${s.border} ${s.bg}`}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${s.badge}`}>
          {index + 1}
        </span>
        <span className={`text-[9px] font-semibold uppercase tracking-wider ${s.label}`}>
          {ROLE_LABEL[note.role]}
        </span>
      </div>
      <p className={`text-xs leading-relaxed ${s.text}`}>
        {compressToNote(note.text, note.role === "warning" ? "trap" : note.role === "important" ? "signal" : "")}
      </p>
      {note.detail && (
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
          {compressToNote(note.detail, "")}
        </p>
      )}
    </button>
  );
}

function ParagraphMapView({
  notes,
  onNoteClick,
}: {
  notes: ParagraphNote[];
  onNoteClick: (text: string) => void;
}) {
  // Show all notes capped at 10 to avoid overwhelming the panel
  const visible = notes.slice(0, 10);
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Paragraph map</p>
      {visible.map((note, i) => (
        <ParagraphNoteCard
          key={note.blockId}
          note={note}
          index={i}
          onClick={onNoteClick}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// V2 Operator View — sparse-page fallback
// ---------------------------------------------------------------------------

const V2_BLOCK_STYLES: Record<string, { border: string; title: string; bg: string }> = {
  signal:      { border: "border-amber-400/40",   title: "text-amber-300",   bg: "bg-amber-500/5" },
  rule:        { border: "border-blue-400/40",    title: "text-blue-300",    bg: "bg-blue-500/5" },
  mechanism:   { border: "border-blue-400/35",    title: "text-blue-300",    bg: "bg-blue-500/5" },
  action:      { border: "border-blue-400/35",    title: "text-blue-300",    bg: "bg-blue-500/5" },
  trap:        { border: "border-rose-400/50",    title: "text-rose-300",    bg: "bg-rose-500/8" },
  bottom_line: { border: "border-amber-500/30",   title: "text-amber-300",   bg: "bg-amber-500/5" },
};

function V2BlockCard({ block }: { block: StoryBlockV2 }) {
  const style = V2_BLOCK_STYLES[block.kind] ?? V2_BLOCK_STYLES.signal;
  return (
    <section className={`rounded-xl border p-3.5 ${style.border} ${style.bg}`}>
      <div className={`text-[9px] font-semibold uppercase tracking-wider ${style.title}`}>{block.title}</div>
      <p className="mt-2 text-xs leading-relaxed text-slate-100">{compressToNote(block.text, block.kind === "trap" ? "trap" : "signal")}</p>
      {block.support.length > 0 && (
        <ul className="mt-2 space-y-1">
          {block.support.slice(0, 2).map((s, idx) => (
            <li key={`${block.id}-sup-${idx}`} className="text-[11px] leading-5 text-slate-400">• {s}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function V2OperatorView({ storyV2 }: { storyV2: PageStoryV2 }) {
  const blocks: StoryBlockV2[] = [
    storyV2.signalBlock,
    storyV2.ruleBlock,
    storyV2.mechanismBlock,
    storyV2.actionBlock,
    storyV2.trapBlock,
    storyV2.bottomLineBlock,
  ].filter((b): b is StoryBlockV2 => Boolean(b));
  if (!blocks.length) return null;
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Operator view</p>
      {blocks.map((block) => <V2BlockCard key={block.id} block={block} />)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// v1 Guided View fallback
// ---------------------------------------------------------------------------

type GuidedView = NonNullable<ReturnType<typeof buildGuidedReadView>>;

function GuidedViewFallback({
  guidedView,
  selectedStepId,
  focusedEvidenceId,
  resolveEvidenceId,
  selectStep,
}: {
  guidedView: GuidedView;
  selectedStepId: string | null;
  focusedEvidenceId: string | null;
  resolveEvidenceId?: (snippet: string) => string | undefined;
  selectStep: (step: GuidedView["steps"][number], jump: boolean) => void;
}) {
  return (
    <>
      <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-emerald-300">What matters on this page</div>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-300">{compressToNote(guidedView.pagePurpose, "signal")}</p>
      </div>

      <div className="rounded-2xl border border-emerald-500/20 bg-slate-950/70 p-5">
        <div className="mb-3 text-[10px] uppercase tracking-wider text-emerald-400">Operator View</div>
        {guidedView.cards?.length ? (
          <div className="space-y-3">
            {guidedView.cards.map((card) => <OperatorCardView key={card.id} card={card} />)}
          </div>
        ) : (
          <div className="space-y-3">
            {guidedView.steps.map((step) => {
              const selected = selectedStepId === step.id;
              const ev = step.evidence[0]?.text || step.primaryText;
              const evidenceId = resolveEvidenceId?.(ev);
              const activeEvidence = Boolean(focusedEvidenceId && evidenceId === focusedEvidenceId);
              const trapLike = /\b(trap|wrong move|pitfall|boundary)\b/i.test(step.label);
              return (
                <button
                  key={step.id}
                  data-evidence-id={evidenceId}
                  onClick={() => selectStep(step, true)}
                  className={`w-full rounded-xl border p-4 text-left whitespace-normal break-words ${
                    selected || activeEvidence
                      ? trapLike ? "border-rose-400/50 bg-rose-500/10" : "border-emerald-400/40 bg-emerald-500/10"
                      : trapLike ? "border-rose-500/30 bg-rose-950/30" : "border-white/10 bg-slate-900/80"
                  }`}
                >
                  <div className="mb-2 flex items-center gap-2">
                    <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${trapLike ? "bg-rose-500/20 text-rose-200" : "bg-emerald-500/20 text-emerald-200"}`}>
                      {step.stepNumber}
                    </span>
                    <span className={`text-xs uppercase tracking-wide ${trapLike ? "text-rose-300" : "text-emerald-300"}`}>
                      {step.label}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-slate-200">{step.primaryText}</p>
                  {step.secondaryText && <p className="mt-2 text-xs text-slate-300">{step.secondaryText}</p>}
                  {step.evidence.length ? (
                    <div className="mt-2 space-y-1">
                      {step.evidence.slice(0, 2).map((anchor) => (
                        <p key={anchor.id} className="text-[11px] leading-relaxed text-slate-400">↳ {anchor.text}</p>
                      ))}
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {guidedView.supportTitle && guidedView.supportBullets?.length ? (
        <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
          <div className="mb-2 text-[10px] uppercase tracking-wider text-slate-400">{guidedView.supportTitle}</div>
          <ul className="space-y-1 text-sm text-slate-200">
            {guidedView.supportBullets.map((bullet, index) => (
              <li key={`${bullet}-${index}`}>• {bullet}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Operator card (v1 guided view sub-component)
// ---------------------------------------------------------------------------

function cardBorderClass(kind: string, severity?: string) {
  if (kind === "trap") return severity === "high" ? "border-red-400/60 bg-red-500/15" : "border-rose-400/50 bg-rose-500/10";
  if (kind === "decision") return "border-blue-400/40 bg-blue-500/10";
  if (kind === "mechanism") return "border-blue-300/40 bg-blue-500/10";
  return "border-emerald-400/30 bg-emerald-500/10";
}
function cardTitleClass(kind: string) {
  if (kind === "trap") return "text-rose-300";
  if (kind === "decision") return "text-blue-200";
  if (kind === "mechanism") return "text-blue-200";
  return "text-emerald-200";
}

function OperatorCardView({ card }: { card: OperatorCard }) {
  return (
    <section className={`rounded-2xl border p-4 ${cardBorderClass(card.kind, card.severity)}`}>
      <div className={`text-xs font-semibold uppercase tracking-wide ${cardTitleClass(card.kind)}`}>{card.title}</div>
      <div className="mt-2 text-sm font-medium leading-6 text-slate-100">{card.primary}</div>
      {card.bullets?.length ? (
        <ul className="mt-3 space-y-1">
          {card.bullets.map((bullet, idx) => (
            <li key={`${card.id}-${idx}`} className="text-xs leading-5 text-slate-300">• {bullet}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Loading / gate fallback
// ---------------------------------------------------------------------------

function inferUnavailablePageLabel(pageKind?: string): string {
  switch (pageKind) {
    case "chapter_title":      return "Chapter title page";
    case "front_matter":       return "Front matter";
    case "image_only":         return "Image-only page";
    case "graph_only":         return "Graph-only page";
    case "diagram_only":       return "Diagram-only page";
    case "table_heavy":        return "Table-heavy page";
    case "questionnaire_form": return "Form page";
    case "insufficient_prose": return "Insufficient text";
    default:                   return "Non-instructional page";
  }
}

function renderTruthFallback(reason: string, status: string, keyMismatch: boolean, loadingPhase = 0) {
  if (status === "loading" || keyMismatch || reason === "loading") {
    return <PageLoadingSkeleton phase={loadingPhase} />;
  }
  if (reason === "image_only") return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4 text-sm text-slate-300">
      This page is primarily image-based. No grounded text was extracted.
    </div>
  );
  if (reason === "form_page") return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4 text-sm text-slate-300">
      This page is a form or structured intake page.
    </div>
  );
  if (reason === "table_heavy") return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4 text-sm text-slate-300">
      Table-heavy page — prose extraction is limited.
    </div>
  );
  if (reason === "front_matter") return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4 text-sm text-slate-300">
      Front matter — guided reasoning is withheld.
    </div>
  );
  if (reason !== "ok") return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4 text-sm text-slate-300">
      Not enough text was extracted from this page to build notes.
    </div>
  );
  return null;
}

// ---------------------------------------------------------------------------
// Narrative page view — sentence-level 4-section story
// ---------------------------------------------------------------------------

function NarrativeSections({
  sections,
  onBlockClick,
}: {
  sections: NarrativeSection[];
  onBlockClick: (text: string) => void;
}) {
  if (!sections.length) return null;
  return (
    <div className="space-y-3">
      {sections.map((section, index) => (
        <div
          key={section.key}
          className="rounded-2xl border border-white/10 bg-slate-900/70 p-4"
        >
          <div className="mb-2 flex items-center gap-2">
            <div className="flex h-5 w-5 items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-500/10 text-[10px] font-semibold text-emerald-200">
              {index + 1}
            </div>
            <div className="text-[9px] font-semibold uppercase tracking-widest text-emerald-300">
              {section.title}
            </div>
          </div>
          <button
            onClick={() => onBlockClick(section.lead)}
            className="w-full text-left"
          >
            <p className="text-sm leading-relaxed text-slate-100">{section.lead}</p>
          </button>
          {section.support?.length > 0 && (
            <div className="mt-2.5 space-y-1 border-t border-white/5 pt-2">
              {section.support.map((item, idx) => (
                <button
                  key={`${section.key}-support-${idx}`}
                  onClick={() => onBlockClick(item)}
                  className="w-full text-left text-xs leading-relaxed text-slate-400 transition-colors hover:text-slate-300"
                >
                  {item}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Narrative blocks — primary story layer
// ---------------------------------------------------------------------------

const NARRATIVE_STYLES: Record<NarrativeBlockType, { border: string; bg: string; label: string }> = {
  core:        { border: "border-amber-400/40",    bg: "bg-amber-500/5",    label: "text-amber-300"   },
  logic:       { border: "border-blue-400/40",     bg: "bg-blue-500/5",     label: "text-blue-300"    },
  application: { border: "border-emerald-400/35",  bg: "bg-emerald-500/5",  label: "text-emerald-300" },
};

function NarrativeBlockCard({
  block,
  onBlockClick,
}: {
  block: NarrativeBlock;
  onBlockClick: (text: string) => void;
}) {
  const s = NARRATIVE_STYLES[block.type];
  return (
    <div className={`rounded-2xl border ${s.border} ${s.bg} p-4`}>
      <div className={`mb-2 text-[9px] font-semibold uppercase tracking-widest ${s.label}`}>
        {block.title}
      </div>
      <button
        onClick={() => onBlockClick(block.content)}
        className="w-full text-left"
      >
        <p className="text-sm leading-relaxed text-slate-100">{block.content}</p>
      </button>
      {block.evidence.length > 0 && (
        <div className="mt-2.5 space-y-1 border-t border-white/5 pt-2">
          {block.evidence.map((e, i) => (
            <button
              key={i}
              onClick={() => onBlockClick(e)}
              className="w-full text-left text-xs leading-relaxed text-slate-400 transition-colors hover:text-slate-300"
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NarrativeBlocksView({
  blocks,
  onBlockClick,
}: {
  blocks: NarrativeBlock[];
  onBlockClick: (text: string) => void;
}) {
  return (
    <div className="space-y-3">
      {blocks.map((block) => (
        <NarrativeBlockCard key={block.id} block={block} onBlockClick={onBlockClick} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shadow Recall — left-side drawer only
// Primary: Stage 1 preReadRecallItems (~1–3s, page-specific questions from OpenAI).
// Fallback: derived from synthesis fields (thesis/mechanism/trap) — zero extra AI call.
// ---------------------------------------------------------------------------

function PreReadRecallDrawer({
  open,
  onClose,
  recall,
  bookId,
  pageNumber,
  preReadRecallItems,
  synthForDerive,
}: {
  open: boolean;
  onClose: () => void;
  recall: ShadowRecallModel | null;
  bookId?: string;
  pageNumber?: number;
  preReadRecallItems?: Array<{ question: string; type: string; options: string[] | null; correctAnswer: string; explanation: string }> | null;
  synthForDerive?: SynthesisForRecall | null;
}) {
  if (!open) return null;

  // Derive recall items from synthesis data — works even when pageModel (heuristic) is null.
  // Priority: preReadRecallItems (Stage 1 AI) > derived from synthForDerive > empty state.
  const derived = (!preReadRecallItems?.length && synthForDerive) ? deriveRecallItems(synthForDerive) : null;
  const items = preReadRecallItems?.length ? preReadRecallItems : derived;
  const pageLabel = recall?.pageLabel ?? "This Page";
  console.log("[WIRE] ShadowRecall open", { page: pageLabel, recallNull: !recall, questions: items?.length ?? 0, source: preReadRecallItems?.length ? "stage1" : derived?.length ? "derived" : "empty", types: items?.map(i => i.type) ?? [] });
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed left-0 top-0 bottom-0 z-50 w-[380px] bg-[#0b1020] border-r border-white/10 flex flex-col overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
          <span className="text-[11px] font-bold uppercase tracking-widest text-violet-300">
            🕶 Shadow Recall · {pageLabel}
          </span>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-300 text-xl leading-none"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {items?.length ? (
            <MiniTestPanel
              items={items}
              bookId={bookId ?? ""}
              pageNumber={pageNumber ?? 0}
              title="Pre-Read Recall"
              recallSetIdPrefix="shadow-missed"
              topicLabel="Shadow Recall Missed"
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-violet-500" />
              </span>
              <p className="text-[11px] text-slate-400 leading-relaxed max-w-[260px]">
                Reading this page…<br />
                <span className="text-slate-600">Questions appear in ~2s.</span>
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function RecallItem({ prompt, answer }: { prompt: string; answer: string }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="rounded-xl border border-white/5 bg-slate-900/50 px-3 py-2">
      <p className="text-xs text-slate-300">{prompt}</p>
      {revealed ? (
        <p className="mt-1.5 text-xs leading-relaxed text-slate-100">{answer}</p>
      ) : (
        <button
          onClick={() => setRevealed(true)}
          className="mt-1.5 text-[10px] text-slate-500 underline underline-offset-2 hover:text-slate-400"
        >
          Reveal
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Adapter: PageInsightModel → SentenceCandidate[]
// Temporary bridge until the backend stores native sentence candidates.
// ---------------------------------------------------------------------------

function buildSentenceCandidatesFromPageModel(pageModel: any, pageNumber: number): any[] {
  const candidates: any[] = [];

  (pageModel?.paragraphInsights || []).forEach((p: any, paragraphIndex: number) => {
    const texts = [p.meaning, p.summary, p.takeaway, p.text].filter(Boolean);

    texts.forEach((text: string, sentenceIndex: number) => {
      candidates.push({
        id: `${p.id || `p-${paragraphIndex}`}-s-${sentenceIndex}`,
        text,
        cleanedText: text,
        normalizedText: text,
        pageNumber,
        paragraphId: p.id || `p-${paragraphIndex}`,
        sentenceIndex,
        paragraphIndex,
        roleHints: {
          isDefinition: /defined as|refers to|is called|means/i.test(text),
          isMechanism: /because|mechanism|drives|through|via|causes/i.test(text),
          isCause: /because|causes|leads to|results in/i.test(text),
          isEffect: /results in|therefore|thus|leads to/i.test(text),
          isContrast: /however|whereas|unlike|in contrast|versus|vs\./i.test(text),
          isWarning: /avoid|trap|mistake|wrong|pitfall|do not/i.test(text),
          isAction: /should|must|use|apply|identify|consider|remember/i.test(text),
          isExample: /for example|for instance|e\.g\./i.test(text),
          isEvidence: /because|this means|therefore|thus/i.test(text),
          isSummaryLike: sentenceIndex === 0,
        },
        scores: {
          salience: p.priorityScore ?? p.score ?? 0.5,
          instructional: /should|must|identify|compare|apply|diagnosis|rule/i.test(text) ? 0.8 : 0.35,
          actionability: /should|must|use|apply|remember|avoid/i.test(text) ? 0.8 : 0.25,
          warning: /avoid|trap|mistake|wrong|pitfall|do not/i.test(text) ? 0.85 : 0.1,
          supportStrength: /because|therefore|results in|means|explains/i.test(text) ? 0.8 : 0.35,
          centrality: sentenceIndex === 0 ? 0.8 : 0.45,
        },
      });
    });
  });

  return candidates;
}

// ---------------------------------------------------------------------------
// Generate Ultra Note button
// ---------------------------------------------------------------------------
// Coming Soon placeholder — replaces buttons for frozen features

function ComingSoonButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      disabled
      style={{
        flex: 1,
        padding: "10px 0",
        borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(255,255,255,0.02)",
        color: "rgba(255,255,255,0.2)",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.06em",
        cursor: "not-allowed",
      }}
    >
      {label}
      <span style={{ display: "block", fontSize: 9, marginTop: 2, opacity: 0.6 }}>Coming Soon</span>
    </button>
  );
}

// ---------------------------------------------------------------------------

function GenerateNoteButton({
  view,
  bookId,
  bookTitle,
  pageNumber,
  onNoteSaved,
  studyModel,
}: {
  view: UltraPageView;
  bookId: string;
  bookTitle?: string;
  pageNumber: number;
  onNoteSaved?: () => void;
  studyModel?: CurrentPageStudyModel | null;
}) {
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const synthReady = !!studyModel;

  async function handleGenerate() {
    console.log("[NOTE_SAVE_KEY]", { storageKey: "ultraNotes_v1", page: pageNumber, bookId, hasStudyModel: !!studyModel });
    if (!studyModel || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const topic = (view.title || `Page ${pageNumber}`).replace(/^ULTRA\s*[–—-]\s*/i, "").trim();
      const note = buildNoteFromStudyModel(studyModel, { bookId, pageNumber, topic, bookTitle });

      await saveUltraNote(note);

      const persisted = await isUltraNotePersisted(note.id);
      if (!persisted) throw new Error("Note not found in storage after save");

      console.log("[NOTE_READ_KEY]", { storageKey: "ultraNotes_v1", noteId: note.id });
      console.log("[NOTE_SAVE_SUCCESS]", { id: note.id, page: pageNumber, bookId, topic: note.topic });
      console.log("[NOTELAB_READ_AFTER_SAVE_SUCCESS]", { noteId: note.id, found: true });

      await persistVisualAnchorsAsHighlights(bookId, pageNumber, studyModel, "note", note.id);

      setSaved(true);
      setSaveError(null);
      onNoteSaved?.();
      setTimeout(() => setSaved(false), 2200);
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      console.error("[NOTE_SAVE_ERROR]", { reason: msg, page: pageNumber, bookId });
      setSaveError(msg.slice(0, 80));
      setTimeout(() => setSaveError(null), 4000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <button
      type="button"
      onClick={synthReady && !saving ? handleGenerate : undefined}
      disabled={!synthReady || saving}
      style={{
        width: "100%",
        padding: "10px 0",
        borderRadius: 10,
        border: saved
          ? "1px solid rgba(52,211,153,0.5)"
          : saveError
          ? "1px solid rgba(239,68,68,0.45)"
          : !synthReady
          ? "1px solid rgba(255,255,255,0.08)"
          : "1px solid rgba(245,200,66,0.25)",
        background: saved
          ? "rgba(16,185,129,0.12)"
          : saveError
          ? "rgba(239,68,68,0.08)"
          : !synthReady
          ? "rgba(255,255,255,0.03)"
          : "rgba(245,200,66,0.07)",
        color: saved
          ? "#6ee7b7"
          : saveError
          ? "#fca5a5"
          : !synthReady
          ? "rgba(255,255,255,0.3)"
          : "#fcd34d",
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "0.06em",
        cursor: synthReady && !saving ? "pointer" : "not-allowed",
        transition: "all 0.18s",
      }}
    >
      {saving
        ? "Saving…"
        : saved
        ? "✓ Note saved to NoteLab"
        : saveError
        ? `✗ Save failed — ${saveError}`
        : !synthReady
        ? "Notes unavailable — page has no extractable content"
        : "⚡ Save to NoteLab"}
    </button>
  );
}

function GenerateStudySetButton({
  view,
  bookId,
  bookTitle,
  pageNumber,
  onStudySetGenerated,
  studyModel,
}: {
  view: UltraPageView;
  bookId: string;
  bookTitle?: string;
  pageNumber: number;
  onStudySetGenerated?: (setId: string) => void;
  studyModel?: CurrentPageStudyModel | null;
}) {
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const synthReady = !!studyModel;

  async function handleGenerate() {
    console.log("[RECALL_SAVE_KEY]", { storageKey: "recallSets_v1", page: pageNumber, bookId, hasStudyModel: !!studyModel });
    if (!studyModel || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const set = buildRecallSetFromView(view, bookId, pageNumber, {
        bookTitle,
        sourceLabel: "right-panel",
        studyModel,
      });

      await saveRecallSet(set);

      const persisted = await isRecallSetPersisted(set.id);
      if (!persisted) throw new Error("Study set not found in storage after save");

      console.log("[RECALL_READ_KEY]", { storageKey: "recallSets_v1", setId: set.id });
      console.log("[RECALL_SAVE_SUCCESS]", { id: set.id, page: pageNumber, bookId, cardCount: set.cards.length, topic: set.topic });
      console.log("[RECALL_READ_AFTER_SAVE_SUCCESS]", { setId: set.id, found: true });

      await persistVisualAnchorsAsHighlights(bookId, pageNumber, studyModel, "recall", set.id);

      setSaved(true);
      setSaveError(null);
      onStudySetGenerated?.(set.id);
      setTimeout(() => setSaved(false), 2200);
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      console.error("[RECALL_SAVE_ERROR]", { reason: msg, page: pageNumber, bookId });
      setSaveError(msg.slice(0, 80));
      setTimeout(() => setSaveError(null), 4000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <button
      type="button"
      onClick={synthReady && !saving ? handleGenerate : undefined}
      disabled={!synthReady || saving}
      style={{
        flex: 1,
        padding: "10px 0",
        borderRadius: 10,
        border: saved
          ? "1px solid rgba(99,102,241,0.5)"
          : saveError
          ? "1px solid rgba(239,68,68,0.45)"
          : !synthReady
          ? "1px solid rgba(255,255,255,0.08)"
          : "1px solid rgba(99,102,241,0.25)",
        background: saved
          ? "rgba(99,102,241,0.12)"
          : saveError
          ? "rgba(239,68,68,0.08)"
          : !synthReady
          ? "rgba(255,255,255,0.03)"
          : "rgba(99,102,241,0.07)",
        color: saved
          ? "#a5b4fc"
          : saveError
          ? "#fca5a5"
          : !synthReady
          ? "rgba(255,255,255,0.3)"
          : "#818cf8",
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "0.06em",
        cursor: synthReady && !saving ? "pointer" : "not-allowed",
        transition: "all 0.18s",
      }}
    >
      {saving
        ? "Saving…"
        : saved
        ? "✓ Saved to Recall Lab"
        : saveError
        ? `✗ Save failed — ${saveError}`
        : !synthReady
        ? "Recall cards unavailable — page has no extractable content"
        : "🎯 Save to Recall Lab"}
    </button>
  );
}
