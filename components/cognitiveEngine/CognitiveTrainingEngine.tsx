// components/cognitiveEngine/CognitiveTrainingEngine.tsx
// Study Mode Cognitive Training Engine
// Training levels: Recall, Recognition, Application, Decision Reasoning

import React, { useState, useCallback, useMemo } from 'react';
import type {
  CognitiveTrainingSession,
  TrainingLevel,
  TrainingItem,
  ErrorAnalysis,
  ClinicalInsight,
  DecisionRule,
} from '../../lib/cognitiveEngine/types';
import { useCognitiveEngineStore } from '../../lib/cognitiveEngine/store';

interface CognitiveTrainingEngineProps {
  insights: ClinicalInsight[];
  decisionRules: DecisionRule[];
  onComplete: (session: CognitiveTrainingSession) => void;
}

export const CognitiveTrainingEngine: React.FC<CognitiveTrainingEngineProps> = ({
  insights,
  decisionRules,
  onComplete,
}) => {
  const {
    currentTrainingSession,
    startTrainingSession,
    submitTrainingResponse,
    advanceTraining,
    completeTrainingSession,
    getMistakeReplayItems,
    recordPatternRecognition,
  } = useCognitiveEngineStore();

  const [selectedLevel, setSelectedLevel] = useState<TrainingLevel | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [userResponse, setUserResponse] = useState('');
  const [confidence, setConfidence] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [isMistakeReplay, setIsMistakeReplay] = useState(false);

  // Generate training items based on level
  const generateTrainingItems = useCallback(
    (level: TrainingLevel): TrainingItem[] => {
      const items: TrainingItem[] = [];

      switch (level) {
        case 'recall':
          // Basic recall: show concept, ask for definition
          insights.slice(0, 10).forEach((insight, idx) => {
            items.push({
              id: `recall_${idx}`,
              conceptId: insight.id,
              prompt: `What is "${insight.concept}"?`,
              promptType: 'recall',
              expectedAnswer: insight.whyItMatters,
            });
          });
          break;

        case 'recognition':
          // Pattern recognition: show scenario, identify pattern
          insights.slice(0, 8).forEach((insight, idx) => {
            items.push({
              id: `recognition_${idx}`,
              conceptId: insight.id,
              prompt: `Which pattern does this describe?\n\n"${insight.whyItMatters}"`,
              promptType: 'recognition',
              choices: [
                insight.concept,
                insights[(idx + 1) % insights.length]?.concept || 'Option B',
                insights[(idx + 2) % insights.length]?.concept || 'Option C',
                insights[(idx + 3) % insights.length]?.concept || 'Option D',
              ].sort(() => Math.random() - 0.5),
              correctChoiceIndex: 0, // Will need to find actual index after shuffle
            });
          });
          break;

        case 'application':
          // Application: clinical scenario, apply knowledge
          insights.filter((i) => i.clinicalPearl).slice(0, 6).forEach((insight, idx) => {
            items.push({
              id: `application_${idx}`,
              conceptId: insight.id,
              prompt: `Clinical Scenario:\n\n${insight.clinicalPearl}\n\nHow would you apply the concept of "${insight.concept}" in this situation?`,
              promptType: 'application',
            });
          });
          break;

        case 'decision_reasoning':
          // Decision reasoning: use decision rules
          decisionRules.filter((r) => r.isActive).slice(0, 5).forEach((rule, idx) => {
            items.push({
              id: `decision_${idx}`,
              conceptId: rule.conceptId,
              prompt: `Given this condition:\n\n"${rule.ifCondition}"\n\nWhat is the appropriate action?`,
              promptType: 'decision_reasoning',
              expectedAnswer: rule.thenAction,
              choices: [
                rule.thenAction,
                'Wait and observe',
                'Order additional tests first',
                'Refer to specialist',
              ].sort(() => Math.random() - 0.5),
              correctChoiceIndex: 0,
            });
          });
          break;
      }

      return items;
    },
    [insights, decisionRules]
  );

  const handleStartTraining = useCallback(
    (level: TrainingLevel) => {
      setSelectedLevel(level);
      const items = generateTrainingItems(level);
      startTrainingSession(level, items);
    },
    [generateTrainingItems, startTrainingSession]
  );

  const handleStartMistakeReplay = useCallback(() => {
    setIsMistakeReplay(true);
    const mistakes = getMistakeReplayItems();
    if (mistakes.length > 0) {
      startTrainingSession('application', mistakes);
    }
  }, [getMistakeReplayItems, startTrainingSession]);

  const currentItem = useMemo(() => {
    if (!currentTrainingSession) return null;
    return currentTrainingSession.items[currentTrainingSession.currentIndex];
  }, [currentTrainingSession]);

  const handleSubmitResponse = useCallback(() => {
    if (!currentItem) return;

    const response = currentItem.choices
      ? String(currentItem.choices.indexOf(userResponse))
      : userResponse;

    submitTrainingResponse(currentItem.id, response, confidence);
    setShowAnswer(true);
    recordPatternRecognition(currentItem.isCorrect || false);
  }, [currentItem, userResponse, confidence, submitTrainingResponse, recordPatternRecognition]);

  const handleNext = useCallback(() => {
    setShowAnswer(false);
    setUserResponse('');
    setConfidence(3);

    if (currentTrainingSession) {
      if (currentTrainingSession.currentIndex < currentTrainingSession.items.length - 1) {
        advanceTraining();
      } else {
        completeTrainingSession();
        onComplete(currentTrainingSession);
      }
    }
  }, [currentTrainingSession, advanceTraining, completeTrainingSession, onComplete]);

  // Level Selection Screen
  if (!currentTrainingSession) {
    return (
      <div className="p-6 space-y-6">
        <div className="text-center mb-8">
          <span className="text-4xl mb-2 block">🧠</span>
          <h2 className="text-2xl font-bold text-gray-900">Cognitive Training</h2>
          <p className="text-gray-500">Select your training level</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <TrainingLevelCard
            level="recall"
            title="Recall"
            description="Test basic memory of concepts"
            icon="📝"
            difficulty="Beginner"
            onClick={() => handleStartTraining('recall')}
          />
          <TrainingLevelCard
            level="recognition"
            title="Recognition"
            description="Identify patterns from descriptions"
            icon="🔍"
            difficulty="Intermediate"
            onClick={() => handleStartTraining('recognition')}
          />
          <TrainingLevelCard
            level="application"
            title="Application"
            description="Apply knowledge to scenarios"
            icon="💡"
            difficulty="Advanced"
            onClick={() => handleStartTraining('application')}
          />
          <TrainingLevelCard
            level="decision_reasoning"
            title="Decision Reasoning"
            description="Make clinical decisions"
            icon="⚡"
            difficulty="Expert"
            onClick={() => handleStartTraining('decision_reasoning')}
          />
        </div>

        {/* Mistake Replay */}
        {getMistakeReplayItems().length > 0 && (
          <button
            onClick={handleStartMistakeReplay}
            className="w-full p-4 bg-red-50 border-2 border-red-200 rounded-xl text-center hover:bg-red-100 transition-colors"
          >
            <span className="text-xl mb-1 block">🔄</span>
            <span className="font-semibold text-red-700">Mistake Replay Mode</span>
            <span className="text-sm text-red-600 block">
              Review {getMistakeReplayItems().length} items you got wrong
            </span>
          </button>
        )}
      </div>
    );
  }

  // Training Interface
  return (
    <div className="flex flex-col h-full">
      {/* Progress Header */}
      <div className="p-4 bg-gradient-to-r from-purple-50 to-blue-50 border-b border-gray-200">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-600">
            {isMistakeReplay ? '🔄 Mistake Replay' : `Training: ${selectedLevel}`}
          </span>
          <span className="text-sm text-gray-500">
            {currentTrainingSession.currentIndex + 1} / {currentTrainingSession.items.length}
          </span>
        </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-purple-500 transition-all duration-300"
            style={{
              width: `${((currentTrainingSession.currentIndex + 1) / currentTrainingSession.items.length) * 100}%`,
            }}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>✓ {currentTrainingSession.correctCount} correct</span>
          <span>✗ {currentTrainingSession.incorrectCount} incorrect</span>
        </div>
      </div>

      {/* Question Area */}
      <div className="flex-1 p-6 overflow-y-auto">
        {currentItem && (
          <div className="space-y-6">
            {/* Prompt */}
            <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
              <div className="text-xs font-semibold text-purple-600 uppercase mb-2">
                {currentItem.promptType.replace('_', ' ')}
              </div>
              <p className="text-lg text-gray-900 whitespace-pre-wrap">
                {currentItem.prompt}
              </p>
            </div>

            {/* Answer Area */}
            {!showAnswer ? (
              <div className="space-y-4">
                {/* Multiple Choice */}
                {currentItem.choices ? (
                  <div className="space-y-2">
                    {currentItem.choices.map((choice, idx) => (
                      <button
                        key={idx}
                        onClick={() => setUserResponse(choice)}
                        className={`
                          w-full p-4 text-left rounded-lg border-2 transition-colors
                          ${userResponse === choice
                            ? 'border-purple-500 bg-purple-50'
                            : 'border-gray-200 hover:border-purple-300'
                          }
                        `}
                      >
                        <span className="font-medium text-gray-600 mr-2">
                          {String.fromCharCode(65 + idx)}.
                        </span>
                        {choice}
                      </button>
                    ))}
                  </div>
                ) : (
                  /* Free Response */
                  <textarea
                    value={userResponse}
                    onChange={(e) => setUserResponse(e.target.value)}
                    placeholder="Type your answer..."
                    className="w-full h-32 p-4 border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                )}

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
                </div>

                {/* Submit */}
                <button
                  onClick={handleSubmitResponse}
                  disabled={!userResponse}
                  className="w-full py-3 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors disabled:opacity-50"
                >
                  Check Answer
                </button>
              </div>
            ) : (
              /* Feedback View */
              <div className="space-y-4">
                <FeedbackCard
                  item={currentItem}
                  userResponse={userResponse}
                />

                <button
                  onClick={handleNext}
                  className="w-full py-3 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors"
                >
                  {currentTrainingSession.currentIndex < currentTrainingSession.items.length - 1
                    ? 'Next Question'
                    : 'Finish Training'
                  }
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// Training Level Card
const TrainingLevelCard: React.FC<{
  level: TrainingLevel;
  title: string;
  description: string;
  icon: string;
  difficulty: string;
  onClick: () => void;
}> = ({ title, description, icon, difficulty, onClick }) => {
  const difficultyColors: Record<string, string> = {
    Beginner: 'bg-green-100 text-green-700',
    Intermediate: 'bg-blue-100 text-blue-700',
    Advanced: 'bg-purple-100 text-purple-700',
    Expert: 'bg-red-100 text-red-700',
  };

  return (
    <button
      onClick={onClick}
      className="p-4 bg-white rounded-xl border border-gray-200 hover:border-purple-300 hover:shadow-md transition-all text-left"
    >
      <span className="text-3xl block mb-2">{icon}</span>
      <h3 className="font-semibold text-gray-900">{title}</h3>
      <p className="text-sm text-gray-500 mb-2">{description}</p>
      <span className={`text-xs px-2 py-1 rounded-full ${difficultyColors[difficulty]}`}>
        {difficulty}
      </span>
    </button>
  );
};

// Feedback Card
const FeedbackCard: React.FC<{
  item: TrainingItem;
  userResponse: string;
}> = ({ item, userResponse }) => {
  const isCorrect = item.isCorrect;

  return (
    <div className={`rounded-xl p-6 border-2 ${
      isCorrect ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'
    }`}>
      {/* Result Header */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-3xl">{isCorrect ? '✅' : '❌'}</span>
        <div>
          <h4 className={`font-bold ${isCorrect ? 'text-green-700' : 'text-red-700'}`}>
            {isCorrect ? 'Correct!' : 'Incorrect'}
          </h4>
          <p className="text-sm text-gray-600">
            {isCorrect
              ? 'Great job! Keep building that expertise.'
              : 'This one needs more review.'}
          </p>
        </div>
      </div>

      {/* Show Correct Answer if wrong */}
      {!isCorrect && item.expectedAnswer && (
        <div className="bg-white rounded-lg p-4 border border-gray-200 mb-4">
          <h5 className="text-xs font-semibold text-gray-500 uppercase mb-1">
            Correct Answer
          </h5>
          <p className="text-gray-800">{item.expectedAnswer}</p>
        </div>
      )}

      {/* Error Analysis */}
      {!isCorrect && item.errorAnalysis && (
        <ErrorAnalysisDisplay analysis={item.errorAnalysis} />
      )}

      {/* Your Answer */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <h5 className="text-xs font-semibold text-gray-500 uppercase mb-1">
          Your Answer
        </h5>
        <p className="text-sm text-gray-600">{userResponse}</p>
      </div>
    </div>
  );
};

// Error Analysis Display
const ErrorAnalysisDisplay: React.FC<{ analysis: ErrorAnalysis }> = ({ analysis }) => (
  <div className="space-y-3">
    {analysis.missedPattern && (
      <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
        <h5 className="text-xs font-semibold text-amber-700 uppercase mb-1">
          Missed Pattern
        </h5>
        <p className="text-sm text-gray-800">{analysis.missedPattern}</p>
      </div>
    )}

    {analysis.cognitiveTrap && (
      <div className="bg-red-50 rounded-lg p-3 border border-red-200">
        <h5 className="text-xs font-semibold text-red-700 uppercase mb-1">
          ⚠️ Cognitive Trap: {analysis.cognitiveTrap.type}
        </h5>
        <p className="text-sm text-gray-800 mb-1">{analysis.cognitiveTrap.description}</p>
        <p className="text-sm text-red-700 font-medium">
          Correction: {analysis.cognitiveTrap.correction}
        </p>
      </div>
    )}

    <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
      <h5 className="text-xs font-semibold text-blue-700 uppercase mb-1">
        Correct Reasoning Path
      </h5>
      <p className="text-sm text-gray-800">{analysis.correctReasoningPath}</p>
    </div>

    <div className="bg-purple-50 rounded-lg p-3 border border-purple-200">
      <h5 className="text-xs font-semibold text-purple-700 uppercase mb-1">
        Review Recommendation
      </h5>
      <p className="text-sm text-gray-800">{analysis.reviewRecommendation}</p>
    </div>
  </div>
);

export default CognitiveTrainingEngine;
