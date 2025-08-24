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
import { useReaderSync } from "@/lib/readerSync";
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
  const [phase, setPhase] = useState<"gist" | "pattern" | "detail">("gist");
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

  // Bidirectional sync state - optimized
  const { 
    page: globalPage,
    unitIndex: globalUnitIndex,
    activeChunkId: globalActiveChunkId,
    updateSync, 
    cacheChunkAnchor, 
    syncChunkToPDF, 
    syncPDFToChunk,
    startVisibleTextObserver 
  } = useReaderSync();
  const [pageTextIndex, setPageTextIndex] = useState<PageTextIndex | null>(null);
  const syncDebounceRef = useRef<number | null>(null);

  const { isReviewMode, currentCard, startReview, gradeCard } = useStartReview(userId);

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

  const effectiveSelection = (externalSelectionText?.trim() || selectionText).trim();

  // Create optimized debounced sync functions with higher thresholds
  const debouncedSyncChunkToPDF = useMemo(
    () => createDebounced((chunkId: string, chunkText: string) => {
      if (!pdfContainerRef.current || !chunkText.trim() || chunkText.length < 40) return;
      
      // Create chunk anchor
      const anchor = createChunkAnchor(chunkId, chunkText, currentPage);
      
      // Cache the anchor
      cacheChunkAnchor(chunkId, chunkText, currentPage);
      
      // Sync chunk to PDF using the store method
      syncChunkToPDF(chunkId, pdfContainerRef.current).then(success => {
        if (success) {
          console.log(`✅ Successfully synced chunk ${chunkId} to PDF`);
        }
      }).catch(error => {
        console.warn('Chunk to PDF sync failed:', error);
      });
    }, 300), // Increased debounce delay
    [currentPage, cacheChunkAnchor, syncChunkToPDF]
  );

  const debouncedSyncPDFToChunk = useMemo(
    () => createDebounced((page: number, visibleText: string) => {
      if (!visibleText.trim() || !chunks.length || visibleText.length < 100) return;
      
      // Build page index
      let pageIndex = pageIndexCache.get(page);
      if (!pageIndex && pdfContainerRef.current) {
        pageIndex = buildPageTextIndex(page, pdfContainerRef.current);
        if (pageIndex) {
          pageIndexCache.set(page, pageIndex);
        }
      }
      
      if (!pageIndex) return;
      
      // Find best matching chunk with higher confidence threshold
      let bestMatch: { chunkIndex: number; confidence: number } | null = null;
      
      // Only check every 3rd chunk for better performance
      chunks.forEach((chunk, index) => {
        if (index % 3 !== 0) return; // Skip 2/3 of chunks for performance
        
        const chunkId = stableChunkId(chunk);
        cacheChunkAnchor(chunkId, chunk, page);
        // Note: cacheChunkAnchor returns void, so we'll use the anchor creation directly
        let anchor = createChunkAnchor(chunkId, chunk, page);
        
        if (anchor) {
          const matchResult = findChunkInPage(anchor, pageIndex!);
          
          if (matchResult.found && matchResult.confidence > 0.4) { // Higher threshold
            if (!bestMatch || matchResult.confidence > bestMatch.confidence) {
              bestMatch = { chunkIndex: index, confidence: matchResult.confidence };
            }
          }
        }
      });
      
      // Update active chunk if we found a good match with higher confidence
      if (bestMatch && bestMatch.confidence > 0.6 && bestMatch.chunkIndex !== activeIdx) {
        setActiveIdx(bestMatch.chunkIndex);
        
        // Update sync state using the store method
        if (pdfContainerRef.current) {
          syncPDFToChunk(pdfContainerRef.current, chunks).then(matchedChunkId => {
            if (matchedChunkId) {
              console.log(`✅ Successfully synced PDF to chunk ${matchedChunkId}`);
            }
          }).catch(error => {
            console.warn('PDF to chunk sync failed:', error);
          });
        }
      }
    }, 400), // Increased debounce delay
    [chunks, activeIdx, cacheChunkAnchor, syncPDFToChunk]
  );

  // Optimized bidirectional sync with reduced frequency
  useEffect(() => {
    if (!activeChunk || !showProgressiveOverlay || activeChunk.length < 50) return;
    
    // Only sync every 3rd chunk change for better performance
    if (activeIdx % 3 === 0) {
      debouncedSyncChunkToPDF(activeChunkId, activeChunk);
    }
  }, [activeChunkId, activeChunk, showProgressiveOverlay, activeIdx, debouncedSyncChunkToPDF]);

  // Optimized PDF → Progressive sync with longer debounce
  useEffect(() => {
    if (!pdfContainerRef.current) return;
    
    // Debounce page text indexing
    if (syncDebounceRef.current) {
      clearTimeout(syncDebounceRef.current);
    }
    
    syncDebounceRef.current = window.setTimeout(() => {
      const pageIndex = buildPageTextIndex(currentPage, pdfContainerRef.current!);
      if (pageIndex) {
        pageIndexCache.set(currentPage, pageIndex);
        setPageTextIndex(pageIndex);
        
        // Sync PDF to chunk with visible text
        const visibleText = pageIndex.text.slice(0, 300); // Reduced context for performance
        debouncedSyncPDFToChunk(currentPage, visibleText);
      }
      syncDebounceRef.current = null;
    }, 600); // Longer debounce for better performance
    
    return () => {
      if (syncDebounceRef.current) {
        clearTimeout(syncDebounceRef.current);
        syncDebounceRef.current = null;
      }
    };
  }, [currentPage, debouncedSyncPDFToChunk]);

  // Chapter transition detection and animation
  const [previousPage, setPreviousPage] = useState(currentPage);
  
  useEffect(() => {
    if (!tableOfContents?.length || !activeChunk) return;
    
    const currentChapter = tableOfContents.find(toc => toc.page <= currentPage);
    if (!currentChapter) return;
    
    // Detect chapter transition (synchronous function)
    const transition = detectChapterTransition(currentPage, previousPage, tableOfContents);
    
    if (transition.isTransition && transition.chapterInfo) {
      // Cache chapter animation script using the store method
      const chapterId = `chapter-${currentPage}-${currentChapter.title.replace(/\s+/g, '-').toLowerCase()}`;
      
      // Set current chapter
      updateSync({ page: currentPage, unitIndex: currentThoughtUnit }, 'toc');
      
      // Generate simple animation steps for the chapter
      const animationSteps = [
        { type: 'title', content: currentChapter.title },
        { type: 'concept', content: activeChunk.slice(0, 100) + '...' },
        { type: 'highlight', content: 'Key concepts from this section' }
      ];
      
      // Cache the animation script (using cacheChunkAnchor as a fallback)
      cacheChunkAnchor(chapterId, JSON.stringify(animationSteps), currentPage);
      
      console.log(`🎨 Chapter transition detected: ${currentChapter.title}`);
    }
    
    // Update previous page for next comparison
    setPreviousPage(currentPage);
  }, [currentPage, activeChunk, tableOfContents, updateSync, cacheChunkAnchor, previousPage]);

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
                // 3-step process: setLocalUnit → updateSync → onChunkPick
                const idx = chunks.indexOf(text);
                if (idx !== -1) {
                  setActiveIdx(idx);
                  updateSync({
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

          {/* Right-Brain Analysis */}
          <div className="p-3 bg-gray-900/60 rounded-lg">
            <div className="text-xs uppercase tracking-wide text-gray-300 mb-2">
              Right-Brain: {phase === "gist" ? "Gist" : phase === "pattern" ? "Pattern" : "Detail"}
            </div>

            {phase === "gist" && (
              <div className="text-sm">
                <p className="font-semibold mb-1 text-yellow-300">{cueToken || "Key idea"}</p>
                <p className="text-xs opacity-90">{(activeChunk || unitText).split(/(?<=[.!?])\s+/)[0]}</p>
              </div>
            )}

            {phase === "pattern" && (
              <div className="text-xs space-y-1">
                <p className="mb-1">Look for relations:</p>
                <ul className="list-disc pl-4 space-y-0.5 opacity-90">
                  <li>Cause → effect? <span className="opacity-70">(because, therefore)</span></li>
                  <li>Compare/contrast? <span className="opacity-70">(however, whereas)</span></li>
                  <li>Sequence? <span className="opacity-70">(first, next, then)</span></li>
                </ul>
              </div>
            )}

            {phase === "detail" && (
              <div className="text-xs opacity-90">{activeChunk || unitText}</div>
            )}

            {/* Action buttons */}
            <div className="mt-2 flex flex-wrap gap-1">
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
