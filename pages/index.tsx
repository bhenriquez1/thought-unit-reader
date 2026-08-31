// pages/index.tsx
import dynamic from "next/dynamic";
import { safeSetItem } from "@/lib/storage/safeStorage";
import React, { useState, useEffect, useRef, useMemo, useCallback, ChangeEvent } from "react";
import { useRouter } from "next/router";

import { generateTOC, type TOCEntry, outlineToTOC } from "@/lib/tocParser";
import TOCSidebar from "@/components/TOCSidebar";
import type { ThoughtUnit, ReadingStats } from "@/types/reading";
import { useFeatureFlags } from "@/lib/features/featureFlags";

// Unified Stores
import { useAnnotationStore, type Annotation, type CreateAnnotationInput } from "@/lib/stores/annotationStore";
import { useQuizStore } from "@/lib/stores/quizStore";
import { useStudySessionStore } from "@/lib/stores/studySessionStore";

// Feature flag controlled imports
import EnhancedHybridReader from "@/components/EnhancedHybridReader";
import PatternView from "@/components/PatternView";
// NoteLabView removed — replaced by UltraNotesList (components/notelab/UltraNotesList.tsx)
import CleanHybridReader from "@/components/CleanHybridReader";
import LinkVideoModal from "@/components/LinkVideoModal";
import NotesList from "@/components/NotesList";

// Integrated components
import SurgeonView from "@/components/SurgeonView";
// NoteLabViewEnhanced, StudySessionPanel, MemoCardsStudyPanel removed — superseded by UltraNotesList + RecallLab
import TocTree from "@/components/toc/TocTree";
import SyllabusUploadPanel from "@/components/syllabus/SyllabusUploadPanel";
import AdaptiveSyllabusPanel from "@/components/syllabus/AdaptiveSyllabusPanel";
import { recordPageVisit, getVisitedPages } from "@/lib/syllabus/pageVisitStore";
import { computeChapterProgress, computeCourseProgress, computeNextTopicRecommendation, buildChaptersFromToc, computeWeakAreas, buildPrerequisiteChain } from "@/lib/syllabus/chapterProgress";
import { getHighlightsByBook } from "@/lib/highlights/savedHighlightsStore";
import ChapterDashboard from "@/components/syllabus/ChapterDashboard";
import AskPagePanel        from "@/components/elena/AskPagePanel";
import StickyNotesRail     from "@/components/reader/StickyNotesRail";
import { resolveElenaModeFlagsFromEnv } from "@/lib/elena/featureFlags";
import WhiteboardPanel from "@/components/WhiteboardPanel";

// Pure View components (Strict Mode Separation - V1)
import PureReaderView from "@/components/PureReaderView";
import PureTocView from "@/components/PureTocView";
import PureSurgeonView from "@/components/PureSurgeonView";
import FocusCycleCard from "@/components/FocusCycleCard";
import type { StudySpeechPanelHandle } from "@/components/reader/StudySpeechPanel";
import PodcastLab from "@/components/reader/PodcastLab";
import StudyGuideLab from "@/components/studyguide/StudyGuideLab";
import StudyPlanLab from "@/components/studyplan/StudyPlanLab";
import LearningHubLaunchPanel from "@/components/learningHub/LearningHubLaunchPanel";
import KnowledgeStatePanel from "@/components/learningHub/KnowledgeStatePanel";
import VisualKnowledgeRoadmap from "@/components/learningHub/VisualKnowledgeRoadmap";
import LearningSourcesPanel from "@/components/learningHub/LearningSourcesPanel";
import { RightPanel } from "@/components/reader/RightPanel";
import type { ActivePageContext, RightPanelState as UnifiedRightPanelState, TocNode } from "@/lib/readerContracts";
import { splitParagraphs } from "@/lib/textNormalize";
import { buildAutoToc, type PageTextBundle } from "@/lib/autoToc";
import { outlineItemsToTocNodes } from "@/lib/toc/tocNodeConverter";
import { extractFormulaCards } from "@/lib/right-panel/formulaNormalizer";
import { useActivePageIntelligence, buildPageTruthKey } from "@/lib/useActivePageIntelligence";
import ErrorBoundary from "@/components/ErrorBoundary";
import { buildGuidedLegend } from "@/lib/highlights/buildGuidedLegend";
import type { RenderGuidedReadingPathResult } from "@/lib/highlights/renderGuidedReadingPath";
import { groundHighlightAnchors } from "@/lib/highlights/groundHighlightAnchors";
import { sanitizeHighlightAnchors } from "@/lib/highlights/sanitizeHighlightAnchors";
import type { SynthHighlightAnchor, NoteCard } from "@/lib/insights/synthesizeTeachingOutput";
import { deriveNoteCardsFromStudyModel } from "@/lib/notelab/deriveNoteCards";
import { detectDomainPreset } from "@/lib/insights/domainPresets";
import { resolveSemanticPack } from "@/lib/reader/semanticPackResolver";
import { buildThoughtUnitDetail, buildThoughtUnitDetailFromNoteCard, type ThoughtUnitDetail } from "@/lib/insights/buildThoughtUnitDetail";
import { buildNoteFromStudyModel, buildUltraNote, saveUltraNote, getAllUltraNotes, getNotesByBook, inferSubject, type NoteSection, type UltraNote } from "@/lib/notelab/ultraNoteStore";
import { buildRecallSetFromView, buildRecallSetFromNote, saveRecallSet, getAllRecallSets, getRecallSetsByBook, stableRecallId, type RecallCard, type RecallSet } from "@/lib/recalllab/recallStore";
import { downloadNoteMarkdown, downloadNotePdf, downloadNoteDocx } from "@/lib/notelab/exportNote";
import { getStoredProfessionMode } from "@/lib/notelab/professionModes";
import ThoughtUnitNavigator, { type ThoughtUnitNavigatorEntry } from "@/components/reader/ThoughtUnitNavigator";
import { buildCanonicalLeftPanelUnits, type ExpertAnchor } from "@/lib/insights/canonicalLeftPanel";
import { detectPageDomain } from "@/lib/insights/detectPageDomain";
import { isNoninstructionalPage } from "@/lib/insights/pageRoleGate";
import { buildStudyModel } from "@/lib/insights/currentPageStudyModel";
import { useSurgeonAnnotations } from "@/components/reader/useSurgeonAnnotations";
import { surgeonAnnotationsToCanonicalEntries } from "@/lib/whiteboard/visualSceneGraph";
import { hashDocumentId } from "@/lib/insights/requestDiagnostics";
import { resolveDocumentIdentity } from "@/lib/insights/resolveDocumentIdentity";
import { saveStudyGuide, getStudyGuidesByBook } from "@/lib/studyguide/studyGuideStore";
import type { StudyGuideRecord } from "@/lib/studyguide/types";
import { parseExplainStepConversation } from "@/lib/explainStep/parseAnswer";
import type { ExplainStepMessage } from "@/lib/explainStep/types";
import { getHighlightsForPage, type SavedHighlight } from "@/lib/highlights/savedHighlightsStore";
import ExplainStepChat, { type ExplainStepContext } from "@/components/reader/ExplainStepChat";
import ExplainItChat from "@/components/reader/ExplainItChat";
import type { ExplainItContext, ExplainItMessage } from "@/lib/explainIt/types";
import ChiefResidentModalShell from "@/components/reader/ChiefResidentModalShell";
import PdfContextMenu from "@/components/pdf/PdfContextMenu";

// Cognitive Engine Components (Surgeon View 2.0)
import {
  ClinicalInsightPanel,
  ClinicalIQDashboard,
  ExpertModePanel,
  CognitiveTrainingEngine,
  useCognitiveEngineStore,
} from "@/components/cognitiveEngine";

// Surgeon View 2.0 - Relationship-first Cockpit
import {
  useRelationshipStore,
} from "@/components/surgeonView2";
import type { SourceRef } from "@/lib/page-intelligence";

// Store imports
import { useTocStore, isTocLowQuality } from "@/lib/stores/tocStore";
import { useZoomStore } from "@/lib/stores/zoomStore";
import { usePdrmStore } from "@/lib/stores/pdrmStore";
import { useInsightsPanelStore } from "@/lib/stores/insightsPanelStore";
import { useHighlightStore } from "@/lib/stores/highlightStore";
import { extractParagraphBlocks, findBestMatchingBlock } from "@/lib/paragraphMap";
import {
  DEFAULT_RIGHT_PANEL_STATE,
  buildCurrentPageVersion,
  type RightPanelState,
  type RightPanelTab,
} from "@/state/rightPanelState";
import type { WorkspaceMode, LearningProfile } from "@/types/workspace";
import { LEARNING_PROFILE_LABELS } from "@/types/workspace";

import {
  firebaseConnected,
  uploadPDF,
  getPDFLibrary,
  deletePDF,
  signInWithGoogle,
  signOutUser,
} from "@/lib/firebase";
import { useAuthUser } from "@/lib/auth/useAuthUser";

import LibraryPanel from "@/components/LibraryPanel";
import ChunkRail from "@/components/ChunkRail";
import { MultiViewContainer } from "@/components/ViewContainer";
import { useReaderSync, stableChunkId, analyzeContentDensity } from "@/lib/readerSync";
import { useUnifiedNavigation } from "@/lib/useUnifiedNavigation";
import AmbientPlayer from "@/components/focus/AmbientPlayer";

import {
  parseBookWithChapters,
  detectWhiteboardSections,
  containsDiagramOrFormula,
  splitIntoChapters,
  chunkTextToUnits,
} from "@/lib/parser";
import { type ExtractOptions, extractPageTextsIncremental } from "@/lib/pdfjs-handler";
import { buildCanonicalUnits, saveCanonicalUnits, readAndClearViewSourceLink } from "@/lib/canonical";
import type { ViewSourceLink } from "@/lib/canonical";
import {
  saveDocumentMeta,
  saveDocumentFile,
  getDocumentFile,
  deleteDocument,
} from "@/lib/db/documentStore";

import { usePdfSelection } from "@/hooks/usePdfSelection";
import summarizeText from "@/lib/aiSummary";
import { generateMnemonic } from "@/lib/mnemonicAI";
import { 
  ChapterAbsorptionPipeline, 
  createChapterAbsorptionPipeline,
  extractChapterTextFromPDFPages,
  type ProcessingProgress,
  type AbsorptionResult,
  type ChapterAbsorptionConfig
} from "@/lib/chapterAbsorptionPipeline";
import { type SmartTOCEntry } from "@/lib/tocParser";
import { parseSyllabus } from "@/lib/syllabusParser/parser";
import { generateCoursePlan, type StudyDay } from "@/lib/syllabusParser/coursePlanner";
import { useReadingFocusStore } from "@/lib/readingFocus/readingFocusStore";
import type { ReadingCursor } from "@/lib/readingFocus/readingFocusStore";
import { resolveOrCreateNode, getNodeProgress } from "@/lib/knowledge/knowledgeGraphStore";
import { recordPageReached } from "@/lib/reader/readingProgressStore";
import { useKnowledgeSelectionStore } from "@/lib/knowledge/knowledgeSelectionStore";
import { useKnowledgeGraph } from "@/lib/knowledge/useKnowledgeGraph";
import { useAdaptiveSyllabusStore } from "@/lib/syllabus/adaptiveSyllabusStore";
import { useCurrentLearningContext } from "@/lib/context/learningContext";

// Lazy-load to keep SSR clean with performance optimizations
const SmartPDFViewer = dynamic(() => import("@/components/SmartPDFViewer"), { ssr: false });
const PatternTrainingHybridReader = dynamic(() => import("@/components/PatternTrainingHybridReader"), { ssr: false });
const OptimizedPatternView = dynamic(() => import("@/components/OptimizedPatternView"), { ssr: false });
const UltraNotesList = dynamic(() => import("@/components/notelab/UltraNotesList"), { ssr: false });
const ChiefResidentPanel = dynamic(() => import("@/components/notelab/ChiefResidentPanel"), { ssr: false });
const RecallLab = dynamic(() => import("@/components/recalllab/RecallLab"), { ssr: false });

type StickyNote = { pageNumber: number; content: string };

/* ----------------------- helpers ----------------------- */
function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

/** Find the paragraph/thought-unit in pageText that contains the selected text. */
// Uses the same thought-unit/paragraph boundaries as RightPanel sync and
// highlight grounding (extractParagraphBlocks/findBestMatchingBlock), so the
// "surrounding paragraph" sent to Explain This Step matches the thought unit
// the rest of the reader treats as containing this selection.
function findSurroundingParagraph(pageText: string, selectedText: string, pageNumber: number, docId: string): string {
  if (!pageText) return selectedText;
  const needle = selectedText.trim().slice(0, 60);
  if (!needle) return pageText.slice(0, 800);

  const blocks = extractParagraphBlocks(pageText, pageNumber, docId);
  const matched = findBestMatchingBlock(needle, blocks);
  if (matched) return matched.text;

  // Fallback: legacy double-line-break split, then a character window.
  const paragraphs = pageText.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const match = paragraphs.find((p) => p.includes(needle));
  if (match) return match;
  const idx = pageText.indexOf(needle);
  if (idx === -1) return pageText.slice(0, 800);
  const start = Math.max(0, idx - 400);
  const end = Math.min(pageText.length, idx + needle.length + 400);
  return pageText.slice(start, end);
}

function toYouTubeEmbed(url: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    let videoId = "";
    if (host === "youtube.com" || host === "m.youtube.com") {
      videoId = parsed.searchParams.get("v") || "";
    } else if (host === "youtu.be") {
      videoId = parsed.pathname.replace("/", "");
    }
    if (!videoId) return null;
    return `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`;
  } catch {
    return null;
  }
}

/** Sanitize document title - filter out error-like titles */
function sanitizeDocTitle(title: string | undefined, fallback: string = "Document"): string {
  if (!title) return fallback;
  // Filter out error-related titles
  const errorPatterns = /parsing error|error:|failed to|unable to|exception/i;
  if (errorPatterns.test(title)) return fallback;
  return title;
}

/** Convert whatever the parser returns → { text: string }[] */
function normalizeParsedUnits(raw: unknown): ThoughtUnit[] {
  if (!Array.isArray(raw)) return [];
  return (raw as any[]).map((u) => {
    if (typeof u === "string") return { text: u } as ThoughtUnit;
    if (Array.isArray(u)) return { text: (u as any[]).filter(Boolean).join(" ") } as ThoughtUnit;
    if (u && typeof (u as any).text === "string") return u as ThoughtUnit;
    return { text: String(u ?? "") } as ThoughtUnit;
  });
}

/** Safely pluck a human string from mixed unit shapes */
function unitToString(u: any): string {
  if (!u) return "";
  if (typeof u === "string") return u;
  if (Array.isArray(u)) return u.filter(Boolean).join(" ");
  if (typeof u.text === "string") return u.text;
  return String(u);
}

/** Map a PDF page → nearest thought-unit index */
function pageToUnit(page: number, pageCount: number, unitCount: number) {
  if (!pageCount || !unitCount) return 1;
  const ratio = (Math.max(1, page) - 1) / Math.max(1, pageCount - 1);
  return Math.min(unitCount, Math.max(1, Math.round(ratio * unitCount)));
}

/** Pull a concept seed near a given page (for Whiteboard) */
function conceptForPage(page: number, units: ThoughtUnit[], pageCount: number): string {
  if (!units.length) return "";
  const idx = pageToUnit(page, pageCount, units.length) - 1;
  return (units[idx]?.text || "").slice(0, 600);
}

/** Simple sentence/phrase chunker (for Progressive overlay) */
function chunkIntoIdeas(text: string): string[] {
  const T = (text || "").replace(/\s+/g, " ").trim();
  if (!T) return [];
  const sents = T.split(/(?<=[.!?])\s+(?=[A-Z(])/).map((s) => s.trim()).filter(Boolean);
  const chunks: string[] = [];
  for (const s of sents) {
    const parts = s
      .split(/\s*(?:;|:|—|–|--|, and |, but | and | but | however | whereas )\s*/i)
      .map((p) => p.trim())
      .filter(Boolean);
    for (const p of parts) chunks.push(p);
  }
  return chunks.length ? chunks : [T];
}

/* ---------- TOC helpers: tolerate different TOCEntry shapes ---------- */
function getTocPage(t: TOCEntry): number | undefined {
  const any = t as any;
  if (typeof any.page === "number") return any.page;                // 1-based
  if (typeof any.pageNumber === "number") return any.pageNumber;    // 1-based (common)
  if (typeof any.pageIndex === "number") return any.pageIndex + 1;  // 0-based → 1-based
  if (typeof any.page_from === "number") return any.page_from;      // some parsers
  if (typeof any.pageFrom === "number") return any.pageFrom;
  return undefined;
}

function titleForPage(toc: TOCEntry[], page: number): string {
  const exact = (toc.find((t) => getTocPage(t) === page) as any)?.title;
  if (exact) return String(exact);

  // Otherwise pick nearest previous heading
  let bestTitle = "";
  let bestPage = -1;
  for (const t of toc) {
    const p = getTocPage(t);
    if (typeof p === "number" && p <= page && p > bestPage) {
      bestPage = p;
      bestTitle = (t as any).title || "";
    }
  }
  return bestTitle || `p.${page}`;
}

function flattenTocNodes(nodes: TocNode[]): TocNode[] {
  return nodes.flatMap((node) => [node, ...flattenTocNodes(node.children || [])]);
}

/* ---------- highlight chosen chunk inside the PDF ---------- */
function highlightChunkInPDF(pageNumber: number, text: string) {
  if (typeof window === "undefined") return;
  const page = document.querySelector(`[data-page-number="${pageNumber}"]`);
  const layer = page?.querySelector(".textLayer") as HTMLElement | null;
  if (!layer || !text.trim()) return;

  // clear old
  layer.querySelectorAll(".pdf-hit").forEach((el) => el.classList.remove("pdf-hit", "active"));

  const spans = Array.from(layer.querySelectorAll("span"));
  const needle = text.replace(/\s+/g, " ").trim().toLowerCase();
  let acc = "";
  let start = -1;

  for (let i = 0; i < spans.length; i++) {
    const piece = (spans[i].textContent || "").replace(/\s+/g, " ").trim();
    if (!piece) continue;
    if (start === -1) start = i;
    acc = (acc ? acc + " " : "") + piece;
    const hay = acc.toLowerCase();
    if (hay.includes(needle)) {
      for (let j = start; j <= i; j++) {
        spans[j].classList.add("pdf-hit");
        if (j === start) (spans[j] as HTMLElement).classList.add("active");
      }
      (spans[start] as HTMLElement).scrollIntoView({ block: "center", behavior: "smooth" });
      break;
    }
    if (acc.length > needle.length * 3) {
      acc = "";
      start = -1;
    }
  }
}

/* ---------------- mini comprehension prompts (overlay) ---------------- */
const COMPREHENSION_PROMPTS = [
  { label: "Explain in your own words", build: (ctx: string) => `Explain in your own words:\n\n${ctx}` },
  { label: "Why does X lead to Y?",     build: (ctx: string) => `Why does this happen? Use the context to justify each step:\n\n${ctx}` },
  { label: "Compare A vs B",            build: (ctx: string) => `Compare two key ideas. Where are they similar/different?\n\nContext:\n${ctx}` },
] as const;


// ---------------------------------------------------------------------------
// Highlight budget — enforces coverage and per-type limits before left panel render.
// Prevents calculus/dense pages from painting every formula line.
// ---------------------------------------------------------------------------

// R3: these were flat, low ceilings tuned for "a few highlights per page" and
// silently dropped material on dense mechanism/procedure/comparison pages —
// the AI could select a full causal chain or every procedure step upstream,
// then have it truncated back down here regardless. Raised to be generous
// enough that a dense page's real content survives, modeled on the proven
// values already used by the PDF-overlay pipeline's limitAnnotationDensity.ts
// (global cap 8, up to 15 for procedure/workflow/decision-tree pages).
const ANCHOR_TYPE_MAX: Record<string, number> = {
  thesis:       3,
  definition:   4,
  mechanism:    4, // a real causal chain can span several linked steps
  application:  3,
  trap:         3,
  formula:      4, // math alias — the rule plus its key transformations
  example_step: 4, // a procedure page must keep every essential step
  conclusion:   2,
};

const BUDGET_TOTAL_MAX       = 15;
const BUDGET_COVERAGE_TARGET = 0.12; // sparse pages still land near here naturally
const BUDGET_COVERAGE_MAX    = 0.30; // dense pages may need up to ~30% coverage

type BudgetAnchor = { text: string; anchorType: string; reason: string; spanStart: string | null; spanEnd: string | null };

function applyHighlightBudget<T extends BudgetAnchor>(
  anchors: T[],
  pageText: string,
  isMathPage: boolean,
  page: number,
): T[] {
  if (!anchors.length) return anchors;

  const pageLen = pageText.length;

  DEV && console.log("[HIGHLIGHT_BUDGET_INPUT]", {
    page,
    inputCount:  anchors.length,
    isMathPage,
    pageTextLen: pageLen,
    types: anchors.map(a => a.anchorType),
  });

  // For math pages, prioritize definition > conclusion > trap > example_step > mechanism
  // (don't highlight every formula line — only the rule, one step, the conclusion, and traps).
  // For non-math pages, sort by _highlightScore (lower = higher priority) so that
  // proceduralImportance, misconceptionRisk, thesisRelevance, and connectionStrength
  // influence which anchors get the limited budget slots. Domain-critical roles always
  // lead because their base speechPriority (1–10) dominates the ≤0.95 metadata bonus.
  const mathPriority = ["definition", "formula", "conclusion", "thesis", "trap", "example_step", "mechanism", "application"];
  const candidates = isMathPage
    ? [...anchors].sort((a, b) => {
        const ai = mathPriority.indexOf(a.anchorType);
        const bi = mathPriority.indexOf(b.anchorType);
        return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
      })
    : [...anchors].sort((a, b) =>
        ((a as any)._highlightScore ?? (a as any).priorityTier ?? 5)
        - ((b as any)._highlightScore ?? (b as any).priorityTier ?? 5)
      );

  const typeCounts: Record<string, number> = {};
  const result: T[] = [];
  let coverageChars = 0;
  const dropped: Array<{ type: string; reason: string; text: string }> = [];

  for (const anchor of candidates) {
    const type   = anchor.anchorType;
    const limit  = ANCHOR_TYPE_MAX[type] ?? 1;
    const count  = typeCounts[type] ?? 0;

    if (result.length >= BUDGET_TOTAL_MAX) {
      dropped.push({ type, reason: "total-max", text: anchor.text.slice(0, 50) });
      continue;
    }
    if (count >= limit) {
      dropped.push({ type, reason: `type-limit(${limit})`, text: anchor.text.slice(0, 50) });
      continue;
    }
    const spanLen = anchor.text.length;
    // Only the very first anchor is coverage-exempt (so a page is never left with
    // zero highlights even when one long span alone exceeds the cap) — every
    // anchor after that must keep cumulative coverage under BUDGET_COVERAGE_MAX.
    if (pageLen > 0 && result.length >= 1 && (coverageChars + spanLen) / pageLen > BUDGET_COVERAGE_MAX) {
      dropped.push({ type, reason: "coverage-max", text: anchor.text.slice(0, 50) });
      continue;
    }

    typeCounts[type] = count + 1;
    coverageChars   += spanLen;
    result.push(anchor);
  }

  const coveragePct = pageLen > 0 ? ((coverageChars / pageLen) * 100).toFixed(1) : "n/a";

  if (dropped.length > 0) {
    DEV && console.log("[HIGHLIGHT_BUDGET_DROP]", { page, droppedCount: dropped.length, dropped });
  }
  DEV && console.log("[HIGHLIGHT_BUDGET_FINAL]", { page, finalCount: result.length, types: result.map(a => a.anchorType) });
  DEV && console.log("[HIGHLIGHT_COVERAGE]", { page, coveragePct: `${coveragePct}%`, coverageChars, pageTextLen: pageLen, target: `${BUDGET_COVERAGE_TARGET * 100}%`, max: `${BUDGET_COVERAGE_MAX * 100}%` });

  return result;
}


const ELENA_ENABLED = resolveElenaModeFlagsFromEnv().ELENA_MODE_ENABLED;
const DEV = process.env.NODE_ENV === "development";

export default function ThoughtUnitReader() {
  const router = useRouter();
  /* =========================================================================
     🔹 Feature Flags for Prototype Testing
  ========================================================================= */
  const { isEnabled: isFeatureEnabled } = useFeatureFlags();

  /* =========================================================================
     🔹 Enhanced Global Reader Sync Store
  ========================================================================= */
  const {
    page,
    unitIndex,
    activeChunkId,
    lastUpdateSource,
    setPage,
    setUnitIndex,
    setActiveChunkId,
    updateSync,
    initializeContent,
    updateContentDensity
  } = useReaderSync();

  // Unified navigation hook for consistent navigation across all components
  const { jumpToPage, jumpToChapter, navigateProgrammatically } = useUnifiedNavigation();

  // Follow Scroll: when false, only explicit user navigation (Prev/Next, TOC, card clicks)
  // changes the current page. Scroll-driven updates from observers are suppressed.
  // Declared here (before the readerSync subscriber effect) to avoid TDZ in its dep array.
  const [followScroll, setFollowScroll] = useState(false);

  // Subscribe to global sync changes for cross-view synchronization.
  // Gated by navLock + followScroll to prevent observer/scroll feedback loops.
  useEffect(() => {
    DEV && console.log(`🔄 Global sync state changed: page=${page}, unit=${unitIndex}, chunk=${activeChunkId}, source=${lastUpdateSource}`);
    DEV && console.log("[TRACE pageSync]", {
      source: `globalSync:${lastUpdateSource}`,
      documentId: bookId,
      visiblePage: page,
      currentPage,
      currentThoughtUnit,
      pageTextWords: (pageTextByPage.get(`${bookId}:${currentPage}`) || "").split(/\s+/).filter(Boolean).length,
    });

    // Hard gate: never process observer callbacks during page hydration
    if (navLockRef.current) {
      DEV && console.log(`🔒 navLock active – ignoring sync update from source=${lastUpdateSource}`);
      return;
    }

    const isScrollDriven = lastUpdateSource === 'pdf' || lastUpdateSource === 'progressive' || lastUpdateSource === 'hybrid';

    // When Follow Scroll is OFF, only manual/toc sources are allowed to drive page changes
    if (isScrollDriven && !followScroll) {
      DEV && console.log(`🚫 Follow Scroll OFF – suppressing scroll-driven page update (source=${lastUpdateSource})`);
      return;
    }

    // Cooldown: ignore scroll-driven updates within 650 ms of the last user navigation
    if (isScrollDriven && Date.now() - lastUserNavAtRef.current < 650) {
      DEV && console.log(`⏳ User nav cooldown – suppressing scroll-driven update (${Date.now() - lastUserNavAtRef.current}ms < 650ms)`);
      return;
    }

    if (page !== currentPage) {
      DEV && console.log(`🔄 Syncing local page: ${currentPage} -> ${page}`);
      setCurrentPage(page);
    }

    if (unitIndex !== currentThoughtUnit) {
      DEV && console.log(`🔄 Syncing local unit: ${currentThoughtUnit} -> ${unitIndex}`);
      setCurrentThoughtUnit(unitIndex);
    }
  }, [page, unitIndex, activeChunkId, lastUpdateSource, followScroll]);

  /* =========================================================================
     🔹 State
  ========================================================================= */
  // Product-split Phase 2: shared hook (also used by pages/_app.tsx) instead
  // of this component's own separate listenForAuthChanges subscription and
  // dev-bypass mock user, which had drifted from lib/firebase.ts's own
  // internal bypass handling — see lib/auth/useAuthUser.ts.
  const { user } = useAuthUser();
  const USER_ID = user?.uid || "guest-user";

  const [thoughtUnits, setThoughtUnits] = useState<ThoughtUnit[]>([]);
  const [currentThoughtUnit, setCurrentThoughtUnit] = useState(1);
  // Live per-page text extracted from PDF.js — keyed by "documentId:pageNumber" so two
  // different books at the same page number can never share entries.
  const [pageTextByPage, setPageTextByPage] = useState<Map<string, string>>(() => new Map());
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  // Track the active blob URL so we can revoke it when a new one is created (prevents memory leak).
  const activeBlobUrlRef = useRef<string | null>(null);
  const createBlobUrl = (source: Blob | File): string => {
    if (activeBlobUrlRef.current) URL.revokeObjectURL(activeBlobUrlRef.current);
    const url = URL.createObjectURL(source);
    activeBlobUrlRef.current = url;
    return url;
  };
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  // ── CurrentLearningContext: single source of truth for document + page ──
  // pages/index.tsx is the sole writer. All stores that previously held their
  // own currentPage / documentId copies read from here (Phase 1: writer wired;
  // Phase 2: downstream stores migrated to subscribers).
  const {
    documentId: currentLocalDocumentId,
    bookId,
    currentPage,
    setDocumentId: setCurrentLocalDocumentId,
    setBookId,
    setDocumentTitle,
    setPage: setCurrentPage,
    setTotalPages,
  } = useCurrentLearningContext();
  // True when PDF.js fails to load the source file (distinct from text-analysis failures).
  const [pdfSourceFailed, setPdfSourceFailed] = useState(false);

  const [viewMode, setViewMode] = useState<WorkspaceMode>("reader");

  // Global Zoom Store
  const { zoom, zoomIn, zoomOut, resetZoom, getZoomPercent, canZoomIn, canZoomOut } = useZoomStore();

  // Stable ref that mirrors currentPage — lets syncToPage read the latest page
  // inside a useCallback without listing currentPage as a dep (which would
  // recreate the callback and cascade re-renders into TocTree on every page flip).
  const currentPageRef = useRef(1);
  // Cross-page anchor focus: when a card on a different page is clicked we must
  // call syncToPage() first, which clears focusedEvidenceId (see the clear-on-
  // page-change effect below). pendingFocusAnchorId survives the page transition
  // and is applied as the new focusedEvidenceId once currentPage settles.
  const [pendingFocusAnchorId, setPendingFocusAnchorId] = useState<string | null>(null);
  // Stable ref to syncToPage — lets onPdfHighlightFocus call it without listing
  // syncToPage in its dep array (syncToPage is declared much later in the file;
  // including it in the dep array causes a TDZ error in the production SSR bundle
  // because the dep array is evaluated eagerly when the useCallback is created).
  const syncToPageRef = useRef<((page: number, opts?: { reason?: string }) => void) | null>(null);
  // Same TDZ workaround as syncToPageRef above — handleLoadPDF is declared
  // much later in this component; populated by an effect right after its
  // own declaration, read via .current by handleViewSourcePickFromLibrary.
  const handleLoadPDFRef = useRef<((url: string, name?: string, localDocumentId?: string) => void) | null>(null);
  // Banner shown when the Reader is opened via "View Source in Reader" from DAT Apex.
  const [viewSourceBanner, setViewSourceBanner] = useState<{ pageNumber: number; quote: string } | null>(null);
  // P0 fix — a ViewSourceLink whose documentId doesn't (yet) match the
  // currently-open book. Held here instead of applied immediately: the link
  // used to only ever call setCurrentPage, which — if a different book (or
  // no book) happened to be open — silently showed that OTHER book's
  // content at a confidently-labeled page number, with no indication
  // anything was wrong. Now the page jump only fires once bookId actually
  // matches; until then this renders an honest "open the right book" prompt.
  const [pendingViewSourceLink, setPendingViewSourceLink] = useState<ViewSourceLink | null>(null);
  // TestLab-Reader progress integration — "TestLab found this concept weak —
  // review". Only fires when the current page's Knowledge Graph node has
  // real datPerformance evidence (i.e. TestLab specifically saw it missed,
  // not just generic low mastery from some other source).
  const [weakConceptBanner, setWeakConceptBanner] = useState<{ nodeId: string; accuracy: number } | null>(null);
  useEffect(() => { currentPageRef.current = currentPage; }, [currentPage]);
  // Clear PDF source failure when a new source URL is set (fresh upload or IDB reload).
  useEffect(() => { if (fileUrl) setPdfSourceFailed(false); }, [fileUrl]);
  const [pdfPageCount, setPdfPageCount] = useState(0); // Start with 0 to indicate not loaded
  // Keep totalPages in the learning context store in sync with the PDF renderer.
  useEffect(() => { if (pdfPageCount > 0) setTotalPages(pdfPageCount); }, [pdfPageCount, setTotalPages]);
  const [pdfLoadingState, setPdfLoadingState] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const [pdfError, setPdfError] = useState<string | null>(null);

  const [isReading, setIsReading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [readingSpeed, setReadingSpeed] = useState(200);
  const [stats, setStats] = useState<ReadingStats>({
    wordsRead: 0,
    timeElapsed: 0,
    currentWPM: 0,
  });

  const [highlightedWord, setHighlightedWord] = useState("");
  const [fontSize, setFontSize] = useState(16);
  const [readingMode, setReadingMode] = useState<"normal" | "dyslexia">("normal");
  const [learningProfile, setLearningProfile] = useState<LearningProfile>(() => {
    try { return (localStorage.getItem("learningProfile") as LearningProfile) || "standard"; } catch { return "standard"; }
  });
  // Persist learning profile whenever it changes
  useEffect(() => {
    try { localStorage.setItem("learningProfile", learningProfile); } catch { /* ignore */ }
  }, [learningProfile]);
  const [themeMode, setThemeMode] = useState<"dark" | "light">("dark");
  const fontFamily = readingMode === "dyslexia" ? "Arial, Verdana, Tahoma, sans-serif" : "Inter, Georgia, serif";
  const [lineSpacing, setLineSpacing] = useState(1.5);
  const [clickSwitchesTo, setClickSwitchesTo] = useState(false);
  const [sampleText, setSampleText] = useState("");
  const darkMode = themeMode === "dark";

  // Voice settings state
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [speechRate, setSpeechRate] = useState(1.0);

  const [tableOfContents, setTableOfContents] = useState<TOCEntry[]>([]);
  // Convert legacy TOCEntry[] to TocItem[] for cross-link resolution in RightPanel
  const tocItemsForSearch = useMemo(
    () => tableOfContents.map((e, i) => ({ id: `toc-${i}`, title: e.title, pageNumber: e.pageNumber, level: 0 as const })),
    [tableOfContents]
  );
  const [showTOC] = useState(true);
  const [syllabusFileName, setSyllabusFileName] = useState(() => {
    try { return localStorage.getItem("syllabus_fileName") ?? ""; } catch { return ""; }
  });
  const [syllabusPages, setSyllabusPages] = useState<PageTextBundle[]>(() => {
    try { return JSON.parse(localStorage.getItem("syllabus_pages") ?? "[]"); } catch { return []; }
  });
  const [syllabusToc, setSyllabusToc] = useState<TocNode[]>(() => {
    try { return JSON.parse(localStorage.getItem("syllabus_toc") ?? "[]"); } catch { return []; }
  });
  // Distinguishes "chapters detected from the book itself" (the default,
  // automatic path) from "a course syllabus file was uploaded" (optional,
  // adds real assignment/exam dates) — purely for the Syllabus tab's banner
  // copy, since both paths populate the same syllabusToc/syllabusPages state.
  const [syllabusSource, setSyllabusSource] = useState<"book" | "upload">(() => {
    try { return (localStorage.getItem("syllabus_source") as "book" | "upload") || "book"; } catch { return "book"; }
  });
  // Set when the user explicitly clicks "Upload a course syllabus" from the
  // auto-detected dashboard — suppresses the book-content auto-detect effect
  // below so it doesn't immediately repopulate syllabusToc and bounce the
  // user straight back out of the upload panel.
  const [syllabusUploadRequested, setSyllabusUploadRequested] = useState(false);
  // Tracks what produced syllabusToc so outline (authoritative) beats heuristic.
  // Persisted so a page reload knows not to overwrite an outline-sourced TOC.
  const [syllabusTocSource, setSyllabusTocSource] = useState<"none" | "heuristic" | "outline">(() => {
    try { return (localStorage.getItem("syllabus_toc_source") as "heuristic" | "outline") || "none"; } catch { return "none"; }
  });
  // Pages studied via the one-brain pipeline: noteLab saved or recallLab saved
  const [syllabusStudiedPages, setSyllabusStudiedPages] = useState<Set<number>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("syllabus_studiedPages") ?? "[]") as number[]); } catch { return new Set(); }
  });
  const [syllabusStudyPlan, setSyllabusStudyPlan] = useState<StudyDay[]>(() => {
    try { return JSON.parse(localStorage.getItem("syllabus_plan") ?? "[]"); } catch { return []; }
  });
  const [activeShellTab, setActiveShellTab] = useState<WorkspaceMode>("reader" as WorkspaceMode);
  const [rightPanelResetKey, setRightPanelResetKey] = useState(0);
  const [noteLabRefreshKey, setNoteLabRefreshKey] = useState(0);
  // Sub-tab selections within consolidated panels
  // M5 collapsed Evidence's own sub-tab ("sources") into an inline panel;
  // P4 (Evidence-as-provenance correction) removed that panel entirely —
  // provenance now surfaces only via per-object actions, never a click here.
  const [notesSubTab, setNotesSubTab] = useState<"notes" | "teaching">("notes");
  const [activeNote, setActiveNote] = useState<import("@/lib/notelab/ultraNoteStore").UltraNote | null>(null);
  const [hubSubTab, setHubSubTab] = useState<"overview" | "today" | "roadmap" | "studyplan" | "mastery" | "weak" | "exam" | "graph" | "coach" | "sources">("overview");
  const [coachQuestion, setCoachQuestion] = useState("");
  const [coachResponse, setCoachResponse] = useState<string | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);
  // NoteLab 3-column dashboard: which note's thought units/export tools the
  // left/right rails are currently bound to (the note currently expanded in
  // the center column's list) and which of its anchors was just clicked.
  const [notelabActiveNote, setNotelabActiveNote] = useState<UltraNote | null>(null);
  const [notelabFocusedAnchorId, setNotelabFocusedAnchorId] = useState<string | null>(null);
  const [recallLabRefreshKey, setRecallLabRefreshKey] = useState(0);
  const [explainStepContext, setExplainStepContext] = useState<ExplainStepContext | null>(null);
  const explainStepTurnsRef = useRef<Map<string, import("@/lib/explainStep/types").ExplainStepMessage[]>>(new Map());
  const [explainItContext, setExplainItContext] = useState<ExplainItContext | null>(null);
  const explainItTurnsRef = useRef<Map<string, ExplainItMessage[]>>(new Map());
  const [showChiefResident, setShowChiefResident] = useState(false);
  const [pdfContextMenu, setPdfContextMenu] = useState<{ x: number; y: number; hasSelection: boolean } | null>(null);
  const [explainItPodcastSeed, setExplainItPodcastSeed] = useState<string | null>(null);
  const [lastRecallSetId, setLastRecallSetId] = useState<string | null>(null);
  const [studyGuideScript, setStudyGuideScript] = useState<import("@/lib/podcast/podcastTypes").PodcastScript | null>(null);
  const [focusSnippet, setFocusSnippet] = useState<string | null>(null);
  // Render counter — temporary diagnostic for React #185 investigation.
  const renderCountRef = useRef(0);
  renderCountRef.current++;
  DEV && console.log("[INDEX_RENDER]", renderCountRef.current);

  // Primary KnowledgeNode for the current page — populated by the KG effect below.
  // Used by all note-save paths to attach knowledgeNodeId without blocking the UI.
  const pageKgNodeIdRef = useRef<string | null>(null);
  // Reactive mirror: Recall's canonical session must re-render once the async
  // resolver produces the page node, otherwise a ref-only write can leave new
  // cards permanently detached from Learning State until an unrelated render.
  const [pageKnowledgeNodeId, setPageKnowledgeNodeId] = useState<string | null>(null);

  // KG cross-module selection sync: badge clicks → auto-navigate + highlight.
  const selectedKgNodeId = useKnowledgeSelectionStore((s) => s.selectedNodeId);
  const lastNavigatedKgNodeRef = useRef<string | null>(null);

  // Reading position from the single ReadingFocusStore — no local state needed.
  const focusedEvidenceId = useReadingFocusStore(s => s.thoughtUnitId);
  const setFocusedEvidenceId = useReadingFocusStore.getState().setThoughtUnit;
  // Two pipeline stages AFTER a SurgeonAnnotationPlan succeeds — geometry
  // resolution against the live PDF text layer, and the final render pass —
  // that useSurgeonAnnotations has no visibility into (only SmartPDFViewer
  // can observe them). See lib/readingFocus/readingFocusStore.ts.
  const annotationRenderStage  = useReadingFocusStore(s => s.annotationRenderStage);
  const annotationRenderCounts = useReadingFocusStore(s => s.annotationRenderCounts);
  // True while Study Speech is actively reading a sentence aloud — keeps the
  // focusSnippet highlight in the PDF on the active sentence instead of auto-fading.
  const [speechReadingActive, setSpeechReadingActive] = useState(false);
  const speechPanelRef = useRef<StudySpeechPanelHandle>(null);
  // Guards scroll-debounce from overwriting a card-click selection for 1.5 s after
  // the user explicitly focuses an evidence item (RC-3 highlighting race).
  const userFocusLockedUntilRef = useRef<number>(0);
  const processingAbortControllerRef = useRef<AbortController | null>(null);
  const [guidedPath, setGuidedPath] = useState<RenderGuidedReadingPathResult | null>(null);
  // AI-selected highlight anchors from synthesis — cleared immediately on page change.
  // Full anchor objects (not just strings) so anchorType can drive legend colors.
  // Shared typed study model — emitted by RightPanel when synthesis resolves.
  const [currentPageStudyModel, setCurrentPageStudyModel] = useState<import("@/lib/insights/currentPageStudyModel").CurrentPageStudyModel | null>(null);
  const [canonicalLeftPanelUnits, setCanonicalLeftPanelUnits] = useState<ExpertAnchor[]>([]);
  const [canonicalLeftPanelDiagnostic, setCanonicalLeftPanelDiagnostic] = useState<string | null>("Still preparing thought units");

  // RightPanel's "studyModel ready" effect (RightPanel.tsx ~line 1014-1031) depends on
  // this callback's identity. An inline arrow here would be recreated every parent
  // render, re-firing that effect and calling setCurrentPageStudyModel again on every
  // render — an infinite loop once a real model exists. Stable identity breaks the cycle.
  // Only refs and the setState function are used inside, so deps can stay empty.
  const handleStudyModelReady = useCallback((
    model: import("@/lib/insights/currentPageStudyModel").CurrentPageStudyModel,
    key: string
  ) => {
    DEV && console.log("[LEFT_PANEL_RIGHT_MODEL_RECEIVED]", {
      key,
      page: model.page,
      visualAnchorCount: model.visualAnchors.length,
      roles: model.visualAnchors.map((a) => a.role),
    });
    const current = pageTruthKeyRef.current;
    if (key !== current) {
      console.warn("[WIRE] rejected stale studyModel", { from: key, current });
      return;
    }
    DEV && console.log("[WIRE] studyModel accepted", {
      key,
      page: model.page,
      visualAnchors: model.visualAnchors.length,
      ids: model.visualAnchors.map((a) => a.id),
      roles: model.visualAnchors.map((a) => a.role),
    });
    DEV && console.log("[VISUAL_ANCHORS_RECEIVED]", {
      page: model.page,
      count: model.visualAnchors.length,
      ids: model.visualAnchors.map((a) => a.id),
      firstTexts: model.visualAnchors.slice(0, 3).map((a) => a.exactText.slice(0, 60)),
      source: "finalStudyModel.visualAnchors",
    });
    // Embed pageTruthKey so the render-time guard can verify this model is current.
    // Anchor-equality guard: if visualAnchor IDs are unchanged (e.g. Stage 1→Stage 2
    // only enriched study notes, not anchors), return the same prev reference so React
    // skips the re-render and the canonicalLeftPanelUnits cascade doesn't fire twice.
    setCurrentPageStudyModel(prev => {
      const next = { ...model, pageTruthKey: key };
      if (prev && prev.pageTruthKey === key) {
        const prevIds = prev.visualAnchors.map((a) => a.id).join(',');
        const nextIds = next.visualAnchors.map((a) => a.id).join(',');
        if (prevIds === nextIds) return prev;
      }
      return next;
    });
    DEV && console.log("[WIRE] highlights←studyModel", { key, source: "visualAnchors", count: model.visualAnchors.length, texts: model.visualAnchors.map((a) => a.exactText.slice(0, 40)) });
  }, []);

  // Stable wrapper so RightPanel's onPlayStateChange prop identity never changes.
  // Without this, every index.tsx re-render (including per-word Zustand writes during TTS)
  // creates a new inline arrow, which forces Effect C in StudySpeechPanel to re-run.
  const handleSpeechPlayStateChange = useCallback(
    (isReading: boolean) => setSpeechReadingActive(isReading),
    []
  );

  // KG resolve effect moved to after bookId declaration (avoids TS2448 TDZ error)

  // DIAGNOSTIC: [NOTELAB_RESTORE] / [RECALLLAB_RESTORE] — on mount, report how many records
  // exist in localStorage. Run once. After page refresh this proves persistence works or doesn't.
  useEffect(() => {
    const notes = getAllUltraNotes();
    DEV && console.log("[NOTELAB_RESTORE]", {
      recordsFound: notes.length,
      storageKey:   "ultraNotes_v1",
      destination:  "localStorage",
      sampleTopics: notes.slice(0, 3).map(n => `p${n.pageNumber}: ${n.topic?.slice(0, 40) ?? "(no topic)"}`),
    });
    const recallSets = getAllRecallSets();
    DEV && console.log("[RECALLLAB_RESTORE]", {
      recordsFound: recallSets.length,
      storageKey:   "recallSets_v1",
      destination:  "localStorage",
      totalCards:   recallSets.reduce((s, r) => s + r.cards.length, 0),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Revoke the last blob URL on unmount to free the pinned ArrayBuffer.
  useEffect(() => {
    return () => { if (activeBlobUrlRef.current) URL.revokeObjectURL(activeBlobUrlRef.current); };
  }, []);

  // Clear stale synthesis state immediately when the user navigates to a new
  // page OR switches documents. Previously keyed on [currentPage] only — if a
  // newly-opened document happened to land on the same page number as the
  // previously-open one, React bails on the redundant setCurrentPage(N) call
  // and this effect never re-fires, leaving the old document's units visible
  // until a later effect (which does key on bookId) catches up.
  useEffect(() => {
    setCurrentPageStudyModel(null);
    setCanonicalLeftPanelUnits([]);
    setCanonicalLeftPanelDiagnostic("Still preparing thought units");
  }, [bookId, currentPage]);

  // finalHighlightAnchors: grounded canonicalLeftPanelUnits — left panel source.
  // Pipeline: canonicalLeftPanelUnits → sanitize → ground → budget → render.
  // Blocked paths: /api/score-anchors, universalSpecificityScore, highlightNeighborhoods,
  //                priorityHighlights, localStorage highlights.
  // Rule: if canonical units are empty, render diagnostics instead of silent empty UI.
  const [finalHighlightAnchors, setFinalHighlightAnchors] = useState<SynthHighlightAnchor[]>([]);
  // Clear stale highlight anchors on every page change so page-N highlights are never
  // visible on page N+1 (the main synthesis effect populates them when ready).
  useEffect(() => { setFinalHighlightAnchors([]); }, [currentPage]);

  // Effective domain preset reported by the left panel (PureReaderView) — including
  // any manual override — shared with RightPanel/Guided speech so they rank and
  // read thought units in the same order the left panel is grouping/displaying them.
  const [sharedPresetId, setSharedPresetId] = useState<string>("universal");
  // Seed the preset immediately from the uploaded filename so the correct expert
  // mode is active before any page text is extracted. This prevents the brief
  // "universal" flash when opening a domain-specific document (e.g. "DAT Prep.pdf"
  // resolves to the dat preset the moment the file is selected).
  useEffect(() => {
    if (!uploadedFile) return;
    const seed = detectDomainPreset("", undefined, uploadedFile.name);
    if (seed !== "universal") setSharedPresetId(seed);
  }, [uploadedFile]);

  // Active annotation pack — resolves tier labels and whiteboard grammar from sharedPresetId.
  // Used to make PDF highlight margin labels and Whiteboard layout domain-adaptive.
  const activePack = useMemo(() => resolveSemanticPack(sharedPresetId), [sharedPresetId]);

  // NoteLab left rail: the active note's raw thought units, mapped to the same
  // entry shape PureReaderView feeds the reader's own ThoughtUnitNavigator.
  const notelabNavEntries: ThoughtUnitNavigatorEntry[] = useMemo(() => {
    return (notelabActiveNote?.visualAnchors ?? []).map((a) => ({
      id: a.id,
      text: a.exactText,
      kind: a.kind,
      priorityTier: a.priorityTier,
      reason: a.reason,
      page: notelabActiveNote?.pageNumber,
    }));
  }, [notelabActiveNote]);

  // Verbatim text of the clicked anchor — matched against each card's
  // sourceAnchorHints by NoteCardGrid to scroll/highlight the right card.
  const notelabFocusedAnchorText = useMemo(() => {
    if (!notelabFocusedAnchorId) return null;
    return notelabNavEntries.find((e) => e.id === notelabFocusedAnchorId)?.text ?? null;
  }, [notelabFocusedAnchorId, notelabNavEntries]);

  // savedHighlightAnchors: highlights persisted via RightPanel "Save to NoteLab" /
  // "Save to Recall" actions (lib/highlights/savedHighlightsStore.ts), loaded for the
  // active book/page. Merged into finalHighlightAnchors below so a saved item's source
  // anchor renders in the LeftPanel even if the live studyModel for this visit differs.
  const [savedHighlightAnchors, setSavedHighlightAnchors] = useState<SynthHighlightAnchor[]>([]);

  // Dev-mode-only LeftPanel highlight diagnostics (NEXT_PUBLIC_DEBUG_READER=true):
  // one snapshot per grounding pass, surfaced as a read-only overlay so the
  // grounding/confidence data that already exists in groundHighlightAnchors
  // doesn't only live in console logs.
  const [highlightDiagnostics, setHighlightDiagnostics] = useState<{
    page: number;
    requestedCount: number;
    groundedCount: number;
    failedCount: number;
    anchors: Array<{
      evidenceRefId?: string;
      role: string;
      sourceField?: string;
      confidence: number;
      groundMethod: string;
      matchedLength: number;
    }>;
  } | null>(null);

  // Ref mirrors currentPageRole (declared later via useActivePageIntelligence) so the
  // finalHighlightAnchors effect can read it without a TDZ TypeScript error.
  const currentPageRoleRef = useRef<string | null>(null);

  // Content-equality guards so re-running the highlight effect with unchanged inputs
  // (e.g. a pageTextByPage Map that was replaced but holds identical text) doesn't
  // hand React a new array/object reference and trigger a fresh render every time —
  // that identity churn is what was driving a tight re-render loop once a studyModel
  // was present (anything reading finalHighlightAnchors/highlightDiagnostics re-rendered
  // on every effect run, including effect runs that produced an identical result).
  const anchorsEqual = (a: SynthHighlightAnchor[], b: SynthHighlightAnchor[]) => {
    if (a === b) return true;
    if (a.length !== b.length) return false;
    return a.every((x, i) => {
      const y = b[i] as SynthHighlightAnchor & { evidenceRefId?: string };
      return x.text === y.text
        && x.anchorType === y.anchorType
        && x.reason === y.reason
        && x.spanStart === y.spanStart
        && x.spanEnd === y.spanEnd
        && (x as { evidenceRefId?: string }).evidenceRefId === y.evidenceRefId;
    });
  };
  const setFinalHighlightAnchorsIfChanged = (next: SynthHighlightAnchor[]) => {
    setFinalHighlightAnchors((prev) => (anchorsEqual(prev, next) ? prev : next));
  };
  type HighlightDiagnostics = {
    page: number;
    requestedCount: number;
    groundedCount: number;
    failedCount: number;
    anchors: Array<{
      evidenceRefId?: string;
      role: string;
      sourceField?: string;
      confidence: number;
      groundMethod: string;
      matchedLength: number;
    }>;
  };
  const diagnosticsEqual = (a: HighlightDiagnostics | null, b: HighlightDiagnostics | null) => {
    if (a === b) return true;
    if (!a || !b) return false;
    if (a.page !== b.page || a.requestedCount !== b.requestedCount || a.groundedCount !== b.groundedCount || a.failedCount !== b.failedCount) return false;
    if (a.anchors.length !== b.anchors.length) return false;
    return a.anchors.every((x, i) => {
      const y = b.anchors[i];
      return x.evidenceRefId === y.evidenceRefId && x.role === y.role && x.sourceField === y.sourceField
        && x.confidence === y.confidence && x.groundMethod === y.groundMethod && x.matchedLength === y.matchedLength;
    });
  };
  const setHighlightDiagnosticsIfChanged = (next: HighlightDiagnostics | null) => {
    setHighlightDiagnostics((prev) => (diagnosticsEqual(prev, next) ? prev : next));
  };

  useEffect(() => {
    const pageText = pageTextByPage.get(`${bookIdRef.current}:${currentPage}`) ?? "";

    // Ground saved highlights (from RightPanel "Save to NoteLab" / "Save to Recall")
    // against this page's text using the same exact/normalized/semantic-recovery
    // fallback matching as live anchors. Anchors that fail grounding are still
    // included as a last resort so a saved highlight is never silently dropped.
    const groundSavedAnchors = (text: string): SynthHighlightAnchor[] => {
      if (!savedHighlightAnchors.length) return [];
      const sanitizedSaved = sanitizeHighlightAnchors(savedHighlightAnchors);
      const groundedSaved = groundHighlightAnchors(sanitizedSaved, text);
      const groundedKeys = new Set(groundedSaved.map(a => a.groundedText.toLowerCase().trim()));
      const fromGrounded = groundedSaved.map((a) => ({
        text:       a.groundedText,
        anchorType: a.anchorType as SynthHighlightAnchor["anchorType"],
        reason:     a.reason,
        spanStart:  a.spanStart ?? null,
        spanEnd:    a.spanEnd ?? null,
        priorityTier: a.priorityTier ?? null,
        domainCategory: a.domainCategory ?? null,
      }));
      const fallback = sanitizedSaved
        .filter(a => !groundedKeys.has(a.text.toLowerCase().trim()))
        .map((a) => ({
          text:       a.text,
          anchorType: a.anchorType as SynthHighlightAnchor["anchorType"],
          reason:     a.reason,
          spanStart:  a.spanStart ?? null,
          spanEnd:    a.spanEnd ?? null,
          priorityTier: a.priorityTier ?? null,
          domainCategory: a.domainCategory ?? null,
        }));
      return [...fromGrounded, ...fallback];
    };

    // ── No canonical units yet — keep existing highlights until extraction/model arrives ──
    if (!canonicalLeftPanelUnits.length && !currentPageStudyModel) {
      DEV && console.log("[HIGHLIGHT_PERSIST]", {
        page:          currentPage,
        reason:        canonicalLeftPanelDiagnostic ?? "canonical-units-loading",
        existingCount: finalHighlightAnchors.length,
      });
      return;
    }

    // ── Page text not yet extracted — wait; don't run semantic-only grounding ──
    // Grounding with empty pageText would set semantic text that SmartPDFViewer
    // can't locate in the PDF, so highlights wouldn't appear. Wait for real text.
    if (pageText.length < 30) {
      DEV && console.log("[LEFT_PANEL_GROUND_WAITING_FOR_TEXT]", {
        page:        currentPage,
        pageTextLen: pageText.length,
        anchorCount: canonicalLeftPanelUnits.length,
        note:        "skipping grounding — waiting for PDF text extraction",
      });
      return;
    }

    // ── Stale model for wrong page — clear live anchors, keep saved highlights ──
    if (currentPageStudyModel && currentPageStudyModel.page !== currentPage) {
      const savedGrounded = groundSavedAnchors(pageText);
      setFinalHighlightAnchorsIfChanged(savedGrounded);
      setHighlightDiagnosticsIfChanged(null);
      DEV && console.log("[HIGHLIGHT_CLEARED]", { page: currentPage, reason: "stale-page", modelPage: currentPageStudyModel.page });
      DEV && console.log("[SAVED_HIGHLIGHTS_MERGED]", { page: currentPage, liveCount: 0, savedCount: savedGrounded.length, mergedCount: savedGrounded.length, reason: "stale-page" });
      DEV && console.log("[LEFTPANEL_HIGHLIGHT_RENDER_COUNT]", { page: currentPage, count: savedGrounded.length });
      return;
    }

    const pageType   = currentPageStudyModel?.pageType ?? null;
    const visualAnchors = canonicalLeftPanelUnits;

    DEV && console.log("[LEFT_PANEL_VISUAL_ANCHORS_COUNT]", { page: currentPage, count: visualAnchors.length, roles: visualAnchors.map(a => a.category), source: "canonicalLeftPanelUnits" });
    visualAnchors.forEach((a) => {
      DEV && console.log("[LEFT_PANEL_ANCHOR_EXACT_TEXT]", { page: currentPage, id: a.id, role: a.category, sourceField: a.source, exactText: a.exactText.slice(0, 100) });
    });

    const pageRole = currentPageRoleRef.current;

    // ── Page classification ────────────────────────────────────────────────
    const conceptBlockCount = currentPageStudyModel?.conceptBlocks?.length ?? 0;
    DEV && console.log("[PAGE_CLASSIFY]", {
      page:              currentPage,
      pageType:          pageType ?? "unknown",
      pageRole:          pageRole ?? "unknown",
      visualAnchorCount: visualAnchors.length,
      conceptBlockCount,
      pageThesis:        currentPageStudyModel?.pageThesis?.slice(0, 60) ?? null,
    });

    // ── Non-instructional skip (two-tier) ──────────────────────────────────
    // Tier 1 — OpenAI's own pageType classification: always trusted.
    //   review_checkpoint / overview → no highlights regardless of local signals.
    // Tier 2 — local heuristic pageRole (chapter_opener, cover, contents…):
    //   trusted ONLY when AI itself found zero anchors. If OpenAI returned
    //   visualAnchors (meaning it sees instructional content), the local
    //   classifier is wrong — likely a stale ref from the previous page or a
    //   running-header false-positive. Showing AI highlights is always correct.
    // NON_INSTRUCTIONAL_ROLES used to be defined locally here; it's now
    // lib/insights/pageRoleGate.ts's isNoninstructionalPage(), the same
    // canonical gate the Surgeon annotation pipeline uses (see
    // useSurgeonAnnotations.ts's Effect B) — one definition instead of
    // three disagreeing ones.
    const NON_INSTRUCTIONAL_TYPES = new Set(["review_checkpoint", "overview"]);

    // Canonical evidence: only real model-backed anchors confirm instructional content —
    // page_text_fallback/model_fallback units are locally generated and must not bypass
    // the structural-page skip below (contents/glossary/chapter_opener, etc.).
    const aiConfirmsInstructional = visualAnchors.some((a) => a.source === "canonical_left_panel");

    DEV && console.log("[CLASSIFIER_EVIDENCE]", {
      page:                currentPage,
      pageType,
      pageRole,
      aiConfirmsInstructional,
      visualAnchorCountBeforeSkip: visualAnchors.length,
      conceptBlockCount,
      willCheckOpenAIType:  NON_INSTRUCTIONAL_TYPES.has(pageType ?? ""),
      willCheckLocalRole:   !aiConfirmsInstructional && isNoninstructionalPage(pageRole),
    });

    // Tier 1: always respect OpenAI's own type
    if (NON_INSTRUCTIONAL_TYPES.has(pageType ?? "")) {
      DEV && console.log("[NON_INSTRUCTIONAL_SKIP]", { page: currentPage, reason: "OpenAI pageType confirmed non-instructional", pageType: pageType ?? "none", pageRole: pageRole ?? "none" });
      DEV && console.log("[HIGHLIGHT_CLEARED]", { page: currentPage, reason: "openai-non-instructional-type", pageType });
      const savedGrounded = groundSavedAnchors(pageText);
      setFinalHighlightAnchorsIfChanged(savedGrounded);
      setHighlightDiagnosticsIfChanged({ page: currentPage, requestedCount: visualAnchors.length, groundedCount: 0, failedCount: visualAnchors.length, anchors: [] });
      DEV && console.log("[SAVED_HIGHLIGHTS_MERGED]", { page: currentPage, liveCount: 0, savedCount: savedGrounded.length, mergedCount: savedGrounded.length, reason: "openai-non-instructional-type" });
      DEV && console.log("[LEFTPANEL_HIGHLIGHT_RENDER_COUNT]", { page: currentPage, count: savedGrounded.length });
      return;
    }

    // Tier 2: local classifier only when AI found nothing
    if (!aiConfirmsInstructional && isNoninstructionalPage(pageRole)) {
      DEV && console.log("[NON_INSTRUCTIONAL_SKIP]", { page: currentPage, reason: "local pageRole + AI found zero anchors", pageType: pageType ?? "none", pageRole: pageRole ?? "none" });
      DEV && console.log("[HIGHLIGHT_CLEARED]", { page: currentPage, reason: "local-page-role-structural", pageRole });
      const savedGrounded = groundSavedAnchors(pageText);
      setFinalHighlightAnchorsIfChanged(savedGrounded);
      setHighlightDiagnosticsIfChanged({ page: currentPage, requestedCount: visualAnchors.length, groundedCount: 0, failedCount: visualAnchors.length, anchors: [] });
      DEV && console.log("[SAVED_HIGHLIGHTS_MERGED]", { page: currentPage, liveCount: 0, savedCount: savedGrounded.length, mergedCount: savedGrounded.length, reason: "local-page-role-structural" });
      DEV && console.log("[LEFTPANEL_HIGHLIGHT_RENDER_COUNT]", { page: currentPage, count: savedGrounded.length });
      return;
    }

    // If AI has anchors but local classifier fired chapter_opener — override logged here
    if (aiConfirmsInstructional && isNoninstructionalPage(pageRole)) {
      DEV && console.log("[PAGE_CLASSIFY_REASON]", {
        page:    currentPage,
        verdict: "instructional — AI anchors override stale local pageRole",
        pageRole,
        anchorCount: visualAnchors.filter((a) => a.source === "canonical_left_panel").length,
        note:    "local pageRole may be stale from previous page or running-header false-positive",
      });
    }

    DEV && console.log("[VISUAL_ANCHOR_COUNT_BEFORE_SKIP]", { page: currentPage, count: visualAnchors.length });

    // ── Empty canonicalLeftPanelUnits — no live highlights; saved highlights still render ──
    if (!visualAnchors.length) {
      DEV && console.log("[HIGHLIGHT_CLEARED]", { page: currentPage, reason: canonicalLeftPanelDiagnostic ?? "canonical-units-empty", note: "Canonical LeftPanel returned no units for this page" });
      const savedGrounded = groundSavedAnchors(pageText);
      setFinalHighlightAnchorsIfChanged(savedGrounded);
      setHighlightDiagnosticsIfChanged({ page: currentPage, requestedCount: 0, groundedCount: 0, failedCount: 0, anchors: [] });
      DEV && console.log("[SAVED_HIGHLIGHTS_MERGED]", { page: currentPage, liveCount: 0, savedCount: savedGrounded.length, mergedCount: savedGrounded.length, reason: "visual-anchors-empty" });
      DEV && console.log("[LEFTPANEL_HIGHLIGHT_RENDER_COUNT]", { page: currentPage, count: savedGrounded.length });
      return;
    }

    // ── Ground canonical LeftPanel units against PDF text ──────────────────
    // Allowed: sanitize + ground + budget.
    // Blocked: /api/score-anchors, universalSpecificityScore, all legacy fallbacks.
    // Pass ExpertAnchor.id through as evidenceRefId so left-panel overlay, speech, and
    // focusedEvidenceId all share the same stable ID (e.g. "va-0", "va-1").
    // Build a metadata map keyed by evidenceRefId so we can thread highlight scores and
    // effective priority tiers through the grounding pipeline without modifying its type.
    const metaByRefId = new Map(
      visualAnchors.map((a) => [a.evidenceRefId, {
        // highlightScore: lower = higher priority in the budget queue.
        // Role-level priority (speechPriority, 1–10) dominates; metadata bonuses are capped
        // at 0.95 total so domain-critical anchors never lose to metadata-inflated lesser ones.
        highlightScore: (a.speechPriority ?? a.priorityTier ?? 5)
          - (a.misconceptionRisk      ?? 0) * 0.4
          - (a.proceduralImportance   ?? 0) * 0.3
          - (a.thesisRelevance        ?? 0) * 0.15
          - (a.connectionStrength     ?? 0) * 0.1,
        // effectivePriorityTier: boost by 1 for confusionTrap/high-procedural anchors so the
        // PDF glow (scaled by priorityTier in PdfEvidenceOverlay) is visually stronger.
        effectivePriorityTier: Math.min(5,
          (a.priorityTier ?? 3)
          + ((a.misconceptionRisk ?? 0) >= 0.8 || (a.proceduralImportance ?? 0) >= 1.0 ? 1 : 0)
        ),
      }])
    );

    const rawForGrounding = visualAnchors.map((a) => ({
      text:          a.exactText,
      anchorType:    a.category === "clinical" ? "clinical_pearl" : a.category === "memoryAnchor" ? "memory_hook" : a.category === "keyAnatomy" ? "anatomy" : a.category === "keyDetail" ? "dat_fact" : a.category === "unknown" ? "dat_fact" : a.category,
      reason:        a.reason,
      spanStart:     a.spanStart ?? null,
      spanEnd:       a.spanEnd   ?? null,
      priorityTier:  a.priorityTier ?? null,
      domainCategory: a.domainCategory ?? null,
      evidenceRefId: a.evidenceRefId,
    })) as (SynthHighlightAnchor & { evidenceRefId: string })[];

    // Filter: all VisualAnchorRole values reach the PDF overlay — including
    // "definition" and "keyDetail", which prove definitions/details on the page.
    const OVERLAY_ROLES = new Set(["thesis", "definition", "mechanism", "trap", "application", "formula", "example_step", "conclusion", "dat_fact", "clinical_pearl", "memory_hook", "anatomy", "comparison", "reference", "filler", "unknown"]);
    const roleFiltered = rawForGrounding.filter(a => OVERLAY_ROLES.has(a.anchorType));
    DEV && console.log("[HIGHLIGHT_GROUND_START]", { page: currentPage, inputCount: visualAnchors.length, roleFilteredCount: roleFiltered.length, ids: roleFiltered.map(a => (a as any).evidenceRefId), source: "canonicalLeftPanelUnits" });
    const sanitized = sanitizeHighlightAnchors(roleFiltered);
    const grounded  = groundHighlightAnchors(sanitized, pageText);
    DEV && console.log("[LEFT_PANEL_GROUND_RESULT]", {
      page:         currentPage,
      inputCount:   visualAnchors.length,
      groundedCount: grounded.length,
      failedCount:  visualAnchors.length - grounded.length,
      failedTexts:  visualAnchors
        .filter(a => !grounded.find(g => g.groundedText?.toLowerCase().includes(a.exactText.toLowerCase().slice(0, 20))))
        .map(a => a.exactText.slice(0, 60)),
      groundMethods: grounded.map(g => g.groundMethod),
      source: "groundHighlightAnchors(canonicalLeftPanelUnits)",
    });
    if (grounded.length === 0 && visualAnchors.length > 0) {
      console.warn("[LEFT_PANEL_GROUND_FAILED]", {
        page:        currentPage,
        reason:      "all anchors failed grounding — pageText may be empty or anchors are paraphrased",
        pageTextLen: pageText.length,
        anchorTexts: visualAnchors.map(a => a.exactText.slice(0, 60)),
      });
    }

    const groundedAnchors = grounded.map((a) => {
      const refId = (a as any).evidenceRefId as string | undefined;
      const meta  = refId ? metaByRefId.get(refId) : undefined;
      return {
        text:          a.groundedText,
        anchorType:    a.anchorType as SynthHighlightAnchor["anchorType"],
        reason:        a.reason,
        spanStart:     a.spanStart ?? null,
        spanEnd:       a.spanEnd   ?? null,
        // Use effectivePriorityTier so PdfEvidenceOverlay gives a stronger glow to
        // high-misconceptionRisk and high-proceduralImportance anchors.
        priorityTier:  meta?.effectivePriorityTier ?? a.priorityTier ?? null,
        domainCategory: a.domainCategory ?? null,
        evidenceRefId: refId,
        // _highlightScore threads through to applyHighlightBudget for pre-sort.
        _highlightScore: meta?.highlightScore ?? (a.priorityTier ?? 5),
      };
    });

    // Dev-mode diagnostics snapshot — same grounded/confidence/groundMethod data
    // already computed above, just retained instead of discarded after the logs.
    const anchorById = new Map(visualAnchors.map((a) => [a.evidenceRefId, a]));
    setHighlightDiagnosticsIfChanged({
      page: currentPage,
      requestedCount: visualAnchors.length,
      groundedCount: grounded.length,
      failedCount: visualAnchors.length - grounded.length,
      anchors: grounded.map((a) => {
        const refId = (a as any).evidenceRefId as string | undefined;
        const source = refId ? anchorById.get(refId) : undefined;
        return {
          evidenceRefId: refId,
          role: a.anchorType,
          sourceField: source?.source,
          confidence: a.confidence,
          groundMethod: a.groundMethod,
          matchedLength: a.groundedText.trim().split(/\s+/).filter(Boolean).length,
        };
      }),
    });

    DEV && console.log("[LEFT_PANEL_SOURCE]", {
      source:     "canonicalLeftPanelUnits",
      page:       currentPage,
      count:      groundedAnchors.length,
      ids:        groundedAnchors.map((a) => a.evidenceRefId),
      firstTexts: groundedAnchors.slice(0, 3).map((a) => a.text?.slice(0, 60)),
    });

    DEV && console.log("[VISUAL_ANCHOR_COUNT_AFTER_SKIP]", {
      page:          currentPage,
      inputAnchors:  visualAnchors.length,
      groundedCount: grounded.length,
      finalCount:    groundedAnchors.length,
    });

    // One-to-one canonical integrity snapshot — every surface should map to the same IDs.
    // Cross-reference with [SPEECH_INTEGRITY] (speech engine) to verify full coverage.
    const groundedIdSet = new Set(groundedAnchors.map(a => a.evidenceRefId).filter(Boolean));
    const studyNoteAnchorIds = currentPageStudyModel?.studyNoteAnchorIds ?? {};
    DEV && console.log("[CANONICAL_INTEGRITY]", {
      page: currentPage,
      canonicalIds:     visualAnchors.map(a => a.evidenceRefId),
      pdfTargetCount:   groundedAnchors.length,   // PDF highlight targets
      leftPanelCards:   groundedAnchors.length,   // 1:1 with grounded anchors
      studyNoteLinks:   Object.entries(studyNoteAnchorIds)
        .filter(([, id]) => id !== null)
        .map(([field, id]) => ({ field, id, resolved: groundedIdSet.has(id!) })),
      unlinkedNoteFields: Object.entries(studyNoteAnchorIds)
        .filter(([, id]) => id === null).map(([f]) => f),
      danglingNoteIds:  Object.values(studyNoteAnchorIds)
        .filter(id => id !== null && !groundedIdSet.has(id!)),
      // speechSegmentCount: see [SPEECH_INTEGRITY] log from buildSpeechTimeline
    });

    // ── Merge in saved highlights from RightPanel "Save to NoteLab" / "Save to Recall" ──
    // Saved highlights are deduped against live anchors by normalized text; saved
    // entries are checked first so a previously-saved highlight is never dropped.
    const savedGrounded = groundSavedAnchors(pageText);
    const seenTexts = new Set<string>();
    const merged: SynthHighlightAnchor[] = [];
    for (const a of [...savedGrounded, ...(groundedAnchors as SynthHighlightAnchor[])]) {
      const key = (a.text ?? "").toLowerCase().trim();
      if (!key || seenTexts.has(key)) continue;
      seenTexts.add(key);
      merged.push(a);
    }

    setFinalHighlightAnchorsIfChanged(merged);
    DEV && console.log("[SAVED_HIGHLIGHTS_MERGED]", { page: currentPage, liveCount: groundedAnchors.length, savedCount: savedGrounded.length, mergedCount: merged.length });
    DEV && console.log("[LEFTPANEL_HIGHLIGHT_RENDER_COUNT]", { page: currentPage, count: merged.length });
    DEV && console.log("[HIGHLIGHT_SOURCE_AUDIT]", {
      page:                       currentPage,
      source:                     "finalStudyModel.visualAnchors + savedHighlightsStore",
      legacyHighlightTargets:     "removed",
      legacyHighlightNeighborhoods: "removed",
      legacyPriorityHighlights:   "not-passed-to-render",
      finalAnchors:               merged.length,
    });
    DEV && console.log("[LEFT_PANEL_LEGACY_DISABLED]", {
      page: currentPage,
      note: "priorityHighlights may remain for Right Panel context only — never fed to PDF overlay",
    });
    DEV && console.log("[LEFT_PANEL_FALLBACK_DISABLED]", {
      page: currentPage,
      note: "no /api/score-anchors, universalSpecificityScore, or localStorage fallback — visualAnchors + savedHighlightsStore only",
    });
  }, [currentPageStudyModel, canonicalLeftPanelUnits, canonicalLeftPanelDiagnostic, currentPage, pageTextByPage, savedHighlightAnchors]);

  // Teaching sequence for Universal Recall Lab (shared with WhiteboardPanel Teach tab)
  const currentPageNoteCards = useMemo((): NoteCard[] | null => {
    if (!currentPageStudyModel) return null;
    const sm = currentPageStudyModel as any;
    if (Array.isArray(sm.noteCards) && sm.noteCards.length > 0) return sm.noteCards as NoteCard[];
    try { return deriveNoteCardsFromStudyModel(currentPageStudyModel); } catch { return null; }
  }, [currentPageStudyModel]);

  const activeCanonicalThoughtUnit = useMemo(
    () => canonicalLeftPanelUnits.find((unit) => unit.evidenceRefId === focusedEvidenceId || unit.id === focusedEvidenceId) ?? canonicalLeftPanelUnits[0] ?? null,
    [canonicalLeftPanelUnits, focusedEvidenceId],
  );

  /* =========================================================================
     🔹 Unified Annotation Store (P0.1) - Shared between Surgeon View + NoteLab
  ========================================================================= */
  const {
    annotations: storeAnnotations,
    viewMode: annotationViewMode,
    pendingHighlight,
    addAnnotation,
    updateAnnotation: updateStoreAnnotation,
    deleteAnnotation: deleteStoreAnnotation,
    setPendingHighlight,
    confirmHighlight,
    cancelHighlight,
    toggleCleanMode,
    getAnnotationsForPage,
    getHighlightsOnly,
    getMistakes
  } = useAnnotationStore();

  /* =========================================================================
     🔹 Cognitive Engine Store (Surgeon View 2.0)
  ========================================================================= */
  const {
    insights,
    decisionRules,
    clinicalIQ,
    expertMode,
    insightPanel,
    openInsightPanel,
    closeInsightPanel,
    toggleExpertMode,
    setExpertMode,
    getActiveRules,
  } = useCognitiveEngineStore();

  // State for insight panel
  const [selectedInsight, setSelectedInsight] = useState<any>(null);

  /* =========================================================================
     🔹 Surgeon View PDRM State
  ========================================================================= */
  const [notes, setNotes] = useState<any[]>([]);
  const [flashcards, setFlashcards] = useState<any[]>([]);
  const [hyperChunks, setHyperChunks] = useState<any[]>([]);
  const [highlights, setHighlights] = useState<any[]>([]);

  /* =========================================================================
     🔹 Local Storage Persistence for Guest Mode
  ========================================================================= */
  // Save session state to localStorage
  const saveSessionState = () => {
    if (typeof window === 'undefined') return;
    
    try {
      const sessionState = {
        viewMode,
        currentPage,
        currentThoughtUnit,
        pdfPageCount,
        themeMode,
        readingMode,
        learningProfile,
        fontSize,
        lineSpacing,
        // blob: URLs are session-scoped and invalid after refresh — never persist them
        fileUrl: fileUrl?.startsWith('blob:') ? null : fileUrl,
        thoughtUnitsCount: thoughtUnits.length,
        bookId,
        // IDB document ID lets us reconstruct the blob URL after refresh
        currentLocalDocumentId,
        timestamp: Date.now(),
      };
      
      localStorage.setItem('thoughtUnitReader_session', JSON.stringify(sessionState));
      DEV && console.log('💾 Session state saved to localStorage');
    } catch (error) {
      console.warn('Failed to save session state:', error);
    }
  };

  // Restore session state from localStorage
  const restoreSessionState = () => {
    if (typeof window === 'undefined') return null;
    
    try {
      const saved = localStorage.getItem('thoughtUnitReader_session');
      if (!saved) return null;
      
      const sessionState = JSON.parse(saved);
      
      // Check if session is recent (within 24 hours)
      const age = Date.now() - (sessionState.timestamp || 0);
      if (age > 24 * 60 * 60 * 1000) {
        DEV && console.log('⏰ Session expired, clearing...');
        localStorage.removeItem('thoughtUnitReader_session');
        return null;
      }
      
      DEV && console.log('📂 Session state restored from localStorage');
      return sessionState;
    } catch (error) {
      console.warn('Failed to restore session state:', error);
      return null;
    }
  };

  // Auto-save on important state changes
  useEffect(() => {
    if (fileUrl && thoughtUnits.length > 0) {
      saveSessionState();
    }
  }, [viewMode, currentPage, themeMode, readingMode, fileUrl, thoughtUnits.length]);

  // Restore session on mount
  useEffect(() => {
    const restored = restoreSessionState();
    if (!restored) return;

    setViewMode(
      ((restored.viewMode === "toc" || restored.viewMode === "syllabus" || restored.viewMode === "notelab" || restored.viewMode === "study")
        ? restored.viewMode
        : "reader") as WorkspaceMode
    );
    setCurrentPage(restored.currentPage || 1);
    setCurrentThoughtUnit(restored.currentThoughtUnit || 1);
    setThemeMode(restored.themeMode || (restored.darkMode ? "dark" : "light") || "dark");
    setReadingMode(restored.readingMode || ((restored.fontFamily || "").includes("Comic") ? "dyslexia" : "normal"));
    const VALID_PROFILES: LearningProfile[] = ["standard", "dental", "medical", "surgeon", "dat"];
    if (restored.learningProfile && VALID_PROFILES.includes(restored.learningProfile as LearningProfile)) {
      setLearningProfile(restored.learningProfile as LearningProfile);
    }
    setFontSize(restored.fontSize || 16);
    setLineSpacing(restored.lineSpacing || 1.5);

    // Reconstruct the last-opened PDF from IDB so the reader resumes without re-uploading.
    if (restored.currentLocalDocumentId) {
      (async () => {
        try {
          const data = await getDocumentFile(restored.currentLocalDocumentId);
          if (!data) return; // binary was cleared from IDB — user will need to re-upload
          const blob = new Blob([data], { type: 'application/pdf' });
          const sessionUrl = createBlobUrl(blob);
          setCurrentLocalDocumentId(restored.currentLocalDocumentId);
          setFileUrl(sessionUrl);
          generateTOC(sessionUrl).then(setTableOfContents).catch(() => {});
          const restoredBookId = restored.bookId || 'book';
          startBookProcessing(
            new File([blob], restoredBookId + '.pdf', { type: 'application/pdf' }),
            restoredBookId,
            restored.currentPage || 1,
            restored.currentLocalDocumentId,
          );
        } catch {
          // Non-fatal — reader starts empty, user can re-upload
        }
      })();
    }
  }, []);

  // "View Source in Reader" deep-link — written by DAT Apex before navigating
  // here. Consumed exactly once on mount (readAndClearViewSourceLink clears
  // the localStorage entry immediately, so a reload never re-applies a stale
  // link) and staged into pendingViewSourceLink rather than acted on
  // directly — session restore may still be in flight, so bookId here can
  // be one render behind the book that's actually about to load.
  useEffect(() => {
    const link = readAndClearViewSourceLink();
    if (link) setPendingViewSourceLink(link);
  }, []);

  // Applies the pending link the moment the open book's bookId actually
  // matches it — whether that's because session restore just finished
  // loading the right book, or because the user picked it from the
  // library via the mismatch prompt below (handleViewSourcePickFromLibrary).
  // Re-evaluates on every bookId change, so it isn't a one-shot check that
  // could miss the match arriving a render later.
  useEffect(() => {
    if (!pendingViewSourceLink) return;
    if (!bookId || bookId !== pendingViewSourceLink.documentId) return;
    setCurrentPage(pendingViewSourceLink.pageNumber);
    if (pendingViewSourceLink.quote) {
      setViewSourceBanner({ pageNumber: pendingViewSourceLink.pageNumber, quote: pendingViewSourceLink.quote });
    }
    setPendingViewSourceLink(null);
  }, [bookId, pendingViewSourceLink, setCurrentPage]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", themeMode === "dark");
  }, [themeMode]);

  useEffect(() => {
    setActiveShellTab(viewMode);
  }, [viewMode]);

  const [showLibrary, setShowLibrary] = useState(false);
  const [pdfLibrary, setPdfLibrary] = useState<
    { id: string; name: string; url: string; uploadedAt: any; isLocal?: boolean; localDocumentId?: string }[]
  >([]);

  // User-driven fallback for a pending view-source link whose book isn't
  // already open — looks the source book up in the library by filename and
  // loads it; the effect above (right after pendingViewSourceLink's own
  // declaration) then applies the page jump once bookId catches up. Never
  // auto-loads on its own (the library can still be loading when the link
  // first arrives), so this only ever fires from an explicit click.
  // handleLoadPDF is declared much later in this component — called via a
  // ref (populated just after its own declaration) to avoid a TDZ error,
  // same pattern syncToPageRef uses for the same reason.
  const handleViewSourcePickFromLibrary = useCallback(() => {
    if (!pendingViewSourceLink) return;
    const match = pdfLibrary.find(
      (p) => p.name.replace(/\.[Pp][Dd][Ff]$/, "") === pendingViewSourceLink.documentId,
    );
    if (match) {
      handleLoadPDFRef.current?.(match.url, match.name, match.localDocumentId);
    } else {
      setShowLibrary(true);
    }
  }, [pendingViewSourceLink, pdfLibrary]);
  // Entry shown when a local book's binary can't be found in IndexedDB
  const [missingPDFEntry, setMissingPDFEntry] = useState<{ name: string; documentId: string } | null>(null);

  // Restore local (guest) library from localStorage on mount.
  // Firebase library is restored via the auth useEffect; local entries live here.
  const LOCAL_LIBRARY_KEY = 'avrrio-local-library';
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LOCAL_LIBRARY_KEY);
      if (raw) {
        const entries = JSON.parse(raw) as Array<{
          id: string; name: string; uploadedAt: string; localDocumentId: string;
        }>;
        if (Array.isArray(entries) && entries.length > 0) {
          setPdfLibrary(prev => {
            // Merge: local entries first, avoid duplicates by id
            const existingIds = new Set(prev.map(e => e.id));
            const fresh = entries
              .filter(e => e.id && e.name && e.localDocumentId && !existingIds.has(e.id))
              .map(e => ({ id: e.id, name: e.name, url: '', uploadedAt: e.uploadedAt, isLocal: true, localDocumentId: e.localDocumentId }));
            return fresh.length > 0 ? [...fresh, ...prev] : prev;
          });
        }
      }
    } catch {
      // Non-fatal — stale or corrupted entry; user just re-uploads
    }
  }, []);

  // Attachments + modal
  const [attachments, setAttachments] = useState<string[]>([]);
  const [showLinkModal, setShowLinkModal] = useState(false);
  // bookId and setBookId come from useCurrentLearningContext (declared near top of component).
  const bookIdRef = useRef("default-book");
  useEffect(() => { bookIdRef.current = bookId; }, [bookId]);
  // Keep documentTitle in CLC in sync with bookId (the PDF filename without extension).
  useEffect(() => { if (bookId) setDocumentTitle(bookId); }, [bookId, setDocumentTitle]);
  // useKnowledgeGraph must be called after bookId is available
  const { nodes: kgNodes, selectedNodeId: kgSelectedNodeId, setSelectedNodeId: kgSetSelectedNodeId } = useKnowledgeGraph(bookId || null);

  // ── KG selection → navigate reader + highlight anchor ─────────────────────
  useEffect(() => {
    if (!selectedKgNodeId || selectedKgNodeId === lastNavigatedKgNodeRef.current) return;
    const node = kgNodes.find((n) => n.id === selectedKgNodeId);
    if (!node) return;
    lastNavigatedKgNodeRef.current = selectedKgNodeId;
    if (node.sourcePages.length > 0) {
      syncToPage(node.sourcePages[0], { reason: "TOC_JUMP" });
      trySwitchShellTab("reader", "reader");
    }
    if (node.canonicalAnchorId) {
      setFocusedEvidenceId(node.canonicalAnchorId);
    }
  }, [selectedKgNodeId, kgNodes]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const pageText = pageTextByPage.get(`${bookId}:${currentPage}`) || "";
    // Guard against a stale currentPageStudyModel racing this effect on page
    // OR document change: the effect that nulls currentPageStudyModel on
    // navigation (see "Clear stale synthesis state" above) and this effect
    // both fire in the same post-commit flush, so this effect can still see
    // the PREVIOUS page/document's model here for one pass. Without this
    // check, canonicalLeftPanelUnits gets built from that stale model's
    // visualAnchors (a different subject's content, possibly a different
    // document entirely) but stamped with the NEW currentPage — the same
    // class of bug the "stale-page" guard below already handles for
    // finalHighlightAnchors, just missing here at the point
    // canonicalLeftPanelUnits is actually produced. Confirmed root cause of a
    // report where a chemistry page's Chief Resident request (canonicalEntries
    // sourced from this array) answered about cell signaling instead — the
    // original fix only checked page number, not document identity, so a
    // document switch landing on the same page number could still leak a
    // stale model through this guard.
    const freshStudyModel = (!currentPageStudyModel || (currentPageStudyModel.page === currentPage && currentPageStudyModel.bookId === bookId))
      ? currentPageStudyModel
      : null;
    const built = buildCanonicalLeftPanelUnits({
      page: currentPage,
      pageText,
      studyModel: freshStudyModel,
      presetId: sharedPresetId,
      bookId,
    });
    // Content-equality guard: avoid cascading re-renders when unit IDs and text are unchanged.
    // Without this, every studyModel rebuild (e.g. from a preset change) re-creates the array,
    // causing resolveEvidenceId → handleActiveParagraphChange → SmartPDFViewer to all rebuild.
    setCanonicalLeftPanelUnits((prev) => {
      if (
        prev.length === built.units.length &&
        prev.every((u, i) => u.id === built.units[i]?.id && u.exactText === built.units[i]?.exactText)
      ) return prev;
      return built.units;
    });
    setCanonicalLeftPanelDiagnostic(built.diagnosticReason);
    // Secondary domain seed: if the filename didn't yield a domain match but the
    // anchor texts do, promote to the detected domain now. Guards against the
    // "generic filename, domain-specific content" case. Runs at most once per
    // page because the second run finds sharedPresetId !== "universal".
    if (sharedPresetId === "universal" && built.units.length > 0) {
      const anchorSample = built.units.map((u) => u.exactText).join(" ");
      const contentSeed = detectDomainPreset(anchorSample, undefined, uploadedFile?.name);
      if (contentSeed !== "universal") setSharedPresetId(contentSeed);
    }
    DEV && console.log("[LEFT_PANEL_CANONICAL_READY]", {
      thoughtUnitId: built.units[0]?.id ?? null,
      source: built.units[0]?.source ?? "none",
      page: currentPage,
      sourceText: built.units[0]?.exactText.slice(0, 80) ?? null,
      fallbackUsed: built.fallbackUsed,
      count: built.units.length,
      diagnosticReason: built.diagnosticReason,
    });
  }, [bookId, currentPage, currentPageStudyModel, pageTextByPage, sharedPresetId]);

  // ── Stable derived arrays for RightPanel / StudySpeechPanel ─────────────────
  // These three values all land in StudySpeechPanel's segment-rebuild effect deps.
  // Without memoization, every index.tsx re-render (driven by per-word Zustand
  // writes at 4-30 Hz during TTS) creates new array references → Effect C fires
  // on every word tick → setSegments every tick → React #185 on tab click.
  const safeHighlightAnchors = useMemo(() => {
    if (!finalHighlightAnchors.length) return [] as typeof finalHighlightAnchors;
    const pageTextForBudget = pageTextByPage.get(`${bookId}:${currentPage}`) ?? "";
    const isMathPage = finalHighlightAnchors.some(
      (a) => a.anchorType === "formula" || a.anchorType === "example_step" || a.anchorType === "conclusion"
    );
    return applyHighlightBudget(finalHighlightAnchors, pageTextForBudget, isMathPage, currentPage);
  }, [finalHighlightAnchors, pageTextByPage, bookId, currentPage]);

  const highlightedAnchorTexts = useMemo(
    () => safeHighlightAnchors.map((a) => a.text),
    [safeHighlightAnchors]
  );

  const enrichedCanonicalUnits = useMemo(
    () =>
      canonicalLeftPanelUnits.map((unit) => ({
        ...unit,
        grounded: safeHighlightAnchors.some((a) => (a as any).evidenceRefId === unit.evidenceRefId),
      })),
    [canonicalLeftPanelUnits, safeHighlightAnchors]
  );

  // Log when the budgeted anchor set actually changes (not on every render).
  useEffect(() => {
    if (!safeHighlightAnchors.length) {
      DEV && console.log("[HIGHLIGHT_RENDERED]", {
        page:     currentPage,
        count:    0,
        reason:   "no-grounded-anchors",
        hasModel: !!currentPageStudyModel,
      });
      return;
    }
    DEV && console.log("[HIGHLIGHT_RENDERED]", {
      page:       currentPage,
      count:      safeHighlightAnchors.length,
      ids:        (safeHighlightAnchors as any[]).map((a) => (a as any).evidenceRefId),
      source:     "canonicalLeftPanelUnits",
      firstTexts: safeHighlightAnchors.slice(0, 3).map((a) => a.text?.slice(0, 60)),
    });
  }, [safeHighlightAnchors, currentPage, currentPageStudyModel]);

  // Record this page as visited — the durable signal Syllabus's chapter-level
  // "Read %" is computed from (see lib/syllabus/chapterProgress.ts). Without this,
  // there is no persisted record of which pages a student has actually been on.
  useEffect(() => {
    recordPageVisit(bookId, currentPage);
  }, [bookId, currentPage]);

  // Load saved highlights (from RightPanel "Save to NoteLab" / "Save to Recall")
  // for the active book/page so they can be merged into finalHighlightAnchors below.
  useEffect(() => {
    let cancelled = false;
    getHighlightsForPage(bookId, currentPage).then((saved: SavedHighlight[]) => {
      if (cancelled) return;
      DEV && console.log("[SAVED_HIGHLIGHTS_LOADED]", { bookId, page: currentPage, count: saved.length });
      setSavedHighlightAnchors(saved.map((h) => ({
        text: h.text,
        anchorType: h.anchorType as SynthHighlightAnchor["anchorType"],
        reason: h.reason,
        spanStart: null,
        spanEnd: null,
        priorityTier: null,
        domainCategory: null,
      })));
    }).catch((e) => {
      console.warn("[SAVED_HIGHLIGHTS_LOAD_ERROR]", { bookId, page: currentPage, error: String(e) });
    });
    return () => { cancelled = true; };
  }, [bookId, currentPage]);

  // Clear stale left-panel highlight state on page or book identity change so the
  // overlay never shows highlights computed for a different page/book.
  useEffect(() => {
    setCurrentPageStudyModel(null);
    setFinalHighlightAnchors([]);
    DEV && console.log("[LEFT_PANEL_STALE_CLEARED]", { reason: "page-or-book-changed", bookId, page: currentPage });
  }, [bookId, currentPage]);
  const [rightPanelState, setRightPanelState] = useState<RightPanelState>({
    ...DEFAULT_RIGHT_PANEL_STATE,
    workspaceMode: "reader",
    documentId: "default-book",
    activeDocumentId: "default-book",
    currentPageVersion: buildCurrentPageVersion("default-book", 1, null),
  });
  const [unifiedPanelState, setUnifiedPanelState] = useState<UnifiedRightPanelState>({
    activeTab: "insights",
    audience: "clinical",   // operator-level extraction quality
    depth: "standard",
    density: "expanded",
  });
  const [focusSettings, setFocusSettings] = useState({ focus: 1500, shortBreak: 300, longBreak: 900 });
  const [ambientUrl, setAmbientUrl] = useState("");
  const [cycleCount, setCycleCount] = useState(0);
  const [focusInterruptions, setFocusInterruptions] = useState(0);
  const [focusInterruptionLabel, setFocusInterruptionLabel] = useState<string | null>(null);
  const [focusSoftLock, setFocusSoftLock] = useState(true);
  const [showAmbientPanel, setShowAmbientPanel] = useState(false);
  const [focusState, setFocusState] = useState<{ mode: "focus" | "short_break" | "long_break"; time: number; running: boolean }>({
    mode: "focus",
    time: 1500,
    running: false,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedAmbient = localStorage.getItem("avrrio-ambient-url");
    if (storedAmbient) setAmbientUrl(storedAmbient);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!ambientUrl) return;
    safeSetItem("avrrio-ambient-url", ambientUrl);
  }, [ambientUrl]);

  useEffect(() => {
    if (!focusState.running) return;
    const timer = window.setInterval(() => {
      setFocusState((prev) => {
        if (prev.time > 1) return { ...prev, time: prev.time - 1 };
        if (prev.mode === "focus") {
          setCycleCount((c) => c + 1);
          // Stop at 0 — session summary modal shown via effect
          return { mode: "focus", time: 0, running: false };
        }
        // Break ends → auto-restart focus
        return { mode: "focus", time: focusSettings.focus, running: true };
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [focusState.running, focusSettings]);

  // Show session summary when a focus phase completes (time hits 0)
  useEffect(() => {
    if (focusState.mode === "focus" && focusState.time === 0 && !focusState.running) {
      setShowSessionSummary(true);
    }
  }, [focusState.mode, focusState.time, focusState.running]);

  // Track pages visited during active focus sessions
  useEffect(() => {
    if (!focusState.running || focusState.mode !== "focus") return;
    setSessionPagesVisited((prev) => new Set([...prev, currentPage]));
  }, [currentPage, focusState.running, focusState.mode]);

  useEffect(() => {
    if (!focusState.running) return;
    const registerInterruption = (reason: string) => {
      setFocusInterruptions((prev) => prev + 1);
      setFocusInterruptionLabel(reason);
      setFocusState((prev) => ({ ...prev, running: false }));
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") registerInterruption("Tab hidden — session auto-paused.");
    };
    const onBlur = () => registerInterruption("Window lost focus — session auto-paused.");
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
    };
  }, [focusState.running]);

  const trySwitchShellTab = useCallback((tab: WorkspaceMode, nextViewMode?: WorkspaceMode) => {
    const isProtected = !["reader", "toc", "syllabus", "podcast"].includes(tab);
    if (focusSoftLock && focusState.running && isProtected) {
      const ok = window.confirm("Focus Cycle is active. Leave Reader cockpit and pause focus session?");
      if (!ok) return;
      setFocusState((prev) => ({ ...prev, running: false }));
      setFocusInterruptionLabel("Manual switch away from reader during focus.");
      setFocusInterruptions((prev) => prev + 1);
    }
    if (nextViewMode) setViewMode(nextViewMode);
    setActiveShellTab(tab);
  }, [focusSoftLock, focusState.running]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      safeSetItem("avrrio-shell-tab", activeShellTab);
    }
  }, [activeShellTab]);

  const focusModeLabel = focusState.mode === "focus" ? "Focus" : focusState.mode === "short_break" ? "Short Break" : "Long Break";

  // ✅ Auto-whiteboard control + data
  const [autoWhiteboard, setAutoWhiteboard] = useState<boolean>(false);
  const [showWhiteboardPanel, setShowWhiteboardPanel] = useState<boolean>(false);
  const [professorAutoStart, setProfessorAutoStart] = useState(false);
  // Correction — Professor Mode's default surface is the PDF, never an
  // opaque Whiteboard modal. "whiteboard" is now something TldrawCanvas
  // itself asks for (a real visualNeeded step, or a genuine loading/error/
  // config diagnostic via reason:"diagnostic" — see its own comment), never
  // something the shell assumes before a lesson plan says otherwise.
  const [professorSurface, setProfessorSurface] = useState<"pdf" | "whiteboard">("pdf");
  const [wbConcept, setWbConcept] = useState<string>("");
  const [wbContext, setWbContext] = useState<string>("");
  const [wbStickyNotes, setWbStickyNotes] = useState<StickyNote[]>([]);
  const lastDetectedUnitRef = useRef<string | null>(null);

  useEffect(() => {
    if (showWhiteboardPanel) return;
    setProfessorAutoStart(false);
    setProfessorSurface("whiteboard");
  }, [showWhiteboardPanel]);

  // ✅ Recall Lab v2 — thought-unit box layout, opened from RightPanel/LeftPanel/NoteLab
  const [recallLabOpenUnit, setRecallLabOpenUnit] = useState<ThoughtUnitDetail | null>(null);

  // 📑 TOC Panel control (like whiteboard)
  const [showTOCPanel, setShowTOCPanel] = useState<boolean>(false);
  const [showFocusControls, setShowFocusControls] = useState(false);
  const [showSessionSummary, setShowSessionSummary] = useState(false);
  const [sessionPagesVisited, setSessionPagesVisited] = useState<Set<number>>(new Set());
  const [sessionNotesCount, setSessionNotesCount] = useState(0);
  const [sessionCardsCount, setSessionCardsCount] = useState(0);


  // 💭 Thought Detection Panel
  const [detectedThoughts, setDetectedThoughts] = useState<Array<{
    id: string;
    text: string;
    analysis: any;
    timestamp: Date;
    page?: number;
  }>>([]);

  // ✅ PDF Parsing State Management
  const [pdfParsingState, setPdfParsingState] = useState<{
    isLoading: boolean;
    error: string | null;
    progress: string;
  }>({
    isLoading: false,
    error: null,
    progress: "",
  });

  const [bookProcessingStatus, setBookProcessingStatus] = useState<{
    phase: 'idle' | 'processing' | 'done' | 'error';
    progress: string;
    pagesProcessed: number;
    totalPages: number;
  }>({ phase: 'idle', progress: '', pagesProcessed: 0, totalPages: 0 });
  const [indexingPaused, setIndexingPaused] = useState(false);
  // Ref mirrors indexingPaused so the extraction closure can read live state.
  const indexingPausedRef = useRef(false);
  // Holds the resolve() for the pause-gate promise so we can resume from UI.
  const indexingResumeRef = useRef<(() => void) | null>(null);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);

  const activePageContextForInsights = useMemo<ActivePageContext>(() => {
    const currentChapter = tableOfContents.find((entry, idx) => {
      const nextEntry = tableOfContents[idx + 1];
      return entry.pageNumber <= currentPage && (!nextEntry || nextEntry.pageNumber > currentPage);
    });
    // Strict binding: only use text that PDF.js has confirmed belongs to this exact
    // page. The previous unitFallback (thoughtUnits[currentThoughtUnit-1].text) was
    // feeding chapter-title or wrong-page text into the intelligence pipeline, causing
    // normalizeClinicalText to classify real content pages as "chapter_title".
    const activePageText = pageTextByPage.get(`${bookId}:${currentPage}`) || "";
    const nearestSyllabusNode = flattenTocNodes(syllabusToc).find((node) => node.page === currentPage) || null;
    return {
      documentId: bookId,
      documentTitle: sanitizeDocTitle(currentChapter?.title, uploadedFile?.name || "Document"),
      pageNumber: currentPage,
      totalPages: pdfPageCount || 1,
      nearbyText: [
        thoughtUnits?.[Math.max(0, currentThoughtUnit - 2)]?.text || "",
        thoughtUnits?.[Math.min(thoughtUnits.length - 1, currentThoughtUnit)]?.text || "",
      ].filter(Boolean).join("\n\n"),
      activeTopicTitle: nearestSyllabusNode?.title || undefined,
      activeTopicKind: nearestSyllabusNode?.kind || null,
      chapterTitle: currentChapter?.title || null,
      sectionTitle: titleForPage(tableOfContents, currentPage),
      pageText: activePageText,
      paragraphTexts: splitParagraphs(activePageText),
      formulas: extractFormulaCards(activePageText),
    };
  }, [bookId, currentPage, currentThoughtUnit, pageTextByPage, pdfPageCount, syllabusToc, tableOfContents, thoughtUnits, uploadedFile?.name]);

  // True once PDF.js has delivered ≥50 chars of text for the current page via
  // onGetTextSuccess. Keyed by the same compound key as pageTextByPage so it
  // can never be satisfied by text from a different document or page.
  // The real, collision-resistant identity folded into pageTruthKey — NOT
  // bookId (the filename minus extension). Two different PDFs sharing a
  // filename previously produced an IDENTICAL pageTruthKey and collided
  // across every cache keyed on it (annotation plans, professor lesson
  // plans, content hashes). See lib/insights/resolveDocumentIdentity.ts.
  const resolvedDocumentId = useMemo(
    () => resolveDocumentIdentity({ documentId: currentLocalDocumentId, fileUrl, bookId }),
    [currentLocalDocumentId, fileUrl, bookId],
  );

  // Knowledge Graph: resolve/create nodes when study model is ready.
  // Fire-and-forget: no UI waits on this. For each VisualAnchor the pipeline
  // selected, run the deduplication resolver (tier 1: anchor, tier 2: fuzzy,
  // tier 3: new) and persist to avrrio_knowledgegraph_v1.
  //
  // Keyed on resolvedDocumentId, not bookId — a KnowledgeNode's persisted
  // identity (KnowledgeNode.documentId, stableNodeId's hash input) must be
  // collision-resistant the same way pageTruthKey already is: two different
  // PDFs sharing a filename must never resolve to (or silently overwrite)
  // the same node. bookId is still passed through and stored on the node —
  // it's a legitimate human-readable grouping key for "all nodes in this
  // book" UI, just never the identity the dedup resolver keys on. This
  // effect must run after resolvedDocumentId is computed above (moved from
  // its original position, which predated resolvedDocumentId in this file).
  //
  // chapterCandidateId is read from adaptiveSyllabusStore — null when no
  // syllabus exists for this book yet (safe; KnowledgeNode.chapterCandidateId
  // is nullable).
  useEffect(() => {
    // Clear before readiness checks: while the next page's study model is
    // loading, Recall must see no node rather than the page just left.
    pageKgNodeIdRef.current = null;
    setPageKnowledgeNodeId(null);
    if (!currentPageStudyModel || !bookId) return;
    let cancelled = false;
    const { visualAnchors } = currentPageStudyModel;
    if (!visualAnchors.length) return;

    const syllabus = useAdaptiveSyllabusStore.getState().getSyllabus(bookId);
    const chapterCandidateId = syllabus?.structureCandidates?.find(
      c => currentPage >= c.startPage && (c.endPage == null || currentPage <= c.endPage)
    )?.id ?? null;
    const profileId = syllabus?.selectedProfileId ?? "general";

    const primaryAnchor = visualAnchors.find(a => a.role === "coreIdea") ?? visualAnchors[0];

    for (const anchor of visualAnchors) {
      if (!anchor.id) continue;
      resolveOrCreateNode(anchor, resolvedDocumentId, bookId, currentPage, chapterCandidateId, profileId)
        .then(node => {
          if (cancelled) return;
          // First resolved anchor (primary) wins; subsequent anchors leave it unchanged.
          if (anchor.id === primaryAnchor?.id && !pageKgNodeIdRef.current) {
            pageKgNodeIdRef.current = node.id;
            setPageKnowledgeNodeId(node.id);
          }
        })
        .catch(err => console.error("[KG_WIRE] resolve error", { anchorId: anchor.id, page: currentPage, err: err instanceof Error ? err.message : String(err) }));
    }
    return () => { cancelled = true; };
  }, [currentPageStudyModel, bookId, resolvedDocumentId, currentPage]);

  // TestLab-Reader progress integration — checkpoints how far this student
  // has actually reached, independent of whether the current page has any
  // highlighted anchors (the Knowledge Graph effect above only fires when
  // visualAnchors.length > 0, which would silently undercount plain/
  // image-heavy pages). Keyed by bookId, NOT resolvedDocumentId — TestLab's
  // book catalogue (lib/apex/bookCatalogue.ts) and examBuilder.ts's own
  // canonical-unit lookups already key everything off UltraNote.bookId, so
  // this must match or TestLab could never look its own reading-progress
  // checkpoint back up. Fire-and-forget: a write failure here must never
  // block reading. See lib/reader/readingProgressStore.ts.
  useEffect(() => {
    if (!bookId || !currentPage) return;
    recordPageReached(bookId, currentPage).catch(() => {});
  }, [bookId, currentPage]);

  // TestLab-Reader progress integration — surface "TestLab found this
  // concept weak — review" when the current page's primary Knowledge Graph
  // node has real DAT question performance below a weak threshold. Reuses
  // the same node id the Knowledge Graph effect above already resolves
  // (pageKnowledgeNodeId), so this is read-only against existing state —
  // no new node resolution, no second identity system.
  useEffect(() => {
    if (!pageKnowledgeNodeId) { setWeakConceptBanner(null); return; }
    let alive = true;
    getNodeProgress(pageKnowledgeNodeId)
      .then((progress) => {
        if (!alive) return;
        const dat = progress?.datPerformance;
        if (!dat || dat.attempts < 2) { setWeakConceptBanner(null); return; }
        const accuracy = Math.round((dat.correct / dat.attempts) * 100);
        setWeakConceptBanner(accuracy < 60 ? { nodeId: pageKnowledgeNodeId, accuracy } : null);
      })
      .catch(() => { if (alive) setWeakConceptBanner(null); });
    return () => { alive = false; };
  }, [pageKnowledgeNodeId]);

  const activePageTextKey = `${bookId}:${currentPage}`;
  const pageTextReady = (pageTextByPage.get(activePageTextKey) || "").length > 50;
  DEV && console.log("[TRACE PAGE BINDING]", {
    currentPage,
    activePageTextKey,
    textLength: (pageTextByPage.get(activePageTextKey) || "").length,
    hasText: pageTextReady,
  });
  // [TRACE LIVE_WIRING] — single snapshot of the full pipeline state for each page.
  // Used to distinguish: A) deploy/cache miss, B) index wiring, C) hook not rerunning,
  // D) overlay rect-match failure, E) math extraction failure.
  // Logs AFTER useActivePageIntelligence so all derived values are available.
  // Remove once the wiring audit is complete.

  const {
    payloadKey,
    highlightKey,
    signals: currentSignals,
    panelPayloads: currentPanelPayload,
    pageModel: currentPageModel,
    story: currentPageStory,
    pageClass: currentPageClass,
    pageTruth: currentPageTruth,
    pageTruthKey,
    status: pageIntelligenceStatus,
    isCurrentPage: isCurrentIntelligencePage,
    priorityHighlights: currentPriorityHighlights,
    normResult: currentNormResult,
    storyV2: currentPageStoryV2,
    storyV3: currentPageStoryV3,
    pageRole: currentPageRole,
    confidence: currentConfidence,
    formulaSignals,
    ultraPageView: currentUltraPageView,
  } = useActivePageIntelligence({
    documentId: resolvedDocumentId,
    pageNumber: currentPage,
    ctx: activePageContextForInsights,
    pageTextReady,
    audience: unifiedPanelState.audience,
    depth: unifiedPanelState.depth,
  });
  // Keep ref in sync so the finalHighlightAnchors effect can read pageRole without TDZ issues.
  currentPageRoleRef.current = currentPageRole ?? null;
  DEV && console.log("[TRACE LIVE_WIRING]", {
    deployedCommit: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? process.env.NEXT_PUBLIC_DEPLOYED_COMMIT ?? process.env.NEXT_PUBLIC_BUILD_SHA ?? "unknown",
    deployedBuildTime: process.env.NEXT_PUBLIC_BUILD_TIME ?? "unknown",
    bookId,
    currentPage,
    activePageTextLength: (pageTextByPage.get(activePageTextKey) || "").length,
    pageTextReady,
    pageKind: currentNormResult?.pageKind ?? null,
    classificationReason: currentNormResult?.classificationReason ?? null,
    shouldRenderFullPanel: currentNormResult?.shouldRenderFullPanel ?? null,
    paragraphInsightsCount: (currentPageModel?.paragraphInsights ?? []).length,
    highlightNeighborhoodsCount: 0, // legacy var removed — highlight source is now ONLY finalStudyModel.visualAnchors
    formulaSignals,
    pageIntelligenceStatus,
    isCurrentIntelligencePage,
  });
  // Ref always reflects the latest pageTruthKey so callbacks can validate against it.
  const pageTruthKeyRef = useRef(pageTruthKey);
  useEffect(() => { pageTruthKeyRef.current = pageTruthKey; }, [pageTruthKey]);

  // Heuristic-only fallback for currentPageStudyModel — gives NoteLab/Learning Hub/
  // Recall/Podcast/Study Guide a valid study model for a page even when the Reader
  // tab (the only mounter of RightPanel, the sole producer of AI-enriched models via
  // handleStudyModelReady) has never been opened for it. ultraPageView is the same
  // heuristic computation RightPanel makes, now unconditional on activeShellTab (see
  // useActivePageIntelligence's ultraPageView). buildStudyModel handles an empty
  // synth object safely (RightPanel.tsx makes the identical call with a real synth).
  // Only fills when nothing has claimed this page's model yet (prev === null, reset
  // by the [bookId, currentPage] effect above) — never clobbers a model RightPanel
  // already resolved (heuristic or AI-enriched) for the current page.
  // Mirrors RightPanel's own gate (RightPanel.tsx: `blockEmit = isStructuralPage ||
  // openAIConfirmsNonInstructional`) so this headless path can't emit a study model
  // for cover/contents/chapter_opener/etc. pages RightPanel would have suppressed —
  // both now call the exact same lib/insights/pageRoleGate.ts's isNoninstructionalPage().
  // openAIConfirmsNonInstructional has no headless equivalent (it's teachingSynthesis-
  // derived) — the local-role tier is all a no-AI path can check, same as the two-tier
  // pattern pages/index.tsx already applies to finalHighlightAnchors above.
  useEffect(() => {
    if (!currentUltraPageView || !isCurrentIntelligencePage) return;
    if (isNoninstructionalPage(currentPageRole)) return;
    setCurrentPageStudyModel((prev) => {
      if (prev) return prev;
      return buildStudyModel(currentUltraPageView, {}, bookId, currentPage, sharedPresetId, {
        documentId: resolvedDocumentId,
        confidence: currentConfidence,
      });
    });
  }, [bookId, currentPage, currentUltraPageView, sharedPresetId, isCurrentIntelligencePage, currentPageRole, resolvedDocumentId, currentConfidence]);

  // ── SurgeonAnnotationPlan: OpenAI reads the current page fresh, Avrrio draws it ──
  // Captured page image (hidden fixed-scale render, decoupled from zoom) — see
  // SmartPDFViewer's onPageImageCaptured / SURGEON_CAPTURE_SCALE.
  const [pageImageByPage, setPageImageByPage] = useState<Map<string, string>>(() => new Map());
  const surgeonPageDomain = useMemo(
    () => detectPageDomain(pageTextByPage.get(`${bookId}:${currentPage}`) || ""),
    [pageTextByPage, bookId, currentPage],
  );
  const surgeonExistingUnits = useMemo(
    () => canonicalLeftPanelUnits.map(u => ({ id: u.id, text: u.exactText, canonicalType: u.category })),
    [canonicalLeftPanelUnits],
  );
  const surgeonAnnotations = useSurgeonAnnotations({
    pageTruthKey,
    documentId:       resolvedDocumentId,
    pageNumber:        currentPage,
    pageText:          pageTextByPage.get(`${bookId}:${currentPage}`) ?? "",
    pageImageDataUrl:  pageImageByPage.get(`${bookId}:${currentPage}`) ?? null,
    previousPageText:  pageTextByPage.get(`${bookId}:${currentPage - 1}`) ?? null,
    nextPageText:      pageTextByPage.get(`${bookId}:${currentPage + 1}`) ?? null,
    domain:            surgeonPageDomain,
    semanticPack:      activePack,
    existingCanonicalUnits: surgeonExistingUnits,
    pageRole:          currentPageRole ?? null,
    enabled:           !!bookId && !!fileUrl,
  });

  // Deterministic Scene Builder input — SurgeonAnnotationPlan's grounded annotations,
  // never Claude/image-generation, converted to CanonicalEntryInput[] for the
  // already-built VisualSceneGraph pipeline. Built from wholePageAnnotations, NOT
  // groundedAnnotations — the latter is density-limited for PDF-margin-note
  // readability (max 8, mechanism/procedure sharing one slot), which has nothing
  // to do with how much the Whiteboard needs to teach the page well; reusing it
  // here was silently starving the Whiteboard of content that the SAME page read
  // already produced. Same one page read either way — just a fuller view of it.
  // When this is empty (not yet loaded/cached, or degraded), WhiteboardPanel
  // stays empty. It never substitutes NoteCards from the independent study-model
  // pipeline, so a failed Surgeon read cannot produce a plausible but unrelated
  // Professor lesson.
  const whiteboardCanonicalEntries = useMemo(
    () => surgeonAnnotationsToCanonicalEntries(surgeonAnnotations.wholePageAnnotations, resolvedDocumentId, currentPage),
    [surgeonAnnotations.wholePageAnnotations, resolvedDocumentId, currentPage],
  );

  // ── Unified wiring trace — prints one page's full data-flow chain, for
  //    diagnosing "where exactly does the chain break" without guessing.
  //    NOT a single call: SURGEON is this app's real analog to "GPT PAGE
  //    ANALYSIS" (there is no separate page-classification call — pageRole
  //    IS the page type, decided by the SAME SurgeonAnnotationPlan pass that
  //    proposes annotations). DRAWING/TLDRAW live inside WhiteboardPanel/
  //    TldrawCanvas (a different component tree) and are reported by their
  //    OWN [WHITEBOARD_STEP_DIAGNOSTIC]/[WHITEBOARD_MOUNT_DIAGNOSTIC] logs —
  //    correlate by the SAME pageTruthKey printed here. Fires once per
  //    Whiteboard open, not on every render. */
  useEffect(() => {
    if (!showWhiteboardPanel) return;
    const plan = surgeonAnnotations.plan;
    const relationshipCount = plan?.annotations.filter(a => !!a.relationship).length ?? 0;
    console.log("[PIPELINE_WIRING_TRACE]", {
      PAGE: {
        pageTruthKey,
        documentIdHash: resolvedDocumentId ? hashDocumentId(resolvedDocumentId) : null,
        page: currentPage,
      },
      SURGEON_PAGE_ANALYSIS: {
        // This app's real analog to "GPT page analysis" — pageRole is
        // decided by the SAME pass that proposes annotations, not a
        // separate classification call.
        pageType: plan?.pageRole ?? null,
        conceptCount: plan?.annotations.length ?? 0,
        relationshipCount,
      },
      SURGEON_GROUNDING: {
        anchorsGrounded: surgeonAnnotations.groundedAnnotations.length,
        // Density-limited subset actually handed to the PDF overlay for
        // geometry resolution — per-target geometry success/failure is only
        // knowable from SmartPDFViewer's own [SURGEON_PIPELINE_DIAGNOSTIC]
        // log (correlate by pageTruthKey above).
        targetsHandedToOverlay: surgeonAnnotations.highlightTargets.length,
        status: surgeonAnnotations.status,
      },
      WHITEBOARD_RECEIVED: {
        receivedCanonicalUnits: whiteboardCanonicalEntries.length > 0,
        // VSG construction happens inside WhiteboardPanel — see its own
        // [WHITEBOARD_PANEL_RENDER] log's vsgStatus field for the outcome.
        receivedHighlightPlan: !!plan?.pageRole,
        // The exact mechanism behind a "one random sentence" Whiteboard
        // title: two DIFFERENT candidate title sources exist, and
        // WhiteboardPanel.tsx currently prefers the OLDER one.
        surgeonPageThesis: plan?.pageThesis ?? null,
        legacyStudyModelPageThesis: (currentPageStudyModel as any)?.pageThesis ?? null,
      },
    });
  }, [showWhiteboardPanel, pageTruthKey, resolvedDocumentId, currentPage, surgeonAnnotations.plan, surgeonAnnotations.groundedAnnotations, surgeonAnnotations.highlightTargets, surgeonAnnotations.status, whiteboardCanonicalEntries, currentPageStudyModel]);

  // DEV-ONLY: expose crash-reproduction hooks so Playwright can inject synthetic
  // synthesis data without needing real API keys. Removed before any production build.
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    const MOCK_PAGE_TEXT = 'Digestive system processes food through mechanical and chemical digestion. Enzymes break down macromolecules into absorbable nutrients. The small intestine absorbs nutrients through villi and microvilli. Peristalsis moves food through the digestive tract. The liver produces bile which emulsifies fats.';
    const MOCK_ANCHORS = [
      { text: 'Digestive system processes food through mechanical and chemical digestion.', anchorType: 'thesis' as const, reason: 'core concept', evidenceRefId: 'anchor-1', spanStart: 0, spanEnd: 74 },
      { text: 'Enzymes break down macromolecules into absorbable nutrients.', anchorType: 'mechanism' as const, reason: 'mechanism', evidenceRefId: 'anchor-2', spanStart: 76, spanEnd: 135 },
      { text: 'The small intestine absorbs nutrients through villi and microvilli.', anchorType: 'application' as const, reason: 'application', evidenceRefId: 'anchor-3', spanStart: 137, spanEnd: 204 },
    ];
    (window as any).__debugTriggerSynthesis = () => {
      const key = pageTruthKeyRef.current;
      if (!key) { console.warn('[DEBUG] pageTruthKey not ready yet'); return; }
      // 1. Inject page text so grounding can find anchor spans
      setPageTextByPage((prev) => {
        const k = `default-book:1`;
        if (prev.get(k) === MOCK_PAGE_TEXT) return prev;
        const next = new Map(prev);
        next.set(k, MOCK_PAGE_TEXT);
        return next;
      });
      // 2. Inject study model so canonical units are built
      const mockModel = {
        page: 1, pageTruthKey: key,
        pageThesis: 'Digestive system overview',
        visualAnchors: [
          { id: 'anchor-1', evidenceRefId: 'anchor-1', role: 'thesis', kind: 'thesis', exactText: MOCK_ANCHORS[0].text, score: 0.9 },
          { id: 'anchor-2', evidenceRefId: 'anchor-2', role: 'mechanism', kind: 'mechanism', exactText: MOCK_ANCHORS[1].text, score: 0.8 },
          { id: 'anchor-3', evidenceRefId: 'anchor-3', role: 'application', kind: 'application', exactText: MOCK_ANCHORS[2].text, score: 0.75 },
        ],
        highlightAnchors: MOCK_ANCHORS,
        miniTestItems: [], preReadRecallItems: [],
      };
      DEV && console.log('[DEBUG] injecting page text + studyModel, key:', key);
      handleStudyModelReady(mockModel as any, key);
    };
    (window as any).__debugGetReadingFocusStore = () => {
      const { useReadingFocusStore: s } = require('@/lib/readingFocus/readingFocusStore');
      return s ? s.getState() : null;
    };
    return () => {
      delete (window as any).__debugTriggerSynthesis;
      delete (window as any).__debugGetReadingFocusStore;
    };
  }, [handleStudyModelReady]);
  // Clear stale synthesis state immediately when pageTruthKey changes (not just currentPage).
  // CRITICAL: also clear finalHighlightAnchors — otherwise stale anchors persist on left panel
  // until the new studyModel arrives, which can take 2–4 seconds.
  useEffect(() => {
    setCurrentPageStudyModel(null);
    setFinalHighlightAnchors([]);
    DEV && console.log("[HIGHLIGHT_CLEARED]", { reason: "page-changed", pageTruthKey });
  }, [pageTruthKey]);

  // CRITICAL: clear the PDF text selection on every page change. Unlike every other
  // piece of "current page" state above, sel.selectionText previously had no lifecycle
  // tie to pageTruthKey — it only cleared after being CONSUMED by a Chief Resident
  // click, not on navigation. That let a selection made on one page (e.g. a biology
  // passage) survive silently into a later page's "Ask Chief Resident → Selected Text"
  // request, producing a response that's actually correct for the OLD passage but
  // rendered under the NEW page's number/title — confirmed root cause of a report
  // where a calculus page's Chief Resident request explained insulin/glucagon.
  useEffect(() => {
    sel.clearSelection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageTruthKey]);

  // CRITICAL: clear the Reading Focus Engine's eye-follow/word-sync state on every
  // page change. clearFocus() resets thoughtUnitId/sentenceText/wordIndex/word/
  // playbackState/pdfClickCursor/annotationRenderStage together — without this,
  // the previous page's word marker (and its stale playbackState) could survive
  // into the new page until the next speech tick happened to overwrite it,
  // rather than disappearing immediately on navigation as the reading-focus
  // contract requires (see lib/readingFocus/readingFocusStore.ts's clearFocus
  // doc comment: "Clear all focus state (e.g. on page/book change)" — this was
  // the one call site that contract was written for but never wired up).
  useEffect(() => {
    useReadingFocusStore.getState().clearFocus();
    // P0 stabilization: clearFocus() above only resets useReadingFocusStore's
    // word/thoughtUnit-level state — focusSnippet is a separate piece of
    // state that drives SmartPDFViewer's sentenceFocusRect (and, in turn,
    // the Eye Guide dim veil built from it). Without also clearing it here,
    // the previous page's sentence-focus box/dim veil could survive into
    // the new page until either its own ~2.2s auto-clear timer fired or a
    // new focusSnippet happened to overwrite it — not the "immediately"
    // navigation-clear behavior the reading-focus contract requires.
    setFocusSnippet(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageTruthKey]);

  // CRITICAL: close any open Explain It modal on page navigation. It captures
  // its page's context (pageNumber, pageText, canonicalEntries) once when
  // opened and is not keyed to pageTruthKey, so without this effect it would
  // stay mounted across a page change — continuing to answer, and letting the
  // user send follow-ups, against a now-stale page's content while displaying
  // the NEW page's title in the background. Closing on navigation is the same
  // "never let stale context silently continue" guarantee as the
  // sel.clearSelection() fix above; closing also unmounts the modal, which
  // triggers its own cleanup effect to abort any in-flight streaming request
  // for the old page.
  //
  // Chief Resident does NOT need an equivalent effect: ChiefResidentModalShell
  // passes currentPageStudyModel/pageText/pageTruthKey etc. as LIVE props
  // (never snapshotted into a captured context object), and ChiefResidentPanel
  // itself already resets its session the instant bookId/currentPage/
  // pageTruthKey change (see its own effect) — the same behavior NoteLab's
  // Chief Resident already relies on. There is no stale snapshot to close.
  useEffect(() => {
    setExplainItContext(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageTruthKey]);

  // Auto-select the first anchor when anchors first arrive on a page (speech not playing).
  // This ensures the Expert Brain and LeftPanel card highlight appear automatically without
  // the user needing to click anything.
  useEffect(() => {
    if (!finalHighlightAnchors.length) return;
    const { playbackState, thoughtUnitId } = useReadingFocusStore.getState();
    if (playbackState !== 'idle') return;
    if (thoughtUnitId) return; // user already focused something on this page
    const first = finalHighlightAnchors[0];
    const id = (first as any).evidenceRefId ?? (first as any).id ?? null;
    if (id) useReadingFocusStore.getState().setThoughtUnit(id);
  }, [finalHighlightAnchors]);

  const focusIntegrity = focusInterruptions === 0 ? "uninterrupted" : focusInterruptions === 1 ? "interrupted once" : "interrupted multiple times";
  const focusScore = Math.max(0, 100 - (focusInterruptions * 12));
  const focusConsistency = focusScore >= 90 ? "Strong" : focusScore >= 75 ? "Good" : "Needs recovery";
  const ambientEmbedUrl = useMemo(() => toYouTubeEmbed(ambientUrl), [ambientUrl]);
  // Resolve a snippet to its visualAnchor id — used by RightPanel card clicks and speech focus.
  // Source: currentPageStudyModel.visualAnchors (the canonical left-panel highlight contract).
  //
  // Most RightPanel card types (narrative blocks, steps, notes — not just concept
  // anchors) call onEvidenceClick with no evidenceId, so this resolver is what links
  // them back to a LeftPanel highlight. Stage 1 below used to truncate both sides to
  // 48/32 chars, which (a) missed the true containment relationship when it started
  // after that prefix and (b) could match the wrong anchor when several anchors
  // shared a common opening. Stage 2 adds a key-term-overlap fallback (same idea as
  // groundHighlightAnchors' sentence scoring) for card text that paraphrases or
  // excerpts an anchor rather than literally containing/being contained by it.
  const resolveEvidenceId = useCallback((snippet: string) => {
    const anchors = canonicalLeftPanelUnits;
    if (!anchors.length) return undefined;
    const needle = snippet.toLowerCase().replace(/\s+/g, " ").trim();
    if (!needle) return undefined;

    const contained = anchors.find((a) => {
      const hay = a.exactText.toLowerCase().replace(/\s+/g, " ").trim();
      return hay.includes(needle) || needle.includes(hay);
    });
    if (contained) return contained.evidenceRefId;

    const needleTerms = new Set(needle.split(/\W+/).filter((w) => w.length >= 3));
    if (!needleTerms.size) return undefined;

    let best: { id: string; score: number } | undefined;
    for (const a of anchors) {
      const hayTerms = a.exactText.toLowerCase().split(/\W+/).filter((w) => w.length >= 3);
      if (!hayTerms.length) continue;
      const matched = hayTerms.filter((t) => needleTerms.has(t)).length;
      const score = matched / Math.min(needleTerms.size, hayTerms.length);
      if (score > 0.5 && (!best || score > best.score)) best = { id: a.evidenceRefId, score };
    }
    return best?.id;
  }, [canonicalLeftPanelUnits]);

  // Shared "focus this evidence" handler — used by RightPanel cards, the left-panel
  // Thought Unit strip, and speech segment focus. Sets focusedEvidenceId (drives the
  // PDF overlay glow/scroll) and re-fires focusSnippet (drives the text-search yellow
  // flash + scrollIntoView), and auto-zooms so the target paragraph fills the screen.
  const focusEvidence = useCallback((snippet: string, evidenceId?: string) => {
    // Lock out scroll-debounce overwrites for 1.5 s so the card-click selection
    // survives the setTimeout(0) gap and any concurrent scroll events (RC-2, RC-3).
    userFocusLockedUntilRef.current = Date.now() + 1500;
    setFocusSnippet(null);
    setFocusedEvidenceId(evidenceId || resolveEvidenceId(snippet) || null);
    const { zoom: currentZoom, setZoom } = useZoomStore.getState();
    if (currentZoom < 1.5) setZoom(1.5);
    window.setTimeout(() => setFocusSnippet(snippet), 0);
  }, [resolveEvidenceId]);

  // RightPanel card click — focus-only navigation: jumps to the PDF source,
  // lights the highlight, seeds Expert Brain. Does NOT auto-start speech;
  // the user presses Play/Read This to begin playback.
  const playThoughtUnit = useCallback((snippet: string, evidenceId?: string) => {
    focusEvidence(snippet, evidenceId);
  }, [focusEvidence]);

  // Clicking a highlighted PDF overlay rect (or a Thought Unit card) — focuses the rect,
  // scrolls the left panel to that card, and seeds the Expert Brain context. Does NOT
  // auto-start speech — the user must press Play or "Read This" to hear it.
  //
  // Cross-page navigation: when the anchor lives on a different page we call
  // syncToPage first, then apply the focus via pendingFocusAnchorId (the clear-
  // on-page-change effect would otherwise wipe it before the new page renders).
  const onPdfHighlightFocus = useCallback((id: string) => {
    const anchor = finalHighlightAnchors.find((a) => (a as { evidenceRefId?: string }).evidenceRefId === id);
    const activeUnit = canonicalLeftPanelUnits.find((u) => u.evidenceRefId === id || u.id === id);
    const text = anchor?.text ?? activeUnit?.exactText ?? null;
    if (text) setFocusSnippet(text);

    const anchorPage = (anchor as { page?: number } | undefined)?.page
      ?? (activeUnit as { page?: number } | undefined)?.page
      ?? null;

    if (anchorPage && anchorPage !== currentPageRef.current) {
      // Navigate to the anchor's page first; apply focus after page settles.
      // Use syncToPageRef (not syncToPage directly) to avoid a TDZ crash in the
      // production SSR bundle — syncToPage is declared ~2300 lines after this
      // useCallback, so including it in the dep array would evaluate an
      // uninitialized const when the dependency array is created during render.
      setPendingFocusAnchorId(id);
      syncToPageRef.current?.(anchorPage, { reason: "PROGRAMMATIC" });
    } else {
      setFocusedEvidenceId(id);
    }
  }, [finalHighlightAnchors, canonicalLeftPanelUnits]);

  useEffect(() => {
    if (activeShellTab !== "reader") return;
    setFocusedEvidenceId(null);
    setFocusSnippet(null);
  }, [activeShellTab, currentPage]);

  // Apply a cross-page pending focus after the page transition completes.
  // Must run AFTER the clear-on-page-change effect above (effects run in order).
  useEffect(() => {
    if (!pendingFocusAnchorId) return;
    setFocusedEvidenceId(pendingFocusAnchorId);
    setPendingFocusAnchorId(null);
  }, [currentPage, pendingFocusAnchorId]);

  // Programmatically save current page to NoteLab (used by Focus Cycle session summary)
  const sendCurrentPageToNoteLab = useCallback(async () => {
    const topic = `Page ${currentPage}`;
    const activeUnit = activeCanonicalThoughtUnit ?? canonicalLeftPanelUnits[0] ?? null;
    if (!activeUnit && !currentPageStudyModel) return;
    DEV && console.log("[NOTELAB_SOURCE]", {
      thoughtUnitId: activeUnit?.id ?? null,
      source: activeUnit?.source ?? "page-level fallback",
      page: currentPage,
      sourceText: activeUnit?.exactText.slice(0, 80) ?? null,
      fallbackUsed: !activeUnit || activeUnit.source !== "canonical_left_panel",
    });
    DEV && console.log("[NOTELAB_SAVE_START]", { page: currentPage, bookId, topic, source: "focus-cycle", thoughtUnitId: activeUnit?.id ?? null, destination: "NoteLab" });
    try {
      const note = activeUnit
        ? buildUltraNote(bookId, currentPage, activeUnit.title, activeUnit.exactText, [], uploadedFile?.name)
        : buildNoteFromStudyModel(currentPageStudyModel!, { bookId, pageNumber: currentPage, topic, bookTitle: uploadedFile?.name });
      if (activeUnit) {
        const neighbors = canonicalLeftPanelUnits
          .filter((u) => u.id !== activeUnit.id)
          .slice(0, 3)
          .map((u) => `• ${u.title}: ${u.exactText}`)
          .join("\n");
        // N1 (NoteLab adaptivity correction) — this used to force this ONE
        // thought unit's single exactText/reason into 12 fixed slots
        // regardless of relevance, manufacturing filler ("Connect this
        // anchor to the neighboring expert units before moving on",
        // "Missing this unit can cause the downstream reasoning chain to
        // fail") for whichever slots the unit's category didn't genuinely
        // fill. A single thought unit legitimately has one real content
        // section (labeled by what it actually is), an optional distinct
        // reason, and optional real neighboring context — never a fixed
        // section count with generated padding.
        const primaryLabel =
          activeUnit.category === "trap" ? "Danger Zone"
          : activeUnit.category === "clinical" ? "Clinical Pearl"
          : activeUnit.category === "mechanism" || activeUnit.category === "application" ? "Mechanism"
          : activeUnit.title || "Key Point";
        const sections: NoteSection[] = [{ label: primaryLabel, content: activeUnit.exactText }];
        if (activeUnit.reason && activeUnit.reason !== activeUnit.exactText) {
          sections.push({ label: "Why This Matters", content: activeUnit.reason });
        }
        if (neighbors) {
          sections.push({ label: "Connection Map", content: neighbors });
        }
        sections.push({ label: "Source", content: `Page ${currentPage} · thoughtUnitId: ${activeUnit.id}` });
        note.sections = sections;
        note.visualAnchors = canonicalLeftPanelUnits.map((u) => ({
          id: u.id,
          sourceField: "conceptBlock",
          exactText: u.exactText,
          role: u.category === "clinical" ? "clinical_pearl" : u.category === "memoryAnchor" ? "memory_hook" : u.category === "keyAnatomy" ? "anatomy" : u.category === "keyDetail" ? "dat_fact" : u.category === "unknown" ? "dat_fact" : u.category as any,
          kind: u.category,
          reason: u.reason,
          priority: 1,
          priorityTier: u.priorityTier,
        }));
      }
      note.knowledgeNodeId    = pageKgNodeIdRef.current ?? undefined;
      note.canonicalAnchorId  = activeUnit?.id ?? undefined;
      if (resolvedDocumentId) {
        note.documentId = resolvedDocumentId;
        note.pageTruthKey = buildPageTruthKey(resolvedDocumentId, currentPage);
      }
      if (canonicalLeftPanelUnits.length) {
        note.thoughtUnitIds = canonicalLeftPanelUnits.map((u) => u.id);
      }
      await saveUltraNote(note);
      const persisted = getAllUltraNotes().find((n) => n.id === note.id);
      DEV && console.log("[NOTELAB_SAVE_VERIFY]", { id: note.id, found: !!persisted, storageKey: "ultraNotes_v1" });
      DEV && console.log("[NOTELAB_SAVE_SUCCESS]", { id: note.id, page: note.pageNumber, sectionCount: note.sections?.length ?? 0, source: "focus-cycle", storageKey: "ultraNotes_v1", destination: "NoteLab" });
      setSyllabusStudiedPages((prev) => {
        const next = new Set(prev);
        next.add(currentPage);
        try { localStorage.setItem("syllabus_studiedPages", JSON.stringify([...next])); } catch { /* ignore */ }
        return next;
      });
      DEV && console.log("[SYLLABUS_SAVE_STATUS]", { page: currentPage, event: "notelab_saved", bookId, syllabusTocNodes: syllabusToc.length, totalStudied: syllabusStudiedPages.size + 1 });
      setSessionNotesCount((n) => n + 1);
      setNoteLabRefreshKey((k) => k + 1);
    } catch (err: any) {
      console.error("[NOTELAB_SAVE_ERROR]", { reason: err?.message ?? String(err), source: "focus-cycle" });
    }
  }, [currentPageStudyModel, currentPage, bookId, uploadedFile, activeCanonicalThoughtUnit, canonicalLeftPanelUnits, resolvedDocumentId]);

  // Programmatically save current page to Recall Lab (used by Focus Cycle session summary)
  const sendCurrentPageToRecallLab = useCallback(async () => {
    const sm = currentPageStudyModel;
    if (!sm) return;
    DEV && console.log("[RECALLLAB_SAVE_START]", { page: currentPage, bookId, source: "focus-cycle", destination: "RecallLab" });
    const minView = { title: `Page ${currentPage}` } as import("@/lib/insights/buildUltraPageView").UltraPageView;
    const set = buildRecallSetFromView(minView, bookId, currentPage, {
      bookTitle: uploadedFile?.name,
      sourceLabel: "right-panel",
      studyModel: sm,
      documentId: resolvedDocumentId,
      knowledgeNodeId: pageKgNodeIdRef.current,
    });
    try {
      await saveRecallSet(set);
      DEV && console.log("[RECALLLAB_SAVE_SUCCESS]", { id: set.id, page: currentPage, cards: set.cards?.length ?? 0 });
    } catch (e) {
      console.error("[RECALLLAB_SAVE_FAILED]", { id: set.id, error: String(e) });
    }
    setSyllabusStudiedPages((prev) => {
      const next = new Set(prev);
      next.add(currentPage);
      try { localStorage.setItem("syllabus_studiedPages", JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
    setLastRecallSetId(set.id);
    setSessionCardsCount((n) => n + 1);
    setRecallLabRefreshKey((k) => k + 1);
  }, [currentPageStudyModel, currentPage, bookId, uploadedFile, resolvedDocumentId]);


  // 🧠 Chapter Absorption Pipeline State
  const [chapterPipeline, setChapterPipeline] = useState<ChapterAbsorptionPipeline | null>(null);
  const [absorptionState, setAbsorptionState] = useState<{
    isRunning: boolean;
    progress: { processed: number; total: number; currentChapter: string } | null;
    processingQueue: ProcessingProgress[];
    results: AbsorptionResult[];
    showPanel: boolean;
  }>({
    isRunning: false,
    progress: null,
    processingQueue: [],
    results: [],
    showPanel: false,
  });
  const [smartTOC, setSmartTOC] = useState<SmartTOCEntry[]>([]);

  /* =========================================================================
     🔹 Initialize Chapter Absorption Pipeline
  ========================================================================= */
  useEffect(() => {
    if (thoughtUnits.length > 0 && tableOfContents.length > 0) {
      DEV && console.log('🧠 Initializing Chapter Absorption Pipeline');
      
      const pipeline = createChapterAbsorptionPipeline({
        maxConcurrentProcessing: 2,
        chunkSize: 5000,
        overlapSize: 500,
        cacheResults: true,
        enableButlerGeneration: true,
        pdrmSections: {
          pattern: true,
          decision: true,
          mechanism: true,
          application: true,
          wrongAnswers: true,
          visualAnchor: true,
          crossLinks: false,
          reflection: false
        }
      });

      // Set up progress tracking
      pipeline.onProgress((progress: ProcessingProgress) => {
        setAbsorptionState(prev => ({
          ...prev,
          processingQueue: prev.processingQueue.map(p => 
            p.chapterId === progress.chapterId ? progress : p
          ).concat(
            prev.processingQueue.find(p => p.chapterId === progress.chapterId) 
              ? [] 
              : [progress]
          )
        }));
      });

      setChapterPipeline(pipeline);

      // Convert TOC to Smart TOC format
      const convertedSmartTOC: SmartTOCEntry[] = tableOfContents.map((entry, index) => ({
        id: `toc-${index}`,
        title: (entry as any).title || `Chapter ${index + 1}`,
        pageNumber: getTocPage(entry) || 1,
        level: (entry as any).level || 1,
        isProcessed: false,
        processingStatus: 'pending' as const,
        chapterText: '',
        pdrmSections: {},
        butlerInsights: []
      }));
      
      setSmartTOC(convertedSmartTOC);
    }
  }, [thoughtUnits.length, tableOfContents.length]);

  /* =========================================================================
     🔹 Load PDF Library (Firebase) or keep session list (guest)
  ========================================================================= */
  useEffect(() => {
    if (firebaseConnected && user) {
      getPDFLibrary(USER_ID).then(setPdfLibrary);
    } else {
      setPdfLibrary([]); // clear when signed out
    }
  }, [user, showLibrary]);

  /* =========================================================================
     🔹 Chapter Absorption Pipeline Functions
  ========================================================================= */
  const startChapterAbsorption = async () => {
    if (!chapterPipeline || !smartTOC.length) {
      alert('Chapter absorption pipeline not ready. Please ensure a PDF is loaded with a table of contents.');
      return;
    }

    DEV && console.log('🧠 Starting chapter absorption process for', smartTOC.length, 'chapters');
    
    setAbsorptionState(prev => ({
      ...prev,
      isRunning: true,
      progress: { processed: 0, total: smartTOC.length, currentChapter: smartTOC[0]?.title || 'Starting...' },
      showPanel: true
    }));

    try {
      // Create function to extract chapter text from PDF pages
      const extractChapterText = async (chapter: SmartTOCEntry): Promise<string> => {
        return await extractChapterTextFromPDFPages(chapter, async (pageNum: number) => {
          // This is a simplified implementation - in a real scenario, 
          // you'd need to extract text from the actual PDF pages
          const pageUnit = pageToUnit(pageNum, pdfPageCount, thoughtUnits.length);
          return thoughtUnits[pageUnit - 1]?.text || '';
        });
      };

      // Run the absorption pipeline
      const processedSmartTOC = await chapterPipeline.processSmartTOC(
        smartTOC,
        extractChapterText,
        (progress) => {
          setAbsorptionState(prev => ({
            ...prev,
            progress
          }));
        }
      );

      // Update the Smart TOC with processed results
      setSmartTOC(processedSmartTOC);
      
      // Get processing statistics
      const stats = chapterPipeline.getProcessingStats();
      const results = chapterPipeline.getCachedResults();
      
      setAbsorptionState(prev => ({
        ...prev,
        isRunning: false,
        results,
        progress: { 
          processed: stats.totalProcessed, 
          total: smartTOC.length, 
          currentChapter: 'Complete!' 
        }
      }));

      DEV && console.log('🧠 Chapter absorption complete:', stats);
      alert(`Chapter absorption complete! Processed ${stats.totalProcessed} chapters with ${Math.round(stats.successRate * 100)}% success rate.`);

    } catch (error) {
      console.error('🧠 Chapter absorption failed:', error);
      setAbsorptionState(prev => ({
        ...prev,
        isRunning: false
      }));
      alert(`Chapter absorption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const stopChapterAbsorption = () => {
    if (chapterPipeline) {
      chapterPipeline.abort();
      setAbsorptionState(prev => ({
        ...prev,
        isRunning: false
      }));
      DEV && console.log('🧠 Chapter absorption stopped by user');
    }
  };

  const clearAbsorptionCache = () => {
    if (chapterPipeline) {
      chapterPipeline.clearCache();
      setAbsorptionState(prev => ({
        ...prev,
        results: []
      }));
      DEV && console.log('🧠 Chapter absorption cache cleared');
    }
  };

  /* =========================================================================
     🔹 Enhanced Page/TOC sync with chapter-aware navigation + global sync
  ========================================================================= */
  const sel = usePdfSelection({
    minChars: 2,
    onSelect: () => {},
    autoWhiteboard,
    containsDiagramOrFormula,
    onDiagramDetected: (concept, ctx) => {
      setWbConcept(truncate(concept, 600));
      setWbContext(ctx);
      setShowWhiteboardPanel(true);
    },
    pageProvider: () => currentPage,
    contextLabel: uploadedFile?.name ? `From ${uploadedFile.name}` : undefined,
    debounceMs: 0,
  });

  /* =========================================================================
     🔹 Explain This Step — contextual chatbox triggered from a LeftPanel selection
  ========================================================================= */
  const handleOpenExplainStep = useCallback(() => {
    const text = sel.selectionText?.trim() ?? "";
    const pageText = pageTextByPage.get(`${bookId}:${currentPage}`) || "";
    const sm = currentPageStudyModel;

    // Keep the LeftPanel highlight in sync with whatever is being explained — when
    // text is selected, resolve it to its thought-unit so the same evidenceRefId
    // drives the PDF glow here, in Speech, and in Whiteboard for this concept. When
    // nothing is selected, focusedEvidenceId already reflects the active thought-unit
    // (set by RightPanel/speech) and is left as-is.
    if (text) {
      const resolvedId = resolveEvidenceId(text);
      if (resolvedId) setFocusedEvidenceId(resolvedId);
    }

    const relatedNotes = getNotesByBook(bookId)
      .filter((n) => n.pageNumber === currentPage)
      .map((n) => ({ topic: n.topic, coreIdea: n.coreIdea }));
    const relatedRecallCards = getRecallSetsByBook(bookId)
      .filter((r) => r.pageNumber === currentPage)
      .flatMap((r) => r.cards.map((c) => ({ front: c.front, back: c.back })));
    setExplainStepContext({
      selectedText: text,
      pageText,
      surroundingParagraph: text
        ? findSurroundingParagraph(pageText, text, currentPage, bookId)
        : ((finalHighlightAnchors as any[]).find(a => a.evidenceRefId === focusedEvidenceId)?.text ?? pageText.slice(0, 800)),
      pageThesis: sm?.pageThesis ?? null,
      studyNotes: sm?.studyNotes ?? null,
      conceptTitles: sm?.conceptBlocks?.map((b) => b.title) ?? [],
      relatedNotes,
      relatedRecallCards,
      documentTitle: uploadedFile?.name,
      pageNumber: currentPage,
    });
    sel.clearSelection();
  }, [sel, pageTextByPage, bookId, currentPage, currentPageStudyModel, uploadedFile, resolveEvidenceId, focusedEvidenceId]);

  const handleAskExpert = useCallback((question: string) => {
    const pageText = pageTextByPage.get(`${bookId}:${currentPage}`) || "";
    const sm = currentPageStudyModel;
    // Guard: only use pageThesis/studyNotes/conceptBlocks when the study model was
    // generated for the current page — same fix as PR #595's Chief Resident handlers.
    // A stale thesis from the previous page is a stronger signal than the actual
    // pageText and causes the AI to respond about the wrong subject.
    const isSmFresh = sm?.pageTruthKey === pageTruthKey;
    const relatedNotes = getNotesByBook(bookId)
      .filter((n) => n.pageNumber === currentPage)
      .map((n) => ({ topic: n.topic, coreIdea: n.coreIdea }));
    const relatedRecallCards = getRecallSetsByBook(bookId)
      .filter((r) => r.pageNumber === currentPage)
      .flatMap((r) => r.cards.map((c) => ({ front: c.front, back: c.back })));
    const activeUnit = activeCanonicalThoughtUnit;
    setExplainStepContext({
      selectedText: activeUnit?.exactText ?? "",
      pageText,
      surroundingParagraph: activeUnit?.exactText ?? pageText.slice(0, 800),
      pageThesis: isSmFresh ? (sm?.pageThesis ?? null) : null,
      studyNotes: isSmFresh ? (sm?.studyNotes ?? null) : null,
      conceptTitles: isSmFresh ? (sm?.conceptBlocks?.map((b) => b.title) ?? []) : [],
      relatedNotes,
      relatedRecallCards,
      documentTitle: uploadedFile?.name,
      pageNumber: currentPage,
      seedQuestion: question,
    });
  }, [pageTextByPage, bookId, currentPage, currentPageStudyModel, pageTruthKey, uploadedFile, activeCanonicalThoughtUnit]);

  // Same "Explain This Step" tutor modal, seeded directly from a thought-unit's
  // verbatim sourceText instead of the live LeftPanel selection — used by the
  // "Open in Explain This Step" action in the Recall Lab v2 box layout.
  const openExplainStepForThoughtUnit = useCallback((detail: ThoughtUnitDetail) => {
    setFocusedEvidenceId(detail.evidenceRefId);
    const pageText = pageTextByPage.get(`${bookId}:${detail.pageNumber}`) || "";
    const sm = currentPageStudyModel;
    // Guard: currentPageStudyModel is only trustworthy here when BOTH it was
    // generated for the CURRENTLY displayed page AND that page is the same one
    // this thought unit lives on — detail.pageNumber can reference a different
    // page than currentPage (e.g. from Recall Lab), in which case sm is known to
    // be for the wrong page regardless of its own freshness.
    const isSmFresh = sm?.pageTruthKey === pageTruthKey && detail.pageNumber === currentPage;
    const relatedNotes = getNotesByBook(bookId)
      .filter((n) => n.pageNumber === detail.pageNumber)
      .map((n) => ({ topic: n.topic, coreIdea: n.coreIdea }));
    const relatedRecallCards = getRecallSetsByBook(bookId)
      .filter((r) => r.pageNumber === detail.pageNumber)
      .flatMap((r) => r.cards.map((c) => ({ front: c.front, back: c.back })));
    setExplainStepContext({
      selectedText: detail.sourceText,
      pageText,
      surroundingParagraph: detail.sourceText,
      pageThesis: isSmFresh ? (sm?.pageThesis ?? null) : null,
      studyNotes: isSmFresh ? (sm?.studyNotes ?? null) : null,
      conceptTitles: isSmFresh ? (sm?.conceptBlocks?.map((b) => b.title) ?? []) : [],
      relatedNotes,
      relatedRecallCards,
      documentTitle: uploadedFile?.name,
      pageNumber: detail.pageNumber,
    });
  }, [pageTextByPage, bookId, currentPage, currentPageStudyModel, pageTruthKey, uploadedFile]);

  // "Explain It" — opens the office-hours-style page/topic conversation tutor,
  // sharing context with RightPanel, NoteLab, RecallLab, Study Guide Lab, and
  // (when one exists for this page) the Podcast Lab script already generated.
  const handleOpenExplainIt = useCallback(async (seedSegmentText?: string) => {
    const pageText = pageTextByPage.get(`${bookId}:${currentPage}`) || "";
    const sm = currentPageStudyModel;
    // Guard: only use pageThesis/studyNotes/conceptBlocks when the study model was
    // generated for the current page — same fix as PR #595's Chief Resident handlers.
    const isSmFresh = sm?.pageTruthKey === pageTruthKey;
    const activeThoughtUnitText = focusedEvidenceId
      ? (finalHighlightAnchors as { evidenceRefId?: string; text?: string }[]).find(
          (a) => a.evidenceRefId === focusedEvidenceId,
        )?.text
      : undefined;
    const relatedNotes = getNotesByBook(bookId)
      .filter((n) => n.pageNumber === currentPage)
      .map((n) => ({ topic: n.topic, coreIdea: n.coreIdea }));
    const relatedRecallCards = getRecallSetsByBook(bookId)
      .filter((r) => r.pageNumber === currentPage)
      .flatMap((r) => r.cards.map((c) => ({ front: c.front, back: c.back })));
    const studyGuides = await getStudyGuidesByBook(bookId).catch(() => [] as StudyGuideRecord[]);
    const studyGuideSections = studyGuides.slice(0, 2).map((g) => ({
      chapterTitle: g.chapterTitle,
      mustKnow: g.mustKnow,
    }));
    const podcastOutline = studyGuideScript && studyGuideScript.pageNumber === currentPage
      ? studyGuideScript.segments.map((s) => s.text)
      : undefined;

    setExplainItContext({
      activeThoughtUnitText,
      pageText,
      pageThesis: isSmFresh ? (sm?.pageThesis ?? null) : null,
      studyNotes: isSmFresh ? (sm?.studyNotes ?? null) : null,
      conceptTitles: isSmFresh ? (sm?.conceptBlocks?.map((b) => b.title) ?? []) : [],
      relatedNotes,
      relatedRecallCards,
      studyGuideSections,
      podcastOutline,
      seedSegmentText,
      documentTitle: uploadedFile?.name,
      pageNumber: currentPage,
      learningProfile,
    });
  }, [pageTextByPage, bookId, currentPage, currentPageStudyModel, pageTruthKey, focusedEvidenceId, finalHighlightAnchors, uploadedFile, studyGuideScript, learningProfile]);

  // Open Chief Resident from the Reader — renders ChiefResidentModalShell,
  // which wraps the SAME NoteLab teaching panel component this file also
  // renders directly further down for the NoteLab tab. No context object is
  // snapshotted here: the shell is handed the live currentPageStudyModel/
  // pageText/pageTruthKey props directly, so there is nothing that can go
  // stale between "click" and "render" the way the old three-handler
  // snapshot-object approach could.
  const handleOpenChiefResident = useCallback(() => {
    setShowChiefResident(true);
  }, []);

  // "Turn into Podcast" — hand the Explain It conversation off to Podcast Lab
  // as a seed for the next generated episode, the way Study Guide Lab already
  // hands a script to Podcast Lab via initialScript.
  const handleExplainItTurnIntoPodcast = useCallback((transcript: ExplainItMessage[]) => {
    const seed = transcript.map((t) => `${t.role === "user" ? "Student" : "Tutor"}: ${t.content}`).join("\n");
    DEV && console.log("[EXPLAIN_IT_TURN_INTO_PODCAST]", { page: explainItContext?.pageNumber, turns: transcript.length });
    setExplainItPodcastSeed(seed);
    setExplainItContext(null);
    trySwitchShellTab("podcast", "podcast");
  }, [explainItContext, trySwitchShellTab]);

  // "Discuss" — opens Explain It seeded from a specific Podcast Lab segment,
  // the inverse handoff of "Turn into Podcast".
  const handleDiscussPodcastSegment = useCallback((segment: { text: string }) => {
    handleOpenExplainIt(segment.text);
  }, [handleOpenExplainIt]);

  // Expand a thought-unit (VisualAnchor) into the Recall Lab v2 box layout —
  // deterministic, no new LLM call (see buildThoughtUnitDetail).
  const openThoughtUnitInRecallLab = useCallback((anchorId: string) => {
    const unit = canonicalLeftPanelUnits.find((u) => u.id === anchorId || u.evidenceRefId === anchorId);
    if (unit) {
      setRecallLabOpenUnit({
        evidenceRefId: unit.evidenceRefId,
        bookId,
        pageNumber: unit.page,
        title: unit.title,
        sourceText: unit.exactText,
        coreIdea: unit.exactText,
        mechanism: unit.category === "mechanism" ? unit.exactText : null,
        whyItMatters: unit.reason,
        commonConfusion: unit.category === "trap" ? unit.exactText : null,
        datFact: unit.category === "dat_fact" ? unit.exactText : null,
        examTrap: unit.category === "trap" ? unit.exactText : null,
        recallCard: { front: `Explain: ${unit.title}`, back: unit.exactText },
      });
      trySwitchShellTab("study", "study");
      return;
    }
    const sm = currentPageStudyModel;
    const anchor = sm?.visualAnchors.find((a) => a.id === anchorId);
    if (!sm || !anchor) return;
    setRecallLabOpenUnit(buildThoughtUnitDetail(anchor, sm, bookId));
    trySwitchShellTab("study", "study");
  }, [canonicalLeftPanelUnits, currentPageStudyModel, bookId, trySwitchShellTab]);

  // LeftPanel Thought Unit Navigator "Explain" button — resolves the clicked
  // evidenceRefId back to its VisualAnchor and opens Explain This Step seeded
  // from that exact thought unit, same path as openThoughtUnitInRecallLab.
  const explainThoughtUnitById = useCallback((anchorId: string) => {
    const unit = canonicalLeftPanelUnits.find((u) => u.id === anchorId || u.evidenceRefId === anchorId);
    if (unit) {
      openExplainStepForThoughtUnit({
        evidenceRefId: unit.evidenceRefId,
        bookId,
        pageNumber: unit.page,
        title: unit.title,
        sourceText: unit.exactText,
        coreIdea: unit.exactText,
        mechanism: unit.category === "mechanism" ? unit.exactText : null,
        whyItMatters: unit.reason,
        commonConfusion: unit.category === "trap" ? unit.exactText : null,
        datFact: unit.category === "dat_fact" ? unit.exactText : null,
        examTrap: unit.category === "trap" ? unit.exactText : null,
        recallCard: { front: `Explain: ${unit.title}`, back: unit.exactText },
      });
      return;
    }
    const sm = currentPageStudyModel;
    const anchor = sm?.visualAnchors.find((a) => a.id === anchorId);
    if (!sm || !anchor) return;
    openExplainStepForThoughtUnit(buildThoughtUnitDetail(anchor, sm, bookId));
  }, [canonicalLeftPanelUnits, currentPageStudyModel, bookId, openExplainStepForThoughtUnit]);

  // LeftPanel Thought Unit Navigator "Note" button — seeds a NoteLab note from
  // just this thought unit (same buildThoughtUnitDetail input as Explain/Recall),
  // saves it immediately, then switches to NoteLab — same save-then-navigate
  // pattern as GenerateNoteButton's onNoteSaved.
  const noteThoughtUnitById = useCallback(async (anchorId: string) => {
    const unit = canonicalLeftPanelUnits.find((u) => u.id === anchorId || u.evidenceRefId === anchorId);
    if (unit) {
      DEV && console.log("[NOTELAB_SOURCE]", {
        thoughtUnitId: unit.id,
        source: unit.source,
        page: unit.page,
        sourceText: unit.exactText.slice(0, 80),
        fallbackUsed: unit.source !== "canonical_left_panel",
      });
      const note = buildUltraNote(bookId, unit.page, unit.title, unit.exactText, [], uploadedFile?.name);
      // N1 (NoteLab adaptivity correction) — same fix as sendCurrentPageToNoteLab
      // above: one thought unit gets one real content section (labeled by
      // what it actually is), an optional distinct reason, and optional real
      // neighboring context — never a fixed 12-slot template padded with
      // generated filler ("Connect this unit to the surrounding canonical
      // units", "Losing this anchor weakens downstream recall...").
      const noteNeighbors = canonicalLeftPanelUnits.filter((u) => u.id !== unit.id).slice(0, 3).map((u) => `• ${u.title}: ${u.exactText}`).join("\n");
      const notePrimaryLabel =
        unit.category === "trap" ? "Danger Zone"
        : unit.category === "clinical" ? "Clinical Pearl"
        : unit.category === "mechanism" || unit.category === "application" ? "Mechanism"
        : unit.title || "Key Point";
      const noteSections: NoteSection[] = [{ label: notePrimaryLabel, content: unit.exactText }];
      if (unit.reason && unit.reason !== unit.exactText) {
        noteSections.push({ label: "Why This Matters", content: unit.reason });
      }
      if (noteNeighbors) {
        noteSections.push({ label: "Connection Map", content: noteNeighbors });
      }
      noteSections.push({ label: "Source", content: `Page ${unit.page} · thoughtUnitId: ${unit.id}` });
      note.sections = noteSections;
      note.visualAnchors = canonicalLeftPanelUnits.map((u) => ({
        id: u.id,
        sourceField: "conceptBlock",
        exactText: u.exactText,
        role: u.category === "clinical" ? "clinical_pearl" : u.category === "memoryAnchor" ? "memory_hook" : u.category === "keyAnatomy" ? "anatomy" : u.category === "keyDetail" ? "dat_fact" : u.category === "unknown" ? "dat_fact" : u.category as any,
        kind: u.category,
        reason: u.reason,
        priority: 1,
        priorityTier: u.priorityTier,
      }));
      note.knowledgeNodeId   = pageKgNodeIdRef.current ?? undefined;
      note.canonicalAnchorId = unit.id;
      if (resolvedDocumentId) {
        note.documentId = resolvedDocumentId;
        note.pageTruthKey = buildPageTruthKey(resolvedDocumentId, unit.page);
      }
      note.thoughtUnitIds = [unit.id];
      await saveUltraNote(note);
      setNoteLabRefreshKey((k) => k + 1);
      trySwitchShellTab("notelab", "notelab");
      return;
    }
    const sm = currentPageStudyModel;
    const anchor = sm?.visualAnchors.find((a) => a.id === anchorId);
    if (!sm || !anchor) return;
    const detail = buildThoughtUnitDetail(anchor, sm, bookId);
    const note = buildUltraNote(
      bookId,
      detail.pageNumber,
      detail.title,
      detail.coreIdea,
      [],
      uploadedFile?.name,
    );
    const sections: NoteSection[] = [
      { label: "Source", content: `Page ${detail.pageNumber}\n"${truncate(detail.sourceText, 240)}"` },
    ];
    if (detail.mechanism) sections.push({ label: "Mechanism", content: detail.mechanism });
    if (detail.examTrap) sections.push({ label: "Trap", content: detail.examTrap });
    note.sections = sections;
    note.knowledgeNodeId   = pageKgNodeIdRef.current ?? undefined;
    note.canonicalAnchorId = anchor.id;
    if (resolvedDocumentId) {
      note.documentId = resolvedDocumentId;
      note.pageTruthKey = buildPageTruthKey(resolvedDocumentId, detail.pageNumber);
    }
    note.thoughtUnitIds = [anchor.id];
    await saveUltraNote(note);
    setNoteLabRefreshKey((k) => k + 1);
    trySwitchShellTab("notelab", "notelab");
  }, [canonicalLeftPanelUnits, currentPageStudyModel, bookId, uploadedFile, trySwitchShellTab, resolvedDocumentId]);

  // "Visualize" — on-demand diagram scoped to just this thought unit (triggers
  // WhiteboardPanel's secondary concept+context path rather than the prebuilt page diagram).
  const visualizeThoughtUnit = useCallback((detail: ThoughtUnitDetail) => {
    setWbConcept(detail.title);
    setWbContext(detail.sourceText);
    setShowWhiteboardPanel(true);
  }, []);

  // "Open in Whiteboard" — full-page prebuilt diagram, pre-focused on this unit's step.
  const openThoughtUnitInWhiteboard = useCallback((detail: ThoughtUnitDetail) => {
    setWbConcept("");
    setWbContext("");
    setFocusedEvidenceId(detail.evidenceRefId);
    setShowWhiteboardPanel(true);
  }, []);

  // Convert the tutor conversation into a polished NoteLab note: source
  // page/selected text + the tutor's Direct Answer / Why / Example / Common
  // Mistake sections (aggregated across the whole conversation), rather than
  // a raw chat transcript.
  const handleExplainStepSaveNote = useCallback(async (question: string, explanation: string, turns: ExplainStepMessage[]) => {
    const ctx = explainStepContext;
    if (!ctx) return;
    const parsed = parseExplainStepConversation(turns);
    const coreIdea = parsed.directAnswer || explanation;
    const note = buildUltraNote(
      bookId,
      ctx.pageNumber,
      `Explain This Step — p.${ctx.pageNumber}`,
      coreIdea,
      [],
      uploadedFile?.name,
      undefined,
      ctx.pageThesis ?? undefined,
    );
    const sections: NoteSection[] = [
      {
        label: "Source",
        content: [`Page ${ctx.pageNumber}`, ctx.selectedText ? `"${truncate(ctx.selectedText, 240)}"` : null]
          .filter(Boolean)
          .join("\n"),
      },
      { label: "Direct Answer", content: coreIdea },
    ];
    if (parsed.why) sections.push({ label: "Why", content: parsed.why });
    if (parsed.example) sections.push({ label: "Example", content: parsed.example });
    if (parsed.commonMistake) sections.push({ label: "Common Mistake", content: parsed.commonMistake });
    note.sections = sections;
    note.knowledgeNodeId = pageKgNodeIdRef.current ?? undefined;
    if (resolvedDocumentId) {
      note.documentId = resolvedDocumentId;
      note.pageTruthKey = buildPageTruthKey(resolvedDocumentId, ctx.pageNumber);
    }
    await saveUltraNote(note);
    DEV && console.log("[EXPLAIN_STEP_NOTELAB_SAVE]", { id: note.id, page: ctx.pageNumber, sectionLabels: sections.map((s) => s.label) });
    setNoteLabRefreshKey((k) => k + 1);
  }, [explainStepContext, bookId, uploadedFile, resolvedDocumentId]);

  // Convert the tutor conversation into a clean RecallLab flashcard:
  // front = the concept/selected text, back = the Direct Answer, hint =
  // Why + Example combined, tag = a weak-topic label for this page.
  const handleExplainStepCreateRecallCard = useCallback(async (question: string, explanation: string, turns: ExplainStepMessage[]) => {
    const ctx = explainStepContext;
    if (!ctx) return;
    const parsed = parseExplainStepConversation(turns);
    const back = parsed.directAnswer || explanation;
    const front = ctx.selectedText?.trim() ? truncate(ctx.selectedText.trim(), 200) : question;
    const hintParts = [
      parsed.why ? `Why: ${parsed.why}` : null,
      parsed.example ? `Example: ${parsed.example}` : null,
    ].filter(Boolean) as string[];
    const tag = ctx.conceptTitles?.[0] || (ctx.pageThesis ? truncate(ctx.pageThesis, 40) : undefined);
    const card: RecallCard = {
      id: `card-explain-${Date.now()}`,
      type: parsed.commonMistake ? "concept" : "mechanism",
      front: parsed.commonMistake ? `⚠️ ${front}` : front,
      back,
      hint: hintParts.length ? hintParts.join("\n\n") : undefined,
      tag,
      reviewCount: 0,
      isMissed: false,
    };
    const set: RecallSet = {
      id: stableRecallId(bookId, ctx.pageNumber, `explain-${Date.now()}`),
      bookId,
      bookTitle: uploadedFile?.name,
      sourceLabel: "explain-step",
      pageNumber: ctx.pageNumber,
      subject: inferSubject(bookId),
      topic: `Explain This Step — p.${ctx.pageNumber}`,
      cards: [card],
      createdAt: Date.now(),
    };
    await saveRecallSet(set);
    DEV && console.log("[EXPLAIN_STEP_RECALLLAB_SAVE]", { id: set.id, page: ctx.pageNumber, tag });
    setLastRecallSetId(set.id);
    setRecallLabRefreshKey((k) => k + 1);
    trySwitchShellTab("study", "study");
  }, [explainStepContext, bookId, uploadedFile, trySwitchShellTab]);

  const handleExplainStepAddToStudyGuide = useCallback(async (question: string, explanation: string, turns: ExplainStepMessage[]) => {
    const ctx = explainStepContext;
    if (!ctx) return;
    const parsed = parseExplainStepConversation(turns);
    const entry = `${question} — ${parsed.directAnswer || explanation}`;
    const existing = await getStudyGuidesByBook(bookId);
    if (existing.length > 0) {
      const guide = existing[0];
      const updated: StudyGuideRecord = { ...guide, mustKnow: [...guide.mustKnow, entry] };
      await saveStudyGuide(updated);
      DEV && console.log("[EXPLAIN_STEP_STUDYGUIDE_SAVE]", { id: updated.id, page: ctx.pageNumber, mode: "append" });
    } else {
      const guide: StudyGuideRecord = {
        id: `sg-${bookId}-${Date.now()}`,
        bookId,
        mode: "topstudent",
        chapterTitle: uploadedFile?.name ?? "Study Guide",
        topic: `Page ${ctx.pageNumber}`,
        priority: "Medium",
        mustKnow: [entry],
        datFacts: [],
        mechanisms: [],
        traps: [],
        recallQuestions: [],
        memoryHooks: [],
        dailyTasks: [],
        sourceLabels: ["Explain This Step"],
        createdAt: Date.now(),
      };
      await saveStudyGuide(guide);
      DEV && console.log("[EXPLAIN_STEP_STUDYGUIDE_SAVE]", { id: guide.id, page: ctx.pageNumber, mode: "create" });
    }
  }, [explainStepContext, bookId, uploadedFile]);

  /* =========================================================================
     🔹 Handle Thought Detection
  ========================================================================= */
  const handleThoughtDetected = (thoughtText: string, analysis: any) => {
    DEV && console.log('💭 New thought detected:', { thoughtText: thoughtText.slice(0, 50) + '...', analysis });
    
    const newThought = {
      id: Date.now().toString(),
      text: thoughtText,
      analysis,
      timestamp: new Date(),
      page: currentPage
    };
    
    setDetectedThoughts(prev => [newThought, ...prev.slice(0, 9)]); // Keep max 10 thoughts
  };

  // Stable setter — prevents SmartPDFViewer's [pageCount, onPageCount] effect from
  // firing on every parent re-render due to a new inline arrow reference each time.
  const handlePageCount = useCallback((count: number) => setPdfPageCount(count), []);

  /* =========================================================================
     🔹 Handle PDF Outline Extraction (memoized to prevent excessive re-renders)
  ========================================================================= */
  const handleOutlineExtraction = useCallback((tocItems: any[]) => {
    if (!tocItems?.length) return;

    const documentId = bookId || uploadedFile?.name.replace(/\.[Pp][Dd][Ff]$/, "") || "book";
    const documentName = uploadedFile?.name || "Document";
    const now = Date.now();

    // Build stable store items with nested children preserved
    const buildStoreItems = (items: any[], level: number): any[] =>
      items.map((item: any, idx: number) => ({
        id: `toc_${level}_${idx}_${now}`,
        title: item.title || `Chapter ${idx + 1}`,
        pageNumber: item.pageNumber || 1,
        level,
        children: item.items?.length ? buildStoreItems(item.items, level + 1) : undefined,
      }));

    const storeItems = buildStoreItems(tocItems, 0);

    useTocStore.getState().saveToc(documentId, documentName, storeItems, "outline");

    // Convert to app-level TocNode[] and promote to syllabusToc.
    // Outline beats heuristic unconditionally — it's the PDF's authoritative structure.
    const outlineNodes = outlineItemsToTocNodes(storeItems);
    if (outlineNodes.length > 0) {
      setSyllabusToc(outlineNodes);
      setSyllabusTocSource("outline");
      setSyllabusFileName(uploadedFile?.name || "This book");
      setSyllabusSource("book");
      try {
        localStorage.setItem("syllabus_toc", JSON.stringify(outlineNodes));
        localStorage.setItem("syllabus_toc_source", "outline");
        localStorage.setItem("syllabus_source", "book");
        localStorage.setItem("syllabus_fileName", uploadedFile?.name || "This book");
      } catch { /* quota exceeded */ }
    }

    // Legacy tableOfContents for backward-compat consumers
    const legacyToc = tocItems.map((item: any) => ({
      title: item.title,
      pageNumber: item.pageNumber || 1,
      subChapters: item.items?.map((sub: any) => ({
        title: sub.title,
        pageNumber: sub.pageNumber || 1,
      })),
    }));
    setTableOfContents(legacyToc);

    DEV && console.log("[TOC_OUTLINE_EXTRACTED]", { chapters: storeItems.length, nodes: outlineNodes.length, documentId });
  }, [bookId, uploadedFile?.name, setTableOfContents]);

  useEffect(() => {
    if (!pdfPageCount || !thoughtUnits.length) return;
    if (tableOfContents.length > 0) return;

    // Prefer real per-page text from pageTextByPage; fall back to thoughtUnits proxy.
    const hasRealText = bookId && pageTextByPage.size > 0;
    const bundles = Array.from({ length: pdfPageCount }, (_, idx) => {
      const page = idx + 1;
      const text = hasRealText
        ? (pageTextByPage.get(`${bookId}:${page}`) ?? "")
        : (thoughtUnits[pageToUnit(page, pdfPageCount, thoughtUnits.length) - 1]?.text ?? "");
      return { page, text };
    });
    const autoToc = buildAutoToc(bundles);
    if (!autoToc.length) return;

    const tocEntries = autoToc.map((node) => ({
      title: node.title,
      pageNumber: node.page,
      subChapters: node.children?.map((child) => ({
        title: child.title,
        pageNumber: child.page,
      })),
    }));
    setTableOfContents(tocEntries);

    // Write to tocStore so PureTocView (which reads the store directly, not
    // tableOfContents React state) also reflects the heuristic result.
    const docId = bookId || "book";
    const kindToLevel = (kind: string) => kind === "subsection" ? 2 : kind === "section" ? 1 : 0;
    const storeItems = autoToc.map((node, idx) => ({
      id: `toc_h_${idx}`,
      title: node.title,
      pageNumber: node.page,
      level: kindToLevel(node.kind),
      children: node.children?.map((child, cIdx) => ({
        id: `toc_h_${idx}_${cIdx}`,
        title: child.title,
        pageNumber: child.page,
        level: kindToLevel(child.kind),
      })),
    }));
    useTocStore.getState().saveToc(docId, docId, storeItems, "heuristic");
  }, [pdfPageCount, thoughtUnits, tableOfContents.length, bookId, pageTextByPage]);

  // Syllabus tab's chapter dashboard (Read/Understand/Recall/Mastery, weak
  // areas, next-recommended-topic) used to require a *separate* syllabus
  // file upload before it would render anything — the book being read and
  // the "syllabus" were two different documents. That's backwards: Syllabus
  // should be a learning-intelligence layer over the book itself, so derive
  // its chapter structure straight from the book's own content (same
  // content-based detector that already powers the auto-TOC above) the
  // moment the book is loaded. A manually-uploaded course syllabus (via
  // SyllabusUploadPanel) still overrides this with real assignment/exam
  // dates when the user has one.
  useEffect(() => {
    if (!pdfPageCount || !thoughtUnits.length) return;
    // Outline wins — don't overwrite with heuristic if we already have the PDF's
    // native bookmark structure.
    if (syllabusTocSource === "outline") return;
    if (syllabusToc.length > 0) return;
    if (syllabusUploadRequested) return;

    // Prefer real per-page text from pageTextByPage; fall back to thoughtUnits proxy.
    const hasRealText = bookId && pageTextByPage.size > 0;
    const bundles: PageTextBundle[] = Array.from({ length: pdfPageCount }, (_, idx) => {
      const page = idx + 1;
      const text = hasRealText
        ? (pageTextByPage.get(`${bookId}:${page}`) ?? "")
        : (thoughtUnits[pageToUnit(page, pdfPageCount, thoughtUnits.length) - 1]?.text ?? "");
      return { page, text };
    });
    const autoToc = buildAutoToc(bundles);
    if (!autoToc.length) return;

    setSyllabusToc(autoToc);
    setSyllabusTocSource("heuristic");
    setSyllabusPages(bundles);
    setSyllabusFileName(uploadedFile?.name || "This book");
    setSyllabusSource("book");
    try {
      localStorage.setItem("syllabus_fileName", uploadedFile?.name || "This book");
      localStorage.setItem("syllabus_pages", JSON.stringify(bundles));
      localStorage.setItem("syllabus_toc", JSON.stringify(autoToc));
      localStorage.setItem("syllabus_toc_source", "heuristic");
      localStorage.setItem("syllabus_source", "book");
    } catch { /* quota exceeded — ignore */ }
    DEV && console.log("[SYLLABUS_SOURCE]", {
      fileName:  uploadedFile?.name,
      tocNodes:  autoToc.length,
      pageCount: bundles.length,
      source:    hasRealText ? "buildAutoToc(real-page-text)" : "buildAutoToc(thoughtUnits-proxy)",
    });
  }, [pdfPageCount, thoughtUnits, syllabusToc.length, syllabusTocSource, uploadedFile?.name, syllabusUploadRequested, bookId, pageTextByPage]);

  // Coverage-based TOC upgrade: when pageTextByPage has grown to cover ≥60%
  // of pages AND we only have a heuristic TOC, re-run buildAutoToc with the
  // now-available real text to improve chapter detection coverage.
  // Only fires when source is "heuristic" (never overwrites an outline).
  // Debounced by the dependency: effect only re-runs when pageTextByPage changes
  // (which happens page-by-page as the user reads), and the ≥60% guard prevents
  // churning on every new page.
  useEffect(() => {
    if (syllabusTocSource !== "heuristic") return;
    if (!pdfPageCount || !bookId) return;
    const coverage = pageTextByPage.size / pdfPageCount;
    if (coverage < 0.6) return; // wait for 60% page coverage
    if (syllabusUploadRequested) return;

    const bundles: PageTextBundle[] = Array.from({ length: pdfPageCount }, (_, idx) => {
      const page = idx + 1;
      return { page, text: pageTextByPage.get(`${bookId}:${page}`) ?? "" };
    });
    const autoToc = buildAutoToc(bundles);
    if (!autoToc.length || autoToc.length <= syllabusToc.length) return;

    setSyllabusToc(autoToc);
    setSyllabusPages(bundles);
    try {
      localStorage.setItem("syllabus_toc", JSON.stringify(autoToc));
      localStorage.setItem("syllabus_toc_source", "heuristic");
    } catch { /* quota exceeded */ }
    DEV && console.log("[SYLLABUS_TOC_UPGRADE]", {
      prevNodes: syllabusToc.length,
      newNodes: autoToc.length,
      coverage: Math.round(coverage * 100),
    });
  }, [syllabusTocSource, pdfPageCount, bookId, pageTextByPage, syllabusToc.length, syllabusUploadRequested]);

  // Sync syllabusToc → tocStore whenever the buildAutoToc result is better
  // than what tocStore already holds (absent, synthetic, or low-quality).
  // This ensures DAT Apex chapter selection always reads real chapter data.
  useEffect(() => {
    if (!syllabusToc.length) return;
    const docId = bookId || uploadedFile?.name?.replace(/\.[Pp][Dd][Ff]$/, "") || "book";
    const stored = useTocStore.getState().getToc(docId);
    if (stored && !isTocLowQuality(stored)) return;

    const tocItems = syllabusToc.map((n) => ({
      id: n.id,
      title: n.title,
      pageNumber: n.page,
      level: n.kind === "chapter" ? 0 : n.kind === "section" ? 1 : 2,
      children: n.children?.map((child) => ({
        id: child.id,
        title: child.title,
        pageNumber: child.page,
        level: 1,
      })),
    }));
    useTocStore.getState().saveToc(docId, uploadedFile?.name || "Document", tocItems, "heuristic");
  }, [syllabusToc, bookId, uploadedFile?.name]);

  // Clears the stored TOC and resets state so buildAutoToc re-runs with fresh data.
  const handleRegenerateToc = useCallback(() => {
    const docId = bookId || uploadedFile?.name?.replace(/\.[Pp][Dd][Ff]$/, "") || "book";
    useTocStore.getState().clearToc(docId);
    setSyllabusToc([]);
    setSyllabusTocSource("none");
    setTableOfContents([]);
    try { localStorage.removeItem("syllabus_toc_source"); } catch { /* ignore */ }
  }, [bookId, uploadedFile?.name]);

  /* =========================================================================
     🔹 Highlight Paragraph — zoom to matching text in the PDF text layer
     Called when user clicks a priority item in SurgeonCockpit.
     Searches spans in the rendered react-pdf text layer, scrolls to the
     first match, and applies a teal glow animation for 2.5 s.
  ========================================================================= */
  // Stable ref to avoid re-creating the callback when store state changes
  const insightsPanelStoreRef = useRef(useInsightsPanelStore.getState());
  useEffect(() => {
    return useInsightsPanelStore.subscribe(
      (state) => { insightsPanelStoreRef.current = state; }
    );
  }, []);

  // Freeze flag: prevents stale scroll events from firing during page hydration.
  // Set true on any user-initiated page jump; auto-cleared after 600 ms (enough
  // for PDF render ≈200 ms + scroll debounce ≈200 ms, with 200 ms headroom).
  const syncFrozenRef = useRef(false);
  const syncFreezeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Navigation lock + intent model: prevents observer/scroll-sync feedback loops.
  // navLockRef: true during page hydration and any programmatic scroll.
  // navIntentRef: tracks whether the last navigation was user-driven or scroll-driven.
  // lastUserNavAtRef: timestamp of the last user-initiated navigation.
  // lastProgrammaticScrollAtRef: timestamp of the last programmatic scroll.
  const navLockRef = useRef(false);
  const navLockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navIntentRef = useRef<'NONE' | 'USER' | 'SYNC'>('NONE');
  const lastUserNavAtRef = useRef(0);
  const lastProgrammaticScrollAtRef = useRef(0);


  const clearTransientPriorityPreview = useCallback(() => {
    document.querySelectorAll('.priority-paragraph-preview').forEach((el) => {
      el.classList.remove('priority-paragraph-preview');
    });
  }, []);

  const handlePreviewParagraph = useCallback((searchText: string | null) => {
    clearTransientPriorityPreview();
    if (!searchText || searchText.trim().length < 10) return;

    const needle = searchText.trim().toLowerCase().slice(0, 80);
    const textLayer = document.querySelector('.react-pdf__Page__textContent, .textLayer');
    if (!textLayer) return;
    const spans = Array.from(textLayer.querySelectorAll('span'));
    if (!spans.length) return;

    let matchStart = -1;
    let matchEnd = -1;
    for (let i = 0; i < spans.length && matchStart === -1; i++) {
      let accumulated = '';
      for (let j = i; j < Math.min(i + 20, spans.length); j++) {
        accumulated += (spans[j].textContent || '').toLowerCase();
        if (accumulated.includes(needle.slice(0, 40))) {
          matchStart = i;
          matchEnd = j;
          break;
        }
      }
    }

    if (matchStart === -1) return;
    for (let k = matchStart; k <= matchEnd && k < spans.length; k++) {
      spans[k].classList.add('priority-paragraph-preview');
    }
  }, [clearTransientPriorityPreview]);

  const handleHighlightParagraph = useCallback((searchText: string) => {
    if (!searchText || searchText.trim().length < 10) return;

    const pinnedKey = searchText.trim().slice(0, 80);
    const panelStore = useInsightsPanelStore.getState();
    const hlStore = useHighlightStore.getState();
    const docId = bookId || 'default-book';
    const pageIndex = currentPage - 1;

    // Toggle: if already pinned, unpin and remove its overlay
    if (panelStore.isPinned(pinnedKey)) {
      panelStore.unpinText(pinnedKey);
      hlStore.removeHighlight(docId, pageIndex, pinnedKey);
      // Remove the overlay tagged with this key
      document.querySelectorAll(`[data-pin-key]`).forEach((el) => {
        if ((el as HTMLElement).dataset.pinKey === pinnedKey) el.remove();
      });
      document.querySelectorAll('.priority-paragraph-pinned').forEach((el) => {
        el.classList.remove('priority-paragraph-pinned');
      });
      return;
    }

    // Take the first 80 chars for matching to avoid over-specificity
    const needle = pinnedKey.toLowerCase();

    // Locate the rendered text layer
    const layerSelectors = [
      '.react-pdf__Page__textContent',
      '.textLayer',
      '[data-testid="pure-reader-view"] .react-pdf__Page__textContent',
      '[data-testid="expert-view-container"] .react-pdf__Page__textContent',
    ];

    let textLayer: Element | null = null;
    for (const sel of layerSelectors) {
      textLayer = document.querySelector(sel);
      if (textLayer) break;
    }
    if (!textLayer) return;

    const spans = Array.from(textLayer.querySelectorAll('span'));
    if (spans.length === 0) return;

    // Sliding window: accumulate consecutive span text until the needle prefix is found
    let matchStart = -1;
    let matchEnd = -1;

    for (let i = 0; i < spans.length && matchStart === -1; i++) {
      let accumulated = '';
      for (let j = i; j < Math.min(i + 20, spans.length); j++) {
        accumulated += (spans[j].textContent || '').toLowerCase();
        if (accumulated.includes(needle.slice(0, 40))) {
          matchStart = i;
          matchEnd = j;
          break;
        }
      }
    }

    // Fuzzy fallback: match the first 6 words of the needle in a single span
    if (matchStart === -1) {
      const segment = needle.split(/\s+/).filter(Boolean).slice(0, 6).join(' ');
      for (let i = 0; i < spans.length; i++) {
        if ((spans[i].textContent || '').toLowerCase().includes(segment)) {
          matchStart = i;
          matchEnd = i;
          break;
        }
      }
    }

    if (matchStart === -1) return;

    // Scroll to matched span
    spans[matchStart].scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Apply persistent pinned glow to matched spans
    for (let k = matchStart; k <= matchEnd && k < spans.length; k++) {
      spans[k].classList.add('priority-paragraph-glow', 'priority-paragraph-pinned');
    }

    // ── Anchor Overlay — persistent, tagged with pinnedKey for later removal ──
    const spansToHighlight = spans.slice(matchStart, matchEnd + 1);
    const pageEl = spansToHighlight[0]?.closest('.react-pdf__Page') as HTMLElement | null;

    // Hoist bbox so we can store it after the DOM block
    let bboxTop = Infinity, bboxBottom = -Infinity, bboxLeft = Infinity, bboxRight = -Infinity;

    if (pageEl) {
      const pageRect = pageEl.getBoundingClientRect();
      for (const span of spansToHighlight) {
        const r = span.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        bboxTop    = Math.min(bboxTop,    r.top    - pageRect.top);
        bboxBottom = Math.max(bboxBottom, r.bottom - pageRect.top);
        bboxLeft   = Math.min(bboxLeft,   r.left   - pageRect.left);
        bboxRight  = Math.max(bboxRight,  r.right  - pageRect.left);
      }
      if (bboxTop < Infinity) {
        const ol = document.createElement('div');
        ol.className = 'para-anchor-overlay';
        ol.dataset.pinKey = pinnedKey;
        ol.style.cssText = [
          'position:absolute',
          `top:${Math.round(bboxTop) - 4}px`,
          `left:${Math.round(bboxLeft) - 6}px`,
          `width:${Math.round(bboxRight - bboxLeft) + 12}px`,
          `height:${Math.round(bboxBottom - bboxTop) + 8}px`,
          'border:1.5px solid rgba(45,212,191,0.45)',
          'border-radius:5px',
          'background:rgba(45,212,191,0.06)',
          'pointer-events:none',
          'z-index:20',
          'animation:anchorPulse 0.9s ease-out',
          'transition:border-color 0.3s',
        ].join(';');
        pageEl.appendChild(ol);
        // After initial pulse, settle to a thin persistent outline — stays until page change
        setTimeout(() => {
          ol.style.borderColor = 'rgba(45,212,191,0.35)';
        }, 900);
      }
    }

    // Register as pinned in both stores so cards show indicator + overlay can be redrawn
    panelStore.pinText(pinnedKey);
    hlStore.setPinned(docId, pageIndex, pinnedKey, pinnedKey,
      bboxTop < Infinity ? {
        top: Math.round(bboxTop) - 4,
        left: Math.round(bboxLeft) - 6,
        width: Math.round(bboxRight - bboxLeft) + 12,
        height: Math.round(bboxBottom - bboxTop) + 8,
      } : undefined,
    );
  }, [bookId, currentPage]);

  /* =========================================================================
     🔹 Jump to source — called from SourceAnchor "Jump to source" button
     Uses the SourceRef's quote to scroll the PDF text layer to the exact
     paragraph. If the ref points to a different page, navigates there first
     then highlights after a short render delay.
  ========================================================================= */
  const handleJumpToSource = useCallback((ref: SourceRef) => {
    const targetPage = ref.pageIndex + 1; // SourceRef.pageIndex is 0-based
    const searchText = ref.quote || '';

    if (targetPage !== currentPage) {
      // Navigate to target page, then highlight after render settles
      syncToPage(targetPage);
      setTimeout(() => handleHighlightParagraph(searchText), 450);
    } else {
      handleHighlightParagraph(searchText);
    }
  }, [currentPage, handleHighlightParagraph]);

  /* =========================================================================
     🔹 PDF scroll → active paragraph → insights panel sync
     Called by SmartPDFViewer when the most-visible paragraph text changes.
     We try to find the best matching insight item and drive the sync store.
  ========================================================================= */
  const handleActiveParagraphChange = useCallback((snippet: string | null) => {
    // Drop events that arrive during page hydration — the PDF is still rendering
    // the new page so any viewport-center calculation would hit stale content.
    if (syncFrozenRef.current) return;

    const store = insightsPanelStoreRef.current;
    store.setActiveVisibleText(snippet);

    // Scroll → active anchor: resolve the viewport-center snippet to the closest
    // thought-unit anchor and keep the Expert Brain / LeftPanel card in sync.
    // Only runs when speech is not playing (speech owns the anchor during playback)
    // and when no explicit card-click focus is locked (RC-3: prevents overwriting
    // a user-selected card in the gap after focusEvidence fires).
    if (
      snippet &&
      useReadingFocusStore.getState().playbackState === 'idle' &&
      Date.now() > userFocusLockedUntilRef.current
    ) {
      const resolved = resolveEvidenceId(snippet);
      if (resolved) setFocusedEvidenceId(resolved);
    }

    if (!snippet || !store.syncInsightsToPdf) return;

    // Build paragraph blocks from current page text and try to find matching block
    const pageText = thoughtUnits?.[currentThoughtUnit - 1]?.text || '';
    if (!pageText.trim()) return;

    const blocks = extractParagraphBlocks(pageText, currentPage, bookId);
    const matched = findBestMatchingBlock(snippet, blocks);
    if (matched) {
      store.setActiveParagraphId(matched.id);
    }
  }, [thoughtUnits, currentThoughtUnit, currentPage, bookId, resolveEvidenceId, setFocusedEvidenceId]);

  useEffect(() => {
    setRightPanelState((prev) => {
      const nextVersion = buildCurrentPageVersion(bookId, currentPage, prev.activeSectionId ?? null);
      if (
        prev.activeDocumentId === bookId &&
        prev.activePageNumber === currentPage &&
        prev.currentPageVersion === nextVersion
      ) {
        return prev;
      }

      return {
        ...prev,
        workspaceMode: viewMode,
        documentId: bookId,
        activePage: currentPage,
        activeDocumentId: bookId,
        activePageNumber: currentPage,
        activeCardId: null,
        currentPageVersion: nextVersion,
      };
    });
  }, [bookId, currentPage, viewMode]);

  const handleRightPanelStateChange = useCallback((updater: RightPanelState | ((prev: RightPanelState) => RightPanelState)) => {
    setRightPanelState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      return {
        ...next,
        documentId: next.activeDocumentId,
        activePage: next.activePageNumber,
        deeperReasoning: next.deeperReasoningEnabled,
        syncHighlights: next.syncHighlightsEnabled,
        currentPageVersion: buildCurrentPageVersion(
          next.activeDocumentId,
          next.activePageNumber,
          next.activeSectionId ?? null,
        ),
      };
    });
  }, []);

  const handleRightPanelTabChange = useCallback((tab: RightPanelTab) => {
    handleRightPanelStateChange((prev) => ({ ...prev, activeTab: tab }));
  }, [handleRightPanelStateChange]);

  /* =========================================================================
     🔹 Background book processing — runs after PDF viewer is already open
     Parses text, builds thought units, and falls back TOC from chapters.
     Never clears fileUrl on failure — the viewer stays live regardless.
  ========================================================================= */
  // documentId here is the filename-derived bookId — kept as-is for TOC
  // caching (content-scoped, must stay stable across re-uploads of the same
  // file) and DAT subject-classification heuristics (classifyDATSubject
  // pattern-matches against it, so it must stay human-readable, never a raw
  // UUID). canonicalDocumentId is the SEPARATE, real per-instance identity
  // (see lib/insights/resolveDocumentIdentity.ts) — used only for
  // CanonicalThoughtUnit's own documentId field, so two documents sharing a
  // filename don't collide in DAT Apex's canonical-unit store either.
  // Optional and additive: omitting it preserves today's behavior exactly.
  const startBookProcessing = useCallback(async (file: File, documentId: string, initialPage = 1, canonicalDocumentId?: string) => {
    processingAbortControllerRef.current?.abort();
    const ac = new AbortController();
    processingAbortControllerRef.current = ac;

    setBookProcessingStatus({ phase: 'processing', progress: 'Extracting text...', pagesProcessed: 0, totalPages: 0 });

    // Keyed by page index so batches that arrive out of order (priority page
    // fires before the sequential scan reaches it) still produce a sorted flat
    // array when we rebuild thoughtUnits after each batch.
    const pageUnitsMap = new Map<number, ThoughtUnit[]>();
    // Accumulate raw texts for TOC generation after full extraction.
    const allPageTexts: Array<{ pageIndex: number; text: string }> = [];
    let seenContent = false;

    // Reset pause state when a new extraction starts.
    indexingPausedRef.current = false;
    setIndexingPaused(false);
    indexingResumeRef.current = null;

    try {
      await extractPageTextsIncremental(file, {
        signal: ac.signal,
        batchSize: 10,
        // Extract the currently visible page first so its thought units are
        // available for AI context before the sequential scan reaches it.
        priorityPage: initialPage > 1 ? initialPage : undefined,
        // Pause gate — when indexingPausedRef is true, returns a Promise
        // that resolves only after the user clicks Resume (which calls the
        // stored resolve). Using a ref avoids stale closure over React state.
        onPauseCheck: () => {
          if (!indexingPausedRef.current) return;
          return new Promise<void>((resolve) => {
            indexingResumeRef.current = resolve;
          });
        },
        onProgress: (current, total) => {
          if (!ac.signal.aborted) {
            setBookProcessingStatus(prev => ({
              ...prev,
              pagesProcessed: current,
              totalPages: total,
              progress: `Preparing book — ${current} of ${total} pages analyzed`,
            }));
          }
        },
        onBatch: (pages, totalPages) => {
          if (ac.signal.aborted) return;

          allPageTexts.push(...pages);

          // Reader-architecture fix: this incremental extraction already runs
          // on every book load, unconditionally — independent of activeShellTab
          // — and already uses the same buildStructuredPageTextFull() SmartPDFViewer
          // uses (lib/pdfjs-handler.ts). Previously its per-page text only ever
          // fed thoughtUnits/TOC and was discarded; pageTextByPage (what NoteLab/
          // Learning Hub/Recall/Podcast/Study Guide actually read) was populated
          // ONLY by SmartPDFViewer's onPageTextExtracted callback, which is mounted
          // exclusively inside the "reader" shell tab — so those other tabs saw an
          // empty map for any page the Reader tab hadn't been opened for yet.
          // Background-fills gaps only — never overwrites a key that already has
          // text, so a live SmartPDFViewer extraction (which can benefit from the
          // OCR fallback and the exact live viewport) always wins if it races this.
          setPageTextByPage((prev) => {
            let changed = false;
            const next = new Map(prev);
            for (const p of pages) {
              if (!p.text || p.text.length <= 20) continue; // matches SmartPDFViewer's own floor
              const key = `${documentId}:${p.pageIndex + 1}`; // pageIndex is 0-based; pageTextByPage keys are 1-based
              if (!next.has(key)) {
                next.set(key, p.text);
                changed = true;
              }
            }
            return changed ? next : prev;
          });

          // Convert pages to thought units and store by page index.
          // Concurrently persist CanonicalThoughtUnits to IDB for DAT Apex.
          const canonicalBatch: import('@/lib/canonical').CanonicalThoughtUnit[] = [];
          const bookTitle = file.name.replace(/\.[Pp][Dd][Ff]$/, '');

          for (const p of pages) {
            const rawChunks = chunkTextToUnits(p.text);
            const units = rawChunks as ThoughtUnit[];
            if (units.length > 0) pageUnitsMap.set(p.pageIndex, units);

            // Build char-offset anchors for canonical units by scanning
            // each chunk text inside the page text.
            let searchStart = 0;
            const chunksWithOffsets = rawChunks.map((chunk) => {
              const idx = p.text.indexOf(chunk.text, searchStart);
              const startChar = idx >= 0 ? idx : searchStart;
              const endChar = startChar + chunk.text.length;
              searchStart = endChar;
              return { text: chunk.text, startChar, endChar };
            });

            const canonical = buildCanonicalUnits({
              documentId: canonicalDocumentId ?? documentId,
              bookId: documentId,
              bookTitle,
              pageIndex: p.pageIndex,
              chunks: chunksWithOffsets,
            });
            canonicalBatch.push(...canonical);
          }

          // Fire-and-forget — canonical unit persistence is best-effort.
          if (canonicalBatch.length > 0) {
            saveCanonicalUnits(canonicalBatch).catch(() => {});
          }

          // Rebuild sorted flat array so pageToUnit() mapping stays correct
          // regardless of which pages the priority extraction pulled first.
          if (pageUnitsMap.size > 0) {
            const sorted = [...pageUnitsMap.entries()]
              .sort(([a], [b]) => a - b)
              .flatMap(([, units]) => units);
            setThoughtUnits(sorted);
            if (!seenContent) {
              seenContent = true;
              setSampleText(sorted[0]?.text ?? '');
            }
          }

          setBookProcessingStatus(prev => ({
            ...prev,
            pagesProcessed: allPageTexts.length,
            totalPages,
            progress: `Indexed ${allPageTexts.length} of ${totalPages} pages`,
          }));
        },
      });

      if (ac.signal.aborted) return;

      if (!seenContent) {
        throw new Error("No readable content found in PDF");
      }

      // Fallback TOC from accumulated page texts — only if outline extraction produced nothing.
      setTimeout(() => {
        if (ac.signal.aborted) return;
        const currentToc = useTocStore.getState().getToc(documentId);
        if (!currentToc || currentToc.items.length === 0) {
          DEV && console.log('📑 No TOC from outline - generating fallback from parsed content');
          const fullText = allPageTexts
            .sort((a, b) => a.pageIndex - b.pageIndex)
            .map(p => p.text)
            .join('\n\n');
          const chapters = splitIntoChapters(fullText);
          if (chapters.length > 0) {
            const fallbackToc: TOCEntry[] = chapters.map((ch, idx) => ({
              title: ch.title || `Chapter ${idx + 1}`,
              pageNumber: ch.page || idx + 1,
              level: 0,
              confidence: 0.6,
            }));
            setTableOfContents(fallbackToc);
            const tocItems = fallbackToc.map((entry: TOCEntry, idx: number) => ({
              id: `toc_${idx}_${Date.now()}`,
              title: entry.title,
              pageNumber: entry.pageNumber,
              level: entry.level || 0,
            }));
            useTocStore.getState().saveToc(documentId, file.name, tocItems, 'heuristic');
            DEV && console.log(`📑 Fallback TOC generated: ${tocItems.length} entries`);
          }
        } else {
          const storeItems = currentToc.items.map((item: any) => ({
            title: item.title,
            pageNumber: item.pageNumber,
            level: item.level || 0,
          }));
          setTableOfContents(storeItems);
        }
      }, 500);

      DEV && console.log("[WHITEBOARD_LEGACY_BLOCKED]", { reason: "detectWhiteboardSections disabled — study model is source" });
      setShowWhiteboardPanel(false);

      setBookProcessingStatus({ phase: 'done', progress: 'Ready', pagesProcessed: 0, totalPages: 0 });
      DEV && console.log('✅ Background book processing complete:', {
        pages: allPageTexts.length,
        fileName: file.name,
      });

    } catch (err) {
      if (ac.signal.aborted) return;
      const msg = err instanceof Error ? err.message : 'Processing failed';
      let friendly = 'Analysis could not complete — you can still read the book.';
      if (msg.includes('No readable content') || msg.includes('scanned')) {
        friendly = 'No searchable text found. You can still view the book — study features may be limited.';
      } else if (msg.includes('timeout') || msg.includes('took too long')) {
        friendly = 'Text analysis timed out. You can still read the book — study features may be limited.';
      } else if (msg.includes('password') || msg.includes('encrypted')) {
        friendly = 'PDF is password-protected. Text features unavailable, but you can view the book.';
      } else if (msg.includes('memory') || msg.includes('out of')) {
        friendly = 'Not enough memory to analyze this PDF. You can still view the book.';
      }
      setBookProcessingStatus(prev => ({ ...prev, phase: 'error', progress: friendly }));
      console.warn('📚 Background book processing failed:', msg);
    }
  }, []);

  const toggleIndexingPause = useCallback(() => {
    const nowPaused = !indexingPausedRef.current;
    indexingPausedRef.current = nowPaused;
    setIndexingPaused(nowPaused);
    if (!nowPaused && indexingResumeRef.current) {
      // Trigger the resolve stored in the pause-gate promise.
      indexingResumeRef.current();
      indexingResumeRef.current = null;
    }
  }, []);

  /* =========================================================================
     🔹 Upload PDF — parse + detect diagrams
  ========================================================================= */
  const handleUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    
    // ✅ Enhanced PDF validation
    if (!file) {
      alert("Please select a file.");
      return;
    }

    // Check file extension
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.pdf')) {
      alert("Please upload a PDF file. Selected file does not have a .pdf extension.");
      return;
    }

    // Check MIME type (more comprehensive check)
    if (file.type !== "application/pdf" && !file.type.includes("pdf")) {
      alert("Please upload a PDF file. The selected file type is not recognized as a PDF.");
      return;
    }

    // Check file size (500MB limit)
    const maxSizeInBytes = 500 * 1024 * 1024; // 500MB
    if (file.size > maxSizeInBytes) {
      alert(`File too large. Please upload a PDF smaller than 500MB. Your file is ${(file.size / (1024 * 1024)).toFixed(1)}MB.`);
      return;
    }

    // Check minimum file size (avoid empty files)
    if (file.size < 1024) { // 1KB minimum
      alert("File appears to be empty or corrupted. Please select a valid PDF file.");
      return;
    }

    // ✅ Initialize parsing state with better messaging
    setPdfParsingState({
      isLoading: true,
      error: null,
      progress: `Preparing ${file.name} (${(file.size / (1024 * 1024)).toFixed(1)}MB)...`
    });

    // Reset state — always start at page 1 on new upload
    setThoughtUnits([]);
    setCurrentThoughtUnit(1);
    setCurrentPage(1);
    // Clear cached page text so the new document never sees stale text from
    // a previously loaded PDF. Must happen before the pipeline runs.
    setPageTextByPage(new Map());
    // Reset global sync store so stale persisted page from a previous session
    // cannot override the fresh page-1 state via the global sync subscription.
    updateSync({ page: 1, unitIndex: 1 }, 'manual');

    setUploadedFile(file);
    setViewMode("reader");
    setBookId(file.name.replace(/\.[Pp][Dd][Ff]$/, "") || "book");

    try {
      let url: string;
      let libEntry: { id: string; name: string; url: string; uploadedAt: any; isLocal?: boolean; localDocumentId?: string };

      // Check if we're using the bypass (mock user) or real Firebase
      const isUsingBypass = process.env.NEXT_PUBLIC_DISABLE_GOOGLE_SIGNIN === "1";
      const canUseFirebase = firebaseConnected && user && !isUsingBypass;

      setPdfParsingState(prev => ({ ...prev, progress: "Uploading to cloud..." }));

      // Pre-flight storage check: warn if the browser may not have enough quota.
      // navigator.storage.persist() requests durable storage (prevents eviction).
      if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
      if (navigator.storage?.estimate) {
        navigator.storage.estimate().then(est => {
          const needed = file.size;
          const available = (est.quota ?? 0) - (est.usage ?? 0);
          if (available > 0 && available < needed * 1.2) {
            const needMB = (needed / 1e6).toFixed(0);
            const availMB = (available / 1e6).toFixed(0);
            console.warn(`[storage] Low quota: need ~${needMB} MB, available ~${availMB} MB. IDB save may fail.`);
            setStorageWarning(`Low storage: need ~${needMB} MB but only ~${availMB} MB available. The book may not save correctly.`);
          }
        }).catch(() => {});
      }

      // Saves PDF binary and metadata to IndexedDB for durable local storage.
      // Returns a promise that resolves once the binary is confirmed written.
      // Callers must await this before committing the localStorage library entry.
      const persistToIDB = async (documentId: string): Promise<void> => {
        const uploadedAt = new Date().toISOString();
        const meta = {
          documentId,
          title: file.name,
          mimeType: file.type || 'application/pdf',
          byteLength: file.size,
          createdAt: uploadedAt,
          updatedAt: uploadedAt,
          processingStatus: 'pending' as const,
          schemaVersion: 1,
        };
        await saveDocumentMeta(meta).catch(err => console.warn('IDB meta save failed:', err));
        const buf = await file.arrayBuffer();
        const data = new Uint8Array(buf);
        await saveDocumentFile(documentId, data);
        await saveDocumentMeta({ ...meta, processingStatus: 'complete', updatedAt: new Date().toISOString() })
          .catch(err => console.warn('IDB status update failed:', err));
      };

      // Persists local library entries across sessions (blob URLs are session-only,
      // so we store metadata only; the binary lives in IndexedDB).
      const persistLocalLibraryEntry = (entry: { id: string; name: string; uploadedAt: string; localDocumentId: string }) => {
        try {
          const raw = localStorage.getItem(LOCAL_LIBRARY_KEY);
          const existing = raw ? (JSON.parse(raw) as typeof entry[]) : [];
          // Cap at 50 entries; drop oldest first
          const updated = [entry, ...existing.filter(e => e.id !== entry.id)].slice(0, 50);
          localStorage.setItem(LOCAL_LIBRARY_KEY, JSON.stringify(updated));
        } catch {
          // Non-fatal — localStorage may be full or disabled
        }
      };

      if (canUseFirebase) {
        try {
          url = await uploadPDF(file, USER_ID);
          getPDFLibrary(USER_ID).then(setPdfLibrary);
          libEntry = {
            id: String(Date.now()),
            name: file.name,
            url,
            uploadedAt: new Date().toISOString(),
          };
        } catch (error) {
          console.error("Firebase upload failed, falling back to local:", error);
          // Firebase failed — save locally with IDB binary for durability
          const documentId = crypto.randomUUID();
          url = createBlobUrl(file);
          const uploadedAt = new Date().toISOString();
          libEntry = { id: documentId, name: file.name, url, uploadedAt, isLocal: true, localDocumentId: documentId };
          setPdfLibrary((prev) => [libEntry, ...prev]);
          setCurrentLocalDocumentId(documentId);
          // Only persist the localStorage library entry after IDB binary is confirmed.
          // setFileUrl runs immediately (below) so the viewer opens without waiting.
          persistToIDB(documentId)
            .then(() => persistLocalLibraryEntry({ id: documentId, name: file.name, uploadedAt, localDocumentId: documentId }))
            .catch(() => console.warn('[storage] IDB save failed — book will not restore after refresh'));
        }
      } else {
        // Guest mode or bypass: blob URL for this session + IDB binary for future sessions
        const documentId = crypto.randomUUID();
        url = createBlobUrl(file);
        const uploadedAt = new Date().toISOString();
        libEntry = { id: documentId, name: file.name, url, uploadedAt, isLocal: true, localDocumentId: documentId };
        setPdfLibrary((prev) => [libEntry, ...prev]);
        setCurrentLocalDocumentId(documentId);
        persistToIDB(documentId)
          .then(() => persistLocalLibraryEntry({ id: documentId, name: file.name, uploadedAt, localDocumentId: documentId }))
          .catch(() => console.warn('[storage] IDB save failed — book will not restore after refresh'));
      }

      setFileUrl(url);

      // TOC from URL (fire-and-forget — outline extraction via PDF.js is async)
      const documentId = file.name.replace(/\.[Pp][Dd][Ff]$/, "") || "book";
      generateTOC(url).then((tocEntries) => {
        if (tocEntries && tocEntries.length > 0) {
          setTableOfContents(tocEntries);
          const tocItems = tocEntries.map((entry: any, idx: number) => ({
            id: `toc_${idx}_${Date.now()}`,
            title: entry.title || `Chapter ${idx + 1}`,
            pageNumber: entry.pageNumber || entry.page || idx + 1,
            level: entry.level || 0,
          }));
          useTocStore.getState().saveToc(documentId, file.name, tocItems, 'outline');
          DEV && console.log(`📑 TOC auto-generated: ${tocItems.length} chapters`);
        }
      }).catch(() => {
        DEV && console.log('📑 Initial TOC generation deferred to outline extraction or fallback');
      });

      // Phase 2: text extraction + thought-unit parsing.
      // Viewer already shows page 1 — never block or remove the PDF on parse failures.
      // libEntry.localDocumentId is the real crypto.randomUUID() when this
      // upload got a local IDB copy (the two fallback branches above); a
      // successful Firebase upload doesn't create one, so fall back to a
      // hash of the upload URL — still real per-instance identity, just
      // derived rather than random. Read directly off libEntry/url rather
      // than the reactive currentLocalDocumentId store field, which would
      // still read its PRE-upload (stale) value this synchronously after
      // the setCurrentLocalDocumentId(...) calls above.
      startBookProcessing(file, documentId, 1, resolveDocumentIdentity({ documentId: libEntry.localDocumentId, fileUrl: url, bookId: documentId }));

      setPdfParsingState({ isLoading: false, error: null, progress: '' });

    } catch (error) {
      // Upload/save failed — fileUrl was never set, safe to clear everything.
      const errorMessage = error instanceof Error ? error.message : "Failed to upload PDF";
      console.error("❌ PDF upload failed:", errorMessage);
      setPdfParsingState({ isLoading: false, error: errorMessage, progress: 'Failed' });
      setFileUrl(null);
      setUploadedFile(null);
      setPageTextByPage(new Map());
      alert(`Failed to open PDF: ${errorMessage}`);
    }
  };

  // Initialize enhanced sync system when content is loaded
  useEffect(() => {
    if (pdfPageCount > 1 && thoughtUnits.length > 0 && tableOfContents.length > 0) {
      DEV && console.log('🔄 Initializing enhanced sync system');
      initializeContent(pdfPageCount, thoughtUnits.length, tableOfContents);
      
      // Analyze content density for current page
      if (thoughtUnits[currentThoughtUnit - 1]?.text) {
        const density = analyzeContentDensity(thoughtUnits[currentThoughtUnit - 1].text, currentPage);
        updateContentDensity(currentPage, density);
      }
    }
  }, [pdfPageCount, thoughtUnits.length, tableOfContents.length, initializeContent, updateContentDensity, analyzeContentDensity, currentThoughtUnit, currentPage]);

  // Update content density when page changes
  useEffect(() => {
    if (thoughtUnits[currentThoughtUnit - 1]?.text) {
      const density = analyzeContentDensity(thoughtUnits[currentThoughtUnit - 1].text, currentPage);
      updateContentDensity(currentPage, density);
    }
  }, [currentPage, currentThoughtUnit, thoughtUnits, analyzeContentDensity, updateContentDensity]);

  // Tab sync effects: snap Hybrid to current chapter's first unit when switching tabs
  useEffect(() => {
    try {
      if (activeShellTab === "reader") {
        DEV && console.log(`🔄 Tab switch to ${viewMode}: syncing to current chapter`);
        
        // Safe chapter-aware navigation with proper error handling
        try {
          // Get sync state safely without destructuring
          const syncStore = useReaderSync.getState();
          
          if (syncStore && syncStore.findNearestChapter && typeof syncStore.findNearestChapter === 'function') {
            const nearestChapter = syncStore.findNearestChapter(currentPage);
            
            if (nearestChapter && nearestChapter.unitStart && nearestChapter.unitStart > 0) {
              DEV && console.log(`🔄 Tab sync: Found chapter "${nearestChapter.title}" for page ${currentPage}`);
              
              const chapterStartUnit = nearestChapter.unitStart;
              
              // Validate unit bounds
              if (chapterStartUnit >= 1 && chapterStartUnit <= thoughtUnits.length) {
                setCurrentThoughtUnit(chapterStartUnit);
                updateSync({ 
                  page: currentPage, 
                  unitIndex: chapterStartUnit 
                }, 'manual');
                
                DEV && console.log(`🔄 Tab sync complete: staying on page ${currentPage}, unit ${chapterStartUnit}`);
                return; // Success, exit early
              } else {
                console.warn(`🔄 Tab sync: Invalid chapter unit ${chapterStartUnit}, bounds: 1-${thoughtUnits.length}`);
              }
            } else {
              DEV && console.log(`🔄 Tab sync: No valid chapter found for page ${currentPage}`);
            }
          } else {
            console.warn(`🔄 Tab sync: Sync store not ready or missing findNearestChapter function`);
          }
          
          // Fallback: use page-to-unit mapping
          const fallbackUnit = pageToUnit(currentPage, pdfPageCount, thoughtUnits.length);
          if (fallbackUnit >= 1 && fallbackUnit <= thoughtUnits.length) {
            setCurrentThoughtUnit(fallbackUnit);
            updateSync({ page: currentPage, unitIndex: fallbackUnit }, 'manual');
            DEV && console.log(`🔄 Tab sync fallback: page ${currentPage}, unit ${fallbackUnit}`);
          } else {
            console.warn(`🔄 Tab sync fallback failed: invalid unit ${fallbackUnit}, bounds: 1-${thoughtUnits.length}`);
          }
          
        } catch (chapterError) {
          console.warn(`🔄 Tab sync chapter navigation error:`, chapterError);
          
          // Final fallback: just ensure we have a valid unit
          try {
            const safeUnit = Math.max(1, Math.min(currentThoughtUnit, thoughtUnits.length));
            if (safeUnit !== currentThoughtUnit) {
              setCurrentThoughtUnit(safeUnit);
              updateSync({ page: currentPage, unitIndex: safeUnit }, 'manual');
              DEV && console.log(`🔄 Tab sync final fallback: unit ${safeUnit}`);
            }
          } catch (finalError) {
            console.error(`🔄 Tab sync final fallback failed:`, finalError);
          }
        }
      }
    } catch (error) {
      console.error(`🔄 Tab sync critical error for ${viewMode}:`, error);
      // Don't crash the app, just log the error
    }
  }, [viewMode, currentPage, pdfPageCount, thoughtUnits.length, updateSync, currentThoughtUnit]);

  /* =========================================================================
     🔹 Load PDF from Library
     For local entries (localDocumentId set): reconstructs a session blob URL
     from the IndexedDB binary. Falls back to the stored URL for Firebase entries.
  ========================================================================= */
  const handleLoadPDF = useCallback(async (url: string, name?: string, localDocumentId?: string) => {
    setPageTextByPage(new Map());
    setCurrentPage(1);
    setThoughtUnits([]);
    setCurrentThoughtUnit(1);
    updateSync({ page: 1, unitIndex: 1 }, 'manual');
    if (name) setBookId(name.replace(/\.[Pp][Dd][Ff]$/, "") || "book");
    setShowLibrary(false);
    setViewMode("reader");
    setMissingPDFEntry(null);

    if (localDocumentId) {
      // Always reconstruct blob URL from IDB — stored blob URLs are session-scoped
      // and are invalid after page refresh or when opened in a new tab.
      try {
        const data = await getDocumentFile(localDocumentId);
        if (!data) {
          setMissingPDFEntry({ name: name || 'this book', documentId: localDocumentId });
          return;
        }
        const blob = new Blob([data], { type: 'application/pdf' });
        const sessionUrl = createBlobUrl(blob);
        setCurrentLocalDocumentId(localDocumentId);
        setFileUrl(sessionUrl);
        generateTOC(sessionUrl).then(setTableOfContents).catch(() => {});
        // Re-run background processing to rebuild thought units
        const docId = (name || '').replace(/\.[Pp][Dd][Ff]$/, '') || 'book';
        startBookProcessing(new File([blob], name || 'document.pdf', { type: 'application/pdf' }), docId, 1, localDocumentId);
      } catch (err) {
        console.error('Failed to load PDF from IndexedDB:', err);
        setMissingPDFEntry({ name: name || 'this book', documentId: localDocumentId });
      }
    } else {
      // Firebase URL or other durable URL — use directly
      setCurrentLocalDocumentId(null);
      setFileUrl(url);
      generateTOC(url).then(setTableOfContents).catch(() => {});
    }
  }, [startBookProcessing, updateSync]);

  useEffect(() => { handleLoadPDFRef.current = handleLoadPDF; }, [handleLoadPDF]);

  /* =========================================================================
     🔹 Delete PDF
  ========================================================================= */
  const handleDeletePDF = async (id: string, name: string, isLocal?: boolean, localDocumentId?: string) => {
    if (!confirm(`Delete ${name}?`)) return;

    if (firebaseConnected && user && !isLocal) {
      await deletePDF(USER_ID, id, name);
      getPDFLibrary(USER_ID).then(setPdfLibrary);
    } else {
      setPdfLibrary((prev) => prev.filter((p) => p.id !== id));
      // Remove binary from IndexedDB
      if (localDocumentId) {
        deleteDocument(localDocumentId).catch(err => console.warn('IDB delete failed:', err));
      }
      // Remove from localStorage library list
      try {
        const raw = localStorage.getItem(LOCAL_LIBRARY_KEY);
        if (raw) {
          const entries = JSON.parse(raw) as Array<{ id: string }>;
          localStorage.setItem(LOCAL_LIBRARY_KEY, JSON.stringify(entries.filter(e => e.id !== id)));
        }
      } catch { /* non-fatal */ }
    }
  };

  // Persist Surgeon View data to localStorage
  useEffect(() => {
    if (bookId && (notes.length > 0 || flashcards.length > 0 || highlights.length > 0 || hyperChunks.length > 0)) {
      try {
        localStorage.setItem(`surgeonView_notes_${bookId}`, JSON.stringify(notes));
        localStorage.setItem(`surgeonView_flashcards_${bookId}`, JSON.stringify(flashcards));
        localStorage.setItem(`surgeonView_highlights_${bookId}`, JSON.stringify(highlights));
        localStorage.setItem(`surgeonView_hyperchunks_${bookId}`, JSON.stringify(hyperChunks));
        DEV && console.log('💾 Surgeon View data saved to localStorage');
      } catch (error) {
        console.warn('Failed to save Surgeon View data:', error);
      }
    }
  }, [notes, flashcards, highlights, hyperChunks, bookId]);

  // Load Surgeon View data from localStorage
  useEffect(() => {
    if (bookId) {
      try {
        const savedNotes = localStorage.getItem(`surgeonView_notes_${bookId}`);
        const savedFlashcards = localStorage.getItem(`surgeonView_flashcards_${bookId}`);
        const savedHighlights = localStorage.getItem(`surgeonView_highlights_${bookId}`);
        const savedChunks = localStorage.getItem(`surgeonView_hyperchunks_${bookId}`);
        
        if (savedNotes) setNotes(JSON.parse(savedNotes));
        if (savedFlashcards) setFlashcards(JSON.parse(savedFlashcards));
        if (savedHighlights) setHighlights(JSON.parse(savedHighlights));
        if (savedChunks) setHyperChunks(JSON.parse(savedChunks));
        
        DEV && console.log('📂 Surgeon View data loaded from localStorage');
      } catch (error) {
        console.warn('Failed to load Surgeon View data:', error);
      }
    }
  }, [bookId]);

  /* =========================================================================
     🔹 Enhanced High-Yield & Sketch note helpers - Top Student Quality
  ========================================================================= */
  
  // Helper functions for enhanced note generation
  function extractKeyConceptsFromText(text: string): string[] {
    const conceptPatterns = [
      /\b(concept|principle|theory|law|rule|method|approach|strategy|technique)\s+of\s+(\w+(?:\s+\w+){0,2})/gi,
      /\b(the|a|an)\s+(main|key|primary|central|core|fundamental|essential)\s+(\w+(?:\s+\w+){0,3})/gi,
      /\b(\w+(?:\s+\w+){0,2})\s+(is|are|means|refers to|represents|involves)/gi
    ];
    
    const concepts: string[] = [];
    conceptPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) concepts.push(...matches.slice(0, 3));
    });
    
    return [...new Set(concepts)].slice(0, 8);
  }

  function findConceptConnections(text: string): string[] {
    const connectionPatterns = [
      /\b(because|since|due to|as a result|therefore|thus|hence|leads to|causes|results in)\s+(\w+(?:\s+\w+){0,4})/gi,
      /\b(related to|connected to|associated with|linked to|depends on)\s+(\w+(?:\s+\w+){0,3})/gi
    ];
    
    const connections: string[] = [];
    connectionPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) connections.push(...matches.slice(0, 2));
    });
    
    return [...new Set(connections)].slice(0, 5);
  }

  function extractExamples(text: string): string[] {
    const examplePatterns = [
      /\b(for example|such as|including|like|instance)\s+([^.!?]+)/gi,
      /\b(e\.g\.|i\.e\.)\s+([^.!?]+)/gi
    ];
    
    const examples: string[] = [];
    examplePatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) examples.push(...matches.slice(0, 2));
    });
    
    return examples.slice(0, 4);
  }

  function extractDefinitions(text: string): Array<{term: string, definition: string}> {
    const definitionPattern = /\b(\w+(?:\s+\w+){0,2})\s+(is|are|means|refers to|defined as)\s+([^.!?]+)/gi;
    const definitions: Array<{term: string, definition: string}> = [];
    
    let match;
    while ((match = definitionPattern.exec(text)) !== null && definitions.length < 3) {
      definitions.push({
        term: match[1].trim(),
        definition: match[3].trim()
      });
    }
    
    return definitions;
  }

  function extractMainPoint(text: string): string {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
    const firstSentence = sentences[0]?.trim() || "";
    
    // Look for key indicator phrases
    const keyPhrases = [
      /\b(the main|primary|key|central|most important)\s+([^.!?]+)/i,
      /\b(in summary|in conclusion|overall|essentially)\s+([^.!?]+)/i
    ];
    
    for (const pattern of keyPhrases) {
      const match = text.match(pattern);
      if (match) return match[0];
    }
    
    return firstSentence.slice(0, 100) + (firstSentence.length > 100 ? "..." : "");
  }

  function extractLogicalSteps(text: string): string[] {
    const stepPatterns = [
      /\b(first|second|third|next|then|finally|lastly)\s+([^.!?]+)/gi,
      /\b(\d+\.)\s+([^.!?]+)/gi,
      /\b(step \d+|stage \d+)\s*:?\s*([^.!?]+)/gi
    ];
    
    const steps: string[] = [];
    stepPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) steps.push(...matches.slice(0, 2));
    });
    
    if (steps.length === 0) {
      // Fallback: break into logical chunks
      const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20);
      return sentences.slice(0, 4).map(s => s.trim());
    }
    
    return steps.slice(0, 5);
  }

  function extractCaveats(text: string): string[] {
    const caveatPatterns = [
      /\b(however|but|although|except|unless|warning|caution|note that)\s+([^.!?]+)/gi,
      /\b(not to be confused|different from|unlike|contrary to)\s+([^.!?]+)/gi
    ];
    
    const caveats: string[] = [];
    caveatPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) caveats.push(...matches.slice(0, 2));
    });
    
    return caveats.length > 0 ? caveats.slice(0, 3) : [
      "Double-check understanding with examples",
      "Review connections to related concepts",
      "Practice applying in different contexts"
    ];
  }

  function getVisualMetaphor(text: string): string {
    const metaphors = [
      "a tree with branches (main trunk = core idea, branches = details)",
      "a building (foundation = basics, floors = complexity levels)",
      "a river system (main flow = key concept, tributaries = supporting ideas)",
      "a puzzle (pieces = components, complete picture = understanding)",
      "a recipe (ingredients = elements, process = how it works)",
      "a machine (parts = components, function = purpose)",
      "a story (characters = key elements, plot = how they interact)"
    ];
    
    // Try to match content to appropriate metaphor
    if (/\b(process|step|method|procedure)\b/i.test(text)) {
      return "a recipe (ingredients = elements, process = how it works)";
    }
    if (/\b(system|component|part|element)\b/i.test(text)) {
      return "a machine (parts = components, function = purpose)";
    }
    if (/\b(connect|relationship|link|associate)\b/i.test(text)) {
      return "a river system (main flow = key concept, tributaries = supporting ideas)";
    }
    
    return metaphors[Math.floor(Math.random() * metaphors.length)];
  }

  // David Butler-style helper functions for story-based learning
  function extractProblemFromText(text: string): string {
    const problemPatterns = [
      /\b(problem|issue|challenge|difficulty|obstacle)\s+(?:is|was|involves?)\s+([^.!?]+)/gi,
      /\b(pain|dysfunction|disorder|condition)\s+(?:occurs?|happens?|develops?)\s+([^.!?]+)/gi,
      /\b(when|if)\s+([^,]+),?\s+(?:then|this causes?|results? in)\s+([^.!?]+)/gi
    ];
    
    for (const pattern of problemPatterns) {
      const match = text.match(pattern);
      if (match) return match[0].slice(0, 80) + "...";
    }
    
    return "Something isn't working as it should";
  }

  function extractSolutionFromText(text: string): string {
    const solutionPatterns = [
      /\b(solution|treatment|approach|method|way to)\s+([^.!?]+)/gi,
      /\b(by|through|via)\s+([^,]+),?\s+(?:we can|this helps?|it works?)\s+([^.!?]+)/gi,
      /\b(to fix|to solve|to address|to treat)\s+([^.!?]+)/gi
    ];
    
    for (const pattern of solutionPatterns) {
      const match = text.match(pattern);
      if (match) return match[0].slice(0, 80) + "...";
    }
    
    return "There's a way to address this";
  }

  function extractOutcomeFromText(text: string): string {
    const outcomePatterns = [
      /\b(result|outcome|effect|consequence)\s+(?:is|was|will be)\s+([^.!?]+)/gi,
      /\b(this leads? to|causes?|results? in)\s+([^.!?]+)/gi,
      /\b(ultimately|finally|in the end)\s+([^.!?]+)/gi
    ];
    
    for (const pattern of outcomePatterns) {
      const match = text.match(pattern);
      if (match) return match[0].slice(0, 80) + "...";
    }
    
    return "Things get better/change happens";
  }

  function extractActionFromText(text: string): string {
    const actionPatterns = [
      /\b(acts?|works?|functions?|operates?|moves?|changes?)\s+([^.!?]+)/gi,
      /\b(does|performs?|executes?|carries? out)\s+([^.!?]+)/gi,
      /\b(to\s+\w+)\s+([^.!?]+)/gi
    ];
    
    for (const pattern of actionPatterns) {
      const match = text.match(pattern);
      if (match) return match[0].slice(0, 60) + "...";
    }
    
    return "take action";
  }

  function getButlerStyleMetaphor(text: string): string {
    // David Butler-inspired medical/educational metaphors
    const butlerMetaphors = [
      "your body's alarm system - it's trying to tell you something important",
      "electrical wiring carrying messages throughout your system",
      "a sophisticated command center processing all the information",
      "elastic bands that stretch, contract, and need proper tension",
      "a skilled construction crew rebuilding and repairing",
      "emergency responders rushing to help (sometimes overdoing it)",
      "well-choreographed dance - smooth, coordinated, and purposeful",
      "a tightrope walker making constant tiny adjustments",
      "an assembly line where each part has a specific role",
      "bridges linking different areas in a network",
      "intelligent shape-shifting to meet new challenges"
    ];
    
    // Match content to appropriate Butler-style metaphor
    if (/\b(pain|hurt|ache|discomfort)\b/i.test(text)) {
      return "your body's alarm system - it's trying to tell you something important";
    }
    if (/\b(nerve|neural|brain|cerebral)\b/i.test(text)) {
      return "electrical wiring carrying messages throughout your system";
    }
    if (/\b(muscle|tissue|movement|motion)\b/i.test(text)) {
      return "elastic bands that stretch, contract, and need proper tension";
    }
    if (/\b(healing|recovery|repair)\b/i.test(text)) {
      return "a skilled construction crew rebuilding and repairing";
    }
    if (/\b(balance|coordination|stability)\b/i.test(text)) {
      return "a tightrope walker making constant tiny adjustments";
    }
    if (/\b(system|process|mechanism)\b/i.test(text)) {
      return "an assembly line where each part has a specific role";
    }
    
    return butlerMetaphors[Math.floor(Math.random() * butlerMetaphors.length)];
  }

  async function buildTopStudentNote(seed: string, mode: "highYield" | "sketch" = "highYield") {
    const base = seed.trim();
    if (!base) return "";
    
    // Enhanced AI processing for top student quality
    const [sum, mnem] = await Promise.allSettled([summarizeText(base), generateMnemonic(base)]);
    const summary = sum.status === "fulfilled" && sum.value ? sum.value : base;
    const mnemonic = mnem.status === "fulfilled" && mnem.value ? mnem.value : "";
    
    // Extract key concepts and relationships
    const concepts = extractKeyConceptsFromText(base);
    const connections = findConceptConnections(base);
    const examples = extractExamples(base);
    const definitions = extractDefinitions(base);
    
    if (mode === "sketch") {
      // David Butler-inspired visual learning note
      return [
        `# 🎨 David Butler-Style Visual Learning Note`,
        ``,
        `## 🎯 The Big Picture Story`,
        `**What's really happening here?**`,
        summary,
        ``,
        `## 🧠 Right-Brain Understanding`,
        `**Think of this like a story:**`,
        `- Main character: ${concepts[0] || "The key concept"}`,
        `- The problem: ${extractProblemFromText(base)}`,
        `- The solution: ${extractSolutionFromText(base)}`,
        `- The outcome: ${extractOutcomeFromText(base)}`,
        ``,
        `## 🖼️ Visual Metaphor (Butler-Style)`,
        `**Mental picture:** ${getButlerStyleMetaphor(base)}`,
        ``,
        `**Draw this scene:**`,
        `- Setting: [Where does this happen?]`,
        `- Characters: [What are the main players?]`,
        `- Action: [What's happening?]`,
        `- Result: [What's the outcome?]`,
        ``,
        `## 🔗 Spatial Relationships`,
        `**How things connect in space:**`,
        `- Above/Below: ${connections.slice(0, 2).join(" ↕ ")}`,
        `- Left/Right: [What's on each side?]`,
        `- Inside/Outside: [What contains what?]`,
        `- Before/After: [What's the sequence?]`,
        ``,
        `## 📝 Sketch Space`,
        `[Draw your diagram here - use boxes, arrows, stick figures, whatever helps!]`,
        ``,
        `## 🎭 Memory Story`,
        `**Create a memorable story:**`,
        mnemonic || `Once upon a time, ${concepts[0]} decided to ${extractActionFromText(base)}...`,
        ``,
        `## 🔄 Movement & Flow`,
        `**How does this move or change?**`,
        `- What starts it? ___________`,
        `- What keeps it going? ___________`,
        `- What stops it? ___________`,
        ``,
        `## ✅ Understanding Check`,
        `- Can I tell the story without looking? Yes/No`,
        `- Can I draw the main idea? Yes/No`,
        `- Do I see how it all fits together? Yes/No`,
        `- Can I explain it using gestures? Yes/No`,
      ].join("\n");
    }
    
    // High-yield mode - comprehensive top student note
    return [
      `# 📚 Top Student Study Note`,
      ``,
      `## 🎯 THE BIG IDEA (What's the point?)`,
      `**In one sentence:** ${extractMainPoint(base)}`,
      ``,
      `**Why this matters:** ${summary}`,
      ``,
      `## 🔑 Key Concepts & Definitions`,
      ...definitions.map(def => `**${def.term}:** ${def.definition}`),
      definitions.length === 0 ? `**Main terms:** ${concepts.slice(0, 5).join(", ")}` : "",
      ``,
      `## 🧠 How It Works (The Logic)`,
      `**Step-by-step understanding:**`,
      `1. ${extractLogicalSteps(base).join("\n2. ")}`,
      ``,
      `## 📊 Evidence & Examples`,
      examples.length > 0 ? `**Real examples:**` : `**Key supporting facts:**`,
      ...examples.slice(0, 3).map((ex, i) => `${i + 1}. ${ex}`),
      examples.length === 0 ? `- [Add specific examples here]` : "",
      ``,
      `## ⚠️ Common Mistakes & Exceptions`,
      `**Watch out for:**`,
      `- ${extractCaveats(base).join("\n- ")}`,
      `- Don't confuse with: [similar concepts]`,
      ``,
      `## 🔗 Connections & Context`,
      `**This connects to:**`,
      ...connections.slice(0, 3).map(conn => `- ${conn}`),
      ``,
      `**Builds on:** [prerequisite knowledge]`,
      `**Leads to:** [what comes next]`,
      ``,
      `## 🎨 Visual Memory Aid`,
      `**Mental picture:** ${getVisualMetaphor(base)}`,
      ``,
      `**Diagram idea:** [Sketch boxes/arrows showing relationships]`,
      ``,
      `## 🧠 Memory Techniques`,
      `**Mnemonic:** ${mnemonic || "Create acronym/story/rhyme"}`,
      ``,
      `**Story method:** [Turn concepts into a memorable story]`,
      ``,
      `## 🎯 Self-Test Questions`,
      `**Level 1 (Recall):**`,
      `- What is ${concepts[0]}?`,
      `- List the main components.`,
      ``,
      `**Level 2 (Understanding):**`,
      `- Why does this work this way?`,
      `- How does this relate to [related concept]?`,
      ``,
      `**Level 3 (Application):**`,
      `- When would you use this?`,
      `- What would happen if...?`,
      ``,
      `## ⭐ Key Takeaways (For Review)`,
      `1. **Main point:** ${extractMainPoint(base)}`,
      `2. **Most important detail:** [highlight critical info]`,
      `3. **Practical application:** [how to use this]`,
      ``,
      `## 📅 Review Schedule`,
      `- [ ] Review in 1 day`,
      `- [ ] Review in 1 week`,
      `- [ ] Review in 1 month`,
      ``,
      `---`,
      `*Created: ${new Date().toLocaleDateString()} | Page: ${currentPage} | Understanding Level: ⭐⭐⭐*`,
    ].join("\n");
  }

  // Legacy function for backward compatibility
  async function buildHighYieldDraft(seed: string) {
    return await buildTopStudentNote(seed, "highYield");
  }

  const handleOpenRightBrainNote = async (
    text?: string,
    _mnemonic?: string,
    mode?: "sketch" | "highYield"
  ) => {
    const seed = (text || sel.selectionText || "").trim();
    if (!seed) {
      alert("Select text first to create a study note.");
      return;
    }

    DEV && console.log(`📝 Creating ${mode || 'standard'} note for: ${seed.slice(0, 50)}...`);

    try {
      const draft = await buildTopStudentNote(seed, mode || "highYield");
      // For now, just log the note since Right-Brain view is removed
      DEV && console.log("📝 Generated study note:", draft);
      alert("Study note generated! (Right-Brain view has been removed - note logged to console)");
    } catch (error) {
      console.error("Error creating study note:", error);
      alert("Study note creation failed. Please try again.");
    }
  };


  /* =========================================================================
     🔹 Enhanced Page/TOC sync with chapter-aware navigation + global sync
  ========================================================================= */
  // Stable navigation function — reads currentPage via ref so useCallback deps don't
  // include currentPage, preventing cascade re-renders of TocTree on every page flip.
  const syncToPage = useCallback((page: number, opts?: { reason?: 'SCROLL' | 'TOC_JUMP' | 'PROGRAMMATIC' }) => {
    const reason = opts?.reason || 'PROGRAMMATIC';
    const curPage = currentPageRef.current;
    DEV && console.log(`📄 syncToPage: ${page} (current: ${curPage}) reason: ${reason}`);

    // Validate page bounds
    if (page < 1 || (pdfPageCount > 0 && page > pdfPageCount)) {
      console.warn(`📄 Invalid page ${page}, bounds: 1-${pdfPageCount}`);
      return;
    }

    // Skip if already on the page (unless it's a scroll event)
    if (page === curPage && reason !== 'SCROLL') {
      DEV && console.log(`📄 Already on page ${page}, skipping`);
      return;
    }

    try {
      // For user-initiated jumps: freeze scroll-sync and clean up previous-page DOM
      // so stale IntersectionObserver/scroll events can't flip activeAnchorId.
      if (reason !== 'SCROLL') {
        // Mark intent as USER and record timestamp for cooldown gating
        navIntentRef.current = 'USER';
        lastUserNavAtRef.current = Date.now();

        // Engage navigation lock: prevents observers from updating page during hydration
        navLockRef.current = true;
        if (navLockTimerRef.current) clearTimeout(navLockTimerRef.current);
        navLockTimerRef.current = setTimeout(() => {
          navLockRef.current = false;
          navIntentRef.current = 'NONE';
        }, 700); // slightly longer than PDF render + scroll debounce

        syncFrozenRef.current = true;
        if (syncFreezeTimerRef.current) clearTimeout(syncFreezeTimerRef.current);

        // Remove spotlight overlays and glow spans left over from the previous page
        document.querySelectorAll('.para-anchor-overlay').forEach(el => el.remove());
        document.querySelectorAll('.priority-paragraph-glow').forEach(
          el => el.classList.remove('priority-paragraph-glow', 'priority-paragraph-pinned'),
        );
        clearTransientPriorityPreview();
        useInsightsPanelStore.getState().clearPinnedTexts();
        useHighlightStore.getState().clearPage(bookId || 'default-book', curPage - 1);

        // Reset the right-panel scroll to top (user is on a new page)
        requestAnimationFrame(() => {
          lastProgrammaticScrollAtRef.current = Date.now();
          (document.querySelector('.insightPanelScroll') as HTMLElement | null)
            ?.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
        });

        // Unfreeze after PDF render has settled — must match navLockRef timeout (700 ms)
        // so there is no window where syncFrozenRef is false but navLock is still true.
        // A shorter unfreeze (was 600 ms) let scroll events slip through and bounce the
        // TOC highlight during the 100 ms gap.
        syncFreezeTimerRef.current = setTimeout(() => {
          syncFrozenRef.current = false;
        }, 700);
      }

      // Update local state immediately for responsive UI
      setCurrentPage(page);
      const unit = pageToUnit(page, pdfPageCount, thoughtUnits.length);
      setCurrentThoughtUnit(unit);
      DEV && console.log("[TRACE pageSync]", {
        source: reason,
        documentId: bookId,
        visiblePage: page,
        previousPage: curPage,
        currentThoughtUnit: unit,
        pageTextWords: (pageTextByPage.get(`${bookId}:${page}`) || "").split(/\s+/).filter(Boolean).length,
      });

      // Update global sync state
      updateSync({
        page,
        unitIndex: unit
      }, reason === 'SCROLL' ? 'pdf' : 'manual');

      // Auto-whiteboard trigger — legacy concept seeding removed; study model is source
      DEV && console.log("[WHITEBOARD_LEGACY_BLOCKED]", { reason: "conceptForPage disabled on page nav — study model is source", page });

      DEV && console.log(`📄 Navigation successful: page ${page}, unit ${unit}`);

    } catch (error) {
      console.error(`📄 Navigation error for page ${page}:`, error);

      // Ensure state is consistent even on error
      try {
        setCurrentPage(page);
        const unit = pageToUnit(page, pdfPageCount, thoughtUnits.length);
        setCurrentThoughtUnit(unit);
      } catch (fallbackError) {
        console.error(`📄 Fallback navigation failed:`, fallbackError);
      }
    }
  }, [pdfPageCount, thoughtUnits.length, bookId, pageTextByPage, clearTransientPriorityPreview, updateSync]);
  // Keep the ref current so onPdfHighlightFocus always calls the latest syncToPage.
  syncToPageRef.current = syncToPage;

  const handleParsedSyllabus = useCallback((result: {
    fileName: string;
    pages: PageTextBundle[];
    toc: TocNode[];
  }) => {
    setSyllabusFileName(result.fileName);
    setSyllabusPages(result.pages);
    setSyllabusToc(result.toc);
    setSyllabusSource("upload");
    setSyllabusUploadRequested(false);
    try {
      localStorage.setItem("syllabus_fileName", result.fileName);
      localStorage.setItem("syllabus_pages", JSON.stringify(result.pages));
      localStorage.setItem("syllabus_toc", JSON.stringify(result.toc));
      localStorage.setItem("syllabus_source", "upload");
    } catch { /* quota exceeded — ignore */ }
    DEV && console.log("[SYLLABUS_SOURCE]", {
      fileName:  result.fileName,
      tocNodes:  result.toc.length,
      pageCount: result.pages.length,
      source:    "SyllabusUploadPanel.onParsed",
    });

    // ── Generate CollegeCal-style study plan ──────────────────────────────
    let plan: StudyDay[] = [];
    try {
      // Try full parse → course plan (requires parseable blocks in the syllabus)
      const allText = result.pages.map((p) => p.text ?? "").join("\n");
      const parsed  = parseSyllabus(allText);
      DEV && console.log("[SYLLABUS_MAPPING_RESULT]", {
        blocks:    parsed.blocks.length,
        courseTitle: parsed.metadata?.courseTitle ?? null,
        source:    "parseSyllabus",
      });

      if (parsed.blocks.length > 0) {
        // Convert syllabusToc (TocNode[]) into TocItem[] for coursePlanner
        const tocItems = result.toc.map((n) => ({
          id:         n.id,
          title:      n.title,
          pageNumber: n.page,
          level:      n.kind === "chapter" ? 0 : n.kind === "section" ? 1 : 2,
        }));
        const coursePlan = generateCoursePlan(parsed, tocItems);
        plan = coursePlan.studySchedule;
        DEV && console.log("[SYLLABUS_PLAN_CREATED]", {
          source:        "generateCoursePlan",
          scheduleDays:  plan.length,
          coverage:      coursePlan.coverage,
        });
      } else {
        throw new Error("no syllabus blocks parsed");
      }
    } catch {
      // Fallback: create one entry per TOC node
      const today = new Date();
      plan = result.toc.slice(0, 30).map((n, i) => ({
        date:             new Date(today.getTime() + i * 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        blockId:          n.id,
        topics:           [n.title],
        pages:            [{ start: n.page, end: n.page + 10 }],
        estimatedMinutes: 30,
        isExamDay:        n.kind === "exam",
      }));
      DEV && console.log("[SYLLABUS_PLAN_CREATED]", {
        source:       "toc-fallback",
        scheduleDays: plan.length,
      });
    }

    setSyllabusStudyPlan(plan);
    try {
      localStorage.setItem("syllabus_plan", JSON.stringify(plan));
      DEV && console.log("[SYLLABUS_SAVE_STATUS]", { saved: true, key: "syllabus_plan", days: plan.length });
    } catch {
      DEV && console.log("[SYLLABUS_SAVE_STATUS]", { saved: false, reason: "localStorage quota exceeded" });
    }
  }, []);

  const handleStudyTopic = useCallback((node: TocNode) => {
    syncToPage(node.page, { reason: "TOC_JUMP" });
    setRightPanelResetKey((k) => k + 1);
    setUnifiedPanelState((prev) => ({ ...prev, activeTab: "insights" }));
    trySwitchShellTab("reader", "reader");
  }, [syncToPage, trySwitchShellTab]);

  const handleSyllabusNodeClick = useCallback((node: TocNode) => {
    syncToPage(node.page, { reason: "TOC_JUMP" });
  }, [syncToPage]);

  // Jump from ChapterDashboard / AdaptiveSyllabusPanel to the Reader — unlike
  // handleSyllabusNodeClick (which stays in Learning Hub so TocTree shows the
  // active-chapter highlight), these entry points are navigation actions where
  // the user expects to arrive at the content.
  const handleChapterJumpToReader = useCallback((page: number) => {
    syncToPage(page, { reason: "TOC_JUMP" });
    trySwitchShellTab("reader", "reader");
  }, [syncToPage, trySwitchShellTab]);

  const handleGetPageText = useCallback(
    (page: number) => pageTextByPage.get(`${bookId}:${page}`) ?? "",
    [pageTextByPage, bookId]
  );

  const handleStudyPlanNavigate = useCallback(
    (page: number) => { syncToPage(page); trySwitchShellTab("reader", "reader"); },
    [syncToPage, trySwitchShellTab]
  );

  // Stable RightPanel prop callbacks — inline arrows would create new references on
  // every index.tsx render (including per-word Zustand writes during TTS), forcing
  // RightPanel to re-render even when nothing meaningful changed.
  const handleNoteSaved = useCallback(() => {
    setSessionNotesCount((n) => n + 1);
    setNoteLabRefreshKey((k) => k + 1);
    trySwitchShellTab("notelab", "notelab");
  }, [trySwitchShellTab]);

  const handleStudySetGenerated = useCallback((setId: string) => {
    setSessionCardsCount((n) => n + 1);
    setLastRecallSetId(setId);
    setRecallLabRefreshKey((k) => k + 1);
    trySwitchShellTab("study", "study");
  }, [trySwitchShellTab]);

  const handleCrossLinkNavigate = useCallback(
    (page: number) => syncToPage(page, { reason: "TOC_JUMP" }),
    [syncToPage]
  );

  const handleSpeechSnippetFocus = useCallback(
    (snippet: string | null) => setFocusSnippet(snippet),
    []
  );

  const handleOpenWhiteboardPanel = useCallback(
    () => {
      setProfessorAutoStart(false);
      setProfessorSurface("whiteboard");
      setShowWhiteboardPanel(true);
    },
    []
  );

  const handleStartProfessor = useCallback(() => {
    setWbConcept("");
    setWbContext("");
    setProfessorAutoStart(true);
    // Correction — Professor's primary surface is the PDF. Every session
    // now starts transparent/pass-through (professorSurface's own default
    // is "pdf"; this explicit reset is for the case where a PREVIOUS
    // session left it on "whiteboard" and this button is pressed again
    // without an intervening close). The modal goes opacity:0 + pointer-
    // events:none whenever professorAutoStart && professorSurface==="pdf",
    // which now covers the entire planning window too, not just genuine
    // verbal-only steps — that used to be a problem (it hid TldrawCanvas's
    // own loading/error/retry UI behind opacity:0 for the whole planning
    // window, so a failure or slowness in /api/professor-lesson-plan
    // reproduced as "Professor appears to start, nothing visible or
    // audible happens"). It's no longer a problem: TldrawCanvas's own new
    // diagnostic-escalation effect explicitly calls onProfessorSurfaceChange
    // ("whiteboard", { reason: "diagnostic" }) the moment a license/init/
    // lesson-plan failure is real, so the retry UI still becomes visible —
    // just only when there's actually something to show, never by default.
    setProfessorSurface("pdf");
    setShowWhiteboardPanel(true);
  }, []);

  // Closes the Whiteboard/Professor modal. When Professor was active, restores
  // Current Page speech to wherever Professor was ACTUALLY teaching — the live
  // grounded source unit (focusedEvidenceId), kept in sync throughout Professor
  // playback via the shared reading-focus store (TldrawCanvas's
  // focusDirectorEvidence calls setThoughtUnit on every step advance) — never a
  // full page restart and never an earlier, unrelated Thought Unit. When no
  // resolvable unit exists (Professor closed before reaching one), still resets
  // the speech panel off its now-inactive Professor tab rather than leaving it
  // stuck there.
  const closeProfessorWhiteboard = useCallback(() => {
    const wasProfessor = professorAutoStart;
    setShowWhiteboardPanel(false);
    setProfessorAutoStart(false);
    setWbConcept("");
    setWbContext("");
    if (wasProfessor) {
      const unit = canonicalLeftPanelUnits.find(
        (u) => u.evidenceRefId === focusedEvidenceId || u.id === focusedEvidenceId
      );
      // R4 — resume from the ACTUAL last-spoken position, not always word 0.
      // TldrawCanvas now writes wordIndex/sentenceText into the same shared
      // reading-focus store on every SOURCE_VERBATIM tick, exactly like
      // StudySpeechPanel does for Current Page (see playSegmentThenAdvance).
      // Only trust it when the store's live anchor still matches the unit
      // we're resuming into — a stale word position from a PREVIOUS anchor
      // must never bleed into an unrelated one. clearWord() on any full stop
      // (or on entering a PROFESSOR_EXPLANATION segment) means sentenceText
      // is null whenever Professor closed mid-explanation or before ever
      // reading this unit's source aloud, correctly falling back to word 0.
      const liveFocus = useReadingFocusStore.getState();
      const liveAnchorId = unit?.evidenceRefId ?? unit?.id ?? null;
      const hasLiveWordPosition = !!liveAnchorId && liveFocus.thoughtUnitId === liveAnchorId && !!liveFocus.sentenceText;
      const cursor: ReadingCursor | null = unit?.exactText
        ? {
            canonicalAnchorId: liveAnchorId,
            sourcePage: currentPage,
            sourceText: hasLiveWordPosition ? liveFocus.sentenceText! : unit.exactText,
            sourceWordIndex: hasLiveWordPosition ? liveFocus.wordIndex : 0,
            sourceCharOffset: 0,
          }
        : null;
      speechPanelRef.current?.returnFromProfessor(cursor);
    }
  }, [professorAutoStart, canonicalLeftPanelUnits, focusedEvidenceId, currentPage]);

  const handleJumpToUnit = useCallback(
    (id: string) => onPdfHighlightFocus(id),
    [onPdfHighlightFocus]
  );

  const handleRecallNavigateToPage = useCallback(
    (page: number) => { syncToPage(page); trySwitchShellTab("reader", "reader"); },
    [syncToPage, trySwitchShellTab]
  );

  const handleRecallOpenUnitConsumed = useCallback(
    () => setRecallLabOpenUnit(null),
    []
  );

  // Study Guides are IDB-backed (no sync read), so the Course Dashboard's
  // cross-link counts need a fetched snapshot — refreshed whenever the
  // Syllabus tab opens or a note/recall card is saved elsewhere in the app.
  const [syllabusStudyGuides, setSyllabusStudyGuides] = useState<StudyGuideRecord[]>([]);
  useEffect(() => {
    if (activeShellTab !== "syllabus" || !bookId) return;
    getStudyGuidesByBook(bookId).then(setSyllabusStudyGuides).catch(() => {});
  }, [activeShellTab, bookId, noteLabRefreshKey, recallLabRefreshKey]);

  // RightPanel-concept-level highlights saved from "Save to NoteLab"/"Save to
  // Recall" — the only persisted record of individual thought units (not
  // just pages) across the whole book. Feeds the Syllabus thought-unit tree.
  const [syllabusSavedHighlights, setSyllabusSavedHighlights] = useState<SavedHighlight[]>([]);
  useEffect(() => {
    if (activeShellTab !== "syllabus" || !bookId) return;
    getHighlightsByBook(bookId).then(setSyllabusSavedHighlights).catch(() => {});
  }, [activeShellTab, bookId, noteLabRefreshKey, recallLabRefreshKey]);

  // Chapter Progress Engine (Phase 1+2): derives chapters from the live
  // syllabusToc tree and rolls up Read/Understand/Recall/Mastery % per
  // chapter — the data the Course Dashboard renders below.
  const chapterProgressList = useMemo(() => {
    if (!syllabusToc.length) return [];
    const chapters = buildChaptersFromToc(syllabusToc, pdfPageCount || 1);
    const visitedPages = getVisitedPages(bookId);
    const recallSets = getRecallSetsByBook(bookId);
    const notes = getNotesByBook(bookId);
    return chapters.map((chapter) => ({
      chapter,
      progress: computeChapterProgress(chapter, { visitedPages, recallSets, notes, studyGuides: syllabusStudyGuides, savedHighlights: syllabusSavedHighlights }),
    }));
  }, [syllabusToc, pdfPageCount, bookId, syllabusStudyGuides, syllabusSavedHighlights, currentPage, activeShellTab]);

  const courseProgress = useMemo(
    () => computeCourseProgress(chapterProgressList.map((c) => c.chapter), chapterProgressList.map((c) => c.progress)),
    [chapterProgressList]
  );

  // Course-level "what am I weak on?" and authored teaching order — feed the
  // Syllabus tab's Weak Areas / Prerequisite Chain rows and Study Plan Lab's
  // Weakness Report, both grounded in the same chapter-progress data.
  const courseWeakAreas = useMemo(
    () => computeWeakAreas(chapterProgressList.map((c) => c.progress)),
    [chapterProgressList]
  );
  const coursePrerequisiteChain = useMemo(
    () => buildPrerequisiteChain(chapterProgressList.map((c) => c.chapter)),
    [chapterProgressList]
  );

  // "What should I study next?" — grounded in the same chapter-progress data,
  // not a separate guess. Drives the Syllabus tab's recommendation banner.
  const nextTopicRecommendation = useMemo(() => {
    if (chapterProgressList.length === 0) return null;
    const visitedPages = getVisitedPages(bookId);
    const recallSets = getRecallSetsByBook(bookId);
    return computeNextTopicRecommendation(
      chapterProgressList.map((c) => c.chapter),
      chapterProgressList.map((c) => c.progress),
      visitedPages,
      recallSets
    );
  }, [chapterProgressList, bookId]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const handleAskCoach = useCallback(async () => {
    if (!coachQuestion.trim() || coachLoading) return;
    setCoachLoading(true);
    setCoachResponse(null);
    const todayStr = new Date().toISOString().split("T")[0];
    const todayPlan = syllabusStudyPlan.find((d: StudyDay) => d.date === todayStr);
    try {
      const res = await fetch("/api/ai-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: coachQuestion.trim(),
          context: {
            bookTitle: uploadedFile?.name ?? "Unknown",
            masteryPct: courseProgress?.overallMasteryPct ?? 0,
            readPct: courseProgress?.overallReadPct ?? 0,
            weakAreas: courseWeakAreas ?? [],
            nextTopic: nextTopicRecommendation?.chapterTitle ?? null,
            currentPage,
            totalPages: pdfPageCount,
            todayTopics: todayPlan?.topics ?? [],
          },
        }),
      });
      const data = await res.json();
      setCoachResponse(data.response ?? data.error ?? "No response.");
    } catch {
      setCoachResponse("Coach unavailable. Check your connection and try again.");
    } finally {
      setCoachLoading(false);
    }
  }, [coachQuestion, coachLoading, syllabusStudyPlan, uploadedFile, courseProgress, courseWeakAreas, nextTopicRecommendation, currentPage, pdfPageCount]);

  /* =========================================================================
     🔹 Render Reader Content with Persistent Views (Performance Optimized)
  ========================================================================= */
  const intelligenceSnapshot = useMemo(() => ({
    status: pageIntelligenceStatus,
    pageTruthKey,
    isCurrentPage: isCurrentIntelligencePage,
    pageClass: currentPageClass,
    pageTruth: currentPageTruth,
    pageModel: currentPageModel,
    story: currentPageStory,
    storyV2: currentPageStoryV2,
    storyV3: currentPageStoryV3,
    priorityHighlights: currentPriorityHighlights,
    normResult: currentNormResult,
    pageRole: currentPageRole,
    confidence: currentConfidence,
  }), [pageIntelligenceStatus, pageTruthKey, isCurrentIntelligencePage, currentPageClass,
      currentPageTruth, currentPageModel, currentPageStory, currentPageStoryV2, currentPageStoryV3,
      currentPriorityHighlights, currentNormResult, currentPageRole, currentConfidence]);

  const renderContent = () => {
    // 🔐 All tabs require sign-in
    if (!user) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="bg-gray-800 text-white rounded-xl p-6 shadow-xl text-center w-[380px]">
            <h3 className="text-lg font-bold mb-2">Welcome to Avrrio Reader</h3>
            <p className="text-sm opacity-80 mb-4">
              Please sign in to upload PDFs and use the reader.
            </p>
            <button
              onClick={async () => {
                try {
                  const user = await signInWithGoogle();
                  if (user) {
                    DEV && console.log("✅ Signed in:", user.displayName || user.email);
                  }
                } catch (error) {
                  console.error("❌ Sign-in error:", error);
                }
              }}
              className="px-4 py-2 rounded bg-blue-500 hover:bg-blue-600"
            >
              Sign in with Google
            </button>
          </div>
        </div>
      );
    }

    // ✅ Expert View - Relationship-First Cognitive Cockpit
    // Merged: Surgeon View + Expert Mode into single Expert View
    // Architecture: Relations → Clusters → Decision Rules (not concepts)
    if (activeShellTab === "reader") {
      if (!fileUrl) {
        return (
          <div className="h-full grid place-items-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
            <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-white/5 p-8 text-center backdrop-blur-xl">
              {missingPDFEntry ? (
                <>
                  <h2 className="text-2xl font-bold text-amber-300">Original PDF file is missing</h2>
                  <p className="mt-2 text-slate-300">
                    <span className="font-medium text-white">{missingPDFEntry.name}</span> was not found in your browser storage.
                    This can happen after clearing browser data or using a different device.
                  </p>
                  <p className="mt-3 text-sm text-slate-400">
                    Re-upload the same PDF to reconnect it. Your notes, highlights, and progress are preserved.
                  </p>
                  <label className="mt-5 inline-block cursor-pointer rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 transition-colors">
                    Re-upload PDF
                    <input
                      type="file"
                      accept=".pdf,application/pdf"
                      className="hidden"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f || !missingPDFEntry) return;
                        try {
                          const buf = await f.arrayBuffer();
                          const data = new Uint8Array(buf);
                          await saveDocumentFile(missingPDFEntry.documentId, data);
                          const blob = new Blob([data], { type: 'application/pdf' });
                          const sessionUrl = createBlobUrl(blob);
                          setCurrentLocalDocumentId(missingPDFEntry.documentId);
                          setFileUrl(sessionUrl);
                          setMissingPDFEntry(null);
                          const docId = (missingPDFEntry.name || '').replace(/\.[Pp][Dd][Ff]$/, '') || 'book';
                          startBookProcessing(new File([blob], missingPDFEntry.name || 'document.pdf', { type: 'application/pdf' }), docId, 1, missingPDFEntry.documentId);
                        } catch (err) {
                          console.error('[storage] Re-upload failed:', err);
                        }
                      }}
                    />
                  </label>
                  <button
                    onClick={() => setMissingPDFEntry(null)}
                    className="mt-3 block mx-auto text-xs text-slate-500 underline hover:text-slate-300"
                  >
                    Dismiss
                  </button>
                </>
              ) : (
                <>
                  <h2 className="text-2xl font-bold text-blue-200">Upload your first textbook</h2>
                  <p className="mt-2 text-slate-300">Reader + Panel unlock after textbook upload. You can still use the Syllabus tab independently.</p>
                  <p className="mt-4 text-sm text-slate-400">No PDF pane, panel, or page navigation is shown until a real book is loaded.</p>
                </>
              )}
            </div>
          </div>
        );
      }
      const activePageContext = activePageContextForInsights;

      // safeHighlightAnchors / highlightedAnchorTexts / enrichedCanonicalUnits are
      // memoized at the component top level — accessible here via closure.

      DEV && console.log("[LEFT_PANEL_SOURCE]", {
        source:     "canonicalLeftPanelUnits",
        page:       currentPage,
        count:      safeHighlightAnchors.length,
        firstTexts: safeHighlightAnchors.slice(0, 3).map(a => a.text?.slice(0, 60)),
      });

      return (
        <div className="h-full flex overflow-hidden" data-testid="expert-view-container">
          <ErrorBoundary
            onError={(error, errorInfo) => {
              console.error('🎯 Expert View Error:', {
                message: error.message,
                stack: error.stack,
                componentStack: errorInfo.componentStack,
                props: { documentId: bookId, currentPage, pdfPageCount, hasFileUrl: !!fileUrl }
              });
            }}
          >
            {/* Left: PDF Reader */}
            {fileUrl && (
              <div
                className="relative h-full w-[68%] min-w-[600px] overflow-y-auto border-r border-gray-700"
                {...sel.bind}
                onContextMenu={(e) => {
                  e.preventDefault();
                  const hasSelection = (sel.selectionText?.trim().length ?? 0) > 0;
                  setPdfContextMenu({ x: e.clientX, y: e.clientY, hasSelection });
                }}
              >
                {DEV && console.log("[LEFT_PANEL_INPUT_SOURCES]", {
                  source: "safeHighlightAnchors (render-time guard)",
                  page: currentPage,
                  safeCount: safeHighlightAnchors.length,
                  rawCount: finalHighlightAnchors.length,
                  safeTexts: safeHighlightAnchors.map(a => a.text.slice(0, 60)),
                  studyModelPtk: currentPageStudyModel?.pageTruthKey ?? null,
                  pageTruthKey,
                  ptKeyMatch: currentPageStudyModel?.pageTruthKey === pageTruthKey,
                }) as unknown as null}

                {/* Background processing progress banner with pause/resume */}
                {bookProcessingStatus.phase === 'processing' && (
                  <div className="sticky top-0 z-20 border-b border-blue-700/50 bg-blue-900/80 backdrop-blur-sm">
                    <div className="flex items-center gap-2 px-4 py-1.5 text-xs text-blue-100">
                      {!indexingPaused && <span className="animate-spin text-[10px]">◌</span>}
                      <span className="flex-1">
                        {bookProcessingStatus.totalPages > 0
                          ? `${indexingPaused ? 'Paused — ' : ''}Indexing ${bookProcessingStatus.pagesProcessed} of ${bookProcessingStatus.totalPages} pages`
                          : bookProcessingStatus.progress || 'Indexing…'}
                      </span>
                      <button
                        onClick={toggleIndexingPause}
                        className="rounded px-2 py-0.5 text-blue-200 hover:bg-blue-700/60 hover:text-white"
                        title={indexingPaused ? 'Resume indexing' : 'Pause indexing'}
                      >
                        {indexingPaused ? '▶ Resume' : '⏸ Pause'}
                      </button>
                    </div>
                    {bookProcessingStatus.totalPages > 0 && (
                      <div className="h-0.5 bg-blue-950">
                        <div
                          className="h-full bg-blue-400 transition-all duration-300"
                          style={{ width: `${Math.round((bookProcessingStatus.pagesProcessed / bookProcessingStatus.totalPages) * 100)}%` }}
                        />
                      </div>
                    )}
                  </div>
                )}
                {bookProcessingStatus.phase === 'error' && !pdfSourceFailed && (
                  <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-amber-700/50 bg-amber-900/80 px-4 py-2 text-xs text-amber-100 backdrop-blur-sm">
                    <span>⚠</span>
                    <span className="flex-1">{bookProcessingStatus.progress}</span>
                    <button
                      onClick={() => setBookProcessingStatus(prev => ({ ...prev, phase: 'idle' }))}
                      className="ml-auto text-amber-300 hover:text-white"
                    >
                      ✕
                    </button>
                  </div>
                )}
                {pdfSourceFailed && (
                  <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-red-700/50 bg-red-900/80 px-4 py-2 text-xs text-red-100 backdrop-blur-sm">
                    <span>✕</span>
                    <span className="flex-1">Source PDF unavailable — the file could not be loaded.</span>
                    {currentLocalDocumentId && (
                      <button
                        onClick={() => {
                          setPdfSourceFailed(false);
                          handleLoadPDF('', uploadedFile?.name, currentLocalDocumentId);
                        }}
                        className="rounded px-2 py-0.5 bg-red-700 hover:bg-red-600 text-red-100"
                      >
                        Try Again
                      </button>
                    )}
                    <button
                      onClick={() => setPdfSourceFailed(false)}
                      className="ml-1 text-red-300 hover:text-white"
                    >
                      ✕
                    </button>
                  </div>
                )}
                {storageWarning && (
                  <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-yellow-700/50 bg-yellow-900/80 px-4 py-2 text-xs text-yellow-100 backdrop-blur-sm">
                    <span>⚠</span>
                    <span className="flex-1">{storageWarning}</span>
                    <button
                      onClick={() => setStorageWarning(null)}
                      className="ml-auto text-yellow-300 hover:text-white"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {/* "View Source in Reader" banner — shown when DAT Apex navigated here */}
                {viewSourceBanner && (
                  <div className="sticky top-0 z-20 flex items-start gap-3 border-b border-teal-700/50 bg-teal-900/80 px-4 py-2 text-xs text-teal-100 backdrop-blur-sm">
                    <span className="mt-0.5">📖</span>
                    <div className="flex-1 min-w-0">
                      <span className="font-semibold">Viewing source — page {viewSourceBanner.pageNumber}.</span>
                      {' '}
                      <span className="opacity-75 line-clamp-1 italic">&ldquo;{viewSourceBanner.quote}&rdquo;</span>
                    </div>
                    <button
                      onClick={() => setViewSourceBanner(null)}
                      className="ml-auto shrink-0 text-teal-300 hover:text-white"
                      aria-label="Dismiss view source banner"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {/* P0 fix — a pending "View Source in Reader" link whose book
                    isn't the one currently open. Replaces the old behavior
                    of silently jumping to that page number in whatever book
                    happened to be open (or none). Honest prompt instead of
                    wrong content. */}
                {pendingViewSourceLink && bookId !== pendingViewSourceLink.documentId && (
                  <div className="sticky top-0 z-20 flex items-start gap-3 border-b border-orange-700/50 bg-orange-900/80 px-4 py-2 text-xs text-orange-100 backdrop-blur-sm">
                    <span className="mt-0.5">📖</span>
                    <div className="flex-1 min-w-0">
                      <span className="font-semibold">
                        This question is from {pendingViewSourceLink.bookTitle ?? "a different book"}
                      </span>
                      {' — open it to view page ' + pendingViewSourceLink.pageNumber + ' of the source.'}
                    </div>
                    <button
                      onClick={handleViewSourcePickFromLibrary}
                      className="shrink-0 text-orange-200 hover:text-white underline underline-offset-2"
                    >
                      Open book →
                    </button>
                    <button
                      onClick={() => setPendingViewSourceLink(null)}
                      className="ml-2 shrink-0 text-orange-300 hover:text-white"
                      aria-label="Dismiss view source prompt"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {/* TestLab-Reader progress integration — "TestLab found this
                    concept weak — review". */}
                {weakConceptBanner && (
                  <div className="sticky top-0 z-20 flex items-start gap-3 border-b border-amber-700/50 bg-amber-900/80 px-4 py-2 text-xs text-amber-100 backdrop-blur-sm">
                    <span className="mt-0.5">🎯</span>
                    <div className="flex-1 min-w-0">
                      <span className="font-semibold">TestLab found this concept weak</span>
                      {' — '}
                      <span className="opacity-85">{weakConceptBanner.accuracy}% correct on TestLab questions.</span>
                    </div>
                    <button
                      onClick={() => router.push("/apex/review")}
                      className="shrink-0 text-amber-200 hover:text-white underline underline-offset-2"
                    >
                      Review →
                    </button>
                    <button
                      onClick={() => setWeakConceptBanner(null)}
                      className="ml-2 shrink-0 text-amber-300 hover:text-white"
                      aria-label="Dismiss weak concept banner"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {/* Surgeon Annotation Plan is reading the CURRENT page fresh — a small,
                    non-blocking notice. A same-pageTruthKey cached plan may already be
                    showing underneath; there is no other fallback tier. */}
                {surgeonAnnotations.status === "loading" && (
                  <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-sky-700/40 bg-sky-950/60 px-4 py-1 text-[11px] text-sky-200 backdrop-blur-sm">
                    <span className="animate-pulse">●</span>
                    <span>Reading and annotating this page…</span>
                  </div>
                )}

                {/* SurgeonAnnotationPlan failure status — SurgeonAnnotationPlan is the
                    sole owner of automatic PDF annotations, so a failure here means the
                    overlay is genuinely empty, not degraded to some lesser tier. */}
                {surgeonAnnotations.status === "error" && surgeonAnnotations.annotationErrorMessage && (
                  <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-amber-700/50 bg-amber-900/70 px-4 py-1.5 text-[11px] text-amber-100 backdrop-blur-sm">
                    <span>⚠</span>
                    <span className="flex-1">
                      {surgeonAnnotations.annotationErrorMessage}
                      {surgeonAnnotations.annotationFailureStage && (
                        <span className="ml-1 font-mono text-[9px] text-amber-300/80">
                          stage: {surgeonAnnotations.annotationFailureStage}
                          {surgeonAnnotations.annotationModel ? ` · model: ${surgeonAnnotations.annotationModel}` : ""}
                          {surgeonAnnotations.annotationRequestId ? ` · request: ${surgeonAnnotations.annotationRequestId}` : ""}
                        </span>
                      )}
                    </span>
                    <button
                      onClick={surgeonAnnotations.reanalyze}
                      className="ml-auto shrink-0 text-amber-300 hover:text-white underline"
                    >
                      Retry
                    </button>
                  </div>
                )}

                {/* Distinct from the failure banner above: the AI analysis itself
                    SUCCEEDED (status === "success") but a downstream stage this
                    hook has no visibility into — locating the grounded quote in
                    the live PDF text layer, or the final render pass — dropped
                    some or all of it. Showing this only on success avoids ever
                    stacking two banners for what is really one failed page. */}
                {surgeonAnnotations.status === "success" && annotationRenderStage && annotationRenderCounts && (
                  <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-orange-700/50 bg-orange-900/70 px-4 py-1.5 text-[11px] text-orange-100 backdrop-blur-sm">
                    <span>⚠</span>
                    <span className="flex-1">
                      {annotationRenderStage === "geometry_resolution"
                        ? `${annotationRenderCounts.grounded - annotationRenderCounts.geometryResolved} of ${annotationRenderCounts.grounded} annotations could not be located on this page.`
                        : `${annotationRenderCounts.grounded - annotationRenderCounts.rendered} of ${annotationRenderCounts.grounded} located annotations could not be rendered.`}
                    </span>
                    <button
                      onClick={surgeonAnnotations.reanalyze}
                      className="ml-auto shrink-0 text-orange-300 hover:text-white underline"
                    >
                      Retry
                    </button>
                  </div>
                )}

                <PureReaderView
                  fileUrl={fileUrl}
                  leftRail={resolvedDocumentId ? (
                    <StickyNotesRail
                      embedded
                      documentId={resolvedDocumentId}
                      pageTruthKey={pageTruthKey}
                      pageNumber={currentPage}
                      onJumpToPage={(page) => syncToPage(page, { reason: 'TOC_JUMP' })}
                    />
                  ) : undefined}
                  docId={resolvedDocumentId}
                  currentPage={currentPage}
                  pdfPageCount={pdfPageCount}
                  onPageChange={(p) => syncToPage(p)}
                  onPageCount={handlePageCount}
                  onTextSelect={(t) => sel.setSelectionText(t)}
                  onOutline={handleOutlineExtraction}
                  fontSize={fontSize}
                  fontFamily={fontFamily}
                  onActiveParagraphChange={handleActiveParagraphChange}
                  focusSnippet={focusSnippet}
                  focusHighlightPersist={speechReadingActive}
                  onTextClick={(snippet) => speechPanelRef.current?.playFromSnippet(snippet)}
                  onPdfWordClick={(cursor) => {
                    // Prime speech resume refs for the clicked word.
                    // Store's setThoughtUnit is already called inside SmartPDFViewer
                    // handleMouseUp — no duplicate call needed here.
                    // Speech does NOT start until the user presses the Play chip.
                    speechPanelRef.current?.seekToCursor(cursor);
                  }}
                  onPdfChipPlay={(cursor) => {
                    // Play chip pressed: re-prime cursor then start playback.
                    speechPanelRef.current?.seekToCursor(cursor);
                    speechPanelRef.current?.triggerPlay();
                  }}
                  aiHighlightAnchors={safeHighlightAnchors}
                  allHighlightAnchors={finalHighlightAnchors}
                  synthStatus={safeHighlightAnchors.length > 0 ? "ready" : "loading"}
                  pageTruthKey={pageTruthKey}
                  onExplainThoughtUnit={explainThoughtUnitById}
                  onOpenThoughtUnitRecall={openThoughtUnitInRecallLab}
                  onNoteThoughtUnit={noteThoughtUnitById}
                  onOpenFocusCycle={undefined}
                  onPageTextExtracted={(pageNumber, text) => setPageTextByPage((prev) => {
                    const key = `${bookId}:${pageNumber}`;
                    if (prev.get(key) === text) return prev;
                    const next = new Map(prev);
                    if (next.size >= 50) next.delete(next.keys().next().value as string);
                    next.set(key, text);
                    return next;
                  })}
                  onPageImageCaptured={(pageNumber, dataUrl) => setPageImageByPage((prev) => {
                    const key = `${bookId}:${pageNumber}`;
                    if (prev.get(key) === dataUrl) return prev;
                    const next = new Map(prev);
                    if (next.size >= 10) next.delete(next.keys().next().value as string);
                    next.set(key, dataUrl);
                    return next;
                  })}
                  surgeonHighlightTargets={surgeonAnnotations.highlightTargets}
                  surgeonAnnotationCount={surgeonAnnotations.plan?.annotations.length ?? 0}
                  pageText={pageTextByPage.get(`${bookId}:${currentPage}`) || ""}
                  emptyThoughtUnitReason={canonicalLeftPanelDiagnostic}
                  onEffectivePresetChange={setSharedPresetId}
                  bookTitle={uploadedFile?.name}
                  onPdfLoadError={() => {
                    setCanonicalLeftPanelDiagnostic('source pdf unavailable');
                    setPdfSourceFailed(true);
                  }}
                  onPdfRetry={currentLocalDocumentId ? () => {
                    setPdfSourceFailed(false);
                    handleLoadPDF('', uploadedFile?.name, currentLocalDocumentId);
                  } : undefined}
                  pageThesis={currentPageStudyModel?.pageThesis ?? null}
                  packTierLabels={activePack.tierLabels}
                />

                {/* Ask About This Page — floats over Reader when Elena Mode feature flag is enabled */}
                {ELENA_ENABLED && (
                  <div className="absolute bottom-4 right-4 z-20">
                    <AskPagePanel
                      pageText={pageTextByPage.get(`${bookId}:${currentPage}`) || undefined}
                      bookTitle={uploadedFile?.name}
                      currentPage={currentPage}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Right: Unified Intelligence Panel */}
            <div className={fileUrl ? "h-full w-[32%] min-w-[380px] max-w-[520px] overflow-hidden border-l border-white/10" : "flex-1 h-full"}>
              <RightPanel
                key={`${pageTruthKey}-${rightPanelResetKey}`}
                ctx={activePageContext}
                resolvedDocumentId={resolvedDocumentId}
                knowledgeNodeId={pageKnowledgeNodeId}
                state={unifiedPanelState}
                payload={currentPanelPayload}
                intelligence={intelligenceSnapshot}
                guidedPath={guidedPath}
                resolveEvidenceId={resolveEvidenceId}
                onNoteSaved={handleNoteSaved}
                onStudySetGenerated={handleStudySetGenerated}
                onEvidenceClick={playThoughtUnit}
                onOpenThoughtUnit={openThoughtUnitInRecallLab}
                onStudyModelReady={handleStudyModelReady}
                onCrossLinkNavigate={handleCrossLinkNavigate}
                tocItems={tocItemsForSearch}
                activePageText={pageTextByPage.get(`${bookId}:${currentPage}`) ?? ""}
                presetId={sharedPresetId}
                highlightedAnchorTexts={highlightedAnchorTexts}
                speechPanelRef={speechPanelRef}
                onSpeechSnippetFocus={handleSpeechSnippetFocus}
                onSpeechPlayStateChange={handleSpeechPlayStateChange}
                onSpeechExplainSegment={explainThoughtUnitById}
                onOpenWhiteboard={handleOpenWhiteboardPanel}
                onStartProfessor={handleStartProfessor}
                onOpenChiefResident={handleOpenChiefResident}
                groundedAnnotations={surgeonAnnotations.groundedAnnotations}
                selectionText={sel.selectionText ?? ""}
                canonicalLeftPanelUnits={enrichedCanonicalUnits}
                activeThoughtUnit={activeCanonicalThoughtUnit}
                onAskExpert={handleAskExpert}
                onJumpToUnit={handleJumpToUnit}
              />
            </div>
          </ErrorBoundary>
        </div>
      );
    }

    if (activeShellTab === "notelab") {
      return (
        <div className="h-full flex flex-col overflow-hidden bg-[rgb(11,18,34)]">
          <div className="border-b border-white/10 px-3 py-2 flex-shrink-0 flex items-center gap-2">
            <div className="flex-1">
              <div className="text-xs font-bold uppercase tracking-widest text-emerald-400">NoteLab</div>
            </div>
            <div className="flex gap-1 flex-wrap">
              {(["notes", "teaching"] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setNotesSubTab(v)}
                  className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                    notesSubTab === v
                      ? "bg-emerald-600/20 text-emerald-300 border border-emerald-600/30"
                      : "text-slate-400 hover:bg-white/10 hover:text-slate-200"
                  }`}
                >
                  {v === "notes" ? "📝 Notes" : "🩺 Chief Resident"}
                </button>
              ))}
            </div>
          </div>

          {/* Chief Resident sub-tab — always mounted so session state persists across tab switches */}
          <div className="flex-1 overflow-hidden" style={{ display: notesSubTab === "teaching" ? "flex" : "none", flexDirection: "column" }}>
            <ChiefResidentPanel
              studyModel={currentPageStudyModel}
              pageText={pageTextByPage.get(`${bookId}:${currentPage}`) ?? ""}
              bookId={bookId}
              currentPage={currentPage}
              pageTruthKey={pageTruthKey}
              bookTitle={uploadedFile?.name}
              activeNote={activeNote}
              onRecallSaved={(setId) => { setLastRecallSetId(setId); setRecallLabRefreshKey(k => k + 1); }}
            />
          </div>

          {/* Canonical saved-note workspace. This is the immediate destination
              for every Save to NoteLab action; the old generic Personal
              Workspace no longer hides the structured study notes.
              Correction (Evidence-as-provenance) — P4 removed the M5
              standing Evidence panel (LearningSourcesManager/EvidenceWorkspace)
              entirely; provenance now lives behind each note/block and
              surfaces only via per-object actions (View Source/Jump to
              Reader/Ask Professor), never a separate visible Evidence
              workspace competing with the notebook. */}
          <div className="flex-1 overflow-hidden" style={{ display: notesSubTab === "notes" ? "flex" : "none", flexDirection: "column" }}>
            <UltraNotesList
              bookId={bookId}
              onNavigateToPage={(page) => { syncToPage(page); trySwitchShellTab("reader", "reader"); }}
              refreshKey={noteLabRefreshKey}
              onCardsGenerated={(setId) => {
                setLastRecallSetId(setId);
                setRecallLabRefreshKey((key) => key + 1);
              }}
              onAskProfessorAboutBlock={(note, block) => {
                setWbConcept(truncate(`${note.topic} — ${block.primitive.replace(/_/g, " ")}`, 600));
                setWbContext(truncate([block.content, block.detail].filter(Boolean).join("\n\n"), 1200));
                setShowWhiteboardPanel(true);
              }}
              onActiveNoteChange={(note) => {
                setActiveNote(note);
                setNotelabActiveNote(note);
              }}
              focusedAnchorText={notelabFocusedAnchorText}
              focusedKnowledgeNodeId={selectedKgNodeId}
            />
          </div>
        </div>
      );
    }

    // ✅ TOC View - PURE: Only TOC tree (NO PDF panel)
    if (activeShellTab === "toc") {
      return (
        <div className="h-full" data-testid="toc-view-container">
          <ErrorBoundary
            onError={(error, errorInfo) => {
              console.error('📑 TOC Error:', { message: error.message, stack: error.stack });
            }}
          >
            <PureTocView
              documentId={bookId}
              documentName={sanitizeDocTitle(tableOfContents[0]?.title, uploadedFile?.name || "Document")}
              currentPage={currentPage}
              pdfPageCount={pdfPageCount}
              onOpenChapter={(pageNumber) => {
                syncToPage(pageNumber, { reason: "TOC_JUMP" });
                trySwitchShellTab("reader", "reader");
              }}
            />
          </ErrorBoundary>
        </div>
      );
    }

    // ✅ Learning Hub — Book Roadmap · Study Plan (consolidated)
    if (activeShellTab === "syllabus") {
      return (
        <div className="h-full flex flex-col overflow-hidden" data-testid="syllabus-view-container">
          {/* Sub-tab bar */}
          <div className="border-b border-white/10 px-3 py-2 flex-shrink-0 flex items-center gap-1 bg-slate-950/60 overflow-x-auto">
            <span className="text-xs font-bold uppercase tracking-widest text-indigo-400 mr-3 shrink-0">Learning Hub</span>
            {([
              { id: "overview",  label: "Overview" },
              { id: "today",     label: "Today's Plan" },
              { id: "roadmap",   label: "Book Roadmap" },
              { id: "studyplan", label: "Study Plan" },
              { id: "mastery",   label: "Mastery" },
              { id: "weak",      label: "Weak Areas" },
              { id: "exam",      label: "Exam Readiness" },
              { id: "graph",     label: "Knowledge Graph" },
              { id: "coach",     label: "AI Coach" },
              { id: "sources",   label: "Sources" },
            ] as const).map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setHubSubTab(id)}
                className={`shrink-0 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  hubSubTab === id
                    ? "bg-indigo-600/25 text-indigo-200 border border-indigo-500/40"
                    : "text-slate-400 hover:bg-white/10 hover:text-slate-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Overview — learning dashboard */}
          {hubSubTab === "overview" && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {bookId ? (
                <>
                  {/* Continue Learning CTA */}
                  <button
                    onClick={() => { trySwitchShellTab("reader", "reader"); }}
                    className="w-full rounded-xl border border-indigo-500/30 bg-indigo-600/20 hover:bg-indigo-600/30 transition-colors p-4 text-left"
                  >
                    <div className="text-xs font-bold uppercase tracking-widest text-indigo-400 mb-1">Continue Learning</div>
                    <div className="text-sm font-semibold text-white truncate">{uploadedFile?.name ?? bookId}</div>
                    <div className="mt-2 text-xs text-indigo-300 font-medium">
                      {nextTopicRecommendation
                        ? `→ ${nextTopicRecommendation.chapterTitle} · p.${nextTopicRecommendation.page}`
                        : `p.${currentPage} of ${pdfPageCount}`}
                    </div>
                  </button>

                  {/* Stats row */}
                  {courseProgress && (
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { label: "Mastery",   value: `${Math.round(courseProgress.overallMasteryPct)}%`,  sub: "overall" },
                        { label: "Read",      value: `${Math.round(courseProgress.overallReadPct)}%`,     sub: "of book" },
                        { label: "Chapters",  value: `${courseProgress.completedChapters}/${courseProgress.totalChapters}`, sub: "done" },
                        { label: "Time Left", value: courseProgress.estimatedRemainingMinutes >= 60
                            ? `${Math.round(courseProgress.estimatedRemainingMinutes / 60)}h`
                            : `${courseProgress.estimatedRemainingMinutes}m`,
                          sub: "estimated" },
                      ].map(({ label, value, sub }) => (
                        <div key={label} className="rounded-lg border border-white/10 bg-slate-900/60 p-3 text-center">
                          <div className="text-base font-bold text-white">{value}</div>
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-indigo-400 mt-0.5">{label}</div>
                          <div className="text-[10px] text-slate-500">{sub}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Weak areas alert */}
                  {courseWeakAreas && courseWeakAreas.length > 0 && (
                    <button
                      onClick={() => setHubSubTab("weak")}
                      className="w-full flex items-center gap-2 rounded-lg border border-rose-500/20 bg-rose-950/20 hover:bg-rose-950/30 px-3 py-3 text-left transition-colors"
                    >
                      <span className="text-base">⚠️</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-rose-300 truncate">{courseWeakAreas[0]}</div>
                        {courseWeakAreas.length > 1 && <div className="text-[11px] text-slate-500">+{courseWeakAreas.length - 1} more weak areas</div>}
                      </div>
                      <span className="text-xs text-slate-400 shrink-0 font-medium">View →</span>
                    </button>
                  )}

                  {/* Knowledge State — C8: the first Learning Hub surface sourced
                      directly from the shared Learning State (KnowledgeNodeProgress),
                      the same store TestLab/Recall/Whiteboard already read/write. */}
                  <KnowledgeStatePanel
                    nodes={kgNodes}
                    onOpenNode={(node) => {
                      const page = node.sourcePages[0];
                      if (page) syncToPage(page, { reason: 'PROGRAMMATIC' });
                      trySwitchShellTab("reader", "reader");
                    }}
                  />

                  {/* Session launcher — adaptive guide is pre-loaded in reader (Adaptive tab default) */}
                  <LearningHubLaunchPanel
                    bookLoaded={!!bookId}
                    hasWeakAreas={!!(courseWeakAreas && courseWeakAreas.length > 0)}
                    hasStudyPlan={syllabusStudyPlan.length > 0}
                    nextTopicLabel={nextTopicRecommendation
                      ? `${nextTopicRecommendation.chapterTitle} · p.${nextTopicRecommendation.page}`
                      : undefined}
                    onAdaptiveStudy={() => {
                      if (nextTopicRecommendation?.page) syncToPage(nextTopicRecommendation.page);
                      trySwitchShellTab("reader", "reader");
                    }}
                    onTodaySession={() => setHubSubTab("today")}
                    onContinueReading={() => trySwitchShellTab("reader", "reader")}
                    onWeakAreaReview={() => {
                      const firstWeak = courseWeakAreas?.[0];
                      if (firstWeak) setCoachQuestion(`Help me review my weak area: ${firstWeak}`);
                      setHubSubTab("coach");
                    }}
                    onExamPrep={() => setHubSubTab("exam")}
                    onAiCoach={() => setHubSubTab("coach")}
                  />
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-40 text-center text-slate-500">
                  <div className="text-3xl mb-3">📚</div>
                  <div className="text-sm">Load a book to see your learning overview</div>
                </div>
              )}
            </div>
          )}

          {/* Today — command center for the current session */}
          {hubSubTab === "today" && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {bookId ? (
                <>
                  {/* Primary CTA — adaptive study launch with pre-loaded guide */}
                  <button
                    onClick={() => {
                      if (nextTopicRecommendation?.page) syncToPage(nextTopicRecommendation.page);
                      trySwitchShellTab("reader", "reader");
                    }}
                    className="w-full rounded-xl border border-indigo-500/40 bg-gradient-to-br from-indigo-600/25 to-indigo-800/20 hover:from-indigo-600/35 hover:to-indigo-800/30 transition-colors p-5 text-left"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="text-xs font-bold uppercase tracking-widest text-indigo-400">
                        {nextTopicRecommendation ? "Recommended Next" : "Continue Reading"}
                      </div>
                      <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-300 bg-indigo-800/40 border border-indigo-500/30 px-2 py-0.5 rounded-full">
                        Adaptive Guide Pre-loaded
                      </span>
                    </div>
                    <div className="text-sm font-semibold text-white leading-snug">
                      {nextTopicRecommendation?.chapterTitle ?? uploadedFile?.name ?? "Open book"}
                    </div>
                    <div className="mt-1.5 text-xs text-indigo-300">
                      {nextTopicRecommendation
                        ? `p.${nextTopicRecommendation.page} · ${nextTopicRecommendation.reason}`
                        : `p.${currentPage}`}
                    </div>
                  </button>

                  {/* Study session from plan */}
                  {syllabusStudyPlan.length > 0 && (() => {
                    const todaySession = syllabusStudyPlan.find(day => !day.pages.some((p: { start: number; end: number }) =>
                      Array.from(syllabusStudiedPages).some((sp: number) => sp >= p.start && sp <= p.end)
                    ));
                    if (!todaySession) return (
                      <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-3 text-center">
                        <div className="text-emerald-400 text-sm font-semibold">All sessions complete 🎉</div>
                        <div className="text-[11px] text-slate-500 mt-1">Consider reviewing your weakest chapters.</div>
                      </div>
                    );
                    return (
                      <div className="rounded-xl border border-amber-500/25 bg-amber-950/20 p-4">
                        <div className="text-xs font-bold uppercase tracking-widest text-amber-400 mb-2">Today&apos;s Plan</div>
                        <div className="text-sm font-semibold text-white">{todaySession.topics[0] ?? "Study session"}</div>
                        {todaySession.topics.length > 1 && (
                          <div className="text-xs text-slate-500 mt-0.5">+{todaySession.topics.length - 1} more topics</div>
                        )}
                        <div className="mt-3 flex items-center justify-between">
                          <div className="flex gap-3 text-xs text-slate-400">
                            {todaySession.date && <span>📅 {todaySession.date}</span>}
                            <span>⏱ ~{todaySession.estimatedMinutes} min</span>
                          </div>
                          <button
                            onClick={() => {
                              const page = todaySession.pages[0]?.start;
                              if (page) { syncToPage(page); trySwitchShellTab("reader", "reader"); }
                            }}
                            className="text-xs font-bold text-amber-300 hover:text-amber-200 px-3 py-1 rounded-lg bg-amber-900/30 border border-amber-500/20 hover:bg-amber-900/50 transition-colors"
                          >
                            Start →
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                  {/* 7-day calendar strip — only when a study schedule exists */}
                  {syllabusStudyPlan.length > 0 && (() => {
                    const todayStr = new Date().toISOString().split("T")[0];
                    const upcoming = syllabusStudyPlan.filter((d: StudyDay) => d.date >= todayStr).slice(0, 7);
                    if (!upcoming.length) return null;
                    return (
                      <div className="rounded-xl border border-white/10 bg-slate-900/40 p-4">
                        <div className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">This Week</div>
                        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                          {upcoming.map((day: StudyDay) => {
                            const d = new Date(day.date + "T12:00:00");
                            const dayLabel = d.toLocaleDateString(undefined, { weekday: "short" });
                            const dateNum = d.getDate();
                            const isToday = day.date === todayStr;
                            return (
                              <button
                                key={day.date}
                                onClick={() => {
                                  const page = day.pages[0]?.start;
                                  if (page) { syncToPage(page); trySwitchShellTab("reader", "reader"); }
                                }}
                                className={`flex-shrink-0 flex flex-col items-center rounded-lg px-2.5 py-2 min-w-[42px] transition-colors ${
                                  day.isExamDay
                                    ? "bg-rose-900/40 border border-rose-500/30 hover:bg-rose-900/60"
                                    : isToday
                                    ? "bg-indigo-600/30 border border-indigo-500/40 hover:bg-indigo-600/40"
                                    : "bg-slate-800/60 border border-white/10 hover:bg-slate-700/60"
                                }`}
                              >
                                <div className={`text-[10px] font-medium ${isToday ? "text-indigo-300" : "text-slate-400"}`}>{dayLabel}</div>
                                <div className={`text-xs font-bold mt-0.5 ${isToday ? "text-white" : "text-slate-300"}`}>{dateNum}</div>
                                <div className={`w-1.5 h-1.5 rounded-full mt-1.5 ${day.isExamDay ? "bg-rose-400" : "bg-indigo-400"}`} />
                              </button>
                            );
                          })}
                        </div>
                        {upcoming.find((d: StudyDay) => d.isExamDay) && (
                          <div className="text-[10px] text-rose-400 mt-2">● = Exam day</div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Estimated time remaining */}
                  {courseProgress && courseProgress.estimatedRemainingMinutes > 0 && (
                    <div className="flex items-center justify-between rounded-lg border border-white/10 bg-slate-900/40 px-4 py-3">
                      <span className="text-xs text-slate-400">Estimated time to complete book</span>
                      <span className="text-xs font-semibold text-white">
                        {courseProgress.estimatedRemainingMinutes >= 60
                          ? `${Math.round(courseProgress.estimatedRemainingMinutes / 60)}h ${courseProgress.estimatedRemainingMinutes % 60}m`
                          : `${courseProgress.estimatedRemainingMinutes}m`}
                      </span>
                    </div>
                  )}

                  {/* Weak areas to focus on today */}
                  {courseWeakAreas && courseWeakAreas.length > 0 && (
                    <div className="rounded-xl border border-rose-500/25 bg-rose-950/20 p-4">
                      <div className="text-xs font-bold uppercase tracking-widest text-rose-400 mb-3">Review These Today</div>
                      <div className="space-y-2">
                        {courseWeakAreas.slice(0, 3).map((area: string, i: number) => (
                          <div key={i} className="text-xs text-slate-300 flex items-start gap-2">
                            <span className="text-rose-400 mt-0.5 shrink-0">•</span>{area}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-40 text-center text-slate-500">
                  <div className="text-3xl mb-3">📅</div>
                  <div className="text-sm">Load a book to plan today&apos;s session</div>
                </div>
              )}
            </div>
          )}

          {/* Book Roadmap — TocTree + ChapterDashboard */}
          {hubSubTab === "roadmap" && (
          <div className="flex-1 overflow-y-auto p-4">
          <ErrorBoundary
            onError={(error) => {
              console.error("📚 Syllabus Error:", { message: error.message, stack: error.stack });
            }}
          >
            {bookId && syllabusToc.length > 0 && (
              <div className="mb-4">
                <AdaptiveSyllabusPanel
                  bookId={bookId}
                  bookTitle={uploadedFile?.name ?? bookId}
                  filename={uploadedFile?.name}
                  tocNodes={syllabusToc}
                  pageCount={pdfPageCount || 1}
                  onJumpToPage={handleChapterJumpToReader}
                  getPageText={handleGetPageText}
                />
              </div>
            )}

            {!syllabusPages.length ? (
              <div className="space-y-2">
                {syllabusUploadRequested && (
                  <button
                    onClick={() => setSyllabusUploadRequested(false)}
                    className="text-[11px] font-medium text-indigo-300 hover:text-indigo-200"
                  >
                    ← Back to detected chapters
                  </button>
                )}
                <SyllabusUploadPanel onParsed={handleParsedSyllabus} />
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-300">
                  <span>
                    {syllabusSource === "upload" ? (
                      <><span className="font-medium text-white">Course syllabus:</span> {syllabusFileName}</>
                    ) : (
                      <><span className="font-medium text-white">Chapters detected from:</span> {syllabusFileName}</>
                    )}
                  </span>
                  {syllabusSource === "book" && (
                    <button
                      onClick={() => { setSyllabusUploadRequested(true); setSyllabusPages([]); setSyllabusToc([]); }}
                      className="shrink-0 text-[11px] font-medium text-indigo-300 hover:text-indigo-200"
                    >
                      Upload a course syllabus →
                    </button>
                  )}
                </div>

                <ChapterDashboard
                  chapters={chapterProgressList}
                  course={courseProgress}
                  onJumpToChapter={handleChapterJumpToReader}
                  weakAreas={courseWeakAreas}
                  nextTopic={nextTopicRecommendation}
                  prerequisiteChain={coursePrerequisiteChain}
                />

                <TocTree
                  toc={syllabusToc}
                  activePage={currentPage}
                  onJump={handleSyllabusNodeClick}
                  onStudy={handleStudyTopic}
                  bookId={bookId}
                  isLowQuality={
                    syllabusToc.length > 0 && (
                      syllabusToc.length <= 1 ||
                      syllabusToc.every((n) => n.page <= 1) ||
                      syllabusToc.every((n) => /^section\s+\d+$/i.test(n.title.trim())) ||
                      syllabusToc.every((n) => /^pages?\s+\d+[–—-]\d+$/i.test(n.title.trim()))
                    )
                  }
                  onRegenerate={handleRegenerateToc}
                />
              </div>
            )}
          </ErrorBoundary>
          </div>
          )}

          {/* Study Plan sub-tab */}
          {hubSubTab === "studyplan" && (
            <div className="flex-1 overflow-hidden">
              <StudyPlanLab
                bookId={bookId}
                bookTitle={uploadedFile?.name ?? undefined}
                pageTextByPage={pageTextByPage}
                uploadedFile={uploadedFile}
                chapterProgressList={chapterProgressList}
                courseProgress={courseProgress}
                nextTopicRecommendation={nextTopicRecommendation}
                onNavigateToPage={handleStudyPlanNavigate}
              />
            </div>
          )}

          {/* Mastery — chapter-level mastery breakdown */}
          {hubSubTab === "mastery" && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-bold text-indigo-300">🏆 Chapter Mastery</div>
                {bookId && (
                  <button
                    onClick={() => {
                      const worstChapter = chapterProgressList
                        .slice()
                        .sort((a, b) => (a.progress.masteryPct ?? 0) - (b.progress.masteryPct ?? 0))[0];
                      const startPage = worstChapter?.chapter.pageRanges[0]?.start;
                      if (startPage) syncToPage(startPage);
                      trySwitchShellTab("reader", "reader");
                    }}
                    className="text-[10px] font-semibold text-indigo-300 hover:text-indigo-200 px-3 py-1.5 rounded-lg bg-indigo-900/30 border border-indigo-500/30 hover:bg-indigo-900/50 transition-colors"
                  >
                    Study Weakest Chapter →
                  </button>
                )}
              </div>
              {chapterProgressList.length > 0 ? (
                <div className="space-y-2.5">
                  {chapterProgressList.map((ch, idx) => {
                    const pct = ch.progress.masteryPct ?? 0;
                    const color = pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-yellow-500" : "bg-rose-500";
                    return (
                      <div key={idx} className="rounded-lg border border-white/10 bg-slate-900/60 px-4 py-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium text-white truncate">{ch.chapter.title ?? `Chapter ${idx + 1}`}</span>
                          <span className="text-xs font-semibold text-slate-300 ml-2 shrink-0">{Math.round(pct)}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-700/60 overflow-hidden">
                          <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center text-slate-500 text-sm py-10">Read chapters to build mastery data.</div>
              )}
            </div>
          )}

          {/* Weak Areas */}
          {hubSubTab === "weak" && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-bold text-rose-300">⚠️ Weak Areas</div>
                {courseWeakAreas && courseWeakAreas.length > 0 && (
                  <button
                    onClick={() => {
                      const firstWeak = courseWeakAreas[0];
                      if (firstWeak) setCoachQuestion(`Give me a targeted review session for: ${firstWeak}`);
                      setHubSubTab("coach");
                    }}
                    className="text-[10px] font-semibold text-rose-300 hover:text-rose-200 px-3 py-1.5 rounded-lg bg-rose-900/30 border border-rose-500/30 hover:bg-rose-900/50 transition-colors"
                  >
                    Launch Review Session →
                  </button>
                )}
              </div>
              {courseWeakAreas && courseWeakAreas.length > 0 ? (
                <div className="space-y-2">
                  {courseWeakAreas.map((area: string, idx: number) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setCoachQuestion(`Help me review and improve on: ${area}`);
                        setHubSubTab("coach");
                      }}
                      className="w-full flex items-start gap-3 rounded-lg border border-rose-500/20 bg-rose-950/20 px-4 py-3 text-left hover:bg-rose-950/35 hover:border-rose-500/35 transition-colors"
                    >
                      <span className="text-rose-400 shrink-0">⚠️</span>
                      <span className="text-xs text-slate-200 flex-1">{area}</span>
                      <span className="text-[9px] text-rose-400/60 shrink-0 font-medium">Coach →</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-center text-slate-500 text-sm py-10">No weak areas detected yet. Complete more chapters to see gaps.</div>
              )}
            </div>
          )}

          {/* Exam Readiness */}
          {hubSubTab === "exam" && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="text-sm font-bold text-indigo-300">🎯 Exam Readiness</div>
              {courseProgress ? (
                <div className="rounded-xl border border-indigo-500/20 bg-slate-900/60 p-4 space-y-3">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Chapters completed</span>
                    <span className="text-white font-semibold">{courseProgress.completedChapters} / {courseProgress.totalChapters}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-700/60 overflow-hidden">
                    <div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.round((courseProgress.completedChapters / Math.max(courseProgress.totalChapters, 1)) * 100)}%` }} />
                  </div>
                </div>
              ) : null}
              <div className="rounded-xl border border-indigo-500/20 bg-gradient-to-br from-indigo-950/50 to-slate-900/60 p-5 text-center">
                <div className="text-3xl mb-3">🎯</div>
                <div className="text-sm font-semibold text-slate-200">Avrrio TestLab — Practice Exams</div>
                <div className="text-xs text-slate-500 mt-1">Full-length simulations with section scoring</div>
                <button
                  onClick={() => { router.push("/apex"); }}
                  className="mt-4 px-5 py-2 rounded-lg bg-indigo-600/40 border border-indigo-500/40 text-indigo-200 text-xs font-semibold hover:bg-indigo-600/60 transition-colors"
                >
                  Open TestLab →
                </button>
              </div>
            </div>
          )}

          {/* AI Coach — personalized coaching via the student's progress context */}
          {hubSubTab === "coach" && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Coach header — prominent card */}
              <div className="rounded-xl border border-violet-500/30 bg-gradient-to-br from-violet-900/40 to-indigo-900/30 p-4 flex items-center gap-3">
                <span className="text-2xl">🤖</span>
                <div>
                  <div className="text-sm font-bold text-white">AI Study Coach</div>
                  <div className="text-xs text-violet-300">Personalized advice based on your progress</div>
                </div>
              </div>

              {/* Quick prompts */}
              <div className="flex flex-wrap gap-2">
                {[
                  "What should I focus on today?",
                  "How's my progress?",
                  "Help me tackle my weakest area",
                  "Give me a 30-min study plan",
                ].map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => setCoachQuestion(prompt)}
                    className="text-xs px-3 py-1.5 rounded-full bg-slate-800 border border-white/10 text-slate-300 hover:bg-slate-700 hover:text-white hover:border-violet-500/30 transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>

              {/* Text input */}
              <div className="space-y-2.5">
                <textarea
                  value={coachQuestion}
                  onChange={e => setCoachQuestion(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      handleAskCoach();
                    }
                  }}
                  placeholder="Ask your coach anything about your study plan, weak areas, exam strategy…"
                  rows={3}
                  className="w-full rounded-xl border border-white/10 bg-slate-900/60 text-slate-200 text-xs px-4 py-3 resize-none focus:outline-none focus:border-violet-500/60 placeholder:text-slate-600"
                />
                <button
                  disabled={!coachQuestion.trim() || coachLoading}
                  onClick={handleAskCoach}
                  className="w-full py-2.5 rounded-xl bg-violet-700 hover:bg-violet-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold transition-colors"
                >
                  {coachLoading ? "Thinking…" : "Ask Coach  ⌘↵"}
                </button>
              </div>

              {/* Coach response */}
              {coachResponse && (
                <div className="rounded-xl border border-violet-500/25 bg-violet-950/30 p-4">
                  <div className="text-xs font-bold uppercase tracking-widest text-violet-400 mb-3">Coach Says</div>
                  <div className="text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">{coachResponse}</div>
                </div>
              )}

              {/* Context snapshot shown to the coach */}
              {bookId && courseProgress && (
                <div className="rounded-xl border border-white/5 bg-slate-900/40 p-4">
                  <div className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">Your Progress Snapshot</div>
                  <div className="space-y-2">
                    {[
                      [`📖 Read`, `${Math.round(courseProgress.overallReadPct)}%`],
                      [`🏆 Mastery`, `${Math.round(courseProgress.overallMasteryPct)}%`],
                      [`🔴 Weak areas`, courseWeakAreas?.length ? courseWeakAreas.slice(0, 2).join(", ") : "None yet"],
                      [`📍 Next topic`, nextTopicRecommendation?.chapterTitle ?? "—"],
                    ].map(([label, value]) => (
                      <div key={label} className="flex items-center justify-between text-xs">
                        <span className="text-slate-500">{label}</span>
                        <span className="text-slate-300 font-medium truncate max-w-[55%] text-right">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!bookId && (
                <div className="flex flex-col items-center justify-center h-40 text-center text-slate-500">
                  <div className="text-3xl mb-3">🤖</div>
                  <div className="text-sm">Load a book to get personalized coaching</div>
                </div>
              )}
            </div>
          )}

          {/* Knowledge Graph — scaffold */}
          {hubSubTab === "graph" && (
            <div className="flex-1 overflow-y-auto p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-bold text-indigo-300">🕸 Visual Knowledge Roadmap</div>
                <div className="text-[10px] text-slate-500">Click a node to navigate · nodes tier by importance</div>
              </div>
              <VisualKnowledgeRoadmap
                nodes={kgNodes}
                selectedNodeId={kgSelectedNodeId}
                onNodeClick={(node) => {
                  kgSetSelectedNodeId(kgSelectedNodeId === node.id ? null : node.id);
                  if (node.sourcePages[0]) { syncToPage(node.sourcePages[0]); trySwitchShellTab("reader", "reader"); }
                  if (node.canonicalAnchorId) setFocusedEvidenceId(node.canonicalAnchorId);
                }}
              />
            </div>
          )}

          {/* Learning Sources */}
          {hubSubTab === "sources" && (
            <div className="flex-1 overflow-y-auto p-4">
              <ErrorBoundary onError={(error) => console.error("📚 LearningSourcesPanel Error:", error.message)}>
                <LearningSourcesPanel
                  bookId={bookId}
                  kgNodes={kgNodes}
                  onNavigateToPage={(page) => { syncToPage(page); trySwitchShellTab("reader", "reader"); }}
                />
              </ErrorBoundary>
            </div>
          )}
        </div>
      );
    }

    if (activeShellTab === "study") {
      DEV && console.log("[RECALL_TAB_OPEN]", { lastRecallSetId, recallLabRefreshKey });
      return (
        <div className="h-full flex flex-col overflow-hidden bg-[rgb(11,18,34)]">
          <div className="border-b border-white/10 px-4 py-3 flex-shrink-0">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-indigo-400">Recall</div>
            <div className="mt-0.5 text-[11px] text-slate-500">Memory-engineering layer · flip cards · active recall</div>
          </div>
          <div className="flex-1 overflow-y-auto">
            <ErrorBoundary onError={(error) => console.error('🧠 RecallLab Error:', error.message, error.stack)}>
              <RecallLab
                bookId={bookId}
                documentId={resolvedDocumentId}
                pageTruthKey={pageTruthKey}
                surgeonPageTruthKey={surgeonAnnotations.plan?.pageTruthKey ?? null}
                groundedAnnotations={surgeonAnnotations.groundedAnnotations}
                knowledgeNodeId={pageKnowledgeNodeId}
                refreshKey={recallLabRefreshKey}
                lastSetId={lastRecallSetId ?? undefined}
                onNavigateToPage={handleRecallNavigateToPage}
                openUnit={recallLabOpenUnit}
                onOpenUnitConsumed={handleRecallOpenUnitConsumed}
                onVisualize={visualizeThoughtUnit}
                onOpenInWhiteboard={openThoughtUnitInWhiteboard}
                onOpenExplainStep={openExplainStepForThoughtUnit}
                focusedKnowledgeNodeId={selectedKgNodeId}
                currentPageNoteCards={currentPageNoteCards}
                currentPage={currentPage}
                currentPageTitle={currentPageStudyModel?.pageThesis ?? null}
              />
            </ErrorBoundary>
          </div>
        </div>
      );
    }

    if (activeShellTab === "podcast") {
      return (
        <PodcastLab
          studyModel={currentPageStudyModel}
          pageNumber={currentPage}
          bookId={bookId}
          activePageText={pageTextByPage.get(`${bookId}:${currentPage}`) ?? ""}
          onEvidenceFocus={(id) => setFocusedEvidenceId(id)}
          initialScript={studyGuideScript}
          explainItSeed={explainItPodcastSeed}
          onDiscussSegment={handleDiscussPodcastSegment}
        />
      );
    }

    if (activeShellTab === "studyguide") {
      return (
        <ErrorBoundary onError={(error) => console.error('📖 StudyGuideLab Error:', error.message)}>
          <StudyGuideLab
            bookId={bookId}
            bookTitle={uploadedFile?.name ?? undefined}
            currentPage={currentPage}
            studyModel={currentPageStudyModel}
            pageText={pageTextByPage.get(`${bookId}:${currentPage}`) ?? ""}
            onNavigateToPage={(page) => {
              syncToPage(page);
              trySwitchShellTab("reader", "reader");
            }}
            onNoteSaved={() => setNoteLabRefreshKey(k => k + 1)}
            onRecallSaved={(setId) => { setLastRecallSetId(setId); setRecallLabRefreshKey(k => k + 1); }}
            onPodcastScript={(script) => setStudyGuideScript(script)}
          />
        </ErrorBoundary>
      );
    }

    // Fallback - should never reach here if all viewModes are handled
    return (
      <div className="h-full flex items-center justify-center bg-gray-900 text-white">
        <p>Unknown view mode: {viewMode}</p>
      </div>
    );
  };

  /* =========================================================================
     🔹 Main Layout
  ========================================================================= */
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  return (
    <div className={`h-screen overflow-hidden flex flex-col ${themeMode === "dark" ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-900"} ${readingMode === "dyslexia" ? "tracking-wide leading-8" : "leading-6"}`} style={{ fontFamily }}>
      <header className="border-b border-slate-700/80 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 text-white shadow-md">
        <div className="px-4 py-3 md:py-4 flex flex-col items-center justify-center text-center">
          <div className="relative inline-flex items-center">
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-wide text-blue-300 drop-shadow-[0_2px_10px_rgba(59,130,246,0.35)]">
              Avrrio Reader
            </h1>
            <span
              aria-hidden
              className="pointer-events-none absolute left-[-8%] top-1/2 h-[130%] w-[116%] -translate-y-1/2 rounded-full border border-amber-300/70"
            />
          </div>
          <p className="mt-1 text-xs md:text-sm tracking-wide text-slate-300">Read. Understand. Think clearly.</p>
          {process.env.NEXT_PUBLIC_BUILD_SHA && (
            <p className="mt-0.5 text-[9px] font-mono text-slate-500 select-none" title={`Built ${process.env.NEXT_PUBLIC_BUILD_TIME || "unknown"}`}>
              build {process.env.NEXT_PUBLIC_BUILD_SHA} · {(process.env.NEXT_PUBLIC_BUILD_TIME || "").slice(0, 16).replace("T", " ")}
            </p>
          )}
        </div>
      </header>

      {/* Quick controls */}
      <div className={`flex flex-wrap items-center gap-3 px-4 py-2 overflow-x-auto ${themeMode === "dark" ? "bg-gray-800" : "bg-slate-100 border-b border-slate-200 text-slate-900"}`}>
        {/* Main Navigation Tabs */}
        <div className="flex items-center gap-1 bg-gray-900 rounded-lg p-1 min-w-max" data-testid="main-nav">
          <button
            onClick={() => trySwitchShellTab("reader", "reader")}
            data-testid="nav-reader"
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeShellTab === "reader" 
                ? "bg-yellow-500 text-black shadow-lg" 
                : "text-gray-300 hover:text-white hover:bg-gray-700"
            }`}
          >
            📖 Reader + Panel
          </button>
          <button
            onClick={() => trySwitchShellTab("toc", "toc")}
            data-testid="nav-toc"
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeShellTab === "toc" 
                ? "bg-orange-500 text-white shadow-lg" 
                : "text-gray-300 hover:text-white hover:bg-gray-700"
            }`}
          >
            📑 TOC
          </button>
          <button
            onClick={() => trySwitchShellTab("syllabus", "syllabus")}
            data-testid="nav-syllabus"
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeShellTab === "syllabus"
                ? "bg-indigo-500 text-white shadow-lg"
                : "text-gray-300 hover:text-white hover:bg-gray-700"
            }`}
          >
            🗺 Learning Hub
          </button>
          <button
            onClick={() => trySwitchShellTab("notelab", "notelab")}
            data-testid="nav-notelab"
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${focusState.running ? "opacity-50" : ""} ${
              activeShellTab === "notelab"
                ? "bg-green-500 text-white shadow-lg"
                : "text-gray-300 hover:text-white hover:bg-gray-700"
            }`}
          >
            📝 NoteLab
          </button>
          <button
            onClick={() => trySwitchShellTab("study", "study")}
            data-testid="nav-recalllab"
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${focusState.running ? "opacity-50" : ""} ${
              activeShellTab === "study"
                ? "bg-indigo-500 text-white shadow-lg"
                : "text-gray-300 hover:text-white hover:bg-gray-700"
            }`}
          >
            🧠 Recall
          </button>
          <button
            onClick={() => {
              if (focusSoftLock && focusState.running) {
                const ok = window.confirm("Focus Cycle is active. Leave Reader cockpit for TestLab?");
                if (!ok) return;
              }
              router.push("/apex");
            }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all text-gray-300 hover:text-white hover:bg-gray-700 ${focusState.running ? "opacity-50" : ""}`}
            title="Open Avrrio TestLab"
          >
            🎯 TestLab
          </button>
          <button
            onClick={() => {
              if (focusSoftLock && focusState.running) {
                const ok = window.confirm("Focus Cycle is active. Leave Reader cockpit for Elena?");
                if (!ok) return;
              }
              router.push("/elena");
            }}
            data-testid="nav-elena"
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all text-gray-300 hover:text-white hover:bg-gray-700 ${focusState.running ? "opacity-50" : ""}`}
            title="Elena — personalized child learning"
          >
            ✨ Elena
          </button>
                  </div>

        {/* Global Zoom Controls - Show when PDF is loaded */}
        {fileUrl && pdfPageCount > 0 && activeShellTab === "reader" && (
          <div className="flex items-center gap-1 bg-gray-900 rounded-lg px-2 py-1" data-testid="global-zoom">
            <button
              onClick={zoomOut}
              disabled={!canZoomOut()}
              className="px-2 py-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded text-xs"
              title="Zoom out"
            >
              −
            </button>
            <button
              onClick={resetZoom}
              className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs min-w-[50px] text-center"
              title="Reset zoom"
            >
              {getZoomPercent()}%
            </button>
            <button
              onClick={zoomIn}
              disabled={!canZoomIn()}
              className="px-2 py-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded text-xs"
              title="Zoom in"
            >
              +
            </button>
          </div>
        )}

        {/* Focus Cycle pill removed from toolbar — rendered as fixed overlay below */}

        <div className="flex-1" />


        <div className="flex items-center gap-1.5 rounded-xl border border-white/20 bg-black/20 px-2 py-1">
          <span className="text-[11px] text-slate-300">Profile</span>
          <select
            value={learningProfile}
            onChange={(e) => setLearningProfile(e.target.value as LearningProfile)}
            className="bg-transparent text-[11px] text-slate-200 border-none outline-none cursor-pointer appearance-none pr-1"
            title="Learning Profile"
          >
            {(Object.keys(LEARNING_PROFILE_LABELS) as LearningProfile[]).map((p) => (
              <option key={p} value={p} className="bg-slate-900 text-slate-200">
                {LEARNING_PROFILE_LABELS[p]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-white/20 bg-black/20 px-2 py-1">
          <span className="text-[11px] text-slate-300">Reading</span>
          {(["normal", "dyslexia"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setReadingMode(mode)}
              className={`px-2.5 py-1 text-xs rounded-lg border ${readingMode === mode ? "bg-indigo-500/60 border-indigo-300 text-white" : "bg-slate-700/70 border-slate-500 text-slate-200"}`}
            >
              {mode === "normal" ? "📘 Normal" : "🔤 Dyslexia"}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-white/20 bg-black/20 px-2 py-1">
          <span className="text-[11px] text-slate-300">Theme</span>
          {(["dark", "light"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setThemeMode(mode)}
              className={`px-2.5 py-1 text-xs rounded-lg border ${themeMode === mode ? "bg-amber-500/60 border-amber-300 text-white" : "bg-slate-700/70 border-slate-500 text-slate-200"}`}
            >
              {mode === "dark" ? "🌙 Dark" : "☀️ Light"}
            </button>
          ))}
        </div>

        {/* 🔐 Auth status / control */}
        <div className="flex items-center gap-2">
          {user ? (
            <>
              <span className="text-xs opacity-80">
                {user.displayName || user.email || "Signed in"}
              </span>
              <button
                onClick={() => signOutUser()}
                className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600"
              >
                Sign out
              </button>
            </>
          ) : (
            <span className="text-xs opacity-60">Not signed in</span>
          )}
        </div>

        {/* Library */}
        <button
          onClick={() => setShowLibrary(true)}
          className="text-xs px-3 py-1 rounded bg-yellow-500 text-black shadow"
        >
          📚 Library
        </button>

        {/* Chapter Absorption Pipeline Control (feature-flagged) */}
        {isFeatureEnabled('ENABLE_CHAPTER_ABSORPTION') && smartTOC.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAbsorptionState(prev => ({ ...prev, showPanel: !prev.showPanel }))}
              className={`text-xs px-3 py-1 rounded transition-all ${
                absorptionState.showPanel
                  ? "bg-purple-500 text-white"
                  : "bg-gray-700 hover:bg-gray-600"
              }`}
            >
              🧠 Chapter Absorption
            </button>

            {!absorptionState.isRunning ? (
              <button
                onClick={startChapterAbsorption}
                className="text-xs px-3 py-1 rounded bg-gradient-to-r from-purple-500 to-blue-500 text-white hover:from-purple-400 hover:to-blue-400"
                title="Start processing all chapters for PDRM insights"
              >
                ▶️ Start
              </button>
            ) : (
              <button
                onClick={stopChapterAbsorption}
                className="text-xs px-3 py-1 rounded bg-red-500 hover:bg-red-400 text-white"
                title="Stop chapter processing"
              >
                ⏹️ Stop
              </button>
            )}
          </div>
        )}

      </div>
      {/* Main Content Area - Pure Views: Each view manages its own layout */}
      <div className="flex-1 overflow-hidden min-h-0">
        {/* Main Content - Pure View renders in full container */}
        <div className={`w-full h-full rounded-lg overflow-hidden ${themeMode === "dark" ? "bg-gray-800" : "bg-[#f8fafc] border border-slate-200"}`}>
          {renderContent()}
        </div>
      </div>
      {focusState.running && (
        <div className="pointer-events-none fixed inset-0 z-30 border-2 border-purple-400/60 shadow-[inset_0_0_120px_rgba(88,28,135,0.35)]">
          <div className="absolute top-24 right-4 rounded-lg bg-purple-900/80 px-3 py-2 text-xs text-purple-100">
            Focus Mode active • {focusModeLabel} • Integrity: {focusIntegrity}
          </div>
        </div>
      )}
      {showAmbientPanel && ambientUrl && <AmbientPlayer url={ambientUrl} onClose={() => setShowAmbientPanel(false)} />}


        {/* Utility Rail — docked to left panel bottom-left; never overlaps right panel study content */}
        {/* Legend removed: canonical Highlight Key is in PureReaderView left sidebar */}
        <div className="fixed bottom-[80px] left-4 z-40 flex flex-col gap-3 max-w-[160px] opacity-90">
          {/* Chapter Absorption FAB (feature-flagged) */}
          {isFeatureEnabled('ENABLE_CHAPTER_ABSORPTION') && smartTOC.length > 0 && !absorptionState.showPanel && (
            <button
              onClick={() => setAbsorptionState(prev => ({ ...prev, showPanel: true }))}
              className={`p-3 rounded-2xl shadow-lg backdrop-blur-xl border transition-all transform hover:-translate-y-0.5 active:scale-95 duration-150 ${
                absorptionState.isRunning
                  ? "bg-gradient-to-r from-orange-600 to-red-600 border-orange-400 animate-pulse"
                  : "bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 border-purple-400"
              } text-white`}
              title="Chapter Absorption Pipeline"
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">🧠</span>
                <span className="text-sm font-medium hidden sm:block">
                  {absorptionState.isRunning ? 'Processing...' : 'Absorption'}
                </span>
              </div>
            </button>
          )}


          {/* Read Selection — starts study-speech playback from the active LeftPanel
              text selection, connecting selection -> speech tracking (P4). Falls back
              to the active LeftPanel thought-unit (focusedEvidenceId) when nothing is
              currently selected, so Speech always has something concrete to read. */}
          {(() => {
            const liveSelection = sel.selectionText?.trim() ?? "";
            const activeThoughtUnitText = !liveSelection && focusedEvidenceId
              ? (finalHighlightAnchors as { evidenceRefId?: string; text?: string }[]).find(
                  (a) => a.evidenceRefId === focusedEvidenceId,
                )?.text ?? ""
              : "";
            const readSnippet = liveSelection || activeThoughtUnitText;
            if (!readSnippet) return null;
            return (
              <button
                onClick={() => {
                  focusEvidence(readSnippet);
                  speechPanelRef.current?.playFromSnippet(readSnippet);
                }}
                className="text-white p-3 rounded-2xl shadow-lg backdrop-blur-xl border border-white/20 transition-all transform hover:-translate-y-0.5 active:scale-95 duration-150 bg-[rgba(30,40,70,0.55)] hover:bg-[rgba(60,80,140,0.7)]"
                title={liveSelection ? "Read Selection — start speech playback from the selected text" : "Read This — start speech playback from the active thought-unit"}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">🔊</span>
                  <span className="text-sm font-medium hidden sm:block">{liveSelection ? "Read Selection" : "Read This"}</span>
                </div>
              </button>
            );
          })()}

        </div>

        {/* LeftPanel highlight diagnostics — dev-only (NEXT_PUBLIC_DEBUG_READER=true).
            Surfaces the grounding/confidence data groundHighlightAnchors already
            computes (lib/highlights/groundHighlightAnchors.ts) but previously only
            logged to console. */}
        {process.env.NEXT_PUBLIC_DEBUG_READER === "true" && highlightDiagnostics && (
          <div
            style={{
              position: "fixed",
              bottom: 16,
              left: 192,
              zIndex: 40,
              maxWidth: 320,
              fontSize: 9,
              fontFamily: "monospace",
              background: "rgba(0,200,255,0.04)",
              border: "1px solid rgba(0,200,255,0.12)",
              borderRadius: 6,
              padding: "6px 10px",
              color: "#7dd3fc",
              lineHeight: 1.7,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {[
              `── LEFTPANEL HIGHLIGHT DIAGNOSTICS (p.${highlightDiagnostics.page}) ──`,
              `requested: ${highlightDiagnostics.requestedCount} | grounded: ${highlightDiagnostics.groundedCount} | failed: ${highlightDiagnostics.failedCount}`,
              ...highlightDiagnostics.anchors.map((a, i) =>
                `[${i}] ${a.role} (${a.sourceField ?? "—"}) conf=${a.confidence.toFixed(2)} via=${a.groundMethod} words=${a.matchedLength} id=${a.evidenceRefId ?? "—"}`
              ),
            ].join("\n")}
          </div>
        )}

      {/* Chapter Absorption Pipeline Panel (feature-flagged) */}
      {isFeatureEnabled('ENABLE_CHAPTER_ABSORPTION') && absorptionState.showPanel && (
        <div className="fixed top-0 right-0 w-full sm:w-[520px] h-full bg-gray-900/95 backdrop-blur-md text-white z-50 flex flex-col shadow-2xl border-l border-gray-700">
          <div className="flex justify-between items-center p-4 border-b border-gray-700">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🧠</span>
              <div>
                <h3 className="text-lg font-semibold">Chapter Absorption Pipeline</h3>
                <p className="text-sm text-gray-400">AI-powered PDRM generation for entire books</p>
              </div>
            </div>
            <button
              onClick={() => setAbsorptionState(prev => ({ ...prev, showPanel: false }))}
              className="text-gray-400 hover:text-white transition-colors p-2 rounded-lg hover:bg-gray-800"
            >
              ✕
            </button>
          </div>
          
          <div className="flex-1 overflow-auto p-4 space-y-4">
            {/* Pipeline Status */}
            <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/50">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-gray-300">Processing Status</h4>
                <div className={`text-xs px-2 py-1 rounded ${
                  absorptionState.isRunning 
                    ? "bg-orange-600/30 text-orange-300" 
                    : "bg-green-600/30 text-green-300"
                }`}>
                  {absorptionState.isRunning ? 'Running' : 'Idle'}
                </div>
              </div>
              
              {absorptionState.progress && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Progress:</span>
                    <span className="text-white">
                      {absorptionState.progress.processed} / {absorptionState.progress.total}
                    </span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-2">
                    <div 
                      className="bg-gradient-to-r from-purple-500 to-blue-500 h-2 rounded-full transition-all"
                      style={{ 
                        width: `${(absorptionState.progress.processed / absorptionState.progress.total) * 100}%` 
                      }}
                    />
                  </div>
                  <div className="text-sm text-gray-400">
                    Current: {absorptionState.progress.currentChapter}
                  </div>
                </div>
              )}
            </div>

            {/* Control Buttons */}
            <div className="flex gap-3">
              {!absorptionState.isRunning ? (
                <button
                  onClick={startChapterAbsorption}
                  className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white px-4 py-3 rounded-lg font-medium transition-all flex items-center justify-center gap-2"
                >
                  <span>▶️</span>
                  <span>Start Absorption</span>
                </button>
              ) : (
                <button
                  onClick={stopChapterAbsorption}
                  className="flex-1 bg-red-600 hover:bg-red-500 text-white px-4 py-3 rounded-lg font-medium transition-all flex items-center justify-center gap-2"
                >
                  <span>⏹️</span>
                  <span>Stop Processing</span>
                </button>
              )}
              
              <button
                onClick={clearAbsorptionCache}
                className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-3 rounded-lg font-medium transition-all"
                title="Clear cached results"
              >
                🗑️
              </button>
            </div>

            {/* Processing Queue */}
            {absorptionState.processingQueue.length > 0 && (
              <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/50">
                <h4 className="text-sm font-medium text-gray-300 mb-3">Processing Queue</h4>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {absorptionState.processingQueue.map((progress, index) => (
                    <div key={progress.chapterId} className="flex items-center justify-between text-sm">
                      <div className="flex-1 min-w-0">
                        <div className="truncate text-white">{progress.title}</div>
                        <div className="text-xs text-gray-400">{progress.currentStep}</div>
                      </div>
                      <div className="flex items-center gap-2 ml-2">
                        <div className="w-16 bg-gray-700 rounded-full h-1.5">
                          <div 
                            className={`h-1.5 rounded-full transition-all ${
                              progress.status === 'complete' ? 'bg-green-500' :
                              progress.status === 'error' ? 'bg-red-500' :
                              'bg-blue-500'
                            }`}
                            style={{ width: `${progress.progress * 100}%` }}
                          />
                        </div>
                        <span className="text-xs w-8 text-right">
                          {Math.round(progress.progress * 100)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Results Summary */}
            {absorptionState.results.length > 0 && (
              <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/50">
                <h4 className="text-sm font-medium text-gray-300 mb-3">Results Summary</h4>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Total Processed:</span>
                    <span className="text-white">{absorptionState.results.length}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Successful:</span>
                    <span className="text-green-400">
                      {absorptionState.results.filter(r => r.success).length}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Failed:</span>
                    <span className="text-red-400">
                      {absorptionState.results.filter(r => !r.success).length}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Avg Processing Time:</span>
                    <span className="text-white">
                      {absorptionState.results.length > 0 
                        ? Math.round(absorptionState.results.reduce((sum, r) => sum + r.processingTime, 0) / absorptionState.results.length)
                        : 0}ms
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Smart TOC Preview */}
            {smartTOC.length > 0 && (
              <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/50">
                <h4 className="text-sm font-medium text-gray-300 mb-3">Chapters ({smartTOC.length})</h4>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {smartTOC.map((chapter, index) => (
                    <div key={chapter.id} className="flex items-center justify-between text-sm">
                      <div className="flex-1 min-w-0">
                        <div className="truncate text-white">{chapter.title}</div>
                        <div className="text-xs text-gray-400">Page {chapter.pageNumber}</div>
                      </div>
                      <div className={`text-xs px-2 py-1 rounded ${
                        chapter.isProcessed 
                          ? "bg-green-600/30 text-green-300" 
                          : "bg-gray-600/30 text-gray-400"
                      }`}>
                        {chapter.isProcessed ? 'Processed' : 'Pending'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Centered Whiteboard Modal */}
      {showWhiteboardPanel && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{
            background: professorAutoStart && professorSurface === "pdf" ? "transparent" : "rgba(0,0,0,0.78)",
            pointerEvents: professorAutoStart && professorSurface === "pdf" ? "none" : "auto",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) closeProfessorWhiteboard(); }}
        >
          {professorAutoStart && professorSurface === "pdf" && (
            <div
              style={{ position: "fixed", right: 22, bottom: 22, pointerEvents: "auto", display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 999, background: "rgba(15,23,42,0.94)", border: "1px solid rgba(129,140,248,0.4)", color: "#c7d2fe", boxShadow: "0 12px 32px rgba(0,0,0,0.35)" }}
            >
              <span style={{ fontSize: 11, fontWeight: 700 }}>Professor is following the PDF</span>
              <button
                type="button"
                onClick={closeProfessorWhiteboard}
                style={{ border: 0, borderRadius: 999, padding: "4px 8px", background: "rgba(255,255,255,0.08)", color: "#e2e8f0", fontSize: 10, cursor: "pointer" }}
              >
                Stop
              </button>
            </div>
          )}
          {(DEV && console.log("[WHITEBOARD_CENTERED_MODAL]", {
            page: currentPage,
            hasStudyModel: !!currentPageStudyModel,
            pageTextChars: (pageTextByPage.get(`${bookId}:${currentPage}`) ?? "").length,
          }) as any) && null}
          <div
            className="relative bg-[#0d1424] text-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-700/60"
            style={{
              width: "min(94vw, 1120px)", height: "min(88vh, 740px)",
              opacity: professorAutoStart && professorSurface === "pdf" ? 0 : 1,
              pointerEvents: professorAutoStart && professorSurface === "pdf" ? "none" : "auto",
              transition: "opacity 220ms ease",
            }}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700/60 shrink-0">
              <span className="text-sm font-semibold tracking-wide text-gray-200">{professorAutoStart ? "Professor" : "Whiteboard"}</span>
              <button
                onClick={closeProfessorWhiteboard}
                className="text-gray-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-gray-700/60 text-lg leading-none"
                aria-label="Close whiteboard"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-auto p-5">
              {(DEV && console.log("[WHITEBOARD_SOURCE]", {
                page: currentPage,
                bookId,
                thoughtUnitId: activeCanonicalThoughtUnit?.id ?? null,
                source: activeCanonicalThoughtUnit?.source ?? (wbConcept ? "selected/focused anchor text" : "page-level fallback"),
                sourceText: (activeCanonicalThoughtUnit?.exactText ?? wbContext ?? wbConcept ?? "").slice(0, 80),
                fallbackUsed: !activeCanonicalThoughtUnit,
                pageTextChars: (pageTextByPage.get(`${bookId}:${currentPage}`) ?? "").length,
              }) as any) && null}
              {/* Phase B3-4: a render crash inside the Professor Whiteboard
                  (TldrawCanvas/tldraw itself) must not take down the whole
                  Reader page underneath it. resetKeys ties the boundary to
                  the current document+page identity — navigating to a
                  different document/page always rebuilds fresh from that
                  identity rather than staying wedged on a stale error, the
                  same way the WhiteboardPanel key prop below already forces
                  a fresh mount per page. onError logs only structural,
                  privacy-safe diagnostics (ids/counts/error name+message),
                  never page content. */}
              <ErrorBoundary
                resetKeys={[resolvedDocumentId ?? bookId ?? "", pageTruthKey ?? "", currentPage ?? 0]}
                onError={(error) => console.error("🖍️ WhiteboardPanel Error:", {
                  message: error.message,
                  name: error.name,
                  bookId,
                  currentPage,
                  pageTruthKey,
                })}
              >
                <WhiteboardPanel
                  key={`wb-${resolvedDocumentId ?? "document"}-p${currentPage}-${pageTruthKey}-${wbConcept ? "vis" : "page"}`}
                  concept={activeCanonicalThoughtUnit?.title || wbConcept || ""}
                  context={activeCanonicalThoughtUnit?.exactText || wbContext || wbConcept || ""}
                  studyModel={currentPageStudyModel as any}
                  pageText={pageTextByPage.get(`${bookId}:${currentPage}`) ?? ""}
                  lessonTitle={uploadedFile?.name ?? "Page Whiteboard"}
                  currentPage={currentPage}
                  pageTruthKey={pageTruthKey}
                  pageTeachingType={surgeonAnnotations.plan?.pageRole ?? null}
                  autoStartProfessor={professorAutoStart}
                  onProfessorSurfaceChange={(surface) => setProfessorSurface(surface)}
                  onAnchorStep={(id) => {
                    DEV && console.log("[WHITEBOARD_ANCHOR_STEP]", { anchorId: id });
                    setFocusedEvidenceId(id);
                  }}
                  activeAnchorId={focusedEvidenceId}
                  bookId={bookId}
                  resolvedDocumentId={resolvedDocumentId}
                  bookTitle={uploadedFile?.name}
                  // SurgeonAnnotationPlan.pageThesis is authoritative — it's the same
                  // shared page-understanding pass that also drives highlighting and
                  // pageTeachingType. currentPageStudyModel comes from a separate
                  // synthesis pipeline that reads the page independently, so it is
                  // deliberately not a title fallback here.
                  pageTitle={surgeonAnnotations.plan?.pageThesis ?? null}
                  knowledgeNodeId={pageKgNodeIdRef.current}
                  onOpenChiefResident={handleOpenChiefResident}
                  whiteboardGrammar={activePack.whiteboardGrammar}
                  canonicalEntries={whiteboardCanonicalEntries}
                  canonicalStatus={surgeonAnnotations.status}
                  onReanalyzeCanonical={surgeonAnnotations.reanalyze}
                />
              </ErrorBoundary>
            </div>
          </div>
        </div>
      )}

      {/* Library Drawer (guest + auth) */}
      {showLibrary && (
        <div className="fixed top-0 right-0 w-80 h-full bg-gray-800 text-white shadow-lg z-50 p-4 flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold">My Library</h2>
            <button onClick={() => setShowLibrary(false)}>✖</button>
          </div>

          {!user && (
            <div className="mb-3 text-xs text-yellow-300">
              Guest mode: uploads are stored in your browser. Books persist across sessions on this device.
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {pdfLibrary.length === 0 ? (
              <p className="text-sm text-gray-400">No PDFs yet.</p>
            ) : (
              pdfLibrary.map((pdf) => (
                <div
                  key={pdf.id}
                  className="flex justify-between items-center mb-2 p-2 hover:bg-gray-700 rounded"
                >
                  <span onClick={() => handleLoadPDF(pdf.url, pdf.name, pdf.localDocumentId)} className="cursor-pointer">
                    {pdf.name}
                  </span>
                  <button
                    onClick={() => handleDeletePDF(pdf.id, pdf.name, pdf.isLocal, pdf.localDocumentId)}
                    className={`${
                      pdf.isLocal || (firebaseConnected && user)
                        ? "text-red-400 hover:text-red-200"
                        : "opacity-40 cursor-not-allowed"
                    }`}
                    disabled={!pdf.isLocal && !(firebaseConnected && user)}
                    title={
                      !pdf.isLocal && !(firebaseConnected && user)
                        ? "Delete requires sign-in"
                        : "Delete"
                    }
                  >
                    🗑
                  </button>
                </div>
              ))
            )}
          </div>

          <label className="mt-4 block bg-yellow-500 text-black text-center py-2 rounded cursor-pointer">
            ➕ Upload PDF
            <input type="file" accept="application/pdf" onChange={handleUpload} className="hidden" />
          </label>
        </div>
      )}

      {/* Explain This Step — contextual chatbox for the active selection */}
      {explainStepContext && (
        <ExplainStepChat
          context={explainStepContext}
          onClose={() => setExplainStepContext(null)}
          onSaveNote={handleExplainStepSaveNote}
          onCreateRecallCard={handleExplainStepCreateRecallCard}
          onAddToStudyGuide={handleExplainStepAddToStudyGuide}
          initialTurns={explainStepTurnsRef.current.get(
            `${bookId}:${explainStepContext.pageNumber}:${explainStepContext.selectedText}`
          )}
          onTurnsChange={(turns) =>
            explainStepTurnsRef.current.set(
              `${bookId}:${explainStepContext.pageNumber}:${explainStepContext.selectedText}`,
              turns
            )
          }
          onVisualize={({ selectedText, explanation, pageContext }) => {
            const concept = selectedText || explanation;
            const context = [explanation, pageContext].filter(Boolean).join("\n\n");
            DEV && console.log("[EXPLAIN_STEP_VISUALIZE]", {
              page: explainStepContext.pageNumber,
              conceptChars: concept.length,
              contextChars: context.length,
            });
            setWbConcept(truncate(concept, 600));
            setWbContext(truncate(context, 1200));
            setExplainStepContext(null);
            setShowWhiteboardPanel(true);
          }}
        />
      )}

      {/* Explain It — office-hours-style conversation about the current page/topic */}
      {explainItContext && (
        <ExplainItChat
          context={explainItContext}
          onClose={() => setExplainItContext(null)}
          initialTurns={explainItTurnsRef.current.get(`${bookId}:${explainItContext.pageNumber}`)}
          onTurnsChange={(turns) =>
            explainItTurnsRef.current.set(`${bookId}:${explainItContext.pageNumber}`, turns)
          }
          onTurnIntoPodcast={handleExplainItTurnIntoPodcast}
        />
      )}

      {/* Chief Resident — Reader entry point. ChiefResidentModalShell is a thin
          modal chrome (backdrop, header, close button) with no teaching UI or
          generation logic of its own — it renders the SAME
          components/notelab/ChiefResidentPanel.tsx NoteLab uses, one shared
          component/prompt-contract/context-builder for both entry points. */}
      {showChiefResident && (
        <ChiefResidentModalShell
          onClose={() => setShowChiefResident(false)}
          studyModel={currentPageStudyModel}
          pageText={pageTextByPage.get(`${bookId}:${currentPage}`) ?? ""}
          bookId={bookId}
          currentPage={currentPage}
          pageTruthKey={pageTruthKey}
          bookTitle={uploadedFile?.name}
          activeNote={null}
          onRecallSaved={(setId) => { setLastRecallSetId(setId); setRecallLabRefreshKey(k => k + 1); }}
        />
      )}

      {/* PDF right-click context menu */}
      {pdfContextMenu && (
        <PdfContextMenu
          x={pdfContextMenu.x}
          y={pdfContextMenu.y}
          onClose={() => setPdfContextMenu(null)}
          items={[
            {
              icon: "🩺",
              label: "Ask Chief Resident",
              onClick: () => { setPdfContextMenu(null); handleOpenChiefResident(); },
            },
            {
              icon: "🎨",
              label: "Open Whiteboard",
              onClick: () => { setPdfContextMenu(null); handleOpenWhiteboardPanel(); },
            },
          ]}
        />
      )}

      {showLinkModal && (
        <LinkVideoModal
          onClose={() => setShowLinkModal(false)}
          onSave={(url) => {
            setAttachments((prev) => [...prev, url]);
            DEV && console.log("📎 Link attached:", url);
            setShowLinkModal(false);
          }}
        />
      )}

      {/* ── Focus Cycle — fixed pill + popup, centered at top, floats above everything ── */}
      {/* Pill: always visible when reader is active, centered horizontally, just below toolbar */}
      <div
        style={{ position: "fixed", top: 88, left: "50%", transform: "translateX(-50%)", zIndex: 60 }}
      >
        <button
          onClick={() => setShowFocusControls((v) => !v)}
          style={{
            borderRadius: 999,
            border: `1px solid ${focusState.mode === "focus" ? "rgba(196,181,253,0.4)" : "rgba(110,231,183,0.4)"}`,
            background: focusState.mode === "focus" ? "rgba(109,40,217,0.35)" : "rgba(16,185,129,0.25)",
            color: focusState.mode === "focus" ? "#ede9fe" : "#d1fae5",
            padding: "6px 18px",
            fontSize: 13,
            fontWeight: 600,
            backdropFilter: "blur(10px)",
            boxShadow: "0 0 20px rgba(139,92,246,0.25)",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {focusModeLabel} — <span style={{ fontFamily: "monospace" }}>{String(Math.floor(focusState.time / 60)).padStart(2, "0")}:{String(focusState.time % 60).padStart(2, "0")}</span>
          <span style={{ marginLeft: 8, fontSize: 10, opacity: 0.5 }}>{showFocusControls ? "▲" : "▼"}</span>
        </button>
      </div>

      {/* Popup: rendered as a SIBLING of the pill — NOT nested inside the pill
          wrapper. The pill wrapper has transform:translateX(-50%), and a transform
          ancestor becomes the containing block for position:fixed descendants,
          which previously shrank this popup to a tiny bar. As a top-level sibling
          its position:fixed resolves against the viewport. */}
      {showFocusControls && (
        <>
          {/* click-catcher to close on outside click */}
          <div
            onClick={() => setShowFocusControls(false)}
            style={{ position: "fixed", inset: 0, zIndex: 190 }}
          />
          <div
            style={{
              position: "fixed",
              top: 156,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 200,
              width: 300,
              borderRadius: 16,
              border: "1px solid rgba(167,139,250,0.25)",
              background: "rgba(15,15,25,0.97)",
              backdropFilter: "blur(16px)",
              boxShadow: "0 8px 40px rgba(0,0,0,0.7)",
              padding: 20,
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            {/* Header row */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: focusState.mode === "focus" ? "#c4b5fd" : "#6ee7b7" }}>
                {focusModeLabel} — <span style={{ fontFamily: "monospace", color: "#fff" }}>{String(Math.floor(focusState.time / 60)).padStart(2, "0")}:{String(focusState.time % 60).padStart(2, "0")}</span>
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 10, color: "#64748b" }}>{focusIntegrity}</span>
                <button
                  onClick={() => setShowFocusControls(false)}
                  style={{ fontSize: 14, color: "#64748b", background: "none", border: "none", cursor: "pointer", lineHeight: 1, padding: "0 2px" }}
                >✕</button>
              </div>
            </div>

            {/* Start / Pause · Reset · Full Screen */}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setFocusState((prev) => ({ ...prev, running: !prev.running }))}
                style={{ flex: 1, borderRadius: 8, padding: "8px 0", fontSize: 13, fontWeight: 600, background: focusState.running ? "#334155" : "#7c3aed", color: "#fff", border: "none", cursor: "pointer" }}
              >
                {focusState.running ? "Pause" : "Start"}
              </button>
              <button
                onClick={() => { setCycleCount(0); setFocusInterruptions(0); setFocusInterruptionLabel(null); setFocusState({ mode: "focus", time: focusSettings.focus, running: false }); setSessionPagesVisited(new Set()); setSessionNotesCount(0); setSessionCardsCount(0); }}
                style={{ borderRadius: 8, padding: "8px 12px", fontSize: 13, background: "#1e293b", color: "#cbd5e1", border: "none", cursor: "pointer" }}
              >
                Reset
              </button>
              <button
                onClick={() => document.documentElement.requestFullscreen?.()}
                title="Full Screen"
                style={{ borderRadius: 8, padding: "8px 12px", fontSize: 13, background: "#1e293b", color: "#cbd5e1", border: "none", cursor: "pointer" }}
              >
                ⛶
              </button>
            </div>

            {/* Soft lock */}
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={focusSoftLock} onChange={(e) => setFocusSoftLock(e.target.checked)} style={{ accentColor: "#a78bfa" }} />
              <span style={{ fontSize: 12, color: "#94a3b8" }}>Soft lock (block tab-switch while running)</span>
            </label>

            {/* Duration inputs */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {([
                { label: "Focus min", key: "focus" as const, min: 1, fallback: 25 },
                { label: "Break min", key: "shortBreak" as const, min: 1, fallback: 5 },
                { label: "Long min", key: "longBreak" as const, min: 1, fallback: 15 },
              ] as const).map(({ label, key, min, fallback }) => (
                <label key={key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 10, color: "#64748b" }}>{label}</span>
                  <input
                    type="number"
                    value={Math.round(focusSettings[key] / 60)}
                    onChange={(e) => setFocusSettings((prev) => ({ ...prev, [key]: Math.max(min, Number(e.target.value || fallback)) * 60 }))}
                    style={{ width: "100%", borderRadius: 6, background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.08)", padding: "4px 6px", fontSize: 12, color: "#fff", textAlign: "center" }}
                  />
                </label>
              ))}
            </div>

            {/* Ambient / YouTube */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 10, color: "#64748b" }}>Ambient / Lo-fi YouTube URL</span>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={ambientUrl}
                  onChange={(e) => setAmbientUrl(e.target.value)}
                  placeholder="https://youtube.com/watch?v=…"
                  style={{ flex: 1, minWidth: 0, borderRadius: 8, background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.08)", padding: "5px 8px", fontSize: 11, color: "#fff" }}
                />
                <button
                  onClick={() => setShowAmbientPanel((prev) => !prev)}
                  disabled={!ambientEmbedUrl}
                  style={{ borderRadius: 8, padding: "5px 12px", fontSize: 12, background: "#065f46", color: "#fff", border: "none", cursor: ambientEmbedUrl ? "pointer" : "not-allowed", opacity: ambientEmbedUrl ? 1 : 0.4 }}
                >
                  {showAmbientPanel ? "Hide" : "Play"}
                </button>
              </div>
            </div>

            {/* Interruption label */}
            {focusInterruptionLabel && (
              <div style={{ fontSize: 11, color: "#fbbf24", textAlign: "center" }}>{focusInterruptionLabel}</div>
            )}
          </div>
        </>
      )}

      {/* Focus Cycle — Session Summary Modal */}
      {showSessionSummary && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-80 rounded-2xl border border-purple-300/30 bg-gray-900/98 shadow-2xl p-6 flex flex-col gap-4">
            <div className="text-center">
              <div className="text-2xl mb-1">🎯</div>
              <h2 className="text-base font-bold text-white">Focus Session Complete</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">{Math.round(focusSettings.focus / 60)} min · {focusIntegrity}</p>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-white/5 p-2">
                <div className="text-xl font-bold text-purple-300">{sessionPagesVisited.size}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">Pages<br/>studied</div>
              </div>
              <div className="rounded-lg bg-white/5 p-2">
                <div className="text-xl font-bold text-emerald-300">{sessionNotesCount}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">Notes<br/>saved</div>
              </div>
              <div className="rounded-lg bg-white/5 p-2">
                <div className="text-xl font-bold text-amber-300">{sessionCardsCount}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">Recall<br/>cards</div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    sendCurrentPageToNoteLab();
                    setShowSessionSummary(false);
                    trySwitchShellTab("notelab", "notelab");
                  }}
                  disabled={!currentPageStudyModel || (currentPageStudyModel.conceptBlocks?.length ?? 0) === 0}
                  className="rounded-lg py-2 text-xs font-semibold bg-emerald-700/80 hover:bg-emerald-600/80 disabled:opacity-40 text-white transition-colors"
                >
                  Save to NoteLab
                </button>
                <button
                  onClick={() => {
                    sendCurrentPageToRecallLab();
                    setShowSessionSummary(false);
                    trySwitchShellTab("study", "study");
                  }}
                  disabled={!currentPageStudyModel || (currentPageStudyModel.conceptBlocks?.length ?? 0) === 0}
                  className="rounded-lg py-2 text-xs font-semibold bg-amber-700/80 hover:bg-amber-600/80 disabled:opacity-40 text-white transition-colors"
                >
                  Save to Recall Lab
                </button>
              </div>
              <button
                onClick={() => {
                  setShowSessionSummary(false);
                  const isLong = cycleCount % 4 === 0;
                  setFocusState({ mode: isLong ? "long_break" : "short_break", time: isLong ? focusSettings.longBreak : focusSettings.shortBreak, running: true });
                }}
                className="rounded-lg py-2 text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white transition-colors"
              >
                Take a Break
              </button>
              <button
                onClick={() => setShowSessionSummary(false)}
                className="rounded-lg py-1.5 text-xs text-slate-400 hover:text-white transition-colors"
              >
                End Session
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
