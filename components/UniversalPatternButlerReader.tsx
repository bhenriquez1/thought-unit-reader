"use client";

import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";
import type { ThoughtUnit as BaseThoughtUnit, ReadingStats } from "@/types/reading";
import { Document, Page } from "react-pdf";
import type { TOCEntry } from "@/lib/tocParser";
import TUInteractionModal from "@/components/TUInteractionModal";
import ErrorBoundary from "@/components/ErrorBoundary";

// Butler System Imports - Full Integration
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

// Enhanced Analysis Integration
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

// Pattern System Integration - Universal Patterns
import { 
  UNIVERSAL_PATTERNS, 
  UNIVERSAL_PATTERN_CATEGORIES,
  getUniversalPatternById,
  getPatternKeywords as getUniversalPatternKeywords,
  type UniversalPattern as Pattern,
  type PatternAttempt,
  type PatternMastery
} from "@/types/universalPatterns";
import { DAT_PATTERNS, PATTERN_CATEGORIES } from "@/types/patterns";
import { 
  savePatternAttempt,
  loadPatternMastery
} from "@/lib/firebase";
import { auth } from "@/lib/firebase";
import type { User } from "firebase/auth";

// Adaptive Learning Integration
import { 
  getAdaptiveLearningEngine,
  type IntelligentUserModel,
  type ModeRecommendation,
  type LearningPrediction,
  type AdaptiveLearningEngine
} from "@/lib/adaptiveLearning";
import LearningAnalyticsDashboard from "@/components/LearningAnalyticsDashboard";
import TOCSidebar from "@/components/TOCSidebar";

type HRUnit = BaseThoughtUnit | string | string[] | { text?: string };

interface UniversalPatternButlerReaderProps {
  bookId: string;
  userId: string;
  pdfUrl: string;
  currentPage: number;
  pdfPageCount?: number;
  onPageChange: (page: number) => void;
  thoughtUnits: HRUnit[];
  currentThoughtUnit: number;
  setCurrentThoughtUnit: React.Dispatch<React.SetStateAction<number>>;
  highlightedWord: string;
  setHighlightedWord: (word: string) => void;
  onWordClick: (word: string) => void;
  onTextSelect?: (text: string) => void;
  onGenerateNote?: (text: string, mnemonic?: string, mode?: "sketch" | "highYield") => void;
  selBind?: { onMouseUp?: (e: React.MouseEvent) => void };
  externalSelectionText?: string;
  fontSize: number;
  fontFamily: string;
  lineSpacing: number;
  selectedVoice?: SpeechSynthesisVoice;
  onVoiceChange?: (voice: SpeechSynthesisVoice) => void;
  speechRate?: number;
  onSpeechRateChange?: (rate: number) => void;
  tableOfContents?: TOCEntry[];
}

// Combine universal patterns with DAT patterns
const ALL_PATTERNS: Pattern[] = [...UNIVERSAL_PATTERNS, ...DAT_PATTERNS];

// Mode Types
type ReaderMode = 'exploration' | 'training' | 'butler';

// Training Workflow State
type TrainingStep = 'selection' | 'pattern-choice' | 'rules' | 'application' | 'feedback' | 'assessment';

interface TrainingState {
  step: TrainingStep;
  selectedText: string;
  suggestedPatterns: Pattern[];
  selectedPattern: Pattern | null;
  userResponse: string;
  isCorrect: boolean | null;
  attempts: number;
  startTime: number;
}

// Helper functions
function unitToText(u: HRUnit): string {
  if (u == null) return "";
  if (typeof u === "string") return u;
  if (Array.isArray(u)) return u.join(" ");
  const maybeText = (u as any).text;
  return typeof maybeText === "string" ? maybeText : JSON.stringify(u);
}

// Advanced Pattern Detection with Context Awareness
function detectUniversalPatterns(text: string, context?: string): Pattern[] {
  const detectedPatterns: Pattern[] = [];
  const lowerText = text.toLowerCase();
  const fullText = context ? `${context} ${text}`.toLowerCase() : lowerText;
  
  // Enhanced pattern detection with confidence scoring
  UNIVERSAL_PATTERNS.forEach(pattern => {
    let matchScore = 0;
    let matchedKeywords: string[] = [];
    
    // Check pattern-specific keywords
    const patternKeywords = getPatternKeywords(pattern.id);
    patternKeywords.forEach(keyword => {
      if (lowerText.includes(keyword)) {
        matchScore += 1;
        matchedKeywords.push(keyword);
      }
    });
    
    // Boost score for exact phrase matches in examples
    pattern.examples.forEach(example => {
      const exampleWords = example.toLowerCase().split(/\s+/);
      const matchingWords = exampleWords.filter(word => lowerText.includes(word));
      matchScore += matchingWords.length * 0.5;
    });
    
    // Context analysis for better matching
    if (context && pattern.tags) {
      pattern.tags.forEach(tag => {
        if (fullText.includes(tag)) {
          matchScore += 0.3;
        }
      });
    }
    
    // Include pattern if it has significant matches
    if (matchScore >= 1.5) {
      detectedPatterns.push({
        ...pattern,
        confidence: Math.min(matchScore / 3, 1.0), // Normalize confidence
        matchedKeywords
      } as Pattern & { confidence: number; matchedKeywords: string[] });
    }
  });
  
  // Sort by confidence and return top matches
  return detectedPatterns
    .sort((a, b) => (b as any).confidence - (a as any).confidence)
    .slice(0, 5);
}

// Pattern keyword mappings
function getPatternKeywords(patternId: string): string[] {
  const keywordMap: Record<string, string[]> = {
    'cause-effect-analysis': ['because', 'since', 'due to', 'therefore', 'as a result', 'consequently', 'leads to'],
    'problem-solution-framework': ['problem', 'issue', 'challenge', 'solution', 'solve', 'approach', 'method'],
    'main-idea-identification': ['main', 'central', 'key', 'important', 'primary', 'essential', 'point'],
    'hypothesis-testing': ['hypothesis', 'predict', 'test', 'experiment', 'data', 'results', 'conclusion'],
    'spaced-repetition': ['review', 'practice', 'repeat', 'memory', 'recall', 'retention', 'learning'],
    // Add DAT pattern keywords
    'cardio': ['acid', 'base', 'pka', 'ph', 'acidic', 'basic', 'proton'],
    'sn-e-flow': ['substitution', 'elimination', 'nucleophile', 'sn1', 'sn2', 'e1', 'e2'],
    'q-vs-k': ['equilibrium', 'quotient', 'concentration', 'forward', 'reverse'],
  };
  
  return keywordMap[patternId] || [];
}

// Advanced Butler Metaphor Generation
function generateAdvancedButlerMetaphors(text: string, patterns: Pattern[]): Array<{
  concept: string;
  metaphor: string;
  explanation: string;
  visualCue: string;
  relatedPattern?: string;
}> {
  const metaphors: any[] = [];
  
  // Enhanced metaphor generation based on detected patterns
  patterns.forEach(pattern => {
    if (pattern.category === 'analytical-reasoning') {
      if (pattern.id === 'cause-effect-analysis') {
        metaphors.push({
          concept: 'Cause-Effect Relationship',
          metaphor: 'domino chain reaction',
          explanation: 'Like dominoes falling in sequence, each cause triggers the next effect in a predictable chain',
          visualCue: '🎯',
          relatedPattern: pattern.id
        });
      }
    }
    
    if (pattern.category === 'scientific-method') {
      metaphors.push({
        concept: 'Scientific Method',
        metaphor: 'detective investigation',
        explanation: 'Scientists work like detectives - forming theories, gathering evidence, and solving mysteries step by step',
        visualCue: '🔍',
        relatedPattern: pattern.id
      });
    }
  });
  
  // General conceptual metaphors
  const conceptPatterns = [
    { pattern: /system|process|method/gi, metaphor: 'well-oiled machine', explanation: 'Complex systems work like machines where each part has a specific function', visualCue: '⚙️' },
    { pattern: /learn|understand|study/gi, metaphor: 'building knowledge architecture', explanation: 'Learning is like constructing a building - you need a strong foundation before adding upper floors', visualCue: '🏗️' },
    { pattern: /connect|relate|link/gi, metaphor: 'neural network', explanation: 'Ideas connect like neurons in the brain, forming pathways that strengthen with use', visualCue: '🧠' },
  ];
  
  conceptPatterns.forEach(({ pattern, metaphor, explanation, visualCue }) => {
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
  
  return metaphors.slice(0, 3); // Limit to prevent overwhelming
}

export default function UniversalPatternButlerReader({
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
  onGenerateNote,
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
}: UniversalPatternButlerReaderProps) {
  // Core State Management - DEFAULT TO TRAINING MODE
  const [currentMode, setCurrentMode] = useState<ReaderMode>('training');
  const [selectionText, setSelectionText] = useState("");
  const [user, setUser] = useState<User | null>(null);
  
  // PDF interaction state  
  const [pdfScale, setPdfScale] = useState(1.3);
  
  // Butler System State - Full Integration
  const [butlerAnalysis, setButlerAnalysis] = useState<ButlerAnalysisResult | null>(null);
  const [butlerHighlights, setButlerHighlights] = useState<ButlerHighlight[]>([]);
  const [speechMode, setSpeechMode] = useState<SpeechMode>('smart');
  const [butlerSpeechOptions, setButlerSpeechOptions] = useState<ButlerSpeechOptions>(DEFAULT_BUTLER_SPEECH);
  
  // Enhanced Analysis State
  const [comprehensiveAnalysis, setComprehensiveAnalysis] = useState<ComprehensiveAnalysisResult | null>(null);
  const [conceptHighlighter, setConceptHighlighter] = useState<ConceptAnchoredHighlighter | null>(null);
  const [rightBrainAnalysis, setRightBrainAnalysis] = useState<RightBrainChunkAnalysis | null>(null);
  
  // Pattern System State
  const [detectedPatterns, setDetectedPatterns] = useState<Pattern[]>([]);
  const [patternMastery, setPatternMastery] = useState<PatternMastery[]>([]);
  
  // Training Mode State
  const [trainingState, setTrainingState] = useState<TrainingState>({
    step: 'selection',
    selectedText: '',
    suggestedPatterns: [],
    selectedPattern: null,
    userResponse: '',
    isCorrect: null,
    attempts: 0,
    startTime: Date.now()
  });
  
  // Voice and Speech
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);
  
  // TU Modal State
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
  
  // 🧠 Adaptive Learning State - INTELLIGENT PERSONALIZATION
  const [adaptiveLearningEngine, setAdaptiveLearningEngine] = useState<AdaptiveLearningEngine | null>(null);
  const [userModel, setUserModel] = useState<IntelligentUserModel | null>(null);
  const [modeRecommendation, setModeRecommendation] = useState<ModeRecommendation | null>(null);
  const [intelligentPatternSuggestions, setIntelligentPatternSuggestions] = useState<Pattern[]>([]);
  const [adaptiveComplexityLevel, setAdaptiveComplexityLevel] = useState(3);
  
  // 📑 TOC Integration State
  const [tocVisible, setTocVisible] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // Debug TOC visibility changes
  useEffect(() => {
    console.log('📑 TOC visibility changed:', tocVisible);
  }, [tocVisible]);
  
  // Performance optimization: Cache analysis results
  const analysisCache = useRef<Map<string, {
    patterns: Pattern[];
    butler: ButlerAnalysisResult;
    comprehensive?: ComprehensiveAnalysisResult;
    rightBrain?: RightBrainChunkAnalysis;
    timestamp: number;
  }>>(new Map());
  
  const pdfContainerRef = useRef<HTMLDivElement>(null);

  // Get effective selection text (needs to be early for use in effects)
  const effectiveSelection = (externalSelectionText?.trim() || selectionText).trim();

  // Authentication
  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => setUser(u));
    return () => unsub();
  }, []);

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

  // Load pattern mastery
  useEffect(() => {
    if (userId) {
      loadPatternMastery(userId).then(setPatternMastery);
    }
  }, [userId]);

  // 🧠 ADAPTIVE LEARNING INITIALIZATION - INTELLIGENCE ACTIVATION
  useEffect(() => {
    if (userId) {
      console.log('🧠 Initializing Adaptive Learning Engine for user:', userId);
      const engine = getAdaptiveLearningEngine(userId);
      setAdaptiveLearningEngine(engine);
      
      // Load user model
      const model = engine.getUserModel();
      setUserModel(model);
      
      console.log('📊 User model loaded:', {
        experience: model.experienceLevel,
        confidence: model.confidence,
        totalTimeSpent: model.totalTimeSpent
      });
      
      // Set adaptive complexity based on user model
      setAdaptiveComplexityLevel(model.optimalComplexityLevel);
      
      // Record session start
      engine.recordEvent({
        timestamp: Date.now(),
        action: 'mode_switched',
        contextData: {
          contentType: 'pdf',
          domain: 'general',
          difficulty: model.optimalComplexityLevel,
          pageNumber: currentPage,
          thoughtUnitIndex: currentThoughtUnit
        }
      });
    }
  }, [userId, currentPage, currentThoughtUnit]);

  // 🎯 INTELLIGENT MODE RECOMMENDATIONS - ADAPTIVE TRANSITIONS
  useEffect(() => {
    if (adaptiveLearningEngine && selectionText && detectedPatterns.length > 0) {
      const contextData = {
        patterns: detectedPatterns,
        textLength: selectionText.length,
        complexity: detectedPatterns.reduce((sum, p) => sum + ((p as any).confidence || 0), 0) / detectedPatterns.length
      };
      
      const recommendation = adaptiveLearningEngine.recommendNextMode(currentMode, contextData);
      setModeRecommendation(recommendation);
      
      console.log('💡 Mode recommendation:', recommendation.recommendedMode, 
        `(${Math.round(recommendation.confidence * 100)}% confidence)`, recommendation.reasons);
    }
  }, [adaptiveLearningEngine, currentMode, selectionText, detectedPatterns]);

  // 🎯 INTELLIGENT PATTERN SUGGESTIONS - PERSONALIZED LEARNING
  useEffect(() => {
    if (adaptiveLearningEngine && userModel && detectedPatterns.length > 0) {
      // Filter patterns based on user's learning level and preferences
      const intelligentSuggestions = detectedPatterns.filter(pattern => {
        const prediction = adaptiveLearningEngine.predictPatternSuccess(pattern.id, {});
        
        // Show patterns that are appropriately challenging
        const isAppropriate = prediction.predictedSuccessRate >= 0.3 && prediction.predictedSuccessRate <= 0.8;
        
        // Boost patterns user hasn't mastered yet
        const needsPractice = !userModel.preferredPatterns.includes(pattern.id);
        
        return isAppropriate || needsPractice;
      }).slice(0, Math.max(2, Math.min(5, adaptiveComplexityLevel))); // Adaptive complexity
      
      setIntelligentPatternSuggestions(intelligentSuggestions);
      
      console.log('🎯 Intelligent pattern suggestions generated:', 
        intelligentSuggestions.map(p => p.name));
    }
  }, [adaptiveLearningEngine, userModel, detectedPatterns, adaptiveComplexityLevel]);

  // AUTO-CONTENT SELECTION - Engage immediately when content loads
  useEffect(() => {
    if (thoughtUnits.length > 0 && currentThoughtUnit >= 1 && currentThoughtUnit <= thoughtUnits.length) {
      const currentUnitText = unitToText(thoughtUnits[currentThoughtUnit - 1]).trim();
      
      // Auto-select first meaningful thought unit if no selection exists
      if (!selectionText && !effectiveSelection && currentUnitText.length > 50) {
        console.log('🎯 Auto-selecting content for immediate engagement:', currentUnitText.slice(0, 50) + '...');
        setSelectionText(currentUnitText);
        
        // Also trigger training mode workflow
        if (currentMode === 'training' && trainingState.step === 'selection') {
          setTrainingState(prev => ({
            ...prev,
            step: 'pattern-choice',
            selectedText: currentUnitText,
            startTime: Date.now()
          }));
        }
      }
    }
  }, [thoughtUnits, currentThoughtUnit, selectionText, effectiveSelection, currentMode, trainingState.step]);

  // Optimized Analysis Pipeline with Caching and Debouncing
  useEffect(() => {
    if (!selectionText || selectionText.length < 10) {
      setDetectedPatterns([]);
      setButlerAnalysis(null);
      setComprehensiveAnalysis(null);
      setRightBrainAnalysis(null);
      setIsAnalyzing(false);
      return;
    }

    const runOptimizedAnalysis = async () => {
      const textHash = btoa(selectionText).slice(0, 32); // Create cache key
      const cached = analysisCache.current.get(textHash);
      
      // Check cache (valid for 5 minutes)
      if (cached && Date.now() - cached.timestamp < 300000) {
        console.log('📦 Using cached analysis results');
        setDetectedPatterns(cached.patterns);
        setButlerAnalysis(cached.butler);
        setButlerHighlights(cached.butler.highlights);
        if (cached.comprehensive) setComprehensiveAnalysis(cached.comprehensive);
        if (cached.rightBrain) setRightBrainAnalysis(cached.rightBrain);
        setIsAnalyzing(false);
        return;
      }

      try {
        setIsAnalyzing(true);
        console.log('🎯 Running Optimized Analysis Pipeline...');
        
        // 1. Fast Pattern Detection (synchronous)
        const patterns = detectUniversalPatterns(selectionText);
        setDetectedPatterns(patterns);
        
        // 2. Butler Analysis (async but prioritized)
        const butler = await analyzeTextWithButler(selectionText);
        setButlerAnalysis(butler);
        setButlerHighlights(butler.highlights);
        
        // 3. Enhanced Analysis (only for shorter texts and in butler mode)
        let enhanced: ComprehensiveAnalysisResult | undefined = undefined;
        if (selectionText.length < 500 && currentMode === 'butler') {
          try {
            enhanced = await enhancedHybridAnalysisEngine.analyzeText(selectionText);
            setComprehensiveAnalysis(enhanced);
          } catch (error) {
            console.warn('Enhanced analysis failed:', error);
          }
        }
        
        // 4. Right-Brain Analysis (only if patterns detected)
        let rightBrain: RightBrainChunkAnalysis | undefined = undefined;
        if (patterns.length > 0 && currentMode === 'butler') {
          try {
            rightBrain = analyzeChunkWithRightBrain(selectionText, currentThoughtUnit - 1, thoughtUnits.length);
            setRightBrainAnalysis(rightBrain);
          } catch (error) {
            console.warn('Right-brain analysis failed:', error);
          }
        }
        
        // Cache results
        analysisCache.current.set(textHash, {
          patterns,
          butler,
          comprehensive: enhanced,
          rightBrain,
          timestamp: Date.now()
        });
        
        console.log(`✅ Analysis complete: ${patterns.length} patterns, ${butler.highlights.length} highlights`);
        
      } catch (error) {
        console.error('Analysis pipeline error:', error);
      } finally {
        setIsAnalyzing(false);
      }
    };

    // Longer debounce to prevent analysis spam
    const timeoutId = setTimeout(runOptimizedAnalysis, 800);
    return () => clearTimeout(timeoutId);
  }, [selectionText, currentMode, currentThoughtUnit, thoughtUnits.length]);

  // Handle text selection
  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    const selection = window.getSelection()?.toString().trim() || "";
    setSelectionText(selection);
    
    if (selection) {
      onTextSelect?.(selection);
      onWordClick(selection);
      
      // Update training state if in training mode
      if (currentMode === 'training' && trainingState.step === 'selection') {
        setTrainingState(prev => ({
          ...prev,
          step: 'pattern-choice',
          selectedText: selection,
          startTime: Date.now()
        }));
      }
    }
    
    selBind?.onMouseUp?.(e);
  }, [currentMode, trainingState.step, onTextSelect, onWordClick, selBind]);

  // Speech synthesis
  const speakText = useCallback((text: string) => {
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
  }, [selectedVoice, speechRate]);

  const stopSpeaking = useCallback(() => {
    speechSynthesis.cancel();
    setIsSpeaking(false);
  }, []);

  // Training workflow handlers
  const handlePatternSelect = useCallback((pattern: Pattern) => {
    setTrainingState(prev => ({
      ...prev,
      step: 'rules',
      selectedPattern: pattern
    }));
  }, []);

  const handleStartApplication = useCallback(() => {
    setTrainingState(prev => ({
      ...prev,
      step: 'application'
    }));
  }, []);

  const handleSubmitResponse = useCallback(() => {
    setTrainingState(prev => ({
      ...prev,
      step: 'feedback',
      attempts: prev.attempts + 1
    }));
  }, []);

  const handleSelfAssessment = useCallback((correct: boolean) => {
    const timeSpent = Math.round((Date.now() - trainingState.startTime) / 1000);
    
    // 🧠 ADAPTIVE LEARNING - RECORD TRAINING COMPLETION
    if (adaptiveLearningEngine && trainingState.selectedPattern) {
      adaptiveLearningEngine.recordEvent({
        timestamp: Date.now(),
        action: 'training_completed',
        patternId: trainingState.selectedPattern.id,
        successScore: correct ? 85 : 45, // Convert boolean to score
        timeSpent,
        contextData: {
          contentType: 'pdf',
          domain: 'general',
          difficulty: adaptiveComplexityLevel,
          pageNumber: currentPage,
          thoughtUnitIndex: currentThoughtUnit
        },
        metadata: {
          attempts: trainingState.attempts,
          userResponse: trainingState.userResponse,
          patternName: trainingState.selectedPattern.name
        }
      });
      
      // Update user model
      const updatedModel = adaptiveLearningEngine.getUserModel();
      setUserModel(updatedModel);
      
      console.log('📊 Training completion recorded:', {
        pattern: trainingState.selectedPattern.name,
        success: correct,
        newExperience: updatedModel.experienceLevel,
        newConfidence: Math.round(updatedModel.confidence * 100) + '%'
      });
    }
    
    // Save attempt (using local storage for prototype)
    const attempt: PatternAttempt = {
      id: `${Date.now()}-${Math.random()}`,
      userId: userId || "guest",
      patternId: trainingState.selectedPattern?.id || "unknown",
      thoughtUnitId: currentThoughtUnit.toString(),
      bookId,
      timestamp: new Date().toISOString(),
      selectedPattern: trainingState.selectedPattern?.id || null,
      correct,
      timeSpent,
      skipped: false,
      notes: trainingState.userResponse
    };
    
    // Store in local storage for prototype
    const attempts = JSON.parse(localStorage.getItem('patternAttempts') || '[]');
    attempts.push(attempt);
    localStorage.setItem('patternAttempts', JSON.stringify(attempts));
    
    setTrainingState(prev => ({
      ...prev,
      step: 'assessment',
      isCorrect: correct
    }));
  }, [adaptiveLearningEngine, trainingState.selectedPattern, trainingState.userResponse, trainingState.startTime, trainingState.attempts, userId, currentThoughtUnit, bookId, adaptiveComplexityLevel, currentPage]);

  const resetTraining = useCallback(() => {
    setTrainingState({
      step: 'selection',
      selectedText: '',
      suggestedPatterns: [],
      selectedPattern: null,
      userResponse: '',
      isCorrect: null,
      attempts: 0,
      startTime: Date.now()
    });
  }, []);

  return (
    <ErrorBoundary
      fallback={
        <div className="h-full flex flex-col bg-gray-900 text-white">
          <div className="flex items-center justify-between p-4 border-b border-gray-700">
            <h2 className="text-xl font-bold text-red-400">⚠️ Universal Reader Error</h2>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="text-6xl mb-4">🚨</div>
              <h3 className="text-xl font-bold text-red-400 mb-2">UniversalPatternButlerReader failed to load</h3>
              <p className="text-gray-400 mb-4">There was an issue loading the unified reader interface.</p>
            </div>
          </div>
        </div>
      }
      resetKeys={[currentMode, currentPage, userId]}
    >
      <div className="h-full flex bg-gray-50">
        {/* TOC Sidebar - Conditionally Rendered */}
        {tocVisible && (
          <div className="flex-shrink-0">
            <TOCSidebar
              toc={tableOfContents}
              currentPage={currentPage}
              onJumpToPage={onPageChange}
              isVisible={tocVisible}
              onToggleVisibility={() => {
                console.log('📑 TOC Close button clicked - hiding TOC');
                setTocVisible(false);
              }}
              userId={userId}
            />
          </div>
        )}

        {/* Main PDF View - Responsive width based on TOC visibility */}
        <div className={`${tocVisible ? 'w-1/2' : 'w-3/5'} bg-white border-r border-gray-200 transition-all duration-300`}>
          {/* Universal Header with Mode Switching */}
          <div className="flex items-center justify-between p-3 bg-gradient-to-r from-indigo-50 via-purple-50 to-pink-50 border-b border-indigo-200">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🎯</span>
                <div>
                  <h3 className="text-lg font-bold text-indigo-800">Universal Pattern Butler</h3>
                  <p className="text-xs text-indigo-600">Advanced analysis • Active training • Butler speech</p>
                </div>
              </div>
              
              {/* Mode Toggle */}
              <div className="flex items-center gap-1 bg-white/70 backdrop-blur rounded-lg p-1">
                <button
                  onClick={() => setCurrentMode('exploration')}
                  className={`px-3 py-2 rounded text-sm font-medium transition-all ${
                    currentMode === 'exploration' 
                      ? 'bg-green-500 text-white shadow-md' 
                      : 'text-green-700 hover:bg-green-100'
                  }`}
                >
                  📖 Exploration
                </button>
                <button
                  onClick={() => setCurrentMode('training')}
                  className={`px-3 py-2 rounded text-sm font-medium transition-all ${
                    currentMode === 'training' 
                      ? 'bg-blue-500 text-white shadow-md' 
                      : 'text-blue-700 hover:bg-blue-100'
                  }`}
                >
                  🎯 Training
                </button>
                <button
                  onClick={() => setCurrentMode('butler')}
                  className={`px-3 py-2 rounded text-sm font-medium transition-all ${
                    currentMode === 'butler' 
                      ? 'bg-purple-500 text-white shadow-md' 
                      : 'text-purple-700 hover:bg-purple-100'
                  }`}
                >
                  🧠 Butler
                </button>
              </div>
            </div>
            
            {/* Navigation Controls */}
            <div className="flex items-center gap-2 bg-white/60 backdrop-blur rounded-lg px-3 py-1">
              <button
                onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                disabled={currentPage <= 1}
                className="px-2 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-300 disabled:opacity-50 text-white rounded text-sm"
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
                  className="w-12 text-center text-sm border border-indigo-300 rounded px-1"
                />
                <span className="text-xs text-gray-600">/{pdfPageCount || '?'}</span>
              </div>
              
              <button
                onClick={() => onPageChange(Math.min(pdfPageCount || 999, currentPage + 1))}
                disabled={currentPage >= (pdfPageCount || 999)}
                className="px-2 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-300 disabled:opacity-50 text-white rounded text-sm"
              >
                →
              </button>
            </div>

            {/* Controls Row */}
            <div className="flex items-center gap-3">
              {/* TOC Toggle - DISABLED FOR TESTING */}
              {false && (
                <button
                  onClick={() => setTocVisible(!tocVisible)}
                  className={`px-2 py-1 rounded text-xs flex items-center gap-1 ${
                    tocVisible 
                      ? 'bg-amber-600 text-white shadow-md' 
                      : 'bg-white/60 text-gray-700 hover:bg-white/80'
                  }`}
                  title={tocVisible ? "Hide Table of Contents" : "Show Table of Contents"}
                >
                  📑 TOC
                  {tableOfContents && tableOfContents.length > 0 && (
                    <span className="bg-white/20 px-1 rounded text-xs">
                      {tableOfContents.length}
                    </span>
                  )}
                </button>
              )}

              {/* Speech Controls */}
              <div className="flex items-center gap-2 bg-white/60 backdrop-blur rounded-lg px-3 py-1">
                <button
                  onClick={() => setSpeechMode(speechMode === 'smart' ? 'full' : 'smart')}
                  className={`px-2 py-1 rounded text-xs ${
                    speechMode === 'smart' 
                      ? 'bg-indigo-600 text-white' 
                      : 'bg-gray-200 text-gray-700'
                  }`}
                >
                  {speechMode === 'smart' ? '🎯 Smart' : '📖 Full'}
                </button>
                
                <button
                  onClick={() => {
                    if (isSpeaking) {
                      stopSpeaking();
                    } else if (effectiveSelection) {
                      speakText(effectiveSelection);
                    }
                  }}
                  className={`px-2 py-1 rounded text-xs ${
                    isSpeaking
                      ? 'bg-red-600 hover:bg-red-500 text-white'
                      : 'bg-green-600 hover:bg-green-500 text-white'
                  }`}
                  disabled={!effectiveSelection && !isSpeaking}
                >
                  {isSpeaking ? '🔇 Stop' : '🔊 Read'}
                </button>

                {/* Zoom Controls */}
                <button
                  onClick={() => setPdfScale(s => Math.max(0.5, s - 0.1))}
                  className="px-1 py-1 bg-gray-200 hover:bg-gray-300 rounded text-xs"
                >
                  -
                </button>
                <span className="text-xs text-gray-600 min-w-[2rem] text-center">
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
                <Document 
                  key={`pdf-${pdfUrl}-${currentPage}`} // Force re-render on page change
                  file={pdfUrl}
                  onLoadSuccess={(pdf) => {
                    console.log(`📄 PDF loaded successfully: ${pdf.numPages} pages`);
                    if (currentPage > pdf.numPages) {
                      console.warn(`⚠️ Current page ${currentPage} exceeds PDF pages ${pdf.numPages}, adjusting...`);
                      onPageChange(1);
                    }
                  }}
                  onLoadError={(error) => {
                    console.error('📄 PDF load error:', error);
                  }}
                  loading={
                    <div className="flex flex-col items-center justify-center p-8">
                      <div className="animate-spin text-4xl mb-4">📄</div>
                      <p className="text-gray-600">Loading PDF for universal analysis...</p>
                      <p className="text-xs text-gray-500 mt-2">Page {currentPage}</p>
                    </div>
                  }
                  error={
                    <div className="flex flex-col items-center justify-center p-8">
                      <div className="text-4xl mb-4 text-red-500">❌</div>
                      <p className="text-red-600 font-semibold">Failed to load PDF</p>
                      <p className="text-gray-600 text-sm">Please try uploading the file again</p>
                      <p className="text-xs text-gray-500 mt-2">Attempted page: {currentPage}</p>
                    </div>
                  }
                >
                  <Page 
                    key={`page-${currentPage}-${pdfScale}`} // Force re-render on page/scale change
                    pageNumber={currentPage} 
                    scale={pdfScale}
                    renderTextLayer={true}
                    renderAnnotationLayer={true}
                    onLoadSuccess={(page) => {
                      console.log(`📄 Page ${currentPage} loaded successfully`);
                    }}
                    onLoadError={(error) => {
                      console.error(`📄 Page ${currentPage} load error:`, error);
                    }}
                    onRenderSuccess={() => {
                      console.log(`📄 Page ${currentPage} rendered successfully`);
                      // Scroll to top of page after render
                      if (pdfContainerRef.current) {
                        pdfContainerRef.current.scrollTop = 0;
                      }
                    }}
                    loading={
                      <div className="flex items-center justify-center p-12">
                        <div className="animate-pulse text-2xl">🎯 Loading page {currentPage}...</div>
                      </div>
                    }
                    error={
                      <div className="flex items-center justify-center p-12">
                        <div className="text-red-500">❌ Failed to load page {currentPage}</div>
                        <button
                          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                          className="ml-4 px-2 py-1 bg-blue-500 text-white rounded text-sm"
                        >
                          Try Previous Page
                        </button>
                      </div>
                    }
                  />
                </Document>
              </div>
            </div>
          </div>
        </div>

        {/* Universal Analysis Panel (40% width) */}
        <div className="w-2/5 bg-white flex flex-col">
          {/* Panel Header */}
          <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-indigo-50 to-purple-50">
            <div className="flex items-center justify-between">
              <h4 className={`text-lg font-semibold ${
                currentMode === 'exploration' ? 'text-green-700' :
                currentMode === 'training' ? 'text-blue-700' :
                'text-purple-700'
              }`}>
                {currentMode === 'exploration' && '📖 Pattern Exploration'}
                {currentMode === 'training' && '🎯 Active Training'}
                {currentMode === 'butler' && '🧠 Butler Analysis'}
              </h4>
              <div className="text-xs text-gray-600">
                {effectiveSelection ? `"${effectiveSelection.slice(0, 30)}..."` : 'Select text to analyze'}
              </div>
            </div>
          </div>

          {/* Content Area - Mode Specific */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            
            {/* Current Selection Display */}
            {effectiveSelection && (
              <div className={`border rounded-lg p-3 ${
                currentMode === 'exploration' ? 'bg-green-50 border-green-200' :
                currentMode === 'training' ? 'bg-blue-50 border-blue-200' :
                'bg-purple-50 border-purple-200'
              }`}>
                <h5 className="text-sm font-semibold mb-2">📝 Selected Text</h5>
                <p className="text-sm text-gray-700 italic mb-3">
                  "{effectiveSelection.slice(0, 150)}{effectiveSelection.length > 150 ? '...' : ''}"
                </p>
                
                <div className="flex gap-2">
                  <button
                    onClick={() => speakText(effectiveSelection)}
                    className={`px-2 py-1 rounded text-xs text-white ${
                      currentMode === 'exploration' ? 'bg-green-600 hover:bg-green-500' :
                      currentMode === 'training' ? 'bg-blue-600 hover:bg-blue-500' :
                      'bg-purple-600 hover:bg-purple-500'
                    }`}
                  >
                    🔊 Read
                  </button>
                  <button
                    onClick={() => onGenerateNote?.(effectiveSelection, undefined, "highYield")}
                    className="px-2 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs"
                  >
                    📝 Note
                  </button>
                </div>
              </div>
            )}

            {/* EXPLORATION MODE */}
            {currentMode === 'exploration' && (
              <div className="space-y-4">
                <h5 className="text-sm font-semibold text-green-700">🔍 Detected Patterns</h5>
                
                {detectedPatterns.length > 0 ? (
                  <div className="space-y-3">
                    {detectedPatterns.map((pattern, idx) => (
                      <div key={idx} className="border border-green-200 rounded-lg p-3 bg-green-50">
                        <div className="flex items-center justify-between mb-2">
                          <h6 className="text-sm font-medium text-green-700">{pattern.name}</h6>
                          <span className="text-xs px-2 py-1 bg-green-200 text-green-800 rounded">
                            {UNIVERSAL_PATTERN_CATEGORIES[pattern.category]}
                          </span>
                        </div>
                        <p className="text-xs text-gray-600 mb-2">{pattern.description}</p>
                        
                        {(pattern as any).confidence && (
                          <div className="text-xs text-green-600 mb-2">
                            Confidence: {Math.round((pattern as any).confidence * 100)}%
                          </div>
                        )}
                        
                        <div className="flex gap-2">
                          <button
                            onClick={() => speakText(`${pattern.name}: ${pattern.description}`)}
                            className="px-2 py-1 bg-green-600 hover:bg-green-500 text-white rounded text-xs"
                          >
                            🔊 Explain
                          </button>
                          <button
                            onClick={() => setCurrentMode('training')}
                            className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs"
                          >
                            🎯 Practice
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <div className="text-4xl mb-2">🔍</div>
                    <p>Select text to detect patterns</p>
                  </div>
                )}
              </div>
            )}

            {/* TRAINING MODE */}
            {currentMode === 'training' && (
              <div className="space-y-4">
                {/* 🧠 Intelligent Learning Analytics Dashboard */}
                {userModel && adaptiveLearningEngine && (
                  <LearningAnalyticsDashboard
                    userModel={userModel}
                    modeRecommendation={modeRecommendation}
                    onModeSwitch={setCurrentMode}
                    onComplexityAdjust={(level) => {
                      setAdaptiveComplexityLevel(level);
                      // Update user model complexity level
                      adaptiveLearningEngine.recordEvent({
                        timestamp: Date.now(),
                        action: 'mode_switched',
                        contextData: {
                          contentType: 'pdf',
                          domain: 'general',
                          difficulty: level,
                          pageNumber: currentPage,
                          thoughtUnitIndex: currentThoughtUnit
                        },
                        metadata: {
                          complexityAdjustment: level,
                          previousLevel: adaptiveComplexityLevel
                        }
                      });
                    }}
                  />
                )}

                {trainingState.step === 'selection' && (
                  <div className="text-center py-8">
                    <div className="text-4xl mb-4">🎯</div>
                    <h5 className="text-lg font-semibold text-blue-700 mb-2">Intelligent Training Mode</h5>
                    <p className="text-gray-600">Select text from the PDF to start adaptive pattern training</p>
                    {userModel && userModel.strugglingPatterns.length > 0 && (
                      <p className="text-xs text-blue-600 mt-2">
                        Focus areas: {userModel.strugglingPatterns.slice(0, 2).join(", ")}
                      </p>
                    )}
                  </div>
                )}

                {trainingState.step === 'pattern-choice' && detectedPatterns.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h5 className="text-sm font-semibold text-blue-700">
                        {intelligentPatternSuggestions.length > 0 ? '🎯 Intelligent Pattern Suggestions' : 'Choose a Pattern to Practice'}
                      </h5>
                      {userModel && (
                        <div className="text-xs text-blue-600">
                          Complexity: {adaptiveComplexityLevel}/10
                        </div>
                      )}
                    </div>
                    
                    <div className="space-y-2">
                      {(intelligentPatternSuggestions.length > 0 ? intelligentPatternSuggestions : detectedPatterns.slice(0, 3)).map((pattern, idx) => {
                        const isIntelligentSuggestion = intelligentPatternSuggestions.includes(pattern);
                        const prediction = adaptiveLearningEngine?.predictPatternSuccess(pattern.id, {});
                        
                        return (
                          <button
                            key={idx}
                            onClick={() => handlePatternSelect(pattern)}
                            className={`w-full text-left p-3 border rounded-lg hover:bg-blue-50 ${
                              isIntelligentSuggestion 
                                ? 'border-blue-400 bg-blue-50/50 shadow-sm' 
                                : 'border-blue-200'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="font-medium text-blue-700 flex items-center gap-2">
                                {isIntelligentSuggestion && <span className="text-xs">🎯</span>}
                                {pattern.name}
                              </div>
                              {prediction && (
                                <div className="text-xs text-blue-600">
                                  {Math.round(prediction.predictedSuccessRate * 100)}% success
                                </div>
                              )}
                            </div>
                            <div className="text-xs text-gray-600">{pattern.description}</div>
                            {isIntelligentSuggestion && (
                              <div className="text-xs text-blue-500 mt-1">
                                ⚡ Recommended for your learning level
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {trainingState.step === 'rules' && trainingState.selectedPattern && (
                  <div>
                    <h5 className="text-sm font-semibold text-blue-700 mb-3">Pattern Rules</h5>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                      <h6 className="font-semibold text-blue-800 mb-2">{trainingState.selectedPattern.name}</h6>
                      <p className="text-sm text-gray-700 mb-3">{trainingState.selectedPattern.description}</p>
                      
                      <div className="space-y-2 mb-3">
                        {trainingState.selectedPattern.rules.map((rule, idx) => (
                          <div key={idx} className="flex items-start gap-2">
                            <div className="w-5 h-5 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs">
                              {idx + 1}
                            </div>
                            <div className="flex-1">
                              <div className="font-medium text-blue-700 text-sm">{rule.key}</div>
                              <div className="text-xs text-gray-600">{rule.description}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    <button
                      onClick={handleStartApplication}
                      className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded"
                    >
                      Start Application
                    </button>
                  </div>
                )}

                {trainingState.step === 'application' && (
                  <div>
                    <h5 className="text-sm font-semibold text-blue-700 mb-3">Apply the Pattern</h5>
                    <textarea
                      value={trainingState.userResponse}
                      onChange={(e) => setTrainingState(prev => ({ ...prev, userResponse: e.target.value }))}
                      placeholder="Apply the pattern rules to your selected text. Explain your reasoning..."
                      className="w-full h-32 p-3 border border-blue-300 rounded-lg resize-none"
                    />
                    
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={handleSubmitResponse}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded"
                        disabled={!trainingState.userResponse.trim()}
                      >
                        Submit Response
                      </button>
                      <button
                        onClick={resetTraining}
                        className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded"
                      >
                        Reset
                      </button>
                    </div>
                  </div>
                )}

                {trainingState.step === 'feedback' && trainingState.selectedPattern && (
                  <div>
                    <h5 className="text-sm font-semibold text-blue-700 mb-3">Self-Assessment</h5>
                    
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4">
                      <h6 className="font-semibold text-gray-700 mb-2">Your Response:</h6>
                      <p className="text-sm text-gray-700 mb-4">{trainingState.userResponse}</p>
                      
                      <h6 className="font-semibold text-green-700 mb-2">Pattern Examples:</h6>
                      <ul className="list-disc list-inside space-y-1 text-sm text-gray-700 mb-4">
                        {trainingState.selectedPattern.examples.map((example, idx) => (
                          <li key={idx}>{example}</li>
                        ))}
                      </ul>
                      
                      <h6 className="font-semibold text-red-700 mb-2">Common Mistakes:</h6>
                      <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
                        {trainingState.selectedPattern.commonMistakes.map((mistake, idx) => (
                          <li key={idx}>{mistake}</li>
                        ))}
                      </ul>
                    </div>
                    
                    <p className="text-sm text-gray-600 mb-4">How did you do?</p>
                    
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSelfAssessment(true)}
                        className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded"
                      >
                        ✅ I Got It Right
                      </button>
                      <button
                        onClick={() => handleSelfAssessment(false)}
                        className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded"
                      >
                        ❌ Need More Practice
                      </button>
                    </div>
                  </div>
                )}

                {trainingState.step === 'assessment' && (
                  <div className={`text-center py-8 ${trainingState.isCorrect ? 'text-green-700' : 'text-red-700'}`}>
                    <div className="text-4xl mb-4">{trainingState.isCorrect ? '🎉' : '💪'}</div>
                    <h6 className="text-lg font-semibold mb-2">
                      {trainingState.isCorrect ? 'Great Job!' : 'Keep Practicing!'}
                    </h6>
                    <p className="text-sm mb-4">
                      {trainingState.isCorrect 
                        ? 'You\'re mastering pattern recognition!'
                        : 'Pattern recognition improves with practice.'
                      }
                    </p>
                    <button
                      onClick={resetTraining}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded"
                    >
                      Try Another Pattern
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* BUTLER MODE */}
            {currentMode === 'butler' && (
              <div className="space-y-4">
                <h5 className="text-sm font-semibold text-purple-700">🧠 Butler Analysis</h5>
                
                {butlerAnalysis ? (
                  <div className="space-y-4">
                    {/* Butler Highlights */}
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <h6 className="font-semibold text-amber-700 mb-2">Thought Units Detected</h6>
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <div className="bg-white rounded p-2 text-center">
                          <div className="text-xs text-gray-600">Main Ideas</div>
                          <div className="text-sm font-bold text-amber-600">
                            {butlerHighlights.filter(h => h.importance === 'gold').length}
                          </div>
                        </div>
                        <div className="bg-white rounded p-2 text-center">
                          <div className="text-xs text-gray-600">Supporting</div>
                          <div className="text-sm font-bold text-amber-600">
                            {butlerHighlights.filter(h => h.importance === 'blue').length}
                          </div>
                        </div>
                      </div>
                      <div className="text-xs text-gray-600">
                        Comprehension Score: {Math.round(butlerAnalysis.comprehensionScore * 100)}%
                      </div>
                    </div>

                    {/* Butler Metaphors */}
                    {(() => {
                      const metaphors = generateAdvancedButlerMetaphors(effectiveSelection, detectedPatterns);
                      return metaphors.length > 0 ? (
                        <div className="bg-teal-50 border border-teal-200 rounded-lg p-3">
                          <h6 className="font-semibold text-teal-700 mb-2">🎭 Butler Metaphors</h6>
                          <div className="space-y-2">
                            {metaphors.map((metaphor, idx) => (
                              <div key={idx} className="bg-white rounded p-2">
                                <div className="flex items-center gap-2 mb-1">
                                  <span>{metaphor.visualCue}</span>
                                  <span className="text-xs font-semibold text-teal-600">{metaphor.concept}</span>
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
                        </div>
                      ) : null;
                    })()}

                    {/* Enhanced Analysis */}
                    {comprehensiveAnalysis && (
                      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                        <h6 className="font-semibold text-emerald-700 mb-2">⚡ Enhanced Analysis</h6>
                        <div className="grid grid-cols-2 gap-2 mb-3">
                          <div className="bg-white rounded p-2 text-center">
                            <div className="text-xs text-gray-600">Quality Score</div>
                            <div className="text-sm font-bold text-emerald-600">
                              {Math.round(comprehensiveAnalysis.qualityMetrics.overallAccuracy * 100)}%
                            </div>
                          </div>
                          <div className="bg-white rounded p-2 text-center">
                            <div className="text-xs text-gray-600">Thought Units</div>
                            <div className="text-sm font-bold text-emerald-600">
                              {comprehensiveAnalysis.thoughtUnits.length}
                            </div>
                          </div>
                        </div>
                        
                        {comprehensiveAnalysis.enhancedMainIdeaAnalysis.primaryIdea && (
                          <div className="bg-white rounded p-2 text-xs">
                            <div className="font-medium text-emerald-700">Primary Idea:</div>
                            <div className="text-gray-700">{comprehensiveAnalysis.enhancedMainIdeaAnalysis.primaryIdea}</div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <div className="text-4xl mb-2">🧠</div>
                    <p>Select text for Butler analysis</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

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
    </ErrorBoundary>
  );
}
