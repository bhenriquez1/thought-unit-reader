"use client";

import React, { useEffect, useState, useMemo } from "react";
import type { ThoughtUnit as BaseThoughtUnit, ReadingStats } from "@/types/reading";
import { 
  DAT_PATTERNS, 
  PATTERN_CATEGORIES,
  getPatternById,
  type Pattern,
  type PatternAttempt,
  type PatternMastery
} from "@/types/patterns";
import { saveReadingProgress, loadReadingProgress } from "@/lib/firebase";
import { auth } from "@/lib/firebase";
import type { User } from "firebase/auth";

type PVUnit = BaseThoughtUnit | string | string[] | { text?: string };

interface PatternViewProps {
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

// Helper functions
function unitToText(u: PVUnit): string {
  if (u == null) return "";
  if (typeof u === "string") return u;
  if (Array.isArray(u)) return u.join(" ");
  const maybeText = (u as any).text;
  return typeof maybeText === "string" ? maybeText : JSON.stringify(u);
}

// Pattern mastery storage (localStorage for now, can be moved to Firebase later)
function savePatternAttempt(attempt: PatternAttempt) {
  const attempts = JSON.parse(localStorage.getItem('pattern-attempts') || '[]');
  attempts.push(attempt);
  localStorage.setItem('pattern-attempts', JSON.stringify(attempts));
}

function loadPatternMastery(userId: string): PatternMastery[] {
  const attempts = JSON.parse(localStorage.getItem('pattern-attempts') || '[]') as PatternAttempt[];
  const userAttempts = attempts.filter(a => a.userId === userId);
  
  // Group by pattern and calculate mastery
  const masteryMap = new Map<string, PatternMastery>();
  
  userAttempts.forEach(attempt => {
    if (!masteryMap.has(attempt.patternId)) {
      masteryMap.set(attempt.patternId, {
        patternId: attempt.patternId,
        userId,
        attempts: 0,
        correct: 0,
        lastAttempt: attempt.timestamp,
        masteryLevel: 'learning',
        averageTime: 0,
        commonErrors: []
      });
    }
    
    const mastery = masteryMap.get(attempt.patternId)!;
    mastery.attempts++;
    if (attempt.correct) mastery.correct++;
    if (new Date(attempt.timestamp) > new Date(mastery.lastAttempt)) {
      mastery.lastAttempt = attempt.timestamp;
    }
    
    // Calculate mastery level
    const accuracy = mastery.correct / mastery.attempts;
    if (accuracy >= 0.8 && mastery.attempts >= 5) {
      mastery.masteryLevel = 'mastered';
    } else if (accuracy >= 0.6 && mastery.attempts >= 3) {
      mastery.masteryLevel = 'practicing';
    } else {
      mastery.masteryLevel = 'learning';
    }
  });
  
  return Array.from(masteryMap.values());
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

export default function PatternView({
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
}: PatternViewProps) {
  const [user, setUser] = useState<User | null>(null);
  const [selectedPatternId, setSelectedPatternId] = useState<string>("");
  const [showRules, setShowRules] = useState(false);
  const [userAttempt, setUserAttempt] = useState("");
  const [showSolution, setShowSolution] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [attemptStartTime, setAttemptStartTime] = useState(Date.now());
  const [patternMastery, setPatternMastery] = useState<PatternMastery[]>([]);
  const [showMasteryPanel, setShowMasteryPanel] = useState(false);

  // Auth
  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => setUser(u));
    return () => unsub();
  }, []);

  // Load pattern mastery
  useEffect(() => {
    if (userId) {
      const mastery = loadPatternMastery(userId);
      setPatternMastery(mastery);
    }
  }, [userId]);

  // Reset for new thought unit
  useEffect(() => {
    setSelectedPatternId("");
    setShowRules(false);
    setUserAttempt("");
    setShowSolution(false);
    setIsCorrect(null);
    setAttemptStartTime(Date.now());
  }, [currentThoughtUnit]);

  // Empty state
  if (!thoughtUnits || thoughtUnits.length === 0) {
    return (
      <div
        className="p-4 flex items-center justify-center text-gray-400 italic"
        style={{ fontSize: `${fontSize}px`, fontFamily, lineHeight: lineSpacing }}
      >
        📚 Please upload a PDF to start Pattern Recognition Training.
      </div>
    );
  }

  const rawUnit = thoughtUnits[currentThoughtUnit - 1];
  if (!rawUnit) {
    return (
      <div
        className="p-4 flex items-center justify-center text-gray-400 italic"
        style={{ fontSize: `${fontSize}px`, fontFamily, lineHeight: lineSpacing }}
      >
        ⏳ Preparing your pattern recognition view...
      </div>
    );
  }

  const unitText = unitToText(rawUnit);
  const selectedPattern = selectedPatternId ? getPatternById(selectedPatternId) : null;
  const suggestedPatterns = useMemo(() => suggestPatterns(unitText), [unitText]);

  const handlePatternSelect = (patternId: string) => {
    setSelectedPatternId(patternId);
    setShowRules(true);
    setUserAttempt("");
    setShowSolution(false);
    setIsCorrect(null);
  };

  const handleSubmitAttempt = () => {
    if (!selectedPatternId || !userAttempt.trim()) {
      alert("Please select a pattern and provide your reasoning.");
      return;
    }

    // For now, we'll let the user self-evaluate
    // In a real implementation, this could use AI or predefined answers
    setShowSolution(true);
  };

  const handleGradeAttempt = (correct: boolean) => {
    const timeSpent = Math.round((Date.now() - attemptStartTime) / 1000);
    
    // Save attempt
    const attempt: PatternAttempt = {
      id: `${Date.now()}-${Math.random()}`,
      userId: userId || "guest",
      patternId: selectedPatternId,
      thoughtUnitId: currentThoughtUnit.toString(),
      bookId,
      timestamp: new Date().toISOString(),
      selectedPattern: selectedPatternId,
      correct,
      timeSpent,
      skipped: false,
      notes: userAttempt
    };
    
    savePatternAttempt(attempt);
    setIsCorrect(correct);
    
    // Update mastery
    if (userId) {
      const mastery = loadPatternMastery(userId);
      setPatternMastery(mastery);
    }
  };

  const handleSkip = () => {
    const timeSpent = Math.round((Date.now() - attemptStartTime) / 1000);
    
    const attempt: PatternAttempt = {
      id: `${Date.now()}-${Math.random()}`,
      userId: userId || "guest",
      patternId: selectedPatternId || "unknown",
      thoughtUnitId: currentThoughtUnit.toString(),
      bookId,
      timestamp: new Date().toISOString(),
      selectedPattern: null,
      correct: false,
      timeSpent,
      skipped: true
    };
    
    savePatternAttempt(attempt);
    
    // Move to next unit or reset
    setSelectedPatternId("");
    setShowRules(false);
    setUserAttempt("");
    setShowSolution(false);
    setIsCorrect(null);
  };

  const getMasteryForPattern = (patternId: string): PatternMastery | undefined => {
    return patternMastery.find(m => m.patternId === patternId);
  };

  const getMasteryColor = (level: PatternMastery['masteryLevel']): string => {
    switch (level) {
      case 'mastered': return 'text-green-400';
      case 'practicing': return 'text-yellow-400';
      case 'learning': return 'text-orange-400';
      default: return 'text-gray-400';
    }
  };

  const getMasteryIcon = (level: PatternMastery['masteryLevel']): string => {
    switch (level) {
      case 'mastered': return '🏆';
      case 'practicing': return '📈';
      case 'learning': return '🎯';
      default: return '❓';
    }
  };

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
            className="px-3 py-1 bg-purple-600 hover:bg-purple-500 rounded text-sm"
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
                    <span>{getMasteryIcon(level)}</span>
                    <span className={`font-medium ${getMasteryColor(level)}`}>
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
          {/* Thought Unit Display */}
          <div
            className="mb-6 p-4 bg-gray-800 rounded-lg border-l-4 border-blue-400"
            style={{ fontSize: `${fontSize}px`, fontFamily, lineHeight: lineSpacing }}
            onMouseUp={selBind?.onMouseUp}
          >
            <h3 className="text-lg font-semibold text-blue-400 mb-3">Thought Unit Content</h3>
            <div className="leading-relaxed">
              {unitText.split(' ').map((word, idx) => (
                <span
                  key={idx}
                  className="hover:bg-blue-700 hover:bg-opacity-30 cursor-pointer px-0.5 rounded"
                  onClick={() => onWordClick?.(word)}
                >
                  {word}{' '}
                </span>
              ))}
            </div>
          </div>

          {/* Pattern Selection */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-3">🎯 Step 1: Identify the Pattern</h3>
            
            {/* Suggested Patterns */}
            {suggestedPatterns.length > 0 && !selectedPatternId && (
              <div className="mb-4 p-3 bg-purple-900 bg-opacity-30 rounded-lg">
                <h4 className="text-sm font-medium text-purple-400 mb-2">💡 Suggested Patterns:</h4>
                <div className="flex flex-wrap gap-2">
                  {suggestedPatterns.map(pattern => (
                    <button
                      key={pattern.id}
                      onClick={() => handlePatternSelect(pattern.id)}
                      className="px-3 py-1 bg-purple-600 hover:bg-purple-500 rounded text-sm"
                    >
                      {pattern.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Pattern Categories */}
            <div className="space-y-3">
              {Object.entries(PATTERN_CATEGORIES).map(([categoryKey, categoryName]) => (
                <div key={categoryKey}>
                  <h4 className="text-sm font-medium text-gray-400 mb-2">{categoryName}</h4>
                  <div className="flex flex-wrap gap-2">
                    {DAT_PATTERNS.filter(p => p.category === categoryKey).map(pattern => {
                      const mastery = getMasteryForPattern(pattern.id);
                      const isSelected = selectedPatternId === pattern.id;
                      
                      return (
                        <button
                          key={pattern.id}
                          onClick={() => handlePatternSelect(pattern.id)}
                          className={`px-3 py-2 rounded text-sm transition-colors ${
                            isSelected
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {mastery && <span>{getMasteryIcon(mastery.masteryLevel)}</span>}
                            <span>{pattern.name}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Decision Rules Checklist */}
          {showRules && selectedPattern && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-3">📋 Step 2: Apply Decision Rules</h3>
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
              </div>
            </div>
          )}

          {/* User Attempt */}
          {showRules && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-3">✍️ Step 3: Your Reasoning</h3>
              <textarea
                value={userAttempt}
                onChange={(e) => setUserAttempt(e.target.value)}
                placeholder="Apply the decision rules to this thought unit. Walk through your reasoning step by step..."
                className="w-full h-32 p-3 bg-gray-800 rounded-lg border border-gray-600 resize-none"
                disabled={showSolution}
              />
              
              <div className="flex gap-3 mt-3">
                {!showSolution ? (
                  <>
                    <button
                      onClick={handleSubmitAttempt}
                      className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded"
                      disabled={!userAttempt.trim()}
                    >
                      Submit Attempt
                    </button>
                    <button
                      onClick={handleSkip}
                      className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded"
                    >
                      Skip This Unit
                    </button>
                  </>
                ) : (
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleGradeAttempt(true)}
                      className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded"
                      disabled={isCorrect !== null}
                    >
                      ✅ I Got It Right
                    </button>
                    <button
                      onClick={() => handleGradeAttempt(false)}
                      className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded"
                      disabled={isCorrect !== null}
                    >
                      ❌ I Need More Practice
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Solution/Feedback */}
          {showSolution && selectedPattern && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-3">💡 Pattern Application & Examples</h3>
              <div className="p-4 bg-gray-800 rounded-lg">
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

              {isCorrect !== null && (
                <div className={`mt-4 p-3 rounded-lg ${
                  isCorrect ? 'bg-green-900 bg-opacity-50 border border-green-500' : 'bg-red-900 bg-opacity-50 border border-red-500'
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">{isCorrect ? '🎉' : '💪'}</span>
                    <span className="font-semibold">
                      {isCorrect ? 'Great job!' : 'Keep practicing!'}
                    </span>
                  </div>
                  <p className="text-sm">
                    {isCorrect 
                      ? 'You\'re building strong pattern recognition skills. Continue to the next unit!'
                      : 'Pattern recognition takes practice. Review the decision rules and try similar problems.'
                    }
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar - Quick Reference */}
        <div className="w-80 bg-gray-800 p-4 border-l border-gray-700 overflow-y-auto">
          <h3 className="font-semibold mb-4">🔍 Pattern Quick Reference</h3>
          
          {selectedPattern ? (
            <div className="space-y-3">
              <div className="p-3 bg-gray-700 rounded">
                <h4 className="font-medium text-yellow-400">{selectedPattern.name}</h4>
                <p className="text-sm text-gray-300 mt-1">{selectedPattern.description}</p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {selectedPattern.tags.map(tag => (
                    <span key={tag} className="px-2 py-1 bg-gray-600 rounded text-xs">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {DAT_PATTERNS.slice(0, 6).map(pattern => (
                <div key={pattern.id} className="p-2 bg-gray-700 rounded text-sm">
                  <div className="font-medium">{pattern.name}</div>
                  <div className="text-xs text-gray-400">{pattern.category}</div>
                </div>
              ))}
              <div className="text-xs text-gray-500 mt-2">
                Select a pattern above to see detailed rules and examples
              </div>
            </div>
          )}

          {/* Performance Summary */}
          <div className="mt-6">
            <h4 className="font-semibold mb-3">📈 Your Progress</h4>
            <div className="space-y-2">
              {['mastered', 'practicing', 'learning'].map(level => {
                const count = patternMastery.filter(m => m.masteryLevel === level).length;
                const icon = getMasteryIcon(level as PatternMastery['masteryLevel']);
                const color = getMasteryColor(level as PatternMastery['masteryLevel']);
                
                return (
                  <div key={level} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span>{icon}</span>
                      <span className={`text-sm capitalize ${color}`}>{level}</span>
                    </div>
                    <span className="text-sm">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
