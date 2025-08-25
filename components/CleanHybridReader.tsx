"use client";

import React, { useEffect, useState, useRef, useMemo } from "react";
import type { ThoughtUnit as BaseThoughtUnit, ReadingStats } from "@/types/reading";
import { Document, Page } from "react-pdf";
import { 
  extractAnchorTokens, 
  buildPageTextIndex, 
  findChunkInPage, 
  highlightChunkInPDF,
  createChunkAnchor,
  type PageTextIndex,
  type ChunkAnchor
} from "@/lib/anchorSync";

type HRUnit = BaseThoughtUnit | string | string[] | { text?: string };

interface CleanHybridReaderProps {
  bookId: string;
  userId: string;

  // PDF Integration - Primary focus
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
}

function unitToText(u: HRUnit): string {
  if (u == null) return "";
  if (typeof u === "string") return u;
  if (Array.isArray(u)) return u.join(" ");
  const t = (u as any).text;
  return typeof t === "string" ? t : JSON.stringify(u);
}

// Smart annotation types
interface SmartAnnotation {
  id: string;
  type: "definition" | "summary" | "question" | "note" | "highlight";
  text: string;
  context: string;
  position: { x: number; y: number; page: number };
  timestamp: number;
}

// Reading pattern analysis
interface ReadingPattern {
  wordsPerMinute: number;
  focusAreas: Array<{ page: number; duration: number; selections: number }>;
  comprehensionScore: number;
  readingFlow: "linear" | "jumping" | "reviewing";
}

// Smart sidebar content generator
function generateSmartContent(selectedText: string, pageContext: string): {
  definitions: string[];
  summary: string;
  questions: string[];
  relatedConcepts: string[];
} {
  const words = selectedText.toLowerCase().split(/\s+/);
  
  // Simple keyword extraction for definitions
  const technicalTerms = words.filter(word => 
    word.length > 6 && 
    /^[a-z]+$/.test(word) &&
    !['however', 'therefore', 'because', 'through', 'without', 'between'].includes(word)
  );

  // Generate summary (first sentence or key phrase)
  const sentences = selectedText.split(/[.!?]+/);
  const summary = sentences[0]?.trim() + (sentences.length > 1 ? "..." : "");

  // Generate comprehension questions
  const questions = [
    `What is the main concept in: "${selectedText.slice(0, 50)}..."?`,
    `How does this relate to the broader context?`,
    `What are the key implications of this information?`
  ];

  return {
    definitions: technicalTerms.slice(0, 3),
    summary: summary || selectedText.slice(0, 100) + "...",
    questions: questions.slice(0, 2),
    relatedConcepts: technicalTerms.slice(0, 5)
  };
}

export default function CleanHybridReader({
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
}: CleanHybridReaderProps) {
  const [selectionText, setSelectionText] = useState("");
  const [showSmartSidebar, setShowSmartSidebar] = useState(true);
  const [annotations, setAnnotations] = useState<SmartAnnotation[]>([]);
  const [readingPattern, setReadingPattern] = useState<ReadingPattern>({
    wordsPerMinute: readingSpeed,
    focusAreas: [],
    comprehensionScore: 0,
    readingFlow: "linear"
  });

  // PDF interaction state
  const [pdfScale, setPdfScale] = useState(1.3); // Larger default for primary view
  const [highlightMode, setHighlightMode] = useState<"smart" | "manual" | "off">("smart");
  const [showReadingGuide, setShowReadingGuide] = useState(false);
  const [pageNotes, setPageNotes] = useState<Record<number, string>>({});
  
  // Smart features
  const [smartContent, setSmartContent] = useState<ReturnType<typeof generateSmartContent> | null>(null);
  const [pageTextIndex, setPageTextIndex] = useState<PageTextIndex | null>(null);
  const [focusStartTime, setFocusStartTime] = useState<number>(Date.now());
  
  // Voice and speech
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);
  
  const pdfContainerRef = useRef<HTMLDivElement>(null);

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

  // Build page text index for smart features
  useEffect(() => {
    if (!pdfContainerRef.current) return;
    
    const timeoutId = setTimeout(() => {
      const pageIndex = buildPageTextIndex(currentPage, pdfContainerRef.current!);
      if (pageIndex) {
        setPageTextIndex(pageIndex);
      }
    }, 500);
    
    return () => clearTimeout(timeoutId);
  }, [currentPage]);

  // Track reading patterns
  useEffect(() => {
    const startTime = Date.now();
    setFocusStartTime(startTime);
    
    return () => {
      const duration = Date.now() - startTime;
      if (duration > 5000) { // Only track if spent more than 5 seconds
        setReadingPattern(prev => ({
          ...prev,
          focusAreas: [
            ...prev.focusAreas.slice(-10), // Keep last 10 entries
            {
              page: currentPage,
              duration,
              selections: selectionText ? 1 : 0
            }
          ]
        }));
      }
    };
  }, [currentPage]);

  // Smart content generation
  useEffect(() => {
    if (selectionText && selectionText.length > 10) {
      const pageContext = pageTextIndex?.text.slice(0, 500) || "";
      const content = generateSmartContent(selectionText, pageContext);
      setSmartContent(content);
    } else {
      setSmartContent(null);
    }
  }, [selectionText, pageTextIndex]);

  // Enhanced text selection handler
  const handleMouseUp = (e: React.MouseEvent) => {
    const selection = window.getSelection()?.toString().trim() || "";
    setSelectionText(selection);
    
    if (selection) {
      onTextSelect?.(selection);
      onWordClick(selection);
      
      // Create smart annotation
      const rect = window.getSelection()?.getRangeAt(0)?.getBoundingClientRect();
      if (rect && pdfContainerRef.current) {
        const containerRect = pdfContainerRef.current.getBoundingClientRect();
        const annotation: SmartAnnotation = {
          id: `annotation-${Date.now()}`,
          type: "highlight",
          text: selection,
          context: pageTextIndex?.text.slice(0, 200) || "",
          position: {
            x: rect.left - containerRect.left,
            y: rect.top - containerRect.top,
            page: currentPage
          },
          timestamp: Date.now()
        };
        
        setAnnotations(prev => [...prev.slice(-20), annotation]); // Keep last 20
      }
    }
    
    // Call original handler
    selBind?.onMouseUp?.(e);
  };

  // Speech synthesis
  const speakText = (text: string) => {
    if (speechRef.current) {
      speechSynthesis.cancel();
    }

    const utterance = new SpeechSynthesisUtterance(text);
    if (selectedVoice) utterance.voice = selectedVoice;
    utterance.rate = speechRate;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    
    speechRef.current = utterance;
    speechSynthesis.speak(utterance);
  };

  const stopSpeaking = () => {
    speechSynthesis.cancel();
    setIsSpeaking(false);
  };

  // Smart highlighting based on reading patterns
  useEffect(() => {
    if (highlightMode === "smart" && pageTextIndex && pdfContainerRef.current) {
      // Highlight important terms and concepts
      const importantTerms = pageTextIndex.text
        .split(/\s+/)
        .filter(word => 
          word.length > 6 && 
          /^[A-Z]/.test(word) && // Capitalized words
          !['However', 'Therefore', 'Because', 'Through'].includes(word)
        )
        .slice(0, 5);

      importantTerms.forEach(term => {
        if (pdfContainerRef.current) {
          // Create a simple highlight overlay for the term
          const walker = document.createTreeWalker(
            pdfContainerRef.current,
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
            if (text.toLowerCase().includes(term.toLowerCase())) {
              const parent = textNode.parentElement;
              if (parent) {
                parent.style.backgroundColor = "rgba(255, 235, 59, 0.2)";
              }
            }
          });
        }
      });
    }
  }, [pageTextIndex, highlightMode]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

      switch (e.code) {
        case "Space":
          e.preventDefault();
          if (selectionText) {
            if (isSpeaking) {
              stopSpeaking();
            } else {
              speakText(selectionText);
            }
          }
          break;
        case "KeyH":
          e.preventDefault();
          setHighlightMode(prev => 
            prev === "smart" ? "manual" : 
            prev === "manual" ? "off" : "smart"
          );
          break;
        case "KeyS":
          e.preventDefault();
          setShowSmartSidebar(!showSmartSidebar);
          break;
        case "KeyN":
          e.preventDefault();
          if (selectionText) {
            onGenerateNote?.(selectionText, undefined, "highYield");
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [selectionText, isSpeaking, showSmartSidebar]);

  const effectiveSelection = (externalSelectionText?.trim() || selectionText).trim();

  return (
    <div className="h-full flex bg-gray-50">
      {/* Main PDF View (Primary - 75% width) */}
      <div className="flex-1 bg-white border-r border-gray-200">
        {/* PDF Controls */}
        <div className="flex items-center justify-between p-4 bg-white border-b border-gray-200 shadow-sm">
          <div className="flex items-center gap-4">
            <h3 className="text-lg font-semibold text-blue-600">📖 Interactive PDF Reader</h3>
            
            {/* Navigation */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                disabled={currentPage <= 1}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-300 disabled:opacity-50 text-white rounded text-sm transition-colors"
              >
                ← Previous
              </button>
              
              <div className="flex items-center gap-2 px-3 py-1 bg-gray-100 rounded">
                <span className="text-sm text-gray-600">Page</span>
                <input
                  type="number"
                  min={1}
                  max={pdfPageCount || 999}
                  value={currentPage}
                  onChange={(e) => {
                    const page = parseInt(e.target.value);
                    if (page >= 1 && page <= (pdfPageCount || 999)) {
                      onPageChange(page);
                    }
                  }}
                  className="w-16 text-center text-sm border border-gray-300 rounded px-1"
                />
                <span className="text-sm text-gray-600">of {pdfPageCount || '?'}</span>
              </div>
              
              <button
                onClick={() => onPageChange(Math.min(pdfPageCount || 999, currentPage + 1))}
                disabled={currentPage >= (pdfPageCount || 999)}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-300 disabled:opacity-50 text-white rounded text-sm transition-colors"
              >
                Next →
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Zoom Controls */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPdfScale(s => Math.max(0.5, s - 0.1))}
                className="px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded text-sm"
              >
                -
              </button>
              <span className="text-sm text-gray-600 min-w-[3rem] text-center">
                {Math.round(pdfScale * 100)}%
              </span>
              <button
                onClick={() => setPdfScale(s => Math.min(3.0, s + 0.1))}
                className="px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded text-sm"
              >
                +
              </button>
            </div>

            {/* Highlight Mode */}
            <select
              value={highlightMode}
              onChange={(e) => setHighlightMode(e.target.value as any)}
              className="text-sm border border-gray-300 rounded px-2 py-1"
            >
              <option value="smart">Smart Highlights</option>
              <option value="manual">Manual Only</option>
              <option value="off">No Highlights</option>
            </select>

            {/* Voice Control */}
            <button
              onClick={() => {
                if (isSpeaking) {
                  stopSpeaking();
                } else if (effectiveSelection) {
                  speakText(effectiveSelection);
                } else if (pageTextIndex) {
                  speakText(pageTextIndex.text.slice(0, 200));
                }
              }}
              className={`px-3 py-1 rounded text-sm ${
                isSpeaking
                  ? "bg-red-600 hover:bg-red-500 text-white"
                  : "bg-green-600 hover:bg-green-500 text-white"
              }`}
            >
              {isSpeaking ? "🔇 Stop" : "🔊 Read"}
            </button>

            {/* Smart Sidebar Toggle */}
            <button
              onClick={() => setShowSmartSidebar(!showSmartSidebar)}
              className={`px-3 py-1 rounded text-sm ${
                showSmartSidebar
                  ? "bg-purple-600 hover:bg-purple-500 text-white"
                  : "bg-gray-200 hover:bg-gray-300 text-gray-700"
              }`}
            >
              🧠 Smart Panel
            </button>
          </div>
        </div>

        {/* PDF Content */}
        <div 
          ref={pdfContainerRef}
          className="h-full overflow-auto bg-gray-100 p-4"
          onMouseUp={handleMouseUp}
          style={{
            fontSize: `${fontSize}px`,
            fontFamily,
            lineHeight: lineSpacing
          }}
        >
          <div className="flex justify-center">
            <div className="bg-white shadow-lg">
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

          {/* Reading Guide Overlay */}
          {showReadingGuide && (
            <div className="fixed inset-0 pointer-events-none z-10">
              <div className="absolute top-1/2 left-0 right-0 h-px bg-blue-400 opacity-50" />
              <div className="absolute top-1/2 left-1/2 w-2 h-2 bg-blue-500 rounded-full transform -translate-x-1/2 -translate-y-1/2" />
            </div>
          )}

          {/* Annotations Overlay */}
          {annotations
            .filter(ann => ann.position.page === currentPage)
            .map(annotation => (
              <div
                key={annotation.id}
                className="absolute bg-yellow-200 border border-yellow-400 rounded px-2 py-1 text-xs shadow-lg z-20"
                style={{
                  left: annotation.position.x,
                  top: annotation.position.y,
                }}
              >
                {annotation.text.slice(0, 30)}...
              </div>
            ))}
        </div>
      </div>

      {/* Smart Sidebar (25% width) */}
      {showSmartSidebar && (
        <div className="w-80 bg-white border-l border-gray-200 flex flex-col">
          {/* Sidebar Header */}
          <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-blue-50">
            <h4 className="text-lg font-semibold text-purple-700">🧠 Smart Assistant</h4>
            <p className="text-xs text-gray-600 mt-1">
              Select text to get definitions, summaries, and insights
            </p>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Current Selection */}
            {effectiveSelection && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <h5 className="text-sm font-semibold text-blue-700 mb-2">📝 Selected Text</h5>
                <p className="text-sm text-gray-700 italic">
                  "{effectiveSelection.slice(0, 100)}{effectiveSelection.length > 100 ? '...' : ''}"
                </p>
                
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => speakText(effectiveSelection)}
                    className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs"
                  >
                    🔊 Read
                  </button>
                  <button
                    onClick={() => onGenerateNote?.(effectiveSelection, undefined, "highYield")}
                    className="px-2 py-1 bg-green-600 hover:bg-green-500 text-white rounded text-xs"
                  >
                    📝 Note
                  </button>
                  <button
                    onClick={() => onGenerateNote?.(effectiveSelection, undefined, "sketch")}
                    className="px-2 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded text-xs"
                  >
                    🎨 Sketch
                  </button>
                </div>
              </div>
            )}

            {/* Smart Content */}
            {smartContent && (
              <div className="space-y-3">
                {/* Summary */}
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <h5 className="text-sm font-semibold text-green-700 mb-2">📋 Summary</h5>
                  <p className="text-sm text-gray-700">{smartContent.summary}</p>
                </div>

                {/* Key Terms */}
                {smartContent.definitions.length > 0 && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                    <h5 className="text-sm font-semibold text-yellow-700 mb-2">🔑 Key Terms</h5>
                    <div className="flex flex-wrap gap-2">
                      {smartContent.definitions.map((term, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-1 bg-yellow-200 text-yellow-800 rounded text-xs cursor-pointer hover:bg-yellow-300"
                          onClick={() => onWordClick(term)}
                        >
                          {term}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Questions */}
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                  <h5 className="text-sm font-semibold text-purple-700 mb-2">❓ Think About</h5>
                  <ul className="space-y-2">
                    {smartContent.questions.map((question, idx) => (
                      <li key={idx} className="text-sm text-gray-700">
                        • {question}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Page Notes */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <h5 className="text-sm font-semibold text-gray-700 mb-2">📄 Page Notes</h5>
              <textarea
                value={pageNotes[currentPage] || ""}
                onChange={(e) => setPageNotes(prev => ({
                  ...prev,
                  [currentPage]: e.target.value
                }))}
                placeholder="Add notes for this page..."
                className="w-full h-20 text-xs border border-gray-300 rounded p-2 resize-none"
              />
            </div>

            {/* Reading Stats */}
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
              <h5 className="text-sm font-semibold text-indigo-700 mb-2">📊 Reading Stats</h5>
              <div className="space-y-1 text-xs text-gray-600">
                <div>Speed: {readingPattern.wordsPerMinute} WPM</div>
                <div>Pages visited: {readingPattern.focusAreas.length}</div>
                <div>Selections made: {annotations.length}</div>
                <div>Current page time: {Math.round((Date.now() - focusStartTime) / 1000)}s</div>
              </div>
            </div>

            {/* Voice Settings */}
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
              <h5 className="text-sm font-semibold text-orange-700 mb-2">🎵 Voice Settings</h5>
              
              <div className="space-y-2">
                <div>
                  <label className="text-xs text-gray-600">Voice:</label>
                  <select
                    className="w-full text-xs border border-gray-300 rounded px-1 py-1 mt-1"
                    value={selectedVoice?.name || ''}
                    onChange={(e) => {
                      const voice = availableVoices.find(v => v.name === e.target.value);
                      if (voice && onVoiceChange) onVoiceChange(voice);
                    }}
                  >
                    <option value="">System Default</option>
                    {availableVoices
                      .filter(v => v.lang.startsWith('en'))
                      .map(voice => (
                        <option key={voice.name} value={voice.name}>
                          {voice.name.split(' ')[0]}
                        </option>
                      ))
                    }
                  </select>
                </div>
                
                <div>
                  <label className="text-xs text-gray-600">Speed: {speechRate}x</label>
                  <input
                    type="range"
                    min={0.5}
                    max={2.0}
                    step={0.1}
                    value={speechRate}
                    onChange={(e) => onSpeechRateChange?.(Number(e.target.value))}
                    className="w-full mt-1 accent-orange-400"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar Footer */}
          <div className="p-3 border-t border-gray-200 bg-gray-50">
            <div className="text-xs text-gray-500 space-y-1">
              <div><kbd>Space</kbd> - Read selection</div>
              <div><kbd>H</kbd> - Toggle highlights</div>
              <div><kbd>S</kbd> - Toggle sidebar</div>
              <div><kbd>N</kbd> - Create note</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
