"use client";

// components/StudySessionPanel.tsx
// Study Session UI - Flashcard loop with grading and quick questions

import React, { useState, useEffect, useMemo } from 'react';
import { useStudySessionStore, type StudyCard, type CardGrade } from '@/lib/stores/studySessionStore';
import { useAnnotationStore } from '@/lib/stores/annotationStore';

interface StudySessionPanelProps {
  documentId: string;
  documentTitle?: string;
  onNavigateToPage?: (pageIndex: number) => void;
  onClose?: () => void;
}

export default function StudySessionPanel({
  documentId,
  documentTitle = 'Document',
  onNavigateToPage,
  onClose
}: StudySessionPanelProps) {
  const {
    currentSession,
    deck,
    currentCardIndex,
    isRevealed,
    quickQuestion,
    showQuickQuestion,
    startSession,
    endSession,
    revealCard,
    gradeCard,
    skipCard,
    answerQuickQuestion,
    dismissQuickQuestion,
    getSessionStats,
    getDueCards,
    startQuickStudy,
    resumeLastSession,
    getWeakItemsCount,
    hasLastSession
  } = useStudySessionStore();
  
  const { getAllAnnotationsArray } = useAnnotationStore();
  
  // Local state
  const [quickAnswerInput, setQuickAnswerInput] = useState('');
  const [quickAnswerResult, setQuickAnswerResult] = useState<boolean | null>(null);
  
  // Current card
  const currentCard = deck[currentCardIndex];
  const stats = getSessionStats();
  const dueCardsCount = getDueCards(documentId).length;
  
  // Total cards available
  const totalCardsAvailable = useMemo(() => {
    const annotations = getAllAnnotationsArray().filter(a => a.documentId === documentId);
    return annotations.length;
  }, [getAllAnnotationsArray, documentId]);
  
  // Handle starting session
  const handleStartSession = () => {
    startSession(documentId);
  };
  
  // Handle grading
  const handleGrade = (grade: CardGrade) => {
    gradeCard(grade);
  };
  
  // Handle quick question answer
  const handleQuickAnswer = () => {
    const isCorrect = answerQuickQuestion(quickAnswerInput);
    setQuickAnswerResult(isCorrect);
    setTimeout(() => {
      setQuickAnswerResult(null);
      setQuickAnswerInput('');
      dismissQuickQuestion();
    }, 2000);
  };
  
  // Render quick question modal
  if (showQuickQuestion && quickQuestion) {
    return (
      <div className="h-full flex flex-col bg-gray-900 text-white" data-testid="study-quick-question">
        <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gray-800">
          <h3 className="text-lg font-semibold text-yellow-400">⚡ Quick Question</h3>
          <button
            onClick={dismissQuickQuestion}
            className="text-gray-400 hover:text-white"
          >
            Skip →
          </button>
        </div>
        
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="max-w-lg w-full space-y-6">
            <div className="p-4 bg-gray-800 rounded-lg">
              <p className="text-sm text-gray-300 whitespace-pre-wrap">{quickQuestion.question}</p>
            </div>
            
            {quickAnswerResult === null ? (
              <>
                <textarea
                  value={quickAnswerInput}
                  onChange={(e) => setQuickAnswerInput(e.target.value)}
                  placeholder="Type your answer..."
                  className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 resize-none"
                  rows={3}
                  data-testid="quick-answer-input"
                />
                
                <button
                  onClick={handleQuickAnswer}
                  disabled={!quickAnswerInput.trim()}
                  className="w-full px-4 py-3 bg-yellow-500 hover:bg-yellow-400 disabled:bg-gray-600 text-black font-medium rounded-lg transition-colors"
                  data-testid="quick-answer-submit"
                >
                  Check Answer
                </button>
              </>
            ) : (
              <div className={`p-4 rounded-lg text-center ${quickAnswerResult ? 'bg-green-900/50 border border-green-700' : 'bg-red-900/50 border border-red-700'}`}>
                <div className="text-2xl mb-2">{quickAnswerResult ? '✅' : '❌'}</div>
                <p className={`font-medium ${quickAnswerResult ? 'text-green-400' : 'text-red-400'}`}>
                  {quickAnswerResult ? 'Correct!' : 'Not quite...'}
                </p>
                {!quickAnswerResult && (
                  <p className="text-sm text-gray-400 mt-2">
                    Answer: {quickQuestion.correctAnswer.substring(0, 100)}...
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
  
  // Render session start screen
  if (!currentSession) {
    const weakItemsCount = getWeakItemsCount(documentId);
    const canResume = hasLastSession();
    
    return (
      <div className="h-full flex flex-col bg-gray-900 text-white" data-testid="study-start-screen">
        <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gray-800">
          <h3 className="text-lg font-semibold text-green-400">📚 Study Session</h3>
          {onClose && (
            <button onClick={onClose} className="text-gray-400 hover:text-white">
              ✕
            </button>
          )}
        </div>
        
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="text-center max-w-md w-full">
            <div className="text-6xl mb-6">🧠</div>
            <h2 className="text-2xl font-bold mb-4">Ready to Study?</h2>
            <p className="text-gray-400 mb-6">
              Review your highlights and flashcards. Cards marked as weak or missed will appear first.
            </p>
            
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="p-3 bg-gray-800 rounded-lg">
                <div className="text-xl font-bold text-yellow-400">{totalCardsAvailable}</div>
                <div className="text-xs text-gray-400">Total</div>
              </div>
              <div className="p-3 bg-gray-800 rounded-lg">
                <div className="text-xl font-bold text-red-400">{weakItemsCount}</div>
                <div className="text-xs text-gray-400">Weak</div>
              </div>
              <div className="p-3 bg-gray-800 rounded-lg">
                <div className="text-xl font-bold text-blue-400">{dueCardsCount}</div>
                <div className="text-xs text-gray-400">Due</div>
              </div>
            </div>
            
            {/* Quick Study Button - if weak items exist */}
            {weakItemsCount > 0 && (
              <button
                onClick={() => startQuickStudy(documentId, 15)}
                className="w-full px-6 py-4 mb-3 bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-500 hover:to-orange-500 rounded-xl font-semibold text-lg transition-all shadow-lg"
                data-testid="quick-study-btn"
              >
                ⚡ Quick Study ({Math.min(weakItemsCount, 15)} weak items)
              </button>
            )}
            
            {/* Resume Button - if there's a previous session */}
            {canResume && (
              <button
                onClick={() => resumeLastSession()}
                className="w-full px-6 py-3 mb-3 bg-purple-600 hover:bg-purple-500 rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
                data-testid="resume-session-btn"
              >
                ⏯️ Resume Last Session
              </button>
            )}
            
            {/* Full Study Session */}
            <button
              onClick={handleStartSession}
              disabled={totalCardsAvailable === 0}
              className="w-full px-6 py-4 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-xl font-semibold text-lg transition-colors"
              data-testid="study-start-btn"
            >
              {totalCardsAvailable === 0 ? 'No Cards Available' : '▶ Start Full Session'}
            </button>
            
            {totalCardsAvailable === 0 && (
              <p className="text-sm text-gray-500 mt-4">
                Create highlights in Surgeon View to build your study deck
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }
  
  // Render session complete screen
  if (!currentCard || currentCardIndex >= deck.length) {
    return (
      <div className="h-full flex flex-col bg-gray-900 text-white" data-testid="study-complete-screen">
        <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gray-800">
          <h3 className="text-lg font-semibold text-green-400">📚 Session Complete</h3>
        </div>
        
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="text-center max-w-md">
            <div className="text-6xl mb-6">🎉</div>
            <h2 className="text-2xl font-bold mb-4">Great Work!</h2>
            
            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="p-4 bg-gray-800 rounded-lg">
                <div className="text-2xl font-bold text-blue-400">{stats.reviewed}</div>
                <div className="text-xs text-gray-400">Reviewed</div>
              </div>
              <div className="p-4 bg-gray-800 rounded-lg">
                <div className="text-2xl font-bold text-green-400">{stats.correct}</div>
                <div className="text-xs text-gray-400">Correct</div>
              </div>
              <div className="p-4 bg-gray-800 rounded-lg">
                <div className="text-2xl font-bold text-yellow-400">
                  {stats.reviewed > 0 ? Math.round((stats.correct / stats.reviewed) * 100) : 0}%
                </div>
                <div className="text-xs text-gray-400">Accuracy</div>
              </div>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={handleStartSession}
                className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-500 rounded-lg font-medium transition-colors"
                data-testid="study-restart-btn"
              >
                🔄 Study Again
              </button>
              <button
                onClick={endSession}
                className="flex-1 px-4 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium transition-colors"
                data-testid="study-end-btn"
              >
                ✓ Done
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  // Render active study card
  const progressPercent = deck.length > 0 ? ((currentCardIndex + 1) / deck.length) * 100 : 0;
  
  return (
    <div className="h-full flex flex-col bg-gray-900 text-white" data-testid="study-active">
      {/* Header */}
      <div className="p-4 border-b border-gray-700 bg-gray-800">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold text-green-400">📚 Study Session</h3>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">
              {currentCardIndex + 1} / {deck.length}
            </span>
            <button
              onClick={endSession}
              className="text-gray-400 hover:text-white text-sm"
            >
              End
            </button>
          </div>
        </div>
        
        {/* Progress bar */}
        <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
          <div 
            className="h-full bg-green-500 transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>
      
      {/* Card */}
      <div className="flex-1 flex flex-col p-6">
        {/* Card source badge */}
        <div className="flex items-center gap-2 mb-4">
          <span className={`px-2 py-1 rounded text-xs font-medium ${
            currentCard.source === 'quiz-miss' ? 'bg-red-600' :
            currentCard.source === 'flashcard' ? 'bg-purple-600' :
            'bg-yellow-600 text-black'
          }`}>
            {currentCard.source === 'quiz-miss' ? '⚠️ Weak' :
             currentCard.source === 'flashcard' ? '📇 Flashcard' :
             '🔆 Highlight'}
          </span>
          {currentCard.reviewCount > 0 && (
            <span className="text-xs text-gray-500">
              Reviewed {currentCard.reviewCount}x
            </span>
          )}
        </div>
        
        {/* Front side */}
        <div 
          className="flex-1 flex flex-col"
          onClick={() => !isRevealed && revealCard()}
        >
          <div className="flex-1 p-6 bg-gray-800 rounded-xl cursor-pointer hover:bg-gray-750 transition-colors">
            <div className="text-center">
              <p className="text-lg text-white leading-relaxed">
                {currentCard.front}
              </p>
            </div>
          </div>
          
          {/* Back side (revealed) */}
          {isRevealed && (
            <div className="mt-4 p-6 bg-gray-700 rounded-xl border-t-4 border-green-500">
              <div className="text-sm text-gray-400 mb-2">Answer:</div>
              <p className="text-white">
                {currentCard.back}
              </p>
            </div>
          )}
        </div>
        
        {/* Actions */}
        <div className="mt-6">
          {!isRevealed ? (
            <button
              onClick={revealCard}
              className="w-full px-4 py-4 bg-blue-600 hover:bg-blue-500 rounded-xl font-semibold text-lg transition-colors"
              data-testid="study-reveal-btn"
            >
              Tap to Reveal
            </button>
          ) : (
            <div className="space-y-3">
              <p className="text-center text-sm text-gray-400 mb-2">How well did you know this?</p>
              <div className="grid grid-cols-4 gap-2">
                <button
                  onClick={() => handleGrade('again')}
                  className="px-3 py-3 bg-red-600 hover:bg-red-500 rounded-lg font-medium transition-colors text-sm"
                  data-testid="grade-again-btn"
                >
                  🔄 Again
                </button>
                <button
                  onClick={() => handleGrade('hard')}
                  className="px-3 py-3 bg-orange-600 hover:bg-orange-500 rounded-lg font-medium transition-colors text-sm"
                  data-testid="grade-hard-btn"
                >
                  😓 Hard
                </button>
                <button
                  onClick={() => handleGrade('good')}
                  className="px-3 py-3 bg-blue-600 hover:bg-blue-500 rounded-lg font-medium transition-colors text-sm"
                  data-testid="grade-good-btn"
                >
                  👍 Good
                </button>
                <button
                  onClick={() => handleGrade('easy')}
                  className="px-3 py-3 bg-green-600 hover:bg-green-500 rounded-lg font-medium transition-colors text-sm"
                  data-testid="grade-easy-btn"
                >
                  ✅ Easy
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Stats footer */}
      <div className="p-4 border-t border-gray-700 bg-gray-800">
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">
            ✅ {stats.correct} correct
          </span>
          <span className="text-gray-400">
            📚 {stats.remaining} remaining
          </span>
        </div>
      </div>
    </div>
  );
}
