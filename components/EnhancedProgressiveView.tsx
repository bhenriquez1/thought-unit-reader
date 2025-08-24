"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { ThoughtUnit as BaseThoughtUnit, ReadingStats } from "@/types/reading";
import { useStartReview } from "@/hooks/useStartReview";
import RightBrainToolbar from "@/components/RightBrainToolbar";
import RightBrainNoteEditor from "@/components/RightBrainNoteEditor";
import { saveReadingProgress, loadReadingProgress } from "@/lib/firebase";
import { chunkText, stableChunkId } from "@/lib/chunkers";
import { loadUnderstood, markUnderstood } from "@/lib/understoodStore";
import { Document, Page } from "react-pdf";
import { 
  handleWordClickNavigation, 
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
  findChunkInPage, 
  highlightChunkInPDF,
  buildPageTextIndex,
  type PageTextIndex,
  type AnchorToken
} from "@/lib/anchorSync";
import { 
  analyzeChunkWithRightBrain,
  type RightBrainChunkAnalysis,
  type TextPattern,
  type VisualMetaphor
} from "@/lib/rightBrainReading";

type PVUnit = BaseThoughtUnit | string | string[] | { text?: string };

interface EnhancedProgressiveViewProps {
  bookId: string;
  userId: string;
  thoughtUnits: PVUnit[];
  currentThoughtUnit: number;
  
  // PDF Integration
  pdfUrl?: string;
  currentPage: number;
  pdfPageCount?: number;
  onPageChange?: (page: number) => void;

  readingSpeed: number;
  isReading?: boolean;
  isPaused?: boolean;

  stats?: ReadingStats;
  highlightedWord: string;

  fontSize: number;
  fontFamily: string;
  lineSpacing: number;

  onWordClick?: (word: string) => void;
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

function unitToText(u: PVUnit): string {
  if (u == null) return "";
  if (typeof u === "string") return u;
  if (Array.isArray(u)) return u.join(" ");
  const maybeText = (u as any).text;
  return typeof maybeText === "string" ? maybeText : JSON.stringify(u);
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Enhanced chunk highlighting with core idea extraction using right-brain principles
function extractCoreIdea(chunk: string): string {
  const sentences = chunk.split(/[.!?]+/).filter(s => s.trim().length > 10);
  if (sentences.length === 0) return chunk;
  
  // Enhanced key indicators for right-brain learning
  const keyIndicators = [
    'is', 'are', 'means', 'refers to', 'defined as', 'concept of',
    'represents', 'symbolizes', 'demonstrates', 'illustrates', 'shows',
    'causes', 'results in', 'leads to', 'creates', 'produces'
  ];
  
  const coreIdea = sentences.find(s => 
    keyIndicators.some(indicator => s.toLowerCase().includes(indicator))
  ) || sentences[0];
  
  return coreIdea.trim();
}

// Enhanced right-brain focused chunk analysis with visual and conceptual mapping
function analyzeChunkForRightBrain(chunk: string) {
  const words = chunk.split(/\s+/).filter(Boolean);
  const sentences = chunk.split(/[.!?]+/).filter(s => s.trim().length > 5);
  
  // Enhanced key term detection
  const keyTerms = words.filter(w => 
    w.length > 5 || 
    /^[A-Z]/.test(w) || 
    /\d/.test(w) ||
    /^(the|a|an)\s+[A-Z]/.test(w) // Articles followed by capitalized words
  );
  
  // Visual and spatial cues
  const visualCues = words.filter(w => 
    ['diagram', 'figure', 'chart', 'graph', 'image', 'illustration', 'map', 'structure', 'pattern', 'shape', 'form'].includes(w.toLowerCase())
  );
  
  // Process and action words for procedural understanding
  const actionWords = words.filter(w => 
    ['process', 'method', 'step', 'procedure', 'technique', 'approach', 'strategy', 'system', 'mechanism', 'pathway'].includes(w.toLowerCase())
  );
  
  // Relationship indicators for conceptual connections
  const relationshipWords = words.filter(w =>
    ['because', 'therefore', 'however', 'although', 'while', 'whereas', 'since', 'thus', 'hence', 'consequently'].includes(w.toLowerCase())
  );
  
  // Emotional/memory anchors for better retention
  const memoryAnchors = sentences.filter(s => {
    const lower = s.toLowerCase();
    return lower.includes('important') || lower.includes('key') || lower.includes('critical') || 
           lower.includes('remember') || lower.includes('note') || lower.includes('significant');
  });
  
  return {
    coreIdea: extractCoreIdea(chunk),
    keyTerms: keyTerms.slice(0, 4),
    visualCues,
    actionWords,
    relationshipWords,
    memoryAnchors: memoryAnchors.slice(0, 2),
    complexity: sentences.length > 3 ? 'complex' : sentences.length > 1 ? 'moderate' : 'simple',
    hasNumbers: /\d/.test(chunk),
    hasFormulas: /[=+\-*/^(){}[\]]/.test(chunk)
  };
}

// Enhanced PDF text highlighting with intelligent positioning
function highlightTextInPDF(
  pdfContainer: HTMLElement,
  text: string,
  color: string = "rgba(255, 235, 59, 0.4)",
  pulseAnimation: boolean = true
) {
  // Remove existing highlights
  const existingHighlights = pdfContainer.querySelectorAll('.pdf-chunk-highlight');
  existingHighlights.forEach(el => el.remove());

  if (!text.trim()) return;

  // Create multiple highlight attempts for better coverage
  const searchTerms = [
    text,
    ...text.split(/\s+/).filter(w => w.length > 4).slice(0, 3), // Key words
    extractCoreIdea(text).split(/\s+/).slice(0, 5).join(' ') // Core idea
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
      const nodeText = textNode.textContent || '';
      const regex = new RegExp(escapeRegExp(term), 'gi');
      const matches = [...nodeText.matchAll(regex)];

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
              highlight.className = 'pdf-chunk-highlight';
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
                ${pulseAnimation ? 'animation: rightBrainPulse 3s ease-in-out infinite;' : ''}
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

export default function EnhancedProgressiveView({
  bookId,
  userId,
  thoughtUnits,
  currentThoughtUnit,
  pdfUrl,
  currentPage,
  pdfPageCount,
  onPageChange,
  readingSpeed,
  isReading = true,
  isPaused = false,
  highlightedWord,
  fontSize,
  fontFamily,
  lineSpacing,
  onWordClick,
  setReadingSpeed,
  onTextSelect,
  onGenerateNote,
  selBind,
  externalSelectionText,
  selectedVoice,
  onVoiceChange,
  speechRate = 1.0,
  onSpeechRateChange,
  tableOfContents = [],
  onChunkPick,
}: EnhancedProgressiveViewProps) {
  const [loaded, setLoaded] = useState(false);
  const [selectionText, setSelectionText] = useState("");
  const [showNoteEditor, setShowNoteEditor] = useState(false);
  const [localPaused, setLocalPaused] = useState(false);
  
  // Navigation state
  const [navigationHistory] = useState(() => new NavigationHistory());
  const [navigationFeedback, setNavigationFeedback] = useState<string>("");
  const [showNavigationFeedback, setShowNavigationFeedback] = useState(false);
  
  // Enhanced chunking with right-brain focus - optimized for PDF reading
  const [chunkChars, setChunkChars] = useState(220); // Optimized chunk size for better performance
  const [chunkMode, setChunkMode] = useState<"semantic" | "sentence" | "bullet-first">("semantic");
  const [focusMode, setFocusMode] = useState<"core" | "detail" | "visual" | "movie">("core");
  
  // Enhanced PDF view integration - more PDF-focused
  const [pdfScale, setPdfScale] = useState(1.0); // Better default scale for reading
  const [showPdfOverlay, setShowPdfOverlay] = useState(true);
  const [pdfViewMode, setPdfViewMode] = useState<"focus" | "overview">("focus"); // New PDF focus mode
  const pdfContainerRef = useRef<HTMLDivElement>(null);
  
  // Enhanced voice and speech with Speechify-like features
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [speechifyMode, setSpeechifyMode] = useState(true); // Enhanced speech mode
  
  // Enhanced understood tracking with right-brain patterns
  const [understoodMap, setUnderstoodMap] = useState<Record<string, true>>({});
  const [rightBrainInsights, setRightBrainInsights] = useState<Record<string, any>>({});
  
  // ChunkTOCBar state
  const [compactMode, setCompactMode] = useState(true);
  
  // Bidirectional sync state - optimized
  const [pageTextIndex, setPageTextIndex] = useState<Record<number, PageTextIndex>>({});
  const [chunkAnchors, setChunkAnchors] = useState<Record<string, AnchorToken[]>>({});
  const syncDebounceRef = useRef<number | null>(null);
  
  const { isReviewMode, currentCard, startReview, gradeCard } = useStartReview(userId);
  
  // Reader sync integration - subscribe to global state
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

  // Subscribe to global state changes and reflect them (controlled behavior)
  useEffect(() => {
    // Don't reset on mount - only update if there's a meaningful change
    if (globalUnitIndex !== currentThoughtUnit && globalUnitIndex > 0) {
      console.log(`🔄 Progressive: Global unit changed ${currentThoughtUnit} -> ${globalUnitIndex}`);
      // Don't call setCurrentThoughtUnit here as it would cause a loop
      // The parent component manages this state
    }
  }, [globalUnitIndex, currentThoughtUnit]);


  // Load available voices
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

  // Load understood map
  useEffect(() => {
    if (!bookId) return;
    loadUnderstood(userId || "guest", bookId)
      .then((m) => setUnderstoodMap(m || {}))
      .catch(() => {});
  }, [userId, bookId]);

  // Load saved progress
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!userId || !bookId) return setLoaded(true);
      try {
        const snap = await loadReadingProgress(userId, bookId);
        if (!cancelled && snap && typeof snap.readingSpeed === "number") {
          setReadingSpeed?.(snap.readingSpeed);
        }
      } catch (err) {
        console.error("❌ Error loading reading progress:", err);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [userId, bookId, setReadingSpeed]);

  // Empty states
  if (!thoughtUnits || thoughtUnits.length === 0) {
    return (
      <div className="p-4 flex items-center justify-center text-gray-400 italic">
        📂 Please upload a PDF to start Enhanced Progressive Reading.
      </div>
    );
  }

  const rawUnit = thoughtUnits[currentThoughtUnit - 1];
  if (!rawUnit) {
    return (
      <div className="p-4 flex items-center justify-center text-gray-400 italic">
        ⏳ Preparing your enhanced reading view...
      </div>
    );
  }

  const unitText = unitToText(rawUnit);

  // Enhanced chunking with right-brain analysis
  const chunks = useMemo(
    () => chunkText(unitText, { mode: chunkMode, targetChars: chunkChars }),
    [unitText, chunkMode, chunkChars]
  );

  const [activeIdx, setActiveIdx] = useState(0);
  
  // Don't reset activeIdx on unit change - let it be controlled by sync
  useEffect(() => {
    // Only reset if we're switching to a completely different unit
    // and there's no global chunk state to preserve
    if (!globalActiveChunkId) {
      setActiveIdx(0);
    }
  }, [unitText, chunkMode, chunkChars, globalActiveChunkId]);

  // Auto-advance with speech integration
  useEffect(() => {
    if (!chunks.length || !isReading || isPaused || localPaused) return;
    const msPerChunk = Math.max(800, (60_000 / Math.max(120, readingSpeed)) * 1.5);
    const t = window.setInterval(
      () => setActiveIdx((i) => {
        const nextIdx = Math.min(i + 1, chunks.length - 1);
        if (autoSpeak && nextIdx !== i) {
          speakChunk(chunks[nextIdx]);
        }
        return nextIdx;
      }),
      msPerChunk
    );
    return () => window.clearInterval(t);
  }, [chunks, readingSpeed, isReading, isPaused, localPaused, autoSpeak]);

  const activeChunk = chunks[activeIdx] || "";
  const activeChunkId = stableChunkId(activeChunk);
  const isUnderstood = !!understoodMap[activeChunkId];
  
  // Enhanced right-brain analysis
  const rightBrainAnalysis = useMemo(() => 
    analyzeChunkWithRightBrain(activeChunk, activeIdx, chunks.length),
    [activeChunk, activeIdx, chunks.length]
  );
  
  // Keep backward compatibility
  const chunkAnalysis = rightBrainAnalysis;

  // Build anchor tokens for current chunk
  const chunkAnchorTokens = useMemo(() => {
    if (!activeChunk) return [];
    return extractAnchorTokens(activeChunk);
  }, [activeChunk]);

  // Cache chunk anchors for sync
  useEffect(() => {
    if (activeChunkId && activeChunk) {
      cacheChunkAnchor(activeChunkId, activeChunk, currentPage);
      setChunkAnchors(prev => ({
        ...prev,
        [activeChunkId]: chunkAnchorTokens
      }));
    }
  }, [activeChunkId, activeChunk, currentPage, chunkAnchorTokens, cacheChunkAnchor]);

  // Build page text index for current page - optimized with longer debounce
  useEffect(() => {
    if (!pdfContainerRef.current || !currentPage) return;
    
    // Debounce page text indexing with longer delay for better performance
    if (syncDebounceRef.current) {
      clearTimeout(syncDebounceRef.current);
    }
    
    syncDebounceRef.current = window.setTimeout(() => {
      const pageText = buildPageTextIndex(currentPage, pdfContainerRef.current!);
      if (pageText) {
        setPageTextIndex(prev => ({
          ...prev,
          [currentPage]: pageText
        }));
      }
      syncDebounceRef.current = null;
    }, 500); // Increased from 300ms to 500ms

    return () => {
      if (syncDebounceRef.current) {
        clearTimeout(syncDebounceRef.current);
        syncDebounceRef.current = null;
      }
    };
  }, [currentPage]);

  // Optimized auto-advance with reduced sync frequency
  useEffect(() => {
    if (!chunks.length || !isReading || isPaused || localPaused) return;
    
    const msPerChunk = Math.max(1200, (60_000 / Math.max(120, readingSpeed)) * 2); // Increased timing for smoother experience
    
    const t = window.setInterval(() => {
      setActiveIdx((i) => {
        const nextIdx = Math.min(i + 1, chunks.length - 1);
        const nextChunk = chunks[nextIdx];
        
        if (nextIdx !== i && nextChunk) {
          // Optimized sync: only sync if confidence threshold is met
          if (pdfContainerRef.current && onPageChange) {
            const chunkTokens = extractAnchorTokens(nextChunk);
            const pageIndex = pageTextIndex[currentPage];
            
            if (pageIndex && chunkTokens.length > 0) {
              // Create chunk anchor for matching
              const chunkAnchor = {
                chunkId: stableChunkId(nextChunk),
                tokens: chunkTokens,
                originalText: nextChunk,
                normalizedText: nextChunk.toLowerCase().replace(/\s+/g, ' ').trim(),
                pageGuess: currentPage
              };
              
              const matchResult = findChunkInPage(chunkAnchor, pageIndex);
              
              // Higher confidence threshold to reduce unnecessary operations
              if (matchResult.found && matchResult.confidence > 0.5) {
                // Delayed highlight with longer debounce for better performance
                setTimeout(() => {
                  if (pdfContainerRef.current) {
                    highlightTextInPDF(
                      pdfContainerRef.current,
                      nextChunk,
                      "rgba(255, 235, 59, 0.6)"
                    );
                  }
                }, 250); // Increased debounce for smoother experience
              }
              // Removed adjacent page search for better performance
            }
          }
          
          // Update sync state less frequently
          if (nextIdx % 3 === 0) { // Only update sync every 3rd chunk
            updateSync({
              page: currentPage,
              unitIndex: currentThoughtUnit,
              activeChunkId: stableChunkId(nextChunk)
            }, 'progressive');
          }
          
          // Auto-speak if enabled
          if (autoSpeak) {
            speakChunk(nextChunk);
          }
        }
        
        return nextIdx;
      });
    }, msPerChunk);
    
    return () => window.clearInterval(t);
  }, [chunks, readingSpeed, isReading, isPaused, localPaused, autoSpeak, pageTextIndex, currentPage, onPageChange, currentThoughtUnit, updateSync]);

  // Optimized bidirectional sync: Progressive → PDF with higher thresholds
  useEffect(() => {
    if (!activeChunk || !pdfContainerRef.current || !onPageChange) return;
    
    // Only sync if chunk has sufficient content
    if (activeChunk.length < 50) return;
    
    // Sync chunk to PDF with anchor matching
    const syncToPDF = async () => {
      try {
        if (pdfContainerRef.current) {
          const result = await syncChunkToPDF(
            stableChunkId(activeChunk),
            pdfContainerRef.current
          );
          
          if (result) {
            console.log(`🔄 Progressive → PDF sync: chunk found and highlighted`);
          }
        }
      } catch (error) {
        console.warn('Progressive → PDF sync error:', error);
      }
    };
    
    // Longer debounce to reduce sync frequency
    if (syncDebounceRef.current) {
      clearTimeout(syncDebounceRef.current);
    }
    
    syncDebounceRef.current = window.setTimeout(syncToPDF, 400); // Increased from 200ms to 400ms
    
    return () => {
      if (syncDebounceRef.current) {
        clearTimeout(syncDebounceRef.current);
        syncDebounceRef.current = null;
      }
    };
  }, [activeChunk, syncChunkToPDF]);

  // Optimized PDF highlighting with reduced frequency
  useEffect(() => {
    if (pdfContainerRef.current && activeChunk && showPdfOverlay && activeChunk.length > 30) {
      // Longer delay and less frequent highlighting
      const timeoutId = setTimeout(() => {
        const highlightColor = focusMode === "core" 
          ? "rgba(255, 235, 59, 0.4)" 
          : focusMode === "visual" 
          ? "rgba(59, 130, 246, 0.3)"
          : "rgba(34, 197, 94, 0.3)";
        
        highlightTextInPDF(pdfContainerRef.current!, activeChunk, highlightColor, false); // Disabled pulse animation for performance
      }, 400); // Increased delay for better performance
      
      return () => clearTimeout(timeoutId);
    }
  }, [activeChunk, showPdfOverlay, focusMode]); // Removed currentPage dependency to reduce frequency

  // Enhanced speech function
  const speakChunk = (text: string) => {
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
        if (autoSpeak) speakChunk(chunks[nextIdx]);
      } else if (e.key === "ArrowLeft" || e.key.toLowerCase() === "k") {
        const prevIdx = Math.max(activeIdx - 1, 0);
        setActiveIdx(prevIdx);
        if (autoSpeak) speakChunk(chunks[prevIdx]);
      } else if (e.key.toLowerCase() === "g") {
        e.preventDefault();
        toggleUnderstood();
      } else if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (isSpeaking) {
          stopSpeaking();
        } else {
          speakChunk(activeChunk);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chunks.length, activeChunkId, activeIdx, activeChunk, isSpeaking, autoSpeak]);

  function toggleUnderstood() {
    setUnderstoodMap((m) => {
      const next = { ...m };
      if (next[activeChunkId]) delete next[activeChunkId];
      else next[activeChunkId] = true;
      return next;
    });
    markUnderstood(userId || "guest", bookId, activeChunkId).catch(() => {});
  }

  // Enhanced word click handler with navigation
  const handleEnhancedWordClick = async (text: string, event?: React.MouseEvent) => {
    // Regular word click functionality
    onWordClick?.(text);
    setSelectionText(text);
    onTextSelect?.(text);

    // Navigation functionality
    if (tableOfContents && tableOfContents.length > 0 && onPageChange) {
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

  const handleMouseUp = () => {
    const selection = window.getSelection()?.toString().trim() || "";
    setSelectionText(selection);
    onTextSelect?.(selection);
    
    // Handle navigation for selected text
    if (selection) {
      handleEnhancedWordClick(selection);
    }
  };

  const effectiveSelection = (externalSelectionText?.trim() || selectionText).trim();

  return (
    <div className="grid grid-cols-2 gap-4 p-4 h-full">
      {/* Enhanced PDF View (Left - 50% split) */}
      {pdfUrl && showPdfOverlay && (
        <div className="col-span-1 bg-gray-900 rounded-lg overflow-hidden border border-gray-700">
          <div className="flex items-center justify-between p-3 bg-gray-800 border-b border-gray-700">
            <h4 className="text-sm font-semibold text-yellow-400">📄 Enhanced PDF Reader</h4>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onPageChange && onPageChange(Math.max(1, currentPage - 1))}
                disabled={currentPage <= 1}
                className="text-xs px-2 py-1 bg-gray-600 rounded hover:bg-gray-500 disabled:opacity-50"
              >
                ◀
              </button>
              <span className="text-xs">{currentPage} / {pdfPageCount || '?'}</span>
              <button
                onClick={() => onPageChange && onPageChange(Math.min(pdfPageCount || 999, currentPage + 1))}
                disabled={currentPage >= (pdfPageCount || 999)}
                className="text-xs px-2 py-1 bg-gray-600 rounded hover:bg-gray-500 disabled:opacity-50"
              >
                ▶
              </button>
              <div className="w-px h-4 bg-gray-600 mx-2" />
              <button
                onClick={() => setPdfScale(s => Math.max(0.5, s - 0.1))}
                className="text-xs px-2 py-1 bg-gray-600 rounded hover:bg-gray-500"
              >
                -
              </button>
              <span className="text-xs">{Math.round(pdfScale * 100)}%</span>
              <button
                onClick={() => setPdfScale(s => Math.min(2.0, s + 0.1))}
                className="text-xs px-2 py-1 bg-gray-600 rounded hover:bg-gray-500"
              >
                +
              </button>
              <button
                onClick={() => setShowPdfOverlay(false)}
                className="text-xs px-2 py-1 bg-red-600 rounded hover:bg-red-500"
              >
                ✕
              </button>
            </div>
          </div>
          <div 
            ref={pdfContainerRef}
            className="h-full overflow-auto relative"
            onMouseUp={selBind?.onMouseUp ?? handleMouseUp}
          >
            <Document file={pdfUrl}>
              <Page 
                pageNumber={currentPage} 
                scale={pdfScale}
                renderTextLayer={true}
                renderAnnotationLayer={true}
              />
            </Document>
          </div>
        </div>
      )}

      {/* Enhanced Progressive View (Right - 50% focused interaction) */}
      <div 
        className={`${showPdfOverlay && pdfUrl ? 'col-span-1' : 'col-span-2'} bg-gray-800 p-4 rounded-lg overflow-y-auto border border-gray-700`}
        style={{ fontSize: `${fontSize}px`, fontFamily, lineHeight: lineSpacing }}
        onMouseUp={selBind?.onMouseUp ?? handleMouseUp}
      >
        {/* Compact Enhanced Controls */}
        <div className="space-y-3 mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1">
              <span className="text-[10px] opacity-75">Chunk</span>
              <input
                type="range"
                min={100}
                max={300}
                step={20}
                value={chunkChars}
                onChange={(e) => setChunkChars(Number(e.target.value))}
                className="w-16"
              />
              <span className="text-[10px]">{chunkChars}</span>
            </div>

            <button
              onClick={() => setLocalPaused((p) => !p)}
              className="text-[10px] px-2 py-1 rounded bg-gray-700 hover:bg-gray-600"
            >
              {localPaused || isPaused ? "▶️" : "⏸️"}
            </button>

            <button
              onClick={toggleUnderstood}
              className={`text-[10px] px-2 py-1 rounded ${
                isUnderstood ? "bg-green-500 text-black" : "bg-gray-700 hover:bg-gray-600"
              }`}
            >
              {isUnderstood ? "✓" : "?"}
            </button>

            {!showPdfOverlay && pdfUrl && (
              <button
                onClick={() => setShowPdfOverlay(true)}
                className="text-[10px] px-2 py-1 rounded bg-blue-600 hover:bg-blue-500"
              >
                📄
              </button>
            )}
          </div>
        </div>

        {/* Enhanced Speechify-like Voice Controls */}
        <div className="mb-4 p-3 bg-gradient-to-r from-blue-900/30 to-purple-900/30 rounded-lg border border-blue-500/30">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-medium text-blue-300">🎵 Natural Voice</span>
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
                    // Prioritize neural/premium voices
                    const aScore = (a.name.toLowerCase().includes('neural') ? 2 : 0) + 
                                  (a.name.toLowerCase().includes('premium') ? 1 : 0);
                    const bScore = (b.name.toLowerCase().includes('neural') ? 2 : 0) + 
                                  (b.name.toLowerCase().includes('premium') ? 1 : 0);
                    return bScore - aScore;
                  })
                  .map(voice => (
                    <option key={voice.name} value={voice.name}>
                      {voice.name.split(' ')[0]} 
                      {voice.name.toLowerCase().includes('neural') && ' ⚡'}
                      {voice.name.toLowerCase().includes('premium') && ' ✨'}
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
                onClick={() => isSpeaking ? stopSpeaking() : speakChunk(activeChunk)}
                className={`text-xs px-3 py-1 rounded flex-1 font-medium ${
                  isSpeaking 
                    ? "bg-red-600 hover:bg-red-500 text-white" 
                    : "bg-blue-600 hover:bg-blue-500 text-white"
                }`}
              >
                {isSpeaking ? "⏹️ Stop" : "🎵 Speak Chunk"}
              </button>
              
              {selectedVoice && (
                <button
                  onClick={() => speakChunk("Hello! This is how I sound when reading your content.")}
                  className="text-xs px-2 py-1 rounded bg-purple-600 hover:bg-purple-500"
                  title="Preview voice"
                >
                  👂
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Enhanced Right-Brain Analysis Panel with Visual Cues */}
        <div className="mb-4 p-4 bg-gradient-to-br from-yellow-500/10 via-orange-500/10 to-red-500/10 border border-yellow-500/30 rounded-lg">
          <div className="flex items-center gap-2 mb-3">
            <h5 className="text-sm font-semibold text-yellow-400">🧠 Right-Brain Reading</h5>
            <div className="flex gap-1">
              {["core", "visual", "detail", "movie"].map((mode) => (
                <button
                  key={mode}
                  onClick={() => setFocusMode(mode as any)}
                  className={`text-xs px-2 py-1 rounded ${
                    focusMode === mode 
                      ? "bg-yellow-500 text-black" 
                      : "bg-gray-700 hover:bg-gray-600"
                  }`}
                >
                  {mode === "core" ? "💡" : mode === "visual" ? "👁️" : mode === "detail" ? "🔍" : "🎬"}
                </button>
              ))}
            </div>
            <div className="flex-1"></div>
            <div className="text-xs opacity-75">
              Pattern: <span className="text-yellow-300">{rightBrainAnalysis.textPattern.type}</span>
            </div>
          </div>
          
          {focusMode === "core" && (
            <div>
              <p className="text-lg font-medium mb-3 text-yellow-300">{chunkAnalysis.coreIdea}</p>
              {chunkAnalysis.keyTerms.length > 0 && (
                <div className="mb-3">
                  <span className="text-xs opacity-75 block mb-2">🎯 Key Terms:</span>
                  <div className="flex gap-2 flex-wrap">
                    {chunkAnalysis.keyTerms.map((term, i) => (
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
              {chunkAnalysis.memoryAnchors.length > 0 && (
                <div className="text-xs">
                  <span className="opacity-75 block mb-1">🎯 Memory Anchors:</span>
                  {chunkAnalysis.memoryAnchors.map((anchor, i) => (
                    <div key={i} className="text-orange-300 italic mb-1">{anchor}</div>
                  ))}
                </div>
              )}
            </div>
          )}
          
          {focusMode === "visual" && (
            <div>
              <p className="text-sm mb-2">🎨 Visual & Spatial Elements:</p>
              {chunkAnalysis.visualCues.length > 0 ? (
                <div className="flex gap-2 flex-wrap mb-3">
                  {chunkAnalysis.visualCues.map((cue, i) => (
                    <span key={i} className="text-xs bg-blue-500/20 px-2 py-1 rounded">
                      📊 {cue}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs opacity-75 mb-3">No visual elements detected in this chunk</p>
              )}
              
              {chunkAnalysis.actionWords.length > 0 && (
                <div>
                  <span className="text-xs opacity-75 block mb-1">⚡ Process Words:</span>
                  <div className="flex gap-2 flex-wrap">
                    {chunkAnalysis.actionWords.map((word, i) => (
                      <span key={i} className="text-xs bg-green-500/20 px-2 py-1 rounded">
                        {word}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          
          {focusMode === "detail" && (
            <div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="opacity-75 block mb-1">📊 Complexity:</span>
                  <span className={`px-2 py-1 rounded ${
                    chunkAnalysis.complexity === 'complex' ? 'bg-red-500/20 text-red-300' :
                    chunkAnalysis.complexity === 'moderate' ? 'bg-yellow-500/20 text-yellow-300' :
                    'bg-green-500/20 text-green-300'
                  }`}>
                    {chunkAnalysis.complexity}
                  </span>
                </div>
                <div>
                  <span className="opacity-75 block mb-1">🔗 Relations:</span>
                  <div className="flex gap-1 flex-wrap">
                    {chunkAnalysis.relationshipWords.slice(0, 3).map((word, i) => (
                      <span key={i} className="bg-purple-500/20 px-1 py-0.5 rounded text-purple-300">
                        {word}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              
              {(chunkAnalysis.hasNumbers || chunkAnalysis.hasFormulas) && (
                <div className="mt-3 flex gap-2">
                  {chunkAnalysis.hasNumbers && (
                    <span className="text-xs bg-blue-500/20 px-2 py-1 rounded">📊 Contains Numbers</span>
                  )}
                  {chunkAnalysis.hasFormulas && (
                    <span className="text-xs bg-purple-500/20 px-2 py-1 rounded">🧮 Contains Formulas</span>
                  )}
                </div>
              )}
            </div>
          )}
          
          {focusMode === "movie" && (
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
                
                <div className="grid grid-cols-2 gap-2 text-xs">
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
                
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-xs opacity-75">⏱️ Processing Time:</span>
                  <span className="text-xs text-purple-300 font-medium">
                    {Math.round(rightBrainAnalysis.processingTime)}s
                  </span>
                  <div className="flex-1"></div>
                  <button
                    onClick={() => speakChunk(rightBrainAnalysis.mindMovieScene)}
                    className="text-xs px-2 py-1 rounded bg-purple-600 hover:bg-purple-500"
                    title="Narrate the scene"
                  >
                    🎙️ Narrate
                  </button>
                </div>
              </div>
              
              <div className="text-xs opacity-75 mb-2">
                Pattern Structure: {rightBrainAnalysis.textPattern.structure}
              </div>
              
              {rightBrainAnalysis.textPattern.indicators.length > 0 && (
                <div className="flex gap-1 flex-wrap">
                  {rightBrainAnalysis.textPattern.indicators.map((indicator, i) => (
                    <span key={i} className="text-xs bg-purple-500/20 px-2 py-1 rounded text-purple-300">
                      {indicator}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Smart Page Context Panel */}
        <PageContextPanel
          currentPage={currentPage}
          totalPages={pdfPageCount || 1}
          chapterTitle={tableOfContents?.find(toc => toc.page <= currentPage)?.title}
          currentPageSummary={activeChunk ? chunkAnalysis.coreIdea : undefined}
          previousPageSummary={activeIdx > 0 ? analyzeChunkForRightBrain(chunks[activeIdx - 1] || "").coreIdea : undefined}
          readingProgress={(activeIdx / Math.max(chunks.length - 1, 1)) * 100}
          onPageChange={onPageChange}
          className="mb-4"
        />

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
                  }, 'progressive');
                }
                
                // Call the parent's onChunkPick callback
                if (onChunkPick) {
                  onChunkPick(text);
                }
                
                // Additional actions
                onWordClick?.(text);
                setSelectionText(text);
                onTextSelect?.(text);
                if (autoSpeak) speakChunk(text);
              }}
              compact={compactMode}
            />
        </div>

        <RightBrainToolbar
          userId={userId}
          bookId={bookId}
          currentPage={currentPage}
          selectionText={effectiveSelection}
          onGenerateNote={onGenerateNote}
          startReview={startReview}
        />
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

      {/* Fallback note editor */}
      {showNoteEditor && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-6 z-50">
          <div className="bg-gray-900 p-4 rounded-lg w-full max-w-2xl">
            <RightBrainNoteEditor
              bookId={bookId}
              initialText={effectiveSelection}
              currentPage={currentPage}
              onDone={() => setShowNoteEditor(false)}
            />
          </div>
        </div>
      )}

      {/* Enhanced Styles */}
      <style jsx>{`
        @keyframes coreIdeaPulse {
          0%   { box-shadow: 0 0 0 0 rgba(250, 204, 21, 0.4); }
          70%  { box-shadow: 0 0 0 15px rgba(250, 204, 21, 0); }
          100% { box-shadow: 0 0 0 0 rgba(250, 204, 21, 0); }
        }
        @keyframes rightBrainPulse {
          0%   { opacity: 0.4; transform: scale(1); }
          50%  { opacity: 0.8; transform: scale(1.02); }
          100% { opacity: 0.4; transform: scale(1); }
        }
        .idea-chunk.active {
          animation: coreIdeaPulse 2s ease-out infinite;
        }
        .pdf-chunk-highlight {
          transition: all 0.3s ease-in-out;
        }
      `}</style>
    </div>
  );
}
