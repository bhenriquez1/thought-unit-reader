// components/cognitiveEngine/ReasoningLoopFlow.tsx
// 6-Step Clinical Reasoning Loop
// Perception → Interpretation → Reasoning Prompt → Application → Feedback → Storage

import React, { useState, useCallback } from 'react';
import type {
  ReasoningLoop,
  ReasoningStep,
  ApplicationStep,
  FeedbackStep,
  ReasoningEvaluation,
} from '../../lib/cognitiveEngine/types';
import { useCognitiveEngineStore } from '../../lib/cognitiveEngine/store';

interface ReasoningLoopFlowProps {
  loop: ReasoningLoop;
  onComplete: () => void;
  onAbandon: () => void;
}

const STEPS: { key: ReasoningStep; label: string; icon: string }[] = [
  { key: 'perception', label: 'Perception', icon: '👁️' },
  { key: 'interpretation', label: 'Interpretation', icon: '💡' },
  { key: 'reasoning_prompt', label: 'Reasoning', icon: '🧠' },
  { key: 'application', label: 'Application', icon: '✍️' },
  { key: 'feedback', label: 'Feedback', icon: '📊' },
  { key: 'storage', label: 'Storage', icon: '💾' },
];

export const ReasoningLoopFlow: React.FC<ReasoningLoopFlowProps> = ({
  loop,
  onComplete,
  onAbandon,
}) => {
  const {
    advanceReasoningLoop,
    submitApplication,
    provideFeedback,
    completeReasoningLoop,
  } = useCognitiveEngineStore();

  const [userAnswer, setUserAnswer] = useState('');
  const [confidence, setConfidence] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [isProcessing, setIsProcessing] = useState(false);

  const currentStepIndex = STEPS.findIndex((s) => s.key === loop.currentStep);

  const handleSubmitApplication = useCallback(async () => {
    if (!userAnswer.trim()) return;

    setIsProcessing(true);

    const application: ApplicationStep = {
      userAnswer: userAnswer.trim(),
      responseTimeMs: Date.now() - loop.startedAt,
      confidenceRating: confidence,
    };

    submitApplication(loop.id, application);

    // Simulate AI feedback generation
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Generate mock feedback (in production, this would be AI-generated)
    const mockFeedback: FeedbackStep = {
      evaluation: generateMockEvaluation(userAnswer),
      improvementSuggestion: 'Consider also thinking about the broader clinical context.',
      refinedReasoning: 'When this pattern appears, prioritize systematic assessment.',
      nextLevelThinking: 'How would this change your approach in an emergency setting?',
    };

    provideFeedback(loop.id, mockFeedback);
    setIsProcessing(false);
  }, [userAnswer, confidence, loop, submitApplication, provideFeedback]);

  const handleComplete = useCallback(() => {
    completeReasoningLoop(loop.id);
    onComplete();
  }, [loop.id, completeReasoningLoop, onComplete]);

  return (
    <div className="bg-white rounded-xl border border-purple-200 overflow-hidden">
      {/* Step Progress */}
      <div className="bg-gradient-to-r from-purple-50 to-blue-50 p-4 border-b border-purple-100">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold text-gray-900 flex items-center gap-2">
            <span>🧠</span> Clinical Reasoning Loop
          </h3>
          <button
            onClick={onAbandon}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            Skip
          </button>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center gap-1">
          {STEPS.map((step, idx) => (
            <div key={step.key} className="flex-1 flex items-center">
              <div
                className={`
                  w-full h-2 rounded-full transition-colors
                  ${idx < currentStepIndex
                    ? 'bg-purple-500'
                    : idx === currentStepIndex
                    ? 'bg-purple-400'
                    : 'bg-gray-200'
                  }
                `}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-1">
          {STEPS.map((step, idx) => (
            <span
              key={step.key}
              className={`text-xs ${
                idx <= currentStepIndex ? 'text-purple-600' : 'text-gray-400'
              }`}
            >
              {step.icon}
            </span>
          ))}
        </div>
      </div>

      {/* Step Content */}
      <div className="p-4">
        {/* Step 1: Perception */}
        {loop.currentStep === 'perception' && (
          <StepContent
            title="Pattern Detected"
            icon="👁️"
            description="You've identified a significant pattern in the content."
          >
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <p className="text-gray-800 font-medium">{loop.perception.pattern}</p>
              <p className="text-sm text-gray-500 mt-2">
                Confidence: {Math.round(loop.perception.confidence * 100)}%
              </p>
            </div>
            <button
              onClick={() => advanceReasoningLoop(loop.id)}
              className="mt-4 w-full py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors"
            >
              Continue to Interpretation
            </button>
          </StepContent>
        )}

        {/* Step 2: Interpretation */}
        {loop.currentStep === 'interpretation' && (
          <StepContent
            title="Understanding the Insight"
            icon="💡"
            description="Here's what this pattern means and why it matters."
          >
            <div className="space-y-3">
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                <h4 className="text-xs font-semibold text-blue-600 uppercase mb-1">
                  What It Means
                </h4>
                <p className="text-gray-800">{loop.interpretation.insight.concept}</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-4 border border-amber-100">
                <h4 className="text-xs font-semibold text-amber-600 uppercase mb-1">
                  Why It Matters
                </h4>
                <p className="text-gray-800">{loop.interpretation.significance}</p>
              </div>
            </div>
            <button
              onClick={() => advanceReasoningLoop(loop.id)}
              className="mt-4 w-full py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors"
            >
              Continue to Reasoning Challenge
            </button>
          </StepContent>
        )}

        {/* Step 3: Reasoning Prompt */}
        {loop.currentStep === 'reasoning_prompt' && (
          <StepContent
            title="Your Turn to Think"
            icon="🧠"
            description="Apply your clinical reasoning to this pattern."
          >
            <div className="bg-purple-50 rounded-lg p-4 border border-purple-200 mb-4">
              <p className="text-gray-800 font-medium text-lg">
                {loop.reasoningPrompt.prompt}
              </p>
            </div>

            {/* Hints */}
            {loop.reasoningPrompt.hints.length > 0 && (
              <div className="mb-4">
                <p className="text-xs text-gray-500 mb-1">Hints:</p>
                <ul className="list-disc list-inside text-sm text-gray-600">
                  {loop.reasoningPrompt.hints.map((hint, idx) => (
                    <li key={idx}>{hint}</li>
                  ))}
                </ul>
              </div>
            )}

            <button
              onClick={() => advanceReasoningLoop(loop.id)}
              className="w-full py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors"
            >
              I'm Ready to Answer
            </button>
          </StepContent>
        )}

        {/* Step 4: Application */}
        {loop.currentStep === 'application' && (
          <StepContent
            title="Apply Your Reasoning"
            icon="✍️"
            description="Write your answer and rate your confidence."
          >
            <div className="space-y-4">
              <div className="bg-purple-50 rounded-lg p-3 border border-purple-200">
                <p className="text-gray-800 font-medium text-sm">
                  {loop.reasoningPrompt.prompt}
                </p>
              </div>

              <textarea
                value={userAnswer}
                onChange={(e) => setUserAnswer(e.target.value)}
                placeholder="Type your clinical reasoning here..."
                className="w-full h-32 p-3 border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
                disabled={isProcessing}
              />

              {/* Confidence Rating */}
              <div>
                <label className="text-sm text-gray-600 block mb-2">
                  How confident are you?
                </label>
                <div className="flex gap-2">
                  {([1, 2, 3, 4, 5] as const).map((level) => (
                    <button
                      key={level}
                      onClick={() => setConfidence(level)}
                      className={`
                        flex-1 py-2 rounded-lg text-sm font-medium transition-colors
                        ${confidence === level
                          ? 'bg-purple-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }
                      `}
                    >
                      {level}
                    </button>
                  ))}
                </div>
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>Guessing</span>
                  <span>Very Confident</span>
                </div>
              </div>

              <button
                onClick={handleSubmitApplication}
                disabled={!userAnswer.trim() || isProcessing}
                className="w-full py-3 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="animate-spin">⚙️</span> Analyzing...
                  </span>
                ) : (
                  'Submit for Feedback'
                )}
              </button>
            </div>
          </StepContent>
        )}

        {/* Step 5: Feedback */}
        {loop.currentStep === 'feedback' && loop.feedback && (
          <StepContent
            title="AI Feedback"
            icon="📊"
            description="Here's how your reasoning measures up."
          >
            <FeedbackDisplay feedback={loop.feedback} />
            <button
              onClick={() => advanceReasoningLoop(loop.id)}
              className="mt-4 w-full py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors"
            >
              Save & Complete
            </button>
          </StepContent>
        )}

        {/* Step 6: Storage */}
        {loop.currentStep === 'storage' && (
          <StepContent
            title="Stored for Mastery"
            icon="💾"
            description="This reasoning has been saved for future training."
          >
            <div className="bg-green-50 rounded-lg p-4 border border-green-200 text-center">
              <span className="text-4xl">✅</span>
              <h4 className="font-semibold text-green-700 mt-2">
                Reasoning Loop Complete!
              </h4>
              <p className="text-sm text-green-600 mt-1">
                This insight is now linked to your Study Mode for reinforcement.
              </p>
            </div>
            <button
              onClick={handleComplete}
              className="mt-4 w-full py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
            >
              Done
            </button>
          </StepContent>
        )}
      </div>
    </div>
  );
};

// Step Content Wrapper
const StepContent: React.FC<{
  title: string;
  icon: string;
  description: string;
  children: React.ReactNode;
}> = ({ title, icon, description, children }) => (
  <div>
    <div className="mb-4">
      <h4 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
        <span>{icon}</span> {title}
      </h4>
      <p className="text-sm text-gray-500">{description}</p>
    </div>
    {children}
  </div>
);

// Feedback Display Component
const FeedbackDisplay: React.FC<{ feedback: FeedbackStep }> = ({ feedback }) => {
  const { evaluation } = feedback;

  return (
    <div className="space-y-4">
      {/* Quality Score */}
      <div className="bg-white rounded-lg p-4 border border-gray-200">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">Overall Quality</span>
          <span className={`text-2xl font-bold ${
            evaluation.qualityScore >= 70 ? 'text-green-600' :
            evaluation.qualityScore >= 40 ? 'text-yellow-600' : 'text-red-600'
          }`}>
            {evaluation.qualityScore}%
          </span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              evaluation.qualityScore >= 70 ? 'bg-green-500' :
              evaluation.qualityScore >= 40 ? 'bg-yellow-500' : 'bg-red-500'
            }`}
            style={{ width: `${evaluation.qualityScore}%` }}
          />
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-3 gap-2">
        <MetricCard label="Accuracy" score={evaluation.accuracy.score} />
        <MetricCard label="Depth" score={evaluation.depth.score} />
        <MetricCard label="Logic" score={evaluation.clinicalLogic.score} />
      </div>

      {/* Improvement Suggestion */}
      <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
        <h5 className="text-xs font-semibold text-blue-600 uppercase mb-1">
          Improvement Suggestion
        </h5>
        <p className="text-sm text-gray-800">{feedback.improvementSuggestion}</p>
      </div>

      {/* Refined Reasoning */}
      <div className="bg-purple-50 rounded-lg p-3 border border-purple-100">
        <h5 className="text-xs font-semibold text-purple-600 uppercase mb-1">
          Refined Reasoning
        </h5>
        <p className="text-sm text-gray-800">{feedback.refinedReasoning}</p>
      </div>

      {/* Next Level Thinking */}
      {feedback.nextLevelThinking && (
        <div className="bg-amber-50 rounded-lg p-3 border border-amber-100">
          <h5 className="text-xs font-semibold text-amber-600 uppercase mb-1">
            Next Level Challenge
          </h5>
          <p className="text-sm text-gray-800 italic">{feedback.nextLevelThinking}</p>
        </div>
      )}

      {/* Cognitive Trap Warning */}
      {evaluation.cognitiveTrap && (
        <div className="bg-red-50 rounded-lg p-3 border border-red-200">
          <h5 className="text-xs font-semibold text-red-600 uppercase mb-1">
            ⚠️ Cognitive Trap Detected
          </h5>
          <p className="text-sm text-gray-800 mb-1">{evaluation.cognitiveTrap.description}</p>
          <p className="text-sm text-red-700 font-medium">
            Correction: {evaluation.cognitiveTrap.correction}
          </p>
        </div>
      )}
    </div>
  );
};

// Metric Card
const MetricCard: React.FC<{ label: string; score: number }> = ({ label, score }) => (
  <div className="bg-gray-50 rounded-lg p-2 text-center">
    <div className={`text-lg font-bold ${
      score >= 70 ? 'text-green-600' : score >= 40 ? 'text-yellow-600' : 'text-red-600'
    }`}>
      {score}
    </div>
    <div className="text-xs text-gray-500">{label}</div>
  </div>
);

// Helper function to generate mock evaluation
function generateMockEvaluation(answer: string): ReasoningEvaluation {
  const length = answer.length;
  const hasKeywords = /clinical|patient|assess|diagnos|treat|consider/i.test(answer);

  const baseScore = Math.min(100, Math.max(30, 40 + length / 5 + (hasKeywords ? 20 : 0)));

  return {
    qualityScore: Math.round(baseScore),
    accuracy: {
      score: Math.round(baseScore + Math.random() * 10 - 5),
      feedback: 'Good identification of key factors.',
    },
    depth: {
      score: Math.round(baseScore - 5 + Math.random() * 10),
      feedback: length > 100 ? 'Thorough analysis.' : 'Consider expanding your reasoning.',
    },
    clinicalLogic: {
      score: Math.round(baseScore + (hasKeywords ? 10 : -10)),
      feedback: hasKeywords ? 'Strong clinical reasoning.' : 'Include more clinical context.',
    },
    missingFactors: length < 50 ? ['Differential diagnoses', 'Patient history considerations'] : [],
    cognitiveTrap: Math.random() > 0.7 ? {
      type: 'anchoring',
      description: 'You may be anchoring on the first piece of information.',
      correction: 'Consider alternative explanations before settling on a conclusion.',
    } : undefined,
  };
}

export default ReasoningLoopFlow;
