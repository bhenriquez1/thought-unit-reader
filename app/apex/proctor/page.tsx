"use client";

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { formatTime, getTimeRemaining, isTimeWarning } from '@/types/apex-exam';
import type { GeneratedExam } from '@/lib/apex/examGenerator';
import type { DATQuestion, ExamAttempt } from '@/types/apex-exam';

interface ProctorState {
  exam: GeneratedExam | null;
  attempt: ExamAttempt | null;
  currentQuestionIndex: number;
  currentSectionIndex: number;
  timeRemaining: number;
  isPaused: boolean;
  responses: Record<string, string>;
  flaggedQuestions: Set<string>;
  startTime: string;
  sectionStartTime: string;
}

export default function ExamProctorPage() {
  const [state, setState] = useState<ProctorState>({
    exam: null,
    attempt: null,
    currentQuestionIndex: 0,
    currentSectionIndex: 0,
    timeRemaining: 0,
    isPaused: false,
    responses: {},
    flaggedQuestions: new Set(),
    startTime: '',
    sectionStartTime: ''
  });

  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const autoSaveRef = useRef<NodeJS.Timeout | null>(null);

  // Load exam from localStorage on mount
  useEffect(() => {
    const examData = localStorage.getItem('currentExam');
    if (examData) {
      try {
        const exam: GeneratedExam = JSON.parse(examData);
        const startTime = new Date().toISOString();
        
        setState(prev => ({
          ...prev,
          exam,
          startTime,
          sectionStartTime: startTime,
          timeRemaining: exam.config.totalTimeLimit * 60 // Convert to seconds
        }));

        // Create initial attempt
        const attempt: Partial<ExamAttempt> = {
          id: `attempt-${Date.now()}`,
          userId: 'demo-user',
          examConfigId: exam.id,
          startTime,
          status: 'in-progress',
          currentSectionIndex: 0,
          currentQuestionIndex: 0,
          totalTimeSpent: 0,
          responses: [],
          sectionTimes: [],
          lastSaved: startTime,
          saveVersion: 1
        };

        setState(prev => ({ ...prev, attempt: attempt as ExamAttempt }));
      } catch (error) {
        console.error('Failed to load exam:', error);
      }
    }
  }, []);

  // Timer effect
  useEffect(() => {
    if (!state.exam || state.isPaused) return;

    timerRef.current = setInterval(() => {
      setState(prev => {
        const newTimeRemaining = prev.timeRemaining - 1;
        
        // Auto-submit when time expires
        if (newTimeRemaining <= 0) {
          handleSubmitExam();
          return prev;
        }

        return { ...prev, timeRemaining: newTimeRemaining };
      });
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [state.exam, state.isPaused]);

  // Auto-save effect
  useEffect(() => {
    if (!state.exam) return;

    autoSaveRef.current = setInterval(() => {
      handleAutoSave();
    }, 30000); // Auto-save every 30 seconds

    return () => {
      if (autoSaveRef.current) {
        clearInterval(autoSaveRef.current);
      }
    };
  }, [state.exam, state.responses]);

  const handleAutoSave = () => {
    if (!state.exam || !state.attempt) return;

    setAutoSaveStatus('saving');
    
    try {
      // Save to localStorage
      const saveData = {
        exam: state.exam,
        attempt: {
          ...state.attempt,
          responses: Object.entries(state.responses).map(([questionId, answer]) => ({
            questionId,
            selectedAnswer: answer as 'A' | 'B' | 'C' | 'D' | 'E',
            timeSpent: 0, // TODO: Track individual question time
            flagged: state.flaggedQuestions.has(questionId),
            timestamp: new Date().toISOString()
          })),
          lastSaved: new Date().toISOString(),
          saveVersion: (state.attempt.saveVersion || 0) + 1
        },
        currentState: {
          currentQuestionIndex: state.currentQuestionIndex,
          currentSectionIndex: state.currentSectionIndex,
          timeRemaining: state.timeRemaining,
          responses: state.responses,
          flaggedQuestions: Array.from(state.flaggedQuestions)
        }
      };

      localStorage.setItem('examProgress', JSON.stringify(saveData));
      setAutoSaveStatus('saved');
    } catch (error) {
      console.error('Auto-save failed:', error);
      setAutoSaveStatus('error');
    }
  };

  const handleAnswerSelect = (questionId: string, answer: string) => {
    setState(prev => ({
      ...prev,
      responses: { ...prev.responses, [questionId]: answer }
    }));
  };

  const handleFlagQuestion = (questionId: string) => {
    setState(prev => {
      const newFlagged = new Set(prev.flaggedQuestions);
      if (newFlagged.has(questionId)) {
        newFlagged.delete(questionId);
      } else {
        newFlagged.add(questionId);
      }
      return { ...prev, flaggedQuestions: newFlagged };
    });
  };

  const handleNavigateQuestion = (direction: 'prev' | 'next' | number) => {
    if (!state.exam) return;

    setState(prev => {
      let newIndex = prev.currentQuestionIndex;
      
      if (direction === 'prev') {
        newIndex = Math.max(0, prev.currentQuestionIndex - 1);
      } else if (direction === 'next') {
        newIndex = Math.min(state.exam!.questions.length - 1, prev.currentQuestionIndex + 1);
      } else if (typeof direction === 'number') {
        newIndex = Math.max(0, Math.min(state.exam!.questions.length - 1, direction));
      }

      return { ...prev, currentQuestionIndex: newIndex };
    });
  };

  const handlePauseToggle = () => {
    if (!state.exam?.config.allowPause) return;
    
    setState(prev => ({ ...prev, isPaused: !prev.isPaused }));
  };

  const handleSubmitExam = () => {
    if (!state.exam || !state.attempt) return;

    // Save final results
    const finalResults = {
      ...state.attempt,
      endTime: new Date().toISOString(),
      status: 'completed' as const,
      responses: Object.entries(state.responses).map(([questionId, answer]) => ({
        questionId,
        selectedAnswer: answer as 'A' | 'B' | 'C' | 'D' | 'E',
        timeSpent: 0,
        flagged: state.flaggedQuestions.has(questionId),
        timestamp: new Date().toISOString()
      }))
    };

    localStorage.setItem('examResults', JSON.stringify(finalResults));
    localStorage.removeItem('currentExam');
    localStorage.removeItem('examProgress');

    // Navigate to results
    window.location.href = '/apex/results';
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (!currentQuestion) return;

      // Number keys for answers
      if (e.key >= '1' && e.key <= '5') {
        const answerIndex = parseInt(e.key) - 1;
        const answers = ['A', 'B', 'C', 'D', 'E'];
        if (answerIndex < Object.keys(currentQuestion.options).length) {
          handleAnswerSelect(currentQuestion.id, answers[answerIndex]);
        }
      }
      
      // Navigation
      if (e.key === 'ArrowLeft' || e.key === 'p') {
        e.preventDefault();
        handleNavigateQuestion('prev');
      } else if (e.key === 'ArrowRight' || e.key === 'n') {
        e.preventDefault();
        handleNavigateQuestion('next');
      }
      
      // Flag question
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        handleFlagQuestion(currentQuestion.id);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [state.currentQuestionIndex, state.exam]);

  if (!state.exam) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold mb-4">No Exam Found</h1>
          <p className="text-gray-300 mb-6">Please generate an exam first.</p>
          <Link 
            href="/apex/generator" 
            className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg font-semibold transition-colors"
          >
            Create Practice Exam
          </Link>
        </div>
      </div>
    );
  }

  const currentQuestion = state.exam.questions[state.currentQuestionIndex];
  const progress = ((state.currentQuestionIndex + 1) / state.exam.questions.length) * 100;
  const isWarningTime = isTimeWarning(state.timeRemaining, state.exam.config.totalTimeLimit * 60);

  if (!currentQuestion) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">❓</div>
          <h1 className="text-2xl font-bold mb-4">Question Not Found</h1>
          <p className="text-gray-300 mb-6">Unable to load the current question.</p>
          <Link 
            href="/apex" 
            className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg font-semibold transition-colors"
          >
            Back to Hub
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 text-white">
      {/* Pause Overlay */}
      {state.isPaused && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-8 text-center">
            <div className="text-4xl mb-4">⏸️</div>
            <h2 className="text-2xl font-bold mb-4">Exam Paused</h2>
            <p className="text-gray-300 mb-6">Click Resume to continue your exam.</p>
            <button
              onClick={handlePauseToggle}
              className="bg-green-600 hover:bg-green-700 px-6 py-3 rounded-lg font-semibold"
            >
              ▶️ Resume Exam
            </button>
          </div>
        </div>
      )}

      {/* Submit Confirmation Modal */}
      {showConfirmSubmit && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-8 max-w-md">
            <h2 className="text-2xl font-bold mb-4 text-red-400">Submit Exam?</h2>
            <p className="text-gray-300 mb-6">
              Are you sure you want to submit your exam? This action cannot be undone.
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => setShowConfirmSubmit(false)}
                className="flex-1 bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitExam}
                className="flex-1 bg-red-600 hover:bg-red-700 px-4 py-2 rounded font-semibold"
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header with Timer and Controls */}
      <div className="bg-gray-800/90 border-b border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-blue-400">⚡ DAT Apex Proctor</h1>
            <div className="text-sm text-gray-300">
              Question {state.currentQuestionIndex + 1} of {state.exam.questions.length}
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Auto-save Status */}
            <div className="flex items-center gap-2 text-sm">
              {autoSaveStatus === 'saving' && (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-400"></div>
                  <span className="text-blue-400">Saving...</span>
                </>
              )}
              {autoSaveStatus === 'saved' && (
                <>
                  <span className="text-green-400">✓</span>
                  <span className="text-green-400">Saved</span>
                </>
              )}
              {autoSaveStatus === 'error' && (
                <>
                  <span className="text-red-400">⚠</span>
                  <span className="text-red-400">Save Error</span>
                </>
              )}
            </div>

            {/* Timer */}
            <div className={`text-lg font-mono px-3 py-1 rounded ${
              isWarningTime ? 'bg-red-600 text-white animate-pulse' : 'bg-gray-700'
            }`}>
              {formatTime(state.timeRemaining)}
            </div>

            {/* Pause Button */}
            {state.exam.config.allowPause && (
              <button
                onClick={handlePauseToggle}
                className={`px-4 py-2 rounded font-semibold ${
                  state.isPaused 
                    ? 'bg-green-600 hover:bg-green-700' 
                    : 'bg-yellow-600 hover:bg-yellow-700'
                }`}
              >
                {state.isPaused ? '▶️ Resume' : '⏸️ Pause'}
              </button>
            )}

            {/* Submit Button */}
            <button
              onClick={() => setShowConfirmSubmit(true)}
              className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded font-semibold"
            >
              Submit Exam
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-3">
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div 
              className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>Progress: {Math.round(progress)}%</span>
            <span>
              Answered: {Object.keys(state.responses).length} / {state.exam.questions.length}
            </span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6">
        <div className="max-w-4xl mx-auto">
          {/* Question */}
          <div className="bg-gray-800/50 rounded-lg p-6 mb-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <span className="bg-blue-600 text-white px-3 py-1 rounded-full text-sm font-semibold">
                  Q{state.currentQuestionIndex + 1}
                </span>
                <span className="text-sm text-gray-400">
                  {currentQuestion.topic} • {currentQuestion.difficulty}
                </span>
              </div>
              <button
                onClick={() => handleFlagQuestion(currentQuestion.id)}
                className={`px-3 py-1 rounded text-sm font-semibold ${
                  state.flaggedQuestions.has(currentQuestion.id)
                    ? 'bg-yellow-600 text-white'
                    : 'bg-gray-600 hover:bg-gray-500 text-gray-300'
                }`}
              >
                🚩 {state.flaggedQuestions.has(currentQuestion.id) ? 'Flagged' : 'Flag'}
              </button>
            </div>

            <div className="text-lg mb-6 leading-relaxed">
              {currentQuestion.stem}
            </div>

            {/* Answer Options */}
            <div className="space-y-3">
              {Object.entries(currentQuestion.options).map(([key, value]) => (
                <label
                  key={key}
                  className={`flex items-start gap-3 p-4 rounded-lg cursor-pointer transition-all ${
                    state.responses[currentQuestion.id] === key
                      ? 'bg-blue-600/20 border-2 border-blue-500'
                      : 'bg-gray-700/30 border-2 border-transparent hover:bg-gray-700/50'
                  }`}
                >
                  <input
                    type="radio"
                    name={`question-${currentQuestion.id}`}
                    value={key}
                    checked={state.responses[currentQuestion.id] === key}
                    onChange={() => handleAnswerSelect(currentQuestion.id, key)}
                    className="mt-1 text-blue-600 focus:ring-blue-500"
                  />
                  <div className="flex-1">
                    <span className="font-semibold text-blue-400 mr-2">{key}.</span>
                    <span>{value}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => handleNavigateQuestion('prev')}
              disabled={state.currentQuestionIndex === 0}
              className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-500 rounded-lg font-semibold transition-colors"
            >
              ← Previous
            </button>

            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">Keyboard shortcuts:</span>
              <span className="text-xs bg-gray-700 px-2 py-1 rounded">1-5: Answer</span>
              <span className="text-xs bg-gray-700 px-2 py-1 rounded">F: Flag</span>
              <span className="text-xs bg-gray-700 px-2 py-1 rounded">←→: Navigate</span>
            </div>

            <button
              onClick={() => handleNavigateQuestion('next')}
              disabled={state.currentQuestionIndex === state.exam.questions.length - 1}
              className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-500 rounded-lg font-semibold transition-colors"
            >
              Next →
            </button>
          </div>

          {/* Question Navigator */}
          <div className="mt-8 bg-gray-800/50 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">Question Navigator</h3>
            <div className="grid grid-cols-10 gap-2">
              {state.exam.questions.map((_, index) => {
                const isAnswered = state.responses[state.exam!.questions[index].id];
                const isFlagged = state.flaggedQuestions.has(state.exam!.questions[index].id);
                const isCurrent = index === state.currentQuestionIndex;
                
                return (
                  <button
                    key={index}
                    onClick={() => handleNavigateQuestion(index)}
                    className={`w-10 h-10 rounded text-sm font-semibold transition-all ${
                      isCurrent
                        ? 'bg-blue-600 text-white ring-2 ring-blue-400'
                        : isAnswered
                        ? 'bg-green-600 text-white hover:bg-green-700'
                        : isFlagged
                        ? 'bg-yellow-600 text-white hover:bg-yellow-700'
                        : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
                    }`}
                  >
                    {index + 1}
                    {isFlagged && <div className="text-xs">🚩</div>}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-6 mt-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-blue-600 rounded"></div>
                <span>Current</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-green-600 rounded"></div>
                <span>Answered</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-yellow-600 rounded"></div>
                <span>Flagged</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-gray-600 rounded"></div>
                <span>Not Answered</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
