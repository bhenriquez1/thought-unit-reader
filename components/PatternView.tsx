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
  const [patternMastery, setPatternMastery] = useState<PatternMastery[]>([]);
  const [showMasteryPanel, setShowMasteryPanel] = useState(false);
  
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
    const unsub = auth.onAuthStateChanged((u) => setUser(u));
    return () => unsub();
  }, []);

  // Load pattern mastery
  useEffect(() => {
    if (userId) {
      loadPatternMastery(userId).then(setPatternMastery);
    }
  }, [userId]);

  // Reset training for new thought unit
  useEffect(() => {
    setTrainingState({
      step: 'content',
      selectedPatternId: null,
      userAttempt: '',
      attemptStartTime: Date.now(),
      isCorrect: null,
      showHint: false,
      attemptsCount: 0
    });
  }, [currentThoughtUnit]);

  // ✅ Simplified validation - main index.tsx handles empty states
  const rawUnit = thoughtUnits[currentThoughtUnit - 1];
  if (!rawUnit) {
    // Fallback to first available unit if current index is out of bounds
    const fallbackUnit = thoughtUnits[0];
    if (!fallbackUnit) {
      return (
        <div
          className="p-4 flex items-center justify-center text-gray-400 italic"
          style={{ fontSize: `${fontSize}px`, fontFamily, lineHeight: lineSpacing }}
        >
          ⏳ Loading content for pattern recognition...
        </div>
      );
    }
  }

  const unitText = unitToText(rawUnit);
  const selectedPattern = trainingState.selectedPatternId ? getPatternById(trainingState.selectedPatternId) : null;
  const suggestedPatterns = useMemo(() => suggestPatterns(unitText), [unitText]);

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
          {/* Step 1: Thought Unit Display */}
          <div
            className="mb-6 p-4 bg-gray-800 rounded-lg border-l-4 border-blue-400"
            style={{ fontSize: `${fontSize}px`, fontFamily, lineHeight: lineSpacing }}
            onMouseUp={selBind?.onMouseUp}
          >
            <h3 className="text-lg font-semibold text-blue-400 mb-3">📖 Step 1: Read the Thought Unit</h3>
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
                      className="px-3 py-1 bg-purple-600 hover:bg-purple-500 rounded text-sm"
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
                      {DAT_PATTERNS.filter(p => p.category === categoryKey).map(pattern => {
                        const mastery = getMasteryForPattern(pattern.id);
                        
                        return (
                          <button
                            key={pattern.id}
                            onClick={() => handlePatternSelect(pattern.id)}
                            className="px-3 py-2 rounded text-sm transition-colors bg-gray-700 hover:bg-gray-600 text-gray-200"
                          >
                            <div className="flex items-center gap-
