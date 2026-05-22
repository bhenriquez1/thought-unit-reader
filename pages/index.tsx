// pages/index.tsx
import dynamic from "next/dynamic";
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
import NoteLabView from "@/components/NoteLabView";
import CleanHybridReader from "@/components/CleanHybridReader";
import HighlightPopup from "@/components/HighlightPopup";
import LinkVideoModal from "@/components/LinkVideoModal";
import HighlightActionMenu from "@/components/HighlightActionMenu";
import NotesList from "@/components/NotesList";

// Integrated components
import SurgeonView from "@/components/SurgeonView";
import NoteLabViewEnhanced from "@/components/NoteLabViewEnhanced";
import StudySessionPanel from "@/components/StudySessionPanel";
import MemoCardsStudyPanel from "@/components/MemoCardsStudyPanel";
import TocTree from "@/components/toc/TocTree";
import SyllabusUploadPanel from "@/components/syllabus/SyllabusUploadPanel";
import SyllabusStudyLauncher from "@/components/study/SyllabusStudyLauncher";
import UnderConstructionPanel from "@/components/UnderConstructionPanel";

// Pure View components (Strict Mode Separation - V1)
import PureReaderView from "@/components/PureReaderView";
import PureTocView from "@/components/PureTocView";
import PureSurgeonView from "@/components/PureSurgeonView";
import PureNoteLabView from "@/components/PureNoteLabView";
import FocusCycleCard from "@/components/FocusCycleCard";
import { RightPanel } from "@/components/reader/RightPanel";
import type { ActivePageContext, RightPanelState as UnifiedRightPanelState, TocNode } from "@/lib/readerContracts";
import { splitParagraphs } from "@/lib/textNormalize";
import { buildAutoToc, type PageTextBundle } from "@/lib/autoToc";
import { extractFormulaCards } from "@/lib/right-panel/formulaNormalizer";
import { useActivePageIntelligence } from "@/lib/useActivePageIntelligence";
import ErrorBoundary from "@/components/ErrorBoundary";
import { buildGuidedLegend } from "@/lib/highlights/buildGuidedLegend";
import type { RenderGuidedReadingPathResult } from "@/lib/highlights/renderGuidedReadingPath";

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
  WhiteboardOverlay,
  useRelationshipStore,
} from "@/components/surgeonView2";
import type { SourceRef } from "@/lib/page-intelligence";

// Store imports
import { useTocStore } from "@/lib/stores/tocStore";
import { useZoomStore } from "@/lib/stores/zoomStore";
import { usePdrmStore } from "@/lib/stores/pdrmStore";
import { useInsightsPanelStore } from "@/lib/stores/insightsPanelStore";
import { useHighlightStore } from "@/lib/stores/highlightStore";
import { useFocusCycleStore } from "@/lib/stores/focusCycleStore";
import { extractParagraphBlocks, findBestMatchingBlock } from "@/lib/paragraphMap";
import {
  DEFAULT_RIGHT_PANEL_STATE,
  buildCurrentPageVersion,
  type RightPanelState,
  type RightPanelTab,
} from "@/state/rightPanelState";
import type { WorkspaceMode } from "@/types/workspace";

import {
  firebaseConnected,
  uploadPDF,
  getPDFLibrary,
  deletePDF,
  listenForAuthChanges,
  signInWithGoogle,
  signOutUser,
  handleRedirectResult,
} from "@/lib/firebase";

import LibraryPanel from "@/components/LibraryPanel";
import ChunkRail from "@/components/ChunkRail";
import { MultiViewContainer } from "@/components/ViewContainer";
import { useReaderSync, stableChunkId, analyzeContentDensity } from "@/lib/readerSync";
import { useUnifiedNavigation } from "@/lib/useUnifiedNavigation";
import ShadowRecallPanel from "@/components/ShadowRecallPanel";
import AmbientPlayer from "@/components/focus/AmbientPlayer";

import {
  parseBookWithChapters,
  detectWhiteboardSections,
  containsDiagramOrFormula,
} from "@/lib/parser";

import { usePdfSelection } from "@/hooks/usePdfSelection";
import summarizeText from "@/lib/aiSummary";
import { generateMnemonic } from "@/lib/mnemonicAI";
import { noteLabButlerIntegration, type PDRMButlerNote } from "@/lib/noteLabButlerIntegration";
import { 
  ChapterAbsorptionPipeline, 
  createChapterAbsorptionPipeline,
  extractChapterTextFromPDFPages,
  type ProcessingProgress,
  type AbsorptionResult,
  type ChapterAbsorptionConfig
} from "@/lib/chapterAbsorptionPipeline";
import { type SmartTOCEntry } from "@/lib/tocParser";

// Lazy-load to keep SSR clean with performance optimizations
const SmartPDFViewer = dynamic(() => import("@/components/SmartPDFViewer"), { ssr: false });
const PatternTrainingHybridReader = dynamic(() => import("@/components/PatternTrainingHybridReader"), { ssr: false });
const NoteLabHybridReader = dynamic(() => import("@/components/NoteLabHybridReader"), { ssr: false });
const OptimizedPatternView = dynamic(() => import("@/components/OptimizedPatternView"), { ssr: false });
const OptimizedNoteLabView = dynamic(() => import("@/components/OptimizedNoteLabView"), { ssr: false });
const UltraNotesList = dynamic(() => import("@/components/notelab/UltraNotesList"), { ssr: false });
const RecallLab = dynamic(() => import("@/components/recalllab/RecallLab"), { ssr: false });

type StickyNote = { pageNumber: number; content: string };

/* ----------------------- helpers ----------------------- */
function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
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
    console.log(`🔄 Global sync state changed: page=${page}, unit=${unitIndex}, chunk=${activeChunkId}, source=${lastUpdateSource}`);
    console.log("[TRACE pageSync]", {
      source: `globalSync:${lastUpdateSource}`,
      documentId: bookId,
      visiblePage: page,
      currentPage,
      currentThoughtUnit,
      pageTextWords: (pageTextByPage.get(`${bookId}:${currentPage}`) || "").split(/\s+/).filter(Boolean).length,
    });

    // Hard gate: never process observer callbacks during page hydration
    if (navLockRef.current) {
      console.log(`🔒 navLock active – ignoring sync update from source=${lastUpdateSource}`);
      return;
    }

    const isScrollDriven = lastUpdateSource === 'pdf' || lastUpdateSource === 'progressive' || lastUpdateSource === 'hybrid';

    // When Follow Scroll is OFF, only manual/toc sources are allowed to drive page changes
    if (isScrollDriven && !followScroll) {
      console.log(`🚫 Follow Scroll OFF – suppressing scroll-driven page update (source=${lastUpdateSource})`);
      return;
    }

    // Cooldown: ignore scroll-driven updates within 650 ms of the last user navigation
    if (isScrollDriven && Date.now() - lastUserNavAtRef.current < 650) {
      console.log(`⏳ User nav cooldown – suppressing scroll-driven update (${Date.now() - lastUserNavAtRef.current}ms < 650ms)`);
      return;
    }

    if (page !== currentPage) {
      console.log(`🔄 Syncing local page: ${currentPage} -> ${page}`);
      setCurrentPage(page);
    }

    if (unitIndex !== currentThoughtUnit) {
      console.log(`🔄 Syncing local unit: ${currentThoughtUnit} -> ${unitIndex}`);
      setCurrentThoughtUnit(unitIndex);
    }
  }, [page, unitIndex, activeChunkId, lastUpdateSource, followScroll]);

  /* =========================================================================
     🔹 State
  ========================================================================= */
  const [user, setUser] = useState<any>(null);
  const USER_ID = user?.uid || "guest-user";

  const [thoughtUnits, setThoughtUnits] = useState<ThoughtUnit[]>([]);
  const [currentThoughtUnit, setCurrentThoughtUnit] = useState(1);
  // Live per-page text extracted from PDF.js — keyed by "documentId:pageNumber" so two
  // different books at the same page number can never share entries.
  const [pageTextByPage, setPageTextByPage] = useState<Map<string, string>>(() => new Map());
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  const [viewMode, setViewMode] = useState<WorkspaceMode>("reader");

  // Global Zoom Store
  const { zoom, zoomIn, zoomOut, resetZoom, getZoomPercent, canZoomIn, canZoomOut } = useZoomStore();

  const [currentPage, setCurrentPage] = useState(1);
  const [pdfPageCount, setPdfPageCount] = useState(0); // Start with 0 to indicate not loaded
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
  const [syllabusFileName, setSyllabusFileName] = useState("");
  const [syllabusPages, setSyllabusPages] = useState<PageTextBundle[]>([]);
  const [syllabusToc, setSyllabusToc] = useState<TocNode[]>([]);
  const [activeShellTab, setActiveShellTab] = useState<WorkspaceMode>("reader");
  const [rightPanelResetKey, setRightPanelResetKey] = useState(0);
  const [noteLabRefreshKey, setNoteLabRefreshKey] = useState(0);
  const [recallLabRefreshKey, setRecallLabRefreshKey] = useState(0);
  const [lastRecallSetId, setLastRecallSetId] = useState<string | null>(null);
  const [focusSnippet, setFocusSnippet] = useState<string | null>(null);
  const [focusedEvidenceId, setFocusedEvidenceId] = useState<string | null>(null);
  const [guidedPath, setGuidedPath] = useState<RenderGuidedReadingPathResult | null>(null);
  const [roleLabelByConceptId, setRoleLabelByConceptId] = useState<Map<string, string>>(new Map());
  // AI-selected highlight anchors from synthesis — cleared immediately on page change.
  // Full anchor objects (not just strings) so anchorType can drive legend colors.
  const [synthAiHighlights, setSynthAiHighlights] = useState<import("@/lib/insights/synthesizeTeachingOutput").SynthHighlightAnchor[]>([]);
  // Shared typed study model — emitted by RightPanel when synthesis resolves.
  const [currentPageStudyModel, setCurrentPageStudyModel] = useState<import("@/lib/insights/currentPageStudyModel").CurrentPageStudyModel | null>(null);

  // Clear stale synthesis state immediately when the user navigates to a new page.
  useEffect(() => {
    setSynthAiHighlights([]);
    setCurrentPageStudyModel(null);
  }, [currentPage]);

  /* =========================================================================
     🔹 Unified Annotation Store (P0.1) - Shared between Surgeon View + NoteLab
  ========================================================================= */
  const {
    annotations: storeAnnotations,
    viewMode: annotationViewMode,
    pendingHighlight,
    setActiveDocument,
    setActivePage,
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
    datMode,
    insightPanel,
    openInsightPanel,
    closeInsightPanel,
    toggleExpertMode,
    toggleDATMode,
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
  const [showHighlightMenu, setShowHighlightMenu] = useState(false);
  const [highlightMenuPosition, setHighlightMenuPosition] = useState({ x: 0, y: 0 });
  const [currentSelection, setCurrentSelection] = useState<{
    text: string;
    context: any;
  } | null>(null);

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
        fontSize,
        lineSpacing,
        fileUrl,
        thoughtUnitsCount: thoughtUnits.length,
        bookId,
        timestamp: Date.now(),
      };
      
      localStorage.setItem('thoughtUnitReader_session', JSON.stringify(sessionState));
      console.log('💾 Session state saved to localStorage');
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
        console.log('⏰ Session expired, clearing...');
        localStorage.removeItem('thoughtUnitReader_session');
        return null;
      }
      
      console.log('📂 Session state restored from localStorage');
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
    if (restored) {
      setViewMode(
        ((restored.viewMode === "toc" || restored.viewMode === "syllabus" || restored.viewMode === "notelab" || restored.viewMode === "study" || restored.viewMode === "elena")
          ? restored.viewMode
          : "reader") as WorkspaceMode
      );
      setCurrentPage(restored.currentPage || 1);
      setCurrentThoughtUnit(restored.currentThoughtUnit || 1);
      setThemeMode(restored.themeMode || (restored.darkMode ? "dark" : "light") || "dark");
      setReadingMode(restored.readingMode || ((restored.fontFamily || "").includes("Comic") ? "dyslexia" : "normal"));
      setFontSize(restored.fontSize || 16);
      setLineSpacing(restored.lineSpacing || 1.5);
      // Note: fileUrl and thoughtUnits will need to be re-uploaded as we can't store large data
    }
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", themeMode === "dark");
  }, [themeMode]);

  useEffect(() => {
    setActiveShellTab(viewMode);
  }, [viewMode]);

  const [showLibrary, setShowLibrary] = useState(false);
  const [pdfLibrary, setPdfLibrary] = useState<
    { id: string; name: string; url: string; uploadedAt: any; isLocal?: boolean }[]
  >([]);

  // Attachments + modal
  const [attachments, setAttachments] = useState<string[]>([]);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [bookId, setBookId] = useState<string>("default-book");
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
    localStorage.setItem("avrrio-ambient-url", ambientUrl);
  }, [ambientUrl]);

  useEffect(() => {
    if (!focusState.running) return;
    const timer = window.setInterval(() => {
      setFocusState((prev) => {
        if (prev.time > 1) return { ...prev, time: prev.time - 1 };
        if (prev.mode === "focus") {
          const nextCycle = cycleCount + 1;
          setCycleCount(nextCycle);
          if (nextCycle % 4 === 0) return { mode: "long_break", time: focusSettings.longBreak, running: true };
          return { mode: "short_break", time: focusSettings.shortBreak, running: true };
        }
        return { mode: "focus", time: focusSettings.focus, running: true };
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [focusState.running, focusSettings, cycleCount]);

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
    const isProtected = !["reader", "toc", "syllabus"].includes(tab);
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

  const focusModeLabel = focusState.mode === "focus" ? "Focus" : focusState.mode === "short_break" ? "Short Break" : "Long Break";

  // ✅ Auto-whiteboard control + data
  const [autoWhiteboard, setAutoWhiteboard] = useState<boolean>(false);
  const [showWhiteboardPanel, setShowWhiteboardPanel] = useState<boolean>(false);
  const [wbConcept, setWbConcept] = useState<string>("");
  const [wbContext, setWbContext] = useState<string>("");
  const [wbStickyNotes, setWbStickyNotes] = useState<StickyNote[]>([]);
  const lastDetectedUnitRef = useRef<string | null>(null);

  // 📑 TOC Panel control (like whiteboard)
  const [showTOCPanel, setShowTOCPanel] = useState<boolean>(false);
  const [showFocusCycleModal, setShowFocusCycleModal] = useState(false);
  const bindFocusCycleContext = useFocusCycleStore((state) => state.bindContext);


  // 💭 Thought Detection Panel
  const [showThoughtPanel, setShowThoughtPanel] = useState<boolean>(false);
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
  const activePageTextKey = `${bookId}:${currentPage}`;
  const pageTextReady = (pageTextByPage.get(activePageTextKey) || "").length > 50;
  console.log("[TRACE PAGE BINDING]", {
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
    highlightTargets,
    highlightNeighborhoods,
    limitedEvidence,
    priorityHighlights: currentPriorityHighlights,
    normResult: currentNormResult,
    formulaSignals,
  } = useActivePageIntelligence({
    documentId: bookId,
    pageNumber: currentPage,
    ctx: activePageContextForInsights,
    pageTextReady,
    audience: unifiedPanelState.audience,
    depth: unifiedPanelState.depth,
  });
  console.log("[TRACE LIVE_WIRING]", {
    deployedCommit: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? process.env.NEXT_PUBLIC_DEPLOYED_COMMIT ?? "unknown",
    bookId,
    currentPage,
    activePageTextLength: (pageTextByPage.get(activePageTextKey) || "").length,
    pageTextReady,
    pageKind: currentNormResult?.pageKind ?? null,
    classificationReason: currentNormResult?.classificationReason ?? null,
    shouldRenderFullPanel: currentNormResult?.shouldRenderFullPanel ?? null,
    paragraphInsightsCount: (currentPageModel?.paragraphInsights ?? []).length,
    highlightNeighborhoodsCount: (highlightNeighborhoods ?? []).length,
    formulaSignals,
    pageIntelligenceStatus,
    isCurrentIntelligencePage,
  });
  const focusIntegrity = focusInterruptions === 0 ? "uninterrupted" : focusInterruptions === 1 ? "interrupted once" : "interrupted multiple times";
  const focusScore = Math.max(0, 100 - (focusInterruptions * 12));
  const focusConsistency = focusScore >= 90 ? "Strong" : focusScore >= 75 ? "Good" : "Needs recovery";
  const ambientEmbedUrl = useMemo(() => toYouTubeEmbed(ambientUrl), [ambientUrl]);
  const resolveEvidenceId = useCallback((snippet: string) => {
    const needle = snippet.toLowerCase().replace(/\s+/g, " ").slice(0, 48);
    return highlightTargets.find((target) => target.normalizedText.includes(needle) || needle.includes(target.normalizedText.slice(0, 32)))?.evidenceRefId;
  }, [highlightTargets]);

  useEffect(() => {
    if (activeShellTab !== "reader") return;
    setFocusedEvidenceId(null);
    setFocusSnippet(null);
    setSynthAiHighlights([]);  // clear AI anchors immediately on page change
    const topSnippet = currentSignals.paragraphSignals?.[0]?.text;
    if (!topSnippet) return;
    const timer = window.setTimeout(() => setFocusSnippet(topSnippet), 0);
    return () => window.clearTimeout(timer);
  }, [activeShellTab, currentPage, currentSignals.paragraphSignals, highlightKey]);

  /* =========================================================================
     🔹 Surgeon View: Text Selection Handler
  ========================================================================= */
  useEffect(() => {
    const handleMouseUp = () => {
      // Only trigger in Surgeon View or when PDF is loaded
      if (fileUrl) {
        setTimeout(handleTextSelection, 100);
      }
    };

    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, [fileUrl, bookId, currentPage, currentThoughtUnit, tableOfContents]);

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
     🔹 Auth Listener + complete redirect
  ========================================================================= */
  useEffect(() => {
    // Check if bypass mode is enabled
    const isBypassMode = process.env.NEXT_PUBLIC_DISABLE_GOOGLE_SIGNIN === "1";
    
    if (isBypassMode) {
      // Create a mock user for guest mode
      const mockUser = {
        uid: "guest-user-" + Date.now(),
        displayName: "Guest User",
        email: "guest@local",
        photoURL: null,
      };
      console.log("✅ Bypass mode enabled - using mock user");
      setUser(mockUser as any);
    } else {
      handleRedirectResult().catch(() => {});
      return listenForAuthChanges((u) => setUser(u));
    }
  }, []);

  /* =========================================================================
     🔹 Initialize Chapter Absorption Pipeline
  ========================================================================= */
  useEffect(() => {
    if (thoughtUnits.length > 0 && tableOfContents.length > 0) {
      console.log('🧠 Initializing Chapter Absorption Pipeline');
      
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

    console.log('🧠 Starting chapter absorption process for', smartTOC.length, 'chapters');
    
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

      console.log('🧠 Chapter absorption complete:', stats);
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
      console.log('🧠 Chapter absorption stopped by user');
    }
  };

  const clearAbsorptionCache = () => {
    if (chapterPipeline) {
      chapterPipeline.clearCache();
      setAbsorptionState(prev => ({
        ...prev,
        results: []
      }));
      console.log('🧠 Chapter absorption cache cleared');
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
     🔹 Handle Thought Detection
  ========================================================================= */
  const handleThoughtDetected = (thoughtText: string, analysis: any) => {
    console.log('💭 New thought detected:', { thoughtText: thoughtText.slice(0, 50) + '...', analysis });
    
    const newThought = {
      id: Date.now().toString(),
      text: thoughtText,
      analysis,
      timestamp: new Date(),
      page: currentPage
    };
    
    setDetectedThoughts(prev => [newThought, ...prev.slice(0, 9)]); // Keep max 10 thoughts
  };

  /* =========================================================================
     🔹 Handle PDF Outline Extraction (memoized to prevent excessive re-renders)
  ========================================================================= */
  const handleOutlineExtraction = useCallback((tocItems: any[]) => {
    // Save outline to tocStore when extracted from PDF
    if (tocItems && tocItems.length > 0) {
      const documentId = bookId || uploadedFile?.name.replace(/\.[Pp][Dd][Ff]$/, "") || "book";
      const documentName = uploadedFile?.name || "Document";
      
      // Convert TocItem to store format
      const storeItems = tocItems.map((item: any, idx: number) => ({
        id: `toc_${idx}_${Date.now()}`,
        title: item.title || `Chapter ${idx + 1}`,
        pageNumber: item.pageNumber || 1,
        level: 0,
        children: item.items?.map((sub: any, subIdx: number) => ({
          id: `toc_${idx}_${subIdx}_${Date.now()}`,
          title: sub.title || `Section ${subIdx + 1}`,
          pageNumber: sub.pageNumber || 1,
          level: 1
        }))
      }));
      
      const tocStore = useTocStore.getState();
      tocStore.saveToc(documentId, documentName, storeItems, 'outline');
      
      // Also update tableOfContents for backward compatibility
      const legacyToc = tocItems.map((item: any) => ({
        title: item.title,
        pageNumber: item.pageNumber || 1,
        subChapters: item.items?.map((sub: any) => ({
          title: sub.title,
          pageNumber: sub.pageNumber || 1
        }))
      }));
      setTableOfContents(legacyToc);
      
      console.log(`📑 TOC extracted from PDF outline: ${storeItems.length} chapters`);
    }
  }, [bookId, uploadedFile?.name, setTableOfContents]);

  useEffect(() => {
    if (!pdfPageCount || !thoughtUnits.length) return;
    if (tableOfContents.length > 0) return;

    const bundles = Array.from({ length: pdfPageCount }, (_, idx) => {
      const page = idx + 1;
      const unitIndex = pageToUnit(page, pdfPageCount, thoughtUnits.length) - 1;
      return { page, text: thoughtUnits[unitIndex]?.text || "" };
    });
    const autoToc = buildAutoToc(bundles);
    if (!autoToc.length) return;

    setTableOfContents(
      autoToc.map((node) => ({
        title: node.title,
        pageNumber: node.page,
        subChapters: node.children?.map((child) => ({
          title: child.title,
          pageNumber: child.page,
        })),
      })),
    );
  }, [pdfPageCount, thoughtUnits, tableOfContents.length]);

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

    if (!snippet || !store.syncInsightsToPdf) return;

    // Build paragraph blocks from current page text and try to find matching block
    const pageText = thoughtUnits?.[currentThoughtUnit - 1]?.text || '';
    if (!pageText.trim()) return;

    const blocks = extractParagraphBlocks(pageText, currentPage, bookId);
    const matched = findBestMatchingBlock(snippet, blocks);
    if (matched) {
      store.setActiveParagraphId(matched.id);
    }
  }, [thoughtUnits, currentThoughtUnit, currentPage, bookId]);

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
      let libEntry: { id: string; name: string; url: string; uploadedAt: any; isLocal?: boolean };

      // Check if we're using the bypass (mock user) or real Firebase
      const isUsingBypass = process.env.NEXT_PUBLIC_DISABLE_GOOGLE_SIGNIN === "1";
      const canUseFirebase = firebaseConnected && user && !isUsingBypass;

      setPdfParsingState(prev => ({ ...prev, progress: "Uploading to cloud..." }));

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
          // Fall back to local mode if Firebase upload fails
          url = URL.createObjectURL(file);
          libEntry = {
            id: String(Date.now()),
            name: file.name,
            url,
            uploadedAt: new Date().toISOString(),
            isLocal: true,
          };
          setPdfLibrary((prev) => [libEntry, ...prev]);
        }
      } else {
        // Guest mode or bypass: blob URL + session library
        url = URL.createObjectURL(file);
        libEntry = {
          id: String(Date.now()),
          name: file.name,
          url,
          uploadedAt: new Date().toISOString(),
          isLocal: true,
        };
        setPdfLibrary((prev) => [libEntry, ...prev]);
      }

      setFileUrl(url);

      setPdfParsingState(prev => ({ ...prev, progress: "Generating table of contents..." }));

      // Generate and store TOC
      const documentId = file.name.replace(/\.[Pp][Dd][Ff]$/, "") || "book";
      
      // TOC generation will be done in two phases:
      // 1. Heuristic TOC from URL (deferred to SmartPDFViewer.onOutline for native outline)
      // 2. Fallback TOC from parsed content (handled after parsing)
      
      // Try initial TOC generation (may be empty - outline extraction handled by SmartPDFViewer)
      generateTOC(url).then((tocEntries) => {
        if (tocEntries && tocEntries.length > 0) {
          setTableOfContents(tocEntries);
          
          // Save to tocStore for persistence
          const tocItems = tocEntries.map((entry: any, idx: number) => ({
            id: `toc_${idx}_${Date.now()}`,
            title: entry.title || `Chapter ${idx + 1}`,
            pageNumber: entry.pageNumber || entry.page || idx + 1,
            level: entry.level || 0
          }));
          
          const tocStore = useTocStore.getState();
          tocStore.saveToc(documentId, file.name, tocItems, 'outline');
          console.log(`📑 TOC auto-generated: ${tocItems.length} chapters`);
        }
      }).catch((err) => {
        console.log('📑 Initial TOC generation deferred to outline extraction or fallback');
      });

      setPdfParsingState(prev => ({ ...prev, progress: "Extracting and analyzing content..." }));

      // Parse → normalize → store
      const { parsedUnits, chapters } = await parseBookWithChapters(file);

      setPdfParsingState(prev => ({ ...prev, progress: "Processing thought units..." }));

      const normalized = normalizeParsedUnits(parsedUnits);
      
      // ✅ Validate parsed content before setting
      if (!normalized || normalized.length === 0) {
        throw new Error("No readable content found in PDF");
      }

      setThoughtUnits(normalized);
      setSampleText(normalized[0]?.text ?? "");

      setPdfParsingState(prev => ({ ...prev, progress: "Setting up learning features..." }));

      // =========================================================================
      // REQUIREMENT D: Ensure TOC is ALWAYS generated (fallback if no outline)
      // =========================================================================
      // Check if TOC was generated from outline - if not, create fallback
      setTimeout(() => {
        const currentToc = useTocStore.getState().getToc(documentId);
        if (!currentToc || currentToc.items.length === 0) {
          console.log('📑 No TOC from outline - generating fallback from parsed content');
          
          // Use chapters from parser if available
          let fallbackToc: TOCEntry[] = [];
          
          if (chapters && chapters.length > 0) {
            fallbackToc = chapters.map((ch: any, idx: number) => ({
              title: ch.title || `Chapter ${idx + 1}`,
              pageNumber: ch.page || idx + 1,
              level: 0,
              confidence: 0.6
            }));
          } else {
            // Create basic section-based TOC
            const estimatedPages = Math.max(10, Math.ceil(normalized.length / 5));
            const sectionsCount = Math.min(10, Math.max(3, Math.floor(estimatedPages / 5)));
            const pagesPerSection = Math.ceil(estimatedPages / sectionsCount);
            
            for (let i = 0; i < sectionsCount; i++) {
              const startPage = i * pagesPerSection + 1;
              fallbackToc.push({
                title: `Section ${i + 1}`,
                pageNumber: startPage,
                level: 0,
                confidence: 0.3
              });
            }
          }
          
          if (fallbackToc.length > 0) {
            setTableOfContents(fallbackToc);
            
            const tocItems = fallbackToc.map((entry: TOCEntry, idx: number) => ({
              id: `toc_${idx}_${Date.now()}`,
              title: entry.title,
              pageNumber: entry.pageNumber,
              level: entry.level || 0
            }));
            
            const tocStore = useTocStore.getState();
            tocStore.saveToc(documentId, file.name, tocItems, 'heuristic');
            console.log(`📑 Fallback TOC generated: ${tocItems.length} entries`);
          }
        } else {
          // Update tableOfContents state from store
          const storeItems = currentToc.items.map((item: any) => ({
            title: item.title,
            pageNumber: item.pageNumber,
            level: item.level || 0
          }));
          setTableOfContents(storeItems);
        }
      }, 500); // Wait for outline extraction to complete first

      // Whiteboard auto-detect
      const matches = detectWhiteboardSections(parsedUnits);
      if (autoWhiteboard && matches.length > 0) {
        const firstIdx = matches[0];

        const conceptText =
          unitToString((parsedUnits as any[])[firstIdx]) || normalized[firstIdx]?.text || "";

        lastDetectedUnitRef.current = conceptText;

        const contextTitle =
          chapters?.[Math.min(firstIdx, Math.max(0, chapters.length - 1))]?.title ||
          chapters?.[0]?.title ||
          "Detected diagram/formula";

        setWbConcept(truncate(conceptText, 600));
        setWbContext(contextTitle);
        setWbStickyNotes([]);
        setShowWhiteboardPanel(true);
      } else {
        setShowWhiteboardPanel(false);
      }

      // ✅ Success - clear loading state
      setPdfParsingState({
        isLoading: false,
        error: null,
        progress: "Complete"
      });

      console.log("✅ PDF processing complete:", {
        thoughtUnits: normalized.length,
        chapters: chapters.length,
        fileName: file.name
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to process PDF";
      console.error("❌ PDF processing failed:", errorMessage);

      // ✅ Enhanced error handling with specific messages
      let userFriendlyMessage = errorMessage;
      
      if (errorMessage.includes("password") || errorMessage.includes("encrypted")) {
        userFriendlyMessage = "This PDF is password-protected or encrypted. Please provide an unlocked PDF file.";
      } else if (errorMessage.includes("corrupted") || errorMessage.includes("invalid")) {
        userFriendlyMessage = "This PDF file appears to be corrupted or invalid. Please try a different PDF file.";
      } else if (errorMessage.includes("No readable content")) {
        userFriendlyMessage = "This PDF contains no readable text (possibly scanned images only). Try a text-based PDF or consider using OCR software first.";
      } else if (errorMessage.includes("timeout") || errorMessage.includes("took too long")) {
        userFriendlyMessage = "PDF processing timed out. This file may be too complex or large. Try a smaller or simpler PDF.";
      } else if (errorMessage.includes("memory") || errorMessage.includes("out of")) {
        userFriendlyMessage = "Not enough memory to process this PDF. Try a smaller file or refresh the page and try again.";
      }

      // ✅ Set error state with user-friendly message
      setPdfParsingState({
        isLoading: false,
        error: userFriendlyMessage,
        progress: "Failed"
      });

      // Reset states on error
      setThoughtUnits([]);
      setFileUrl(null);
      setUploadedFile(null);
      setPageTextByPage(new Map());
      
      alert(`Failed to process PDF: ${userFriendlyMessage}`);
    }
  };

  // Initialize enhanced sync system when content is loaded
  useEffect(() => {
    if (pdfPageCount > 1 && thoughtUnits.length > 0 && tableOfContents.length > 0) {
      console.log('🔄 Initializing enhanced sync system');
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
        console.log(`🔄 Tab switch to ${viewMode}: syncing to current chapter`);
        
        // Safe chapter-aware navigation with proper error handling
        try {
          // Get sync state safely without destructuring
          const syncStore = useReaderSync.getState();
          
          if (syncStore && syncStore.findNearestChapter && typeof syncStore.findNearestChapter === 'function') {
            const nearestChapter = syncStore.findNearestChapter(currentPage);
            
            if (nearestChapter && nearestChapter.unitStart && nearestChapter.unitStart > 0) {
              console.log(`🔄 Tab sync: Found chapter "${nearestChapter.title}" for page ${currentPage}`);
              
              const chapterStartUnit = nearestChapter.unitStart;
              
              // Validate unit bounds
              if (chapterStartUnit >= 1 && chapterStartUnit <= thoughtUnits.length) {
                setCurrentThoughtUnit(chapterStartUnit);
                updateSync({ 
                  page: currentPage, 
                  unitIndex: chapterStartUnit 
                }, 'manual');
                
                console.log(`🔄 Tab sync complete: staying on page ${currentPage}, unit ${chapterStartUnit}`);
                return; // Success, exit early
              } else {
                console.warn(`🔄 Tab sync: Invalid chapter unit ${chapterStartUnit}, bounds: 1-${thoughtUnits.length}`);
              }
            } else {
              console.log(`🔄 Tab sync: No valid chapter found for page ${currentPage}`);
            }
          } else {
            console.warn(`🔄 Tab sync: Sync store not ready or missing findNearestChapter function`);
          }
          
          // Fallback: use page-to-unit mapping
          const fallbackUnit = pageToUnit(currentPage, pdfPageCount, thoughtUnits.length);
          if (fallbackUnit >= 1 && fallbackUnit <= thoughtUnits.length) {
            setCurrentThoughtUnit(fallbackUnit);
            updateSync({ page: currentPage, unitIndex: fallbackUnit }, 'manual');
            console.log(`🔄 Tab sync fallback: page ${currentPage}, unit ${fallbackUnit}`);
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
              console.log(`🔄 Tab sync final fallback: unit ${safeUnit}`);
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
  ========================================================================= */
  const handleLoadPDF = (url: string, name?: string) => {
    // Clear stale per-page text cache so the new document never inherits
    // text extracted from the previous one. Reset page position too.
    setPageTextByPage(new Map());
    setCurrentPage(1);
    setThoughtUnits([]);
    setCurrentThoughtUnit(1);
    // Reset global sync store — prevents a stale persisted page from a previous
    // session overriding the fresh page-1 state via the global sync subscription.
    updateSync({ page: 1, unitIndex: 1 }, 'manual');
    if (name) setBookId(name.replace(/\.[Pp][Dd][Ff]$/, "") || "book");
    setFileUrl(url);
    setShowLibrary(false);
    setViewMode("reader");
    generateTOC(url).then(setTableOfContents).catch(() => {});
  };

  /* =========================================================================
     🔹 Delete PDF
  ========================================================================= */
  const handleDeletePDF = async (id: string, name: string, isLocal?: boolean) => {
    if (!confirm(`Delete ${name}?`)) return;

    if (firebaseConnected && user && !isLocal) {
      await deletePDF(USER_ID, id, name);
      getPDFLibrary(USER_ID).then(setPdfLibrary);
    } else {
      setPdfLibrary((prev) => prev.filter((p) => p.id !== id));
    }
  };

  /* =========================================================================
     🔹 Surgeon View PDRM: Highlight → Action Handlers
  ========================================================================= */
  
  // Handle text selection and show action menu
  const handleTextSelection = () => {
    const selection = window.getSelection();
    if (!selection || selection.toString().trim().length === 0) {
      setShowHighlightMenu(false);
      return;
    }

    const selectedText = selection.toString().trim();
    if (selectedText.length < 3) return; // Ignore very short selections

    // Get selection position for menu placement
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    
    setHighlightMenuPosition({
      x: rect.left + rect.width / 2,
      y: rect.bottom,
    });

    setCurrentSelection({
      text: selectedText,
      context: {
        bookId,
        chapterId: tableOfContents[0]?.title || 'Unknown',
        thoughtUnitIndex: currentThoughtUnit,
        pageNumber: currentPage,
      },
    });

    setShowHighlightMenu(true);
  };

  // Handle highlight action menu actions
  const handleHighlightAction = (action: any) => {
    if (!currentSelection) return;

    const timestamp = Date.now();
    const sourceRef = {
      bookId,
      selectedText: currentSelection.text,
      pageNumber: currentPage,
      thoughtUnitIndex: currentThoughtUnit,
      chapterId: currentSelection.context.chapterId,
    };

    switch (action.type) {
      case 'note': {
        const newNote = {
          id: `note_${timestamp}`,
          content: '', // Will be filled by user in NoteLab
          source: sourceRef,
          tags: [],
          createdAt: timestamp,
          updatedAt: timestamp,
          archived: false,
        };
        setNotes((prev) => [...prev, newNote]);
        
        // Create highlight
        const highlight = {
          id: `hl_${timestamp}`,
          source: sourceRef,
          tags: [],
          noteId: newNote.id,
          color: '#3b82f6',
          createdAt: timestamp,
        };
        setHighlights((prev) => [...prev, highlight]);
        
        console.log('📝 Note created:', newNote.id);
        // TODO: Show note editor modal or switch to NoteLab
        break;
      }

      case 'flashcard': {
        const newFlashcard = {
          id: `card_${timestamp}`,
          front: currentSelection.text,
          back: '', // Will be filled by user
          source: sourceRef,
          tags: [],
          confidence: 0,
          reviewCount: 0,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        setFlashcards((prev) => [...prev, newFlashcard]);
        
        // Create highlight
        const highlight = {
          id: `hl_${timestamp}`,
          source: sourceRef,
          tags: [],
          flashcardId: newFlashcard.id,
          color: '#10b981',
          createdAt: timestamp,
        };
        setHighlights((prev) => [...prev, highlight]);
        
        console.log('🎴 Flashcard created:', newFlashcard.id);
        break;
      }

      case 'tag': {
        // Create or update highlight with PDRM tag
        const tagColor = {
          P: '#a855f7', // Purple
          D: '#3b82f6', // Blue
          R: '#ef4444', // Red
          M: '#f59e0b', // Yellow
        }[action.tagType] || '#6b7280';

        const highlight = {
          id: `hl_${timestamp}`,
          source: sourceRef,
          tags: [action.tagType],
          color: tagColor,
          createdAt: timestamp,
        };
        setHighlights((prev) => [...prev, highlight]);
        
        console.log(`🏷️ PDRM tag applied: ${action.tagType}`);
        break;
      }

      case 'hyperchunk': {
        // Add to existing or create new hyper-chunk
        // For now, create a new one - can be merged later in NoteLab
        const newChunk = {
          id: `chunk_${timestamp}`,
          title: `Chunk: ${currentSelection.text.substring(0, 30)}...`,
          description: '',
          noteIds: [],
          flashcardIds: [],
          tags: [],
          ruleState: 'draft',
          crossDomainTags: [],
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        setHyperChunks((prev) => [...prev, newChunk]);
        
        // Create highlight linked to chunk
        const highlight = {
          id: `hl_${timestamp}`,
          source: sourceRef,
          tags: [],
          hyperChunkId: newChunk.id,
          color: '#f97316', // Orange
          createdAt: timestamp,
        };
        setHighlights((prev) => [...prev, highlight]);
        
        console.log('🔗 Hyper-chunk created:', newChunk.id);
        break;
      }
    }

    setShowHighlightMenu(false);
    setCurrentSelection(null);
  };

  // Persist Surgeon View data to localStorage
  useEffect(() => {
    if (bookId && (notes.length > 0 || flashcards.length > 0 || highlights.length > 0 || hyperChunks.length > 0)) {
      try {
        localStorage.setItem(`surgeonView_notes_${bookId}`, JSON.stringify(notes));
        localStorage.setItem(`surgeonView_flashcards_${bookId}`, JSON.stringify(flashcards));
        localStorage.setItem(`surgeonView_highlights_${bookId}`, JSON.stringify(highlights));
        localStorage.setItem(`surgeonView_hyperchunks_${bookId}`, JSON.stringify(hyperChunks));
        console.log('💾 Surgeon View data saved to localStorage');
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
        
        console.log('📂 Surgeon View data loaded from localStorage');
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

    console.log(`📝 Creating ${mode || 'standard'} note for: ${seed.slice(0, 50)}...`);

    try {
      const draft = await buildTopStudentNote(seed, mode || "highYield");
      // For now, just log the note since Right-Brain view is removed
      console.log("📝 Generated study note:", draft);
      alert("Study note generated! (Right-Brain view has been removed - note logged to console)");
    } catch (error) {
      console.error("Error creating study note:", error);
      alert("Study note creation failed. Please try again.");
    }
  };


  /* =========================================================================
     🔹 Enhanced Page/TOC sync with chapter-aware navigation + global sync
  ========================================================================= */
  // Simplified navigation function - single source of truth
  const syncToPage = (page: number, opts?: { reason?: 'SCROLL' | 'TOC_JUMP' | 'PROGRAMMATIC' }) => {
    const reason = opts?.reason || 'PROGRAMMATIC';
    console.log(`📄 syncToPage: ${page} (current: ${currentPage}) reason: ${reason}`);
    
    // Validate page bounds
    if (page < 1 || (pdfPageCount > 0 && page > pdfPageCount)) {
      console.warn(`📄 Invalid page ${page}, bounds: 1-${pdfPageCount}`);
      return;
    }
    
    // Skip if already on the page (unless it's a scroll event)
    if (page === currentPage && reason !== 'SCROLL') {
      console.log(`📄 Already on page ${page}, skipping`);
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
        const prevPage = currentPage - 1;
        useInsightsPanelStore.getState().clearPinnedTexts();
        useHighlightStore.getState().clearPage(bookId || 'default-book', prevPage);

        // Reset the right-panel scroll to top (user is on a new page)
        requestAnimationFrame(() => {
          lastProgrammaticScrollAtRef.current = Date.now();
          (document.querySelector('.insightPanelScroll') as HTMLElement | null)
            ?.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
        });

        // Unfreeze after PDF render has settled
        syncFreezeTimerRef.current = setTimeout(() => {
          syncFrozenRef.current = false;
        }, 600);
      }

      // Update local state immediately for responsive UI
      setCurrentPage(page);
      const unit = pageToUnit(page, pdfPageCount, thoughtUnits.length);
      setCurrentThoughtUnit(unit);
      console.log("[TRACE pageSync]", {
        source: reason,
        documentId: bookId,
        visiblePage: page,
        previousPage: currentPage,
        currentThoughtUnit: unit,
        pageTextWords: (pageTextByPage.get(`${bookId}:${page}`) || "").split(/\s+/).filter(Boolean).length,
      });
      
      // Update global sync state
      updateSync({ 
        page, 
        unitIndex: unit 
      }, reason === 'SCROLL' ? 'pdf' : 'manual');
      
      // Auto-whiteboard trigger
      if (autoWhiteboard) {
        const seed = conceptForPage(page, thoughtUnits, pdfPageCount);
        if (seed) {
          setWbConcept(truncate(seed, 600));
          const title = titleForPage(tableOfContents, page);
          setWbContext(title);
          setShowWhiteboardPanel(true);
        }
      }
      
      console.log(`📄 Navigation successful: page ${page}, unit ${unit}`);
      
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
  };

  const handleParsedSyllabus = useCallback((result: {
    fileName: string;
    pages: PageTextBundle[];
    toc: TocNode[];
  }) => {
    setSyllabusFileName(result.fileName);
    setSyllabusPages(result.pages);
    setSyllabusToc(result.toc);
  }, []);

  const handleStudyTopic = useCallback((node: TocNode) => {
    syncToPage(node.page, { reason: "TOC_JUMP" });
    setRightPanelResetKey((k) => k + 1);
    setUnifiedPanelState((prev) => ({ ...prev, activeTab: "insights" }));
    setViewMode("reader");
    setActiveShellTab("reader");
  }, [syncToPage]);

  const handleSyllabusNodeClick = useCallback((node: TocNode) => {
    syncToPage(node.page, { reason: "TOC_JUMP" });
    setRightPanelResetKey((k) => k + 1);
    setUnifiedPanelState((prev) => ({ ...prev, activeTab: "insights" }));
    setViewMode("reader");
    setActiveShellTab("reader");
  }, [syncToPage]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  /* =========================================================================
     🔹 Render Reader Content with Persistent Views (Performance Optimized)
  ========================================================================= */
  const renderContent = () => {
    // 🔐 Gate the app: must be signed in before doing anything
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
                    console.log("✅ Signed in:", user.displayName || user.email);
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
              <h2 className="text-2xl font-bold text-blue-200">Upload your first textbook</h2>
              <p className="mt-2 text-slate-300">Reader + Panel unlock after textbook upload. You can still use the Syllabus tab independently.</p>
              <p className="mt-4 text-sm text-slate-400">No PDF pane, panel, or page navigation is shown until a real book is loaded.</p>
            </div>
          </div>
        );
      }
      const activePageContext = activePageContextForInsights;

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
              <div className="h-full w-[68%] min-w-[600px] overflow-y-auto border-r border-gray-700">
                <PureReaderView
                  fileUrl={fileUrl}
                  docId={bookId}
                  currentPage={currentPage}
                  pdfPageCount={pdfPageCount}
                  onPageChange={(p) => syncToPage(p)}
                  onPageCount={(count) => setPdfPageCount(count)}
                  onTextSelect={(t) => sel.setSelectionText(t)}
                  onOutline={handleOutlineExtraction}
                  fontSize={fontSize}
                  fontFamily={fontFamily}
                  onActiveParagraphChange={handleActiveParagraphChange}
                  focusSnippet={focusSnippet}
                  highlightTargets={highlightTargets}
                  highlightNeighborhoods={highlightNeighborhoods}
                  aiHighlightTexts={synthAiHighlights.map(a => a.text)}
                aiHighlightAnchors={synthAiHighlights}
                  synthStatus={synthAiHighlights.length > 0 ? "ready" : "loading"}
                  focusedEvidenceId={focusedEvidenceId}
                  onEvidenceFocus={(id) => setFocusedEvidenceId(id)}
                  onReadingPath={setGuidedPath}
                  roleLabelByConceptId={roleLabelByConceptId}
                  onOpenFocusCycle={() => {
                    bindFocusCycleContext({
                      documentId: bookId,
                      page: currentPage,
                      sectionId: tableOfContents.find((entry, idx) => {
                        const nextEntry = tableOfContents[idx + 1];
                        return entry.pageNumber <= currentPage && (!nextEntry || nextEntry.pageNumber > currentPage);
                      })?.title || null,
                    });
                    setShowFocusCycleModal(true);
                  }}
                  onPageTextExtracted={(pageNumber, text) => setPageTextByPage((prev) => { const next = new Map(prev); next.set(`${bookId}:${pageNumber}`, text); return next; })}
                />
              </div>
            )}

            {/* Right: Unified Intelligence Panel */}
            <div className={fileUrl ? "h-full w-[32%] min-w-[380px] max-w-[520px] overflow-hidden border-l border-white/10" : "flex-1 h-full"}>
              <RightPanel
                key={`${pageTruthKey}-${rightPanelResetKey}`}
                ctx={activePageContext}
                state={unifiedPanelState}
                payload={currentPanelPayload}
                intelligence={{
                  status: pageIntelligenceStatus,
                  pageTruthKey,
                  isCurrentPage: isCurrentIntelligencePage,
                  pageClass: currentPageClass,
                  pageTruth: currentPageTruth,
                  pageModel: currentPageModel,
                  story: currentPageStory,
                  priorityHighlights: currentPriorityHighlights,
                  normResult: currentNormResult,
                }}
                guidedPath={guidedPath}
                onRoleLabelMap={setRoleLabelByConceptId}
                resolveEvidenceId={resolveEvidenceId}
                focusedEvidenceId={focusedEvidenceId}
                onNoteSaved={() => { setNoteLabRefreshKey((k) => k + 1); trySwitchShellTab("notelab", "notelab"); }}
                onStudySetGenerated={(setId) => { setLastRecallSetId(setId); setRecallLabRefreshKey((k) => k + 1); trySwitchShellTab("study", "study"); }}
                onEvidenceClick={(snippet, evidenceId) => {
                  setFocusSnippet(null);
                  setFocusedEvidenceId(evidenceId || resolveEvidenceId(snippet) || null);
                  window.setTimeout(() => setFocusSnippet(snippet), 0);
                }}
                onSynthHighlightsReady={(anchors) => {
                    console.log("[HIGHLIGHT:parent-state]", { count: anchors.length, texts: anchors.map((a) => a.text.slice(0, 40)) });
                    setSynthAiHighlights(anchors);
                  }}
                onStudyModelReady={(model) => setCurrentPageStudyModel(model)}
                onCrossLinkNavigate={(page) => syncToPage(page, { reason: "TOC_JUMP" })}
                tocItems={tocItemsForSearch}
              />
            </div>

            {/* Whiteboard Overlay (for explanations) */}
            <WhiteboardOverlay
              onSaveToNoteLab={() => {
                console.log('Whiteboard: Save to NoteLab');
              }}
              onAddToStudy={() => {
                trySwitchShellTab("study", "study");
              }}
            />
          </ErrorBoundary>
        </div>
      );
    }

    if (activeShellTab === "notelab") {
      return (
        <div className="h-full flex flex-col overflow-hidden bg-[rgb(11,18,34)]">
          <div className="border-b border-white/10 px-4 py-3 flex-shrink-0">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-emerald-400">NoteLab</div>
            <div className="mt-0.5 text-[11px] text-slate-500">Generated study notes · saved locally</div>
          </div>
          <div className="flex-1 overflow-y-auto">
            <UltraNotesList
              bookId={bookId}
              refreshKey={noteLabRefreshKey}
              onNavigateToPage={(page) => {
                syncToPage(page);
                trySwitchShellTab("reader", "reader");
              }}
              onCardsGenerated={(setId) => { setLastRecallSetId(setId); setRecallLabRefreshKey((k) => k + 1); trySwitchShellTab("study", "study"); }}
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
              onOpenInReader={(pageNumber) => {
                syncToPage(pageNumber);
                setViewMode("reader");
              }}
              onOpenInSurgeon={(pageNumber) => {
                syncToPage(pageNumber);
                setViewMode("reader");
              }}
            />
          </ErrorBoundary>
        </div>
      );
    }

    // ✅ Syllabus View - upload → parse → auto-TOC → jump/study
    if (activeShellTab === "syllabus") {
      return (
        <div className="h-full overflow-y-auto p-4" data-testid="syllabus-view-container">
          <ErrorBoundary
            onError={(error) => {
              console.error("📚 Syllabus Error:", { message: error.message, stack: error.stack });
            }}
          >
            {!syllabusPages.length ? (
              <SyllabusUploadPanel onParsed={handleParsedSyllabus} />
            ) : (
              <div className="space-y-3">
                <div className="rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-300">
                  <span className="font-medium text-white">Loaded syllabus:</span> {syllabusFileName}
                </div>
                <SyllabusStudyLauncher toc={syllabusToc} onStudyTopic={handleStudyTopic} />
                <TocTree
                  toc={syllabusToc}
                  activePage={currentPage}
                  onJump={handleSyllabusNodeClick}
                  onStudy={handleStudyTopic}
                />
              </div>
            )}
          </ErrorBoundary>
        </div>
      );
    }

    if (activeShellTab === "study") {
      return (
        <div className="h-full flex flex-col overflow-hidden bg-[rgb(11,18,34)]">
          <div className="border-b border-white/10 px-4 py-3 flex-shrink-0">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-indigo-400">Recall Lab</div>
            <div className="mt-0.5 text-[11px] text-slate-500">Memory-engineering layer · flip cards · active recall</div>
          </div>
          <div className="flex-1 overflow-y-auto">
            <RecallLab
              refreshKey={recallLabRefreshKey}
              lastSetId={lastRecallSetId ?? undefined}
              onNavigateToPage={(page) => {
                syncToPage(page);
                trySwitchShellTab("reader", "reader");
              }}
            />
          </div>
        </div>
      );
    }

    if (activeShellTab === "elena") {
      return (
        <UnderConstructionPanel
          icon="✨"
          title="Elena Mode (Under Construction)"
          subtitle="Guided Elena workflows are in active development."
          bullets={["Premium tutoring flow", "Adaptive coaching", "Session memory", "Voice-guided review"]}
        />
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
            📚 Syllabus
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
            🎯 Recall Lab
          </button>
          <button
            onClick={() => {
              if (focusSoftLock && focusState.running) {
                const ok = window.confirm("Focus Cycle is active. Leave Reader cockpit for DAT Apex?");
                if (!ok) return;
              }
              router.push("/dat-apex");
            }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all text-gray-300 hover:text-white hover:bg-gray-700 ${focusState.running ? "opacity-50" : ""}`}
            title="Open DAT Apex"
          >
            🎯 DAT Apex
          </button>
          <button
            onClick={() => trySwitchShellTab("elena", "elena")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all text-gray-300 hover:text-white hover:bg-gray-700 ${focusState.running ? "opacity-50" : ""}`}
            title="Elena Mode is under construction."
          >
            Elena Mode (Under Construction)
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

        <div className="flex items-center gap-2 rounded-2xl border border-purple-300/40 bg-white/10 backdrop-blur-md shadow-[0_0_20px_rgba(139,92,246,0.25)] px-3 py-1.5">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            focusState.mode === "focus" ? "bg-purple-500/40 text-purple-100" : "bg-emerald-500/40 text-emerald-100"
          }`}>
            {focusModeLabel}
          </span>
          <span className="rounded-xl bg-black/30 px-3 py-1.5 font-mono text-sm text-purple-100">
            {String(Math.floor(focusState.time / 60)).padStart(2, "0")}:{String(focusState.time % 60).padStart(2, "0")}
          </span>
          <span className="text-[10px] text-slate-300">Integrity: {focusIntegrity}</span>
          <button
            onClick={() =>
              setFocusState((prev) => ({
                ...prev,
                running: !prev.running,
                mode: prev.running ? prev.mode : prev.mode || "focus",
                time: prev.time,
              }))
            }
            className="text-xs rounded bg-purple-600 px-2 py-1 hover:bg-purple-500"
          >
            {focusState.running ? "Pause" : "Start"}
          </button>
          <button
            onClick={() => {
              setCycleCount(0);
              setFocusInterruptions(0);
              setFocusInterruptionLabel(null);
              setFocusState({ mode: "focus", time: focusSettings.focus, running: false });
            }}
            className="text-xs rounded bg-slate-700 px-2 py-1 hover:bg-slate-600"
          >
            Reset
          </button>
          <button
            onClick={() => document.documentElement.requestFullscreen?.()}
            className="text-xs rounded bg-slate-700 px-2 py-1 hover:bg-slate-600"
          >
            Full Screen
          </button>
          <label className="text-[10px] text-slate-300 inline-flex items-center gap-1">
            <input type="checkbox" checked={focusSoftLock} onChange={(e) => setFocusSoftLock(e.target.checked)} />
            Soft lock
          </label>
          <input
            value={Math.round(focusSettings.focus / 60)}
            onChange={(e) => setFocusSettings((prev) => ({ ...prev, focus: Math.max(5, Number(e.target.value || 25)) * 60 }))}
            className="w-12 rounded bg-black/30 px-1 py-0.5 text-[10px]"
            title="Focus minutes"
          />
          <input
            value={Math.round(focusSettings.shortBreak / 60)}
            onChange={(e) => setFocusSettings((prev) => ({ ...prev, shortBreak: Math.max(1, Number(e.target.value || 5)) * 60 }))}
            className="w-12 rounded bg-black/30 px-1 py-0.5 text-[10px]"
            title="Short break minutes"
          />
          <input
            value={Math.round(focusSettings.longBreak / 60)}
            onChange={(e) => setFocusSettings((prev) => ({ ...prev, longBreak: Math.max(5, Number(e.target.value || 15)) * 60 }))}
            className="w-12 rounded bg-black/30 px-1 py-0.5 text-[10px]"
            title="Long break minutes"
          />
          <input
            value={ambientUrl}
            onChange={(e) => setAmbientUrl(e.target.value)}
            placeholder="Ambient YouTube URL"
            className="w-40 rounded bg-black/30 px-2 py-1 text-[10px]"
          />
          <button
            onClick={() => setShowAmbientPanel((prev) => !prev)}
            disabled={!ambientEmbedUrl}
            className="text-xs rounded bg-emerald-700 px-2 py-1 hover:bg-emerald-600 disabled:opacity-50"
          >
            {showAmbientPanel ? "Hide Ambient" : "Ambient"}
          </button>
        </div>
        {focusInterruptionLabel ? <span className="text-xs text-amber-300">{focusInterruptionLabel}</span> : null}

        <div className="flex-1" />

        <div className="inline-flex items-center gap-2 rounded-lg border border-amber-300/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-100">
          🎨 Whiteboard is under construction
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

      {showFocusCycleModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-lg font-semibold text-white">Focus Cycle</h3>
                <p className="text-sm text-gray-400">Comprehension → consolidation → recall workflow</p>
              </div>
              <button
                onClick={() => setShowFocusCycleModal(false)}
                className="px-3 py-1 rounded bg-gray-700 hover:bg-gray-600 text-sm text-white"
              >
                Close
              </button>
            </div>
            <FocusCycleCard onClosePrompts={() => setShowFocusCycleModal(false)} />
          </div>
        </div>
      )}

        {/* Floating Action Buttons - Bottom Left Stack */}
        <div className="fixed bottom-[80px] right-6 z-40 flex flex-col gap-3 max-w-[170px] opacity-90">
          {/* Highlight color legend — dynamic from OpenAI anchor types present on this page */}
          {(() => {
            if (!synthAiHighlights.length) return null;

            // Colors match PdfEvidenceOverlay.priorityClassName
            type AnchorLegendDef = { color: string; label: string; description: string };
            const ANCHOR_LEGEND: Record<string, AnchorLegendDef> = {
              thesis:       { color: "rgba(251,191, 36,0.85)", label: "Thesis",        description: "governing concept" },
              definition:   { color: "rgba(251,191, 36,0.85)", label: "Definition",    description: "what the term means" },
              examSignal:   { color: "rgba(251,191, 36,0.85)", label: "Exam Signal",   description: "high-yield pivot" },
              mechanism:    { color: "rgba( 96,165,250,0.85)", label: "Mechanism",     description: "how or why it works" },
              formula:      { color: "rgba(167,139,250,0.85)", label: "Formula",       description: "mathematical/biochemical rule" },
              clinicalTrap: { color: "rgba(251,113,133,0.85)", label: "Clinical Trap", description: "common error / danger" },
              application:  { color: "rgba( 45,212,191,0.85)", label: "Application",  description: "applied context" },
            };

            // Derive unique anchor types present on this page, preserving priority order
            const priorityOrder = ["thesis", "definition", "mechanism", "formula", "clinicalTrap", "examSignal", "application"];
            const presentTypes = new Map<string, number>(); // anchorType → count
            for (const anchor of synthAiHighlights) {
              presentTypes.set(anchor.anchorType, (presentTypes.get(anchor.anchorType) ?? 0) + 1);
            }
            // Merge amber types (thesis/definition/examSignal) into one entry if multiple are present
            const amberTypes = ["thesis", "definition", "examSignal"].filter((t) => presentTypes.has(t));
            const nonAmberTypes = ["mechanism", "formula", "clinicalTrap", "application"].filter((t) => presentTypes.has(t));
            const legendEntries: Array<AnchorLegendDef & { id: string; count: number }> = [];
            if (amberTypes.length) {
              const label = amberTypes.length === 1 ? (ANCHOR_LEGEND[amberTypes[0]]?.label ?? amberTypes[0]) : "Thesis / Definition";
              const count = amberTypes.reduce((s, t) => s + (presentTypes.get(t) ?? 0), 0);
              legendEntries.push({ id: "amber", color: "rgba(251,191,36,0.85)", label, description: "governing concept", count });
            }
            for (const t of nonAmberTypes) {
              const def = ANCHOR_LEGEND[t];
              if (def) legendEntries.push({ id: t, ...def, count: presentTypes.get(t) ?? 0 });
            }

            console.log("[LEGEND:dynamic]", { anchorTypes: [...presentTypes.keys()], entries: legendEntries.length });

            return (
              <div className="rounded-xl border border-white/10 bg-[rgb(11,18,34)]/90 backdrop-blur-sm px-2.5 py-2">
                <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-widest text-slate-500">Highlight key</div>
                <div className="space-y-1.5">
                  {legendEntries.map((entry) => (
                    <div key={entry.id} className="flex items-center gap-1.5">
                      <span
                        style={{
                          display: "inline-block",
                          width: 10,
                          height: 10,
                          borderRadius: 3,
                          background: entry.color,
                          flexShrink: 0,
                        }}
                      />
                      <div className="min-w-0 flex items-baseline gap-1">
                        <span className="text-[10px] text-slate-300">{entry.label}</span>
                        <span className="text-[9px] text-slate-500">— {entry.description}</span>
                        <span className="text-[9px] text-slate-600 ml-auto">{entry.count}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
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

          {/* Thought Detection FAB */}
          {!showThoughtPanel && (
            <button
              onClick={() => setShowThoughtPanel(true)}
              className="text-white p-3 rounded-2xl shadow-lg backdrop-blur-xl border border-white/20 transition-all transform hover:-translate-y-0.5 active:scale-95 duration-150 bg-[rgba(30,40,70,0.55)] hover:bg-[rgba(60,80,140,0.7)]"
              title="Open Shadow Recall"
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">🕶️</span>
                <span className="text-sm font-medium hidden sm:block">Shadow Recall</span>
              </div>
            </button>
          )}

          <button
            className="text-white p-3 rounded-2xl shadow-lg backdrop-blur-xl border border-white/20 transition-all transform hover:-translate-y-0.5 active:scale-95 duration-150 bg-[rgba(30,40,70,0.55)] hover:bg-[rgba(60,80,140,0.7)]"
            title="Speech mode is coming soon"
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">🎤</span>
              <span className="text-sm font-medium hidden sm:block">Speech (Soon)</span>
            </div>
          </button>
          
          {/* Whiteboard FAB */}
          {!showWhiteboardPanel && (
            <button
              onClick={() => {
                setShowWhiteboardPanel(true);
                if (!wbConcept && thoughtUnits.length > 0) {
                  const currentConcept = conceptForPage(currentPage, thoughtUnits, pdfPageCount);
                  if (currentConcept) {
                    setWbConcept(truncate(currentConcept, 600));
                    setWbContext(titleForPage(tableOfContents, currentPage));
                  } else {
                    setWbConcept("Current page content");
                    setWbContext(`Page ${currentPage}`);
                  }
                }
              }}
              className="text-white p-3 rounded-2xl shadow-lg backdrop-blur-xl border border-white/20 transition-all transform hover:-translate-y-0.5 active:scale-95 duration-150 bg-[rgba(30,40,70,0.55)] hover:bg-[rgba(60,80,140,0.7)]"
              title="Open Whiteboard Explanation"
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">🎨</span>
                <span className="text-sm font-medium hidden sm:block">Whiteboard</span>
              </div>
            </button>
          )}
        </div>

      {/* Sliding Shadow Recall Panel */}
      {showThoughtPanel && (
        <div className="fixed top-0 left-0 w-full sm:w-[480px] h-full bg-gray-900/95 backdrop-blur-md text-white z-50 flex flex-col shadow-2xl border-r border-gray-700">
          <div className="flex justify-between items-center p-4 border-b border-gray-700">
            <h3 className="text-lg font-semibold">🕶️ Shadow Recall</h3>
            <button
              onClick={() => setShowThoughtPanel(false)}
              className="text-gray-400 hover:text-white transition-colors p-2 rounded-lg hover:bg-gray-800"
            >
              ✕
            </button>
          </div>
          
          <div className="flex-1 overflow-auto p-4">
            <div className="mb-4 p-3 bg-blue-900/30 rounded-lg border border-blue-700/30">
              <div className="text-sm text-blue-300 mb-1">
                📖 Page {currentPage} {uploadedFile?.name && `• ${truncate(uploadedFile.name, 30)}`}
              </div>
              <div className="text-xs text-gray-400">{titleForPage(tableOfContents, currentPage)}</div>
            </div>

            <ShadowRecallPanel key={pageTruthKey} pageStory={currentPageStory} pageTruthKey={pageTruthKey} />

            <details className="mt-4 rounded-lg border border-purple-400/30 bg-purple-900/15 p-3">
              <summary className="cursor-pointer text-xs uppercase tracking-wide text-purple-200">Show evidence details</summary>
              <div className="mt-3 rounded-lg border border-purple-400/20 bg-purple-900/20 p-3">
                <p className="text-xs text-slate-300">Classification: {currentPanelPayload.classification.pageType} ({Math.round(currentPanelPayload.classification.confidence * 100)}% confidence)</p>
                <p className="mt-1 text-xs text-slate-300">High-yield extracted: {(currentSignals.paragraphSignals || []).length} • Suppressed filler: {(currentSignals.rawParagraphSignals || []).filter((p) => p.suppress).length}</p>
                {limitedEvidence ? <p className="mt-1 text-xs text-amber-200">Weak evidence detected — outputs are conservative.</p> : null}
              </div>
              <div className="mt-3 space-y-2">
                {(currentSignals.paragraphSignals || []).slice(0, 4).map((p, idx) => (
                  <button key={`${p.index}-${idx}`} onClick={() => setFocusSnippet(p.text)} className="w-full rounded border border-emerald-400/20 bg-emerald-500/10 px-2 py-1 text-left text-xs text-emerald-100 hover:bg-emerald-500/20">
                    #{idx + 1} ({p.kind}, exam={p.examSignalScore.toFixed(2)}): {truncate(p.text, 120)}
                  </button>
                ))}
              </div>
            </details>

            {/* Previous Thoughts */}
            {detectedThoughts.length > 0 && (
              <div className="space-y-4">
                <h4 className="text-sm font-medium text-gray-300 border-b border-gray-700 pb-2">
                  💭 Your Recent Thoughts ({detectedThoughts.length})
                </h4>
                
                <div className="space-y-3 max-h-60 overflow-y-auto">
                  {detectedThoughts.map((thought, index) => (
                    <div
                      key={thought.id}
                      className="p-3 bg-gray-800/50 rounded-lg border border-gray-700/50"
                    >
                      {/* Thought metadata */}
                      <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
                        <span>
                          {thought.analysis.thoughtType === 'question' && '❓'}
                          {thought.analysis.thoughtType === 'insight' && '💡'}
                          {thought.analysis.thoughtType === 'confusion' && '🤔'}
                          {thought.analysis.thoughtType === 'connection' && '🔗'}
                          {thought.analysis.thoughtType === 'reflection' && '🧠'}
                          {' '}
                          {thought.analysis.thoughtType}
                        </span>
                        <span>
                          Page {thought.page} • {thought.timestamp.toLocaleTimeString()}
                        </span>
                      </div>
                      
                      {/* Thought text */}
                      <div className="text-sm text-gray-200 mb-2">
                        "{truncate(thought.text, 100)}"
                      </div>
                      
                      {/* Keywords */}
                      {thought.analysis.keywords.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {thought.analysis.keywords.slice(0, 3).map((keyword: string, keyIndex: number) => (
                            <span
                              key={keyIndex}
                              className="px-2 py-1 bg-blue-900/30 text-blue-200 rounded text-xs"
                            >
                              {keyword}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
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

      {/* Sliding Whiteboard Panel */}
      {showWhiteboardPanel && (
        <div className="fixed top-0 right-0 w-full sm:w-[480px] h-full bg-gray-900/95 backdrop-blur-md text-white z-50 flex flex-col shadow-2xl border-l border-gray-700">
          <div className="flex justify-between items-center p-4 border-b border-gray-700">
            <h3 className="text-lg font-semibold">🎨 Whiteboard</h3>
            <button
              onClick={() => setShowWhiteboardPanel(false)}
              className="text-gray-400 hover:text-white transition-colors p-2 rounded-lg hover:bg-gray-800"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-auto p-4">
            <UnderConstructionPanel
              icon="🎨"
              title="Whiteboard"
              subtitle="Whiteboard is intentionally disabled while extraction-first workflows are being stabilized."
              bullets={["Explain-on-page", "Diagram sketching", "Voice walkthrough", "Sticky synthesis notes"]}
            />
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
              Guest mode: uploads are stored locally for this session only.
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
                  <span onClick={() => handleLoadPDF(pdf.url, pdf.name)} className="cursor-pointer">
                    {pdf.name}
                  </span>
                  <button
                    onClick={() => handleDeletePDF(pdf.id, pdf.name, pdf.isLocal)}
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

      {/* Highlight Popup (unified selection) */}
      {sel.popupPosition && sel.selectionText && (
        <HighlightPopup
          position={sel.popupPosition}
          selectionText={sel.selectionText}
          onCreateNote={() => handleOpenRightBrainNote(sel.selectionText)}
          onCreateDetailedNote={async () => {
            const note = await sel.createDetailedNote({
              discipline: "dentistry",
              style: "detailed",
            });
            if (note) {
              await handleOpenRightBrainNote(note, undefined, "highYield");
            } else {
              console.log("📝 Note creation completed");
            }
          }}
          onAddFlashcard={() => console.log("Flashcard created")}
          onAttachLink={() => setShowLinkModal(true)}
          onClose={() => sel.clearSelection()}
        />
      )}

      {showLinkModal && (
        <LinkVideoModal
          onClose={() => setShowLinkModal(false)}
          onSave={(url) => {
            setAttachments((prev) => [...prev, url]);
            console.log("📎 Link attached:", url);
            setShowLinkModal(false);
          }}
        />
      )}

      {/* Surgeon View: Highlight Action Menu */}
      <HighlightActionMenu
        selectedText={currentSelection?.text || ''}
        position={highlightMenuPosition}
        onAction={handleHighlightAction}
        onClose={() => {
          setShowHighlightMenu(false);
          setCurrentSelection(null);
        }}
        visible={showHighlightMenu}
      />

    </div>
  );
}
