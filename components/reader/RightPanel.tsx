import React, { useEffect, useMemo, useRef, useState } from "react";
import type { ActivePageContext, ResolvedPanelPayload, RightPanelState } from "@/lib/readerContracts";
import { useGuidedHighlightSync } from "@/hooks/useGuidedHighlightSync";
import { buildGuidedReadView, type GuidedDepth, type GuidedMode, type GuidedRole } from "@/lib/insights/buildGuidedReadView";
import { compressToNote, isFieldRenderable } from "@/lib/insights/sentenceCleanup";
import type { EvidenceAnchor, OperatorCard } from "@/lib/insights/types";
import type { ActivePageIntelligenceSnapshot } from "@/lib/useActivePageIntelligence";
import type { SemanticHighlightKind } from "@/lib/highlights/extractPriorityHighlights";
import type { PageStoryV2, StoryBlockV2 } from "@/lib/insights/buildPageStoryV2";
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
import { buildUltraNote, saveUltraNote, inferSubject } from "@/lib/notelab/ultraNoteStore";
import { buildRecallSetFromView, saveRecallSet, type RecallCard, type CardType } from "@/lib/recalllab/recallStore";
import { isWeakBlock, sanitizeDisplay, renderNoteQualityGate, isSimilarText, isCompleteThought, BOILERPLATE_RE, PUBLISHER_DEBRIS_RE } from "@/lib/insights/renderQualityGate";

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
    return null;
  }
  if (domain === "math" && /\bbiologically\b|\borganism\b|\bcell\b|\bprotein\b|\bphysiolog/i.test(t)) {
    console.log(tag, "cross-domain biology on math page →", t.slice(0, 60));
    return null;
  }
  if (/^(another\s+(notation|term|way|name|example)|a\s+number\s+of\s+(texts?|books?|authors?)|this\s+(means?|is|refers?)|they\s+(are|were|have)|some\s+(authors?|texts?|books?))\b/i.test(t)) {
    console.log(tag, "vague-opener artifact →", t.slice(0, 60));
    return null;
  }
  if (t.split(/\s+/).length < 6) {
    console.log(tag, "too short (<6 words) →", t);
    return null;
  }
  if (/^[a-z]/.test(t)) {
    console.log(tag, "starts lowercase →", t.slice(0, 60));
    return null;
  }
  if (/[;,]\s*$/.test(t)) {
    console.log(tag, "dangling punctuation →", t.slice(0, 60));
    return null;
  }
  return t;
}
import { useTeachingSynthesis } from "./useTeachingSynthesis";
import { buildStudyModel, type CurrentPageStudyModel } from "@/lib/insights/currentPageStudyModel";

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
  onNoteSaved?: () => void;
  onStudySetGenerated?: (setId: string) => void;
  /** Called when synthesis resolves with AI-selected highlight anchors for the left panel */
  onSynthHighlightsReady?: (anchors: import("@/lib/insights/synthesizeTeachingOutput").SynthHighlightAnchor[]) => void;
  /** Called when user clicks a cross-link that has an estimated target page */
  onCrossLinkNavigate?: (page: number) => void;
  /** TOC items for resolving cross-link labels to real page numbers */
  tocItems?: import("@/lib/stores/tocStore").TocItem[];
  /** Called when synthesis resolves with the full typed study model */
  onStudyModelReady?: (model: CurrentPageStudyModel) => void;
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
  "Understanding page structure…",
  "Writing notes…",
  "Generating recall questions…",
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
  onNoteSaved,
  onStudySetGenerated,
  onSynthHighlightsReady,
  onCrossLinkNavigate,
  tocItems,
  onStudyModelReady,
}: RightPanelProps) {
  const pageTruthKey = intelligence.pageTruthKey;
  const pageModel = intelligence.pageModel;
  const pageTruth = intelligence.pageTruth;
  const isCurrentPageModel = Boolean(intelligence.isCurrentPage && pageModel && intelligence.status === "ready");

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
    // Navigation / structural
    "contents", "chapter_opener", "unit_opener", "section_opener",
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
  const {
    synthesis: teachingSynthesis,
    status: synthStatus,
    stage1Status,
    stage2Status,
    errorMessage: synthErrorMsg,
  } = useTeachingSynthesis({
    pageTruthKey,
    pageObjective: ultraPageView?.teachingStatement,
    pageThesis:    ultraPageView?.pageThesis ?? undefined,
    pageSummary:   pageModel?.pageSummary ?? undefined,
    pageText:      ctx?.pageText ? ctx.pageText.slice(0, 1500) : undefined,
    domain: (ultraPageView?._debug?.domain) ?? null,
    blocks: ultraPageView?.blocks ?? [],
    enabled: isCurrentPageModel && !!ultraPageView && !isStructuralPage,
    pageNumber: ctx?.pageNumber ?? undefined,
  });

  // Apply teaching synthesis over heuristic view without re-running the pipeline.
  // Synthesis is the professor layer — it supersedes heuristic sentence extraction,
  // but every synthesis field is validated by validSynthField before replacing a
  // heuristic value. This prevents cross-domain phrasing, publisher artifacts, and
  // incomplete sentences from reaching the rendered cards.
  const ultraPageViewWithSynthesis = useMemo((): UltraPageView | null => {
    if (!ultraPageView) return null;
    if (!teachingSynthesis) return ultraPageView;

    const synthDomain: string | null = ultraPageView._debug?.domain ?? null;

    console.log("[TRACE:synthesis]", {
      domain: synthDomain,
      symbolicDensity: ultraPageView._debug?.symbolicDensity ?? "n/a",
      hasSynthesis: true,
      rawBlockCount: ultraPageView.blocks.length,
      synthConceptCount: teachingSynthesis.concepts?.length ?? 0,
    });

    const finalCoreIdea = teachingSynthesis.coreIdea?.length >= 20
      ? teachingSynthesis.coreIdea
      : ultraPageView.coreIdea;

    // Per-concept overlay: synthesis rewrites principle/mechanism/trap/rule/misconception/examHook.
    // Each field is validated before replacing the heuristic value.
    const finalBlocks = teachingSynthesis.concepts?.length
      ? ultraPageView.blocks.map((b, i) => {
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
      : ultraPageView.blocks;

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

    const finalCompression = ultraPageView.compression;

    // Mini-tests: prefer synthesis questions (domain-specific) over heuristic templates
    const finalMiniTest = teachingSynthesis.miniTests?.length
      ? teachingSynthesis.miniTests.slice(0, 5)
      : ultraPageView.miniTest;

    // Wiring verification: if this log shows "Cengage…", "Se C tion…", or cross-domain text,
    // then validSynthField is not catching it. If log is clean but UI shows bad text,
    // JSX is rendering from a different source than finalBlocks — check displayView or visibleBlocks.
    console.log("[TRACE RIGHTPANEL FINAL]", {
      component: "RightPanel.tsx > ultraPageViewWithSynthesis",
      domain: synthDomain,
      rawBlockCount: ultraPageView.blocks.length,
      finalBlockCount: finalBlocks.length,
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

    return {
      ...ultraPageView,
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
      },
    } as UltraPageView & { _synth: Record<string, unknown> };
  }, [ultraPageView, teachingSynthesis]);

  // Typed study model built when synthesis resolves — shared with all downstream features.
  const studyModel = useMemo((): CurrentPageStudyModel | null => {
    const synth = (ultraPageViewWithSynthesis as any)?._synth as Record<string, unknown> | undefined;
    if (!synth || !ultraPageViewWithSynthesis) return null;
    return buildStudyModel(
      ultraPageViewWithSynthesis,
      synth,
      ctx?.documentId ?? "",
      ctx?.pageNumber ?? 0,
    );
  }, [ultraPageViewWithSynthesis, ctx?.documentId, ctx?.pageNumber]);

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
    if (anchors?.length && onSynthHighlightsReady) {
      onSynthHighlightsReady(anchors);
    }
    if (studyModel && onStudyModelReady) {
      console.log("[STUDY_MODEL:ready]", {
        page: studyModel.page,
        thesis: studyModel.pageThesis.slice(0, 60),
        anchors: studyModel.highlightAnchors.length,
        miniTest: studyModel.miniTest.length,
        externalLinks: studyModel.externalStudyLinks.length,
        videoQueries: studyModel.relatedVideoQueries?.length ?? 0,
      });
      onStudyModelReady(studyModel);
    }
  }, [ultraPageViewWithSynthesis, studyModel, pageTruthKey, onSynthHighlightsReady, onStudyModelReady]);

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
    if (!isCurrentPageModel || !pageModel) return null;
    return buildShadowRecall(pageModel, intelligence.storyV3 ?? undefined);
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
  const showUltraView     = isCurrentPageModel && !pageIsNonInstructional && !isStructuralPage && Boolean(ultraPageView);
  const showConceptBlocks = !FORCE_SYNTHESIS_ONLY && isCurrentPageModel && !pageIsNonInstructional && !showUltraView && Boolean(readerPageView);
  const showNarrativePageView = !FORCE_SYNTHESIS_ONLY && isCurrentPageModel && !pageIsNonInstructional && !showUltraView && !showConceptBlocks && Boolean(
    narrativePageView?.narrative.sections.length
  );
  const gate = !showUltraView && !showConceptBlocks;
  const showNarrativeView  = !FORCE_SYNTHESIS_ONLY && isCurrentPageModel && !pageIsNonInstructional && gate && !showNarrativePageView && narrativeBlocks.length > 0;
  const showV3View         = !FORCE_SYNTHESIS_ONLY && isCurrentPageModel && !pageIsNonInstructional && gate && !showNarrativePageView && !showNarrativeView && v3Notes.length > 0;
  const showV2Map          = !FORCE_SYNTHESIS_ONLY && isCurrentPageModel && !pageIsNonInstructional && gate && !showNarrativePageView && !showNarrativeView && !showV3View && v2Notes.length > 0;
  const showV2Operator     = !FORCE_SYNTHESIS_ONLY && isCurrentPageModel && !pageIsNonInstructional && gate && !showNarrativePageView && !showNarrativeView && !showV3View && !showV2Map && Boolean(storyV2?.signalBlock);
  const showGuidedView     = !FORCE_SYNTHESIS_ONLY && isCurrentPageModel && !pageIsNonInstructional && gate && !showNarrativePageView && !showNarrativeView && !showV3View && !showV2Map && !showV2Operator && Boolean(guidedView);

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

  return (
    <>
    {/* PreReadRecallDrawer rendered at root — outside scroll container so fixed overlay works correctly */}
    {shadowRecall && (
      <PreReadRecallDrawer
        open={recallOpen}
        onClose={() => setRecallOpen(false)}
        recall={shadowRecall}
        preReadRecallItems={studyModel?.preReadRecallItems}
      />
    )}
    <aside className="flex h-full min-h-0 w-full flex-col overflow-y-auto border-l border-white/10 bg-[rgb(11,18,34)] break-words whitespace-normal">
      {/* Header */}
      <div className="border-b border-white/10 px-4 py-3">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-emerald-400">Page Notes</div>
        <div className="mt-0.5 text-[11px] text-slate-500">{headerStatus}</div>
      </div>

      <div className="flex flex-col gap-4 p-4 text-white">
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
          <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5 flex flex-col gap-2">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
              {inferUnavailablePageLabel(normResult?.pageKind)}
            </div>
            <div className="text-sm text-slate-500">
              Structured page intelligence is not available on this page.
            </div>
          </div>
        )}

        {isStructuralPage && isCurrentPageModel && (
          <div className="rounded-2xl border border-white/8 bg-[#071224] px-4 py-8 text-center">
            <div className="text-3xl mb-3">{structuralPageIcon(intelligence.pageRole ?? "")}</div>
            <p className="text-[13px] font-semibold text-white/50 mb-1">
              {structuralPageLabel(intelligence.pageRole ?? "")}
            </p>
            <p className="text-[12px] text-white/25 italic">
              Navigate to a content page to generate study notes, highlights, and recall cards.
            </p>
          </div>
        )}

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
                onCrossLinkNavigate={onCrossLinkNavigate}
                bookId={ctx?.documentId}
                pageNumber={ctx?.pageNumber}
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
            {shadowRecall && (
              <button
                onClick={() => setRecallOpen(true)}
                className="w-full rounded-xl border border-violet-500/20 bg-violet-900/10 py-2.5 text-[12px] font-bold text-violet-300 hover:bg-violet-800/20 transition-colors"
              >
                🕶 Pre-Read Recall
              </button>
            )}
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
        {showNarrativePageView && shadowRecall && (
          <button
            onClick={() => setRecallOpen(true)}
            className="w-full rounded-xl border border-violet-500/20 bg-violet-900/10 py-2.5 text-[12px] font-bold text-violet-300 hover:bg-violet-800/20 transition-colors"
          >
            🕶 Pre-Read Recall
          </button>
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
        {showNarrativeView && shadowRecall && (
          <button
            onClick={() => setRecallOpen(true)}
            className="w-full rounded-xl border border-violet-500/20 bg-violet-900/10 py-2.5 text-[12px] font-bold text-violet-300 hover:bg-violet-800/20 transition-colors"
          >
            🕶 Pre-Read Recall
          </button>
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
  onCrossLinkNavigate,
  bookId,
  pageNumber,
}: {
  view: UltraPageView;
  selectedBlockIndex: number;
  onSelectBlock: (i: number) => void;
  onAnchorClick: (text: string) => void;
  synthStatus: import("./useTeachingSynthesis").SynthesisStatus;
  synthErrorMsg: string | null;
  onCrossLinkNavigate?: (page: number) => void;
  bookId?: string;
  pageNumber?: number;
}) {
  const domain = view.domain ?? view._debug?.domain;
  const labels = domainFieldLabels(domain);
  const isMathDomain = domain === "math";
  const isScienceDomain = domain === "science";

  // Filter weak blocks before rendering
  const visibleBlocks = view.blocks.filter((b) => !isWeakBlock(b, domain));
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

  // Raw OpenAI outputs — search queries to be resolved to exact URLs by the backend
  const externalStudyLinksRaw = synth?.externalStudyLinks ?? null;
  const relatedVideoQueries   = synth?.relatedVideoQueries ?? null;

  // Resolved exact YouTube video URLs — fetched from /api/resolveVideoLinks
  // Empty = not yet resolved OR no API key. We show nothing until resolved.
  const [resolvedVideoLinks, setResolvedVideoLinks]     = useState<Array<{ query: string; title: string; url: string; channelTitle: string }>>([]);
  const [videoLinksResolved, setVideoLinksResolved]     = useState(false);

  useEffect(() => {
    setResolvedVideoLinks([]);
    setVideoLinksResolved(false);
    if (!relatedVideoQueries?.length) { setVideoLinksResolved(true); return; }
    const controller = new AbortController();
    fetch("/api/resolveVideoLinks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queries: relatedVideoQueries }),
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((data) => { setResolvedVideoLinks(data.links ?? []); setVideoLinksResolved(true); })
      .catch(() => { setVideoLinksResolved(true); }); // error = resolved with nothing
    return () => controller.abort();
  }, [relatedVideoQueries]);

  // Resolved exact external study links — fetched from /api/resolveExternalLinks (Wikipedia API)
  // Empty = not yet resolved OR nothing could be resolved. We show nothing until resolved.
  const [resolvedExternalLinks, setResolvedExternalLinks] = useState<Array<{ label: string; url: string; title: string; source: string }>>([]);
  const [externalLinksResolved, setExternalLinksResolved] = useState(false);

  useEffect(() => {
    setResolvedExternalLinks([]);
    setExternalLinksResolved(false);
    if (!externalStudyLinksRaw?.length) { setExternalLinksResolved(true); return; }
    const controller = new AbortController();
    fetch("/api/resolveExternalLinks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ links: externalStudyLinksRaw }),
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((data) => { setResolvedExternalLinks(data.resolved ?? []); setExternalLinksResolved(true); })
      .catch(() => { setExternalLinksResolved(true); });
    return () => controller.abort();
  }, [externalStudyLinksRaw]);

  // Interactive Mini Test items — structured questions from OpenAI
  const miniTestItems = synth?.miniTestItems ?? null;

  // [WIRE] _synth — always-on synthesis pipeline state.
  // Filter DevTools: "[WIRE] _synth"
  // DIAGNOSIS GUIDE:
  //   hasSynth=true, fields populated → Study Notes will render ✓
  //   hasSynth=false, _synth has values → validSynthField rejected them (check field content)
  //   _synth=undefined → synthesis hook returned null (API fail, abort, or usable blocks=0)
  //   _synth all-null → all page-level synth fields failed validation gate
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
    <div className="space-y-4">
      {/* Page Thesis — governing concept for this page */}
      <PanelSection title="Page Thesis">
        {/* One-line summary — heuristic compressed anchor. Hidden once synthesis has completed. */}
        {synthStatus !== "success" && !hasSynth && view.oneLineSummary && (
          <div className="mb-2 rounded-lg border border-amber-400/40 bg-amber-400/8 px-4 py-2">
            <p className="text-[16px] font-semibold leading-6 text-amber-200">{view.oneLineSummary}</p>
          </div>
        )}
        {/* Page thesis — quality-gated: must be a complete thought, ≥8 words, no boilerplate */}
        {sanitizeDisplay(displayCoreIdea) && (
          <div className="rounded-xl border border-amber-400/15 bg-[#0b1830] px-4 py-4">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-300">
              🎯 Page Thesis
            </div>
            <p className="text-[14px] leading-6 text-white/90">{displayCoreIdea}</p>
          </div>
        )}
      </PanelSection>

      {/* Understand — the four questions a reader needs before concept detail */}
      {/* Study Notes — 5-section teaching layout (synthesis-driven) */}
      {hasSynth && synth && (
        <PanelSection title="Study Notes">
          <div className="space-y-2">
            {/* WHY THIS MATTERS — synthesis application */}
            {synth.whyItMatters && (
              <div className="rounded-lg border border-blue-400/15 bg-[#0a1828] px-3 py-2.5">
                <div className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-blue-300/70">
                  💡 Why This Matters
                </div>
                <p className="text-[13px] leading-5 text-white/85">{synth.whyItMatters}</p>
              </div>
            )}
            {/* KEY MECHANISM — synthesis mechanism with optional logic chain */}
            {synth.keyMechanism && (
              <div className="rounded-lg border border-emerald-400/15 bg-[#0a1820] px-3 py-2.5">
                <div className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-300/70">
                  ⚙️ Key Mechanism
                </div>
                <p className="text-[13px] leading-5 text-white/85">{synth.keyMechanism}</p>
                {synth.reasoningFlow?.includes("→") && (
                  <p className="mt-1.5 text-[11px] font-mono leading-4 text-emerald-300/50">
                    {synth.reasoningFlow}
                  </p>
                )}
              </div>
            )}
            {/* COMMON CONFUSION — synthesis misconceptionAlert */}
            {synth.commonConfusion && (
              <div className="rounded-lg border border-red-400/15 bg-[#1a0a0a] px-3 py-2.5">
                <div className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-red-300/70">
                  ⚠️ Common Confusion
                </div>
                <p className="text-[13px] leading-5 text-white/85">{synth.commonConfusion}</p>
              </div>
            )}
            {/* QUICK MEMORY — synthesis memoryAnchor */}
            {synth.memoryAnchor && (
              <div className="rounded-lg border border-purple-400/15 bg-[#150b25] px-3 py-2.5">
                <div className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-purple-300/70">
                  🧠 Quick Memory
                </div>
                <p className="text-[13px] leading-5 text-white/85 italic">{synth.memoryAnchor}</p>
              </div>
            )}
          </div>
        </PanelSection>
      )}

      {/* Synthesis loading / error state — shown when hasSynth is false */}
      {!hasSynth && (
        <PanelSection title="Study Notes">
          {synthStatus === "error" ? (
            <div className="rounded-lg border border-rose-400/20 bg-[#1a0808] px-3 py-3 space-y-1">
              <p className="text-[12px] font-medium text-rose-300/70">Study synthesis failed — check console/server logs</p>
              <p className="text-[11px] font-mono text-white/30">{synthErrorMsg ?? "Unknown error"}</p>
              <p className="text-[10px] text-white/20 italic">Filter DevTools: [SYNTH:error] · Server: [SYNTH:api:]</p>
            </div>
          ) : synthStatus === "success" ? (
            <div className="rounded-lg border border-amber-400/15 bg-[#1a1208] px-3 py-3 space-y-1">
              <p className="text-[12px] font-medium text-amber-300/60">Synthesis completed — all fields were filtered</p>
              <p className="text-[10px] text-white/25 italic">Check [TRACE:synth-page-fields] in console for REJECTED field values.</p>
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
            <div className="mb-3 text-[16px] font-semibold text-white">
              {selectedBlock.ordinal}️⃣ {selectedBlock.title}
            </div>
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

      {/* External Study Links — exact Wikipedia/resource URLs resolved by backend */}
      {externalLinksResolved && resolvedExternalLinks.length > 0 ? (
        <PanelSection title="External Study Links">
          <ul className="space-y-1">
            {resolvedExternalLinks.map((link, i) => (
              <li key={i}>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-2 text-[13px] text-violet-300 hover:text-violet-100 underline decoration-dotted"
                >
                  <span className="mt-0.5 shrink-0">{link.source === "wikipedia" ? "📖" : "🔗"}</span>
                  <span className="flex flex-col min-w-0">
                    <span>{link.label}</span>
                    <span className="text-[10px] text-slate-500 truncate">{link.title}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </PanelSection>
      ) : null}

      {/* Related Teaching Videos — exact YouTube URLs resolved by backend (no search fallbacks) */}
      {videoLinksResolved && resolvedVideoLinks.length > 0 ? (
        <PanelSection title="📺 Related Teaching Videos">
          <ul className="space-y-2">
            {resolvedVideoLinks.map((link, i) => (
              <li key={i}>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-2 text-[13px] text-red-300 hover:text-red-100 underline decoration-dotted"
                >
                  <span className="mt-0.5 shrink-0">📺</span>
                  <span className="flex flex-col min-w-0">
                    <span>{link.title}</span>
                    <span className="text-[10px] text-slate-500">{link.channelTitle}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
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
            `miniTest: ${view.miniTest.length} | extLinks: ${externalStudyLinksRaw?.length ?? 0}`,
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
              Mini Test
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
}: {
  items: MiniTestItemData[];
  bookId: string;
  pageNumber: number;
  title?: string;
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
          type: "definition" as CardType,
          front: item.question,
          back: item.correctAnswer,
          hint: item.explanation || undefined,
          reviewCount: 0,
          isMissed: true,
        };
        return [c];
      });

    if (!missedCards.length) return;

    saveRecallSet({
      id: `rs-missed-${bookId}-p${pageNumber}-${Date.now()}`,
      bookId,
      pageNumber,
      subject: inferSubject(bookId),
      topic: `Mini Test Missed — Page ${pageNumber}`,
      cards: missedCards,
      createdAt: Date.now(),
    });
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
// Shadow recall — page-grounded recall prompts + reveal
// ---------------------------------------------------------------------------

function PreReadRecallDrawer({
  open,
  onClose,
  recall,
  preReadRecallItems,
}: {
  open: boolean;
  onClose: () => void;
  recall: ShadowRecallModel;
  preReadRecallItems?: Array<{ question: string; type: string; options: string[] | null; correctAnswer: string; explanation: string }> | null;
}) {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 z-50 w-[360px] bg-[#0b1020] border-l border-white/10 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
          <span className="text-[11px] font-bold uppercase tracking-widest text-violet-300">
            🕶 Pre-Read Recall · {recall.pageLabel}
          </span>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-300 text-xl leading-none"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {preReadRecallItems?.length ? (
            <MiniTestPanel
              items={preReadRecallItems}
              bookId=""
              pageNumber={0}
              title="Pre-Read Recall"
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
              <div className="text-2xl animate-pulse">🕶</div>
              <p className="text-[12px] text-slate-400">Generating pre-read questions…</p>
              <p className="text-[11px] text-slate-600">Questions appear here after synthesis completes.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function ShadowRecallSection({
  recall,
  open,
  onToggle,
  miniTestItems,
}: {
  recall: ShadowRecallModel;
  open: boolean;
  onToggle: () => void;
  miniTestItems?: Array<{ question: string; type: string; options: string[] | null; correctAnswer: string; explanation: string }> | null;
}) {
  return (
    <div className="rounded-2xl border border-slate-600/30 bg-slate-800/30">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-[9px] font-semibold uppercase tracking-widest text-slate-400">
          🕶 Pre-Read Recall · {recall.pageLabel}
        </span>
        <span className="text-[10px] text-slate-500">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="space-y-3 px-4 pb-4">
          {/* OpenAI structured questions — preferred; shown first */}
          {miniTestItems?.length ? (
            <MiniTestPanel
              items={miniTestItems}
              bookId=""
              pageNumber={0}
            />
          ) : (
            /* Heuristic fallback prompts when synthesis not ready */
            <div className="space-y-2">
              {Object.entries(recall.prompts).map(([key, prompt]) => {
                const revealKey = `${key}Truth` as keyof typeof recall.reveal;
                const answer = typeof recall.reveal[revealKey] === "string"
                  ? (recall.reveal[revealKey] as string)
                  : null;
                return (
                  <RecallItem key={key} prompt={prompt} answer={answer ?? ""} />
                );
              })}
            </div>
          )}
          {/* Fast recall cues */}
          {recall.reveal.fastRecallCues.length > 0 && (
            <div className="border-t border-white/5 pt-2">
              <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-widest text-slate-500">
                Quick recall cues
              </div>
              <ul className="space-y-1">
                {recall.reveal.fastRecallCues.map((cue, i) => (
                  <li key={i} className="text-xs text-slate-400">· {cue}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
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
  const synthReady = studyModel !== undefined ? studyModel !== null : true;

  function handleGenerate() {
    console.log("[NOTE:click]", { page: pageNumber, synthReady, hasStudyModel: !!studyModel });
    try {
      const topic = (view.title || `Page ${pageNumber}`).replace(/^ULTRA\s*[–—-]\s*/i, "").trim();
      console.log("[NOTE:studyModel-present]", {
        hasStudyModel: !!studyModel,
        pageThesis: studyModel?.pageThesis?.slice(0, 60) ?? null,
        studyNotesPresent: !!studyModel?.studyNotes,
        studyNotesKeys: studyModel?.studyNotes
          ? Object.keys(studyModel.studyNotes).filter(k => !!(studyModel.studyNotes as any)[k])
          : [],
        conceptBlockCount: studyModel?.conceptBlocks?.length ?? 0,
        miniTestCount: studyModel?.miniTest?.length ?? 0,
        externalLinkCount: studyModel?.externalStudyLinks?.length ?? 0,
        videoQueryCount: studyModel?.relatedVideoQueries?.length ?? 0,
        anchorCount: studyModel?.highlightAnchors?.length ?? 0,
      });
      // OpenAI is the sole source of truth — studyModel must be present (button disabled otherwise).
      const coreIdea = studyModel?.pageThesis ?? "";
      const concepts = (studyModel?.conceptBlocks ?? []).map((b, i) => ({
        ordinal:        i + 1,
        title:          b.title,
        pattern:        b.pattern,
        surgicalReason: b.mechanism ?? "",
        trap:           b.trap ?? "",
        rule:           b.rule ?? "",
      }));
      // Build professorNotes from studyModel.studyNotes — the authoritative source
      const sn = studyModel?.studyNotes;
      const professorNotes = sn ? {
        whyItMatters:    sn.whyThisMatters  ?? undefined,
        keyMechanism:    sn.keyMechanism    ?? undefined,
        commonConfusion: sn.commonConfusion ?? undefined,
        memoryAnchor:    sn.quickMemory     ?? undefined,
        reasoningFlow:   sn.reasoningFlow   ?? undefined,
        examSignal:      sn.examSignal      ?? undefined,
      } : undefined;
      console.log("[NOTE:payload]", {
        topic,
        coreIdea: coreIdea.slice(0, 80),
        conceptCount: concepts.length,
        hasProfessorNotes: !!professorNotes,
        professorNotesKeys: professorNotes ? Object.keys(professorNotes).filter(k => !!(professorNotes as any)[k]) : [],
        miniTestCount: studyModel?.miniTest?.length ?? 0,
        externalLinkCount: studyModel?.externalStudyLinks?.length ?? 0,
        videoCount: studyModel?.relatedVideoQueries?.length ?? 0,
        anchorCount: studyModel?.highlightAnchors?.length ?? 0,
      });
      const note = buildUltraNote(
        bookId,
        pageNumber,
        topic,
        coreIdea,
        concepts,
        bookTitle,
        professorNotes,
        studyModel?.pageThesis ?? undefined,
        studyModel?.miniTest?.length ? studyModel.miniTest : undefined,
        undefined, // crossLinks — legacy, no longer populated
        studyModel?.externalStudyLinks?.length ? studyModel.externalStudyLinks : undefined,
        studyModel?.relatedVideoQueries?.length ? studyModel.relatedVideoQueries : undefined,
        studyModel?.highlightAnchors?.length ? studyModel.highlightAnchors : undefined,
      );
      saveUltraNote(note);
      console.log("[NOTE:saved-id]", { id: note.id, page: note.pageNumber, topic: note.topic });
      setSaved(true);
      onNoteSaved?.();
      setTimeout(() => setSaved(false), 2200);
    } catch (err: any) {
      console.error("[NOTE:error]", err?.message ?? String(err), err);
    }
  }

  return (
    <button
      type="button"
      onClick={synthReady ? handleGenerate : undefined}
      disabled={!synthReady}
      style={{
        width: "100%",
        padding: "10px 0",
        borderRadius: 10,
        border: saved ? "1px solid rgba(52,211,153,0.5)" : !synthReady ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(245,200,66,0.25)",
        background: saved ? "rgba(16,185,129,0.12)" : !synthReady ? "rgba(255,255,255,0.03)" : "rgba(245,200,66,0.07)",
        color: saved ? "#6ee7b7" : !synthReady ? "rgba(255,255,255,0.3)" : "#fcd34d",
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "0.06em",
        cursor: synthReady ? "pointer" : "not-allowed",
        transition: "all 0.18s",
      }}
    >
      {saved ? "✓ Note saved to NoteLab" : !synthReady ? "⏳ Synthesis loading…" : "⚡ Generate Ultra Note"}
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
  const [noSynth, setNoSynth] = useState(false);

  function handleGenerate() {
    console.log("[RECALL:click]", { page: pageNumber, hasStudyModel: !!studyModel });
    if (!studyModel) {
      console.warn("[RECALL:studyModel-present]", { hasStudyModel: false });
      setNoSynth(true);
      setTimeout(() => setNoSynth(false), 2800);
      return;
    }
    try {
      console.log("[RECALL:studyModel-present]", {
        hasStudyModel: true,
        pageThesis: studyModel.pageThesis?.slice(0, 60),
        studyNotesKeys: Object.keys(studyModel.studyNotes).filter(k => !!(studyModel.studyNotes as any)[k]),
        conceptBlockCount: studyModel.conceptBlocks?.length ?? 0,
        miniTestCount: studyModel.miniTest?.length ?? 0,
        miniTestItemCount: studyModel.miniTestItems?.length ?? 0,
      });
      const set = buildRecallSetFromView(view, bookId, pageNumber, {
        bookTitle,
        sourceLabel: "right-panel",
        studyModel,
      });
      console.log("[RECALL:payload]", {
        setId: set.id,
        topic: set.topic,
        totalCards: set.cards.length,
        studyNoteCards: set.cards.filter((c) => c.id.startsWith("sn-")).length,
        miniTestCards: set.cards.filter((c) => c.id.startsWith("synth-q")).length,
        conceptCards: set.cards.filter((c) => /^b\d/.test(c.id)).length,
        cardIds: set.cards.map((c) => c.id),
      });
      saveRecallSet(set);
      console.log("[RECALL:saved-id]", { id: set.id, page: set.pageNumber, cardCount: set.cards.length });
      setSaved(true);
      onStudySetGenerated?.(set.id);
      setTimeout(() => setSaved(false), 2200);
    } catch (err: any) {
      console.error("[RECALL:error]", err?.message ?? String(err), err);
    }
  }

  return (
    <button
      type="button"
      onClick={handleGenerate}
      style={{
        flex: 1,
        padding: "10px 0",
        borderRadius: 10,
        border: saved ? "1px solid rgba(99,102,241,0.5)" : noSynth ? "1px solid rgba(239,68,68,0.4)" : "1px solid rgba(99,102,241,0.25)",
        background: saved ? "rgba(99,102,241,0.12)" : noSynth ? "rgba(239,68,68,0.08)" : "rgba(99,102,241,0.07)",
        color: saved ? "#a5b4fc" : noSynth ? "#fca5a5" : "#818cf8",
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "0.06em",
        cursor: "pointer",
        transition: "all 0.18s",
      }}
    >
      {saved ? "✓ Saved to Recall Lab" : noSynth ? "⚠ OpenAI synthesis not ready yet" : "🎯 Generate Study Set"}
    </button>
  );
}
