"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
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
import { auth } from "@/lib/firebase";
import type { User } from "firebase/auth";

type PVUnit = BaseThoughtUnit | string | string[] | { text?: string };

interface OptimizedPatternViewProps {
  bookId: string;
  userId: string;
  thoughtUnits: PVUnit[];
  currentThoughtUnit: number;
  stats?: ReadingStats;
  currentPage: number;
  pdfPageCount?: number;
  fontSize: number;
  fontFamily: string;
  lineSpacing: number;
  onWordClick?: (word: string) => void;
  onTextSelect?: (text: string) => void;
  onGenerateNote?: (text: string, mnemonic?: string, mode?: "sketch" | "highYield") => void;
  selBind?: { onMouseUp?: (e: React.MouseEvent) => void };
  externalSelectionText?: string;
}

// Helper functions memoized outside component
const unitToText = (u: PVUnit): string => {
  if (u == null) return "";
  if (typeof u === "string") return u;
  if (Array.isArray(u)) return u.join(" ");
  const maybeText = (u as any).text;
  return typeof maybeText === "string" ? maybeText : JSON.stringify(u);
};

// Training workflow steps
type TrainingStep = 'content' | 'pattern-selection' | 'rules' | 'attempt' | 'solution' | 'assessment' | 'complete';

interface TrainingState {
  step: TrainingStep;
  selectedPatternId: string | null;
  userAttempt: string;
  attemptStartTime: number;
  isCorrect: boolean | null;
  showHint: boolean;
  attemptsCount: number;
}

// Cached pattern suggestions to avoid recalculating on every render
const patternKeywordsCache = new Map<string, Pattern[]>();

// Optimized pattern suggestion with caching
const suggestPatterns = (text: string): Pattern[] => {
  const lowerText = text.toLowerCase();
  
  if (patternKeywordsCache.has(lowerText)) {
    return patternKeywordsCache.get(lowerText)!;
  }

  const suggestions: Pattern[] = [];
  
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
  
  const result = suggestions.slice(0, 5);
  patternKeywordsCache.set(lowerText, result);
  
  return result;
};

// Memoized components for performance
const LoadingSpinner = React.memo(() => (
  <div className="p-4 flex items-center justify-center text-gray-400 italic">
    <div className="flex flex-col items-center gap-2">
      <div className="animate-spin text-4xl">🎯</div>
      <p>Loading pattern training...</p>
    </div>
  </div>
));
LoadingSpinner.displayName = 'LoadingSpinner';

const PatternMasteryCard = React.memo(({ 
  pattern, 
  mastery, 
  onSelect 
}: { 
  pattern: Pattern; 
  mastery?: PatternMastery; 
  onSelect: (id: string) => void; 
}) => {
  const getMasteryIcon = (level?: PatternMastery['masteryLevel']): string => {
    switch (level) {
      case 'mastered': return '🏆';
      case 'practicing': return '📈';
      case 'learning': return '🎯';
      default: return '❓';
    }
  };

  return (
    <button
      onClick={() => onSelect(pattern.id)}
      className="px-3 py-2 rounded text-sm transition-colors bg-gray-700 hover:bg-gray-600 text-gray-200"
    >
      <div className="flex items-center gap-2">
        {mastery && <span>{getMasteryIcon(mastery.masteryLevel)}</span>}
        <span>{pattern.name}</span>
      </div>
    </button>
  );
});
PatternMasteryCard.displayName = 'PatternMasteryCard';

const ProgressSummary = React.memo(({ patternMastery }: { patternMastery: PatternMastery[] }) => {
  const getMasteryIcon = (level: PatternMastery['masteryLevel']): string => {
    switch (level) {
      case 'mastered': return '🏆';
      case 'practicing': return '📈';
      case 'learning': return '🎯';
      default: return '❓';
    }
  };

  const getMasteryColor = (level: PatternMastery['masteryLevel']): string => {
    switch (level) {
      case 'mastered': return 'text-green-400';
      case 'practicing': return 'text-yellow-400';
      case 'learning': return 'text-orange-400';
      default: return 'text-gray-400';
    }
  };

  return (
    <div className="mt-6">
      <h4 className="font-semibold mb-3">📈 Your Progress</h4>
      <div className="space-y-2">
        {['mastered', 'practicing', 'learning'].map(level => {
          const count = patternMastery.filter(m => m.masteryLevel === level).length;
          const icon = getMasteryIcon(level as PatternMastery['masteryLevel']);
          const color = getMasteryColor(level as PatternMastery['masteryLevel']);
          
          return (
            <div key={level} className="flex justify-between items-center text-sm">
              <span className="flex items-center gap-2">
                <span>{icon}</span>
                <span className={`capitalize ${color}`}>{level}</span>
              </span>
              <span className="text-gray-400">{count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
});
ProgressSummary.displayName = 'ProgressSummary';

export default React.memo(function OptimizedPatternView({
  bookId,
  userId,
  thoughtUnits,
  currentThoughtUnit,
  stats,
  currentPage,
  pdfPageCount,
  fontSize,
  fontFamily,
  lineSpacing,
  onWordClick,
  onTextSelect,
  onGenerateNote,
  selBind,
  externalSelectionText,
}: OptimizedPatternViewProps) {
  const [user, setUser] = useState<User | null>(null);
  const [patternMastery, setPatternMastery] = useState<PatternMastery[]>([]);
  const [showMasteryPanel, setShowMasteryPanel] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // Training workflow state
  const [trainingState, setTrainingState] = useState<TrainingState>({
    step: 'content',
    selectedPatternId: null,
    userAttempt: '',
    attemptStartTime: Date.now(),
    isCorrect: null,
    showHint: false,
    attemptsCount: 0
  });

  // Auth
  useEffect(() => {
    const unsub = auth?.onAuthStateChanged((u) => setUser(u));
    return () => unsub?.();
  }, []);

  // Load pattern mastery
  useEffect(() => {
    if (userId) {
      setIsLoading(true);
      loadPatternMastery(userId)
        .then(setPatternMastery)
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, [userId]);

  // Reset training for new thought unit - optimized to prevent loops
  useEffect(() => {
    setTrainingState(prev => ({
      ...prev,
      step: 'content',
      selectedPatternId: null,
      userAttempt: '',
      attemptStartTime: Date.now(),
      isCorrect: null,
      showHint: false,
      attemptsCount: 0
    }));
  }, [currentThoughtUnit]);

  // Memoized values to prevent recalculations
  const rawUnit = useMemo(() => {
    return thoughtUnits[currentThoughtUnit - 1] || thoughtUnits[0];
  }, [thoughtUnits, currentThoughtUnit]);

  const unitText = useMemo(() => {
    return unitToText(rawUnit);
  }, [rawUnit]);

  const selectedPattern = useMemo(() => {
    return trainingState.selectedPatternId ? getPatternById(trainingState.selectedPatternId) : null;
  }, [trainingState.selectedPatternId]);

  const suggestedPatterns = useMemo(() => {
    return suggestPatterns(unitText);
  }, [unitText]);

  const getMasteryForPattern = useCallback((patternId: string): PatternMastery | undefined => {
    return patternMastery.find(m => m.patternId === patternId);
  }, [patternMastery]);

  const renderedWords = useMemo(() => {
    return unitText.split(' ').map((word, idx) => (
      <span
        key={idx}
        className="hover:bg-blue-700 hover:bg-opacity-30 cursor-pointer px-0.5 rounded"
        onClick={() => onWordClick?.(word)}
      >
        {word}{' '}
      </span>
    ));
  }, [unitText, onWordClick]);

  // Interactive training workflow handlers
  const handlePatternSelect = useCallback((patternId: string) => {
    setTrainingState(prev => ({
      ...prev,
      step: 'rules',
      selectedPatternId: patternId,
      attemptStartTime: Date.now()
    }));
  }, []);

  const handleStartAttempt = useCallback(() => {
    setTrainingState(prev => ({ ...prev, step: 'attempt' }));
  }, []);

  const handleSubmitAttempt = useCallback(() => {
    if (!trainingState.selectedPatternId || !trainingState.userAttempt.trim()) {
      alert("Please select a pattern and provide your reasoning.");
      return;
    }
    setTrainingState(prev => ({ ...prev, step: 'solution', attemptsCount: prev.attemptsCount + 1 }));
  }, [trainingState.selectedPatternId, trainingState.userAttempt]);

  const handleGradeAttempt = useCallback((correct: boolean) => {
    const timeSpent = Math.round((Date.now() - trainingState.attemptStartTime) / 1000);
    
    // Save attempt to Firebase
    const attempt: PatternAttempt = {
      id: `${Date.now()}-${Math.random()}`,
      userId: userId || "guest",
      patternId: trainingState.selectedPatternId!,
      thoughtUnitId: currentThoughtUnit.toString(),
      bookId,
      timestamp: new Date().toISOString(),
      selectedPattern: trainingState.selectedPatternId!,
      correct,
      timeSpent,
      skipped: false,
      notes: trainingState.userAttempt
    };
    
    savePatternAttempt(userId || "guest", attempt);
    
    setTrainingState(prev => ({
      ...prev,
      step: 'assessment',
      isCorrect: correct
    }));
    
    // Update mastery data
    if (userId) {
      loadPatternMastery(userId).then(setPatternMastery);
    }
  }, [trainingState.selectedPatternId, trainingState.userAttempt, trainingState.attemptStartTime, userId, currentThoughtUnit, bookId]);

  const handleSkip = useCallback(() => {
    const timeSpent = Math.round((Date.now() - trainingState.attemptStartTime) / 1000);
    
    const attempt: PatternAttempt = {
      id: `${Date.now()}-${Math.random()}`,
      userId: userId || "guest",
      patternId: trainingState.selectedPatternId || "unknown",
      thoughtUnitId: currentThoughtUnit.toString(),
      bookId,
      timestamp: new Date().toISOString(),
      selectedPattern: null,
      correct: false,
      timeSpent,
      skipped: true
    };
    
    savePatternAttempt(userId || "guest", attempt);
    
    // Reset training state for next unit
    setTrainingState({
      step: 'content',
      selectedPatternId: null,
      userAttempt: '',
      attemptStartTime: Date.now(),
      isCorrect: null,
      showHint: false,
      attemptsCount: 0
    });
  }, [trainingState.selectedPatternId, trainingState.attemptStartTime, userId, currentThoughtUnit, bookId]);

  const handleNextUnit = useCallback(() => {
    setTrainingState({
      step: 'content',
      selectedPatternId: null,
      userAttempt: '',
      attemptStartTime: Date.now(),
      isCorrect: null,
      showHint: false,
      attemptsCount: 0
    });
  }, []);

  // Early loading state
  if (isLoading) {
    return <LoadingSpinner />;
  }

  // ✅ Simplified validation - main index.tsx handles empty states
  if (!rawUnit) {
    return (
      <div
        className="p-4 flex items-center justify-center text-gray-400 italic"
        style={{ fontSize: `${fontSize}px`, fontFamily, lineHeight: lineSpacing }}
      >
        ⏳ Loading content for pattern recognition...
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-900 text-white">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold text-blue-400">🎯 Pattern Recognition Training</h2>
          <span className="text-sm text-gray-400">
            Unit {currentThoughtUnit} of {thoughtUnits.length}
            {pdfPageCount && ` • Page ${currentPage}`}
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowMasteryPanel(!showMasteryPanel)}
            className="px-3 py-1 bg-purple-600 hover:bg-purple-500 rounded text-sm transition-colors"
          >
            📊 Mastery
          </button>
        </div>
      </div>

      {/* Mastery Panel */}
      {showMasteryPanel && (
        <div className="bg-gray-800 p-4 border-b border-gray-700">
          <h3 className="font-semibold mb-3">Pattern Mastery Progress</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
            {DAT_PATTERNS.map(pattern => {
              const mastery = getMasteryForPattern(pattern.id);
              const level = mastery?.masteryLevel || 'learning';
              const accuracy = mastery ? Math.round((mastery.correct / mastery.attempts) * 100) : 0;
              
              return (
                <div
                  key={pattern.id}
                  className="p-2 bg-gray-700 rounded text-xs"
                >
                  <div className="flex items-center gap-1 mb-1">
                    <span>{level === 'mastered' ? '🏆' : level === 'practicing' ? '📈' : '🎯'}</span>
                    <span className={`font-medium ${
                      level === 'mastered' ? 'text-green-400' : 
                      level === 'practicing' ? 'text-yellow-400' : 'text-orange-400'
                    }`}>
                      {pattern.name}
                    </span>
                  </div>
                  {mastery && (
                    <div className="text-gray-400">
                      {mastery.correct}/{mastery.attempts} ({accuracy}%)
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex-1 flex">
        {/* Main Content */}
        <div className="flex-1 p-6">
          {/* Step 1: Thought Unit Display */}
          <div
            className="mb-6 p-4 bg-gray-800 rounded-lg border-l-4 border-blue-400"
            style={{ fontSize: `${fontSize}px`, fontFamily, lineHeight: lineSpacing }}
            onMouseUp={selBind?.onMouseUp}
          >
            <h3 className="text-lg font-semibold text-blue-400 mb-3">📖 Step 1: Read the Thought Unit</h3>
            <div className="leading-relaxed">
              {renderedWords}
            </div>
          </div>

          {/* Step 2: Pattern Selection */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-3">🎯 Step 2: Select the Best Pattern</h3>
            
            {/* Suggested Patterns */}
            {suggestedPatterns.length > 0 && trainingState.step === 'content' && (
              <div className="mb-4 p-3 bg-purple-900 bg-opacity-30 rounded-lg">
                <h4 className="text-sm font-medium text-purple-400 mb-2">💡 AI Suggested Patterns:</h4>
                <div className="flex flex-wrap gap-2">
                  {suggestedPatterns.map(pattern => (
                    <button
                      key={pattern.id}
                      onClick={() => handlePatternSelect(pattern.id)}
                      className="px-3 py-1 bg-purple-600 hover:bg-purple-500 rounded text-sm transition-colors"
                    >
                      {pattern.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Pattern Categories */}
            {trainingState.step === 'content' && (
              <div className="space-y-3">
                {Object.entries(PATTERN_CATEGORIES).map(([categoryKey, categoryName]) => (
                  <div key={categoryKey}>
                    <h4 className="text-sm font-medium text-gray-400 mb-2">{categoryName}</h4>
                    <div className="flex flex-wrap gap-2">
                      {DAT_PATTERNS.filter(p => p.category === categoryKey).map(pattern => (
                        <PatternMasteryCard
                          key={pattern.id}
                          pattern={pattern}
                          mastery={getMasteryForPattern(pattern.id)}
                          onSelect={handlePatternSelect}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Step 3: Rules Display */}
          {trainingState.step === 'rules' && selectedPattern && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-3">📋 Step 3: Review Pattern Rules</h3>
              <div className="p-4 bg-gray-800 rounded-lg">
                <h4 className="font-semibold text-yellow-400 mb-3">{selectedPattern.name}</h4>
                <p className="text-gray-300 mb-4">{selectedPattern.description}</p>
                
                <div className="space-y-3">
                  {selectedPattern.rules.map((rule, index) => (
                    <div key={index} className="flex items-start gap-3">
                      <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-xs font-bold">
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-blue-400">{rule.key}</div>
                        <div className="text-gray-300">{rule.description}</div>
                        {rule.example && (
                          <div className="text-sm text-gray-400 mt-1">
                            Example: {rule.example}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={handleStartAttempt}
                  className="mt-4 px-4 py-2 bg-green-600 hover:bg-green-500 rounded transition-colors"
                >
                  Start Practice
                </button>
              </div>
            </div>
          )}

          {/* Step 4: User Attempt */}
          {trainingState.step === 'attempt' && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-3">✍️ Step 4: Apply the Pattern</h3>
              <textarea
                value={trainingState.userAttempt}
                onChange={(e) => setTrainingState(prev => ({ ...prev, userAttempt: e.target.value }))}
                placeholder="Apply the pattern rules to this thought unit. Walk through your reasoning step by step..."
                className="w-full h-32 p-3 bg-gray-800 rounded-lg border border-gray-600 resize-none"
              />
              
              <div className="flex gap-3 mt-3">
                <button
                  onClick={handleSubmitAttempt}
                  className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded transition-colors"
                  disabled={!trainingState.userAttempt.trim()}
                >
                  Submit Attempt
                </button>
                <button
                  onClick={handleSkip}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded transition-colors"
                >
                  Skip This Unit
                </button>
              </div>
            </div>
          )}

          {/* Step 5: Solution & Self-Assessment */}
          {trainingState.step === 'solution' && selectedPattern && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-3">💡 Step 5: Compare with Examples</h3>
              <div className="p-4 bg-gray-800 rounded-lg mb-4">
                <div className="mb-4">
                  <h4 className="font-semibold text-green-400 mb-2">Example Applications:</h4>
                  <ul className="list-disc list-inside space-y-1 text-gray-300">
                    {selectedPattern.examples.map((example, index) => (
                      <li key={index}>{example}</li>
                    ))}
                  </ul>
                </div>
                
                <div>
                  <h4 className="font-semibold text-red-400 mb-2">Common Mistakes:</h4>
                  <ul className="list-disc list-inside space-y-1 text-gray-300">
                    {selectedPattern.commonMistakes.map((mistake, index) => (
                      <li key={index}>{mistake}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="p-4 bg-blue-900 bg-opacity-30 rounded-lg mb-4">
                <h4 className="font-semibold text-blue-400 mb-2">Your Response:</h4>
                <p className="text-gray-300">{trainingState.userAttempt}</p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => handleGradeAttempt(true)}
                  className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded transition-colors"
                  disabled={trainingState.isCorrect !== null}
                >
                  ✅ I Got It Right
                </button>
                <button
                  onClick={() => handleGradeAttempt(false)}
                  className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded transition-colors"
                  disabled={trainingState.isCorrect !== null}
                >
                  ❌ I Need More Practice
                </button>
              </div>
            </div>
          )}

          {/* Step 6: Assessment Feedback */}
          {trainingState.step === 'assessment' && trainingState.isCorrect !== null && (
            <div className={`p-4 rounded-lg ${
              trainingState.isCorrect 
                ? 'bg-green-900 bg-opacity-50 border border-green-500' 
                : 'bg-red-900 bg-opacity-50 border border-red-500'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">{trainingState.isCorrect ? '🎉' : '💪'}</span>
                <span className="font-semibold">
                  {trainingState.isCorrect ? 'Great job!' : 'Keep practicing!'}
                </span>
              </div>
              <p className="text-sm mb-4">
                {trainingState.isCorrect 
                  ? 'You\'re building strong pattern recognition skills. Continue to the next unit!'
                  : 'Pattern recognition takes practice. Review the rules and try similar problems.'
                }
              </p>
              <button
                onClick={handleNextUnit}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded transition-colors"
              >
                Next Unit
              </button>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="w-80 bg-gray-800 p-4 border-l border-gray-700">
          <h3 className="font-semibold mb-4">📊 Progress Summary</h3>
          
          {/* Current Pattern */}
          {selectedPattern && (
            <div className="mb-4 p-3 bg-gray-700 rounded">
              <h4 className="font-medium text-yellow-400 mb-1">Current Pattern</h4>
              <p className="text-sm">{selectedPattern.name}</p>
            </div>
          )}

          {/* Performance Summary */}
          <ProgressSummary patternMastery={patternMastery} />
        </div>
      </div>
    </div>
  );
});
