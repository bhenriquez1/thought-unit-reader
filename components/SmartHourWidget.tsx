"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { safeSetItem } from '@/lib/storage/safeStorage';
import { auth } from '@/lib/firebase';
import type { User } from 'firebase/auth';

export interface SmartHourSession {
  id: string;
  userId: string;
  startTime: string;
  endTime?: string;
  focusDuration: number; // minutes
  breakDuration: number; // minutes
  completedSteps: string[];
  clarityRating?: number; // 1-5
  totalMinutes: number;
  sessionType: 'focus' | 'break';
  notes?: string;
}

interface SmartHourWidgetProps {
  onSessionComplete?: (session: SmartHourSession) => void;
  className?: string;
}

const FOCUS_DURATION = 50 * 60; // 50 minutes in seconds
const BREAK_DURATION = 10 * 60; // 10 minutes in seconds

const FOCUS_STEPS = [
  'Define Pattern',
  'Write Rule',
  'Explain Why',
  'Review Detail',
  'Reflect'
];

export default function SmartHourWidget({ onSessionComplete, className = "" }: SmartHourWidgetProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [sessionType, setSessionType] = useState<'focus' | 'break'>('focus');
  const [timeRemaining, setTimeRemaining] = useState(FOCUS_DURATION);
  const [currentSession, setCurrentSession] = useState<SmartHourSession | null>(null);
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [sessionCount, setSessionCount] = useState(0);
  const [clarityRating, setClarityRating] = useState<number>(0);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [sessionNotes, setSessionNotes] = useState("");

  // Auth
  useEffect(() => {
    const unsubscribe = auth?.onAuthStateChanged((u) => setUser(u));
    return () => unsubscribe?.();
  }, []);

  // Load session data from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedCount = localStorage.getItem('smartHour-sessionCount');
      if (savedCount) {
        setSessionCount(parseInt(savedCount, 10));
      }
    }
  }, []);

  // Timer logic
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    
    if (isActive && timeRemaining > 0) {
      interval = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) {
            handleSessionComplete();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isActive, timeRemaining]);

  const startSession = useCallback(() => {
    if (!user) return;

    const newSession: SmartHourSession = {
      id: `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      userId: user.uid,
      startTime: new Date().toISOString(),
      focusDuration: sessionType === 'focus' ? 50 : 0,
      breakDuration: sessionType === 'break' ? 10 : 0,
      completedSteps: [],
      totalMinutes: sessionType === 'focus' ? 50 : 10,
      sessionType,
    };

    setCurrentSession(newSession);
    setIsActive(true);
    setTimeRemaining(sessionType === 'focus' ? FOCUS_DURATION : BREAK_DURATION);
    setCompletedSteps([]);
    setClarityRating(0);
    setSessionNotes("");

    console.log(`🕐 Smart-Hour: Starting ${sessionType} session`);
  }, [user, sessionType]);

  const pauseSession = useCallback(() => {
    setIsActive(false);
  }, []);

  const resumeSession = useCallback(() => {
    setIsActive(true);
  }, []);

  const stopSession = useCallback(() => {
    if (currentSession) {
      handleSessionComplete();
    }
  }, [currentSession]);

  const handleSessionComplete = useCallback(() => {
    if (!currentSession) return;

    setIsActive(false);

    const completedSession: SmartHourSession = {
      ...currentSession,
      endTime: new Date().toISOString(),
      completedSteps,
      clarityRating,
      notes: sessionNotes,
    };

    // Save session data
    saveSession(completedSession);
    
    // Update session count
    if (sessionType === 'focus') {
      const newCount = sessionCount + 1;
      setSessionCount(newCount);
      if (typeof window !== 'undefined') {
        safeSetItem('smartHour-sessionCount', newCount.toString());
      }

      // Show rating modal for focus sessions
      setShowRatingModal(true);
    } else {
      // Auto-switch to focus after break
      setSessionType('focus');
      setTimeRemaining(FOCUS_DURATION);
    }

    onSessionComplete?.(completedSession);
    setCurrentSession(null);
  }, [currentSession, completedSteps, clarityRating, sessionNotes, sessionType, sessionCount, onSessionComplete]);

  const saveSession = async (session: SmartHourSession) => {
    try {
      // In a real implementation, this would save to Firestore
      const existingSessions = JSON.parse(localStorage.getItem('smartHour-sessions') || '[]');
      existingSessions.push(session);
      safeSetItem('smartHour-sessions', JSON.stringify(existingSessions));
      
      console.log(`💾 Smart-Hour: Session saved`, session);
    } catch (error) {
      console.error('Failed to save Smart-Hour session:', error);
    }
  };

  const toggleStep = useCallback((step: string) => {
    setCompletedSteps(prev => 
      prev.includes(step) 
        ? prev.filter(s => s !== step)
        : [...prev, step]
    );
  }, []);

  const handleClaritySubmit = useCallback(() => {
    setShowRatingModal(false);
    
    // Auto-start break session after focus completion
    setTimeout(() => {
      setSessionType('break');
      setTimeRemaining(BREAK_DURATION);
    }, 1000);
  }, []);

  const resetWidget = useCallback(() => {
    setIsActive(false);
    setCurrentSession(null);
    setTimeRemaining(FOCUS_DURATION);
    setSessionType('focus');
    setCompletedSteps([]);
    setClarityRating(0);
    setSessionNotes("");
  }, []);

  // Format time display
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const progressPercentage = sessionType === 'focus' 
    ? ((FOCUS_DURATION - timeRemaining) / FOCUS_DURATION) * 100
    : ((BREAK_DURATION - timeRemaining) / BREAK_DURATION) * 100;

  if (!user) {
    return (
      <div className={`bg-gray-800 rounded-lg p-4 border border-gray-600 ${className}`}>
        <div className="text-center text-gray-400">
          <p className="text-sm">Sign in to use Smart-Hour Protocol</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={`bg-gray-800 rounded-lg p-4 border border-gray-600 ${className}`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-green-400">
            ⏱️ Smart-Hour Protocol
          </h3>
          <div className="text-xs text-gray-400">
            Sessions: {sessionCount}
          </div>
        </div>

        {/* Timer Display */}
        <div className="text-center mb-4">
          <div className="relative w-24 h-24 mx-auto mb-2">
            <svg className="w-24 h-24 transform -rotate-90">
              <circle
                cx="48"
                cy="48"
                r="40"
                stroke="currentColor"
                strokeWidth="4"
                fill="transparent"
                className="text-gray-600"
              />
              <circle
                cx="48"
                cy="48"
                r="40"
                stroke="currentColor"
                strokeWidth="4"
                fill="transparent"
                strokeDasharray={`${2 * Math.PI * 40}`}
                strokeDashoffset={`${2 * Math.PI * 40 * (1 - progressPercentage / 100)}`}
                className={sessionType === 'focus' ? 'text-green-400' : 'text-blue-400'}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-lg font-mono text-white">
                {formatTime(timeRemaining)}
              </span>
            </div>
          </div>
          
          <div className={`text-sm font-medium ${
            sessionType === 'focus' ? 'text-green-400' : 'text-blue-400'
          }`}>
            {sessionType === 'focus' ? '🎯 Focus Block' : '☕ Break Time'} 
          </div>
        </div>

        {/* Session Controls */}
        <div className="flex gap-2 mb-4">
          {!isActive && !currentSession && (
            <button
              onClick={startSession}
              className={`flex-1 py-2 px-3 rounded text-sm font-medium ${
                sessionType === 'focus' 
                  ? 'bg-green-600 hover:bg-green-500 text-white' 
                  : 'bg-blue-600 hover:bg-blue-500 text-white'
              }`}
            >
              Start {sessionType === 'focus' ? 'Focus' : 'Break'}
            </button>
          )}
          
          {isActive && (
            <>
              <button
                onClick={pauseSession}
                className="flex-1 py-2 px-3 bg-yellow-600 hover:bg-yellow-500 rounded text-sm font-medium text-white"
              >
                Pause
              </button>
              <button
                onClick={stopSession}
                className="flex-1 py-2 px-3 bg-red-600 hover:bg-red-500 rounded text-sm font-medium text-white"
              >
                Stop
              </button>
            </>
          )}
          
          {!isActive && currentSession && (
            <button
              onClick={resumeSession}
              className="flex-1 py-2 px-3 bg-green-600 hover:bg-green-500 rounded text-sm font-medium text-white"
            >
              Resume
            </button>
          )}
          
          <button
            onClick={resetWidget}
            className="px-3 py-2 bg-gray-600 hover:bg-gray-500 rounded text-sm text-white"
            title="Reset"
          >
            ↻
          </button>
        </div>

        {/* Session Type Toggle */}
        {!isActive && !currentSession && (
          <div className="flex gap-1 mb-4">
            <button
              onClick={() => {
                setSessionType('focus');
                setTimeRemaining(FOCUS_DURATION);
              }}
              className={`flex-1 py-1 px-2 rounded text-xs ${
                sessionType === 'focus' 
                  ? 'bg-green-600 text-white' 
                  : 'bg-gray-700 text-gray-300'
              }`}
            >
              Focus (50min)
            </button>
            <button
              onClick={() => {
                setSessionType('break');
                setTimeRemaining(BREAK_DURATION);
              }}
              className={`flex-1 py-1 px-2 rounded text-xs ${
                sessionType === 'break' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-700 text-gray-300'
              }`}
            >
              Break (10min)
            </button>
          </div>
        )}

        {/* Focus Steps Checklist */}
        {sessionType === 'focus' && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-gray-300 mb-2">Focus Checklist:</h4>
            {FOCUS_STEPS.map((step, index) => (
              <label key={step} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={completedSteps.includes(step)}
                  onChange={() => toggleStep(step)}
                  className="w-4 h-4 text-green-400 bg-gray-700 border-gray-600 rounded focus:ring-green-400 focus:ring-2"
                />
                <span className={`${
                  completedSteps.includes(step) ? 'text-green-400 line-through' : 'text-gray-300'
                }`}>
                  {index + 1}. {step}
                </span>
              </label>
            ))}
            <div className="text-xs text-gray-400 mt-2">
              Completed: {completedSteps.length}/{FOCUS_STEPS.length}
            </div>
          </div>
        )}

        {/* Break Message */}
        {sessionType === 'break' && isActive && (
          <div className="text-center text-blue-400 text-sm">
            <p>Take a break! Stretch, hydrate, or take a short walk.</p>
            <p className="text-xs text-gray-400 mt-1">
              Focus session will start automatically after break.
            </p>
          </div>
        )}
      </div>

      {/* Clarity Rating Modal */}
      {showRatingModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-green-400 mb-4">
              Session Complete! 🎉
            </h3>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Rate your clarity (1-5):
              </label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map(rating => (
                  <button
                    key={rating}
                    onClick={() => setClarityRating(rating)}
                    className={`w-10 h-10 rounded-full text-sm font-medium ${
                      clarityRating === rating
                        ? 'bg-green-500 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {rating}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Session notes (optional):
              </label>
              <textarea
                value={sessionNotes}
                onChange={(e) => setSessionNotes(e.target.value)}
                placeholder="What did you accomplish? Any insights?"
                rows={3}
                className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-sm text-white"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleClaritySubmit}
                disabled={clarityRating === 0}
                className="flex-1 py-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed rounded text-sm font-medium text-white"
              >
                Complete & Start Break
              </button>
              <button
                onClick={() => setShowRatingModal(false)}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded text-sm text-white"
              >
                Skip
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
