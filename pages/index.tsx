// pages/index.tsx
import dynamic from "next/dynamic";
import React, { useState, useEffect, useRef, useMemo, useCallback, ChangeEvent } from "react";

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
import SyllabusModePanel from "@/components/SyllabusModePanel";

// Pure View components (Strict Mode Separation - V1)
import PureReaderView from "@/components/PureReaderView";
import PureTocView from "@/components/PureTocView";
import PureSurgeonView from "@/components/PureSurgeonView";
import PureNoteLabView from "@/components/PureNoteLabView";

// Store imports
import { useTocStore } from "@/lib/stores/tocStore";

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

import EnhancedWhiteboard from "@/components/EnhancedWhiteboard";
import LibraryPanel from "@/components/LibraryPanel";
import ChunkRail from "@/components/ChunkRail";
import { MultiViewContainer } from "@/components/ViewContainer";
import { useReaderSync, stableChunkId, analyzeContentDensity } from "@/lib/readerSync";
import { useUnifiedNavigation } from "@/lib/useUnifiedNavigation";
import ThoughtDetectionWidget from "@/components/ThoughtDetectionWidget";

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

type StickyNote = { pageNumber: number; content: string };

/* ----------------------- helpers ----------------------- */
function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
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
    setPage, 
    setUnitIndex, 
    setActiveChunkId, 
    updateSync,
    initializeContent,
    updateContentDensity
  } = useReaderSync();

  // Unified navigation hook for consistent navigation across all components
  const { jumpToPage, jumpToChapter, navigateProgrammatically } = useUnifiedNavigation();

  // Subscribe to global sync changes for cross-view synchronization
  useEffect(() => {
    console.log(`🔄 Global sync state changed: page=${page}, unit=${unitIndex}, chunk=${activeChunkId}`);
    
    // Update local state when global sync changes (but avoid loops)
    if (page !== currentPage) {
      console.log(`🔄 Syncing local page: ${currentPage} -> ${page}`);
      setCurrentPage(page);
    }
    
    if (unitIndex !== currentThoughtUnit) {
      console.log(`🔄 Syncing local unit: ${currentThoughtUnit} -> ${unitIndex}`);
      setCurrentThoughtUnit(unitIndex);
    }
  }, [page, unitIndex, activeChunkId]);

  /* =========================================================================
     🔹 State
  ========================================================================= */
  const [user, setUser] = useState<any>(null);
  const USER_ID = user?.uid || "guest-user";

  const [thoughtUnits, setThoughtUnits] = useState<ThoughtUnit[]>([]);
  const [currentThoughtUnit, setCurrentThoughtUnit] = useState(1);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  const [viewMode, setViewMode] =
    useState<"original" | "hybrid" | "pattern" | "notelab" | "toc" | "study" | "syllabus">("original");

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
  const [fontFamily, setFontFamily] = useState("sans-serif");
  const [lineSpacing, setLineSpacing] = useState(1.5);
  const [clickSwitchesTo, setClickSwitchesTo] = useState(false);
  const [sampleText, setSampleText] = useState("");
  const [darkMode, setDarkMode] = useState(true);

  // Voice settings state
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [speechRate, setSpeechRate] = useState(1.0);

  const [tableOfContents, setTableOfContents] = useState<TOCEntry[]>([]);
  const [showTOC] = useState(true);

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
        darkMode,
        fontFamily,
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
  }, [viewMode, currentPage, darkMode, fontFamily, fileUrl, thoughtUnits.length]);

  // Restore session on mount
  useEffect(() => {
    const restored = restoreSessionState();
    if (restored) {
      setViewMode(restored.viewMode || "original");
      setCurrentPage(restored.currentPage || 1);
      setCurrentThoughtUnit(restored.currentThoughtUnit || 1);
      setDarkMode(restored.darkMode !== undefined ? restored.darkMode : true);
      setFontFamily(restored.fontFamily || "sans-serif");
      setFontSize(restored.fontSize || 16);
      setLineSpacing(restored.lineSpacing || 1.5);
      // Note: fileUrl and thoughtUnits will need to be re-uploaded as we can't store large data
    }
  }, []);

  const [showLibrary, setShowLibrary] = useState(false);
  const [pdfLibrary, setPdfLibrary] = useState<
    { id: string; name: string; url: string; uploadedAt: any; isLocal?: boolean }[]
  >([]);

  // Attachments + modal
  const [attachments, setAttachments] = useState<string[]>([]);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [bookId, setBookId] = useState<string>("default-book");

  // ✅ Auto-whiteboard control + data
  const [autoWhiteboard, setAutoWhiteboard] = useState<boolean>(false);
  const [showWhiteboardPanel, setShowWhiteboardPanel] = useState<boolean>(false);
  const [wbConcept, setWbConcept] = useState<string>("");
  const [wbContext, setWbContext] = useState<string>("");
  const [wbStickyNotes, setWbStickyNotes] = useState<StickyNote[]>([]);
  const lastDetectedUnitRef = useRef<string | null>(null);

  // 📑 TOC Panel control (like whiteboard)
  const [showTOCPanel, setShowTOCPanel] = useState<boolean>(false);


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

  // ✅ Readless Mode and PDRM Layout State
  const [readlessMode, setReadlessMode] = useState<boolean>(false);
  const [pdrmLayout, setPdrmLayout] = useState<'side' | 'under'>('side');

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

    // Reset thought units immediately to prevent race conditions
    setThoughtUnits([]);
    setCurrentThoughtUnit(1);

    setUploadedFile(file);
    setViewMode("original");
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
      
      // Heuristic TOC (viewer outline will override later)
      generateTOC(url).then((tocEntries) => {
        setTableOfContents(tocEntries);
        
        // Save to tocStore for persistence
        if (tocEntries && tocEntries.length > 0) {
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
        console.log('📑 No PDF outline found, will try heuristic extraction');
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
      if (viewMode === "hybrid") {
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
  const handleLoadPDF = (url: string) => {
    setFileUrl(url);
    setShowLibrary(false);
    setViewMode("original");
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
      // Update local state immediately for responsive UI
      setCurrentPage(page);
      const unit = pageToUnit(page, pdfPageCount, thoughtUnits.length);
      setCurrentThoughtUnit(unit);
      
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

  /* =========================================================================
     🔹 Render Reader Content with Persistent Views (Performance Optimized)
  ========================================================================= */
  const renderContent = () => {
    // 🔐 Gate the app: must be signed in before doing anything
    if (!user) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="bg-gray-800 text-white rounded-xl p-6 shadow-xl text-center w-[380px]">
            <h3 className="text-lg font-bold mb-2">Welcome to Thought Unit Reader</h3>
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

    // ✅ Surgeon View - PURE: Highlighting + Quiz (no TOC panel)
    if (viewMode === "hybrid") {
      // Get current page headings for Surgeon View
      const currentHeadings = tableOfContents
        .filter(entry => entry.pageNumber === currentPage)
        .map(entry => entry.title);
      
      // Find current chapter
      const currentChapter = tableOfContents.find((entry, idx) => {
        const nextEntry = tableOfContents[idx + 1];
        return entry.pageNumber <= currentPage && 
          (!nextEntry || nextEntry.pageNumber > currentPage);
      });
      
      return (
        <div className="h-full" data-testid="surgeon-view-container">
          <PureSurgeonView
            fileUrl={fileUrl}
            documentId={bookId}
            userId={USER_ID}
            currentPage={currentPage}
            pdfPageCount={pdfPageCount}
            thoughtUnits={thoughtUnits}
            currentThoughtUnit={currentThoughtUnit}
            chapterId={currentChapter?.title || `chapter-${currentPage}`}
            headings={currentHeadings}
            onPageChange={(p) => syncToPage(p)}
            onPageCount={(count) => setPdfPageCount(count)}
            onRecommendedAction={(action) => {
              if (action === 'study') {
                setViewMode("study");
              } else if (action === 'next_chapter') {
                // Navigate to next chapter
                const nextChapter = tableOfContents.find(
                  entry => entry.pageNumber > currentPage
                );
                if (nextChapter) {
                  syncToPage(nextChapter.pageNumber);
                }
              }
            }}
          />
        </div>
      );
    }

    // ✅ Show loading state during PDF parsing for NoteLab view
    // ✅ NoteLab View - PURE: NoteLab workspace only (no shared PDF)
    if (viewMode === "notelab") {
      const chaptersForNotelab = tableOfContents.map((entry, idx) => ({
        id: `chapter_${idx}`,
        title: entry.title,
        pageNumber: entry.pageNumber
      }));
      
      return (
        <div className="h-full" data-testid="notelab-view-container">
          <PureNoteLabView
            documentId={bookId}
            userId={USER_ID}
            documentTitle={tableOfContents[0]?.title || "Document"}
            chapters={chaptersForNotelab}
            onNavigateToPage={(pageIndex) => {
              syncToPage(pageIndex);
              // Navigate to Surgeon View to see context
              setViewMode("hybrid");
            }}
            onStartStudy={() => setViewMode("study")}
          />
        </div>
      );
    }

    // ✅ TOC View - PURE: Only TOC tree (NO PDF panel)
    if (viewMode === "toc") {
      return (
        <div className="h-full" data-testid="toc-view-container">
          <PureTocView
            documentId={bookId}
            documentName={tableOfContents[0]?.title || uploadedFile?.name || "Document"}
            currentPage={currentPage}
            pdfPageCount={pdfPageCount}
            onOpenInReader={(pageNumber) => {
              syncToPage(pageNumber);
              setViewMode("original");
            }}
            onOpenInSurgeon={(pageNumber) => {
              syncToPage(pageNumber);
              setViewMode("hybrid");
            }}
          />
        </div>
      );
    }

    // ✅ Study Session View - PURE: Study panel only (no shared PDF)
    if (viewMode === "study") {
      return (
        <div className="h-full" data-testid="study-view-container">
          <StudySessionPanel
            documentId={bookId}
            documentTitle={tableOfContents[0]?.title || "Document"}
            onNavigateToPage={(pageIdx) => {
              syncToPage(pageIdx + 1);
              // Navigate to Surgeon View to see context
              setViewMode("hybrid");
            }}
            onClose={() => setViewMode("original")}
          />
        </div>
      );
    }

    // ✅ Syllabus Mode View - PURE: Syllabus panel only (no shared PDF)
    if (viewMode === "syllabus") {
      const chaptersForSyllabus = tableOfContents.map((toc, idx) => ({
        id: `chapter_${idx}`,
        title: (toc as any).title || `Chapter ${idx + 1}`,
        pageNumber: (toc as any).pageNumber || (toc as any).page || idx + 1
      }));
      
      return (
        <div className="h-full" data-testid="syllabus-view-container">
          <SyllabusModePanel
            documentId={bookId}
            documentTitle={tableOfContents[0]?.title || uploadedFile?.name || "Document"}
            chapters={chaptersForSyllabus}
            onJumpToPage={(pageIndex) => {
              syncToPage(pageIndex);
              setViewMode("original");
            }}
            onStartStudySession={() => setViewMode("study")}
          />
        </div>
      );
    }

    // ✅ READER View - PURE: PDF ONLY (no thought units, no TOC, no annotations)
    // This is the DEFAULT view and handles viewMode === "original"
    if (viewMode === "original") {
      return fileUrl ? (
        <div className="h-full" data-testid="reader-view-container">
          <PureReaderView
            fileUrl={fileUrl}
            currentPage={currentPage}
            pdfPageCount={pdfPageCount}
            onPageChange={(p) => syncToPage(p)}
            onPageCount={(count) => setPdfPageCount(count)}
            onTextSelect={(t) => sel.setSelectionText(t)}
            fontSize={fontSize}
            fontFamily={fontFamily}
          />
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-full gap-6 bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900">
          <div className="text-center max-w-3xl">
            <div className="text-8xl mb-6">📖</div>
            <h3 className="text-4xl font-bold mb-4 text-white">Pure Reader Mode</h3>
            <p className="text-xl opacity-90 mb-8 text-gray-200">
              Distraction-free PDF reading. Use Surgeon View for highlighting and notes.
            </p>
          </div>
          
          <label className="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 hover:from-indigo-400 hover:via-purple-400 hover:to-pink-400 text-white px-10 py-5 rounded-2xl cursor-pointer font-bold text-xl transition-all transform hover:scale-105 shadow-2xl">
            📂 Upload PDF to Start Reading
            <input type="file" accept="application/pdf" onChange={handleUpload} className="hidden" />
          </label>
        </div>
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
  return (
    <div
      className={`min-h-screen flex flex-col ${
        darkMode ? "bg-gray-900 text-white" : "bg-white text-gray-900"
      }`}
    >
      <header className="bg-gradient-to-r from-purple-600 via-pink-500 to-yellow-400 text-white shadow-md">
        <div className="py-4 flex flex-col items-center justify-center text-center">
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-wide drop-shadow-lg">
            Surgeon-View PDRM
          </h1>
          <p className="text-sm md:text-lg italic opacity-90">Study smarter, learn faster.</p>
        </div>
      </header>

      {/* Quick controls */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-2 bg-gray-800">
        {/* Main Navigation Tabs */}
        <div className="flex items-center gap-1 bg-gray-900 rounded-lg p-1" data-testid="main-nav">
          <button
            onClick={() => setViewMode("original")}
            data-testid="nav-reader"
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              viewMode === "original" 
                ? "bg-yellow-500 text-black shadow-lg" 
                : "text-gray-300 hover:text-white hover:bg-gray-700"
            }`}
          >
            📖 Reader
          </button>
          <button
            onClick={() => setViewMode("toc")}
            data-testid="nav-toc"
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              viewMode === "toc" 
                ? "bg-orange-500 text-white shadow-lg" 
                : "text-gray-300 hover:text-white hover:bg-gray-700"
            }`}
          >
            📑 TOC
          </button>
          <button
            onClick={() => setViewMode("hybrid")}
            data-testid="nav-surgeon"
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              viewMode === "hybrid" 
                ? "bg-purple-500 text-white shadow-lg" 
                : "text-gray-300 hover:text-white hover:bg-gray-700"
            }`}
          >
            🔬 Surgeon View
          </button>
          <button
            onClick={() => setViewMode("notelab")}
            data-testid="nav-notelab"
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              viewMode === "notelab" 
                ? "bg-green-500 text-white shadow-lg" 
                : "text-gray-300 hover:text-white hover:bg-gray-700"
            }`}
          >
            📝 NoteLab
          </button>
          <button
            onClick={() => setViewMode("study")}
            data-testid="nav-study"
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              viewMode === "study" 
                ? "bg-blue-500 text-white shadow-lg" 
                : "text-gray-300 hover:text-white hover:bg-gray-700"
            }`}
          >
            🧠 Study
          </button>
          <button
            onClick={() => setViewMode("syllabus")}
            data-testid="nav-syllabus"
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              viewMode === "syllabus" 
                ? "bg-orange-500 text-white shadow-lg" 
                : "text-gray-300 hover:text-white hover:bg-gray-700"
            }`}
          >
            📋 Syllabus
          </button>
        </div>

        {/* Readless Mode Toggle */}
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={readlessMode}
            onChange={(e) => setReadlessMode(e.target.checked)}
          />
          <span>Readless Mode</span>
        </label>

        {/* PDRM Layout Toggle */}
        <div className="flex items-center gap-2 text-sm">
          <span className="opacity-80">Layout:</span>
          <button
            onClick={() => setPdrmLayout(pdrmLayout === 'side' ? 'under' : 'side')}
            className="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-xs"
          >
            {pdrmLayout === 'side' ? 'Side ▸' : 'Under ▾'}
          </button>
        </div>



        <div className="flex-1" />

        {/* Auto-whiteboard toggle */}
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={autoWhiteboard}
            onChange={(e) => setAutoWhiteboard(e.target.checked)}
          />
          <span>Auto-explain on Whiteboard</span>
          {showWhiteboardPanel && wbConcept && (
            <span className="ml-2 text-yellow-300">✨ Explaining…</span>
          )}
        </label>

        {/* Dyslexia Font Toggle */}
        <button
          onClick={() => setFontFamily((f) => f === "sans-serif" ? "Comic Sans MS, cursive" : "sans-serif")}
          className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600"
          title="Toggle Dyslexia-friendly font"
        >
          {fontFamily === "sans-serif" ? "🔤 Normal" : "🔤 Dyslexia"}
        </button>

        {/* Dark mode */}
        <button
          onClick={() => setDarkMode((d) => !d)}
          className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600"
        >
          {darkMode ? "🌙 Dark" : "☀️ Light"}
        </button>

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

        {/* DAT Apex */}
        <button
          onClick={() => window.location.href = '/apex'}
          className="text-xs px-3 py-1 rounded bg-gradient-to-r from-blue-500 to-electric-blue-500 text-white shadow hover:from-blue-400 hover:to-blue-600 transition-all"
        >
          ⚡ DAT Apex
        </button>

        {/* Library */}
        <button
          onClick={() => setShowLibrary(true)}
          className="text-xs px-3 py-1 rounded bg-yellow-500 text-black shadow"
        >
          📚 Library
        </button>

        {/* Chapter Absorption Pipeline Control */}
        {smartTOC.length > 0 && (
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
      <div className="flex-1 overflow-hidden">
        {/* Main Content - Pure View renders in full container */}
        <div className="w-full h-full bg-gray-800 rounded-lg overflow-auto">
          {renderContent()}
        </div>
      </div>

        {/* Floating Action Buttons - Bottom Right Stack */}
        <div className="fixed bottom-6 right-6 z-40 flex flex-col gap-3">
          {/* Chapter Absorption FAB */}
          {smartTOC.length > 0 && !absorptionState.showPanel && (
            <button
              onClick={() => setAbsorptionState(prev => ({ ...prev, showPanel: true }))}
              className={`p-3 rounded-full shadow-lg backdrop-blur-sm border transition-all transform hover:scale-105 ${
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
              className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white p-3 rounded-full shadow-lg backdrop-blur-sm border border-blue-400 transition-all transform hover:scale-105"
              title="Open Thought Detection"
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">💭</span>
                <span className="text-sm font-medium hidden sm:block">Thoughts</span>
              </div>
            </button>
          )}
          
          {/* Whiteboard FAB */}
          {!showWhiteboardPanel && (
            <button
              onClick={() => {
                setShowWhiteboardPanel(true);
                // If no concept is set, use current page content as concept
                if (!wbConcept && thoughtUnits.length > 0) {
                  const currentConcept = conceptForPage(currentPage, thoughtUnits, pdfPageCount);
                  if (currentConcept) {
                    setWbConcept(truncate(currentConcept, 600));
                    setWbContext(titleForPage(tableOfContents, currentPage));
                  } else {
                    // Fallback to a generic concept
                    setWbConcept("Current page content");
                    setWbContext(`Page ${currentPage}`);
                  }
                }
              }}
              className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white p-3 rounded-full shadow-lg backdrop-blur-sm border border-purple-400 transition-all transform hover:scale-105"
              title="Open Whiteboard Explanation"
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">🎨</span>
                <span className="text-sm font-medium hidden sm:block">Whiteboard</span>
              </div>
            </button>
          )}
        </div>

      {/* Sliding Thought Detection Panel */}
      {showThoughtPanel && (
        <div className="fixed top-0 left-0 w-full sm:w-[480px] h-full bg-gray-900/95 backdrop-blur-md text-white z-50 flex flex-col shadow-2xl border-r border-gray-700">
          <div className="flex justify-between items-center p-4 border-b border-gray-700">
            <h3 className="text-lg font-semibold">💭 Thought Detection</h3>
            <button
              onClick={() => setShowThoughtPanel(false)}
              className="text-gray-400 hover:text-white transition-colors p-2 rounded-lg hover:bg-gray-800"
            >
              ✕
            </button>
          </div>
          
          <div className="flex-1 overflow-auto p-4">
            {/* Current Page Context */}
            <div className="mb-4 p-3 bg-blue-900/30 rounded-lg border border-blue-700/30">
              <div className="text-sm text-blue-300 mb-1">
                📖 Page {currentPage} {uploadedFile?.name && `• ${truncate(uploadedFile.name, 30)}`}
              </div>
              <div className="text-xs text-gray-400">
                {titleForPage(tableOfContents, currentPage)}
              </div>
            </div>

            {/* Thought Input Widget */}
            <ThoughtDetectionWidget
              onThoughtDetected={handleThoughtDetected}
              placeholder="What are you thinking about this page? Write your thoughts, questions, or insights here..."
              className="mb-6"
            />

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

      {/* Chapter Absorption Pipeline Panel */}
      {absorptionState.showPanel && (
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
            <h3 className="text-lg font-semibold">🎨 Whiteboard Explanation</h3>
            <button
              onClick={() => setShowWhiteboardPanel(false)}
              className="text-gray-400 hover:text-white transition-colors p-2 rounded-lg hover:bg-gray-800"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-auto p-4">
            <EnhancedWhiteboard
              concept={wbConcept || "Current page content"}
              context={wbContext || `Page ${currentPage}`}
              stickyNotes={wbStickyNotes}
              autoTrigger={!!wbConcept}
              lessonTitle={
                uploadedFile?.name ? `Whiteboard — ${uploadedFile.name}` : "Whiteboard Lesson"
              }
              lessonId={bookId}
              userId={USER_ID}
              reExplainOnPageChange={true}
              currentPage={currentPage}
              containsDiagramOrFormula={containsDiagramOrFormula}
              selectedVoice={selectedVoice || undefined}
              onVoiceChange={setSelectedVoice}
              speechRate={speechRate}
              onSpeechRateChange={setSpeechRate}
              naturalVoiceEnabled={true}
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
                  <span onClick={() => handleLoadPDF(pdf.url)} className="cursor-pointer">
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
