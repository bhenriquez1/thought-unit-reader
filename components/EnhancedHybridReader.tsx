"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { ThoughtUnit as BaseThoughtUnit, ReadingStats } from "@/types/reading";
import { saveReadingProgress, loadReadingProgress } from "@/lib/firebase";
import RightBrainToolbar from "@/components/RightBrainToolbar";
import { useStartReview } from "@/hooks/useStartReview";
import { chunkText, stableChunkId } from "@/lib/chunkers";
import { loadUnderstood, markUnderstood } from "@/lib/understoodStore";
import ProgressRing from "@/components/ProgressRing";
import { Document, Page } from "react-pdf";
import { 
  NavigationHistory, 
  NavigationResult,
  createNavigationFeedback,
  searchTOCForNavigation
} from "@/lib/navigationUtils";
import PageContextPanel from "@/components/PageContextPanel";
import ChunkRail from "@/components/ChunkRail";
import { useUnifiedNavigation } from "@/lib/useUnifiedNavigation";
import { 
  extractAnchorTokens, 
  buildPageTextIndex, 
  findChunkInPage, 
  highlightChunkInPDF,
  createChunkAnchor,
  pageIndexCache,
  createDebounced,
  type PageTextIndex,
  type ChunkAnchor,
  type MatchResult
} from "@/lib/anchorSync";
import { detectChapterTransition } from "@/lib/chapterAnimations";
import { 
  analyzeChunkWithRightBrain,
  type RightBrainChunkAnalysis,
  type TextPattern,
  type VisualMetaphor
} from "@/lib/rightBrainReading";
import { 
  createThoughtUnitRenderer,
  type PDFThoughtUnitRenderer,
  type OverlayConfig,
  type ThoughtUnit,
  type MainIdeaAnalysis
} from "@/lib/pdfThoughtUnitOverlay";
import { analyzeTextForThoughtUnits } from "@/lib/thoughtUnitExtraction";
import { aiLearningEngine, type UserFeedback } from "@/lib/aiLearningEngine";
import ThoughtUnitFeedback, { QuickFeedbackButtons } from "@/components/ThoughtUnitFeedback";

type HRUnit = BaseThoughtUnit | string | string[] | { text?: string };

interface EnhancedHybridReaderProps {
  bookId: string;
  userId: string;

  // PDF Integration - Primary view
  pdfUrl: string;
  currentPage: number;
  pdfPageCount?: number;
  onPageChange: (page: number) => void;

  sampleText: string;
  readingSpeed?: number;
  isReading?: boolean;
  isPaused?: boolean;

  currentThoughtUnit: number;
  setCurrentThoughtUnit: React.Dispatch<React.SetStateAction<number>>;
  thoughtUnits: HRUnit[];

  highlightedWord: string;
  setHighlightedWord: (word: string) => void;

  stats?: ReadingStats;
  fontSize: number;
  fontFamily: string;
  lineSpacing: number;
  clickSwitchesTo?: boolean;

  onWordClick: (word: string) => void;
  setReadingSpeed?: (speed: number) => void;

  onTextSelect?: (text: string) => void;
  onGenerateNote?: (text: string, mnemonic?: string, mode?: "sketch" | "highYield") => void;

  selBind?: { onMouseUp?: (e: React.MouseEvent) => void };
  externalSelectionText?: string;

  // Voice settings
  selectedVoice?: SpeechSynthesisVoice;
  onVoiceChange?: (voice: SpeechSynthesisVoice) => void;
  speechRate?: number;
  onSpeechRateChange?: (rate: number) => void;

  // Navigation
  tableOfContents?: any[];
  
  // Chunk pick callback for 3-step process
  onChunkPick?: (text: string) => void;
}

function unitToText(u: HRUnit): string {
  if (u == null) return "";
  if (typeof u === "string") return u;
  if (Array.isArray(u)) return u.join(" ");
  const t = (u as any).text;
  return typeof t === "string" ? t : JSON.stringify(u);
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function keyTokenFromChunk(chunk: string): string | null {
  const words = (chunk || "").split(/\s+/).filter(Boolean);
  const scored = words
    .map((w) => ({
      w,
      s: (/[A-Z]\w+/.test(w) ? 2 : 0) + (w.length >= 6 ? 1 : 0) + (/\d/.test(w) ? 1 : 0),
    }))
    .sort((a, b) => b.s - a.s);
  return scored[0]?.w || null;
}

// Enhanced PDF highlighting overlay with right-brain focus
function createHighlightOverlay(
  pdfContainer: HTMLElement,
  highlightText: string,
  color: string = "rgba(255, 235, 59, 0.4)",
  pulseAnimation: boolean = true
) {
  // Remove existing highlights
  const existingHighlights = pdfContainer.querySelectorAll('.pdf-highlight-overlay');
  existingHighlights.forEach(el => el.remove());

  if (!highlightText.trim()) return;

  // Create multiple highlight attempts for better coverage
  const searchTerms = [
    highlightText,
    ...highlightText.split(/\s+/).filter(w => w.length > 4).slice(0, 3), // Key words
  ];

  searchTerms.forEach((term, index) => {
    if (!term.trim()) return;
    
    const walker = document.createTreeWalker(
      pdfContainer,
      NodeFilter.SHOW_TEXT,
      null
    );

    const textNodes: Text[] = [];
    let node;
    while (node = walker.nextNode()) {
      textNodes.push(node as Text);
    }

    textNodes.forEach(textNode => {
      const text = textNode.textContent || '';
      const regex = new RegExp(escapeRegExp(term), 'gi');
      const matches = [...text.matchAll(regex)];

      matches.forEach(match => {
        if (match.index !== undefined) {
          try {
            const range = document.createRange();
            range.setStart(textNode, match.index);
            range.setEnd(textNode, match.index + match[0].length);

            const rect = range.getBoundingClientRect();
            const containerRect = pdfContainer.getBoundingClientRect();

            if (rect.width > 0 && rect.height > 0) {
              const highlight = document.createElement('div');
              highlight.className = 'pdf-highlight-overlay';
              highlight.style.cssText = `
                position: absolute;
                left: ${rect.left - containerRect.left + pdfContainer.scrollLeft}px;
                top: ${rect.top - containerRect.top + pdfContainer.scrollTop}px;
                width: ${rect.width}px;
                height: ${rect.height}px;
                background-color: ${color};
                pointer-events: none;
                z-index: 10;
                border-radius: 3px;
                opacity: ${0.8 - (index * 0.2)};
                ${pulseAnimation ? 'animation: hybridPulse 3s ease-in-out infinite;' : ''}
              `;

              pdfContainer.appendChild(highlight);
            }
          } catch (e) {
            // Ignore range errors
          }
        }
      });
    });
  });
}

const COMPREHENSION_PROMPTS = [
  { label: "Explain", build: (ctx: string) => `Explain in your own words:\n\n${ctx}` },
  { label: "Analogy", build: (ctx: string) => `Create a vivid analogy for this idea:\n\n${ctx}` },
  { label: "Example", build: (ctx: string) => `Give a concrete example that demonstrates:\n\n${ctx}` },
  { label: "Why →", build: (ctx: string) => `Why does this happen? Justify the steps:\n\n${ctx}` },
] as const;

function makeTwoChoiceQuiz(from: string) {
  const words = (from || "").split(/\W+/).filter((w) => w.length >= 4);
  const correct = keyTokenFromChunk(from) || words[0] || "concept";
  let distractor = correct;
  for (const w of words) {
    if (!new RegExp(`\\b${escapeRegExp(correct)}\\b`, "i").test(w)) {
      distractor = w;
      break;
    }
  }
  const options = [correct, distractor].sort(() => Math.random() - 0.5);
  const answer = options.indexOf(correct);
  return { prompt: "Which term appears in this idea?", options, answer };
}

export default function EnhancedHybridReader({
  bookId,
  userId,
  pdfUrl,
  currentPage,
  pdfPageCount,
  onPageChange,
  thoughtUnits,
  currentThoughtUnit,
  setCurrentThoughtUnit,
  fontSize,
  fontFamily,
  lineSpacing,
  highlightedWord,
  setHighlightedWord,
  onWordClick,
  onTextSelect,
  onGenerateNote,
  sampleText,
  readingSpeed = 200,
  setReadingSpeed,
  isReading = true,
  isPaused = false,
  selBind,
  externalSelectionText,
  selectedVoice,
  onVoiceChange,
  speechRate = 1.0,
  onSpeechRateChange,
  tableOfContents = [],
}: EnhancedHybridReaderProps) {
  const [selectionText, setSelectionText] = useState("");
  const [promptIdx, setPromptIdx] = useState(0);
  const [phase, setPhase] = useState<"gist" | "pattern" | "detail" | "movie">("gist");
  const [localPaused, setLocalPaused] = useState(false);

  // Navigation state
  const [navigationHistory] = useState(() => new NavigationHistory());
  const [navigationFeedback, setNavigationFeedback] = useState<string>("");
  const [showNavigationFeedback, setShowNavigationFeedback] = useState(false);

  // Enhanced PDF controls - optimized defaults
  const [pdfScale, setPdfScale] = useState(1.2);
  const [showProgressiveOverlay, setShowProgressiveOverlay] = useState(true);
  const pdfContainerRef = useRef<HTMLDivElement>(null);

  // Chunking and progressive features - optimized chunk size
  const [chunkChars, setChunkChars] = useState(240);
  const [chunkMode, setChunkMode] = useState<"semantic" | "sentence" | "bullet-first">("semantic");
  const [understoodMap, setUnderstoodMap] = useState<Record<string, true>>({});

  // Voice and speech
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(false);

  // ChunkTOCBar state
  const [compactMode, setCompactMode] = useState(true);

  // Thought Unit Overlay System with AI Learning
  const [thoughtUnitRenderer, setThoughtUnitRenderer] = useState<PDFThoughtUnitRenderer | null>(null);
  const [showThoughtUnits, setShowThoughtUnits] = useState(true);
  const [thoughtUnitConfig, setThoughtUnitConfig] = useState<OverlayConfig>({
    showMainIdeas: true,
    showSupportingDetails: true,
    showTransitions: true,
    animationEnabled: true,
    intensityMultiplier: 1.0,
    borderWidth: 2,
    pulseOnFocus: true,
    // Precision controls to prevent over-highlighting
    mainIdeaConfidenceThreshold: 0.85, // Only highlight as main idea if 85%+ confident
    highlightSensitivity: 'moderate',
    maxMainIdeasPerPage: 2, // Maximum 2 main ideas per page
    sentenceLevelPrecision: true,
  });
  const [currentThoughtUnits, setCurrentThoughtUnits] = useState<ThoughtUnit[]>([]);
  const [currentMainIdea, setCurrentMainIdea] = useState<MainIdeaAnalysis | null>(null);
  
  // AI Learning Integration
  const [showFeedbackPanel, setShowFeedbackPanel] = useState(false);
  const [selectedThoughtUnit, setSelectedThoughtUnit] = useState<ThoughtUnit | null>(null);
  const [learningMode, setLearningMode] = useState(false);
  const [adaptiveSettings, setAdaptiveSettings] = useState<any>(null);

  // Initialize thought unit renderer when PDF container is ready
  useEffect(() => {
    if (pdfContainerRef.current && !thoughtUnitRenderer && showThoughtUnits) {
      const renderer = createThoughtUnitRenderer(pdfContainerRef.current, thoughtUnitConfig);
      setThoughtUnitRenderer(renderer);
      
      // Add event listeners for thought unit interactions
      const handleThoughtUnitClick = (event: CustomEvent) => {
        const unit = event.detail.unit as ThoughtUnit;
        console.log('🧠 Thought unit clicked:', unit.type, unit.text.slice(0, 50));
        
        // Speak the thought unit if auto-speak is enabled
        if (autoSpeak) {
          speakText(unit.text);
        }
        
        // Update selection
        setSelectionText(unit.text);
        onTextSelect?.(unit.text);
      };
      
      const handleThoughtUnitFocus = (event: CustomEvent) => {
        const unit = event.detail.unit as ThoughtUnit;
        console.log('🧠 Thought unit focused:', unit.type);
      };
      
      pdfContainerRef.current.addEventListener('thoughtUnitClick', handleThoughtUnitClick as EventListener);
      pdfContainerRef.current.addEventListener('thoughtUnitFocus', handleThoughtUnitFocus as EventListener);
      
      return () => {
        if (pdfContainerRef.current) {
          pdfContainerRef.current.removeEventListener('thoughtUnitClick', handleThoughtUnitClick as EventListener);
          pdfContainerRef.current.removeEventListener('thoughtUnitFocus', handleThoughtUnitFocus as EventListener);
        }
        renderer.destroy();
      };
    }
  }, [pdfContainerRef.current, showThoughtUnits, thoughtUnitConfig, autoSpeak, onTextSelect]);

  // Update thought unit renderer when config changes
  useEffect(() => {
    if (thoughtUnitRenderer) {
      thoughtUnitRenderer.updateConfig(thoughtUnitConfig);
    }
  }, [thoughtUnitRenderer, thoughtUnitConfig]);

  // Unified navigation for sync - using the new system
  const { 
    jumpToPage,
    jumpToChapter,
    navigateProgrammatically,
    currentPage: unifiedCurrentPage,
    currentUnit: unifiedCurrentUnit
  } = useUnifiedNavigation();
  const [pageTextIndex, setPageTextIndex] = useState<PageTextIndex | null>(null);
  const syncDebounceRef = useRef<number | null>(null);

  const { isReviewMode, currentCard, startReview, gradeCard } = useStartReview(userId);

  // Use unified navigation for sync between components
  useEffect(() => {
    console.log(`🔄 HybridReader: Navigation state: page=${unifiedCurrentPage}, unit=${unifiedCurrentUnit}`);
    
    // Sync with unified navigation state when it changes
    if (unifiedCurrentPage !== currentPage && unifiedCurrentPage > 0) {
      console.log(`🔄 HybridReader: Syncing to unified page: ${currentPage} -> ${unifiedCurrentPage}`);
      onPageChange(unifiedCurrentPage);
    }
    
    if (unifiedCurrentUnit !== currentThoughtUnit && unifiedCurrentUnit > 0) {
      console.log(`🔄 HybridReader: Syncing to unified unit: ${currentThoughtUnit} -> ${unifiedCurrentUnit}`);
      setCurrentThoughtUnit(unifiedCurrentUnit);
    }
  }, [unifiedCurrentPage, unifiedCurrentUnit, currentPage, currentThoughtUnit, onPageChange, setCurrentThoughtUnit]);

  // Load voices
  useEffect(() => {
    const loadVoices = () => {
      const voices = speechSynthesis.getVoices();
      setAvailableVoices(voices);
    };
    
    loadVoices();
    speechSynthesis.addEventListener('voiceschanged', loadVoices);
    
    return () => {
      speechSynthesis.removeEventListener('voiceschanged', loadVoices);
    };
  }, []);

  // Load saved progress
  useEffect(() => {
    if (!userId || !bookId) return;
    loadReadingProgress(userId, bookId).then((progress: any) => {
      if (!progress) return;
      if (typeof progress.currentPage === "number") onPageChange(progress.currentPage);
      if (typeof progress.currentThoughtUnit === "number")
        setCurrentThoughtUnit(progress.currentThoughtUnit);
      if (typeof progress.highlightedWord === "string") setHighlightedWord(progress.highlightedWord);
      if (typeof progress.readingSpeed === "number") setReadingSpeed?.(progress.readingSpeed);
    });
  }, [userId, bookId, onPageChange, setCurrentThoughtUnit, setHighlightedWord, setReadingSpeed]);

  // Load understood map
  useEffect(() => {
    if (!bookId) return;
    loadUnderstood(userId || "guest", bookId).then((m) => setUnderstoodMap(m || {})).catch(() => {});
  }, [userId, bookId]);

  // Throttled save progress
  const saveTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!userId || !bookId) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveReadingProgress(userId, bookId, {
        currentPage,
        currentThoughtUnit,
        highlightedWord,
        readingSpeed,
      }).catch(() => {});
    }, 500) as unknown as number;
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    };
  }, [userId, bookId, currentPage, currentThoughtUnit, highlightedWord, readingSpeed]);

  // Enhanced speech function
  const speakText = (text: string) => {
    if (!text.trim()) return;
    
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }
    
    utterance.rate = speechRate;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    
    speechSynthesis.speak(utterance);
  };

  const stopSpeaking = () => {
    speechSynthesis.cancel();
    setIsSpeaking(false);
  };

  // Enhanced word click handler with navigation
  const handleEnhancedWordClick = async (text: string, event?: React.MouseEvent) => {
    // Regular word click functionality
    onWordClick(text);
    setSelectionText(text);
    onTextSelect?.(text);

    // Navigation functionality
    if (tableOfContents && tableOfContents.length > 0) {
      try {
        // First search for navigation target
        const searchResult = searchTOCForNavigation(text, tableOfContents);
        
        if (searchResult.found && searchResult.page && searchResult.page !== currentPage) {
          // Add to navigation history
          navigationHistory.addEntry(currentPage, `Page ${currentPage}`, 'word-click');
          
          // Navigate to target page
          onPageChange(searchResult.page);
          
          // Show navigation feedback
          const feedback = createNavigationFeedback(searchResult, text);
          setNavigationFeedback(feedback);
          setShowNavigationFeedback(true);
          
          // Auto-hide feedback after 3 seconds
          setTimeout(() => {
            setShowNavigationFeedback(false);
          }, 3000);
        }
      } catch (error) {
        console.warn('Navigation error:', error);
      }
    }
  };

  // Selection fallback
  const handleMouseUp = () => {
    if (typeof window === "undefined") return;
    const sel = window.getSelection()?.toString().trim() || "";
    setSelectionText(sel);
    if (sel) {
      onTextSelect?.(sel);
      // Handle navigation for selected text
      handleEnhancedWordClick(sel);
    }
  };

  // Empty states
  if (!thoughtUnits?.length) {
    return (
      <div className="p-4 flex items-center justify-center text-gray-400 italic">
        📂 Please upload a PDF to start Enhanced Hybrid Reading.
      </div>
    );
  }

  const rawUnit = thoughtUnits[currentThoughtUnit - 1];
  if (!rawUnit) {
    return (
      <div className="p-4 flex items-center justify-center text-gray-400 italic">
        ⏳ Preparing your enhanced hybrid view...
      </div>
    );
  }

  const unitText = unitToText(rawUnit);

  // Enhanced chunking
  const chunks = useMemo(
    () => chunkText(unitText, { mode: chunkMode, targetChars: chunkChars }),
    [unitText, chunkMode, chunkChars]
  );
  const [activeIdx, setActiveIdx] = useState(0);
  useEffect(() => setActiveIdx(0), [unitText, chunkChars, chunkMode]);

  // Auto-advance with speech - optimized timing
  useEffect(() => {
    if (!chunks.length || !isReading || isPaused || localPaused) return;
    const msPerChunk = Math.max(1000, (60_000 / Math.max(120, readingSpeed)) * 1.8); // Increased timing for smoother experience
    const t = window.setInterval(() => {
      setActiveIdx((i) => {
        const nextIdx = Math.min(i + 1, chunks.length - 1);
        if (autoSpeak && nextIdx !== i) {
          speakText(chunks[nextIdx]);
        }
        return nextIdx;
      });
    }, msPerChunk);
    return () => window.clearInterval(t);
  }, [chunks.length, readingSpeed, isReading, isPaused, localPaused, autoSpeak]);

  const activeChunk = chunks[activeIdx] || "";
  const cueToken = keyTokenFromChunk(activeChunk);
  const activeChunkId = stableChunkId(activeChunk);
  const isUnderstood = !!understoodMap[activeChunkId];

  // Enhanced right-brain analysis
  const rightBrainAnalysis = useMemo(() => 
    analyzeChunkWithRightBrain(activeChunk, activeIdx, chunks.length),
    [activeChunk, activeIdx, chunks.length]
  );

  const effectiveSelection = (externalSelectionText?.trim() || selectionText).trim();

  // Analyze and render thought units when page or chunk changes
  useEffect(() => {
    if (!thoughtUnitRenderer || !showThoughtUnits || !activeChunk) return;
    
    const analyzeAndRender = async () => {
      try {
        // Get page text from PDF container
        const pageText = pdfContainerRef.current?.textContent || activeChunk;
        
        // Render thought units on the current page
        await thoughtUnitRenderer.renderThoughtUnits(pageText, currentPage);
        
        // Update state with current analysis
        const analysis = analyzeTextForThoughtUnits(activeChunk, activeIdx);
        setCurrentThoughtUnits(analysis.thoughtUnits);
        setCurrentMainIdea(analysis.mainIdeaAnalysis);
        
        console.log(`🧠 Analyzed ${analysis.thoughtUnits.length} thought units for page ${currentPage}`);
        
      } catch (error) {
        console.error('Error analyzing thought units:', error);
      }
    };
    
    // Debounce the analysis to avoid excessive processing
    const timeoutId = setTimeout(analyzeAndRender, 500);
    return () => clearTimeout(timeoutId);
  }, [thoughtUnitRenderer, showThoughtUnits, activeChunk, currentPage, activeIdx]);

  // Simplified highlighting for better performance
  useEffect(() => {
    if (!pdfContainerRef.current) return;
    
    // Simple page indexing for navigation context
    if (syncDebounceRef.current) {
      clearTimeout(syncDebounceRef.current);
    }
    
    syncDebounceRef.current = window.setTimeout(() => {
      const pageIndex = buildPageTextIndex(currentPage, pdfContainerRef.current!);
      if (pageIndex) {
        pageIndexCache.set(currentPage, pageIndex);
        setPageTextIndex(pageIndex);
      }
      syncDebounceRef.current = null;
    }, 600);
    
    return () => {
      if (syncDebounceRef.current) {
        clearTimeout(syncDebounceRef.current);
        syncDebounceRef.current = null;
      }
    };
  }, [currentPage]);

  // Chapter transition detection (simplified)
  const [previousPage, setPreviousPage] = useState(currentPage);
  
  useEffect(() => {
    if (!tableOfContents?.length || !activeChunk) return;
    
    const currentChapter = tableOfContents.find(toc => toc.page <= currentPage);
    if (!currentChapter) return;
    
    // Detect chapter transition (synchronous function)
    const transition = detectChapterTransition(currentPage, previousPage, tableOfContents);
    
    if (transition.isTransition && transition.chapterInfo) {
      console.log(`🎨 Chapter transition detected: ${currentChapter.title}`);
    }
    
    // Update previous page for next comparison
    setPreviousPage(currentPage);
  }, [currentPage, activeChunk, tableOfContents, previousPage]);

  // Optimized PDF highlighting with reduced frequency
  useEffect(() => {
    if (pdfContainerRef.current && cueToken && showProgressiveOverlay && cueToken.length > 3) {
      // Longer delay and less frequent highlighting
      const timeoutId = setTimeout(() => {
        createHighlightOverlay(pdfContainerRef.current!, cueToken);
      }, 300); // Increased delay for better performance
      
      return () => clearTimeout(timeoutId);
    }
  }, [cueToken, showProgressiveOverlay]); // Removed currentPage dependency to reduce frequency

  // Memoize highlight regex
  const hlRegex = useMemo(() => {
    if (!highlightedWord) return null;
    try {
      return new RegExp(`\\b${escapeRegExp(highlightedWord)}\\b`);
    } catch {
      return null;
    }
  }, [highlightedWord]);

  const activePrompt = COMPREHENSION_PROMPTS[promptIdx];
  const promptContext = (effectiveSelection || activeChunk || unitText || sampleText).trim();

  // Hotkeys
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const editable = (e.target as HTMLElement)?.getAttribute?.("contenteditable") === "true";
      if (tag === "INPUT" || tag === "TEXTAREA" || editable) return;

      if (e.code === "Space") {
        e.preventDefault();
        setLocalPaused((p) => !p);
      } else if (e.key === "ArrowRight" || e.key.toLowerCase() === "j") {
        const nextIdx = Math.min(activeIdx + 1, chunks.length - 1);
        setActiveIdx(nextIdx);
        if (autoSpeak) speakText(chunks[nextIdx]);
      } else if (e.key === "ArrowLeft" || e.key.toLowerCase() === "k") {
        const prevIdx = Math.max(activeIdx - 1, 0);
        setActiveIdx(prevIdx);
        if (autoSpeak) speakText(chunks[prevIdx]);
      } else if (e.key.toLowerCase() === "g") {
        e.preventDefault();
        toggleUnderstood();
      } else if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (isSpeaking) {
          stopSpeaking();
        } else {
          speakText(activeChunk);
        }
      } else if (e.key === "Enter") {
        onGenerateNote?.(activePrompt.build(promptContext), undefined, "highYield");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chunks.length, promptContext, promptIdx, activeChunk, activeIdx, isSpeaking, autoSpeak]);

  function toggleUnderstood() {
    setUnderstoodMap((m) => {
      const next = { ...m };
      if (next[activeChunkId]) delete next[activeChunkId];
      else next[activeChunkId] = true;
      return next;
    });
    markUnderstood(userId || "guest", bookId, activeChunkId).catch(() => {});
  }

  const [showQuiz, setShowQuiz] = useState(false);
  const quiz = useMemo(() => makeTwoChoiceQuiz(activeChunk), [activeChunk]);
  const [quizPick, setQuizPick] = useState<number | null>(null);
  useEffect(() => {
    setQuizPick(null);
  }, [quiz.prompt, activeChunkId]);

  const understoodCount = useMemo(
    () => chunks.reduce((n, c) => n + (understoodMap[stableChunkId(c)] ? 1 : 0), 0),
    [chunks, understoodMap]
  );
  const understoodPct = chunks.length ? Math.round((understoodCount / chunks.length) * 100) : 0;

  return (
    <div className="grid grid-cols-2 gap-4 p-4 h-full">
      {/* Enhanced Original PDF Format View (Left - 50% split) */}
      <div className="col-span-1 bg-gray-900 rounded-lg overflow-hidden border border-gray-700 shadow-xl">
        <div className="flex items-center justify-between p-3 bg-gradient-to-r from-gray-800 to-gray-700 border-b border-gray-600">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold text-yellow-400">📄 Original PDF Format</h4>
            <span className="text-xs bg-yellow-500/20 px-2 py-1 rounded text-yellow-300">
              Enhanced Reading
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const prevPage = Math.max(1, currentPage - 1);
                console.log(`🔄 HybridReader: Prev button clicked - ${currentPage} -> ${prevPage}`);
                onPageChange(prevPage);
              }}
              disabled={currentPage <= 1}
              className="text-xs px-3 py-1 bg-gray-600 rounded hover:bg-gray-500 disabled:opacity-50 transition-colors"
            >
              ◀ Prev
            </button>
            <span className="text-xs bg-gray-700 px-2 py-1 rounded font-mono">
              {currentPage} / {pdfPageCount || '?'}
            </span>
            <button
              onClick={() => {
                const nextPage = Math.min(pdfPageCount || 999, currentPage + 1);
                console.log(`🔄 HybridReader: Next button clicked - ${currentPage} -> ${nextPage}`);
                onPageChange(nextPage);
              }}
              disabled={currentPage >= (pdfPageCount || 999)}
              className="text-xs px-3 py-1 bg-gray-600 rounded hover:bg-gray-500 disabled:opacity-50 transition-colors"
            >
              Next ▶
            </button>
            <div className="w-px h-4 bg-gray-600 mx-2" />
            <button
              onClick={() => setPdfScale(s => Math.max(0.5, s - 0.1))}
              className="text-xs px-2 py-1 bg-gray-600 rounded hover:bg-gray-500 transition-colors"
            >
              -
            </button>
            <span className="text-xs bg-gray-700 px-2 py-1 rounded font-mono min-w-[3rem] text-center">
              {Math.round(pdfScale * 100)}%
            </span>
            <button
              onClick={() => setPdfScale(s => Math.min(3.0, s + 0.1))}
              className="text-xs px-2 py-1 bg-gray-600 rounded hover:bg-gray-500 transition-colors"
            >
              +
            </button>
            <button
              onClick={() => setShowProgressiveOverlay(!showProgressiveOverlay)}
              className={`text-xs px-3 py-1 rounded transition-all ${
                showProgressiveOverlay 
                  ? "bg-gradient-to-r from-yellow-600 to-orange-600 text-white shadow-lg" 
                  : "bg-gray-600 hover:bg-gray-500"
              }`}
            >
              ✨ Progressive Highlights
            </button>
            <button
              onClick={() => setShowThoughtUnits(!showThoughtUnits)}
              className={`text-xs px-3 py-1 rounded transition-all ${
                showThoughtUnits 
                  ? "bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-lg" 
                  : "bg-gray-600 hover:bg-gray-500"
              }`}
              title="Toggle David Butler's Right-Brain highlighting"
            >
              🧠 Thought Units
            </button>
          </div>
        </div>
        <div 
          ref={pdfContainerRef}
          className="h-full overflow-auto relative bg-white"
          onMouseUp={selBind?.onMouseUp ?? handleMouseUp}
          style={{
            background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)'
          }}
        >
          <Document file={pdfUrl}>
            <Page 
              pageNumber={currentPage} 
              scale={pdfScale}
              renderTextLayer={true}
              renderAnnotationLayer={true}
              className="shadow-lg"
            />
          </Document>
          
          {/* Enhanced Progressive Interaction Overlay */}
          {showProgressiveOverlay && (
            <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
              <div className="absolute top-4 left-4 bg-gradient-to-r from-blue-600/90 to-purple-600/90 text-white px-3 py-2 rounded-lg shadow-lg backdrop-blur-sm">
                <div className="text-xs font-medium">Progressive Reading Active</div>
                <div className="text-xs opacity-90">Following: {cueToken || 'content'}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Enhanced Progressive Interaction Panel (Right - 50%) */}
      <div className="col-span-1 bg-gray-800 rounded-lg overflow-hidden border border-gray-700">
        <div className="flex items-center justify-between p-3 bg-gray-700">
          <h4 className="text-sm font-semibold text-yellow-400">🧠 Progressive View</h4>
          <div className="flex items-center gap-2">
            <ProgressRing value={understoodPct / 100} size={24} label={`${understoodPct}%`} />
            <span className="text-xs opacity-75">{understoodCount}/{chunks.length}</span>
          </div>
        </div>

        <div className="p-4 h-full overflow-y-auto space-y-3">
          {/* Enhanced Speechify-like Voice Controls */}
          <div className="p-3 bg-gradient-to-r from-blue-900/30 to-purple-900/30 rounded-lg border border-blue-500/30">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-medium text-blue-300">🎵 Speechify Voice</span>
              <div className="flex-1"></div>
              <button
                onClick={() => setAutoSpeak(!autoSpeak)}
                className={`text-xs px-2 py-1 rounded ${
                  autoSpeak ? "bg-green-600" : "bg-gray-700 hover:bg-gray-600"
                }`}
              >
                Auto {autoSpeak ? "✓" : "○"}
              </button>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs opacity-75 w-12">Voice:</span>
                <select
                  className="text-xs bg-gray-700 rounded px-2 py-1 flex-1"
                  value={selectedVoice?.name || ''}
                  onChange={(e) => {
                    const voice = availableVoices.find(v => v.name === e.target.value);
                    if (voice && onVoiceChange) onVoiceChange(voice);
                  }}
                >
                  <option value="">System Default</option>
                  {availableVoices
                    .filter(v => v.lang.startsWith('en'))
                    .sort((a, b) => {
                      // Prioritize neural/premium voices like Speechify
                      const aScore = (a.name.toLowerCase().includes('neural') ? 3 : 0) + 
                                    (a.name.toLowerCase().includes('premium') ? 2 : 0) +
                                    (a.name.toLowerCase().includes('enhanced') ? 1 : 0);
                      const bScore = (b.name.toLowerCase().includes('neural') ? 3 : 0) + 
                                    (b.name.toLowerCase().includes('premium') ? 2 : 0) +
                                    (b.name.toLowerCase().includes('enhanced') ? 1 : 0);
                      return bScore - aScore;
                    })
                    .map(voice => (
                      <option key={voice.name} value={voice.name}>
                        {voice.name.split(' ')[0]} 
                        {voice.name.toLowerCase().includes('neural') && ' ⚡'}
                        {voice.name.toLowerCase().includes('premium') && ' ✨'}
                        {voice.name.toLowerCase().includes('enhanced') && ' 🔥'}
                      </option>
                    ))
                  }
                </select>
              </div>
              
              <div className="flex items-center gap-2">
                <span className="text-xs opacity-75 w-12">Speed:</span>
                <input
                  type="range"
                  min={0.5}
                  max={2.0}
                  step={0.1}
                  value={speechRate}
                  onChange={(e) => onSpeechRateChange?.(Number(e.target.value))}
                  className="flex-1 accent-blue-400"
                />
                <span className="text-xs w-8">{speechRate}x</span>
              </div>
              
              <div className="flex gap-2">
                <button
                  onClick={() => isSpeaking ? stopSpeaking() : speakText(activeChunk)}
                  className={`text-xs px-3 py-1 rounded flex-1 font-medium ${
                    isSpeaking 
                      ? "bg-red-600 hover:bg-red-500 text-white" 
                      : "bg-blue-600 hover:bg-blue-500 text-white"
                  }`}
                >
                  {isSpeaking ? "⏹️ Stop Reading" : "🎵 Read Aloud"}
                </button>
                
                {selectedVoice && (
                  <button
                    onClick={() => speakText("Hello! This is how I sound when reading your PDF content.")}
                    className="text-xs px-2 py-1 rounded bg-purple-600 hover:bg-purple-500"
                    title="Preview voice"
                  >
                    👂
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Enhanced Progressive Controls */}
          <div className="p-3 bg-gray-900/50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-medium text-yellow-400">🧠 Progressive Reading</span>
              <div className="flex-1"></div>
              <button
                onClick={toggleUnderstood}
                className={`text-xs px-2 py-1 rounded ${
                  isUnderstood ? "bg-green-500 text-black" : "bg-gray-700 hover:bg-gray-600"
                }`}
              >
                {isUnderstood ? "✓ Got it" : "Got it?"}
              </button>
            </div>
            
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1">
                <span className="text-[10px] opacity-75">Chunk Size:</span>
                <input
                  type="range"
                  min={120}
                  max={400}
                  step={20}
                  value={chunkChars}
                  onChange={(e) => setChunkChars(Number(e.target.value))}
                  className="w-20 accent-yellow-400"
                />
                <span className="text-[10px]">{chunkChars}</span>
              </div>
              
              <select
                className="text-xs bg-gray-700 rounded px-2 py-1"
                value={chunkMode}
                onChange={(e) => setChunkMode(e.target.value as any)}
              >
                <option value="semantic">Semantic</option>
                <option value="sentence">Sentence</option>
                <option value="bullet-first">Bullet-first</option>
              </select>
            </div>
          </div>

          {/* AI-Enhanced Thought Unit Controls Panel */}
          <div className="p-3 bg-gradient-to-r from-amber-900/30 to-orange-900/30 rounded-lg border border-amber-500/30">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-medium text-amber-300">🎯 AI Thought Unit System</span>
              <div className="flex-1"></div>
              <button
                onClick={() => setLearningMode(!learningMode)}
                className={`text-xs px-2 py-1 rounded mr-2 ${
                  learningMode ? "bg-green-600" : "bg-gray-700 hover:bg-gray-600"
                }`}
                title="Enable AI learning from your feedback"
              >
                🧠 {learningMode ? "Learning" : "Static"}
              </button>
              <button
                onClick={() => setShowThoughtUnits(!showThoughtUnits)}
                className={`text-xs px-2 py-1 rounded ${
                  showThoughtUnits ? "bg-amber-600" : "bg-gray-700 hover:bg-gray-600"
                }`}
              >
                {showThoughtUnits ? "ON" : "OFF"}
              </button>
            </div>
            
            {showThoughtUnits && (
              <div className="space-y-3">
                {/* Sensitivity Controls */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs opacity-75">Highlight Sensitivity:</span>
                    <select
                      className="text-xs bg-gray-700 rounded px-2 py-1 flex-1"
                      value={thoughtUnitConfig.highlightSensitivity}
                      onChange={(e) => setThoughtUnitConfig(prev => ({
                        ...prev,
                        highlightSensitivity: e.target.value as 'minimal' | 'moderate' | 'detailed'
                      }))}
                    >
                      <option value="minimal">Minimal (Only strongest main ideas)</option>
                      <option value="moderate">Moderate (Balanced highlighting)</option>
                      <option value="detailed">Detailed (More comprehensive)</option>
                    </select>
                  </div>
                  
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs opacity-75">Main Idea Threshold:</span>
                    <input
                      type="range"
                      min={0.6}
                      max={0.95}
                      step={0.05}
                      value={thoughtUnitConfig.mainIdeaConfidenceThreshold}
                      onChange={(e) => setThoughtUnitConfig(prev => ({
                        ...prev,
                        mainIdeaConfidenceThreshold: Number(e.target.value)
                      }))}
                      className="flex-1 accent-amber-400"
                    />
                    <span className="text-xs w-10">{Math.round(thoughtUnitConfig.mainIdeaConfidenceThreshold * 100)}%</span>
                  </div>
                  
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs opacity-75">Max Main Ideas/Page:</span>
                    <input
                      type="range"
                      min={1}
                      max={5}
                      step={1}
                      value={thoughtUnitConfig.maxMainIdeasPerPage}
                      onChange={(e) => setThoughtUnitConfig(prev => ({
                        ...prev,
                        maxMainIdeasPerPage: Number(e.target.value)
                      }))}
                      className="flex-1 accent-amber-400"
                    />
                    <span className="text-xs w-4">{thoughtUnitConfig.maxMainIdeasPerPage}</span>
                  </div>
                </div>

                {/* Highlight Type Controls */}
                <div>
                  <span className="text-xs opacity-75 block mb-2">Highlight Types:</span>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={thoughtUnitConfig.showMainIdeas}
                        onChange={(e) => setThoughtUnitConfig(prev => ({
                          ...prev,
                          showMainIdeas: e.target.checked
                        }))}
                        className="accent-amber-400"
                      />
                      <span className="text-xs">Main Ideas</span>
                    </label>
                    
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={thoughtUnitConfig.showSupportingDetails}
                        onChange={(e) => setThoughtUnitConfig(prev => ({
                          ...prev,
                          showSupportingDetails: e.target.checked
                        }))}
                        className="accent-blue-400"
                      />
                      <span className="text-xs">Supporting Details</span>
                    </label>
                    
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={thoughtUnitConfig.showTransitions}
                        onChange={(e) => setThoughtUnitConfig(prev => ({
                          ...prev,
                          showTransitions: e.target.checked
                        }))}
                        className="accent-green-400"
                      />
                      <span className="text-xs">Transitions</span>
                    </label>
                    
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={thoughtUnitConfig.animationEnabled}
                        onChange={(e) => setThoughtUnitConfig(prev => ({
                          ...prev,
                          animationEnabled: e.target.checked
                        }))}
                        className="accent-purple-400"
                      />
                      <span className="text-xs">Animations</span>
                    </label>
                  </div>
                </div>

                {/* Current Analysis Display */}
                {currentMainIdea && (
                  <div className="p-2 bg-black/20 rounded border border-amber-500/20">
                    <div className="text-xs font-medium text-amber-300 mb-1">
                      Current Main Idea ({Math.round(currentMainIdea.confidence * 100)}% confidence):
                    </div>
                    <div className="text-xs text-amber-200 opacity-90 line-clamp-2">
                      {currentMainIdea.primaryIdea}
                    </div>
                    {currentThoughtUnits.length > 0 && (
                      <div className="text-xs text-amber-300 mt-1">
                        {currentThoughtUnits.length} thought units detected
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right-Brain Phase Controls */}
          <div className="flex gap-1">
            {(["gist", "pattern", "detail"] as const).map((p) => (
              <button
                key={p}
                className={`text-xs px-2 py-1 rounded flex-1 ${
                  phase === p ? "bg-yellow-500 text-black" : "bg-gray-700 hover:bg-gray-600"
                }`}
                onClick={() => setPhase(p)}
              >
                {p}
              </button>
            ))}
          </div>

          {/* Single-row Chunk Rail - Pinned at top of right pane */}
          <div className="mb-4 p-3 bg-gray-900/50 rounded-lg border border-gray-700">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-medium text-yellow-400">💭 Chunk Rail</span>
              <div className="flex-1"></div>
              <button
                onClick={() => setCompactMode(!compactMode)}
                className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600"
                title={compactMode ? "Expand view" : "Compact view"}
              >
                {compactMode ? "⬍" : "⬌"}
              </button>
            </div>
            <ChunkRail
              chunks={chunks}
              activeIdx={activeIdx}
              setActiveIdx={setActiveIdx}
              onPick={(text) => {
                // Unified navigation: setLocalUnit → navigateProgrammatically → onChunkPick
                const idx = chunks.indexOf(text);
                if (idx !== -1) {
                  setActiveIdx(idx);
                  navigateProgrammatically({
                    page: currentPage,
                    unitIndex: currentThoughtUnit,
                    activeChunkId: stableChunkId(text)
                  }, 'hybrid');
                }
                
                // Additional actions
                const keyToken = keyTokenFromChunk(text);
                onWordClick(text);
                setHighlightedWord(keyToken || text);
                setSelectionText(text);
                onTextSelect?.(text);
                if (autoSpeak) speakText(text);
              }}
              compact={compactMode}
            />
          </div>

          {/* Enhanced Right-Brain Analysis Panel with Visual Cues */}
          <div className="mb-4 p-4 bg-gradient-to-br from-yellow-500/10 via-orange-500/10 to-red-500/10 border border-yellow-500/30 rounded-lg">
            <div className="flex items-center gap-2 mb-3">
              <h5 className="text-sm font-semibold text-yellow-400">🧠 Right-Brain Reading</h5>
              <div className="flex gap-1">
                {["gist", "pattern", "detail", "movie"].map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setPhase(mode as any)}
                    className={`text-xs px-2 py-1 rounded ${
                      phase === mode 
                        ? "bg-yellow-500 text-black" 
                        : "bg-gray-700 hover:bg-gray-600"
                    }`}
                  >
                    {mode === "gist" ? "💡" : mode === "pattern" ? "🔗" : mode === "detail" ? "🔍" : "🎬"}
                  </button>
                ))}
              </div>
              <div className="flex-1"></div>
              <div className="text-xs opacity-75">
                Pattern: <span className="text-yellow-300">{rightBrainAnalysis.textPattern.type}</span>
              </div>
            </div>
            
            {phase === "gist" && (
              <div>
                <p className="text-lg font-medium mb-3 text-yellow-300">{rightBrainAnalysis.coreIdea}</p>
                {rightBrainAnalysis.keyTerms.length > 0 && (
                  <div className="mb-3">
                    <span className="text-xs opacity-75 block mb-2">🎯 Key Terms:</span>
                    <div className="flex gap-2 flex-wrap">
                      {rightBrainAnalysis.keyTerms.map((term, i) => (
                        <span 
                          key={i} 
                          className="text-xs bg-yellow-500/20 px-2 py-1 rounded cursor-pointer hover:bg-yellow-500/30 transition-colors"
                          onClick={() => handleEnhancedWordClick(term)}
                        >
                          {term}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {rightBrainAnalysis.memoryAnchors.length > 0 && (
                  <div className="text-xs">
                    <span className="opacity-75 block mb-1">🎯 Memory Anchors:</span>
                    {rightBrainAnalysis.memoryAnchors.map((anchor, i) => (
                      <div key={i} className="text-orange-300 italic mb-1">{anchor}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
            
            {phase === "pattern" && (
              <div>
                <p className="text-sm mb-2">🔗 Text Pattern & Structure:</p>
                <div className="mb-3 p-2 bg-black/20 rounded border border-yellow-500/20">
                  <div className="text-xs font-medium text-yellow-300 mb-1">
                    {rightBrainAnalysis.textPattern.type.replace('-', ' → ')}
                  </div>
                  <div className="text-xs text-yellow-200 opacity-80">
                    {rightBrainAnalysis.textPattern.structure}
                  </div>
                </div>
                
                {rightBrainAnalysis.textPattern.indicators.length > 0 && (
                  <div className="mb-3">
                    <span className="text-xs opacity-75 block mb-1">🔍 Pattern Indicators:</span>
                    <div className="flex gap-1 flex-wrap">
                      {rightBrainAnalysis.textPattern.indicators.map((indicator, i) => (
                        <span key={i} className="text-xs bg-blue-500/20 px-2 py-1 rounded text-blue-300">
                          {indicator}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                
                {rightBrainAnalysis.relationshipWords.length > 0 && (
                  <div>
                    <span className="text-xs opacity-75 block mb-1">⚡ Relationship Words:</span>
                    <div className="flex gap-2 flex-wrap">
                      {rightBrainAnalysis.relationshipWords.map((word, i) => (
                        <span key={i} className="text-xs bg-purple-500/20 px-2 py-1 rounded text-purple-300">
                          {word}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {phase === "detail" && (
              <div>
                <div className="grid grid-cols-2 gap-3 text-xs mb-3">
                  <div>
                    <span className="opacity-75 block mb-1">📊 Complexity:</span>
                    <span className={`px-2 py-1 rounded ${
                      rightBrainAnalysis.complexity === 'complex' ? 'bg-red-500/20 text-red-300' :
                      rightBrainAnalysis.complexity === 'moderate' ? 'bg-yellow-500/20 text-yellow-300' :
                      'bg-green-500/20 text-green-300'
                    }`}>
                      {rightBrainAnalysis.complexity}
                    </span>
                  </div>
                  <div>
                    <span className="opacity-75 block mb-1">🧠 Cognitive Load:</span>
                    <span className={`px-2 py-1 rounded ${
                      rightBrainAnalysis.cognitiveLoad === 'high' ? 'bg-red-500/20 text-red-300' :
                      rightBrainAnalysis.cognitiveLoad === 'medium' ? 'bg-yellow-500/20 text-yellow-300' :
                      'bg-green-500/20 text-green-300'
                    }`}>
                      {rightBrainAnalysis.cognitiveLoad}
                    </span>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-3 text-xs mb-3">
                  <div>
                    <span className="opacity-75 block mb-1">🎭 Emotional Tone:</span>
                    <span className={`px-2 py-1 rounded ${
                      rightBrainAnalysis.emotionalTone === 'exciting' ? 'bg-orange-500/20 text-orange-300' :
                      rightBrainAnalysis.emotionalTone === 'positive' ? 'bg-green-500/20 text-green-300' :
                      rightBrainAnalysis.emotionalTone === 'calming' ? 'bg-blue-500/20 text-blue-300' :
                      rightBrainAnalysis.emotionalTone === 'negative' ? 'bg-red-500/20 text-red-300' :
                      'bg-gray-500/20 text-gray-300'
                    }`}>
                      {rightBrainAnalysis.emotionalTone}
                    </span>
                  </div>
                  <div>
                    <span className="opacity-75 block mb-1">⏱️ Processing Time:</span>
                    <span className="text-xs text-purple-300 font-medium px-2 py-1 rounded bg-purple-500/20">
                      {Math.round(rightBrainAnalysis.processingTime)}s
                    </span>
                  </div>
                </div>
                
                {(rightBrainAnalysis.hasNumbers || rightBrainAnalysis.hasFormulas) && (
                  <div className="flex gap-2 mb-3">
                    {rightBrainAnalysis.hasNumbers && (
                      <span className="text-xs bg-blue-500/20 px-2 py-1 rounded">📊 Contains Numbers</span>
                    )}
                    {rightBrainAnalysis.hasFormulas && (
                      <span className="text-xs bg-purple-500/20 px-2 py-1 rounded">🧮 Contains Formulas</span>
                    )}
                  </div>
                )}
                
                {rightBrainAnalysis.visualCues.length > 0 && (
                  <div>
                    <span className="text-xs opacity-75 block mb-1">👁️ Visual Elements:</span>
                    <div className="flex gap-2 flex-wrap">
                      {rightBrainAnalysis.visualCues.map((cue, i) => (
                        <span key={i} className="text-xs bg-blue-500/20 px-2 py-1 rounded">
                          📊 {cue}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {phase === "movie" && (
              <div>
                <div className="mb-3 p-3 bg-gradient-to-r from-purple-900/30 to-pink-900/30 rounded-lg border border-purple-500/30">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-medium text-purple-300">🎬 Mind Movie</span>
                    <div className="flex-1"></div>
                    <span className="text-xs px-2 py-1 rounded bg-purple-500/20 text-purple-300">
                      {rightBrainAnalysis.textPattern.type}
                    </span>
                  </div>
                  <p className="text-sm text-purple-200 mb-3 italic leading-relaxed">
                    {rightBrainAnalysis.mindMovieScene}
                  </p>
                  
                  <div className="mb-3 p-2 bg-black/20 rounded border border-purple-500/20">
                    <div className="text-xs font-medium text-purple-300 mb-1">Visual Metaphor:</div>
                    <div className="text-xs text-purple-200">
                      <span className="font-medium">{rightBrainAnalysis.visualMetaphor.metaphor}</span>
                      <br />
                      <span className="opacity-80">{rightBrainAnalysis.visualMetaphor.imagery}</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => speakText(rightBrainAnalysis.mindMovieScene)}
                      className="text-xs px-2 py-1 rounded bg-purple-600 hover:bg-purple-500"
                      title="Narrate the scene"
                    >
                      🎙️ Narrate Scene
                    </button>
                    <button
                      onClick={() => speakText(rightBrainAnalysis.visualMetaphor.imagery)}
                      className="text-xs px-2 py-1 rounded bg-pink-600 hover:bg-pink-500"
                      title="Describe the metaphor"
                    >
                      🎨 Describe Metaphor
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="mt-3 flex flex-wrap gap-1">
              {COMPREHENSION_PROMPTS.map((p, i) => (
                <button
                  key={p.label}
                  className={`text-xs px-2 py-1 rounded ${
                    i === promptIdx ? "bg-yellow-500 text-black" : "bg-gray-700 hover:bg-gray-600"
                  }`}
                  onClick={() => {
                    setPromptIdx(i);
                    onGenerateNote?.(p.build(promptContext), undefined, "highYield");
                  }}
                >
                  {p.label}
                </button>
              ))}
              <button
                className="text-xs px-2 py-1 rounded bg-purple-600 hover:bg-purple-500"
                onClick={() => setShowQuiz(true)}
              >
                Quiz
              </button>
            </div>
          </div>

          {/* Smart Page Context Panel */}
          <PageContextPanel
            currentPage={currentPage}
            totalPages={pdfPageCount || 1}
            chapterTitle={tableOfContents?.find(toc => toc.page <= currentPage)?.title}
            currentPageSummary={activeChunk ? (activeChunk.split(/(?<=[.!?])\s+/)[0] || activeChunk) : undefined}
            previousPageSummary={activeIdx > 0 ? (chunks[activeIdx - 1]?.split(/(?<=[.!?])\s+/)[0] || chunks[activeIdx - 1]) : undefined}
            readingProgress={(activeIdx / Math.max(chunks.length - 1, 1)) * 100}
            onPageChange={onPageChange}
          />

          {/* Quick quiz */}
          {showQuiz && (
            <div className="p-3 bg-gray-900/80 rounded-lg border border-gray-700">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs uppercase tracking-wide text-gray-300">Quick Quiz</div>
                <button
                  className="text-xs px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600"
                  onClick={() => setShowQuiz(false)}
                >
                  ✕
                </button>
              </div>
              <div className="text-sm mb-2">{quiz.prompt}</div>
              <div className="flex gap-2">
                {quiz.options.map((opt, idx) => {
                  const picked = quizPick === idx;
                  const correct = quiz.answer === idx;
                  const cls =
                    quizPick == null
                      ? "bg-gray-700 hover:bg-gray-600"
                      : picked && correct
                      ? "bg-green-600"
                      : picked && !correct
                      ? "bg-red-600"
                      : "bg-gray-700";
                  return (
                    <button
                      key={idx}
                      className={`text-xs px-2 py-1 rounded ${cls}`}
                      onClick={() => setQuizPick(idx)}
                      disabled={quizPick != null}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <RightBrainToolbar
            userId={userId}
            bookId={bookId}
            currentPage={currentPage}
            selectionText={effectiveSelection}
            onGenerateNote={onGenerateNote}
            startReview={startReview}
          />
        </div>
      </div>

      {/* Navigation Feedback */}
      {showNavigationFeedback && (
        <div className="fixed top-4 right-4 z-50 max-w-sm">
          <div className="bg-blue-600 text-white px-4 py-3 rounded-lg shadow-lg border border-blue-500">
            <div className="flex items-center gap-2">
              <span className="text-lg">🧭</span>
              <div className="flex-1">
                <div className="text-sm font-medium">Navigation</div>
                <div className="text-xs opacity-90">{navigationFeedback}</div>
              </div>
              <button
                onClick={() => setShowNavigationFeedback(false)}
                className="text-white/70 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Enhanced Styles */}
      <style jsx>{`
        @keyframes highlightPulse {
          0%   { opacity: 0.3; }
          50%  { opacity: 0.6; }
          100% { opacity: 0.3; }
        }
        @keyframes hybridPulse {
          0%   { opacity: 0.4; transform: scale(1); }
          50%  { opacity: 0.8; transform: scale(1.02); }
          100% { opacity: 0.4; transform: scale(1); }
        }
        .pdf-highlight-overlay {
          animation: highlightPulse 2s ease-in-out infinite;
          transition: all 0.3s ease-in-out;
        }
      `}</style>
    </div>
  );
}
