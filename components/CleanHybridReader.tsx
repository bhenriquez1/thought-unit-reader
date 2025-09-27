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
import { 
  createThoughtUnits, 
  extractMainIdea, 
  analyzeTextForThoughtUnitsEnhanced,
  type ThoughtUnit, 
  type ThoughtUnitBoundary 
} from "@/lib/thoughtUnitExtraction";
import { 
  enhancedHybridAnalysisEngine,
  type ComprehensiveAnalysisResult 
} from "@/lib/enhancedHybridAnalysis";
import { 
  ConceptAnchoredHighlighter,
  createConceptAnchoredHighlighter,
  type ConceptHighlightConfig,
  type ConceptAnchor
} from "@/lib/conceptAnchoredHighlighting";
import { 
  analyzeChunkWithRightBrain,
  type RightBrainChunkAnalysis,
  type TextPattern,
  type VisualMetaphor
} from "@/lib/rightBrainReading";
import { chunkText, stableChunkId } from "@/lib/chunkers";
import { useReaderSync } from "@/lib/readerSync";
import ChunkRail from "@/components/ChunkRail";
import { aiLearningEngine, type UserFeedback } from "@/lib/aiLearningEngine";
import TUInteractionModal from "@/components/TUInteractionModal";
// Butler System Imports
import { 
  butlerSpeechEngine, 
  type ButlerHighlight, 
  type SpeechMode, 
  createButlerHighlight,
  type ButlerSpeechOptions,
  DEFAULT_BUTLER_SPEECH
} from "@/lib/butlerSpeechEngine";
import { 
  butlerThoughtUnitAnalyzer, 
  analyzeTextWithButler,
  getReadableContent,
  type ButlerAnalysisResult 
} from "@/lib/butlerThoughtUnits";

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
  type: "main-idea" | "supporting-concept" | "definition" | "process" | "relationship";
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
  
  // Enhanced DAT-focused medical/dental metaphors (Butler's specialty)
  const dentalMedicalPatterns = [
    // Dental-specific for DAT
    { pattern: /tooth|teeth|dental|enamel|dentin|pulp/gi, metaphor: "fortress with layers", explanation: "Think of a tooth like a medieval fortress - enamel is the outer wall, dentin is the inner structure, and pulp is the protected core with all the vital supplies", visualCue: "🏰" },
    { pattern: /cavity|caries|decay/gi, metaphor: "enemy siege", explanation: "Tooth decay is like an enemy army slowly breaking down the fortress walls - bacteria are the invaders weakening your defenses", visualCue: "⚔️" },
    { pattern: /gum|gingiva|periodontal/gi, metaphor: "foundation and moat", explanation: "Gums are like the foundation and protective moat around your tooth fortress - they need to stay strong to protect the whole structure", visualCue: "🌊" },
    { pattern: /root|root canal/gi, metaphor: "underground supply lines", explanation: "Tooth roots are like underground supply lines bringing nutrients and removing waste - when they're damaged, the whole system suffers", visualCue: "🚇" },
    { pattern: /bite|occlusion|jaw/gi, metaphor: "precision machinery", explanation: "Your bite is like precision machinery where every gear (tooth) must align perfectly for smooth operation", visualCue: "⚙️" },
    
    // Medical/anatomical for DAT
    { pattern: /pain|hurt|ache|discomfort/gi, metaphor: "alarm system", explanation: "Think of pain as your body's sophisticated alarm system - it's trying to tell you something important about what needs attention", visualCue: "🚨" },
    { pattern: /nerve|neural|neuron/gi, metaphor: "electrical highway", explanation: "Nerves are like a complex electrical highway system carrying messages at lightning speed throughout your body", visualCue: "⚡" },
    { pattern: /brain|cerebral|cortex/gi, metaphor: "mission control center", explanation: "The brain is like NASA's mission control - monitoring everything, making split-second decisions, and coordinating complex operations", visualCue: "🧠" },
    { pattern: /muscle|tissue|fiber/gi, metaphor: "elastic rope system", explanation: "Muscles work like an intelligent elastic rope system - they can stretch, contract, and adjust tension based on what you need", visualCue: "🎯" },
    { pattern: /bone|skeleton|calcium/gi, metaphor: "living scaffolding", explanation: "Bones are like living scaffolding that's constantly rebuilding itself - strong yet adaptable, supporting everything above", visualCue: "🏗️" },
    { pattern: /blood|circulation|heart/gi, metaphor: "delivery network", explanation: "Your circulatory system is like the world's most efficient delivery network - bringing supplies and removing waste 24/7", visualCue: "🚚" },
    { pattern: /healing|recovery|repair/gi, metaphor: "master craftsmen", explanation: "Your body's healing process is like master craftsmen who know exactly how to rebuild and restore damaged areas", visualCue: "🔧" },
    { pattern: /inflammation|swelling/gi, metaphor: "emergency response team", explanation: "Inflammation is like an emergency response team rushing to help - sometimes they're heroes, sometimes they overreact", visualCue: "🚑" },
    
    // Physiological processes for DAT
    { pattern: /enzyme|catalyst|reaction/gi, metaphor: "molecular matchmakers", explanation: "Enzymes are like molecular matchmakers - they bring the right chemicals together at exactly the right time to make reactions happen", visualCue: "💕" },
    { pattern: /hormone|endocrine|signal/gi, metaphor: "chemical messengers", explanation: "Hormones are like chemical messengers carrying important news throughout your body's communication network", visualCue: "📨" },
    { pattern: /membrane|barrier|transport/gi, metaphor: "smart security gate", explanation: "Cell membranes are like smart security gates - they know exactly what to let in, what to keep out, and when to open", visualCue: "🚪" },
    { pattern: /metabolism|energy|ATP/gi, metaphor: "cellular power plant", explanation: "Metabolism is like having millions of tiny power plants in your cells, converting fuel into usable energy", visualCue: "⚡" },
    
    // Organic chemistry for DAT
    { pattern: /molecule|compound|structure/gi, metaphor: "molecular architecture", explanation: "Molecules are like tiny architectural structures - the shape determines the function, just like buildings", visualCue: "🏛️" },
    { pattern: /bond|electron|orbital/gi, metaphor: "atomic handshakes", explanation: "Chemical bonds are like atomic handshakes - atoms sharing or trading electrons to stay stable and happy", visualCue: "🤝" },
    { pattern: /reaction|synthesis|breakdown/gi, metaphor: "molecular dance", explanation: "Chemical reactions are like choreographed molecular dances - partners change, but the dance follows predictable patterns", visualCue: "💃" }
  ];
  
  // Educational metaphors for complex concepts
  const educationalPatterns = [
    { pattern: /system|process|mechanism/gi, metaphor: "orchestrated symphony", explanation: "Complex biological systems work like a symphony orchestra - each part plays its role in perfect harmony to create something beautiful", visualCue: "🎼" },
    { pattern: /connection|relationship|link/gi, metaphor: "living web", explanation: "Biological connections form a living web where everything influences everything else - pull one strand and the whole web responds", visualCue: "🕸️" },
    { pattern: /function|purpose|role/gi, metaphor: "specialized job", explanation: "Every biological structure has a specialized job - like workers in a city, each one essential for the whole community to thrive", visualCue: "👷" },
    { pattern: /adaptation|change|evolution/gi, metaphor: "intelligent problem-solving", explanation: "Biological adaptation is like intelligent problem-solving - finding creative solutions to environmental challenges over time", visualCue: "🧩" },
    { pattern: /balance|homeostasis|equilibrium/gi, metaphor: "master juggler", explanation: "Your body maintaining balance is like a master juggler keeping multiple balls in the air - constant tiny adjustments to maintain stability", visualCue: "🤹" }
  ];
  
  [...dentalMedicalPatterns, ...educationalPatterns].forEach(({ pattern, metaphor, explanation, visualCue }) => {
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
  
  return metaphors.slice(0, 6); // Enhanced DAT-focused metaphors for better understanding
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

// Enhanced right-brain concept extraction with intelligent chunking
function extractConcepts(text: string): ConceptHighlight[] {
  const concepts: ConceptHighlight[] = [];
  
  // Enhanced main ideas patterns (highest importance)
  const mainIdeaPatterns = [
    /\b(the main|primary|key|central|core|fundamental|essential|most important)\s+(\w+(?:\s+\w+){0,4})/gi,
    /\b(principle|concept|theory|law|rule|mechanism|process)\s+(?:of|that|which)\s+(\w+(?:\s+\w+){0,3})/gi,
    /\b(understanding|comprehension|knowledge)\s+(?:of|about)\s+(\w+(?:\s+\w+){0,3})/gi,
    // Sentence-level main ideas
    /^([^.!?]*(?:important|significant|crucial|vital|essential|key)[^.!?]*[.!?])/gmi,
    /^([^.!?]*(?:remember|note that|keep in mind)[^.!?]*[.!?])/gmi
  ];
  
  mainIdeaPatterns.forEach((pattern, patternIndex) => {
    const matches = [...text.matchAll(pattern)];
    matches.forEach((match, index) => {
      const conceptText = match[0].trim();
      if (conceptText.length > 10) { // Filter out very short matches
        concepts.push({
          id: `main-${patternIndex}-${index}`,
          text: conceptText,
          type: "main-idea",
          color: "#FFD700", // Gold for main ideas
          importance: 0.9,
          connections: []
        });
      }
    });
  });

  // Enhanced supporting concepts with chunking
  const supportingPatterns = [
    /\b(because|since|due to|as a result|therefore|thus|hence|consequently)\s+([^.!?]+[.!?])/gi,
    /\b(for example|such as|including|like|specifically|namely)\s+([^.!?]+[.!?])/gi,
    /\b(this means|in other words|that is|i\.e\.|e\.g\.)\s+([^.!?]+[.!?])/gi,
    // Cause and effect chunking
    /([^.!?]*(?:causes?|leads? to|results? in|triggers?|produces?)[^.!?]*[.!?])/gi,
    // Process steps chunking
    /([^.!?]*(?:first|second|third|next|then|finally|lastly)[^.!?]*[.!?])/gi
  ];
  
  supportingPatterns.forEach((pattern, patternIndex) => {
    const matches = [...text.matchAll(pattern)];
    matches.forEach((match, index) => {
      const conceptText = match[0].trim();
      if (conceptText.length > 15) {
        concepts.push({
          id: `support-${patternIndex}-${index}`,
          text: conceptText,
          type: "supporting-concept",
          color: "#87CEEB", // Sky blue for supporting
          importance: 0.6,
          connections: []
        });
      }
    });
  });

  // Enhanced definitions with better chunking
  const definitionPatterns = [
    /\b(\w+(?:\s+\w+){0,2})\s+(is|are|means|refers to|defined as|represents)\s+([^.!?]+[.!?])/gi,
    // Full sentence definitions
    /([^.!?]*(?:definition|define|term|concept)\s+(?:of|for)\s+\w+[^.!?]*[.!?])/gi,
    // Medical/scientific definitions
    /([^.!?]*(?:condition|disease|syndrome|disorder|symptom)\s+(?:is|are|means)[^.!?]*[.!?])/gi
  ];
  
  definitionPatterns.forEach((pattern, patternIndex) => {
    const matches = [...text.matchAll(pattern)];
    matches.forEach((match, index) => {
      const conceptText = match[0].trim();
      if (conceptText.length > 10) {
        concepts.push({
          id: `def-${patternIndex}-${index}`,
          text: conceptText,
          type: "definition",
          color: "#98FB98", // Light green for definitions
          importance: 0.7,
          connections: []
        });
      }
    });
  });

  // New: Process and mechanism chunking (great for DAT content)
  const processPatterns = [
    /([^.!?]*(?:process|mechanism|pathway|system|method|procedure)[^.!?]*[.!?])/gi,
    /([^.!?]*(?:occurs?|happens?|takes? place|develops?)[^.!?]*[.!?])/gi,
    /([^.!?]*(?:function|role|purpose|job)[^.!?]*[.!?])/gi
  ];
  
  processPatterns.forEach((pattern, patternIndex) => {
    const matches = [...text.matchAll(pattern)];
    matches.forEach((match, index) => {
      const conceptText = match[0].trim();
      if (conceptText.length > 20) {
        concepts.push({
          id: `process-${patternIndex}-${index}`,
          text: conceptText,
          type: "process",
          color: "#DDA0DD", // Plum for processes
          importance: 0.8,
          connections: []
        });
      }
    });
  });

  // New: Relationship chunking
  const relationshipPatterns = [
    /([^.!?]*(?:relationship|connection|link|association|correlation)[^.!?]*[.!?])/gi,
    /([^.!?]*(?:affects?|influences?|impacts?|interacts? with)[^.!?]*[.!?])/gi,
    /([^.!?]*(?:similar to|different from|compared to|unlike)[^.!?]*[.!?])/gi
  ];
  
  relationshipPatterns.forEach((pattern, patternIndex) => {
    const matches = [...text.matchAll(pattern)];
    matches.forEach((match, index) => {
      const conceptText = match[0].trim();
      if (conceptText.length > 15) {
        concepts.push({
          id: `rel-${patternIndex}-${index}`,
          text: conceptText,
          type: "relationship",
          color: "#F0E68C", // Khaki for relationships
          importance: 0.65,
          connections: []
        });
      }
    });
  });

  // Sort by importance and limit to prevent overwhelming
  return concepts
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 15); // Increased limit for better coverage
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
  
  // Enhanced Hybrid Analysis Integration
  const [comprehensiveAnalysis, setComprehensiveAnalysis] = useState<ComprehensiveAnalysisResult | null>(null);
  const [enhancedMode, setEnhancedMode] = useState<boolean>(true);
  
  // Enhanced Concept-Anchored Highlighting Features
  const [thoughtUnitEnabled, setThoughtUnitEnabled] = useState<boolean>(true); // Enable by default for Butler mode
  const [conceptHighlighter, setConceptHighlighter] = useState<ConceptAnchoredHighlighter | null>(null);
  const [highlightConfig, setHighlightConfig] = useState<ConceptHighlightConfig>({
    showMainIdeas: true,
    showSupportingDetails: true,
    showTransitions: true,
    mainIdeaConfidenceThreshold: 0.85,
    highlightSensitivity: 'moderate',
    maxMainIdeasPerPage: 2,
    conceptPersistence: true // This ensures highlights stick/persist
  });
  const [currentMainIdea, setCurrentMainIdea] = useState<string>("");
  const [mainIdeaConfidence, setMainIdeaConfidence] = useState<number>(0);
  const [activeConceptAnchors, setActiveConceptAnchors] = useState<ConceptAnchor[]>([]);
  
  // Butler System State
  const [butlerAnalysis, setButlerAnalysis] = useState<ButlerAnalysisResult | null>(null);
  const [butlerHighlights, setButlerHighlights] = useState<ButlerHighlight[]>([]);
  const [speechMode, setSpeechMode] = useState<SpeechMode>('smart');
  const [butlerSpeechOptions, setButlerSpeechOptions] = useState<ButlerSpeechOptions>(DEFAULT_BUTLER_SPEECH);
  
  // Voice and speech
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);
  
  // Enhanced Progressive Features
  const [showProgressiveOverlay, setShowProgressiveOverlay] = useState(true);
  const [chunkChars, setChunkChars] = useState(240);
  const [chunkMode, setChunkMode] = useState<"semantic" | "sentence" | "bullet-first">("semantic");
  const [phase, setPhase] = useState<"gist" | "pattern" | "detail" | "movie">("gist");
  const [activeIdx, setActiveIdx] = useState(0);
  const [autoSpeak, setAutoSpeak] = useState(false);
  
  // Right-Brain Analysis
  const [rightBrainAnalysis, setRightBrainAnalysis] = useState<RightBrainChunkAnalysis | null>(null);
  
  // TU Interaction Modal State
  const [tuModalState, setTuModalState] = useState<{
    isOpen: boolean;
    text: string;
    conceptType: "main-idea" | "supporting-concept" | "definition" | "process" | "relationship";
    position: { x: number; y: number };
    confidence: number;
  }>({
    isOpen: false,
    text: "",
    conceptType: "main-idea",
    position: { x: 0, y: 0 },
    confidence: 0
  });
  
  // Global sync integration
  const { 
    page: globalPage,
    unitIndex: globalUnitIndex,
    activeChunkId: globalActiveChunkId,
    updateSync, 
    cacheChunkAnchor, 
    syncChunkToPDF, 
    syncPDFToChunk
  } = useReaderSync();
  
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

  // Enhanced smart content generation with comprehensive analysis
  useEffect(() => {
    if (selectionText && selectionText.length > 10) {
      const pageContext = pageTextIndex?.text.slice(0, 500) || "";
      const content = generateSmartContent(selectionText, pageContext);
      setSmartContent(content);
      
      // Enhanced analysis integration
      if (enhancedMode) {
        const performEnhancedAnalysis = async () => {
          try {
            const analysis = await enhancedHybridAnalysisEngine.analyzeText(selectionText);
            setComprehensiveAnalysis(analysis);
            
            // Use enhanced concept extraction
            const enhancedThoughtUnits = await analyzeTextForThoughtUnitsEnhanced(selectionText);
            if (enhancedThoughtUnits.thoughtUnits.length > 0) {
              const enhancedConcepts = enhancedThoughtUnits.thoughtUnits
                .filter(unit => unit.isMainIdea || unit.confidence > 0.7)
                .map(unit => ({
                  id: `enhanced-${unit.id}`,
                  text: unit.text,
                  type: "main-idea" as const,
                  color: "#FFD700",
                  importance: unit.confidence,
                  connections: []
                }));
              setConceptHighlights(enhancedConcepts);
            }
          } catch (error) {
            console.error('Enhanced analysis error:', error);
            // Fallback to original concept extraction
            if (rightBrainMode) {
              const concepts = extractConcepts(selectionText);
              setConceptHighlights(concepts);
            }
          }
        };
        
        performEnhancedAnalysis();
      } else {
        // Original concept extraction for right-brain highlighting
        if (rightBrainMode) {
          const concepts = extractConcepts(selectionText);
          setConceptHighlights(concepts);
        }
      }
    } else {
      setSmartContent(null);
      setConceptHighlights([]);
      setComprehensiveAnalysis(null);
    }
  }, [selectionText, pageTextIndex, rightBrainMode, enhancedMode]);

  // Butler Analysis Effects
  useEffect(() => {
    if (pageTextIndex?.text && pageTextIndex.text.length > 50) {
      console.log('🎯 Butler: Analyzing page text...');
      
      const performButlerAnalysis = async () => {
        try {
          const analysis = await analyzeTextWithButler(pageTextIndex.text);
          setButlerAnalysis(analysis);
          setButlerHighlights(analysis.highlights);
          
          console.log(`🎯 Butler analysis complete: ${analysis.highlights.length} highlights, comprehension: ${Math.round(analysis.comprehensionScore * 100)}%`);
        } catch (error) {
          console.error('Butler analysis error:', error);
        }
      };
      
      performButlerAnalysis();
    }
  }, [pageTextIndex]);

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
    if (highlightMode === "smart" && pageTextIndex && pdfContainerRef.current && pageTextIndex.text.trim().length > 0) {
      // Clear previous highlights and their event listeners
      const existingHighlights = pdfContainerRef.current.querySelectorAll('.concept-highlight');
      existingHighlights.forEach(el => {
        const htmlEl = el as HTMLElement;
        htmlEl.style.backgroundColor = '';
        htmlEl.style.borderLeft = '';
        htmlEl.style.paddingLeft = '';
        htmlEl.style.cursor = '';
        htmlEl.classList.remove('concept-highlight');
        
        // Remove click event listener by cloning the element (removes all listeners)
        const conceptId = htmlEl.getAttribute('data-concept-id');
        if (conceptId) {
          const newElement = htmlEl.cloneNode(true) as HTMLElement;
          htmlEl.parentNode?.replaceChild(newElement, htmlEl);
        }
      });

      if (rightBrainMode) {
        // Right-brain concept highlighting - only if we have substantial text
        if (pageTextIndex.text.length > 50) {
          const concepts = extractConcepts(pageTextIndex.text);
          
          concepts.forEach(concept => {
            if (pdfContainerRef.current && concept.text.length > 10) {
              const walker = document.createTreeWalker(
                pdfContainerRef.current,
                NodeFilter.SHOW_TEXT,
                null
              );
              
              const textNodes: Text[] = [];
              let node;
              while (node = walker.nextNode()) {
                const textContent = node.textContent;
                if (textContent && textContent.trim().length > 0) {
                  textNodes.push(node as Text);
                }
              }
              
              // Find and highlight concept text with better matching
              const conceptWords = concept.text.toLowerCase().split(/\s+/).filter(word => word.length > 3);
              let highlightApplied = false;
              
              textNodes.forEach(textNode => {
                const text = textNode.textContent?.toLowerCase() || '';
                if (text.length > 5) { // Only consider substantial text nodes
                  const matchingWords = conceptWords.filter(word => text.includes(word));
                  const matchRatio = matchingWords.length / conceptWords.length;
                  
                  // Only highlight if we have a good match ratio and the parent element has visible content
                  if (matchRatio >= 0.5 && textNode.parentElement && !highlightApplied) {
                    const parent = textNode.parentElement;
                    const parentText = parent.textContent?.trim();
                    
                    if (parentText && parentText.length > 5) {
                      parent.style.backgroundColor = concept.color + '40'; // Add transparency
                      parent.style.borderLeft = `3px solid ${concept.color}`;
                      parent.style.paddingLeft = '2px';
                      parent.style.cursor = 'pointer';
                      parent.classList.add('concept-highlight');
                      parent.title = `Click to explore: ${concept.type} - ${concept.text.slice(0, 100)}`;
                      
                      // Make it interactive - add click handler
                      const clickHandler = (e: Event) => {
                        e.stopPropagation();
                        const rect = parent.getBoundingClientRect();
                        const containerRect = pdfContainerRef.current?.getBoundingClientRect();
                        
                        if (containerRect) {
                          setTuModalState({
                            isOpen: true,
                            text: concept.text,
                            conceptType: concept.type,
                            position: {
                              x: rect.left - containerRect.left + 20,
                              y: rect.top - containerRect.top + 20
                            },
                            confidence: concept.importance
                          });
                        }
                      };
                      
                      parent.addEventListener('click', clickHandler);
                      parent.setAttribute('data-concept-id', concept.id);
                      
                      highlightApplied = true; // Prevent multiple highlights for the same concept
                    }
                  }
                }
              });
            }
          });
        }
      } else {
        // Traditional smart highlighting - only if we have substantial text
        if (pageTextIndex.text.length > 50) {
          const importantTerms = pageTextIndex.text
            .split(/\s+/)
            .filter(word => 
              word.length > 6 && 
              /^[A-Z]/.test(word) && 
              !['However', 'Therefore', 'Because', 'Through'].includes(word)
            )
            .slice(0, 5);

          importantTerms.forEach(term => {
            if (pdfContainerRef.current && term.length > 3) {
              const walker = document.createTreeWalker(
                pdfContainerRef.current,
                NodeFilter.SHOW_TEXT,
                null
              );
              
              const textNodes: Text[] = [];
              let node;
              while (node = walker.nextNode()) {
                const textContent = node.textContent;
                if (textContent && textContent.trim().length > 0) {
                  textNodes.push(node as Text);
                }
              }
              
              textNodes.forEach(textNode => {
                const text = textNode.textContent || '';
                if (text.length > 5 && text.toLowerCase().includes(term.toLowerCase())) {
                  const parent = textNode.parentElement;
                  if (parent && parent.textContent?.trim() && parent.textContent.trim().length > 5) {
                    parent.style.backgroundColor = "rgba(255, 235, 59, 0.2)";
                    parent.classList.add('concept-highlight');
                  }
                }
              });
            }
          });
        }
      }
    }
  }, [pageTextIndex, highlightMode, rightBrainMode]);

  // Initialize concept-anchored highlighter when enabled
  useEffect(() => {
    if (thoughtUnitEnabled && pdfContainerRef.current && !conceptHighlighter) {
      const highlighter = createConceptAnchoredHighlighter(pdfContainerRef.current, highlightConfig);
      setConceptHighlighter(highlighter);
      
      // Add event listeners for concept interactions
      const handleConceptClick = (event: CustomEvent) => {
        const anchor = event.detail.anchor as ConceptAnchor;
        console.log('🧠 Concept clicked:', anchor.type, anchor.conceptFingerprint);
        
        // Update selection and trigger actions
        setSelectionText(anchor.persistentData.originalText);
        onTextSelect?.(anchor.persistentData.originalText);
        onWordClick(anchor.persistentData.originalText);
      };
      
      pdfContainerRef.current.addEventListener('conceptClick', handleConceptClick as EventListener);
      
      return () => {
        if (pdfContainerRef.current) {
          pdfContainerRef.current.removeEventListener('conceptClick', handleConceptClick as EventListener);
        }
        highlighter.destroy();
      };
    } else if (!thoughtUnitEnabled && conceptHighlighter) {
      conceptHighlighter.destroy();
      setConceptHighlighter(null);
    }
  }, [thoughtUnitEnabled, highlightConfig]);

  // Process concept highlighting when page changes or highlighter is available
  useEffect(() => {
    if (conceptHighlighter && pageTextIndex && thoughtUnitEnabled) {
      const processConceptHighlighting = async () => {
        try {
          await conceptHighlighter.highlightConcepts(pageTextIndex.text, currentPage);
          
          // Extract main idea for current page
          const mainIdea = extractMainIdea(pageTextIndex.text);
          setCurrentMainIdea(mainIdea.primaryIdea || "");
          setMainIdeaConfidence(mainIdea.confidence || 0);
          
          // Update active concept anchors
          const anchors = conceptHighlighter.getActiveConceptAnchors();
          setActiveConceptAnchors(anchors);
          
        } catch (error) {
          console.error('Error processing concept highlighting:', error);
        }
      };
      
      processConceptHighlighting();
    }
  }, [conceptHighlighter, pageTextIndex, currentPage, thoughtUnitEnabled, highlightConfig]);

  // Update highlighter config when highlight config changes
  useEffect(() => {
    if (conceptHighlighter) {
      console.log('🔄 Updating concept highlighter config:', highlightConfig);
      conceptHighlighter.updateConfig(highlightConfig);
      
      // Re-highlight with new config if we have page text
      if (pageTextIndex && thoughtUnitEnabled) {
        const reprocessHighlighting = async () => {
          try {
            await conceptHighlighter.highlightConcepts(pageTextIndex.text, currentPage);
            
            // Update main idea analysis with new config
            const mainIdea = extractMainIdea(pageTextIndex.text);
            setCurrentMainIdea(mainIdea.primaryIdea || "");
            setMainIdeaConfidence(mainIdea.confidence || 0);
            
            // Update active concept anchors
            const anchors = conceptHighlighter.getActiveConceptAnchors();
            setActiveConceptAnchors(anchors);
            
            console.log('✅ Concept highlighting re-processed with new config');
          } catch (error) {
            console.error('Error re-processing concept highlighting:', error);
          }
        };
        
        reprocessHighlighting();
      }
    }
  }, [highlightConfig.highlightSensitivity, highlightConfig.mainIdeaConfidenceThreshold, highlightConfig.maxMainIdeasPerPage, highlightConfig.showMainIdeas, highlightConfig.showSupportingDetails, highlightConfig.showTransitions, highlightConfig.conceptPersistence]);

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
        case "KeyT":
          e.preventDefault();
          setThoughtUnitEnabled(!thoughtUnitEnabled);
          break;
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [selectionText, isSpeaking, showSmartSidebar, thoughtUnitEnabled]);

  const effectiveSelection = (externalSelectionText?.trim() || selectionText).trim();

  return (
    <div className="h-full flex bg-gray-50">
      {/* Main PDF View (Primary - 75% width) */}
      <div className="flex-1 bg-white border-r border-gray-200">
        {/* Simplified Butler-Style Header */}
        <div className="flex items-center justify-between p-3 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-200">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🎯</span>
              <div>
                <h3 className="text-lg font-bold text-amber-800">Butler Reader</h3>
                <p className="text-xs text-amber-600">Smart content selection • Natural speech</p>
              </div>
            </div>
            
            {/* Core Navigation */}
            <div className="flex items-center gap-2 bg-white/60 backdrop-blur rounded-lg px-3 py-1">
              <button
                onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                disabled={currentPage <= 1}
                className="px-2 py-1 bg-amber-600 hover:bg-amber-500 disabled:bg-gray-300 disabled:opacity-50 text-white rounded text-sm"
              >
                ←
              </button>
              
              <div className="flex items-center gap-1">
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
                  className="w-12 text-center text-sm border border-amber-300 rounded px-1"
                />
                <span className="text-xs text-gray-600">/{pdfPageCount || '?'}</span>
              </div>
              
              <button
                onClick={() => onPageChange(Math.min(pdfPageCount || 999, currentPage + 1))}
                disabled={currentPage >= (pdfPageCount || 999)}
                className="px-2 py-1 bg-amber-600 hover:bg-amber-500 disabled:bg-gray-300 disabled:opacity-50 text-white rounded text-sm"
              >
                →
              </button>
            </div>
            
            {/* Butler Speech Controls */}
            <div className="flex items-center gap-2 bg-white/60 backdrop-blur rounded-lg px-3 py-1">
              <button
                onClick={() => setSpeechMode(speechMode === 'smart' ? 'full' : 'smart')}
                className={`px-2 py-1 rounded text-xs ${
                  speechMode === 'smart' 
                    ? 'bg-amber-600 text-white' 
                    : 'bg-gray-200 text-gray-700'
                }`}
                title="Toggle between smart and full speech modes"
              >
                {speechMode === 'smart' ? '🎯 Smart' : '📖 Full'}
              </button>
              
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
                className={`px-2 py-1 rounded text-xs ${
                  isSpeaking
                    ? 'bg-red-600 hover:bg-red-500 text-white'
                    : 'bg-green-600 hover:bg-green-500 text-white'
                }`}
              >
                {isSpeaking ? '🔇 Stop' : '🔊 Read'}
              </button>
              
              <button
                onClick={() => setShowSmartSidebar(!showSmartSidebar)}
                className={`px-2 py-1 rounded text-xs ${
                  showSmartSidebar
                    ? 'bg-purple-600 hover:bg-purple-500 text-white'
                    : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                }`}
              >
                🧠 Smart
              </button>
              
              <button
                onClick={() => setThoughtUnitEnabled(!thoughtUnitEnabled)}
                className={`px-2 py-1 rounded text-xs ${
                  thoughtUnitEnabled
                    ? 'bg-amber-600 hover:bg-amber-500 text-white'
                    : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                }`}
              >
                🎯 TU
              </button>
            </div>

            {/* Zoom Controls */}
            <div className="flex items-center gap-1 bg-white/60 backdrop-blur rounded-lg px-2 py-1">
              <button
                onClick={() => setPdfScale(s => Math.max(0.5, s - 0.1))}
                className="px-1 py-1 bg-gray-200 hover:bg-gray-300 rounded text-xs"
              >
                -
              </button>
              <span className="text-xs text-gray-600 min-w-[2.5rem] text-center">
                {Math.round(pdfScale * 100)}%
              </span>
              <button
                onClick={() => setPdfScale(s => Math.min(3.0, s + 0.1))}
                className="px-1 py-1 bg-gray-200 hover:bg-gray-300 rounded text-xs"
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* Thought Unit Controls Sidebar */}
        {thoughtUnitEnabled && (
          <div className="absolute top-16 right-4 w-80 bg-white border border-gray-300 rounded-lg shadow-xl z-30 max-h-96 overflow-y-auto">
            <div className="p-3 bg-gradient-to-r from-amber-900/30 to-orange-900/30 border-b border-amber-500/30">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm font-medium text-amber-700">🎯 Thought Unit Controls</span>
                <div className="flex-1"></div>
                <button
                  onClick={() => setThoughtUnitEnabled(false)}
                  className="text-xs px-2 py-1 rounded bg-gray-200 hover:bg-gray-300"
                >
                  ✕
                </button>
              </div>
              
              <div className="space-y-3">
                {/* Sensitivity Controls */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs text-gray-700">Highlight Sensitivity:</span>
                    <select
                      className="text-xs bg-white border border-gray-300 rounded px-2 py-1 flex-1"
                      value={highlightConfig.highlightSensitivity}
                      onChange={(e) => setHighlightConfig(prev => ({
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
                    <span className="text-xs text-gray-700">Main Idea Threshold:</span>
                    <input
                      type="range"
                      min={0.6}
                      max={0.95}
                      step={0.05}
                      value={highlightConfig.mainIdeaConfidenceThreshold}
                      onChange={(e) => setHighlightConfig(prev => ({
                        ...prev,
                        mainIdeaConfidenceThreshold: Number(e.target.value)
                      }))}
                      className="flex-1 accent-amber-400"
                    />
                    <span className="text-xs w-10">{Math.round(highlightConfig.mainIdeaConfidenceThreshold * 100)}%</span>
                  </div>
                  
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs text-gray-700">Max Main Ideas/Page:</span>
                    <input
                      type="range"
                      min={1}
                      max={5}
                      step={1}
                      value={highlightConfig.maxMainIdeasPerPage}
                      onChange={(e) => setHighlightConfig(prev => ({
                        ...prev,
                        maxMainIdeasPerPage: Number(e.target.value)
                      }))}
                      className="flex-1 accent-amber-400"
                    />
                    <span className="text-xs w-4">{highlightConfig.maxMainIdeasPerPage}</span>
                  </div>
                </div>

                {/* Highlight Type Controls */}
                <div>
                  <span className="text-xs text-gray-700 block mb-2">Highlight Types:</span>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={highlightConfig.showMainIdeas}
                        onChange={(e) => setHighlightConfig(prev => ({
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
                        checked={highlightConfig.showSupportingDetails}
                        onChange={(e) => setHighlightConfig(prev => ({
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
                        checked={highlightConfig.showTransitions}
                        onChange={(e) => setHighlightConfig(prev => ({
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
                        checked={highlightConfig.conceptPersistence}
                        onChange={(e) => setHighlightConfig(prev => ({
                          ...prev,
                          conceptPersistence: e.target.checked
                        }))}
                        className="accent-purple-400"
                      />
                      <span className="text-xs">Concept Persistence</span>
                    </label>
                  </div>
                </div>

                {/* Current Analysis Display */}
                {currentMainIdea && (
                  <div className="p-2 bg-black/10 rounded border border-amber-500/20">
                    <div className="text-xs font-medium text-amber-700 mb-1">
                      Current Main Idea ({Math.round(mainIdeaConfidence * 100)}% confidence):
                    </div>
                    <div className="text-xs text-amber-800 line-clamp-2">
                      {currentMainIdea}
                    </div>
                  </div>
                )}

                {/* Quick Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      if (currentMainIdea) {
                        speakText(currentMainIdea);
                      }
                    }}
                    className="text-xs px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white flex-1"
                    disabled={!currentMainIdea}
                  >
                    🔊 Read Main Idea
                  </button>
                  <button
                    onClick={() => {
                      if (currentMainIdea) {
                        onGenerateNote?.(currentMainIdea, undefined, "highYield");
                      }
                    }}
                    className="text-xs px-2 py-1 rounded bg-green-600 hover:bg-green-500 text-white flex-1"
                    disabled={!currentMainIdea}
                  >
                    📝 Note
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

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

            {/* David Butler Metaphors Panel */}
            {effectiveSelection && (
              <div className="bg-gradient-to-r from-teal-50 to-cyan-50 border border-teal-200 rounded-lg p-3">
                <h5 className="text-sm font-semibold text-teal-700 mb-2">🎭 David Butler Metaphors</h5>
                {(() => {
                  const butlerMetaphors = generateButlerMetaphors(effectiveSelection);
                  return butlerMetaphors.length > 0 ? (
                    <div className="space-y-2">
                      {butlerMetaphors.map((metaphor, idx) => (
                        <div key={idx} className="bg-white border-l-4 border-teal-400 rounded p-2 shadow-sm">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-lg">{metaphor.visualCue}</span>
                            <span className="text-xs font-semibold text-teal-600 uppercase">{metaphor.concept}</span>
                          </div>
                          <div className="text-xs text-gray-600 mb-1">
                            <strong>Think of it as:</strong> {metaphor.metaphor}
                          </div>
                          <div className="text-xs text-gray-700 italic">
                            {metaphor.explanation}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-gray-600 italic">
                      Select text with medical/educational concepts to see Butler-style metaphors
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Enhanced Comprehensive Analysis Results */}
            {comprehensiveAnalysis && enhancedMode && (
              <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-lg p-3 mb-4">
                <h5 className="text-sm font-semibold text-emerald-700 mb-2">⚡ Enhanced Analysis</h5>
                
                {/* Quality Metrics */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="bg-white rounded p-2 text-center">
                    <div className="text-xs text-gray-600">Thought Units</div>
                    <div className="text-sm font-bold text-emerald-600">
                      {comprehensiveAnalysis.thoughtUnits.length}
                    </div>
                  </div>
                  <div className="bg-white rounded p-2 text-center">
                    <div className="text-xs text-gray-600">Quality Score</div>
                    <div className="text-sm font-bold text-emerald-600">
                      {Math.round(comprehensiveAnalysis.qualityMetrics.overallAccuracy * 100)}%
                    </div>
                  </div>
                </div>
                
                {/* Enhanced Main Ideas */}
                {comprehensiveAnalysis.enhancedMainIdeaAnalysis.supportingPoints.length > 0 && (
                  <div className="mb-3">
                    <h6 className="text-xs font-semibold text-emerald-600 mb-1">🎯 Enhanced Main Ideas</h6>
                    <div className="space-y-1">
                      <div className="bg-white border-l-4 border-emerald-400 rounded p-2 text-xs">
                        <div className="font-medium text-gray-800">{comprehensiveAnalysis.enhancedMainIdeaAnalysis.primaryIdea}</div>
                        <div className="text-gray-600 mt-1">
                          Confidence: {Math.round(comprehensiveAnalysis.enhancedMainIdeaAnalysis.confidence * 100)}% | 
                          Support: {comprehensiveAnalysis.enhancedMainIdeaAnalysis.supportingPoints.length} items
                        </div>
                      </div>
                      {comprehensiveAnalysis.enhancedMainIdeaAnalysis.supportingPoints.slice(0, 2).map((point, idx) => (
                        <div key={idx} className="bg-white border-l-4 border-emerald-300 rounded p-2 text-xs">
                          <div className="text-gray-700">{point}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Support Classification */}
                {comprehensiveAnalysis.supportAnalysis.classifications.length > 0 && (
                  <div className="mb-3">
                    <h6 className="text-xs font-semibold text-emerald-600 mb-1">📋 Support Types</h6>
                    <div className="flex flex-wrap gap-1">
                      {comprehensiveAnalysis.supportAnalysis.classifications.slice(0, 5).map((support, idx) => (
                        <span key={idx} className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded text-xs">
                          {support.type}: {support.subtype}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Document Structure */}
                {comprehensiveAnalysis.documentOutline && (
                  <div>
                    <h6 className="text-xs font-semibold text-emerald-600 mb-1">🏗️ Structure</h6>
                    <div className="text-xs text-gray-700">
                      Sections: {comprehensiveAnalysis.documentOutline.sections.length} | 
                      Hierarchy Depth: {comprehensiveAnalysis.comprehensiveInsights.informationArchitecture.hierarchyDepth}
                    </div>
                  </div>
                )}
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
                  {enhancedMode && comprehensiveAnalysis && (
                    <span className="ml-2 text-emerald-600">⚡ Enhanced</span>
                  )}
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

                {/* Enhanced Concept Highlights Legend with Chunking Types */}
                {rightBrainMode && conceptHighlights.length > 0 && (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <h5 className="text-sm font-semibold text-gray-700 mb-2">🎯 Smart Chunking & Highlights</h5>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs">
                        <div className="w-3 h-3 rounded" style={{ backgroundColor: "#FFD700" }}></div>
                        <span>Main Ideas & Key Points</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <div className="w-3 h-3 rounded" style={{ backgroundColor: "#DDA0DD" }}></div>
                        <span>Processes & Mechanisms</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <div className="w-3 h-3 rounded" style={{ backgroundColor: "#98FB98" }}></div>
                        <span>Definitions & Terms</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <div className="w-3 h-3 rounded" style={{ backgroundColor: "#87CEEB" }}></div>
                        <span>Supporting Details</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <div className="w-3 h-3 rounded" style={{ backgroundColor: "#F0E68C" }}></div>
                        <span>Relationships & Connections</span>
                      </div>
                    </div>
                    <div className="mt-2 pt-2 border-t border-gray-300">
                      <p className="text-xs text-gray-600 italic">
                        📖 Intelligent chunking highlights complete thoughts and main ideas for better understanding
                      </p>
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

      {/* TU Interaction Modal */}
      <TUInteractionModal
        isOpen={tuModalState.isOpen}
        onClose={() => setTuModalState(prev => ({ ...prev, isOpen: false }))}
        thoughtUnitText={tuModalState.text}
        conceptType={tuModalState.conceptType}
        position={tuModalState.position}
        confidence={tuModalState.confidence}
        onGenerateNote={onGenerateNote}
        onSpeak={speakText}
      />
    </div>
  );
}
