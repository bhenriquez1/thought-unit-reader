// pages/index.tsx
import dynamic from "next/dynamic";
import React, { useState, useEffect, useRef, useMemo, ChangeEvent } from "react";

import { generateTOC, type TOCEntry, outlineToTOC } from "@/lib/tocParser";
import TOCSidebar from "@/components/TOCSidebar";
import type { ThoughtUnit, ReadingStats } from "@/types/reading";
import EnhancedHybridReader from "@/components/EnhancedHybridReader";
import EnhancedProgressiveView from "@/components/EnhancedProgressiveView";
import HighlightPopup from "@/components/HighlightPopup";
import RightBrainNoteEditor from "@/components/RightBrainNoteEditor";
import LinkVideoModal from "@/components/LinkVideoModal";

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
import { useReaderSync, stableChunkId, analyzeContentDensity } from "@/lib/readerSync";

import {
  parseBookWithChapters,
  detectWhiteboardSections,
  containsDiagramOrFormula,
} from "@/lib/parser";

import { usePdfSelection } from "@/hooks/usePdfSelection";
import summarizeText from "@/lib/aiSummary";
import { generateMnemonic } from "@/lib/mnemonicAI";

// Lazy-load to keep SSR clean
const SmartPDFViewer = dynamic(() => import("@/components/SmartPDFViewer"), { ssr: false });

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

/** Floating progressive navigator that sits over the PDF */
function ProgressiveOverlay({
  chunks,
  activeIdx,
  setActiveIdx,
  onChunkPicked,
  onOpenRightBrain,
}: {
  chunks: string[];
  activeIdx: number;
  setActiveIdx: React.Dispatch<React.SetStateAction<number>>;
  onChunkPicked?: (t: string) => void;
  onOpenRightBrain?: (fullText: string) => void;
}) {
  const [promptIdx, setPromptIdx] = useState(0);
  const activeText = chunks[activeIdx] || "";
  const { setActiveChunkId } = useReaderSync();

  // keyboard: J/K or ArrowDown/ArrowUp to move; Enter to open in Right-Brain
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName?.match(/INPUT|TEXTAREA|SELECT/)) return;
      if (["ArrowDown", "j", "J"].includes(e.key)) {
        e.preventDefault();
        setActiveIdx(Math.min(chunks.length - 1, activeIdx + 1));
      } else if (["ArrowUp", "k", "K"].includes(e.key)) {
        e.preventDefault();
        setActiveIdx(Math.max(0, activeIdx - 1));
      } else if (e.key === "Enter") {
        onOpenRightBrain?.(COMPREHENSION_PROMPTS[promptIdx].build(activeText));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chunks.length, activeIdx, setActiveIdx, activeText, promptIdx, onOpenRightBrain]);

  // Sync active chunk to global store
  useEffect(() => {
    if (activeText) {
      const chunkId = stableChunkId(activeText);
      setActiveChunkId(chunkId);
    }
  }, [activeText, setActiveChunkId]);

  if (!chunks.length) return null;

  return (
    <div className="pointer-events-auto absolute top-3 right-3 bg-gray-900/85 border border-gray-700 rounded-lg shadow-lg w-[400px] max-h-[70vh] overflow-y-auto">
      <div className="sticky top-0 z-10 p-2 text-xs font-semibold text-yellow-300 bg-gray-900/95 border-b border-gray-800">
        Progressive Navigator
      </div>

      {/* Chunk Rail at the top */}
      <div className="p-3 border-b border-gray-700">
        <ChunkRail
          chunks={chunks}
          activeIdx={activeIdx}
          setActiveIdx={setActiveIdx}
          onPick={(text) => {
            onChunkPicked?.(text);
            // Highlight in PDF
            highlightChunkInPDF(1, text); // Assuming current page for now
          }}
        />
      </div>

      <div className="p-2 text-sm leading-6">
        {chunks.map((c, i) => (
          <button
            key={i}
            className={`block text-left w-full px-2 py-1 rounded mb-1 ${
              i === activeIdx ? "bg-yellow-500 text-black" : "hover:bg-gray-700"
            }`}
            onClick={() => {
              setActiveIdx(i);
              onChunkPicked?.(c);
            }}
          >
            {c}
          </button>
        ))}
      </div>

      {/* tiny comprehension card */}
      <div className="m-2 mt-0 border border-gray-700 rounded-lg p-2 bg-gray-900/70">
        <div className="text-[10px] uppercase tracking-wide text-gray-300 mb-1">Comprehension</div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium">{COMPREHENSION_PROMPTS[promptIdx].label}</span>
          <button
            className="text-[10px] px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600"
            onClick={() => setPromptIdx((i) => (i + 1) % COMPREHENSION_PROMPTS.length)}
          >
            Next
          </button>
        </div>
        <div className="flex gap-2">
          <button
            className="text-[11px] px-2 py-1 rounded bg-yellow-500 text-black"
            onClick={() => onOpenRightBrain?.(COMPREHENSION_PROMPTS[promptIdx].build(activeText))}
          >
            Open in Right-Brain
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ThoughtUnitReader() {
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
    useState<"original" | "progressive" | "hybrid" | "rightbrain">("original");

  const [currentPage, setCurrentPage] = useState(1);
  const [pdfPageCount, setPdfPageCount] = useState(1);

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
  const [showStudyLibrary, setShowStudyLibrary] = useState(false);
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
     🔹 Upload PDF — parse + detect diagrams
  ========================================================================= */
  const handleUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || file.type !== "application/pdf") {
      alert("Please upload a PDF file.");
      return;
    }
    setUploadedFile(file);
    setViewMode("original");
    setBookId(file.name.replace(/\.[Pp][Dd][Ff]$/, "") || "book");

    let url: string;
    let libEntry: { id: string; name: string; url: string; uploadedAt: any; isLocal?: boolean };

    // Check if we're using the bypass (mock user) or real Firebase
    const isUsingBypass = process.env.NEXT_PUBLIC_DISABLE_GOOGLE_SIGNIN === "1";
    const canUseFirebase = firebaseConnected && user && !isUsingBypass;

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

    // Heuristic TOC (viewer outline will override later)
    generateTOC(url).then(setTableOfContents).catch(() => {});

    // Parse → normalize → store
    try {
      const { parsedUnits, chapters } = await parseBookWithChapters(file);

      const normalized = normalizeParsedUnits(parsedUnits);
      setThoughtUnits(normalized);
      setSampleText(normalized[0]?.text ?? "");

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
    } catch (err) {
      console.warn("Whiteboard auto-detect skipped (parse failed):", err);
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
     🔹 High-Yield & Sketch note helpers
  ========================================================================= */
  async function buildHighYieldDraft(seed: string) {
    const base = seed.trim();
    if (!base) return "";
    const [sum, mnem] = await Promise.allSettled([summarizeText(base), generateMnemonic(base)]);
    const summary = sum.status === "fulfilled" && sum.value ? sum.value : base;
    const mnemonic = mnem.status === "fulfilled" && mnem.value ? mnem.value : "";
    return [
      `# Title: `,
      ``,
      `## Big Idea`,
      summary,
      ``,
      `## Evidence / Details`,
      `- Key facts / steps`,
      `- Exceptions / edge-cases`,
      ``,
      `## Visual Sketch (describe or doodle)`,
      `- Diagram plan: boxes/arrows/labels to show relationships`,
      ``,
      `## Mnemonic`,
      mnemonic || "…",
      ``,
      `## Q → A (self-test)`,
      `- Q: …`,
      `  A: …`,
    ].join("\n");
  }

  const handleOpenRightBrainNote = async (
    text?: string,
    _mnemonic?: string,
    mode?: "sketch" | "highYield"
  ) => {
    const seed = (text || sel.selectionText || "").trim();
    if (!seed) {
      alert("Select text first.");
      return;
    }

    if (mode === "highYield") {
      const draft = await buildHighYieldDraft(seed);
      setRbDraftText(draft);
    } else if (mode === "sketch") {
      setRbDraftText(
        [
          `# Sketch Note`,
          ``,
          `What I see:`,
          `- Shapes / arrows / labels…`,
          ``,
          `Idea in one line:`,
          seed,
        ].join("\n")
      );
    } else {
      setRbDraftText(seed);
    }

    setViewMode("rightbrain");
  };

  /* =========================================================================
     🔹 Progressive overlay derivations + auto-advance
  ========================================================================= */
  const activeUnitText = useMemo(
    () => (thoughtUnits[currentThoughtUnit - 1]?.text || ""),
    [thoughtUnits, currentThoughtUnit]
  );
  const progressiveChunks = useMemo(() => chunkIntoIdeas(activeUnitText), [activeUnitText]);
  const [progActiveIdx, setProgActiveIdx] = useState(0);
  useEffect(() => setProgActiveIdx(0), [currentThoughtUnit]);

  useEffect(() => {
    if (viewMode !== "progressive" || !progressiveChunks.length) return;
    if (!(isReading && !isPaused)) return; // advance only when reading
    const msPerChunk = Math.max(600, (60_000 / Math.max(120, readingSpeed)) * 1.2);
    const t = window.setInterval(
      () => setProgActiveIdx((i) => (i + 1) % progressiveChunks.length),
      msPerChunk
    );
    return () => window.clearInterval(t);
  }, [viewMode, progressiveChunks.length, readingSpeed, isReading, isPaused]);

  /* =========================================================================
     🔹 Enhanced Page/TOC sync with chapter-aware navigation + global sync
  ========================================================================= */
  const syncToPage = (page: number, opts?: { reason?: 'SCROLL' | 'TOC_JUMP' | 'PROGRAMMATIC' }) => {
    const reason = opts?.reason || 'PROGRAMMATIC';
    console.log(`📄 index.tsx syncToPage called: navigating to page ${page} (current: ${currentPage}) reason: ${reason}`);
    
    // Validate page bounds
    if (page < 1 || (pdfPageCount > 0 && page > pdfPageCount)) {
      console.warn(`📄 index.tsx: Invalid page ${page}, bounds: 1-${pdfPageCount}`);
      return;
    }
    
    try {
      // Update local state first
      setCurrentPage(page);
      let unit = pageToUnit(page, pdfPageCount, thoughtUnits.length);
      
      // Enhanced chapter-aware navigation for TOC jumps
      if (reason === 'TOC_JUMP') {
        // Use the sync store's chapter-aware functionality
        const { syncToChapter, findNearestChapter } = useReaderSync.getState();
        const nearestChapter = findNearestChapter(page);
        
        if (nearestChapter) {
          console.log(`📄 TOC_JUMP: Found chapter "${nearestChapter.title}" for page ${page}`);
          // Snap to chapter start page and first unit
          const chapterStartPage = nearestChapter.page;
          const chapterStartUnit = nearestChapter.unitStart;
          
          setCurrentPage(chapterStartPage);
          setCurrentThoughtUnit(chapterStartUnit);
          
          // Update global sync store with chapter-aware data
          updateSync({ 
            page: chapterStartPage, 
            unitIndex: chapterStartUnit 
          }, 'toc');
          
          console.log(`📄 Chapter navigation complete: page ${chapterStartPage}, unit ${chapterStartUnit}`);
        } else {
          // Fallback to normal navigation if no chapter found
          setCurrentThoughtUnit(unit);
          updateSync({ page, unitIndex: unit }, 'toc');
          console.log(`📄 Fallback navigation complete: page ${page}, unit ${unit}`);
        }
      } else {
        // Normal scroll/programmatic navigation with enhanced sync
        setCurrentThoughtUnit(unit);
        
        // Use the enhanced sync store with proper source mapping
        const syncSource = reason === 'SCROLL' ? 'pdf' : 'manual';
        updateSync({ page, unitIndex: unit }, syncSource);
        
        console.log(`📄 ${reason} navigation complete: page ${page}, unit ${unit}, source: ${syncSource}`);
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
      
      console.log(`📄 index.tsx: Successfully navigated to page ${page}`);
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
     🔹 Render Reader Content
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

    if (viewMode === "rightbrain") {
      return (
        <RightBrainNoteEditor
          bookId={bookId}
          initialText={rbDraftText || sel.selectionText}
          attachments={attachments}
          currentPage={currentPage}
          onDone={() => {
            setRbDraftText("");
            setViewMode("progressive");
          }}
        />
      );
    }

    if (viewMode === "progressive") {
      return fileUrl ? (
        <EnhancedProgressiveView
          bookId={bookId}
          userId={USER_ID}
          thoughtUnits={thoughtUnits}
          currentThoughtUnit={currentThoughtUnit}
          pdfUrl={fileUrl}
          currentPage={currentPage}
          pdfPageCount={pdfPageCount}
          onPageChange={(p) => syncToPage(p)}
          readingSpeed={readingSpeed}
          isReading={isReading}
          isPaused={isPaused}
          highlightedWord={highlightedWord}
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
          setReadingSpeed={setReadingSpeed}
          onTextSelect={(t) => sel.setSelectionText(t)}
          onGenerateNote={handleOpenRightBrainNote}
          selBind={sel.bind}
          externalSelectionText={sel.selectionText}
          selectedVoice={selectedVoice}
          onVoiceChange={setSelectedVoice}
          speechRate={speechRate}
          onSpeechRateChange={setSpeechRate}
          tableOfContents={tableOfContents}
        />
      ) : (
        <div className="flex flex-col items-center justify-center h-full gap-4">
          <p>📂 Upload a PDF to begin</p>
          <label className="bg-yellow-500 text-black px-4 py-2 rounded cursor-pointer">
            Upload PDF
            <input type="file" accept="application/pdf" onChange={handleUpload} className="hidden" />
          </label>
        </div>
      );
    }

    if (viewMode === "hybrid") {
      return fileUrl ? (
        <EnhancedHybridReader
          bookId={bookId}
          userId={USER_ID}
          pdfUrl={fileUrl || ""}
          currentPage={currentPage}
          pdfPageCount={pdfPageCount}
          onPageChange={(p) => syncToPage(p)}
          sampleText={sampleText}
          readingSpeed={readingSpeed}
          isReading={isReading}
          isPaused={isPaused}
          currentThoughtUnit={currentThoughtUnit}
          setCurrentThoughtUnit={setCurrentThoughtUnit}
          thoughtUnits={thoughtUnits}
          highlightedWord={highlightedWord}
          setHighlightedWord={setHighlightedWord}
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
          setReadingSpeed={setReadingSpeed}
          onTextSelect={(t) => sel.setSelectionText(t)}
          selBind={sel.bind}
          externalSelectionText={sel.selectionText}
          onGenerateNote={handleOpenRightBrainNote}
          selectedVoice={selectedVoice}
          onVoiceChange={setSelectedVoice}
          speechRate={speechRate}
          onSpeechRateChange={setSpeechRate}
          tableOfContents={tableOfContents}
        />
      ) : (
        <div className="flex flex-col items-center justify-center h-full gap-4">
          <p>📂 Upload a PDF to begin</p>
          <label className="bg-yellow-500 text-black px-4 py-2 rounded cursor-pointer">
            Upload PDF
            <input type="file" accept="application/pdf" onChange={handleUpload} className="hidden" />
          </label>
        </div>
      );
    }

    // Original view (PDF)
    return fileUrl ? (
      <div className="h-full" onMouseUp={sel.bind.onMouseUp}>
        <SmartPDFViewer
          fileUrl={fileUrl}
          currentPage={currentPage}
          onPageChange={(p) => syncToPage(p)}
          scale={1.25}
          onTextSelect={(t) => sel.setSelectionText(t)}
          onPageCount={(n) => setPdfPageCount(n)}
          onOutline={(items) => {
            const normalized = outlineToTOC(items as any);
            if (normalized && normalized.length) {
              setTableOfContents(normalized);
            }
          }}
        />
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
          {(["original", "progressive", "hybrid", "rightbrain"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setViewMode(m)}
              className={`text-xs px-2 py-1 rounded ${
                viewMode === m ? "bg-yellow-500 text-black" : "bg-gray-700 hover:bg-gray-600"
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        {/* Tiny reader controls for progressive auto-advance */}
        <div className="flex items-center gap-2 ml-2">
          <button
            onClick={() => {
              setIsReading(true);
              setIsPaused(false);
            }}
            className="text-xs px-2 py-1 rounded bg-blue-600 hover:bg-blue-700"
            title="Start auto-advance"
          >
            ▶ Read
          </button>
          <button
            onClick={() => setIsPaused((p) => !p)}
            className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600"
            title="Pause/Resume"
          >
            {isPaused ? "Resume" : "Pause"}
          </button>
          <button
            onClick={() => {
              setIsReading(false);
              setIsPaused(false);
            }}
            className="text-xs px-2 py-1 rounded bg-red-600 hover:bg-red-700"
            title="Stop auto-advance"
          >
            ⏹ Stop
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

        {/* Library */}
        <button
          onClick={() => setShowLibrary(true)}
          className="text-xs px-3 py-1 rounded bg-yellow-500 text-black shadow"
        >
          📚 Library
        </button>

        {/* Study Library */}
        <button
          onClick={() => setShowStudyLibrary(true)}
          className="text-xs px-3 py-1 rounded bg-purple-500 text-white shadow"
        >
          🎓 Study Notes
        </button>
      </div>

      {/* Main Content Area - New Layout: [TOC | PDF | Right Pane] */}
      <div className="flex-1 overflow-hidden flex">
        {/* Left TOC Sidebar - Always visible when content is loaded */}
        {fileUrl && tableOfContents.length > 0 && (
          <TOCSidebar
            toc={tableOfContents}
            currentPage={currentPage}
            onJumpToPage={(p) => syncToPage(p, { reason: 'TOC_JUMP' })}
            userId={USER_ID}
          />
        )}

        {/* Floating TOC Toggle Pill on PDF (when TOC is collapsed or hidden) */}
        {fileUrl && tableOfContents.length > 0 && (
          <button
            onClick={() => setShowTOCPanel(true)}
            className="fixed bottom-6 left-6 z-40 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-3 py-2 rounded-full shadow-lg backdrop-blur-sm border border-blue-400"
            title="Toggle Table of Contents"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm">📑</span>
              <span className="text-xs font-medium hidden sm:block">TOC</span>
            </div>
          </button>
        )}

        {/* Main Reader Content Area */}
        <div className="flex-1 h-full">
          <div className="w-full h-full bg-gray-800 rounded-lg overflow-auto">{renderContent()}</div>
        </div>
      </div>

      {/* Single Whiteboard FAB - Bottom Right (Always Available) */}
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
          className="fixed bottom-6 right-6 z-40 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white p-3 rounded-full shadow-lg backdrop-blur-sm border border-purple-400"
          title="Open Whiteboard Explanation"
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">🎨</span>
            <span className="text-sm font-medium hidden sm:block">Whiteboard</span>
          </div>
        </button>
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
              selectedVoice={selectedVoice}
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

      {/* Study Library Panel */}
      {showStudyLibrary && (
        <LibraryPanel
          userId={USER_ID}
          bookId={bookId}
          currentPage={currentPage}
          isOpen={showStudyLibrary}
          onClose={() => setShowStudyLibrary(false)}
          onGenerateTopStudentNote={(content, pageNumber) => {
            console.log("Generated top student note for page", pageNumber);
          }}
        />
      )}
    </div>
  );
}
