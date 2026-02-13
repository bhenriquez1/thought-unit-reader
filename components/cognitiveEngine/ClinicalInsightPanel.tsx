// components/cognitiveEngine/ClinicalInsightPanel.tsx
// Clinical Insight Panel - Perception Engine Output
// NOT notes - this is pattern detection, decision logic, clinical insight extraction

import React, { useState, useCallback } from 'react';
import type {
  ClinicalInsight,
  DecisionRule,
  ReasoningLoop,
  ReasoningStep,
} from '../../lib/cognitiveEngine/types';
import { useCognitiveEngineStore } from '../../lib/cognitiveEngine/store';

interface ClinicalInsightPanelProps {
  insight: ClinicalInsight;
  onClose: () => void;
  onSendToNoteLab: (insight: ClinicalInsight) => void;
  onTrainInStudyMode: (insight: ClinicalInsight) => void;
  onJumpToSource: () => void;
}

export const ClinicalInsightPanel: React.FC<ClinicalInsightPanelProps> = ({
  insight,
  onClose,
  onSendToNoteLab,
  onTrainInStudyMode,
  onJumpToSource,
}) => {
  const {
    startReasoningLoop,
    getCurrentLoop,
    submitApplication,
    completeReasoningLoop,
    getRelatedInsights,
    insightPanel,
  } = useCognitiveEngineStore();

  const [showReasoningPrompt, setShowReasoningPrompt] = useState(false);
  const [userAnswer, setUserAnswer] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const relatedInsights = getRelatedInsights(insight.id);
  const currentLoop = getCurrentLoop();

  const handleStartReasoning = useCallback(() => {
    startReasoningLoop(insight.id);
    setShowReasoningPrompt(true);
  }, [insight.id, startReasoningLoop]);

  const handleSubmitAnswer = useCallback(async () => {
    if (!currentLoop || !userAnswer.trim()) return;

    setIsSubmitting(true);

    // Submit the application step
    submitApplication(currentLoop.id, {
      userAnswer: userAnswer.trim(),
      responseTimeMs: Date.now() - currentLoop.startedAt,
      confidenceRating: 3, // Default to medium confidence
    });

    // In production, this would call AI for feedback
    // For now, simulate completion
    setTimeout(() => {
      completeReasoningLoop(currentLoop.id);
      setIsSubmitting(false);
      setShowReasoningPrompt(false);
      setUserAnswer('');
    }, 1000);
  }, [currentLoop, userAnswer, submitApplication, completeReasoningLoop]);

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-white shadow-xl border-l border-gray-200 z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gradient-to-r from-purple-50 to-blue-50">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🧠</span>
          <h2 className="font-bold text-gray-900">CLINICAL INSIGHT</h2>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Concept */}
        <section className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Concept
          </h3>
          <p className="text-gray-900 font-medium">{insight.concept}</p>
        </section>

        {/* Why It Matters */}
        <section className="bg-blue-50 rounded-lg border border-blue-100 p-4">
          <h3 className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-2">
            Why It Matters
          </h3>
          <p className="text-gray-800">{insight.whyItMatters}</p>
        </section>

        {/* Clinical Pearl */}
        {insight.clinicalPearl && (
          <section className="bg-amber-50 rounded-lg border border-amber-200 p-4">
            <h3 className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2 flex items-center gap-1">
              <span>💎</span> Clinical Pearl
            </h3>
            <p className="text-gray-800 font-medium">{insight.clinicalPearl}</p>
          </section>
        )}

        {/* Decision Rule */}
        {insight.decisionRule && (
          <section className="bg-green-50 rounded-lg border border-green-200 p-4">
            <h3 className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-2 flex items-center gap-1">
              <span>⚡</span> Decision Rule
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <span className="font-bold text-green-700">IF:</span>
                <span className="text-gray-800">{insight.decisionRule.ifCondition}</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="font-bold text-green-700">THEN:</span>
                <span className="text-gray-800">{insight.decisionRule.thenAction}</span>
              </div>
              {insight.decisionRule.confirmWith && (
                <div className="flex items-start gap-2">
                  <span className="font-bold text-green-700">CONFIRM:</span>
                  <span className="text-gray-800">{insight.decisionRule.confirmWith}</span>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Risk Signal */}
        {insight.riskSignal && (
          <section className="bg-red-50 rounded-lg border border-red-200 p-4">
            <h3 className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-2 flex items-center gap-1">
              <span>⚠️</span> Risk Signal
            </h3>
            <p className="text-gray-800">{insight.riskSignal}</p>
          </section>
        )}

        {/* Related Concepts */}
        {relatedInsights.length > 0 && (
          <section className="bg-gray-50 rounded-lg border border-gray-200 p-4">
            <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2 flex items-center gap-1">
              <span>🔗</span> Related Concepts
            </h3>
            <ul className="space-y-1">
              {relatedInsights.map((related) => (
                <li key={related.id} className="text-sm text-blue-600 hover:text-blue-800 cursor-pointer">
                  • {related.concept}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Reasoning Prompt Section */}
        {showReasoningPrompt && currentLoop && (
          <section className="bg-purple-50 rounded-lg border-2 border-purple-300 p-4">
            <h3 className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-3 flex items-center gap-1">
              <span>🧠</span> Clinical Reasoning Training
            </h3>
            <p className="text-gray-800 font-medium mb-3">
              {currentLoop.reasoningPrompt.prompt}
            </p>
            <textarea
              value={userAnswer}
              onChange={(e) => setUserAnswer(e.target.value)}
              placeholder="Type your reasoning here..."
              className="w-full h-24 p-3 border border-purple-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
              disabled={isSubmitting}
            />
            <div className="flex justify-end mt-3">
              <button
                onClick={handleSubmitAnswer}
                disabled={!userAnswer.trim() || isSubmitting}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Processing...' : 'Submit & Get Feedback'}
              </button>
            </div>
          </section>
        )}

        {/* Mastery Level */}
        <section className="bg-gray-50 rounded-lg border border-gray-200 p-4">
          <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
            Mastery Level
          </h3>
          <div className="flex items-center gap-2">
            <MasteryBadge level={insight.masteryLevel} />
            <span className="text-sm text-gray-600 capitalize">{insight.masteryLevel}</span>
          </div>
        </section>
      </div>

      {/* Action Buttons */}
      <div className="p-4 border-t border-gray-100 bg-gray-50 space-y-2">
        {/* Reasoning Prompt Button */}
        {!showReasoningPrompt && (
          <button
            onClick={handleStartReasoning}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-purple-100 text-purple-700 rounded-lg font-medium hover:bg-purple-200 transition-colors"
          >
            <span>🧠</span>
            <span>Start Reasoning Training</span>
          </button>
        )}

        <div className="grid grid-cols-2 gap-2">
          {/* Send to NoteLab */}
          <button
            onClick={() => onSendToNoteLab(insight)}
            className="flex items-center justify-center gap-1 px-3 py-2 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-200 transition-colors"
          >
            <span>📝</span>
            <span>To NoteLab</span>
          </button>

          {/* Train in Study Mode */}
          <button
            onClick={() => onTrainInStudyMode(insight)}
            className="flex items-center justify-center gap-1 px-3 py-2 bg-green-100 text-green-700 rounded-lg text-sm font-medium hover:bg-green-200 transition-colors"
          >
            <span>🎯</span>
            <span>Train</span>
          </button>
        </div>

        {/* Jump to Source */}
        <button
          onClick={onJumpToSource}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-100 transition-colors"
        >
          <span>📄</span>
          <span>Jump to Source (p.{insight.sourceAnchor.pageIndex + 1})</span>
        </button>
      </div>
    </div>
  );
};

// Mastery Badge Component
const MasteryBadge: React.FC<{ level: string }> = ({ level }) => {
  const colors: Record<string, string> = {
    novice: 'bg-gray-300',
    developing: 'bg-blue-400',
    competent: 'bg-green-400',
    proficient: 'bg-purple-400',
    expert: 'bg-amber-400',
  };

  const dots = ['novice', 'developing', 'competent', 'proficient', 'expert'];
  const levelIndex = dots.indexOf(level);

  return (
    <div className="flex items-center gap-1">
      {dots.map((dot, idx) => (
        <div
          key={dot}
          className={`w-2 h-2 rounded-full ${idx <= levelIndex ? colors[level] : 'bg-gray-200'}`}
        />
      ))}
    </div>
  );
};

export default ClinicalInsightPanel;
