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
import { buildShadowRecall, type ShadowRecallModel } from "@/lib/insights/buildShadowRecall";
import { buildNarrativePageView, type NarrativeBuildResult } from "@/lib/insights/buildNarrativePageView";
import type { NarrativeSection } from "@/lib/insights/materializeNarrativeSupport";
import { extractConceptBlocks } from "@/lib/reader/extractConceptBlocks";
import type { ConceptBlock, ReaderPageView } from "@/lib/reader/types";
import { buildUltraPageView, type UltraPageView, type UltraConceptBlock } from "@/lib/insights/buildUltraPageView";
import type { SRIModel, SRISignal, ReadingDepth } from "@/lib/insights/buildSRIModel";
import type { RenderGuidedReadingPathResult } from "@/lib/highlights/renderGuidedReadingPath";
import { buildUltraNote, saveUltraNote } from "@/lib/notelab/ultraNoteStore";
import { buildRecallSetFromView, saveRecallSet } from "@/lib/recalllab/recallStore";
import { isWeakBlock, isWeakField, isSimilarText } from "@/lib/insights/renderQualityGate";
import { useTeachingSynthesis } from "./useTeachingSynthesis";

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
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROLE: GuidedRole = "operator";
const DEPTH: GuidedDepth = "standard";
const MODE: GuidedMode = "insight";

const LOADING_PHASES = [
  "Reading current page…",
  "Analyzing paragraph roles…",
  "Mapping important lines…",
  "Building operator view…",
];

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
  const teachingSynthesis = useTeachingSynthesis({
    pageTruthKey,
    pageObjective: ultraPageView?.teachingStatement,
    domain: (ultraPageView?._debug?.domain) ?? null,
    blocks: ultraPageView?.blocks ?? [],
    enabled: isCurrentPageModel && !!ultraPageView,
  });

  // Apply teaching synthesis over heuristic view without re-running the pipeline.
  // Synthesis is the professor layer — it supersedes heuristic sentence extraction.
  const ultraPageViewWithSynthesis = useMemo((): UltraPageView | null => {
    if (!ultraPageView) return null;
    if (!teachingSynthesis) return ultraPageView;

    const finalCoreIdea = teachingSynthesis.coreIdea?.length >= 20
      ? teachingSynthesis.coreIdea
      : ultraPageView.coreIdea;

    // Per-concept overlay: synthesis rewrites principle/mechanism/trap/rule/misconception/examHook
    const finalBlocks = teachingSynthesis.concepts?.length
      ? ultraPageView.blocks.map((b, i) => {
          const sc = teachingSynthesis.concepts[i];
          if (!sc) return b;
          return {
            ...b,
            pattern:        sc.principle?.trim()  || b.pattern,
            surgicalReason: sc.mechanism?.trim()  || b.surgicalReason,
            trap:           sc.trap?.trim()       ?? b.trap,
            rule:           sc.rule?.trim()       || b.rule,
            misconception:  sc.misconception?.trim() || undefined,
            examHook:       sc.examHook?.trim()      || undefined,
          };
        })
      : ultraPageView.blocks;

    // Page-level synthesis fields — prepend to compression so professor reasoning is visible
    const synthesisLines: string[] = [];
    if (teachingSynthesis.mechanism?.trim())    synthesisLines.push(`How: ${teachingSynthesis.mechanism.trim()}`);
    if (teachingSynthesis.rule?.trim())         synthesisLines.push(`Rule: ${teachingSynthesis.rule.trim()}`);
    if (teachingSynthesis.trap?.trim())         synthesisLines.push(`Trap: ${teachingSynthesis.trap.trim()}`);
    if (teachingSynthesis.application?.trim())  synthesisLines.push(`Apply: ${teachingSynthesis.application.trim()}`);
    if (teachingSynthesis.reasoningFlow?.trim()) synthesisLines.push(`Flow: ${teachingSynthesis.reasoningFlow.trim()}`);
    if (teachingSynthesis.misconceptionAlert?.trim()) synthesisLines.push(`⚠️ Confuse: ${teachingSynthesis.misconceptionAlert.trim()}`);

    const finalCompression = synthesisLines.length
      ? [...synthesisLines, ...ultraPageView.compression].slice(0, 5)
      : ultraPageView.compression;

    // Mini-tests: prefer synthesis questions (domain-specific) over heuristic templates
    const finalMiniTest = teachingSynthesis.miniTests?.length
      ? teachingSynthesis.miniTests.slice(0, 5)
      : ultraPageView.miniTest;

    return {
      ...ultraPageView,
      coreIdea: finalCoreIdea,
      blocks: finalBlocks,
      compression: finalCompression,
      miniTest: finalMiniTest,
      crossLinkHints: teachingSynthesis.crossLinkHints?.length
        ? teachingSynthesis.crossLinkHints
        : ultraPageView.crossLinkHints,
    };
  }, [ultraPageView, teachingSynthesis]);

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

  // ULTRA = primary view; concept blocks = secondary; narrative/story = fallbacks
  // All views gated on !pageIsNonInstructional so no fake output on suppressed pages
  const showUltraView     = isCurrentPageModel && !pageIsNonInstructional && Boolean(ultraPageView);
  const showConceptBlocks = isCurrentPageModel && !pageIsNonInstructional && !showUltraView && Boolean(readerPageView);
  const showNarrativePageView = isCurrentPageModel && !pageIsNonInstructional && !showUltraView && !showConceptBlocks && Boolean(
    narrativePageView?.narrative.sections.length
  );
  const gate = !showUltraView && !showConceptBlocks;
  const showNarrativeView  = isCurrentPageModel && !pageIsNonInstructional && gate && !showNarrativePageView && narrativeBlocks.length > 0;
  const showV3View         = isCurrentPageModel && !pageIsNonInstructional && gate && !showNarrativePageView && !showNarrativeView && v3Notes.length > 0;
  const showV2Map          = isCurrentPageModel && !pageIsNonInstructional && gate && !showNarrativePageView && !showNarrativeView && !showV3View && v2Notes.length > 0;
  const showV2Operator     = isCurrentPageModel && !pageIsNonInstructional && gate && !showNarrativePageView && !showNarrativeView && !showV3View && !showV2Map && Boolean(storyV2?.signalBlock);
  const showGuidedView     = isCurrentPageModel && !pageIsNonInstructional && gate && !showNarrativePageView && !showNarrativeView && !showV3View && !showV2Map && !showV2Operator && Boolean(guidedView);

  // Header status label
  const headerStatus = intelligence.status === "loading"
    ? LOADING_PHASES[loadingPhase]
    : pageIsNonInstructional
    ? "Not available on this page"
    : (showNarrativePageView || showNarrativeView || showV3View) && v3Brief
    ? v3Brief.pagePurpose
    : "Current page · ready";

  // [TRACE] temporary rendering decision instrumentation
  if (process.env.NODE_ENV !== "production") {
    console.log("[TRACE RightPanel]", {
      status: intelligence.status,
      isCurrentPageModel,
      pageIsNonInstructional,
      pageKind: normResult?.pageKind,
      shouldRenderFullPanel: normResult?.shouldRenderFullPanel,
      showUltraView,
      showConceptBlocks,
      showNarrativePageView,
      showV3View,
      showV2Map,
      headerStatus,
    });
  }

  return (
    <aside className="flex h-full min-h-0 w-full flex-col overflow-y-auto border-l border-white/10 bg-[rgb(11,18,34)] break-words whitespace-normal">
      {/* Header */}
      <div className="border-b border-white/10 px-4 py-3">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-emerald-400">Page Notes</div>
        <div className="mt-0.5 text-[11px] text-slate-500">{headerStatus}</div>
      </div>

      <div className="flex flex-col gap-4 p-4 text-white">
        {/* ── DEBUG CARD (temporary — remove after diagnosis) ─────────── */}
        {process.env.NODE_ENV !== "production" && (
          <div style={{
            fontSize: 10,
            fontFamily: "monospace",
            background: "rgba(0,255,100,0.06)",
            border: "1px solid rgba(0,255,100,0.18)",
            borderRadius: 6,
            padding: "6px 8px",
            color: "#86efac",
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
          }}>
            {[
              `isCurrentPage: ${isCurrentPageModel}`,
              `pageTruthKey: ${pageTruthKey}`,
              `viewSource: ${showUltraView ? "ULTRA" : showConceptBlocks ? "ConceptBlocks" : showNarrativePageView ? "NarrativePage" : showNarrativeView ? "Narrative" : showV3View ? "V3" : showV2Map ? "V2Map" : showV2Operator ? "V2Op" : showGuidedView ? "Guided" : "none"}`,
              `blockCount: ${displayView?.blocks.length ?? 0}`,
              `miniTestCount: ${displayView?.miniTest.length ?? 0}`,
              `compressionCount: ${displayView?.compression.length ?? 0}`,
              `pageKind: ${displayView?._debug?.pageKind ?? "—"}`,
              `domain: ${displayView?._debug?.domain ?? "—"}`,
              `shouldRender: ${displayView?._debug?.shouldRenderFullPanel ?? "—"}`,
              `summaryLen: ${displayView?._debug?.pageSummaryLength ?? "—"}`,
              `coreIdeaSource: ${displayView?._debug?.coreIdeaSource ?? "—"}`,
              `concepts: ${displayView?._debug?.conceptCandidates.map((c) => `${c.title}(${c.score})`).join(", ") ?? "—"}`,
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

        {/* Loading / gating state */}
        {!pageIsNonInstructional && renderTruthFallback(pageTruth?.reason || "loading", intelligence.status, !isCurrentPageModel, loadingPhase)}

        {intelligence.status === "error" && (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-900/20 p-4 text-sm text-rose-100">
            Could not build reading path for this page.
          </div>
        )}

        {/* ── PRIMARY: ULTRA View ───────────────────────────────────────── */}
        {showUltraView && displayView && (
          <>
            <UltraView
              view={displayView}
              selectedBlockIndex={selectedBlockIndex}
              onSelectBlock={setSelectedBlockIndex}
              onAnchorClick={(text) => onEvidenceClick?.(text, undefined)}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <GenerateNoteButton
                view={displayView}
                bookId={ctx?.documentId ?? ""}
                bookTitle={ctx?.documentTitle}
                pageNumber={ctx?.pageNumber ?? 0}
                onNoteSaved={onNoteSaved}
              />
              <GenerateStudySetButton
                view={displayView}
                bookId={ctx?.documentId ?? ""}
                bookTitle={ctx?.documentTitle}
                pageNumber={ctx?.pageNumber ?? 0}
                onStudySetGenerated={onStudySetGenerated}
              />
            </div>
          </>
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
          <ShadowRecallSection
            recall={shadowRecall}
            open={recallOpen}
            onToggle={() => setRecallOpen((o) => !o)}
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
        {showNarrativeView && shadowRecall && (
          <ShadowRecallSection
            recall={shadowRecall}
            open={recallOpen}
            onToggle={() => setRecallOpen((o) => !o)}
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
  );
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
}: {
  view: UltraPageView;
  selectedBlockIndex: number;
  onSelectBlock: (i: number) => void;
  onAnchorClick: (text: string) => void;
}) {
  const domain = view.domain ?? view._debug?.domain;
  const labels = domainFieldLabels(domain);
  const isMathDomain = domain === "math";
  const isScienceDomain = domain === "science";

  // Filter weak blocks before rendering
  const visibleBlocks = view.blocks.filter((b) => !isWeakBlock(b, domain));
  const effectiveIndex = Math.min(selectedBlockIndex, Math.max(0, visibleBlocks.length - 1));
  const selectedBlock = visibleBlocks[effectiveIndex] ?? null;

  // Prefer teachingStatement when it's distinct from coreIdea (it's more reliable);
  // if they're near-duplicates, teachingStatement already says the same thing so use it.
  const rawCoreIdea = view.pageThesis ?? view.coreIdea;
  const displayCoreIdea =
    view.teachingStatement && !isSimilarText(rawCoreIdea ?? "", view.teachingStatement)
      ? rawCoreIdea
      : (view.teachingStatement ?? rawCoreIdea);

  return (
    <div className="space-y-4">
      {/* ULTRA header + Page Thesis */}
      <PanelSection title={view.title}>
        <div className="mb-3 text-[12px] italic text-white/55">{view.subtitle}</div>
        {/* One-line summary — dyslexia-safe rapid anchor */}
        {view.oneLineSummary && (
          <div className="mb-2 rounded-lg border border-amber-400/40 bg-amber-400/8 px-4 py-2">
            <p className="text-[16px] font-semibold leading-6 text-amber-200">{view.oneLineSummary}</p>
          </div>
        )}
        {/* Page thesis — deeper understanding target */}
        <div className="rounded-xl border border-amber-400/15 bg-[#0b1830] px-4 py-4">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-300">
            🎯 Page Thesis
          </div>
          <p className="text-[14px] leading-6 text-white/90">{displayCoreIdea}</p>
        </div>
      </PanelSection>

      {/* Concept blocks — tab selector + detail */}
      <PanelSection title="Concept Blocks">
        {visibleBlocks.length === 0 ? (
          /* Fallback: no strong concept blocks — show SRI signals as page summary */
          <div className="rounded-xl border border-white/8 bg-[#0a1428] px-4 py-4 space-y-3">
            <p className="text-[12px] italic text-white/40">No concept blocks found for this page.</p>
            {view.sriModel && view.sriModel.signals
              .filter((s) => !s.isBackground)
              .slice(0, 3)
              .map((sig, i) => (
                <div key={i} className="text-[13px] leading-6 text-white/75">
                  <span className="mr-1.5">{sig.icon}</span>
                  <span className="font-semibold mr-1" style={{ color: sig.color }}>{sig.label}:</span>
                  {sig.summary}
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
              onClick={() => { onSelectBlock(index); onAnchorClick(block.pattern); }}
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

        {selectedBlock && (
          <div className="rounded-2xl border border-white/10 bg-[#0a1428] px-4 py-4">
            <div className="mb-3 text-[16px] font-semibold text-white">
              {selectedBlock.ordinal}️⃣ {selectedBlock.title}
            </div>
            <div className="space-y-4">
              {/* FIELD 1: Concept/Definition/Finding — primary signal, highest visual weight */}
              {!isWeakField(selectedBlock.pattern) && (
                <div className="rounded-lg border border-white/8 bg-white/3 px-3 py-3">
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: labels.patternColor }}>{labels.pattern}</div>
                  <p className="text-[15px] font-medium leading-6 text-white">{selectedBlock.pattern}</p>
                </div>
              )}

              {/* MATH SCHEMA: Given → Transformation → Result → Decision → Trap → Procedure */}
              {isMathDomain ? (
                <>
                  {!isWeakField(selectedBlock.given ?? selectedBlock.surgicalReason) && (
                    <div>
                      <div className="mb-1 text-[12px] font-semibold uppercase tracking-[0.14em]" style={{ color: labels.reasonColor }}>{labels.reason}</div>
                      <p className="text-[14px] leading-6 text-white/90">{selectedBlock.given ?? selectedBlock.surgicalReason}</p>
                    </div>
                  )}
                  {selectedBlock.transformation && !isWeakField(selectedBlock.transformation) && (
                    <div>
                      <div className="mb-1 text-[12px] font-semibold uppercase tracking-[0.14em]" style={{ color: "#60a5fa" }}>⟶ Transformation</div>
                      <p className="text-[14px] leading-6 text-white/95 font-mono">{selectedBlock.transformation}</p>
                    </div>
                  )}
                  {!isWeakField(selectedBlock.rule) && (
                    <div>
                      <div className="mb-1 text-[12px] font-semibold uppercase tracking-[0.14em]" style={{ color: labels.ruleColor }}>{labels.rule}</div>
                      <p className="text-[14px] leading-6 text-white/95">{selectedBlock.rule}</p>
                    </div>
                  )}
                  {selectedBlock.decision && !isWeakField(selectedBlock.decision) && (
                    <div>
                      <div className="mb-1 text-[12px] font-semibold uppercase tracking-[0.14em]" style={{ color: "#a78bfa" }}>✓ Decision</div>
                      <p className="text-[14px] leading-6 text-violet-200/90">{selectedBlock.decision}</p>
                    </div>
                  )}
                  {!isWeakField(selectedBlock.trap) && (
                    <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2">
                      <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: labels.trapColor }}>{labels.trap}</div>
                      <p className="text-[13px] leading-5 text-rose-200/90">{selectedBlock.trap}</p>
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
                /* SCIENCE SCHEMA: Mechanism → Example → Confusion Point → Outcome → Memory Hook */
                <>
                  {!isWeakField(selectedBlock.surgicalReason) && (
                    <div>
                      <div className="mb-1 text-[12px] font-semibold uppercase tracking-[0.14em]" style={{ color: labels.reasonColor }}>{labels.reason}</div>
                      <p className="text-[14px] leading-6 text-white/90">{selectedBlock.surgicalReason}</p>
                    </div>
                  )}
                  {selectedBlock.example && !isWeakField(selectedBlock.example) && (
                    <div>
                      <div className="mb-1 text-[12px] font-semibold uppercase tracking-[0.14em]" style={{ color: "#86efac" }}>🔍 Example</div>
                      <p className="text-[14px] leading-6 text-green-200/90">{selectedBlock.example}</p>
                    </div>
                  )}
                  {!isWeakField(selectedBlock.trap) && (
                    <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2">
                      <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: labels.trapColor }}>{labels.trap}</div>
                      <p className="text-[13px] leading-5 text-rose-200/90">{selectedBlock.trap}</p>
                    </div>
                  )}
                  {!isWeakField(selectedBlock.rule) && (
                    <div>
                      <div className="mb-1 text-[12px] font-semibold uppercase tracking-[0.14em]" style={{ color: labels.ruleColor }}>{labels.rule}</div>
                      <p className="text-[14px] leading-6 text-white/95">{selectedBlock.rule}</p>
                    </div>
                  )}
                  {selectedBlock.memoryHook && !isWeakField(selectedBlock.memoryHook) && (
                    <div>
                      <div className="mb-1 text-[12px] font-semibold uppercase tracking-[0.14em]" style={{ color: "#d8b4fe" }}>💡 Memory Hook</div>
                      <p className="text-[13px] leading-6 text-purple-200/85">{selectedBlock.memoryHook}</p>
                    </div>
                  )}
                </>
              ) : (
                /* DEFAULT / CLINICAL SCHEMA: Reason → Trap → Rule */
                <>
                  {!isWeakField(selectedBlock.surgicalReason) && (
                    <div>
                      <div className="mb-1 text-[12px] font-semibold uppercase tracking-[0.14em]" style={{ color: labels.reasonColor }}>{labels.reason}</div>
                      <p className="text-[14px] leading-6 text-white/90">{selectedBlock.surgicalReason}</p>
                    </div>
                  )}
                  {!isWeakField(selectedBlock.trap) && (
                    <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2">
                      <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: labels.trapColor }}>{labels.trap}</div>
                      <p className="text-[13px] leading-5 text-rose-200/90">{selectedBlock.trap}</p>
                    </div>
                  )}
                  {!isWeakField(selectedBlock.rule) && (
                    <div>
                      <div className="mb-1 text-[12px] font-semibold uppercase tracking-[0.14em]" style={{ color: labels.ruleColor }}>{labels.rule}</div>
                      <p className="text-[14px] leading-6 text-white/95">{selectedBlock.rule}</p>
                    </div>
                  )}
                </>
              )}

              {/* Shared optional fields — all domains */}
              {selectedBlock.misconception && !isWeakField(selectedBlock.misconception) && (
                <div>
                  <div className="mb-1 text-[12px] font-semibold uppercase tracking-[0.14em] text-rose-400">⚠️ Misconception</div>
                  <p className="text-[13px] leading-6 text-rose-200/85">{selectedBlock.misconception}</p>
                </div>
              )}
              {selectedBlock.examHook && !isWeakField(selectedBlock.examHook) && (
                <div>
                  <div className="mb-1 text-[12px] font-semibold uppercase tracking-[0.14em] text-violet-400">🎓 Exam Hook</div>
                  <p className="text-[13px] leading-6 text-violet-200/85">{selectedBlock.examHook}</p>
                </div>
              )}
              {/* procedureSteps for non-math domains */}
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
              {!isWeakField(selectedBlock.importance) && (
                <div>
                  <div className="mb-1 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#c7f59b]">🎯 Importance</div>
                  <p className="text-[14px] leading-6 text-white/90">{selectedBlock.importance}</p>
                </div>
              )}
            </div>
          </div>
        )}
        </>
        )}
      </PanelSection>

      {/* Mini Test */}
      {view.miniTest.length > 0 && (
        <PanelSection title={`Mini Test · Page ${visibleBlocks.length > 0 ? String(visibleBlocks.length) : "—"}`}>
          <ul className="space-y-2">
            {view.miniTest.map((q, i) => <BulletLine key={i}>{q}</BulletLine>)}
          </ul>
        </PanelSection>
      )}

      {/* STR Compression */}
      {view.compression.length > 0 && (
        <PanelSection title="STR Compression">
          <ul className="space-y-2">
            {view.compression.map((line, i) => <BulletLine key={i}>{line}</BulletLine>)}
          </ul>
        </PanelSection>
      )}

      {/* SRI Reading Map */}
      {view.sriModel && view.sriModel.signals.length > 0 && (
        <ReadingMap model={view.sriModel} domain={view.domain ?? view._debug?.domain} />
      )}

      {/* Cross-Link Hints */}
      {view.crossLinkHints && view.crossLinkHints.length > 0 && (
        <PanelSection title="Cross-Links">
          <ul className="space-y-1">
            {view.crossLinkHints.map((hint, i) => (
              <li key={i} className="flex items-start gap-2 text-[13px] text-sky-300/80">
                <span className="mt-0.5 shrink-0 text-sky-500">↗</span>
                <span>{hint}</span>
              </li>
            ))}
          </ul>
        </PanelSection>
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
    return (
      <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <span className="text-sm text-slate-300">{LOADING_PHASES[loadingPhase]}</span>
        </div>
      </div>
    );
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

function ShadowRecallSection({
  recall,
  open,
  onToggle,
}: {
  recall: ShadowRecallModel;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-600/30 bg-slate-800/30">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-[9px] font-semibold uppercase tracking-widest text-slate-400">
          Self-test · {recall.pageLabel}
        </span>
        <span className="text-[10px] text-slate-500">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="space-y-3 px-4 pb-4">
          {/* Prompts */}
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
          {/* Fast recall cues */}
          {recall.reveal.fastRecallCues.length > 0 && (
            <div className="border-t border-white/5 pt-2">
              <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-widest text-slate-500">
                Fast recall cues
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

function GenerateNoteButton({
  view,
  bookId,
  bookTitle,
  pageNumber,
  onNoteSaved,
}: {
  view: UltraPageView;
  bookId: string;
  bookTitle?: string;
  pageNumber: number;
  onNoteSaved?: () => void;
}) {
  const [saved, setSaved] = useState(false);

  function handleGenerate() {
    // Strip the "ULTRA – " display prefix so the stored topic is clean
    const topic = (view.title || `Page ${pageNumber}`).replace(/^ULTRA\s*[–—-]\s*/i, "").trim();
    const conceptTitles = view.blocks.map((b) => b.title);
    console.log("[TRACE NOTE_WIRING]", {
      bookId,
      bookTitle,
      currentPage: pageNumber,
      notePage: pageNumber,
      topic,
      coreIdea: view.coreIdea?.slice(0, 80),
      conceptTitles,
      source: "rightPanelGenerateUltraNote",
    });
    const note = buildUltraNote(
      bookId,
      pageNumber,
      topic,
      view.coreIdea || "",
      view.blocks.map((b) => ({
        ordinal: b.ordinal,
        title: b.title,
        pattern: b.pattern,
        surgicalReason: b.surgicalReason,
        trap: b.trap,
        rule: b.rule,
      })),
      bookTitle
    );
    saveUltraNote(note);
    setSaved(true);
    onNoteSaved?.();
    setTimeout(() => setSaved(false), 2200);
  }

  return (
    <button
      type="button"
      onClick={handleGenerate}
      style={{
        width: "100%",
        padding: "10px 0",
        borderRadius: 10,
        border: saved ? "1px solid rgba(52,211,153,0.5)" : "1px solid rgba(245,200,66,0.25)",
        background: saved ? "rgba(16,185,129,0.12)" : "rgba(245,200,66,0.07)",
        color: saved ? "#6ee7b7" : "#fcd34d",
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "0.06em",
        cursor: "pointer",
        transition: "all 0.18s",
      }}
    >
      {saved ? "✓ Note saved to NoteLab" : "⚡ Generate Ultra Note"}
    </button>
  );
}

function GenerateStudySetButton({
  view,
  bookId,
  bookTitle,
  pageNumber,
  onStudySetGenerated,
}: {
  view: UltraPageView;
  bookId: string;
  bookTitle?: string;
  pageNumber: number;
  onStudySetGenerated?: (setId: string) => void;
}) {
  const [saved, setSaved] = useState(false);

  function handleGenerate() {
    const set = buildRecallSetFromView(view, bookId, pageNumber, {
      bookTitle,
      sourceLabel: "right-panel",
    });
    saveRecallSet(set);
    console.log("[TRACE NOTE_WIRING]", {
      source: "rightPanelGenerateStudySet",
      bookId,
      bookTitle,
      pageNumber,
      setId: set.id,
      topic: set.topic,
      cardCount: set.cards.length,
      subject: set.subject,
    });
    setSaved(true);
    onStudySetGenerated?.(set.id);
    setTimeout(() => setSaved(false), 2200);
  }

  return (
    <button
      type="button"
      onClick={handleGenerate}
      style={{
        flex: 1,
        padding: "10px 0",
        borderRadius: 10,
        border: saved ? "1px solid rgba(99,102,241,0.5)" : "1px solid rgba(99,102,241,0.25)",
        background: saved ? "rgba(99,102,241,0.12)" : "rgba(99,102,241,0.07)",
        color: saved ? "#a5b4fc" : "#818cf8",
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "0.06em",
        cursor: "pointer",
        transition: "all 0.18s",
      }}
    >
      {saved ? "✓ Saved to Recall Lab" : "🎯 Generate Study Set"}
    </button>
  );
}
