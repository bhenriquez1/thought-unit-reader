/**
 * Thought Unit Feedback Component
 * Allows users to provide feedback on thought unit accuracy for AI learning
 */

"use client";

import React, { useState, useEffect } from 'react';
import { aiLearningEngine, type UserFeedback } from '@/lib/aiLearningEngine';
import type { ThoughtUnit } from '@/lib/thoughtUnitExtraction';

interface ThoughtUnitFeedbackProps {
  userId: string;
  bookId: string;
  thoughtUnit: ThoughtUnit;
  pageNumber: number;
  chunkIndex: number;
  surroundingText: string;
  documentType?: string;
  onFeedbackSubmitted?: (feedback: UserFeedback) => void;
  compact?: boolean;
}

export default function ThoughtUnitFeedback({
  userId,
  bookId,
  thoughtUnit,
  pageNumber,
  chunkIndex,
  surroundingText,
  documentType = 'general',
  onFeedbackSubmitted,
  compact = false
}: ThoughtUnitFeedbackProps) {
  const [feedbackType, setFeedbackType] = useState<'correct' | 'incorrect' | 'partial' | 'missing' | null>(null);
  const [correctedText, setCorrectedText] = useState('');
  const [showCorrectionInput, setShowCorrectionInput] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);

  // Auto-hide feedback after submission
  useEffect(() => {
    if (feedbackSubmitted) {
      const timer = setTimeout(() => {
        setShowFeedbackForm(false);
        setFeedbackSubmitted(false);
        setFeedbackType(null);
        setCorrectedText('');
        setShowCorrectionInput(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [feedbackSubmitted]);

  const handleFeedbackTypeChange = (type: 'correct' | 'incorrect' | 'partial' | 'missing') => {
    setFeedbackType(type);
    
    // Show correction input for incorrect or partial feedback
    if (type === 'incorrect' || type === 'partial') {
      setShowCorrectionInput(true);
      setCorrectedText(thoughtUnit.text); // Pre-fill with original text for editing
    } else {
      setShowCorrectionInput(false);
      setCorrectedText('');
    }
  };

  const handleSubmitFeedback = async () => {
    if (!feedbackType) return;

    setIsSubmitting(true);

    try {
      const feedback: Omit<UserFeedback, 'id' | 'timestamp'> = {
        userId,
        bookId,
        thoughtUnitId: thoughtUnit.id,
        feedbackType,
        originalText: thoughtUnit.text,
        correctedText: correctedText.trim() || undefined,
        confidence: thoughtUnit.confidence,
        context: {
          pageNumber,
          chunkIndex,
          surroundingText,
          documentType
        }
      };

      await aiLearningEngine.collectFeedback(feedback);
      
      setFeedbackSubmitted(true);
      onFeedbackSubmitted?.(feedback as UserFeedback);
      
      console.log('🧠 Feedback submitted successfully');
    } catch (error) {
      console.error('Failed to submit feedback:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (compact) {
    return (
      <div className="inline-flex items-center gap-1">
        {!showFeedbackForm ? (
          <button
            onClick={() => setShowFeedbackForm(true)}
            className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white transition-colors"
            title="Provide feedback on this thought unit"
          >
            📝
          </button>
        ) : feedbackSubmitted ? (
          <div className="text-xs px-2 py-1 rounded bg-green-600 text-white">
            ✓ Thanks!
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleFeedbackTypeChange('correct')}
              className={`text-xs px-2 py-1 rounded transition-colors ${
                feedbackType === 'correct' 
                  ? 'bg-green-600 text-white' 
                  : 'bg-gray-700 hover:bg-green-600 text-gray-300 hover:text-white'
              }`}
              title="This thought unit is correct"
            >
              ✓
            </button>
            <button
              onClick={() => handleFeedbackTypeChange('incorrect')}
              className={`text-xs px-2 py-1 rounded transition-colors ${
                feedbackType === 'incorrect' 
                  ? 'bg-red-600 text-white' 
                  : 'bg-gray-700 hover:bg-red-600 text-gray-300 hover:text-white'
              }`}
              title="This thought unit is incorrect"
            >
              ✗
            </button>
            {feedbackType && (
              <button
                onClick={handleSubmitFeedback}
                disabled={isSubmitting}
                className="text-xs px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50"
              >
                {isSubmitting ? '...' : '→'}
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-3 bg-gray-900/50 rounded-lg border border-gray-700">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium text-yellow-400">🧠 AI Learning Feedback</h4>
        <div className="text-xs text-gray-400">
          Confidence: {Math.round(thoughtUnit.confidence * 100)}%
        </div>
      </div>

      {!showFeedbackForm ? (
        <div className="text-center">
          <p className="text-xs text-gray-400 mb-3">
            Help improve thought unit detection accuracy
          </p>
          <button
            onClick={() => setShowFeedbackForm(true)}
            className="text-sm px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white transition-colors"
          >
            Provide Feedback
          </button>
        </div>
      ) : feedbackSubmitted ? (
        <div className="text-center">
          <div className="text-green-400 text-lg mb-2">✓</div>
          <p className="text-sm text-green-300">Thank you for your feedback!</p>
          <p className="text-xs text-gray-400 mt-1">
            The AI will learn from your input to improve accuracy.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <p className="text-xs text-gray-400 mb-2">
              Is this thought unit correctly identified?
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleFeedbackTypeChange('correct')}
                className={`text-sm px-3 py-2 rounded transition-colors ${
                  feedbackType === 'correct'
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-700 hover:bg-green-600 text-gray-300 hover:text-white'
                }`}
              >
                ✓ Correct
              </button>
              <button
                onClick={() => handleFeedbackTypeChange('incorrect')}
                className={`text-sm px-3 py-2 rounded transition-colors ${
                  feedbackType === 'incorrect'
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-700 hover:bg-red-600 text-gray-300 hover:text-white'
                }`}
              >
                ✗ Incorrect
              </button>
              <button
                onClick={() => handleFeedbackTypeChange('partial')}
                className={`text-sm px-3 py-2 rounded transition-colors ${
                  feedbackType === 'partial'
                    ? 'bg-yellow-600 text-white'
                    : 'bg-gray-700 hover:bg-yellow-600 text-gray-300 hover:text-white'
                }`}
              >
                ⚠ Partially Correct
              </button>
              <button
                onClick={() => handleFeedbackTypeChange('missing')}
                className={`text-sm px-3 py-2 rounded transition-colors ${
                  feedbackType === 'missing'
                    ? 'bg-orange-600 text-white'
                    : 'bg-gray-700 hover:bg-orange-600 text-gray-300 hover:text-white'
                }`}
              >
                📍 Missing Main Idea
              </button>
            </div>
          </div>

          {showCorrectionInput && (
            <div>
              <label className="block text-xs text-gray-400 mb-2">
                {feedbackType === 'partial' ? 'Correct version:' : 'What should be highlighted instead?'}
              </label>
              <textarea
                value={correctedText}
                onChange={(e) => setCorrectedText(e.target.value)}
                className="w-full text-sm p-2 rounded bg-gray-800 border border-gray-600 text-white resize-none"
                rows={3}
                placeholder="Enter the corrected text or main idea..."
              />
            </div>
          )}

          {feedbackType && (
            <div className="flex gap-2">
              <button
                onClick={handleSubmitFeedback}
                disabled={isSubmitting || (showCorrectionInput && !correctedText.trim())}
                className="flex-1 text-sm px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
              </button>
              <button
                onClick={() => {
                  setShowFeedbackForm(false);
                  setFeedbackType(null);
                  setCorrectedText('');
                  setShowCorrectionInput(false);
                }}
                className="text-sm px-4 py-2 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {/* Current thought unit preview */}
      <div className="mt-3 p-2 bg-black/20 rounded border border-gray-600">
        <div className="text-xs text-gray-400 mb-1">Current Thought Unit:</div>
        <div className="text-sm text-gray-200 line-clamp-3">
          {thoughtUnit.text}
        </div>
        <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
          <span>Type: {thoughtUnit.type}</span>
          <span>•</span>
          <span>{thoughtUnit.isMainIdea ? 'Main Idea' : 'Supporting Detail'}</span>
        </div>
      </div>
    </div>
  );
}

// Quick feedback buttons for inline use
export function QuickFeedbackButtons({
  userId,
  bookId,
  thoughtUnit,
  pageNumber,
  chunkIndex,
  surroundingText,
  documentType = 'general',
  onFeedbackSubmitted
}: ThoughtUnitFeedbackProps) {
  const [feedbackGiven, setFeedbackGiven] = useState(false);

  const handleQuickFeedback = async (type: 'correct' | 'incorrect') => {
    try {
      const feedback: Omit<UserFeedback, 'id' | 'timestamp'> = {
        userId,
        bookId,
        thoughtUnitId: thoughtUnit.id,
        feedbackType: type,
        originalText: thoughtUnit.text,
        confidence: thoughtUnit.confidence,
        context: {
          pageNumber,
          chunkIndex,
          surroundingText,
          documentType
        }
      };

      await aiLearningEngine.collectFeedback(feedback);
      setFeedbackGiven(true);
      onFeedbackSubmitted?.(feedback as UserFeedback);

      // Auto-hide after 2 seconds
      setTimeout(() => setFeedbackGiven(false), 2000);
    } catch (error) {
      console.error('Failed to submit quick feedback:', error);
    }
  };

  if (feedbackGiven) {
    return (
      <div className="inline-flex items-center gap-1 text-xs text-green-400">
        <span>✓</span>
        <span>Thanks!</span>
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-1">
      <button
        onClick={() => handleQuickFeedback('correct')}
        className="text-xs px-1 py-0.5 rounded hover:bg-green-600/20 text-green-400 hover:text-green-300 transition-colors"
        title="Mark as correct"
      >
        ✓
      </button>
      <button
        onClick={() => handleQuickFeedback('incorrect')}
        className="text-xs px-1 py-0.5 rounded hover:bg-red-600/20 text-red-400 hover:text-red-300 transition-colors"
        title="Mark as incorrect"
      >
        ✗
      </button>
    </div>
  );
}
