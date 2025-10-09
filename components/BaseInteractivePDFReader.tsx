"use client";

import React, { useState, useRef, useEffect } from "react";
import type { ThoughtUnit as BaseThoughtUnit, ReadingStats } from "@/types/reading";
import { Page } from "react-pdf";
import { 
  buildPageTextIndex, 
  type PageTextIndex
} from "@/lib/anchorSync";
import { usePDFLoading } from "@/lib/pdfLoadingManager";

type HRUnit = BaseThoughtUnit | string | string[] | { text?: string };

interface BaseInteractivePDFReaderProps {
  bookId: string;
  userId: string;

  // PDF Integration - Primary focus
  pdfUrl: string;
  currentPage: number;
  pdfPageCount?: number;
  onPageChange: (page: number) => void;

  // Thought Units
  thoughtUnits: HRUnit[];
  currentThoughtUnit: number;
  setCurrentThoughtUnit: React.Dispatch<React.SetStateAction<number>>;

  // Text interaction
  highlightedWord: string;
  setHighlightedWord: (word: string) => void;
  onWordClick: (word: string) => void;
  onTextSelect?: (text: string) => void;
  selBind?: { onMouseUp?: (e: React.MouseEvent) => void };
  externalSelectionText?: string;

  // Display settings
  fontSize: number;
  fontFamily: string;
  lineSpacing: number;

  // Voice settings
  selectedVoice?: SpeechSynthesisVoice;
  onVoiceChange?: (voice: SpeechSynthesisVoice) => void;
  speechRate?: number;
  onSpeechRateChange?: (rate: number) => void;

  // Navigation
  tableOfContents?: any[];

  // Additional customization props
  children?: React.ReactNode;
  extraControls?: React.ReactNode;
  className?: string;
}

function unitToText(u: HRUnit): string {
  if (u == null) return "";
  if (typeof u === "string") return u;
  if (Array.isArray(u)) return u.join(" ");
  const t = (u as any).text;
  return typeof t === "string" ? t : JSON.stringify(u);
}

export default function BaseInteractivePDFReader({
  bookId,
  userId,
  pdfUrl,
  currentPage,
  pdfPageCount,
  onPageChange,
  thoughtUnits,
  currentThoughtUnit,
  setCurrentThoughtUnit,
  highlightedWord,
  setHighlightedWord,
  onWordClick,
  onTextSelect,
  selBind,
  externalSelectionText,
  fontSize,
  fontFamily,
  lineSpacing,
  selectedVoice,
  onVoiceChange,
  speechRate = 1.0,
  onSpeechRateChange,
  tableOfContents = [],
  children,
  extraControls,
  className = ""
}: BaseInteractivePDFReaderProps) {
  const [selectionText, setSelectionText] = useState("");
  const [pdfScale, setPdfScale] = useState(1.3);
  const [pageTextIndex, setPageTextIndex] = useState<PageTextIndex | null>(null);
  
  // Voice synthesis
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);
  
  const pdfContainerRef = useRef<HTMLDivElement>(null);
  
  // PDF loading management
  const pdfLoadState = usePDFLoading(pdfUrl, {
    onProgress: (progress) => {
      console.log(`PDF loading progress: ${progress}%`);
    }
  });

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

  // Build page text index for text operations
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

  // Enhanced text selection handler
  const handleMouseUp = (e: React.MouseEvent) => {
    const selection = window.getSelection()?.toString().trim() || "";
    setSelectionText(selection);
    
    if (selection) {
      onTextSelect?.(selection);
      onWordClick(selection);
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
        case "ArrowLeft":
          e.preventDefault();
          onPageChange(Math.max(1, currentPage - 1));
          break;
        case "ArrowRight":
          e.preventDefault();
          onPageChange(Math.min((pdfPageCount ?? 999), currentPage + 1));
          break;
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [selectionText, isSpeaking, currentPage, pdfPageCount, onPageChange]);

  const effectiveSelection = (externalSelectionText?.trim() || selectionText).trim();

  return (
    <div className={`h-full flex flex-col bg-white ${className}`}>
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
                max={pdfLoadState.pageCount || pdfPageCount || 999}
                value={currentPage}
                onChange={(e) => {
                  const page = parseInt(e.target.value);
                  const maxPage = pdfLoadState.pageCount || pdfPageCount || 999;
                  if (page >= 1 && page <= maxPage) {
                    onPageChange(page);
                  }
                }}
                className="w-16 text-center text-sm border border-gray-300 rounded px-1"
                disabled={pdfLoadState.isLoading}
              />
              <span className="text-sm text-gray-600">
                of {pdfLoadState.pageCount || pdfPageCount || (pdfLoadState.isLoading ? 'loading...' : '?')}
              </span>
            </div>
            
            <button
              onClick={() => {
                const maxPage = pdfLoadState.pageCount || pdfPageCount || 999;
                onPageChange(Math.min(maxPage, currentPage + 1));
              }}
              disabled={currentPage >= (pdfLoadState.pageCount || pdfPageCount || 999) || pdfLoadState.isLoading}
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

          {/* Extra controls from child components */}
          {extraControls}
        </div>
      </div>

      {/* PDF Content */}
      <div 
        ref={pdfContainerRef}
        className="flex-1 overflow-auto bg-gray-100 p-4"
        onMouseUp={handleMouseUp}
        style={{
          fontSize: `${fontSize}px`,
          fontFamily,
          lineHeight: lineSpacing
        }}
      >
        <div className="flex justify-center">
          <div className="bg-white shadow-lg">
            {pdfLoadState.hasError ? (
              <div className="p-8 text-center">
                <div className="text-red-600 mb-4">
                  <div className="text-6xl mb-4">📄❌</div>
                  <h3 className="text-lg font-semibold mb-2">PDF Loading Error</h3>
                  <p className="text-sm text-gray-600 mb-4">{pdfLoadState.error}</p>
                  <button
                    onClick={() => pdfLoadState.retry()}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded"
                  >
                    🔄 Try Again
                  </button>
                </div>
              </div>
            ) : pdfLoadState.isLoading ? (
              <div className="p-8 text-center">
                <div className="text-blue-600 mb-4">
                  <div className="text-6xl mb-4">📄⏳</div>
                  <h3 className="text-lg font-semibold mb-2">Loading PDF...</h3>
                  <div className="w-64 mx-auto bg-gray-200 rounded-full h-2 mb-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${pdfLoadState.progress}%` }}
                    />
                  </div>
                  <p className="text-sm text-gray-600">{pdfLoadState.progress}% complete</p>
                </div>
              </div>
            ) : pdfLoadState.isLoaded && pdfLoadState.document ? (
              <Page 
                key={`${pdfUrl}-${currentPage}`}
                pdf={pdfLoadState.document}
                pageNumber={currentPage} 
                scale={pdfScale}
                renderTextLayer={true}
                renderAnnotationLayer={true}
                loading={
                  <div className="p-8 text-center text-gray-600">
                    <div className="text-4xl mb-2">📄</div>
                    <p>Loading page {currentPage}...</p>
                  </div>
                }
                error={
                  <div className="p-8 text-center text-red-600">
                    <div className="text-4xl mb-2">📄❌</div>
                    <p>Failed to load page {currentPage}</p>
                  </div>
                }
              />
            ) : (
              <div className="p-8 text-center text-gray-600">
                <div className="text-6xl mb-4">📄</div>
                <h3 className="text-lg font-semibold mb-2">No PDF Loaded</h3>
                <p className="text-sm">Please provide a valid PDF URL</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Voice Settings Panel */}
      {availableVoices.length > 0 && (
        <div className="p-3 bg-gray-50 border-t border-gray-200">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Voice:</label>
              <select
                className="text-sm border border-gray-300 rounded px-2 py-1"
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
            
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Speed: {speechRate}x</label>
              <input
                type="range"
                min={0.5}
                max={2.0}
                step={0.1}
                value={speechRate}
                onChange={(e) => onSpeechRateChange?.(Number(e.target.value))}
                className="w-20 accent-blue-400"
              />
            </div>

            {effectiveSelection && (
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-sm text-gray-600">
                  Selected: "{effectiveSelection.slice(0, 30)}{effectiveSelection.length > 30 ? '...' : ''}"
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Child-specific content */}
      {children}
    </div>
  );
}
