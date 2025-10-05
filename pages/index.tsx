// pages/index.tsx
import dynamic from "next/dynamic";
import React, { useState, useEffect, useRef, useMemo, ChangeEvent } from "react";

import { generateTOC, type TOCEntry, outlineToTOC } from "@/lib/tocParser";
import TOCSidebar from "@/components/TOCSidebar";
import type { ThoughtUnit, ReadingStats } from "@/types/reading";
import { useFeatureFlags } from "@/lib/features/featureFlags";

// Feature flag controlled imports
import EnhancedHybridReader from "@/components/EnhancedHybridReader";
import PatternView from "@/components/PatternView";
import NoteLabView from "@/components/NoteLabView";
import CleanHybridReader from "@/components/CleanHybridReader";
import CleanRightBrainReader from "@/components/CleanRightBrainReader";
import HighlightPopup from "@/components/HighlightPopup";
import RightBrainNoteEditor from "@/components/RightBrainNoteEditor";
import LinkVideoModal from "@/components/LinkVideoModal";

// Prototype component import
import UniversalPatternButlerReader from "@/components/UniversalPatternButlerReader";

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
    useState<"original" | "hybrid" | "rightbrain" | "pattern" | "notelab">("original");

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

  // 🧠 Right-Brain prefill draft (for High-Yield / Sketch)
  const [rbDraftText, setRbDraftText] = useState<string>("");

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

  /* =========================================================================
     🔹 Auth Listener + complete redirect
  ========================================================================= */
  useEffect(() => {
    handleRedirectResult().catch(() => {});
    return listenForAuthChanges((u) => setUser(u));
  }, []);

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
     🔹 Unified selection hook
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
    if (!file || file.type !== "application/pdf") {
      alert("Please upload a PDF file.");
      return;
    }

    // ✅ Initialize parsing state
    setPdfParsingState({
      isLoading: true,
      error: null,
      progress: "Preparing file..."
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

      // Heuristic TOC (viewer outline will override later)
      generateTOC(url).then(setTableOfContents).catch(() => {});

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

      // ✅ Set error state
      setPdfParsingState({
        isLoading: false,
        error: errorMessage,
        progress: "Failed"
      });

      // Reset states on error
      setThoughtUnits([]);
      setFileUrl(null);
      setUploadedFile(null);
      
      alert(`Failed to process PDF: ${errorMessage}`);
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

  // Tab sync effects: snap Hybrid/Right-Brain to current chapter's first unit when switching tabs
  useEffect(() => {
    try {
      if (viewMode === "hybrid" || viewMode === "rightbrain") {
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
      alert("Select text first to create a top student note.");
      return;
    }

    console.log(`🎓 Creating ${mode || 'standard'} note for: ${seed.slice(0, 50)}...`);

    try {
      if (mode === "highYield" || mode === "sketch") {
        const draft = await buildTopStudentNote(seed, mode);
        setRbDraftText(draft);
      } else {
        // Default to high-yield top student note
        const draft = await buildTopStudentNote(seed, "highYield");
        setRbDraftText(draft);
      }

      setViewMode("rightbrain");
    } catch (error) {
      console.error("Error creating top student note:", error);
      // Fallback to basic note
      setRbDraftText(
        [
          `# 📚 Study Note`,
          ``,
          `## Content`,
          seed,
          ``,
          `## My Understanding`,
          `[Add your insights here]`,
          ``,
          `## Key Points`,
          `- [Point 1]`,
          `- [Point 2]`,
          `- [Point 3]`,
        ].join("\n")
      );
      setViewMode("rightbrain");
    }
  };


  /* =========================================================================
     🔹 Enhanced Page/TOC sync with chapter-aware navigation + global sync
  ========================================================================= */
  // Unified navigation using the new system - all page changes go through here
  const syncToPage = (page: number, opts?: { reason?: 'SCROLL' | 'TOC_JUMP' | 'PROGRAMMATIC' }) => {
    const reason = opts?.reason || 'PROGRAMMATIC';
    console.log(`📄 index.tsx syncToPage called: navigating to page ${page} (current: ${currentPage}) reason: ${reason}`);
    
    // Validate page bounds
    if (page < 1 || (pdfPageCount > 0 && page > pdfPageCount)) {
      console.warn(`📄 index.tsx: Invalid page ${page}, bounds: 1-${pdfPageCount}`);
      return;
    }
    
    try {
      // Use unified navigation system for TOC jumps
      if (reason === 'TOC_JUMP') {
        console.log(`📄 TOC_JUMP: Using unified navigation for chapter-aware navigation to page ${page}`);
        
        // Find the chapter that contains this page
        let nearestChapter: TOCEntry | null = null;
        for (const tocEntry of tableOfContents) {
          const tocPage = getTocPage(tocEntry);
          if (tocPage && tocPage <= page) {
            const nearestTocPage = nearestChapter ? getTocPage(nearestChapter) : undefined;
            if (!nearestChapter || (nearestTocPage !== undefined && tocPage > nearestTocPage)) {
              nearestChapter = tocEntry;
            }
          }
        }
        
        if (nearestChapter) {
          const chapterTitle = (nearestChapter as any).title || `Chapter at page ${page}`;
          console.log(`📄 TOC_JUMP: Found chapter "${chapterTitle}"`);
          
          // Use unified chapter navigation
          jumpToChapter(chapterTitle, {
            onSuccess: (resultPage, resultTitle) => {
              console.log(`📄 TOC_JUMP: Successfully navigated to ${resultTitle} (page ${resultPage})`);
              setCurrentPage(resultPage);
              const unit = pageToUnit(resultPage, pdfPageCount, thoughtUnits.length);
              setCurrentThoughtUnit(unit);
            },
            onError: (error) => {
              console.warn(`📄 TOC_JUMP: Chapter navigation failed, using page navigation:`, error);
              // Fallback to direct page navigation
              jumpToPage(page, 'toc', {
                onSuccess: (resultPage) => {
                  console.log(`📄 TOC_JUMP: Page navigation success: ${resultPage}`);
                  setCurrentPage(resultPage);
                  const unit = pageToUnit(resultPage, pdfPageCount, thoughtUnits.length);
                  setCurrentThoughtUnit(unit);
                },
                onError: (error) => {
                  console.error(`📄 TOC_JUMP: Page navigation also failed:`, error);
                }
              });
            }
          });
        } else {
          // No chapter found, use direct page navigation
          console.log(`📄 TOC_JUMP: No chapter found, using direct page navigation`);
          jumpToPage(page, 'toc', {
            onSuccess: (resultPage) => {
              console.log(`📄 TOC_JUMP: Direct page navigation success: ${resultPage}`);
              setCurrentPage(resultPage);
              const unit = pageToUnit(resultPage, pdfPageCount, thoughtUnits.length);
              setCurrentThoughtUnit(unit);
            }
          });
        }
      } else {
        // Normal scroll/programmatic navigation using unified system
        const source = reason === 'SCROLL' ? 'pdf' : 'manual';
        console.log(`📄 ${reason}: Using unified navigation with source: ${source}`);
        
        jumpToPage(page, source, {
          onSuccess: (resultPage) => {
            console.log(`📄 ${reason}: Navigation success: ${resultPage}`);
            setCurrentPage(resultPage);
            const unit = pageToUnit(resultPage, pdfPageCount, thoughtUnits.length);
            setCurrentThoughtUnit(unit);
          },
          onError: (error) => {
            console.error(`📄 ${reason}: Navigation error:`, error);
            // Fallback: just update local state
            setCurrentPage(page);
            const unit = pageToUnit(page, pdfPageCount, thoughtUnits.length);
            setCurrentThoughtUnit(unit);
          }
        });
      }

      // Auto-whiteboard trigger (unchanged)
      if (autoWhiteboard) {
        const seed = conceptForPage(page, thoughtUnits, pdfPageCount);
        if (seed) {
          setWbConcept(truncate(seed, 600));
          const title = titleForPage(tableOfContents, page);
          setWbContext(title);
          setShowWhiteboardPanel(true);
        }
      }
      
    } catch (error) {
      console.error(`📄 index.tsx: Navigation error for page ${page}:`, error);
      
      // Fallback: just update local state
      try {
        setCurrentPage(page);
        const unit = pageToUnit(page, pdfPageCount, thoughtUnits.length);
        setCurrentThoughtUnit(unit);
        console.log(`📄 index.tsx: Fallback navigation to page ${page} succeeded`);
      } catch (fallbackError) {
        console.error(`📄 index.tsx: Fallback navigation failed:`, fallbackError);
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

    // 🎯 PROTOTYPE TESTING MODE - Route to UniversalPatternButlerReader
    if (isFeatureEnabled('PROTOTYPE_TESTING_MODE') && isFeatureEnabled('ENABLE_UNIVERSAL_PATTERN_BUTLER')) {
      console.log('🎯 Prototype testing mode active - routing to UniversalPatternButlerReader');
      
      return fileUrl && thoughtUnits.length > 0 ? (
        <div className="h-full flex flex-col">
          {/* Prototype Testing Header */}
          <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🎯</span>
              <div>
                <h3 className="text-lg font-bold">Universal Pattern Butler Reader - PROTOTYPE</h3>
                <p className="text-sm opacity-90">Advanced three-way component merger testing</p>
              </div>
            </div>
            <div className="text-sm bg-white/20 backdrop-blur rounded-lg px-3 py-1">
              Testing Mode Active
            </div>
          </div>
          
          {/* Universal Pattern Butler Reader Component */}
          <div className="flex-1 overflow-hidden">
            <UniversalPatternButlerReader
              bookId={bookId}
              userId={USER_ID}
              pdfUrl={fileUrl}
              currentPage={currentPage}
              pdfPageCount={pdfPageCount}
              onPageChange={(p) => syncToPage(p)}
              thoughtUnits={thoughtUnits}
              currentThoughtUnit={currentThoughtUnit}
              setCurrentThoughtUnit={setCurrentThoughtUnit}
              highlightedWord={highlightedWord}
              setHighlightedWord={setHighlightedWord}
              onWordClick={(w) => {
                setHighlightedWord(w);
                if (autoWhiteboard && w.trim()) {
                  setWbConcept(truncate(w, 600));
                  setWbContext(`p.${currentPage}`);
                  setShowWhiteboardPanel(true);
                }
              }}
              onTextSelect={(t) => sel.setSelectionText(t)}
              onGenerateNote={handleOpenRightBrainNote}
              selBind={sel.bind}
              externalSelectionText={sel.selectionText}
              fontSize={fontSize}
              fontFamily={fontFamily}
              lineSpacing={lineSpacing}
              selectedVoice={selectedVoice || undefined}
              onVoiceChange={setSelectedVoice}
              speechRate={speechRate}
              onSpeechRateChange={setSpeechRate}
              tableOfContents={tableOfContents}
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-full gap-6 bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900">
          <div className="text-center max-w-3xl">
            <div className="text-8xl mb-6">🎯</div>
            <h3 className="text-4xl font-bold mb-4 text-white">Universal Pattern Butler Reader</h3>
            <p className="text-xl opacity-90 mb-8 text-gray-200">
              Prototype Testing Mode - Advanced Three-Way Component Merger
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10 text-base">
              <div className="bg-black/30 rounded-xl p-6 border border-green-500/40">
                <div className="text-4xl mb-4">📖</div>
                <h4 className="font-bold text-green-400 mb-2">Pattern Exploration</h4>
                <p className="text-gray-300">Real-time universal pattern detection with confidence scoring</p>
              </div>
              <div className="bg-black/30 rounded-xl p-6 border border-blue-500/40">
                <div className="text-4xl mb-4">🎯</div>
                <h4 className="font-bold text-blue-400 mb-2">Active Training</h4>
                <p className="text-gray-300">Step-by-step pattern application with self-assessment</p>
              </div>
              <div className="bg-black/30 rounded-xl p-6 border border-purple-500/40">
                <div className="text-4xl mb-4">🧠</div>
                <h4 className="font-bold text-purple-400 mb-2">Butler Analysis</h4>
                <p className="text-gray-300">Advanced thought unit detection with metaphors</p>
              </div>
            </div>
          </div>
          
          <label className="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 hover:from-indigo-400 hover:via-purple-400 hover:to-pink-400 text-white px-10 py-5 rounded-2xl cursor-pointer font-bold text-xl transition-all transform hover:scale-105 shadow-2xl">
            📂 Upload PDF to Test Universal Pattern Butler
            <input type="file" accept="application/pdf" onChange={handleUpload} className="hidden" />
          </label>
          
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-400 mb-2">Testing prototype merger of:</p>
            <div className="flex gap-4 text-xs">
              <span className="bg-green-600/20 text-green-300 px-2 py-1 rounded">PatternView</span>
              <span className="bg-blue-600/20 text-blue-300 px-2 py-1 rounded">CleanHybridReader</span>
              <span className="bg-purple-600/20 text-purple-300 px-2 py-1 rounded">PatternTrainingHybridReader</span>
            </div>
          </div>
        </div>
      );
    }

    // ✅ Enhanced View System - Optimized for Performance
    if (fileUrl && thoughtUnits.length > 0) {
      // Return the appropriate view based on viewMode
      if (viewMode === "hybrid") {
        return fileUrl ? (
            <div className="h-full flex flex-col">
              {/* Enhanced Hybrid Reader Controls */}
              <div className="bg-gray-800 border-b border-gray-700 p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-semibold text-green-400">🧠 Enhanced Hybrid Reader</h3>
                  <span className="text-sm text-gray-400">
                    Page {currentPage} of {pdfPageCount} • Unit {currentThoughtUnit} of {thoughtUnits.length}
                  </span>
                </div>
                
                {/* Unified Enhanced Thought Unit Button */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={async () => {
                      try {
                        // Get current text - either selection or current thought unit
                        const selectedText = sel.selectionText?.trim();
                        const currentUnitText = thoughtUnits[currentThoughtUnit - 1]?.text?.trim();
                        const textToAnalyze = selectedText || currentUnitText || "";
                        
                        if (!textToAnalyze) {
                          alert("No text available for analysis. Please select text or ensure a thought unit is loaded.");
                          return;
                        }
                        
                        console.log("🧠 Enhanced TU Analysis starting for:", textToAnalyze.slice(0, 50) + "...");
                        
                        // Create comprehensive enhanced note combining idea extraction and thought units
                        const enhancedNote = await buildTopStudentNote(textToAnalyze, "highYield");
                        
                        // Set the note and switch to right-brain view
                        setRbDraftText(enhancedNote);
                        setViewMode("rightbrain");
                        
                        console.log("✅ Enhanced TU Analysis complete, switching to right-brain view");
                      } catch (error) {
                        console.error("❌ Enhanced TU Analysis failed:", error);
                        alert("Analysis failed. Please try again.");
                      }
                    }}
                    className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white px-4 py-2 rounded-lg font-medium shadow-lg transition-all transform hover:scale-105 flex items-center gap-2"
                    title="Generate Enhanced Thought Unit Analysis"
                  >
                    <span className="text-lg">🧠✨</span>
                    <span>Enhanced TU Analysis</span>
                  </button>
                  
                  {/* Quick Visual Note Button */}
                  <button
                    onClick={async () => {
                      const selectedText = sel.selectionText?.trim();
                      const currentUnitText = thoughtUnits[currentThoughtUnit - 1]?.text?.trim();
                      const textToAnalyze = selectedText || currentUnitText || "";
                      
                      if (!textToAnalyze) {
                        alert("No text available. Please select text or ensure a thought unit is loaded.");
                        return;
                      }
                      
                      try {
                        const visualNote = await buildTopStudentNote(textToAnalyze, "sketch");
                        setRbDraftText(visualNote);
                        setViewMode("rightbrain");
                      } catch (error) {
                        console.error("Visual note creation failed:", error);
                        alert("Visual note creation failed. Please try again.");
                      }
                    }}
                    className="bg-gradient-to-r from-orange-500 to-pink-500 hover:from-orange-400 hover:to-pink-400 text-white px-3 py-2 rounded-lg font-medium transition-all flex items-center gap-2"
                    title="Create David Butler-Style Visual Note"
                  >
                    <span>🎨</span>
                    <span>Visual Note</span>
                  </button>
                </div>
              </div>
              
              {/* Main Reader Component */}
              <div className="flex-1 overflow-hidden">
                <CleanHybridReader
                  bookId={bookId}
                  userId={USER_ID}
                  thoughtUnits={thoughtUnits}
                  currentThoughtUnit={currentThoughtUnit}
                  pdfUrl={fileUrl}
                  currentPage={currentPage}
                  pdfPageCount={pdfPageCount}
                  sampleText={sampleText}
                  setCurrentThoughtUnit={setCurrentThoughtUnit}
                  highlightedWord={highlightedWord}
                  setHighlightedWord={setHighlightedWord}
                  onPageChange={(p) => syncToPage(p)}
                  fontSize={fontSize}
                  fontFamily={fontFamily}
                  lineSpacing={lineSpacing}
                  onWordClick={(w) => {
                    setHighlightedWord(w);
                    if (autoWhiteboard && w.trim()) {
                      setWbConcept(truncate(w, 600));
                      setWbContext(`p.${currentPage}`);
                      setShowWhiteboardPanel(true);
                    }
                  }}
                  onTextSelect={(t) => sel.setSelectionText(t)}
                  onGenerateNote={handleOpenRightBrainNote}
                  selBind={sel.bind}
                  tableOfContents={tableOfContents}
                  selectedVoice={selectedVoice || undefined}
                  onVoiceChange={setSelectedVoice}
                  speechRate={speechRate}
                  onSpeechRateChange={setSpeechRate}
                />
              </div>
              
              {/* Bottom Status Bar */}
              <div className="bg-gray-800 border-t border-gray-700 px-4 py-2 flex items-center justify-between text-sm">
                <div className="flex items-center gap-4">
                  <span className="text-green-400">
                    ✅ Enhanced Mode Active
                  </span>
                  <span className="text-gray-400">
                    {sel.selectionText ? `Selected: "${sel.selectionText.slice(0, 30)}..."` : "No selection"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">Current Unit:</span>
                  <span className="text-white font-medium">
                    {thoughtUnits[currentThoughtUnit - 1]?.text?.slice(0, 50) || "Loading..."}...
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-6 bg-gradient-to-br from-gray-900 via-green-900 to-teal-900">
              <div className="text-center max-w-2xl">
                <div className="text-6xl mb-4">🧠✨</div>
                <h3 className="text-3xl font-bold mb-4 text-white">Enhanced Hybrid Reading</h3>
                <p className="text-lg opacity-90 mb-6 text-gray-200">
                  Advanced AI-powered reading with David Butler metaphors, thought unit analysis, and enhanced learning
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 text-sm">
                  <div className="bg-black/20 rounded-lg p-4 border border-green-500/30">
                    <div className="text-2xl mb-2">🧠</div>
                    <h4 className="font-semibold text-green-400">Thought Unit Detection</h4>
                    <p className="text-gray-300">Smart concept recognition and analysis</p>
                  </div>
                  <div className="bg-black/20 rounded-lg p-4 border border-blue-500/30">
                    <div className="text-2xl mb-2">🎭</div>
                    <h4 className="font-semibold text-blue-400">Butler Metaphors</h4>
                    <p className="text-gray-300">Medical/educational analogies for understanding</p>
                  </div>
                  <div className="bg-black/20 rounded-lg p-4 border border-purple-500/30">
                    <div className="text-2xl mb-2">✨</div>
                    <h4 className="font-semibold text-purple-400">Enhanced Analysis</h4>
                    <p className="text-gray-300">AI-powered idea extraction and learning</p>
                  </div>
                </div>
              </div>
              
              <label className="bg-gradient-to-r from-green-500 to-teal-500 hover:from-green-400 hover:to-teal-400 text-white px-8 py-4 rounded-xl cursor-pointer font-semibold text-lg transition-all transform hover:scale-105 shadow-xl">
                📂 Upload PDF to Begin Enhanced Reading
                <input type="file" accept="application/pdf" onChange={handleUpload} className="hidden" />
              </label>
            </div>
          );
        }
      }

    // ✅ Show loading state during PDF parsing for Pattern view
    if (viewMode === "pattern") {
      // Show loading state during parsing
      if (pdfParsingState.isLoading) {
        return (
          <div className="flex flex-col items-center justify-center h-full gap-6 bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900">
            <div className="text-center max-w-2xl">
              <div className="animate-spin text-6xl mb-4">🎯</div>
              <h3 className="text-3xl font-bold mb-4 text-white">Processing for Pattern Training</h3>
              <p className="text-lg opacity-90 mb-6 text-gray-200">
                {pdfParsingState.progress}
              </p>
              <div className="flex items-center justify-center gap-2">
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            </div>
          </div>
        );
      }

      // Show error state if parsing failed
      if (pdfParsingState.error) {
        return (
          <div className="flex flex-col items-center justify-center h-full gap-6 bg-gradient-to-br from-gray-900 via-red-900 to-purple-900">
            <div className="text-center max-w-2xl">
              <div className="text-6xl mb-4">❌</div>
              <h3 className="text-3xl font-bold mb-4 text-white">Pattern Training Unavailable</h3>
              <p className="text-lg mb-6 text-red-300">
                {pdfParsingState.error}
              </p>
              <button
                onClick={() => window.location.reload()}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-lg text-white font-medium"
              >
                🔄 Try Again
              </button>
            </div>
          </div>
        );
      }

      return fileUrl && thoughtUnits.length > 0 ? (
        <div className="h-full flex flex-col">
          {/* Pattern Training Butler Header */}
          <div className="bg-gray-800 border-b border-gray-700 p-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-semibold text-blue-400">🎯 Pattern Training Butler</h3>
              <span className="text-sm text-gray-400">
                Page {currentPage} of {pdfPageCount} • Unit {currentThoughtUnit} of {thoughtUnits.length}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  const selectedText = sel.selectionText?.trim();
                  const currentUnitText = thoughtUnits[currentThoughtUnit - 1]?.text?.trim();
                  const textToAnalyze = selectedText || currentUnitText || "";
                  
                  if (textToAnalyze) {
                    try {
                      const patternNote = await buildTopStudentNote(textToAnalyze, "highYield");
                      setRbDraftText(patternNote);
                      setViewMode("rightbrain");
                    } catch (error) {
                      console.error("Pattern note creation failed:", error);
                    }
                  }
                }}
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white px-3 py-2 rounded-lg font-medium"
              >
                🎯 Pattern Note
              </button>
            </div>
          </div>
          
          {/* Integrated Pattern Training Hybrid Reader */}
          <div className="flex-1 overflow-hidden">
            <PatternTrainingHybridReader
              bookId={bookId}
              userId={USER_ID}
              pdfUrl={fileUrl}
              currentPage={currentPage}
              pdfPageCount={pdfPageCount}
              onPageChange={(p) => syncToPage(p)}
              thoughtUnits={thoughtUnits}
              currentThoughtUnit={currentThoughtUnit}
              setCurrentThoughtUnit={setCurrentThoughtUnit}
              highlightedWord={highlightedWord}
              setHighlightedWord={setHighlightedWord}
              onWordClick={(w) => {
                setHighlightedWord(w);
                if (autoWhiteboard && w.trim()) {
                  setWbConcept(truncate(w, 600));
                  setWbContext(`p.${currentPage}`);
                  setShowWhiteboardPanel(true);
                }
              }}
              onTextSelect={(t) => sel.setSelectionText(t)}
              onGenerateNote={handleOpenRightBrainNote}
              selBind={sel.bind}
              externalSelectionText={sel.selectionText}
              fontSize={fontSize}
              fontFamily={fontFamily}
              lineSpacing={lineSpacing}
              selectedVoice={selectedVoice || undefined}
              onVoiceChange={setSelectedVoice}
              speechRate={speechRate}
              onSpeechRateChange={setSpeechRate}
              tableOfContents={tableOfContents}
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-full gap-6 bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900">
          <div className="text-center max-w-2xl">
            <div className="text-6xl mb-4">🎯</div>
            <h3 className="text-3xl font-bold mb-4 text-white">DAT Pattern Recognition Training</h3>
            <p className="text-lg opacity-90 mb-6 text-gray-200">
              Master 14 high-yield patterns including CARDIO, 5Q Rule, SN/E Flow, and more for DAT success
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8 text-sm">
              <div className="bg-black/20 rounded-lg p-4 border border-blue-500/30">
                <div className="text-2xl mb-2">🧪</div>
                <h4 className="font-semibold text-blue-400">Organic Chemistry</h4>
                <p className="text-gray-300">CARDIO, 5Q Rule, SN/E Flow, EAS patterns</p>
              </div>
              <div className="bg-black/20 rounded-lg p-4 border border-green-500/30">
                <div className="text-2xl mb-2">⚗️</div>
                <h4 className="font-semibold text-green-400">General Chemistry</h4>
                <p className="text-gray-300">Q vs K, ΔG signs, Gas Laws patterns</p>
              </div>
              <div className="bg-black/20 rounded-lg p-4 border border-purple-500/30">
                <div className="text-2xl mb-2">🧬</div>
                <h4 className="font-semibold text-purple-400">Biology</h4>
                <p className="text-gray-300">Organelles, Hardy-Weinberg, Reading patterns</p>
              </div>
              <div className="bg-black/20 rounded-lg p-4 border border-yellow-500/30">
                <div className="text-2xl mb-2">🦷</div>
                <h4 className="font-semibold text-yellow-400">Dentistry</h4>
                <p className="text-gray-300">Caries treatment, Endodontic diagnosis</p>
              </div>
              <div className="bg-black/20 rounded-lg p-4 border border-pink-500/30">
                <div className="text-2xl mb-2">📖</div>
                <h4 className="font-semibold text-pink-400">Reading Comprehension</h4>
                <p className="text-gray-300">Cause-Effect, Compare-Contrast patterns</p>
              </div>
              <div className="bg-black/20 rounded-lg p-4 border border-orange-500/30">
                <div className="text-2xl mb-2">📈</div>
                <h4 className="font-semibold text-orange-400">Mastery Tracking</h4>
                <p className="text-gray-300">Pattern progress and mistake analysis</p>
              </div>
            </div>
          </div>
          
          <label className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-400 hover:to-purple-400 text-white px-8 py-4 rounded-xl cursor-pointer font-semibold text-lg transition-all transform hover:scale-105 shadow-xl">
            📂 Upload PDF to Start Pattern Training
            <input type="file" accept="application/pdf" onChange={handleUpload} className="hidden" />
          </label>
        </div>
      );
    }

    // ✅ Show loading state during PDF parsing for NoteLab view
    if (viewMode === "notelab") {
      // Show loading state during parsing
      if (pdfParsingState.isLoading) {
        return (
          <div className="flex flex-col items-center justify-center h-full gap-6 bg-gradient-to-br from-gray-900 via-green-900 to-emerald-900">
            <div className="text-center max-w-2xl">
              <div className="animate-spin text-6xl mb-4">📝</div>
              <h3 className="text-3xl font-bold mb-4 text-white">Processing for NoteLab</h3>
              <p className="text-lg opacity-90 mb-6 text-gray-200">
                {pdfParsingState.progress}
              </p>
              <div className="flex items-center justify-center gap-2">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            </div>
          </div>
        );
      }

      // Show error state if parsing failed
      if (pdfParsingState.error) {
        return (
          <div className="flex flex-col items-center justify-center h-full gap-6 bg-gradient-to-br from-gray-900 via-red-900 to-emerald-900">
            <div className="text-center max-w-2xl">
              <div className="text-6xl mb-4">❌</div>
              <h3 className="text-3xl font-bold mb-4 text-white">NoteLab Unavailable</h3>
              <p className="text-lg mb-6 text-red-300">
                {pdfParsingState.error}
              </p>
              <button
                onClick={() => window.location.reload()}
                className="px-6 py-3 bg-green-600 hover:bg-green-500 rounded-lg text-white font-medium"
              >
                🔄 Try Again
              </button>
            </div>
          </div>
        );
      }

      return fileUrl && thoughtUnits.length > 0 ? (
        <div className="h-full flex flex-col">
          {/* NoteLab Butler Header */}
          <div className="bg-gray-800 border-b border-gray-700 p-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-semibold text-green-400">📝 NoteLab Butler</h3>
              <span className="text-sm text-gray-400">
                Page {currentPage} of {pdfPageCount} • Unit {currentThoughtUnit} of {thoughtUnits.length}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  const selectedText = sel.selectionText?.trim();
                  const currentUnitText = thoughtUnits[currentThoughtUnit - 1]?.text?.trim();
                  const textToAnalyze = selectedText || currentUnitText || "";
                  
                  if (textToAnalyze) {
                    try {
                      const noteNote = await buildTopStudentNote(textToAnalyze, "highYield");
                      setRbDraftText(noteNote);
                      setViewMode("rightbrain");
                    } catch (error) {
                      console.error("Note creation failed:", error);
                    }
                  }
                }}
                className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white px-3 py-2 rounded-lg font-medium"
              >
                📝 Study Note
              </button>
            </div>
          </div>
          
          {/* Integrated NoteLab Hybrid Reader */}
          <div className="flex-1 overflow-hidden">
            <NoteLabHybridReader
              bookId={bookId}
              userId={USER_ID}
              pdfUrl={fileUrl}
              currentPage={currentPage}
              pdfPageCount={pdfPageCount}
              onPageChange={(p) => syncToPage(p)}
              thoughtUnits={thoughtUnits}
              currentThoughtUnit={currentThoughtUnit}
              setCurrentThoughtUnit={setCurrentThoughtUnit}
              highlightedWord={highlightedWord}
              setHighlightedWord={setHighlightedWord}
              onWordClick={(w) => {
                setHighlightedWord(w);
                if (autoWhiteboard && w.trim()) {
                  setWbConcept(truncate(w, 600));
                  setWbContext(`p.${currentPage}`);
                  setShowWhiteboardPanel(true);
                }
              }}
              onTextSelect={(t) => sel.setSelectionText(t)}
              onGenerateNote={handleOpenRightBrainNote}
              selBind={sel.bind}
              externalSelectionText={sel.selectionText}
              fontSize={fontSize}
              fontFamily={fontFamily}
              lineSpacing={lineSpacing}
              selectedVoice={selectedVoice || undefined}
              onVoiceChange={setSelectedVoice}
              speechRate={speechRate}
              onSpeechRateChange={setSpeechRate}
              tableOfContents={tableOfContents}
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-full gap-6 bg-gradient-to-br from-gray-900 via-green-900 to-emerald-900">
          <div className="text-center max-w-2xl">
            <div className="text-6xl mb-4">📝</div>
            <h3 className="text-3xl font-bold mb-4 text-white">NoteLab - Structured Study Notes</h3>
            <p className="text-lg opacity-90 mb-6 text-gray-200">
              Create organized, pattern-tagged notes with flashcard generation and study outline export
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8 text-sm">
              <div className="bg-black/20 rounded-lg p-4 border border-green-500/30">
                <div className="text-2xl mb-2">🏷️</div>
                <h4 className="font-semibold text-green-400">Pattern Tagging</h4>
                <p className="text-gray-300">Tag notes with DAT patterns for organization</p>
              </div>
              <div className="bg-black/20 rounded-lg p-4 border border-blue-500/30">
                <div className="text-2xl mb-2">📇</div>
                <h4 className="font-semibold text-blue-400">Flashcard Export</h4>
                <p className="text-gray-300">Auto-generate flashcards from your notes</p>
              </div>
              <div className="bg-black/20 rounded-lg p-4 border border-purple-500/30">
                <div className="text-2xl mb-2">📄</div>
                <h4 className="font-semibold text-purple-400">Study Outlines</h4>
                <p className="text-gray-300">Export organized study guides by pattern</p>
              </div>
              <div className="bg-black/20 rounded-lg p-4 border border-yellow-500/30">
                <div className="text-2xl mb-2">🎯</div>
                <h4 className="font-semibold text-yellow-400">Study Levels</h4>
                <p className="text-gray-300">Basic, Intermediate, Advanced categorization</p>
              </div>
              <div className="bg-black/20 rounded-lg p-4 border border-pink-500/30">
                <div className="text-2xl mb-2">🔗</div>
                <h4 className="font-semibold text-pink-400">Thought Unit Links</h4>
                <p className="text-gray-300">Notes linked to specific content sections</p>
              </div>
              <div className="bg-black/20 rounded-lg p-4 border border-orange-500/30">
                <div className="text-2xl mb-2">🔍</div>
                <h4 className="font-semibold text-orange-400">Smart Search</h4>
                <p className="text-gray-300">Filter by pattern, level, and content</p>
              </div>
            </div>
          </div>
          
          <label className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-400 hover:to-emerald-400 text-white px-8 py-4 rounded-xl cursor-pointer font-semibold text-lg transition-all transform hover:scale-105 shadow-xl">
            📂 Upload PDF to Start Note-Taking
            <input type="file" accept="application/pdf" onChange={handleUpload} className="hidden" />
          </label>
        </div>
      );
    }

    // Right-Brain Reading view (unified Progressive + Hybrid features)
    if (viewMode === "rightbrain") {
      // Check if we're in note editor mode
      if (rbDraftText) {
        return (
          <RightBrainNoteEditor
            bookId={bookId}
            initialText={rbDraftText || sel.selectionText}
            attachments={attachments}
            currentPage={currentPage}
            onDone={() => {
              setRbDraftText("");
              // Stay in rightbrain mode after note editing
            }}
          />
        );
      }

      // ✅ Show loading state during PDF parsing for Right-Brain view
      if (pdfParsingState.isLoading) {
        return (
          <div className="flex flex-col items-center justify-center h-full gap-6 bg-gradient-to-br from-gray-900 via-purple-900 to-indigo-900">
            <div className="text-center max-w-2xl">
              <div className="animate-spin text-6xl mb-4">🧠</div>
              <h3 className="text-3xl font-bold mb-4 text-white">Processing for Visual Learning</h3>
              <p className="text-lg opacity-90 mb-6 text-gray-200">
                {pdfParsingState.progress}
              </p>
              <div className="flex items-center justify-center gap-2">
                <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-pink-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            </div>
          </div>
        );
      }

      // Show error state if parsing failed
      if (pdfParsingState.error) {
        return (
          <div className="flex flex-col items-center justify-center h-full gap-6 bg-gradient-to-br from-gray-900 via-red-900 to-indigo-900">
            <div className="text-center max-w-2xl">
              <div className="text-6xl mb-4">❌</div>
              <h3 className="text-3xl font-bold mb-4 text-white">Visual Learning Unavailable</h3>
              <p className="text-lg mb-6 text-red-300">
                {pdfParsingState.error}
              </p>
              <button
                onClick={() => window.location.reload()}
                className="px-6 py-3 bg-purple-600 hover:bg-purple-500 rounded-lg text-white font-medium"
              >
                🔄 Try Again
              </button>
            </div>
          </div>
        );
      }

      // Main Right-Brain Reading interface (Visual learning modes)
      return fileUrl && thoughtUnits.length > 0 ? (
        <div className="h-full w-full">
          <CleanRightBrainReader
            bookId={bookId}
            userId={USER_ID}
            thoughtUnits={thoughtUnits}
            currentThoughtUnit={currentThoughtUnit}
            fontSize={fontSize}
            fontFamily={fontFamily}
            lineSpacing={lineSpacing}
            totalPages={pdfPageCount}
            tableOfContents={tableOfContents}
            onPageChange={(p) => syncToPage(p)}
            onWordClick={(w) => {
              setHighlightedWord(w);
              if (autoWhiteboard && w.trim()) {
                setWbConcept(truncate(w, 600));
                setWbContext(`p.${currentPage}`);
                setShowWhiteboardPanel(true);
              }
            }}
            onTextSelect={(t) => sel.setSelectionText(t)}
            onGenerateNote={handleOpenRightBrainNote}
          />
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-full gap-4 bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
          <div className="text-center">
            <div className="text-6xl mb-4">🧠</div>
            <h3 className="text-2xl font-bold mb-2 text-white">Visual Right-Brain Reading</h3>
            <p className="text-lg opacity-80 mb-4 text-gray-300 max-w-md">
              Experience visual learning with Galaxy, Forest, City, Ocean, and Mountain metaphors
            </p>
            {!fileUrl ? (
              <label className="bg-gradient-to-r from-yellow-500 to-orange-500 text-black px-6 py-3 rounded-lg cursor-pointer font-medium hover:from-yellow-400 hover:to-orange-400 transition-all shadow-lg">
                📂 Upload PDF to Begin Visual Journey
                <input type="file" accept="application/pdf" onChange={handleUpload} className="hidden" />
              </label>
            ) : (
              <div className="text-yellow-300">
                <div className="animate-spin text-4xl mb-2">🌌</div>
                <p>Processing your document for visual learning...</p>
                <p className="text-sm opacity-75 mt-2">
                  {thoughtUnits.length} thought units loaded
                </p>
              </div>
            )}
          </div>
        </div>
      );
    }

    // Original view (PDF)
    return fileUrl ? (
      <div className="h-full" onMouseUp={sel.bind.onMouseUp}>
        <div className="relative h-full">
          <SmartPDFViewer
            fileUrl={fileUrl}
            currentPage={currentPage}
            onPageChange={(p) => syncToPage(p)}
            scale={1.25}
            onTextSelect={(t) => sel.setSelectionText(t)}
            onPageCount={(n) => {
              console.log(`📄 PDF page count detected: ${n}`);
              setPdfPageCount(n);
              setPdfLoadingState('loaded');
              setPdfError(null);
              // Ensure global sync knows about page count
              if (n > 1) {
                updateSync({ page: Math.min(currentPage, n), unitIndex: currentThoughtUnit }, 'pdf');
              }
            }}
            onOutline={(items) => {
              const normalized = outlineToTOC(items as any);
              if (normalized && normalized.length) {
                setTableOfContents(normalized);
              }
            }}
          />
          
          {/* PDF Loading Overlay */}
          {pdfLoadingState === 'loading' && (
            <div className="absolute inset-0 bg-gray-900/90 flex items-center justify-center z-50">
              <div className="text-center text-white">
                <div className="text-4xl mb-4 animate-pulse">📄</div>
                <h3 className="text-lg font-semibold mb-2">Loading PDF...</h3>
                <p className="text-sm opacity-75">Please wait while we prepare your document</p>
              </div>
            </div>
          )}
          
          {/* PDF Error Overlay */}
          {pdfLoadingState === 'error' && pdfError && (
            <div className="absolute inset-0 bg-gray-900/90 flex items-center justify-center z-50">
              <div className="bg-red-600 text-white rounded-lg p-6 max-w-md mx-4">
                <div className="flex items-start gap-3">
                  <div className="text-2xl">❌</div>
                  <div className="flex-1">
                    <h3 className="font-semibold mb-2">PDF Loading Failed</h3>
                    <p className="text-sm opacity-90 mb-4">{pdfError}</p>
                    <button
                      onClick={() => {
                        setPdfLoadingState('loading');
                        setPdfError(null);
                        // Force refresh the PDF
                        setFileUrl('');
                        setTimeout(() => setFileUrl(fileUrl), 100);
                      }}
                      className="bg-white text-red-600 px-4 py-2 rounded font-medium hover:bg-gray-100 transition-colors"
                    >
                      🔄 Try Again
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    ) : (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p>📂 Upload a PDF to begin</p>
        <label className="bg-yellow-500 text-black px-4 py-2 rounded cursor-pointer">
          Upload PDF
          <input type="file" accept="application/pdf" onChange={handleUpload} className="hidden" />
        </label>
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
            Thought Unit Reader
          </h1>
          <p className="text-sm md:text-lg italic opacity-90">Read Smarter, Remember Longer</p>
        </div>
      </header>

      {/* Quick controls */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-2 bg-gray-800">
        <div className="flex items-center gap-2">
          <span className="text-sm opacity-80 mr-1">View:</span>
          <button
            onClick={() => setViewMode("original")}
            className={`text-xs px-3 py-1 rounded ${
              viewMode === "original" ? "bg-yellow-500 text-black" : "bg-gray-700 hover:bg-gray-600"
            }`}
          >
            📄 Original PDF
          </button>
          <button
            onClick={() => setViewMode("hybrid")}
            className={`text-xs px-3 py-1 rounded ${
              viewMode === "hybrid" ? "bg-yellow-500 text-black" : "bg-gray-700 hover:bg-gray-600"
            }`}
          >
            🔄 Hybrid
          </button>
          <button
            onClick={() => setViewMode("pattern")}
            className={`text-xs px-3 py-1 rounded ${
              viewMode === "pattern" ? "bg-yellow-500 text-black" : "bg-gray-700 hover:bg-gray-600"
            }`}
          >
            🎯 Pattern Analysis
          </button>
          <button
            onClick={() => setViewMode("notelab")}
            className={`text-xs px-3 py-1 rounded ${
              viewMode === "notelab" ? "bg-yellow-500 text-black" : "bg-gray-700 hover:bg-gray-600"
            }`}
          >
            📝 NoteLab Visual
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

      </div>

      {/* Main Content Area - New Layout: [TOC | PDF | Right Pane] */}
      <div className="flex-1 overflow-hidden flex">
        {/* Left TOC Sidebar - Show when content loaded and TOC available */}
        {fileUrl && pdfPageCount > 0 && (
          tableOfContents.length > 0 ? (
            <TOCSidebar
              toc={tableOfContents}
              currentPage={currentPage}
              onJumpToPage={(p) => syncToPage(p, { reason: 'TOC_JUMP' })}
              userId={USER_ID}
            />
          ) : (
            <div className="w-64 bg-gray-800 border-r border-gray-700 p-4 text-center">
              <div className="text-gray-400 text-sm">
                <div className="text-2xl mb-2">📖</div>
                <p>No table of contents detected in this PDF</p>
                <p className="text-xs mt-2 opacity-60">
                  Navigation available via page numbers
                </p>
              </div>
            </div>
          )
        )}


        {/* Main Reader Content Area */}
        <div className="flex-1 h-full">
          <div className="w-full h-full bg-gray-800 rounded-lg overflow-auto">{renderContent()}</div>
        </div>
      </div>

        {/* Floating Action Buttons - Bottom Right Stack */}
        <div className="fixed bottom-6 right-6 z-40 flex flex-col gap-3">
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
              setViewMode("rightbrain");
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
            setViewMode("rightbrain");
            setShowLinkModal(false);
          }}
        />
      )}

    </div>
  );
}
