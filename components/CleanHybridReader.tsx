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
  type: "definition" | "summary" | "question" | "note" | "highlight" | "concept" | "idea";
  text: string;
  context: string;
  position: { x: number; y: number; page: number };
  timestamp: number;
  importance?: "high" | "medium" | "low";
  conceptType?: "main" | "supporting" | "example" | "detail";
}

// Reading pattern analysis
interface ReadingPattern {
  wordsPerMinute: number;
  focusAreas: Array<{ page: number; duration: number; selections: number }>;
  comprehensionScore: number;
  readingFlow: "linear" | "jumping" | "reviewing";
}

// David Butler-inspired concept highlighting for medical/educational content
interface ConceptHighlight {
  id: string;
  text: string;
  type: "main-idea" | "supporting-concept" | "example" | "definition" | "relationship" | "process" | "mechanism";
  color: string;
  importance: number; // 0-1 scale
  connections: string[]; // IDs of related concepts
  visualMetaphor?: string; // Butler-style metaphor
  spatialPosition?: { x: number; y: number }; // For spatial understanding
}

// Butler-style visual metaphor suggestions
interface ButlerMetaphor {
  concept: string;
  metaphor: string;
  explanation: string;
  visualCue: string;
}

function generateButlerMetaphors(text: string): ButlerMetaphor[] {
  const metaphors: ButlerMetaphor[] = [];
  
  // Medical/pain-related metaphors (Butler's specialty)
  const painPatterns = [
    { pattern: /pain|hurt|ache|discomfort/gi, metaphor: "alarm system", explanation: "Think of pain as your body's alarm system - it's trying to tell you something important", visualCue: "🚨" },
    { pattern: /nerve|neural|neuron/gi, metaphor: "electrical wiring", explanation: "Nerves are like electrical wires carrying messages throughout your body", visualCue: "⚡" },
    { pattern: /brain|cerebral|cortex/gi, metaphor: "command center", explanation: "The brain is like a sophisticated command center processing all information", visualCue: "🧠" },
    { pattern: /muscle|tissue|fiber/gi, metaphor: "elastic bands", explanation: "Muscles work like elastic bands - they stretch, contract, and need proper tension", visualCue: "🎯" },
    { pattern: /healing|recovery|repair/gi, metaphor: "construction crew", explanation: "Your body's healing process is like a skilled construction crew rebuilding and repairing", visualCue: "🔧" },
    { pattern: /inflammation|swelling/gi, metaphor: "emergency response", explanation: "Inflammation is like emergency responders rushing to help - sometimes helpful, sometimes overdone", visualCue: "🚑" },
    { pattern: /movement|motion|mobility/gi, metaphor: "dance choreography", explanation: "Good movement is like well-choreographed dance - smooth, coordinated, and purposeful", visualCue: "💃" },
    { pattern: /balance|stability|coordination/gi, metaphor: "tightrope walker", explanation: "Balance requires constant tiny adjustments, like a skilled tightrope walker", visualCue: "🤹" }
  ];
  
  // Educational metaphors for complex concepts
  const educationalPatterns = [
    { pattern: /system|process|mechanism/gi, metaphor: "factory assembly line", explanation: "Complex systems work like assembly lines - each part has a specific role", visualCue: "🏭" },
    { pattern: /connection|relationship|link/gi, metaphor: "bridge network", explanation: "Connections form networks like bridges linking different areas", visualCue: "🌉" },
    { pattern: /function|purpose|role/gi, metaphor: "job description", explanation: "Each part has a specific job description in the bigger picture", visualCue: "📋" },
    { pattern: /adaptation|change|evolution/gi, metaphor: "shape-shifting", explanation: "Adaptation is like intelligent shape-shifting to meet new challenges", visualCue: "🔄" }
  ];
  
  [...painPatterns, ...educationalPatterns].forEach(({ pattern, metaphor, explanation, visualCue }) => {
    const matches = text.match(pattern);
    if (matches && matches.length > 0) {
      metaphors.push({
        concept: matches[0],
        metaphor,
        explanation,
        visualCue
      });
    }
  });
  
  return metaphors.slice(0, 5); // Limit to prevent overwhelming
}

// Enhanced smart sidebar content generator with right-brain understanding
function generateSmartContent(selectedText: string, pageContext: string): {
  definitions: string[];
  summary: string;
  questions: string[];
  relatedConcepts: string[];
  mainIdeas: string[];
  visualMetaphors: string[];
  understandingLevel: "surface" | "deep" | "mastery";
} {
  const words = selectedText.toLowerCase().split(/\s+/);
  
  // Enhanced keyword extraction for definitions
  const technicalTerms = words.filter(word => 
    word.length > 6 && 
    /^[a-z]+$/.test(word) &&
    !['however', 'therefore', 'because', 'through', 'without', 'between', 'important', 'significant'].includes(word)
  );

  // Extract main ideas using right-brain patterns
  const ideaPatterns = [
    /\b(the key|main|primary|central|core|fundamental|essential)\s+(\w+(?:\s+\w+){0,3})\b/gi,
    /\b(concept|principle|theory|law|rule|method|approach|strategy)\s+of\s+(\w+(?:\s+\w+){0,2})/gi,
    /\b(\w+(?:\s+\w+){0,2})\s+(is|are|means|refers to|represents|symbolizes)/gi
  ];
  
  const mainIdeas: string[] = [];
  ideaPatterns.forEach(pattern => {
    const matches = selectedText.match(pattern);
    if (matches) {
      mainIdeas.push(...matches.slice(0, 2));
    }
  });

  // Generate visual metaphors for understanding
  const visualMetaphors = [
    `Think of this like a ${getRandomMetaphor()} where...`,
    `Imagine this concept as a ${getRandomMetaphor()} that...`,
    `This works similar to how a ${getRandomMetaphor()} functions...`
  ];

  // Enhanced summary with understanding focus
  const sentences = selectedText.split(/[.!?]+/);
  const summary = sentences.length > 1 
    ? `Key insight: ${sentences[0]?.trim()}. This means: ${sentences[1]?.trim().slice(0, 50)}...`
    : sentences[0]?.trim() + "...";

  // Right-brain focused comprehension questions
  const questions = [
    `What's the BIG PICTURE idea here?`,
    `How does this connect to what you already know?`,
    `If you had to explain this to a friend, what would you say?`,
    `What would happen if this concept didn't exist?`
  ];

  // Determine understanding level
  const understandingLevel = selectedText.length > 200 ? "deep" : 
                           selectedText.length > 50 ? "surface" : "mastery";

  return {
    definitions: technicalTerms.slice(0, 3),
    summary: summary || selectedText.slice(0, 100) + "...",
    questions: questions.slice(0, 2),
    relatedConcepts: technicalTerms.slice(0, 5),
    mainIdeas: mainIdeas.slice(0, 3),
    visualMetaphors: visualMetaphors.slice(0, 1),
    understandingLevel
  };
}

// Helper function for visual metaphors
function getRandomMetaphor(): string {
  const metaphors = [
    "tree with branches", "river flowing", "building with floors", 
    "puzzle piece", "bridge connecting", "key unlocking", "map showing paths",
    "garden growing", "machine with gears", "story unfolding"
  ];
  return metaphors[Math.floor(Math.random() * metaphors.length)];
}

// Right-brain concept extraction
function extractConcepts(text: string): ConceptHighlight[] {
  const concepts: ConceptHighlight[] = [];
  
  // Main ideas (highest importance)
  const mainIdeaPatterns = [
    /\b(the main|primary|key|central|core|fundamental)\s+(\w+(?:\s+\w+){0,4})/gi,
    /\b(principle|concept|theory|law|rule)\s+of\s+(\w+(?:\s+\w+){0,3})/gi
  ];
  
  mainIdeaPatterns.forEach(pattern => {
    const matches = [...text.matchAll(pattern)];
    matches.forEach((match, index) => {
      concepts.push({
        id: `main-${index}`,
        text: match[0],
        type: "main-idea",
        color: "#FFD700", // Gold for main ideas
        importance: 0.9,
        connections: []
      });
    });
  });

  // Supporting concepts
  const supportingPatterns = [
    /\b(because|since|due to|as a result|therefore|thus|hence)\s+(\w+(?:\s+\w+){0,5})/gi,
    /\b(for example|such as|including|like)\s+(\w+(?:\s+\w+){0,4})/gi
  ];
  
  supportingPatterns.forEach(pattern => {
    const matches = [...text.matchAll(pattern)];
    matches.forEach((match, index) => {
      concepts.push({
        id: `support-${index}`,
        text: match[0],
        type: "supporting-concept",
        color: "#87CEEB", // Sky blue for supporting
        importance: 0.6,
        connections: []
      });
    });
  });

  // Definitions
  const definitionPatterns = [
    /\b(\w+(?:\s+\w+){0,2})\s+(is|are|means|refers to|defined as)\s+(\w+(?:\s+\w+){0,6})/gi
  ];
  
  definitionPatterns.forEach(pattern => {
    const matches = [...text.matchAll(pattern)];
    matches.forEach((match, index) => {
      concepts.push({
        id: `def-${index}`,
        text: match[0],
        type: "definition",
        color: "#98FB98", // Light green for definitions
        importance: 0.7,
        connections: []
      });
    });
  });

  return concepts.slice(0, 10); // Limit to prevent overwhelming
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
  
  // Enhanced smart features with right-brain highlighting
  const [smartContent, setSmartContent] = useState<ReturnType<typeof generateSmartContent> | null>(null);
  const [pageTextIndex, setPageTextIndex] = useState<PageTextIndex | null>(null);
  const [focusStartTime, setFocusStartTime] = useState<number>(Date.now());
  const [conceptHighlights, setConceptHighlights] = useState<ConceptHighlight[]>([]);
  const [rightBrainMode, setRightBrainMode] = useState<boolean>(true);
  
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

  // Enhanced smart content generation with concept extraction
  useEffect(() => {
    if (selectionText && selectionText.length > 10) {
      const pageContext = pageTextIndex?.text.slice(0, 500) || "";
      const content = generateSmartContent(selectionText, pageContext);
      setSmartContent(content);
      
      // Extract concepts for right-brain highlighting
      if (rightBrainMode) {
        const concepts = extractConcepts(selectionText);
        setConceptHighlights(concepts);
      }
    } else {
      setSmartContent(null);
      setConceptHighlights([]);
    }
  }, [selectionText, pageTextIndex, rightBrainMode]);

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

  // Enhanced right-brain highlighting based on concept understanding
  useEffect(() => {
    if (highlightMode === "smart" && pageTextIndex && pdfContainerRef.current) {
      // Clear previous highlights
      const existingHighlights = pdfContainerRef.current.querySelectorAll('.concept-highlight');
      existingHighlights.forEach(el => {
        (el as HTMLElement).style.backgroundColor = '';
        el.classList.remove('concept-highlight');
      });

      if (rightBrainMode) {
        // Right-brain concept highlighting
        const concepts = extractConcepts(pageTextIndex.text);
        
        concepts.forEach(concept => {
          if (pdfContainerRef.current) {
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
            
            // Find and highlight concept text
            const conceptWords = concept.text.toLowerCase().split(/\s+/);
            textNodes.forEach(textNode => {
              const text = textNode.textContent?.toLowerCase() || '';
              const hasConceptWords = conceptWords.some(word => text.includes(word));
              
              if (hasConceptWords && textNode.parentElement) {
                const parent = textNode.parentElement;
                parent.style.backgroundColor = concept.color + '40'; // Add transparency
                parent.style.borderLeft = `3px solid ${concept.color}`;
                parent.style.paddingLeft = '2px';
                parent.classList.add('concept-highlight');
                parent.title = `${concept.type}: ${concept.text}`;
              }
            });
          }
        });
      } else {
        // Traditional smart highlighting
        const importantTerms = pageTextIndex.text
          .split(/\s+/)
          .filter(word => 
            word.length > 6 && 
            /^[A-Z]/.test(word) && 
            !['However', 'Therefore', 'Because', 'Through'].includes(word)
          )
          .slice(0, 5);

        importantTerms.forEach(term => {
          if (pdfContainerRef.current) {
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
                  parent.classList.add('concept-highlight');
                }
              }
            });
          }
        });
      }
    }
  }, [pageTextIndex, highlightMode, rightBrainMode]);

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
            <div className="flex items-center gap-2">
              <select
                value={highlightMode}
                onChange={(e) => setHighlightMode(e.target.value as any)}
                className="text-sm border border-gray-300 rounded px-2 py-1"
              >
                <option value="smart">Smart Highlights</option>
                <option value="manual">Manual Only</option>
                <option value="off">No Highlights</option>
              </select>
              
              {/* Right-Brain Mode Toggle */}
              <button
                onClick={() => setRightBrainMode(!rightBrainMode)}
                className={`px-2 py-1 rounded text-xs ${
                  rightBrainMode
                    ? "bg-purple-600 hover:bg-purple-500 text-white"
                    : "bg-gray-200 hover:bg-gray-300 text-gray-700"
                }`}
                title="Toggle right-brain concept highlighting"
              >
                🧠 Ideas
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

            {/* Enhanced Smart Content with Right-Brain Understanding */}
            {smartContent && (
              <div className="space-y-3">
                {/* Understanding Level Indicator */}
                <div className={`p-2 rounded-lg text-center text-xs font-medium ${
                  smartContent.understandingLevel === "mastery" ? "bg-green-100 text-green-800" :
                  smartContent.understandingLevel === "deep" ? "bg-blue-100 text-blue-800" :
                  "bg-orange-100 text-orange-800"
                }`}>
                  Understanding Level: {smartContent.understandingLevel.toUpperCase()}
                </div>

                {/* Main Ideas (Right-Brain Focus) */}
                {smartContent.mainIdeas.length > 0 && (
                  <div className="bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-lg p-3">
                    <h5 className="text-sm font-semibold text-purple-700 mb-2">💡 Main Ideas</h5>
                    <div className="space-y-2">
                      {smartContent.mainIdeas.map((idea, idx) => (
                        <div
                          key={idx}
                          className="px-3 py-2 bg-white border-l-4 border-purple-400 rounded text-sm text-gray-700 shadow-sm"
                        >
                          {idea}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Visual Metaphors */}
                {smartContent.visualMetaphors.length > 0 && (
                  <div className="bg-gradient-to-r from-yellow-50 to-orange-50 border border-orange-200 rounded-lg p-3">
                    <h5 className="text-sm font-semibold text-orange-700 mb-2">🎨 Think of it like...</h5>
                    {smartContent.visualMetaphors.map((metaphor, idx) => (
                      <p key={idx} className="text-sm text-gray-700 italic">
                        {metaphor}
                      </p>
                    ))}
                  </div>
                )}

                {/* Enhanced Summary */}
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <h5 className="text-sm font-semibold text-green-700 mb-2">📋 Understanding Summary</h5>
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
                          className="px-2 py-1 bg-yellow-200 text-yellow-800 rounded text-xs cursor-pointer hover:bg-yellow-300 transition-colors"
                          onClick={() => onWordClick(term)}
                        >
                          {term}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Right-Brain Questions */}
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                  <h5 className="text-sm font-semibold text-purple-700 mb-2">🤔 Deep Understanding</h5>
                  <ul className="space-y-2">
                    {smartContent.questions.map((question, idx) => (
                      <li key={idx} className="text-sm text-gray-700 flex items-start gap-2">
                        <span className="text-purple-500 font-bold">•</span>
                        <span>{question}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Concept Highlights Legend */}
                {rightBrainMode && conceptHighlights.length > 0 && (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <h5 className="text-sm font-semibold text-gray-700 mb-2">🎯 Concept Types</h5>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs">
                        <div className="w-3 h-3 rounded" style={{ backgroundColor: "#FFD700" }}></div>
                        <span>Main Ideas</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <div className="w-3 h-3 rounded" style={{ backgroundColor: "#87CEEB" }}></div>
                        <span>Supporting Concepts</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <div className="w-3 h-3 rounded" style={{ backgroundColor: "#98FB98" }}></div>
                        <span>Definitions</span>
                      </div>
                    </div>
                  </div>
                )}
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
