"use client";

import React, { useEffect, useState, useRef, useMemo } from "react";
import type { ThoughtUnit as BaseThoughtUnit, ReadingStats } from "@/types/reading";
import { Document, Page } from "react-pdf";
import { useReaderSync } from "@/lib/readerSync";

type PVUnit = BaseThoughtUnit | string | string[] | { text?: string };

interface CleanProgressiveViewProps {
  bookId: string;
  userId: string;
  thoughtUnits: PVUnit[];
  currentThoughtUnit: number;
  
  // PDF Integration (minimal - just for reference)
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

  // Voice settings
  selectedVoice?: SpeechSynthesisVoice;
  speechRate?: number;
}

function unitToText(u: PVUnit): string {
  if (u == null) return "";
  if (typeof u === "string") return u;
  if (Array.isArray(u)) return u.join(" ");
  const maybeText = (u as any).text;
  return typeof maybeText === "string" ? maybeText : JSON.stringify(u);
}

// Speed reading modes
type SpeedMode = "rsvp" | "bionic" | "guided" | "flash";

// RSVP (Rapid Serial Visual Presentation) - one word at a time
function RSVPDisplay({ 
  words, 
  currentIndex, 
  fontSize, 
  fontFamily 
}: { 
  words: string[], 
  currentIndex: number, 
  fontSize: number, 
  fontFamily: string 
}) {
  const currentWord = words[currentIndex] || "";
  
  // Calculate optimal reading position (ORP) - usually 1/3 into the word
  const orp = Math.floor(currentWord.length / 3);
  const beforeORP = currentWord.slice(0, orp);
  const atORP = currentWord[orp] || "";
  const afterORP = currentWord.slice(orp + 1);

  return (
    <div className="flex items-center justify-center h-full bg-black text-white">
      <div className="text-center">
        {/* Progress indicator */}
        <div className="mb-8">
          <div className="w-96 h-1 bg-gray-800 rounded-full mx-auto">
            <div 
              className="h-full bg-green-400 rounded-full transition-all duration-100"
              style={{ width: `${(currentIndex / Math.max(words.length - 1, 1)) * 100}%` }}
            />
          </div>
          <div className="text-xs text-gray-400 mt-2">
            {currentIndex + 1} / {words.length} words
          </div>
        </div>

        {/* RSVP Word Display */}
        <div 
          className="font-mono tracking-wider"
          style={{ 
            fontSize: `${fontSize * 2}px`, 
            fontFamily,
            minHeight: `${fontSize * 3}px`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <span className="text-gray-300">{beforeORP}</span>
          <span className="text-red-400 font-bold">{atORP}</span>
          <span className="text-gray-300">{afterORP}</span>
        </div>

        {/* Context preview */}
        <div className="mt-8 text-sm text-gray-500 max-w-md mx-auto">
          {words.slice(Math.max(0, currentIndex - 3), currentIndex).join(" ")} 
          <span className="text-white font-semibold"> {currentWord} </span>
          {words.slice(currentIndex + 1, currentIndex + 4).join(" ")}
        </div>
      </div>
    </div>
  );
}

// Bionic Reading - bold prefixes for faster recognition
function BionicDisplay({ 
  text, 
  fontSize, 
  fontFamily, 
  lineSpacing 
}: { 
  text: string, 
  fontSize: number, 
  fontFamily: string, 
  lineSpacing: number 
}) {
  const bionicText = useMemo(() => {
    return text.split(/\s+/).map(word => {
      if (word.length <= 2) return { bold: word, normal: "", full: word };
      const boldLength = Math.ceil(word.length / 2);
      const boldPart = word.slice(0, boldLength);
      const normalPart = word.slice(boldLength);
      return { bold: boldPart, normal: normalPart, full: word };
    });
  }, [text]);

  return (
    <div 
      className="p-8 leading-relaxed text-white bg-gray-900 h-full overflow-y-auto"
      style={{ 
        fontSize: `${fontSize}px`, 
        fontFamily,
        lineHeight: lineSpacing
      }}
    >
      {bionicText.map((word, index) => (
        <span key={index} className="mr-2">
          <span className="font-bold text-blue-300">{word.bold}</span>
          <span className="text-gray-300">{word.normal}</span>
        </span>
      ))}
    </div>
  );
}

// Guided Reading - highlight current line/sentence
function GuidedDisplay({ 
  text, 
  currentSentence, 
  fontSize, 
  fontFamily, 
  lineSpacing 
}: { 
  text: string, 
  currentSentence: number, 
  fontSize: number, 
  fontFamily: string, 
  lineSpacing: number 
}) {
  const sentences = useMemo(() => {
    return text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  }, [text]);

  return (
    <div 
      className="p-8 text-white bg-gray-900 h-full overflow-y-auto"
      style={{ 
        fontSize: `${fontSize}px`, 
        fontFamily,
        lineHeight: lineSpacing
      }}
    >
      {sentences.map((sentence, index) => (
        <div
          key={index}
          className={`mb-4 p-3 rounded transition-all duration-300 ${
            index === currentSentence
              ? "bg-blue-600/30 border-l-4 border-blue-400 text-white shadow-lg"
              : index < currentSentence
              ? "text-gray-500 opacity-60"
              : "text-gray-400"
          }`}
        >
          {sentence.trim()}.
        </div>
      ))}
    </div>
  );
}

// Flash Cards - key concepts one at a time
function FlashDisplay({ 
  concepts, 
  currentIndex, 
  fontSize, 
  fontFamily 
}: { 
  concepts: string[], 
  currentIndex: number, 
  fontSize: number, 
  fontFamily: string 
}) {
  const currentConcept = concepts[currentIndex] || "";

  return (
    <div className="flex items-center justify-center h-full bg-gradient-to-br from-purple-900 to-blue-900">
      <div className="max-w-2xl mx-auto text-center p-8">
        {/* Card */}
        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-8 border border-white/20 shadow-2xl">
          <div className="text-xs text-purple-300 mb-4">
            CONCEPT {currentIndex + 1} OF {concepts.length}
          </div>
          
          <div 
            className="text-white font-medium leading-relaxed"
            style={{ 
              fontSize: `${fontSize * 1.2}px`, 
              fontFamily
            }}
          >
            {currentConcept}
          </div>
          
          <div className="mt-6 flex justify-center">
            <div className="flex gap-2">
              {concepts.map((_, idx) => (
                <div
                  key={idx}
                  className={`w-2 h-2 rounded-full ${
                    idx === currentIndex ? "bg-purple-400" : "bg-gray-600"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CleanProgressiveView({
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
  selectedVoice,
  speechRate = 1.0,
}: CleanProgressiveViewProps) {
  const [speedMode, setSpeedMode] = useState<SpeedMode>("rsvp");
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0);
  const [currentConceptIndex, setCurrentConceptIndex] = useState(0);
  const [localPaused, setLocalPaused] = useState(false);
  const [showPdfReference, setShowPdfReference] = useState(false);
  const [eyeTrainingMode, setEyeTrainingMode] = useState(false);

  // Voice synthesis
  const [isSpeaking, setIsSpeaking] = useState(false);
  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Global sync integration with error handling
  const { 
    page, 
    unitIndex, 
    updateSync 
  } = useReaderSync();

  // Safe logging with error handling
  try {
    console.log("CleanProgressiveView - Global sync:", { page, unitIndex, currentPage, currentThoughtUnit });
  } catch (error) {
    console.warn("CleanProgressiveView - Sync logging error:", error);
  }

  // Empty states
  if (!thoughtUnits || thoughtUnits.length === 0) {
    return (
      <div className="p-4 flex items-center justify-center text-gray-400 italic h-full bg-black">
        ⚡ Please upload a PDF to start Speed Reading Mode.
      </div>
    );
  }

  const rawUnit = thoughtUnits[currentThoughtUnit - 1];
  if (!rawUnit) {
    return (
      <div className="p-4 flex items-center justify-center text-gray-400 italic h-full bg-black">
        ⏳ Preparing your speed reading experience...
      </div>
    );
  }

  const unitText = unitToText(rawUnit);

  // Process text for different modes
  const words = useMemo(() => {
    return unitText.split(/\s+/).filter(word => word.trim().length > 0);
  }, [unitText]);

  const sentences = useMemo(() => {
    return unitText.split(/[.!?]+/).filter(s => s.trim().length > 0);
  }, [unitText]);

  const concepts = useMemo(() => {
    // Extract key concepts (sentences with important keywords)
    const keywordPatterns = [
      /\b(is|are|means|refers to|defined as|concept of|represents|symbolizes)\b/i,
      /\b(important|key|main|primary|essential|crucial|significant)\b/i,
      /\b(because|therefore|thus|hence|consequently|as a result)\b/i,
      /\b(first|second|third|finally|in conclusion|moreover|furthermore)\b/i
    ];
    
    return sentences.filter(sentence => 
      keywordPatterns.some(pattern => pattern.test(sentence)) ||
      sentence.length > 50 // Longer sentences often contain key concepts
    ).slice(0, 10); // Limit to 10 key concepts
  }, [sentences]);

  // Unified progress calculation across all modes
  const getUnifiedProgress = () => {
    switch (speedMode) {
      case "rsvp":
        return currentWordIndex / Math.max(words.length - 1, 1);
      case "bionic":
        return 0; // Bionic is user-controlled, no auto progress
      case "guided":
        return currentSentenceIndex / Math.max(sentences.length - 1, 1);
      case "flash":
        return currentConceptIndex / Math.max(concepts.length - 1, 1);
      default:
        return 0;
    }
  };

  // Cross-mode position preservation
  const preservePositionAcrossModes = (newMode: SpeedMode, oldMode: SpeedMode) => {
    const currentProgress = getUnifiedProgress();
    console.log(`Preserving position: ${oldMode} -> ${newMode}, progress: ${currentProgress}`);
    
    switch (newMode) {
      case "rsvp":
        const newWordIndex = Math.floor(currentProgress * Math.max(words.length - 1, 1));
        setCurrentWordIndex(newWordIndex);
        break;
      case "bionic":
        // Bionic doesn't need position preservation
        break;
      case "guided":
        const newSentenceIndex = Math.floor(currentProgress * Math.max(sentences.length - 1, 1));
        setCurrentSentenceIndex(newSentenceIndex);
        break;
      case "flash":
        const newConceptIndex = Math.floor(currentProgress * Math.max(concepts.length - 1, 1));
        setCurrentConceptIndex(newConceptIndex);
        break;
    }
  };

  // Auto-advance logic for different modes
  useEffect(() => {
    if (!isReading || isPaused || localPaused) return;

    const baseInterval = 60000 / Math.max(100, readingSpeed); // Convert WPM to milliseconds

    let interval: number;

    switch (speedMode) {
      case "rsvp":
        // RSVP: advance word by word
        interval = window.setInterval(() => {
          setCurrentWordIndex(prev => {
            if (prev >= words.length - 1) return 0; // Loop back
            return prev + 1;
          });
        }, baseInterval);
        break;

      case "bionic":
        // Bionic: no auto-advance, user controls
        break;

      case "guided":
        // Guided: advance sentence by sentence (slower)
        interval = window.setInterval(() => {
          setCurrentSentenceIndex(prev => {
            if (prev >= sentences.length - 1) return 0;
            return prev + 1;
          });
        }, baseInterval * 8); // Much slower for sentences
        break;

      case "flash":
        // Flash: advance concept by concept (slowest)
        interval = window.setInterval(() => {
          setCurrentConceptIndex(prev => {
            if (prev >= concepts.length - 1) return 0;
            return prev + 1;
          });
        }, baseInterval * 15); // Very slow for concepts
        break;
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [speedMode, readingSpeed, isReading, isPaused, localPaused, words.length, sentences.length, concepts.length]);

  // Speech synthesis
  const speakText = (text: string) => {
    if (speechRef.current) {
      speechSynthesis.cancel();
    }

    const utterance = new SpeechSynthesisUtterance(text);
    if (selectedVoice) utterance.voice = selectedVoice;
    utterance.rate = speechRate;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    
    speechRef.current = utterance;
    speechSynthesis.speak(utterance);
  };

  // Keyboard controls
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

      switch (e.code) {
        case "Space":
          e.preventDefault();
          setLocalPaused(prev => !prev);
          break;
        case "ArrowRight":
        case "KeyJ":
          e.preventDefault();
          if (speedMode === "rsvp") {
            setCurrentWordIndex(prev => Math.min(prev + 1, words.length - 1));
          } else if (speedMode === "guided") {
            setCurrentSentenceIndex(prev => Math.min(prev + 1, sentences.length - 1));
          } else if (speedMode === "flash") {
            setCurrentConceptIndex(prev => Math.min(prev + 1, concepts.length - 1));
          }
          break;
        case "ArrowLeft":
        case "KeyK":
          e.preventDefault();
          if (speedMode === "rsvp") {
            setCurrentWordIndex(prev => Math.max(prev - 1, 0));
          } else if (speedMode === "guided") {
            setCurrentSentenceIndex(prev => Math.max(prev - 1, 0));
          } else if (speedMode === "flash") {
            setCurrentConceptIndex(prev => Math.max(prev - 1, 0));
          }
          break;
        case "KeyS":
          e.preventDefault();
          if (isSpeaking) {
            speechSynthesis.cancel();
            setIsSpeaking(false);
          } else {
            const textToSpeak = speedMode === "rsvp" ? words[currentWordIndex] :
                               speedMode === "guided" ? sentences[currentSentenceIndex] :
                               speedMode === "flash" ? concepts[currentConceptIndex] :
                               unitText.slice(0, 200);
            speakText(textToSpeak);
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [speedMode, currentWordIndex, currentSentenceIndex, currentConceptIndex, words, sentences, concepts, unitText, isSpeaking]);

  return (
    <div className="h-full flex flex-col bg-black text-white">
      {/* Speed Reading Controls */}
      <div className="flex items-center justify-between p-4 bg-gray-900 border-b border-gray-700">
        <div className="flex items-center gap-4">
          <h3 className="text-lg font-semibold text-green-400">⚡ Speed Reading</h3>
          
          {/* Mode Selection */}
          <div className="flex gap-2">
            {[
              { mode: "rsvp", icon: "👁️", label: "RSVP" },
              { mode: "bionic", icon: "🔤", label: "Bionic" },
              { mode: "guided", icon: "📍", label: "Guided" },
              { mode: "flash", icon: "⚡", label: "Flash" },
            ].map(({ mode, icon, label }) => (
              <button
                key={mode}
                onClick={() => {
                  const newMode = mode as SpeedMode;
                  if (newMode !== speedMode) {
                    // Preserve position across modes before switching
                    preservePositionAcrossModes(newMode, speedMode);
                    setSpeedMode(newMode);
                  }
                }}
                className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                  speedMode === mode
                    ? "bg-green-600 text-white"
                    : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                }`}
              >
                {icon} {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Speed Control */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400">Speed:</label>
            <input
              type="range"
              min={100}
              max={1000}
              step={50}
              value={readingSpeed}
              onChange={(e) => setReadingSpeed?.(Number(e.target.value))}
              className="w-24 accent-green-400"
            />
            <span className="text-xs text-gray-400 w-16">{readingSpeed} WPM</span>
          </div>

          {/* Controls */}
          <button
            onClick={() => setLocalPaused(!localPaused)}
            className={`px-3 py-1 rounded text-sm ${
              localPaused || isPaused
                ? "bg-green-600 hover:bg-green-500"
                : "bg-red-600 hover:bg-red-500"
            }`}
          >
            {localPaused || isPaused ? "▶️ Play" : "⏸️ Pause"}
          </button>

          <button
            onClick={() => {
              const textToSpeak = speedMode === "rsvp" ? words.slice(currentWordIndex, currentWordIndex + 10).join(" ") :
                                 speedMode === "guided" ? sentences[currentSentenceIndex] :
                                 speedMode === "flash" ? concepts[currentConceptIndex] :
                                 unitText.slice(0, 200);
              if (isSpeaking) {
                speechSynthesis.cancel();
                setIsSpeaking(false);
              } else {
                speakText(textToSpeak);
              }
            }}
            className={`px-3 py-1 rounded text-sm ${
              isSpeaking
                ? "bg-red-600 hover:bg-red-500"
                : "bg-blue-600 hover:bg-blue-500"
            }`}
          >
            {isSpeaking ? "🔇 Stop" : "🔊 Speak"}
          </button>

          {/* PDF Reference Toggle */}
          {pdfUrl && (
            <button
              onClick={() => setShowPdfReference(!showPdfReference)}
              className={`px-3 py-1 rounded text-sm ${
                showPdfReference
                  ? "bg-yellow-600 hover:bg-yellow-500"
                  : "bg-gray-700 hover:bg-gray-600"
              }`}
            >
              📄 PDF
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex">
        {/* Speed Reading Display */}
        <div className={`${showPdfReference ? "w-2/3" : "w-full"} relative`}>
          {speedMode === "rsvp" && (
            <RSVPDisplay
              words={words}
              currentIndex={currentWordIndex}
              fontSize={fontSize}
              fontFamily={fontFamily}
            />
          )}
          
          {speedMode === "bionic" && (
            <BionicDisplay
              text={unitText}
              fontSize={fontSize}
              fontFamily={fontFamily}
              lineSpacing={lineSpacing}
            />
          )}
          
          {speedMode === "guided" && (
            <GuidedDisplay
              text={unitText}
              currentSentence={currentSentenceIndex}
              fontSize={fontSize}
              fontFamily={fontFamily}
              lineSpacing={lineSpacing}
            />
          )}
          
          {speedMode === "flash" && (
            <FlashDisplay
              concepts={concepts}
              currentIndex={currentConceptIndex}
              fontSize={fontSize}
              fontFamily={fontFamily}
            />
          )}

          {/* Eye Training Overlay */}
          {eyeTrainingMode && (
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-1/2 left-1/2 w-2 h-2 bg-red-500 rounded-full transform -translate-x-1/2 -translate-y-1/2 animate-pulse" />
              <div className="absolute top-1/4 left-1/4 w-1 h-1 bg-blue-400 rounded-full animate-ping" />
              <div className="absolute top-3/4 right-1/4 w-1 h-1 bg-blue-400 rounded-full animate-ping" style={{ animationDelay: "0.5s" }} />
            </div>
          )}
        </div>

        {/* PDF Reference Panel */}
        {showPdfReference && pdfUrl && (
          <div className="w-1/3 bg-gray-800 border-l border-gray-700">
            <div className="flex items-center justify-between p-3 bg-gray-700 border-b border-gray-600">
              <h4 className="text-sm font-semibold text-yellow-400">📄 Reference</h4>
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
              </div>
            </div>
            <div className="h-full overflow-auto">
              <Document file={pdfUrl}>
                <Page 
                  pageNumber={currentPage} 
                  scale={0.6}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                />
              </Document>
            </div>
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div className="p-2 bg-gray-900 border-t border-gray-700 text-xs text-gray-400">
        <div className="flex justify-between items-center">
          <div className="flex gap-4">
            <span>Mode: {speedMode.toUpperCase()}</span>
            <span>Speed: {readingSpeed} WPM</span>
            {speedMode === "rsvp" && <span>Word: {currentWordIndex + 1}/{words.length}</span>}
            {speedMode === "guided" && <span>Sentence: {currentSentenceIndex + 1}/{sentences.length}</span>}
            {speedMode === "flash" && <span>Concept: {currentConceptIndex + 1}/{concepts.length}</span>}
          </div>
          <div className="flex gap-4">
            <span>Unit: {currentThoughtUnit}</span>
            {pdfUrl && <span>Page: {currentPage}</span>}
            <span>Status: {localPaused || isPaused ? "Paused" : "Reading"}</span>
          </div>
        </div>
      </div>

      {/* Keyboard Shortcuts Help */}
      <div className="absolute bottom-4 right-4 bg-black/80 p-2 rounded text-xs text-gray-400">
        <div className="font-medium mb-1">Shortcuts:</div>
        <div>Space: Pause/Play</div>
        <div>← →: Navigate</div>
        <div>S: Speak</div>
      </div>
    </div>
  );
}
