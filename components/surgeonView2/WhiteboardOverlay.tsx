// components/surgeonView2/WhiteboardOverlay.tsx
// Whiteboard Explanation Overlay for Surgeon View
// Shows 3-7 step explanation with graph and reasoning prompt

import React, { useState, useCallback } from 'react';
import { useWhiteboardService } from '@/lib/speechWhiteboard';
import type { WhiteboardStep, WhiteboardGraphNode, WhiteboardGraphEdge } from '@/lib/speechWhiteboard/types';

const DEV = process.env.NODE_ENV === "development";

// ============================================================================
// Props
// ============================================================================

interface WhiteboardOverlayProps {
  onSaveToNoteLab?: () => void;
  onAddToStudy?: () => void;
  onClose?: () => void;
}

// ============================================================================
// Sub-components
// ============================================================================

function StepCard({ step, index }: { step: WhiteboardStep; index: number }) {
  const typeStyles: Record<string, string> = {
    text: 'bg-gray-800/50 border-gray-700',
    emphasis: 'bg-blue-900/30 border-blue-700',
    warning: 'bg-red-900/30 border-red-700',
    key_point: 'bg-green-900/30 border-green-700',
  };

  const typeIcons: Record<string, string> = {
    text: '📄',
    emphasis: '💡',
    warning: '⚠️',
    key_point: '🎯',
  };

  return (
    <div className={`p-3 rounded-lg border ${typeStyles[step.type] || typeStyles.text}`}>
      <div className="flex items-start gap-2">
        <span className="text-lg">{typeIcons[step.type] || '📄'}</span>
        <div>
          <div className="text-xs text-gray-500 mb-1">Step {index + 1}</div>
          <div className="text-sm text-gray-200">{step.content}</div>
        </div>
      </div>
    </div>
  );
}

function MiniGraph({
  nodes,
  edges,
}: {
  nodes: WhiteboardGraphNode[];
  edges: WhiteboardGraphEdge[];
}) {
  if (nodes.length === 0) return null;

  return (
    <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
      <div className="text-xs text-gray-500 mb-3">Relationship Map</div>
      <div className="flex flex-wrap gap-2 justify-center">
        {nodes.map((node, idx) => {
          const nodeEdges = edges.filter((e) => e.from === node.id);
          return (
            <div key={node.id} className="flex items-center gap-2">
              <div
                className={`
                  px-3 py-1.5 rounded-full text-xs font-medium
                  ${node.type === 'condition' ? 'bg-blue-600 text-white' : ''}
                  ${node.type === 'process' ? 'bg-purple-600 text-white' : ''}
                  ${node.type === 'outcome' ? 'bg-green-600 text-white' : ''}
                  ${node.type === 'concept' ? 'bg-gray-600 text-white' : ''}
                `}
              >
                {node.label}
              </div>
              {nodeEdges.length > 0 && idx < nodes.length - 1 && (
                <div className="flex items-center text-gray-500 text-xs">
                  <span className="mr-1">{nodeEdges[0].label || '→'}</span>
                  <span>→</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function WhiteboardOverlay({
  onSaveToNoteLab,
  onAddToStudy,
  onClose,
}: WhiteboardOverlayProps) {
  const whiteboardService = useWhiteboardService();
  const { currentExplanation, isVisible, isGenerating, mode } = whiteboardService;

  const [userResponse, setUserResponse] = useState('');

  // ========================================
  // Handlers
  // ========================================

  const handleClose = useCallback(() => {
    whiteboardService.hideExplanation();
    onClose?.();
  }, [whiteboardService, onClose]);

  const handleSubmitResponse = useCallback(async () => {
    if (!userResponse.trim()) return;
    await whiteboardService.submitResponse(userResponse);
    setUserResponse('');
  }, [whiteboardService, userResponse]);

  const handleAcceptRule = useCallback(() => {
    const rule = whiteboardService.acceptDecisionRule();
    if (rule) {
      DEV && console.log('Decision rule accepted:', rule);
      // In production, this would add to NoteLab + Study queue
      onAddToStudy?.();
    }
  }, [whiteboardService, onAddToStudy]);

  const handleRejectRule = useCallback(() => {
    whiteboardService.rejectDecisionRule();
  }, [whiteboardService]);

  const handleSaveToNoteLab = useCallback(() => {
    const block = whiteboardService.exportToNoteLab();
    if (block) {
      DEV && console.log('Exported to NoteLab:', block);
      onSaveToNoteLab?.();
    }
  }, [whiteboardService, onSaveToNoteLab]);

  // ========================================
  // Don't render if not visible
  // ========================================

  if (!isVisible) return null;

  // ========================================
  // Loading state
  // ========================================

  if (isGenerating && !currentExplanation) {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center">
        <div className="bg-gray-900 rounded-xl border border-gray-700 p-8 max-w-md">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin text-4xl">🎓</div>
            <div className="text-gray-300">Generating explanation...</div>
          </div>
        </div>
      </div>
    );
  }

  if (!currentExplanation) return null;

  // ========================================
  // Main render
  // ========================================

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-xl border border-gray-700 shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🎓</span>
            <div>
              <h3 className="text-lg font-semibold text-white">Whiteboard Explanation</h3>
              <p className="text-xs text-gray-400">
                {currentExplanation.unitType}: {currentExplanation.unitId.slice(0, 20)}...
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-white p-2 rounded-lg hover:bg-gray-800 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {/* Steps (3-7) */}
          <div className="space-y-3">
            <div className="text-sm font-medium text-gray-400">
              Steps ({currentExplanation.steps.length})
            </div>
            {currentExplanation.steps.map((step, idx) => (
              <StepCard key={step.id} step={step} index={idx} />
            ))}
          </div>

          {/* Graph */}
          {currentExplanation.graphNodes.length > 0 && (
            <MiniGraph
              nodes={currentExplanation.graphNodes}
              edges={currentExplanation.graphEdges}
            />
          )}

          {/* Reasoning Prompt */}
          <div className="bg-purple-900/30 rounded-lg p-4 border border-purple-700">
            <div className="text-sm font-medium text-purple-300 mb-2">
              Reasoning Prompt
            </div>
            <div className="text-white mb-4">{currentExplanation.prompt}</div>

            {/* Response input */}
            {!currentExplanation.feedbackGiven && (
              <div className="space-y-2">
                <textarea
                  value={userResponse}
                  onChange={(e) => setUserResponse(e.target.value)}
                  placeholder="Type your reasoning here..."
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg p-3 text-white text-sm resize-none focus:outline-none focus:border-purple-500"
                  rows={3}
                />
                <button
                  onClick={handleSubmitResponse}
                  disabled={!userResponse.trim() || isGenerating}
                  className={`
                    w-full py-2 rounded-lg font-medium transition-all
                    ${userResponse.trim() && !isGenerating
                      ? 'bg-purple-600 hover:bg-purple-500 text-white'
                      : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                    }
                  `}
                >
                  {isGenerating ? 'Getting feedback...' : 'Submit Response'}
                </button>
              </div>
            )}
          </div>

          {/* Feedback */}
          {currentExplanation.feedbackGiven && currentExplanation.feedback && (
            <div className="bg-blue-900/30 rounded-lg p-4 border border-blue-700">
              <div className="text-sm font-medium text-blue-300 mb-2">AI Feedback</div>
              <div className="text-white text-sm">{currentExplanation.feedback}</div>
            </div>
          )}

          {/* Decision Rule Candidate */}
          {currentExplanation.decisionRuleCandidate && (
            <div className="bg-green-900/30 rounded-lg p-4 border border-green-700">
              <div className="text-sm font-medium text-green-300 mb-3">
                Suggested Decision Rule
              </div>
              <div className="space-y-2 text-sm text-gray-200 mb-4">
                <div>
                  <span className="text-green-400">IF:</span>{' '}
                  {currentExplanation.decisionRuleCandidate.ifCondition}
                </div>
                <div>
                  <span className="text-green-400">THEN:</span>{' '}
                  {currentExplanation.decisionRuleCandidate.thenAction}
                </div>
                <div>
                  <span className="text-green-400">CONFIRM WITH:</span>{' '}
                  {currentExplanation.decisionRuleCandidate.confirmWith.join(', ')}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleAcceptRule}
                  className="flex-1 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white font-medium transition-all"
                >
                  Accept Rule
                </button>
                <button
                  onClick={handleRejectRule}
                  className="flex-1 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 font-medium transition-all"
                >
                  Reject
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex gap-3 p-4 border-t border-gray-700">
          <button
            onClick={handleSaveToNoteLab}
            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white font-medium transition-all"
          >
            <span>📝</span>
            <span>Insert into NoteLab</span>
          </button>
          <button
            onClick={handleClose}
            className="px-6 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default WhiteboardOverlay;
