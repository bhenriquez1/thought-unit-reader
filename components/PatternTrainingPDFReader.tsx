"use client";

import React, { useState, useEffect, useMemo } from "react";
import BaseInteractivePDFReader from "./BaseInteractivePDFReader";
import type { ThoughtUnit as BaseThoughtUnit, ReadingStats } from "@/types/reading";
import { 
  DAT_PATTERNS, 
  PATTERN_CATEGORIES,
  getPatternById,
  type Pattern,
  type PatternAttempt,
  type PatternMastery
} from "@/types/patterns";
import { 
  savePatternAttempt,
  loadPatternMastery
} from "@/lib/firebase";

type HRUnit = BaseThoughtUnit | string | string[] | { text?: string };

interface PatternTrainingPDFReaderProps {
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
  selBind?: { onMouseUp?: (e: React.MouseEvent) => void };
  externalSelectionText?: string;
  fontSize: number;
  fontFamily: string;
  lineSpacing: number;
  selectedVoice?: SpeechSynthesisVoice;
  onVoiceChange?: (voice: SpeechSynthesisVoice) => void;
  speechRate?: number;
  onSpeechRateChange?: (rate: number) => void;
  tableOfContents?: any[];
}

// Pattern suggestion based on content analysis
function suggestPatterns(text: string): Pattern[] {
  const suggestions: Pattern[] = [];
  const lowerText = text.toLowerCase();
  
  // Keyword-based pattern suggestions
  const patternKeywords = {
    'cardio': ['acid', 'base', 'pka', 'ph', 'acidic', 'basic', 'proton', 'hydrogen'],
    '5q-rule': ['reaction', 'reagent', 'alkene', 'addition', 'product', 'mechanism'],
    'sn-e-flow': ['substitution', 'elimination', 'nucleophile', 'base', 'sn1', 'sn2', 'e1', 'e2'],
    'spectroscopy-anchors': ['ir', 'nmr', 'spectrum', 'peak', 'carbonyl', 'functional group'],
    'eas-directors': ['benzene', 'aromatic', 'substitution', 'ortho', 'para', 'meta'],
    'q-vs-k': ['equilibrium', 'reaction quotient', 'concentration', 'forward', 'reverse'],
    'delta-g-signs': ['spontaneous', 'thermodynamics', 'enthalpy', 'entropy', 'temperature'],
    'gas-laws': ['gas', 'pressure', 'volume', 'temperature', 'ideal gas', 'pv=nrt'],
    'organelle-function': ['cell', 'organelle', 'mitochondria', 'ribosome', 'endoplasmic'],
    'genetics-hardy-weinberg': ['allele', 'frequency', 'population', 'genetics', 'hardy-weinberg'],
    'caries-treatment': ['caries', 'tooth', 'decay', 'restoration', 'dental', 'cavity'],
    'endo-pulp-diagnosis': ['pulp', 'endodontic', 'root canal', 'pain', 'vitality'],
    'cause-effect': ['because', 'therefore', 'thus', 'result', 'caused', 'effect'],
    'compare-contrast': ['however', 'whereas', 'but', 'unlike', 'similar', 'different']
  };
  
  Object.entries(patternKeywords).forEach(([patternId, keywords]) => {
    const matches = keywords.filter(keyword => lowerText.includes(keyword));
    if (matches.length > 0) {
      const pattern = getPatternById(patternId);
      if (pattern) {
        suggestions.push(pattern);
      }
    }
  });
  
  // Sort by relevance (number of keyword matches)
  return suggestions.slice(0, 5); // Top 5 suggestions
}

function getMasteryColor(level: PatternMastery['masteryLevel']): string {
  switch (level) {
    case 'mastered': return 'text-green-400';
    case 'practicing': return 'text-yellow-400';
    case 'learning': return 'text-orange-400';
    default: return 'text-gray-400';
  }
}

function getMasteryIcon(level: PatternMastery['masteryLevel']): string {
  switch (level) {
    case 'mastered': return '🏆';
    case 'practicing': return '📈';
    case 'learning': return '🎯';
    default: return '❓';
  }
}

export default function PatternTrainingPDFReader(props: PatternTrainingPDFReaderProps) {
  // Pattern training state
  const [selectedPatternId, setSelectedPatternId] = useState<string>("");
  const [showPatternOverlay, setShowPatternOverlay] = useState(false);
  const [userAttempt, setUserAttempt] = useState("");
  const [showSolution, setShowSolution] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [attemptStartTime, setAttemptStartTime] = useState(Date.now());
  const [patternMastery, setPatternMastery] = useState<PatternMastery[]>([]);
  const [activeSelection, setActiveSelection] = useState("");

  // Load pattern mastery
  useEffect(() => {
    if (!props.userId) return;
    let alive = true;
    loadPatternMastery(props.userId).then(data => { if (alive) setPatternMastery(data); }).catch(() => {});
    return () => { alive = false; };
  }, [props.userId]);

  // Handle text selection for pattern recognition
  const handleTextSelect = (text: string) => {
    setActiveSelection(text);
    if (text.trim().length > 10) {
      setShowPatternOverlay(true);
      setSelectedPatternId("");
      setUserAttempt("");
      setShowSolution(false);
      setIsCorrect(null);
      setAttemptStartTime(Date.now());
    }
    props.onTextSelect?.(text);
  };

  const suggestedPatterns = useMemo(() => 
    activeSelection ? suggestPatterns(activeSelection) : [], 
    [activeSelection]
  );

  const selectedPattern = selectedPatternId ? getPatternById(selectedPatternId) : null;

  const handlePatternSelect = (patternId: string) => {
    setSelectedPatternId(patternId);
    setUserAttempt("");
    setShowSolution(false);
    setIsCorrect(null);
  };

  const handleSubmitAttempt = () => {
    if (!selectedPatternId || !userAttempt.trim()) {
      alert("Please select a pattern and provide your reasoning.");
      return;
    }
    setShowSolution(true);
  };

  const handleGradeAttempt = (correct: boolean) => {
    const timeSpent = Math.round((Date.now() - attemptStartTime) / 1000);
    
    // Save attempt
    const attempt: PatternAttempt = {
      id: `${Date.now()}-${Math.random()}`,
      userId: props.userId || "guest",
      patternId: selectedPatternId,
      thoughtUnitId: props.currentThoughtUnit.toString(),
      bookId: props.bookId,
      timestamp: new Date().toISOString(),
      selectedPattern: selectedPatternId,
      correct,
      timeSpent,
      skipped: false,
      notes: userAttempt
    };
    
    savePatternAttempt(props.userId || "guest", attempt);
    setIsCorrect(correct);
    
    // Update mastery
    if (props.userId) {
      loadPatternMastery(props.userId).then(setPatternMastery);
    }
  };

  const handleCloseOverlay = () => {
    setShowPatternOverlay(false);
    setSelectedPatternId("");
    setUserAttempt("");
    setShowSolution(false);
    setIsCorrect(null);
    setActiveSelection("");
  };

  const getMasteryForPattern = (patternId: string): PatternMastery | undefined => {
    return patternMastery.find(m => m.patternId === patternId);
  };

  // Pattern Training Controls
  const patternControls = (
    <div className="flex items-center gap-2">
      <div className="text-sm text-gray-600">
        Patterns: {patternMastery.filter(m => m.masteryLevel === 'mastered').length} mastered
      </div>
      <button
        onClick={() => setShowPatternOverlay(!showPatternOverlay)}
        className="px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded text-sm"
      >
        🎯 Pattern Mode
      </button>
    </div>
  );

  return (
    <>
      <BaseInteractivePDFReader
        {...props}
        onTextSelect={handleTextSelect}
        extraControls={patternControls}
        className="relative"
      />

      {/* Pattern Recognition Overlay */}
      {showPatternOverlay && activeSelection && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full m-4 max-h-[90vh] overflow-auto">
            <div className="p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-purple-700">🎯 Pattern Recognition Training</h2>
                <button
                  onClick={handleCloseOverlay}
                  className="text-gray-500 hover:text-gray-700 text-xl font-bold"
                >
                  ✕
                </button>
              </div>

              {/* Selected Text */}
              <div className="mb-6 p-4 bg-blue-50 border-l-4 border-blue-400 rounded">
                <h3 className="text-sm font-semibold text-blue-700 mb-2">Selected Text:</h3>
                <p className="text-gray-700 italic">
                  "{activeSelection.slice(0, 200)}{activeSelection.length > 200 ? '...' : ''}"
                </p>
              </div>

              {/* Pattern Selection */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-3">Step 1: Identify the Pattern</h3>
                
                {/* Suggested Patterns */}
                {suggestedPatterns.length > 0 && !selectedPatternId && (
                  <div className="mb-4 p-3 bg-purple-50 rounded-lg">
                    <h4 className="text-sm font-medium text-purple-700 mb-2">💡 Suggested Patterns:</h4>
                    <div className="flex flex-wrap gap-2">
                      {suggestedPatterns.map(pattern => (
                        <button
                          key={pattern.id}
                          onClick={() => handlePatternSelect(pattern.id)}
                          className="px-3 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded text-sm"
                        >
                          {pattern.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* All Pattern Categories */}
                <div className="space-y-3">
                  {Object.entries(PATTERN_CATEGORIES).map(([categoryKey, categoryName]) => (
                    <div key={categoryKey}>
                      <h4 className="text-sm font-medium text-gray-600 mb-2">{categoryName}</h4>
                      <div className="flex flex-wrap gap-2">
                        {DAT_PATTERNS.filter(p => p.category === categoryKey).map(pattern => {
                          const mastery = getMasteryForPattern(pattern.id);
                          const isSelected = selectedPatternId === pattern.id;
                          
                          return (
                            <button
                              key={pattern.id}
                              onClick={() => handlePatternSelect(pattern.id)}
                              className={`px-3 py-2 rounded text-sm transition-colors flex items-center gap-2 ${
                                isSelected
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                              }`}
                            >
                              {mastery && <span>{getMasteryIcon(mastery.masteryLevel)}</span>}
                              <span>{pattern.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Decision Rules */}
              {selectedPattern && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold mb-3">Step 2: Apply Decision Rules</h3>
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <h4 className="font-semibold text-yellow-600 mb-2">{selectedPattern.name}</h4>
                    <p className="text-gray-700 mb-4">{selectedPattern.description}</p>
                    
                    <div className="space-y-3">
                      {selectedPattern.rules.map((rule, index) => (
                        <div key={index} className="flex items-start gap-3">
                          <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-xs font-bold text-white">
                            {index + 1}
                          </div>
                          <div className="flex-1">
                            <div className="font-medium text-blue-600">{rule.key}</div>
                            <div className="text-gray-700">{rule.description}</div>
                            {rule.example && (
                              <div className="text-sm text-gray-500 mt-1">
                                Example: {rule.example}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* User Attempt */}
              {selectedPattern && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold mb-3">Step 3: Your Reasoning</h3>
                  <textarea
                    value={userAttempt}
                    onChange={(e) => setUserAttempt(e.target.value)}
                    placeholder="Apply the decision rules to this text. Walk through your reasoning step by step..."
                    className="w-full h-32 p-3 border border-gray-300 rounded-lg resize-none"
                    disabled={showSolution}
                  />
                  
                  <div className="flex gap-3 mt-3">
                    {!showSolution ? (
                      <button
                        onClick={handleSubmitAttempt}
                        className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded"
                        disabled={!userAttempt.trim()}
                      >
                        Submit Attempt
                      </button>
                    ) : (
                      <div className="flex gap-3">
                        <button
                          onClick={() => handleGradeAttempt(true)}
                          className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded"
                          disabled={isCorrect !== null}
                        >
                          ✅ I Got It Right
                        </button>
                        <button
                          onClick={() => handleGradeAttempt(false)}
                          className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded"
                          disabled={isCorrect !== null}
                        >
                          ❌ I Need More Practice
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Solution Display */}
              {showSolution && selectedPattern && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold mb-3">Pattern Application Examples</h3>
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <div className="mb-4">
                      <h4 className="font-semibold text-green-600 mb-2">Example Applications:</h4>
                      <ul className="list-disc list-inside space-y-1 text-gray-700">
                        {selectedPattern.examples.map((example, index) => (
                          <li key={index}>{example}</li>
                        ))}
                      </ul>
                    </div>
                    
                    <div>
                      <h4 className="font-semibold text-red-600 mb-2">Common Mistakes:</h4>
                      <ul className="list-disc list-inside space-y-1 text-gray-700">
                        {selectedPattern.commonMistakes.map((mistake, index) => (
                          <li key={index}>{mistake}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {isCorrect !== null && (
                    <div className={`mt-4 p-3 rounded-lg ${
                      isCorrect ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
                    }`}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg">{isCorrect ? '🎉' : '💪'}</span>
                        <span className="font-semibold">
                          {isCorrect ? 'Great job!' : 'Keep practicing!'}
                        </span>
                      </div>
                      <p className="text-sm">
                        {isCorrect 
                          ? 'You\'re building strong pattern recognition skills!'
                          : 'Pattern recognition takes practice. Review the decision rules and try similar problems.'
                        }
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
