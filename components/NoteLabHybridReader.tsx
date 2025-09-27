"use client";

import React, { useEffect, useState, useRef } from "react";
import type { ThoughtUnit as BaseThoughtUnit, ReadingStats } from "@/types/reading";
import { Document, Page } from "react-pdf";
import type { TOCEntry } from "@/lib/tocParser";
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

interface NoteLabHybridReaderProps {
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

function unitToText(u: HRUnit): string {
  if (u == null) return "";
  if (typeof u === "string") return u;
  if (Array.isArray(u)) return u.join(" ");
  const t = (u as any).text;
  return typeof t === "string" ? t : JSON.stringify(u);
}

// Note-specific Butler analysis
interface NoteButlerAnalysis extends ButlerAnalysisResult {
  noteWorthyContent: string[];
  keyTerms: string[];
  summaryPoints: string[];
  studyQuestions: string[];
  memoryAids: string[];
  visualConcepts: string[];
}

// Enhanced note-taking features for DAT/medical content
function analyzeForNoteWorthy(text: string): {
  keyTerms: string[];
  definitions: Array<{term: string, definition: string}>;
  processes: string[];
  relationships: string[];
  examples: string[];
  warnings: string[];
} {
  const lowerText = text.toLowerCase();
  
  // Key term extraction
  const keyTerms: string[] = [];
  const medicalTerms = text.match(/\b[A-Z][a-z]+(?:osis|itis|emia|uria|pathy|trophy|plasia|genesis|lysis|ectomy|otomy|ostomy|gram|graph|scope|meter)\b/g) || [];
  const chemicalTerms = text.match(/\b(?:acid|base|ion|molecule|compound|reaction|catalyst|enzyme|hormone|protein|amino|nucleic|carbohydrate|lipid|steroid)\b/gi) || [];
  const biologicalTerms = text.match(/\b(?:cell|tissue|organ|system|metabolism|homeostasis|evolution|genetics|DNA|RNA|chromosome|gene|allele|protein|enzyme)\b/gi) || [];
  keyTerms.push(...medicalTerms, ...chemicalTerms, ...biologicalTerms);

  // Definition extraction
  const definitions: Array<{term: string, definition: string}> = [];
  const definitionPattern = /\b(\w+(?:\s+\w+){0,2})\s+(is|are|means|refers to|defined as)\s+([^.!?]+)/gi;
  let match;
  while ((match = definitionPattern.exec(text)) !== null && definitions.length < 5) {
    definitions.push({
      term: match[1].trim(),
      definition: match[3].trim()
    });
  }

  // Process extraction
  const processes = text.match(/(?:process|mechanism|pathway|cycle|reaction|synthesis|breakdown|metabolism|transport|signaling)(?:\s+of\s+\w+)?/gi) || [];
  
  // Relationship extraction
  const relationships = text.match(/(?:causes?|leads? to|results? in|affects?|influences?|controls?|regulates?|inhibits?|activates?)(?:\s+\w+){1,3}/gi) || [];
  
  // Example extraction
  const examples = text.match(/(?:for example|such as|including|like|specifically|namely|e\.g\.)\s+([^.!?]+)/gi) || [];
  
  // Warning/caution extraction
  const warnings = text.match(/(?:warning|caution|note|important|critical|dangerous|avoid|do not|never|always)(?:\s+\w+){1,5}/gi) || [];

  return {
    keyTerms: [...new Set(keyTerms)].slice(0, 10),
    definitions,
    processes: [...new Set(processes)].slice(0, 5),
    relationships: [...new Set(relationships)].slice(0, 5),
    examples: [...new Set(examples)].slice(0, 3),
    warnings: [...new Set(warnings)].slice(0, 3)
  };
}

// Generate study questions from content
function generateStudyQuestions(text: string): string[] {
  const questions: string[] = [];
  
  // Extract key concepts for questions
  const concepts = text.match(/\b(?:concept|principle|theory|law|rule|method|process|mechanism|system|structure|function)\b/gi) || [];
  const entities = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?/g) || [];
  
  // Generate different types of questions
  if (concepts.length > 0) {
    questions.push(`What is the main ${concepts[0]?.toLowerCase()} discussed in this section?`);
    questions.push(`How does ${concepts[0]?.toLowerCase()} relate to other concepts?`);
  }
  
  if (entities.length > 0) {
    questions.push(`What is the significance of ${entities[0]}?`);
    questions.push(`What would happen if ${entities[0]} was altered or removed?`);
  }
  
  // Add general comprehension questions
  questions.push("What are the key takeaways from this content?");
  questions.push("How can this information be applied in practice?");
  questions.push("What connections can you make to previously learned material?");
  
  return questions.slice(0, 5);
}

export default function NoteLabHybridReader({
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
}: NoteLabHybridReaderProps) {
  const [selectionText, setSelectionText] = useState("");
  const [showNotePanel, setShowNotePanel] = useState(true);
  
  // PDF interaction state
  const [pdfScale, setPdfScale] = useState(1.3);
  
  // Butler System State
  const [butlerAnalysis, setButlerAnalysis] = useState<NoteButlerAnalysis | null>(null);
  const [butlerHighlights, setButlerHighlights] = useState<ButlerHighlight[]>([]);
  const [speechMode, setSpeechMode] = useState<SpeechMode>('smart');
  const [butlerSpeechOptions, setButlerSpeechOptions] = useState<ButlerSpeechOptions>(DEFAULT_BUTLER_SPEECH);
  
  // Note-Taking State
  const [quickNotes, setQuickNotes] = useState<Record<number, string>>({});
  const [studyLevel, setStudyLevel] = useState<'basic' | 'intermediate' | 'advanced'>('intermediate');
  const [noteTemplate, setNoteTemplate] = useState<'outline' | 'cornell' | 'mind-map' | 'flashcard'>('outline');
  const [currentNoteText, setCurrentNoteText] = useState("");
  
  // Voice and speech
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);
  
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

  // Enhanced Note-Aware Butler Analysis with performance optimizations and error boundaries
  useEffect(() => {
    if (thoughtUnits.length > 0 && currentThoughtUnit >= 1 && currentThoughtUnit <= thoughtUnits.length) {
      const currentUnitText = unitToText(thoughtUnits[currentThoughtUnit - 1]);
      
      if (currentUnitText && currentUnitText.length > 50) {
        console.log('📝 NoteLab Butler: Analyzing unit text...');
        
        // Debounce analysis to prevent excessive processing
        const timeoutId = setTimeout(() => {
          const performNoteAnalysis = async () => {
            try {
              // Add loading state
              setButlerAnalysis(null);
              setButlerHighlights([]);
              
              // Standard Butler analysis with timeout
              const analysisPromise = analyzeTextWithButler(currentUnitText);
              const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Analysis timeout')), 10000)
              );
              
              const baseAnalysis = await Promise.race([analysisPromise, timeoutPromise]) as any;
              
              // Enhanced note-worthy content analysis
              const noteAnalysis = analyzeForNoteWorthy(currentUnitText);
              const studyQuestions = generateStudyQuestions(currentUnitText);
              
              // Create note-enhanced analysis
              const noteButlerAnalysis: NoteButlerAnalysis = {
                ...baseAnalysis,
                noteWorthyContent: noteAnalysis.keyTerms.slice(0, 10), // Limit to prevent overload
                keyTerms: noteAnalysis.keyTerms.slice(0, 8),
                summaryPoints: noteAnalysis.definitions.slice(0, 5).map(d => `${d.term}: ${d.definition}`),
                studyQuestions: studyQuestions.slice(0, 4),
                memoryAids: noteAnalysis.examples.slice(0, 3).map(ex => ex.replace(/^.+?:\s*/, '')),
                visualConcepts: noteAnalysis.processes.slice(0, 4)
              };
              
              setButlerAnalysis(noteButlerAnalysis);
              setButlerHighlights(noteButlerAnalysis.highlights);
              
              console.log(`📝 NoteLab Butler analysis complete: ${noteButlerAnalysis.highlights.length} highlights, ${noteAnalysis.keyTerms.length} key terms`);
            } catch (error) {
              console.error('NoteLab Butler analysis error:', error);
              // Graceful fallback - create basic analysis
              const fallbackAnalysis: NoteButlerAnalysis = {
                comprehensionScore: 0.5,
                highlights: [],
                mainIdeas: [],
                supportingConcepts: [],
                definitions: [],
                processes: [],
                relationships: [],
                fluffContent: [],
                cleanedText: currentUnitText,
                readingTime: Math.ceil(currentUnitText.length / 200),
                keyTerms: [],
                noteWorthyContent: [],
                summaryPoints: [currentUnitText.slice(0, 150) + '...'],
                studyQuestions: ['What is the main point of this section?'],
                memoryAids: ['Review this content again'],
                visualConcepts: []
              };
              setButlerAnalysis(fallbackAnalysis);
              setButlerHighlights([]);
            }
          };
          
          performNoteAnalysis();
        }, 300); // 300ms debounce
        
        return () => clearTimeout(timeoutId);
      }
    }
  }, [thoughtUnits, currentThoughtUnit]);

  // Memory management and cleanup
  useEffect(() => {
    return () => {
      if (speechRef.current) {
        speechSynthesis.cancel();
      }
      // Clear any analysis timeouts
    };
  }, []);

  // Enhanced text selection handler
  const handleMouseUp = (e: React.MouseEvent) => {
    const selection = window.getSelection()?.toString().trim() || "";
    setSelectionText(selection);
    
    if (selection) {
      onTextSelect?.(selection);
      onWordClick(selection);
      setCurrentNoteText(selection);
    }
    
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

  // Quick note creation functions
  const createQuickNote = (text: string, template: string) => {
    const timestamp = new Date().toLocaleString();
    const pageRef = `Page ${currentPage}`;
    
    switch (template) {
      case 'cornell':
        return `# Cornell Notes - ${pageRef}\n\n**Date:** ${timestamp}\n\n## Notes\n${text}\n\n## Cues\n- \n\n## Summary\n- \n\n---\n`;
      case 'outline':
        return `# Outline Notes - ${pageRef}\n\n**Date:** ${timestamp}\n\nI. Main Topic\n   A. ${text}\n      1. Supporting detail\n      2. \n   B. \n\nII. \n\n---\n`;
      case 'mind-map':
        return `# Mind Map - ${pageRef}\n\n**Date:** ${timestamp}\n\n**Central Concept:** ${text}\n\n**Connected Ideas:**\n- Branch 1: \n- Branch 2: \n- Branch 3: \n\n**Relationships:**\n- Connection A → B: \n- Connection B → C: \n\n---\n`;
      case 'flashcard':
        return `# Flashcard - ${pageRef}\n\n**Date:** ${timestamp}\n\n**Front:** What is ${text}?\n\n**Back:** \n\n**Hint:** \n\n**Tags:** #${bookId} #page${currentPage}\n\n---\n`;
      default:
        return `# Quick Note - ${pageRef}\n\n**Date:** ${timestamp}\n\n${text}\n\n**Key Points:**\n- \n\n**Questions:**\n- \n\n---\n`;
    }
  };

  const effectiveSelection = (externalSelectionText?.trim() || selectionText).trim();

  return (
    <div className="h-full flex bg-gray-50">
      {/* Main PDF View (60% width) */}
      <div className="w-3/5 bg-white border-r border-gray-200">
        {/* NoteLab Butler-Style Header */}
        <div className="flex items-center justify-between p-3 bg-gradient-to-r from-green-50 to-emerald-50 border-b border-green-200">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">📝</span>
              <div>
                <h3 className="text-lg font-bold text-green-800">NoteLab Butler</h3>
                <p className="text-xs text-green-600">Smart note-taking • Study optimization</p>
              </div>
            </div>
            
            {/* Core Navigation */}
            <div className="flex items-center gap-2 bg-white/60 backdrop-blur rounded-lg px-3 py-1">
              <button
                onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                disabled={currentPage <= 1}
                className="px-2 py-1 bg-green-600 hover:bg-green-500 disabled:bg-gray-300 disabled:opacity-50 text-white rounded text-sm"
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
                  className="w-12 text-center text-sm border border-green-300 rounded px-1"
                />
                <span className="text-xs text-gray-600">/{pdfPageCount || '?'}</span>
              </div>
              
              <button
                onClick={() => onPageChange(Math.min(pdfPageCount || 999, currentPage + 1))}
                disabled={currentPage >= (pdfPageCount || 999)}
                className="px-2 py-1 bg-green-600 hover:bg-green-500 disabled:bg-gray-300 disabled:opacity-50 text-white rounded text-sm"
              >
                →
              </button>
            </div>
            
            {/* NoteLab Butler Speech Controls */}
            <div className="flex items-center gap-2 bg-white/60 backdrop-blur rounded-lg px-3 py-1">
              <button
                onClick={() => setSpeechMode(speechMode === 'smart' ? 'full' : 'smart')}
                className={`px-2 py-1 rounded text-xs ${
                  speechMode === 'smart' 
                    ? 'bg-green-600 text-white' 
                    : 'bg-gray-200 text-gray-700'
                }`}
                title="Toggle between smart and full speech modes"
              >
                {speechMode === 'smart' ? '📝 Notes' : '📖 Full'}
              </button>
              
              <button
                onClick={() => {
                  if (isSpeaking) {
                    stopSpeaking();
                  } else if (effectiveSelection) {
                    speakText(effectiveSelection);
                  } else if (thoughtUnits[currentThoughtUnit - 1]) {
                    const currentText = unitToText(thoughtUnits[currentThoughtUnit - 1]);
                    speakText(currentText.slice(0, 200));
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
                onClick={() => setShowNotePanel(!showNotePanel)}
                className={`px-2 py-1 rounded text-xs ${
                  showNotePanel
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                }`}
              >
                📊 Notes
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

        {/* PDF Content with Loading States */}
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
                file={pdfUrl}
                loading={
                  <div className="flex flex-col items-center justify-center p-8">
                    <div className="animate-spin text-4xl mb-4">📝</div>
                    <p className="text-gray-600">Loading PDF for visual note-taking...</p>
                  </div>
                }
                error={
                  <div className="flex flex-col items-center justify-center p-8">
                    <div className="text-4xl mb-4 text-red-500">❌</div>
                    <p className="text-red-600 font-semibold">Failed to load PDF</p>
                    <p className="text-gray-600 text-sm">Please try uploading the file again</p>
                  </div>
                }
                onLoadSuccess={(pdf) => {
                  console.log('✅ NoteLab PDF loaded successfully:', pdf.numPages, 'pages');
                }}
                onLoadError={(error) => {
                  console.error('❌ NoteLab PDF loading error:', error);
                }}
              >
                <Page 
                  pageNumber={currentPage} 
                  scale={pdfScale}
                  renderTextLayer={true}
                  renderAnnotationLayer={true}
                  loading={
                    <div className="flex items-center justify-center p-12">
                      <div className="animate-pulse text-2xl">📝 Loading page...</div>
                    </div>
                  }
                  error={
                    <div className="flex items-center justify-center p-12">
                      <div className="text-red-500">❌ Failed to load page {currentPage}</div>
                    </div>
                  }
                />
              </Document>
            </div>
          </div>
        </div>
      </div>

      {/* NoteLab Analysis Panel (40% width) */}
      {showNotePanel && (
        <div className="w-2/5 bg-white flex flex-col">
          {/* Panel Header */}
          <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-green-50 to-emerald-50">
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-semibold text-green-700">📝 Smart Note-Taking</h4>
              <button
                onClick={() => setShowNotePanel(false)}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-gray-600 mt-1">
              Unit {currentThoughtUnit} of {thoughtUnits.length} • {studyLevel} level
            </p>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Current Selection */}
            {effectiveSelection && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <h5 className="text-sm font-semibold text-green-700 mb-2">📝 Selected Content</h5>
                <p className="text-sm text-gray-700 italic mb-3">
                  "{effectiveSelection.slice(0, 100)}{effectiveSelection.length > 100 ? '...' : ''}"
                </p>
                
                {/* Note Template Selection */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <button
                    onClick={() => {
                      const note = createQuickNote(effectiveSelection, 'outline');
                      onGenerateNote?.(note, undefined, "highYield");
                    }}
                    className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs"
                  >
                    📋 Outline
                  </button>
                  <button
                    onClick={() => {
                      const note = createQuickNote(effectiveSelection, 'cornell');
                      onGenerateNote?.(note, undefined, "highYield");
                    }}
                    className="px-2 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded text-xs"
                  >
                    📓 Cornell
                  </button>
                  <button
                    onClick={() => {
                      const note = createQuickNote(effectiveSelection, 'mind-map');
                      onGenerateNote?.(note, undefined, "sketch");
                    }}
                    className="px-2 py-1 bg-orange-600 hover:bg-orange-500 text-white rounded text-xs"
                  >
                    🗺️ Mind Map
                  </button>
                  <button
                    onClick={() => {
                      const note = createQuickNote(effectiveSelection, 'flashcard');
                      onGenerateNote?.(note, undefined, "highYield");
                    }}
                    className="px-2 py-1 bg-pink-600 hover:bg-pink-500 text-white rounded text-xs"
                  >
                    💳 Flashcard
                  </button>
                </div>
                
                <div className="flex gap-2">
                  <button
                    onClick={() => speakText(effectiveSelection)}
                    className="px-2 py-1 bg-green-600 hover:bg-green-500 text-white rounded text-xs"
                  >
                    🔊 Read
                  </button>
                </div>
              </div>
            )}

            {/* Study Level Selection */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <h5 className="text-sm font-semibold text-gray-700 mb-2">🎯 Study Level</h5>
              <div className="flex gap-2">
                {(['basic', 'intermediate', 'advanced'] as const).map(level => (
                  <button
                    key={level}
                    onClick={() => setStudyLevel(level)}
                    className={`px-2 py-1 rounded text-xs ${
                      studyLevel === level
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    {level.charAt(0).toUpperCase() + level.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Butler Analysis Results */}
            {butlerAnalysis && (
              <div className="space-y-3">
                <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-lg p-3">
                  <h5 className="text-sm font-semibold text-amber-700 mb-2">🧠 Butler Analysis</h5>
                  
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="bg-white rounded p-2 text-center">
                      <div className="text-xs text-gray-600">Key Terms</div>
                      <div className="text-sm font-bold text-amber-600">
                        {butlerAnalysis.keyTerms.length}
                      </div>
                    </div>
                    <div className="bg-white rounded p-2 text-center">
                      <div className="text-xs text-gray-600">Study Points</div>
                      <div className="text-sm font-bold text-amber-600">
                        {butlerAnalysis.summaryPoints.length}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Key Terms for Note-Taking */}
                {butlerAnalysis.keyTerms.length > 0 && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <h6 className="text-sm font-semibold text-blue-700 mb-2">🔑 Key Terms</h6>
                    <div className="flex flex-wrap gap-1 mb-2">
                      {butlerAnalysis.keyTerms.map((term, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-1 bg-blue-200 text-blue-800 rounded text-xs cursor-pointer hover:bg-blue-300"
                          onClick={() => {
                            const termNote = createQuickNote(term, 'flashcard');
                            onGenerateNote?.(termNote, undefined, "highYield");
                          }}
                        >
                          {term}
                        </span>
                      ))}
                    </div>
                    <button
                      onClick={() => {
                        const allTerms = butlerAnalysis.keyTerms.join(', ');
                        const termNote = createQuickNote(`Key terms: ${allTerms}`, 'outline');
                        onGenerateNote?.(termNote, undefined, "highYield");
                      }}
                      className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded"
                    >
                      📝 Create Terms Note
                    </button>
                  </div>
                )}

                {/* Summary Points */}
                {butlerAnalysis.summaryPoints.length > 0 && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <h6 className="text-sm font-semibold text-green-700 mb-2">📋 Summary Points</h6>
                    <ul className="text-xs text-gray-700 space-y-1 mb-2">
                      {butlerAnalysis.summaryPoints.slice(0, 3).map((point, idx) => (
                        <li key={idx} className="flex items-start gap-1">
                          <span className="text-green-500">•</span>
                          <span>{point}</span>
                        </li>
                      ))}
                    </ul>
                    <button
                      onClick={() => {
                        const summaryNote = `# Summary Points - Page ${currentPage}\n\n${butlerAnalysis.summaryPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}`;
                        onGenerateNote?.(summaryNote, undefined, "highYield");
                      }}
                      className="text-xs px-2 py-1 bg-green-600 hover:bg-green-500 text-white rounded"
                    >
                      📝 Create Summary
                    </button>
                  </div>
                )}

                {/* Study Questions */}
                {butlerAnalysis.studyQuestions.length > 0 && (
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                    <h6 className="text-sm font-semibold text-purple-700 mb-2">🤔 Study Questions</h6>
                    <ul className="text-xs text-gray-700 space-y-1 mb-2">
                      {butlerAnalysis.studyQuestions.slice(0, 3).map((question, idx) => (
                        <li key={idx} className="flex items-start gap-1">
                          <span className="text-purple-500">Q{idx + 1}:</span>
                          <span>{question}</span>
                        </li>
                      ))}
                    </ul>
                    <button
                      onClick={() => {
                        const questionNote = `# Study Questions - Page ${currentPage}\n\n${butlerAnalysis.studyQuestions.map((q, i) => `**Q${i + 1}:** ${q}\n\n**Answer:** \n\n`).join('')}`;
                        onGenerateNote?.(questionNote, undefined, "highYield");
                      }}
                      className="text-xs px-2 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded"
                    >
                      📝 Create Q&A Note
                    </button>
                  </div>
                )}

                {/* Memory Aids */}
                {butlerAnalysis.memoryAids.length > 0 && (
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                    <h6 className="text-sm font-semibold text-orange-700 mb-2">🧠 Memory Aids</h6>
                    <ul className="text-xs text-gray-700 space-y-1 mb-2">
                      {butlerAnalysis.memoryAids.slice(0, 3).map((aid, idx) => (
                        <li key={idx} className="flex items-start gap-1">
                          <span className="text-orange-500">•</span>
                          <span>{aid}</span>
                        </li>
                      ))}
                    </ul>
                    <button
                      onClick={() => {
                        const memoryNote = `# Memory Aids - Page ${currentPage}\n\n${butlerAnalysis.memoryAids.map((aid, i) => `${i + 1}. ${aid}`).join('\n')}`;
                        onGenerateNote?.(memoryNote, undefined, "sketch");
                      }}
                      className="text-xs px-2 py-1 bg-orange-600 hover:bg-orange-500 text-white rounded"
                    >
                      🎨 Create Memory Note
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Page Notes */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <h5 className="text-sm font-semibold text-gray-700 mb-2">📄 Quick Page Notes</h5>
              <textarea
                value={quickNotes[currentPage] || ""}
                onChange={(e) => setQuickNotes(prev => ({
                  ...prev,
                  [currentPage]: e.target.value
                }))}
                placeholder="Add quick notes for this page..."
                className="w-full h-20 text-xs border border-gray-300 rounded p-2 resize-none"
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => {
                    const pageNote = quickNotes[currentPage];
                    if (pageNote) {
                      const formattedNote = createQuickNote(pageNote, 'outline');
                      onGenerateNote?.(formattedNote, undefined, "highYield");
                    }
                  }}
                  className="text-xs px-2 py-1 bg-gray-600 hover:bg-gray-500 text-white rounded"
                  disabled={!quickNotes[currentPage]?.trim()}
                >
                  📝 Format Note
                </button>
                <button
                  onClick={() => {
                    const pageNote = quickNotes[currentPage];
                    if (pageNote) {
                      speakText(pageNote);
                    }
                  }}
                  className="text-xs px-2 py-1 bg-green-600 hover:bg-green-500 text-white rounded"
                  disabled={!quickNotes[currentPage]?.trim()}
                >
                  🔊 Read Notes
                </button>
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

          {/* Footer */}
          <div className="p-3 border-t border-gray-200 bg-gray-50">
            <div className="text-xs text-gray-500 space-y-1">
              <div><kbd>Space</kbd> - Read selection</div>
              <div><kbd>N</kbd> - Quick note</div>
              <div><kbd>S</kbd> - Toggle panel</div>
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
