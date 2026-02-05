"use client";

/**
 * ExampleCard - Worked example display
 *
 * Features:
 * - Problem statement
 * - Solution steps
 * - Final result/answer
 * - Key insight callout
 */

import React, { useState, useCallback } from 'react';

// ============================================================================
// Types
// ============================================================================

export interface ExampleStep {
  id: string;
  description: string;
  calculation?: string;   // Optional math/formula
  note?: string;          // Optional explanation
}

export interface WorkedExample {
  id: string;
  title?: string;
  problem: string;        // The question/scenario
  steps: ExampleStep[];
  result: string;         // Final answer
  insight?: string;       // Key takeaway
  category?: string;      // e.g., "Calculation", "Case Study", "Application"
}

interface ExampleCardProps {
  example: WorkedExample;
  onHighlightSelect?: (text: string) => void;
  initiallyExpanded?: boolean;
}

// ============================================================================
// Sub-components
// ============================================================================

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
      {children}
    </span>
  );
}

function StepRow({
  step,
  index,
  isExpanded,
  onToggle,
}: {
  step: ExampleStep;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-l-2 border-green-600/50 pl-3 py-1">
      <button
        onClick={onToggle}
        className="flex items-start gap-2 w-full text-left hover:bg-gray-800/50 rounded px-1 py-0.5 transition-colors"
      >
        <span className="text-green-400 text-xs font-mono mt-0.5">
          {index + 1}.
        </span>
        <span className="text-sm text-gray-300">{step.description}</span>
      </button>

      {isExpanded && (
        <div className="mt-2 ml-5 space-y-2">
          {step.calculation && (
            <div className="font-mono text-sm text-blue-300 bg-blue-900/20 px-3 py-2 rounded">
              {step.calculation}
            </div>
          )}
          {step.note && (
            <p className="text-xs text-gray-500 italic">{step.note}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function ExampleCard({
  example,
  onHighlightSelect,
  initiallyExpanded = false,
}: ExampleCardProps) {
  const [isExpanded, setIsExpanded] = useState(initiallyExpanded);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());

  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const toggleStep = useCallback((index: number) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const handleTextSelect = useCallback(() => {
    const selection = window.getSelection()?.toString();
    if (selection && onHighlightSelect) {
      onHighlightSelect(selection);
    }
  }, [onHighlightSelect]);

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
      {/* Header */}
      <button
        onClick={toggleExpanded}
        className="w-full px-4 py-3 bg-gradient-to-r from-green-900/30 to-emerald-900/30 border-b border-gray-700 flex items-center justify-between hover:from-green-900/40 hover:to-emerald-900/40 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-lg">Example</span>
          {example.title && (
            <h3 className="text-white font-semibold">{example.title}</h3>
          )}
          {example.category && (
            <span className="text-xs px-2 py-0.5 bg-gray-700 rounded text-gray-400">
              {example.category}
            </span>
          )}
        </div>
        <span
          className={`text-gray-400 transform transition-transform ${
            isExpanded ? 'rotate-180' : ''
          }`}
        >
          v
        </span>
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="p-4 space-y-4" onMouseUp={handleTextSelect}>
          {/* Problem */}
          <div>
            <SectionLabel>Problem</SectionLabel>
            <p className="mt-1 text-white font-medium">{example.problem}</p>
          </div>

          {/* Solution Steps */}
          {example.steps.length > 0 && (
            <div>
              <SectionLabel>Solution</SectionLabel>
              <div className="mt-2 space-y-1">
                {example.steps.map((step, idx) => (
                  <StepRow
                    key={step.id}
                    step={step}
                    index={idx}
                    isExpanded={expandedSteps.has(idx)}
                    onToggle={() => toggleStep(idx)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Result */}
          <div className="bg-green-900/20 border border-green-700/30 rounded-lg p-3">
            <SectionLabel>Answer</SectionLabel>
            <p className="mt-1 text-green-300 font-semibold">{example.result}</p>
          </div>

          {/* Insight */}
          {example.insight && (
            <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <span className="text-yellow-400">Insight</span>
                <p className="text-sm text-yellow-200">{example.insight}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Collapsed Preview */}
      {!isExpanded && (
        <div className="px-4 py-3">
          <p className="text-sm text-gray-400 line-clamp-2">{example.problem}</p>
          <p className="text-xs text-green-400 mt-1">
            Answer: {example.result.length > 50 ? example.result.slice(0, 50) + '...' : example.result}
          </p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Helper: Extract example from text
// ============================================================================

export function extractExampleFromText(text: string): WorkedExample | null {
  // Look for example markers
  const hasExampleMarker = /\b(example|case|problem|scenario|consider)\b/i.test(text);
  if (!hasExampleMarker) return null;

  // Try to identify problem/solution/answer structure
  const lines = text.split('\n').filter((l) => l.trim());

  // Simple heuristic: first substantial line is problem, last is answer
  if (lines.length < 2) return null;

  const problem = lines[0];
  const result = lines[lines.length - 1];

  // Middle lines are steps
  const steps: ExampleStep[] = lines.slice(1, -1).map((line, idx) => ({
    id: `step_${idx}`,
    description: line.trim(),
  }));

  return {
    id: `example_${Date.now()}`,
    problem,
    steps,
    result,
    category: 'Worked Example',
  };
}
