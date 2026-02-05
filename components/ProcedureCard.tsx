"use client";

/**
 * ProcedureCard - Step-by-step procedure display
 *
 * Features:
 * - 3-7 steps maximum
 * - Branch logic support (if/then paths)
 * - Collapsible detailed explanations
 * - Progress tracking
 */

import React, { useState, useCallback } from 'react';

// ============================================================================
// Types
// ============================================================================

export interface ProcedureStep {
  id: string;
  number: number;
  action: string;          // The core action (imperative verb)
  detail?: string;         // Optional detailed explanation
  warning?: string;        // Optional warning/caution
  branch?: {              // Optional branching logic
    condition: string;
    ifTrue: string;
    ifFalse?: string;
  };
}

export interface Procedure {
  id: string;
  title: string;
  steps: ProcedureStep[];
  totalTime?: string;      // Optional estimated time
  prerequisites?: string[];
  warnings?: string[];
}

interface ProcedureCardProps {
  procedure: Procedure;
  onStepClick?: (stepId: string) => void;
  compact?: boolean;
}

// ============================================================================
// Sub-components
// ============================================================================

function StepNumber({ number, isActive }: { number: number; isActive: boolean }) {
  return (
    <div
      className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
        isActive
          ? 'bg-blue-500 text-white'
          : 'bg-gray-700 text-gray-400'
      }`}
    >
      {number}
    </div>
  );
}

function BranchIndicator({ branch }: { branch: ProcedureStep['branch'] }) {
  if (!branch) return null;

  return (
    <div className="ml-10 mt-2 p-3 bg-gray-700/50 rounded-lg border border-gray-600">
      <div className="flex items-start gap-2 text-sm">
        <span className="text-yellow-400 font-mono">IF</span>
        <span className="text-gray-300">{branch.condition}</span>
      </div>
      <div className="ml-4 mt-2 space-y-1">
        <div className="flex items-start gap-2 text-sm">
          <span className="text-green-400 font-mono">THEN</span>
          <span className="text-gray-300">{branch.ifTrue}</span>
        </div>
        {branch.ifFalse && (
          <div className="flex items-start gap-2 text-sm">
            <span className="text-red-400 font-mono">ELSE</span>
            <span className="text-gray-300">{branch.ifFalse}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function StepCard({
  step,
  isExpanded,
  onToggle,
  onClick,
}: {
  step: ProcedureStep;
  isExpanded: boolean;
  onToggle: () => void;
  onClick?: () => void;
}) {
  return (
    <div className="flex items-start gap-3 group">
      <StepNumber number={step.number} isActive={isExpanded} />
      <div className="flex-1 min-w-0">
        <button
          onClick={() => {
            onToggle();
            onClick?.();
          }}
          className="w-full text-left"
        >
          <p
            className={`text-sm font-medium transition-colors ${
              isExpanded ? 'text-white' : 'text-gray-300 group-hover:text-white'
            }`}
          >
            {step.action}
          </p>
        </button>

        {isExpanded && (
          <div className="mt-2 space-y-2">
            {step.detail && (
              <p className="text-sm text-gray-400 leading-relaxed pl-1 border-l-2 border-gray-600">
                {step.detail}
              </p>
            )}
            {step.warning && (
              <div className="flex items-start gap-2 text-sm text-yellow-400 bg-yellow-900/20 px-3 py-2 rounded">
                <span>!</span>
                <span>{step.warning}</span>
              </div>
            )}
            <BranchIndicator branch={step.branch} />
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function ProcedureCard({
  procedure,
  onStepClick,
  compact = false,
}: ProcedureCardProps) {
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());

  const toggleStep = useCallback((stepId: string) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) {
        next.delete(stepId);
      } else {
        next.add(stepId);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setExpandedSteps(new Set(procedure.steps.map((s) => s.id)));
  }, [procedure.steps]);

  const collapseAll = useCallback(() => {
    setExpandedSteps(new Set());
  }, []);

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-gradient-to-r from-blue-900/30 to-indigo-900/30 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-lg">Steps</span>
            <h3 className="text-white font-semibold">{procedure.title}</h3>
          </div>
          <div className="flex items-center gap-3">
            {procedure.totalTime && (
              <span className="text-xs text-gray-400">~{procedure.totalTime}</span>
            )}
            <span className="text-xs text-gray-500">
              {procedure.steps.length} step{procedure.steps.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>

      {/* Prerequisites */}
      {procedure.prerequisites && procedure.prerequisites.length > 0 && (
        <div className="px-4 py-2 bg-gray-850 border-b border-gray-700">
          <p className="text-xs text-gray-500 mb-1">Prerequisites:</p>
          <ul className="text-sm text-gray-400 list-disc list-inside">
            {procedure.prerequisites.map((prereq, idx) => (
              <li key={idx}>{prereq}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Warnings */}
      {procedure.warnings && procedure.warnings.length > 0 && (
        <div className="px-4 py-2 bg-red-900/20 border-b border-red-800/30">
          {procedure.warnings.map((warning, idx) => (
            <div key={idx} className="flex items-start gap-2 text-sm text-red-400">
              <span>!</span>
              <span>{warning}</span>
            </div>
          ))}
        </div>
      )}

      {/* Controls */}
      {!compact && (
        <div className="px-4 py-2 border-b border-gray-700/50 flex justify-end gap-2">
          <button
            onClick={expandAll}
            className="text-xs text-gray-500 hover:text-gray-300"
          >
            Expand all
          </button>
          <button
            onClick={collapseAll}
            className="text-xs text-gray-500 hover:text-gray-300"
          >
            Collapse
          </button>
        </div>
      )}

      {/* Steps */}
      <div className="px-4 py-4 space-y-4">
        {/* Connection line */}
        <div className="relative">
          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-700" />
          <div className="relative space-y-4">
            {procedure.steps.map((step) => (
              <StepCard
                key={step.id}
                step={step}
                isExpanded={expandedSteps.has(step.id)}
                onToggle={() => toggleStep(step.id)}
                onClick={() => onStepClick?.(step.id)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Helper: Extract procedure from text
// ============================================================================

export function extractProcedureFromText(text: string, title?: string): Procedure | null {
  // Look for numbered steps
  const stepPatterns = [
    /(?:^|\n)\s*(\d+)[.)]\s*(.+?)(?=\n\s*\d+[.)]|\n\n|$)/gs,
    /(?:^|\n)\s*Step\s+(\d+)[.:]?\s*(.+?)(?=\n\s*Step\s+\d+|\n\n|$)/gis,
  ];

  let steps: ProcedureStep[] = [];

  for (const pattern of stepPatterns) {
    const matches = [...text.matchAll(pattern)];
    if (matches.length >= 2) {
      steps = matches.map((match, idx) => ({
        id: `step_${idx}`,
        number: parseInt(match[1]) || idx + 1,
        action: match[2].trim(),
      }));
      break;
    }
  }

  // Limit to 7 steps max
  steps = steps.slice(0, 7);

  if (steps.length < 2) {
    return null;
  }

  return {
    id: `proc_${Date.now()}`,
    title: title || 'Procedure',
    steps,
  };
}
