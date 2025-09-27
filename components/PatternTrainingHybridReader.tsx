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
// Pattern Training Imports
import type { Pattern } from "@/types/patterns";

type HRUnit = BaseThoughtUnit | string | string[] | { text?: string };

interface PatternTrainingHybridReaderProps {
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

// Pattern-specific Butler analysis
interface PatternButlerAnalysis extends ButlerAnalysisResult {
  detectedPatterns: Pattern[];
  patternConfidence: number;
  organicChemistryHints: string[];
  generalChemistryHints: string[];
  biologyHints: string[];
  readingComprehensionHints: string[];
}

// Enhanced pattern detection for DAT content
function detectDATPatterns(text: string): Pattern[] {
  const patterns: Pattern[] = [];
  const lowerText = text.toLowerCase();

  // Organic Chemistry Patterns
  if (/\b(carbonyl|aldehyde|ketone|carboxylic|ester|amide)\b/.test(lowerText)) {
    patterns.push({
      id: 'cardio-functional-groups',
      name: 'CARDIO Functional Groups',
      category: 'organic-chemistry',
      description: 'Carbonyl-containing functional groups pattern',
      rules: [
        { key: 'C=O', description: 'Identify carbonyl carbon' },
        { key: 'Reactivity', description: 'Understand reactivity patterns' },
        { key: 'CARDIO', description: 'Apply CARDIO mnemonic' }
      ],
      examples: ['Aldehydes (-CHO)', 'Ketones (C=O)', 'Carboxylic acids (-COOH)'],
      commonMistakes: ['Confusing aldehyde vs ketone', 'Missing carbonyl reactivity'],
      tags: ['functional-groups', 'carbonyl', 'organic-chemistry']
    });
  }

  if (/\b(sn1|sn2|e1|e2|nucleophilic|electrophilic)\b/.test(lowerText)) {
    patterns.push({
      id: 'sn-e-mechanisms',
      name: 'SN/E Reaction Flow',
      category: 'organic-chemistry',
      description: 'Substitution and elimination mechanism patterns',
      rules: [
        { key: 'Substrate', description: 'Substrate structure determines mechanism' },
        { key: 'Nucleophile', description: 'Base/nucleophile strength matters' },
        { key: 'Solvent', description: 'Solvent effects on reaction pathway' }
      ],
      examples: ['SN1: Carbocation intermediate', 'SN2: Backside attack', 'E1: Elimination via carbocation'],
      commonMistakes: ['Confusing SN1 vs SN2', 'Ignoring solvent effects'],
      tags: ['mechanisms', 'substitution', 'elimination']
    });
  }

  // General Chemistry Patterns
  if (/\b(equilibrium|q vs k|keq|kc|kp)\b/.test(lowerText)) {
    patterns.push({
      id: 'q-vs-k-pattern',
      name: 'Q vs K Analysis',
      category: 'general-chemistry',
      description: 'Equilibrium quotient vs equilibrium constant',
      rules: [
        { key: 'Calculate Q', description: 'Use current concentrations' },
        { key: 'Compare', description: 'Compare Q to K value' },
        { key: 'Predict', description: 'Predict reaction direction' }
      ],
      examples: ['Q < K: Forward reaction favored', 'Q > K: Reverse reaction favored', 'Q = K: At equilibrium'],
      commonMistakes: ['Using equilibrium vs current concentrations', 'Forgetting stoichiometric coefficients'],
      tags: ['equilibrium', 'thermodynamics', 'reaction-direction']
    });
  }

  if (/\b(gibbs|free energy|spontaneous|ΔG|enthalpy|entropy)\b/.test(lowerText)) {
    patterns.push({
      id: 'delta-g-signs',
      name: 'ΔG Sign Analysis',
      category: 'general-chemistry',
      description: 'Free energy and spontaneity patterns',
      rules: [
        { key: 'ΔG = ΔH - TΔS', description: 'Free energy equation' },
        { key: 'Temperature', description: 'Temperature effects on spontaneity' },
        { key: 'Signs', description: 'Interpret ΔG sign for spontaneity' }
      ],
      examples: ['ΔG < 0: Spontaneous', 'ΔG > 0: Non-spontaneous', 'ΔG = 0: At equilibrium'],
      commonMistakes: ['Forgetting temperature dependence', 'Confusing sign conventions'],
      tags: ['thermodynamics', 'spontaneity', 'gibbs-energy']
    });
  }

  // Biology Patterns
  if (/\b(organelle|mitochondria|chloroplast|nucleus|ribosome)\b/.test(lowerText)) {
    patterns.push({
      id: 'organelle-functions',
      name: 'Organelle Function Map',
      category: 'biology',
      description: 'Cell organelle structure-function relationships',
      rules: [
        { key: 'Structure', description: 'Structure determines function' },
        { key: 'Compartmentalization', description: 'Benefits of cellular compartments' },
        { key: 'Energy', description: 'Energy flow through cell' }
      ],
      examples: ['Mitochondria: ATP production', 'Chloroplasts: Photosynthesis', 'Ribosomes: Protein synthesis'],
      commonMistakes: ['Confusing organelle functions', 'Missing structure-function relationships'],
      tags: ['cell-biology', 'organelles', 'cellular-functions']
    });
  }

  // Reading Comprehension Patterns
  if (/\b(cause|effect|because|therefore|result|consequence)\b/.test(lowerText)) {
    patterns.push({
      id: 'cause-effect',
      name: 'Cause-Effect Analysis',
      category: 'reading-comprehension',
      description: 'Causal relationship identification pattern',
      rules: [
        { key: 'Signal words', description: 'Identify causal signal words' },
        { key: 'Direction', description: 'Map cause to effect clearly' },
        { key: 'Chain', description: 'Follow causal chains' }
      ],
      examples: ['Signal words: because, since, due to', 'Effect words: therefore, thus, as a result'],
      commonMistakes: ['Reversing cause and effect', 'Missing intermediate steps'],
      tags: ['reading-comprehension', 'logical-reasoning', 'causation']
    });
  }

  return patterns;
}

export default function PatternTrainingHybridReader({
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
}: PatternTrainingHybridReaderProps) {
  const [selectionText, setSelectionText] = useState("");
  const [showPatternPanel, setShowPatternPanel] = useState(true);
  
  // PDF interaction state
  const [pdfScale, setPdfScale] = useState(1.3);
  
  // Butler System State
  const [butlerAnalysis, setButlerAnalysis] = useState<PatternButlerAnalysis | null>(null);
  const [butlerHighlights, setButlerHighlights] = useState<ButlerHighlight[]>([]);
  const [speechMode, setSpeechMode] = useState<SpeechMode>('smart');
  const [butlerSpeechOptions, setButlerSpeechOptions] = useState<ButlerSpeechOptions>(DEFAULT_BUTLER_SPEECH);
  
  // Pattern Training State
  const [detectedPatterns, setDetectedPatterns] = useState<Pattern[]>([]);
  const [selectedPattern, setSelectedPattern] = useState<Pattern | null>(null);
  const [patternMastery, setPatternMastery] = useState<Record<string, number>>({});
  
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

  // Enhanced Pattern-Aware Butler Analysis with Performance Optimizations
  useEffect(() => {
    if (thoughtUnits.length > 0 && currentThoughtUnit >= 1 && currentThoughtUnit <= thoughtUnits.length) {
      const currentUnitText = unitToText(thoughtUnits[currentThoughtUnit - 1]);
      
      if (currentUnitText && currentUnitText.length > 50) {
        console.log('🎯 Pattern Training Butler: Analyzing unit text...');
        
        // Debounce analysis to prevent excessive processing
        const timeoutId = setTimeout(() => {
          const performPatternAnalysis = async () => {
            try {
              // Standard Butler analysis
              const baseAnalysis = await analyzeTextWithButler(currentUnitText);
              
              // Enhanced pattern detection for DAT content
              const datPatterns = detectDATPatterns(currentUnitText);
              setDetectedPatterns(datPatterns);
              
              // Create pattern-enhanced analysis
              const patternAnalysis: PatternButlerAnalysis = {
                ...baseAnalysis,
                detectedPatterns: datPatterns,
                patternConfidence: datPatterns.length > 0 ? 0.8 : 0.3,
                organicChemistryHints: datPatterns
                  .filter(p => p.category === 'organic-chemistry')
                  .map(p => p.description),
                generalChemistryHints: datPatterns
                  .filter(p => p.category === 'general-chemistry')
                  .map(p => p.description),
                biologyHints: datPatterns
                  .filter(p => p.category === 'biology')
                  .map(p => p.description),
                readingComprehensionHints: datPatterns
                  .filter(p => p.category === 'reading-comprehension')
                  .map(p => p.description),
              };
              
              setButlerAnalysis(patternAnalysis);
              setButlerHighlights(patternAnalysis.highlights);
              
              console.log(`🎯 Pattern Training Butler analysis complete: ${patternAnalysis.highlights.length} highlights, ${datPatterns.length} patterns detected`);
            } catch (error) {
              console.error('Pattern Training Butler analysis error:', error);
              // Graceful fallback - don't crash the app
              setButlerAnalysis(null);
              setDetectedPatterns([]);
            }
          };
          
          performPatternAnalysis();
        }, 300); // Debounce by 300ms
        
        return () => clearTimeout(timeoutId);
      }
    }
  }, [thoughtUnits, currentThoughtUnit]);

  // Cleanup effect for memory management
  useEffect(() => {
    return () => {
      if (speechRef.current) {
        speechSynthesis.cancel();
      }
      // Clear any timeouts or intervals if needed
    };
  }, []);

  // Enhanced text selection handler
  const handleMouseUp = (e: React.MouseEvent) => {
    const selection = window.getSelection()?.toString().trim() || "";
    setSelectionText(selection);
    
    if (selection) {
      onTextSelect?.(selection);
      onWordClick(selection);
      
      // Analyze selection for patterns
      const selectionPatterns = detectDATPatterns(selection);
      if (selectionPatterns.length > 0) {
        setDetectedPatterns(prev => [...prev, ...selectionPatterns]);
      }
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

  const effectiveSelection = (externalSelectionText?.trim() || selectionText).trim();

  return (
    <div className="h-full flex bg-gray-50">
      {/* Main PDF View (60% width) */}
      <div className="w-3/5 bg-white border-r border-gray-200">
        {/* Pattern Training Butler-Style Header */}
        <div className="flex items-center justify-between p-3 bg-gradient-to-r from-blue-50 to-purple-50 border-b border-blue-200">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🎯</span>
              <div>
                <h3 className="text-lg font-bold text-blue-800">Pattern Analysis Butler</h3>
                <p className="text-xs text-blue-600">Universal pattern recognition • Smart speech</p>
              </div>
            </div>
            
            {/* Core Navigation */}
            <div className="flex items-center gap-2 bg-white/60 backdrop-blur rounded-lg px-3 py-1">
              <button
                onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                disabled={currentPage <= 1}
                className="px-2 py-1 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-300 disabled:opacity-50 text-white rounded text-sm"
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
                  className="w-12 text-center text-sm border border-blue-300 rounded px-1"
                />
                <span className="text-xs text-gray-600">/{pdfPageCount || '?'}</span>
              </div>
              
              <button
                onClick={() => onPageChange(Math.min(pdfPageCount || 999, currentPage + 1))}
                disabled={currentPage >= (pdfPageCount || 999)}
                className="px-2 py-1 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-300 disabled:opacity-50 text-white rounded text-sm"
              >
                →
              </button>
            </div>
            
            {/* Pattern Butler Speech Controls */}
            <div className="flex items-center gap-2 bg-white/60 backdrop-blur rounded-lg px-3 py-1">
              <button
                onClick={() => setSpeechMode(speechMode === 'smart' ? 'full' : 'smart')}
                className={`px-2 py-1 rounded text-xs ${
                  speechMode === 'smart' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-200 text-gray-700'
                }`}
                title="Toggle between smart and full speech modes"
              >
                {speechMode === 'smart' ? '🎯 Pattern' : '📖 Full'}
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
                onClick={() => setShowPatternPanel(!showPatternPanel)}
                className={`px-2 py-1 rounded text-xs ${
                  showPatternPanel
                    ? 'bg-purple-600 hover:bg-purple-500 text-white'
                    : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                }`}
              >
                📊 Patterns
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
                    <div className="animate-spin text-4xl mb-4">📄</div>
                    <p className="text-gray-600">Loading PDF for pattern analysis...</p>
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
                  console.log('✅ Pattern Training PDF loaded successfully:', pdf.numPages, 'pages');
                }}
                onLoadError={(error) => {
                  console.error('❌ Pattern Training PDF loading error:', error);
                }}
              >
                <Page 
                  pageNumber={currentPage} 
                  scale={pdfScale}
                  renderTextLayer={true}
                  renderAnnotationLayer={true}
                  loading={
                    <div className="flex items-center justify-center p-12">
                      <div className="animate-pulse text-2xl">🎯 Loading page...</div>
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

      {/* Pattern Training Analysis Panel (40% width) */}
      {showPatternPanel && (
        <div className="w-2/5 bg-white flex flex-col">
          {/* Panel Header */}
          <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-purple-50">
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-semibold text-blue-700">🎯 DAT Pattern Analysis</h4>
              <button
                onClick={() => setShowPatternPanel(false)}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-gray-600 mt-1">
              {detectedPatterns.length} patterns detected • Unit {currentThoughtUnit} of {thoughtUnits.length}
            </p>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Current Selection */}
            {effectiveSelection && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <h5 className="text-sm font-semibold text-blue-700 mb-2">📝 Selected Content</h5>
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
                    📝 Pattern Note
                  </button>
                </div>
              </div>
            )}

            {/* Detected DAT Patterns */}
            {detectedPatterns.length > 0 && (
              <div className="space-y-3">
                <h5 className="text-sm font-semibold text-purple-700">🧠 Detected DAT Patterns</h5>
                {detectedPatterns.map((pattern, idx) => (
                  <div 
                    key={`${pattern.id}-${idx}`}
                    className={`border rounded-lg p-3 cursor-pointer transition-all ${
                      selectedPattern?.id === pattern.id 
                        ? 'border-purple-400 bg-purple-50' 
                        : 'border-gray-200 hover:border-purple-300 hover:bg-purple-25'
                    }`}
                    onClick={() => setSelectedPattern(pattern)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h6 className="text-sm font-medium text-purple-700">{pattern.name}</h6>
                      <span className={`text-xs px-2 py-1 rounded ${
                        pattern.category === 'organic-chemistry' ? 'bg-blue-100 text-blue-700' :
                        pattern.category === 'general-chemistry' ? 'bg-green-100 text-green-700' :
                        pattern.category === 'biology' ? 'bg-orange-100 text-orange-700' :
                        'bg-pink-100 text-pink-700'
                      }`}>
                        {pattern.category.replace('-', ' ')}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 mb-2">{pattern.description}</p>
                    
                    {selectedPattern?.id === pattern.id && (
                      <div className="mt-3 space-y-2">
                        <div>
                          <p className="text-xs font-medium text-gray-700 mb-1">Examples:</p>
                          <ul className="text-xs text-gray-600 space-y-1">
                            {pattern.examples.map((example, exIdx) => (
                              <li key={exIdx} className="flex items-start gap-1">
                                <span className="text-purple-500">•</span>
                                <span>{example}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        
                        <div>
                          <p className="text-xs font-medium text-gray-700 mb-1">Key Rules:</p>
                          <ul className="text-xs text-gray-600 space-y-1">
                            {pattern.rules.map((rule, ruleIdx) => (
                              <li key={ruleIdx} className="flex items-start gap-1">
                                <span className="text-purple-500">•</span>
                                <span><strong>{rule.key}:</strong> {rule.description}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        
                        <div className="flex gap-2 pt-2">
                          <button
                            onClick={() => speakText(`${pattern.name}: ${pattern.description}. Key rules: ${pattern.rules.map(r => `${r.key}: ${r.description}`).join('. ')}`)}
                            className="px-2 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded text-xs"
                          >
                            🔊 Explain
                          </button>
                          <button
                            onClick={() => {
                              const patternNote = `# ${pattern.name}\n\n**Pattern Type:** ${pattern.category}\n\n**Description:** ${pattern.description}\n\n**Examples:**\n${pattern.examples.map(ex => `- ${ex}`).join('\n')}\n\n**Key Rules:**\n${pattern.rules.map(r => `- **${r.key}:** ${r.description}`).join('\n')}`;
                              onGenerateNote?.(patternNote, undefined, "highYield");
                            }}
                            className="px-2 py-1 bg-green-600 hover:bg-green-500 text-white rounded text-xs"
                          >
                            📝 Study Note
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Butler Analysis Results */}
            {butlerAnalysis && (
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-lg p-3">
                <h5 className="text-sm font-semibold text-amber-700 mb-2">🧠 Butler Analysis</h5>
                
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="bg-white rounded p-2 text-center">
                    <div className="text-xs text-gray-600">Thought Units</div>
                    <div className="text-sm font-bold text-amber-600">
                      {butlerAnalysis.highlights.length}
                    </div>
                  </div>
                  <div className="bg-white rounded p-2 text-center">
                    <div className="text-xs text-gray-600">Pattern Score</div>
                    <div className="text-sm font-bold text-amber-600">
                      {Math.round(butlerAnalysis.patternConfidence * 100)}%
                    </div>
                  </div>
                </div>

                {/* Pattern-Specific Hints */}
                {butlerAnalysis.organicChemistryHints.length > 0 && (
                  <div className="mb-3">
                    <h6 className="text-xs font-semibold text-blue-600 mb-1">🧪 Organic Chemistry</h6>
                    <ul className="text-xs text-gray-700 space-y-1">
                      {butlerAnalysis.organicChemistryHints.map((hint, idx) => (
                        <li key={idx} className="flex items-start gap-1">
                          <span className="text-blue-500">•</span>
                          <span>{hint}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {butlerAnalysis.generalChemistryHints.length > 0 && (
                  <div className="mb-3">
                    <h6 className="text-xs font-semibold text-green-600 mb-1">⚗️ General Chemistry</h6>
                    <ul className="text-xs text-gray-700 space-y-1">
                      {butlerAnalysis.generalChemistryHints.map((hint, idx) => (
                        <li key={idx} className="flex items-start gap-1">
                          <span className="text-green-500">•</span>
                          <span>{hint}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {butlerAnalysis.biologyHints.length > 0 && (
                  <div className="mb-3">
                    <h6 className="text-xs font-semibold text-orange-600 mb-1">🧬 Biology</h6>
                    <ul className="text-xs text-gray-700 space-y-1">
                      {butlerAnalysis.biologyHints.map((hint, idx) => (
                        <li key={idx} className="flex items-start gap-1">
                          <span className="text-orange-500">•</span>
                          <span>{hint}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {butlerAnalysis.readingComprehensionHints.length > 0 && (
                  <div className="mb-3">
                    <h6 className="text-xs font-semibold text-pink-600 mb-1">📖 Reading Comprehension</h6>
                    <ul className="text-xs text-gray-700 space-y-1">
                      {butlerAnalysis.readingComprehensionHints.map((hint, idx) => (
                        <li key={idx} className="flex items-start gap-1">
                          <span className="text-pink-500">•</span>
                          <span>{hint}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
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
