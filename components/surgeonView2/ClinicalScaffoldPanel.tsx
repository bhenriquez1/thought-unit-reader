// components/surgeonView2/ClinicalScaffoldPanel.tsx
// Clinical Reasoning Flow: Observe -> Hypothesize -> Test -> Decide -> Act -> Verify
// "Surgeon Mode" cognitive scaffold

import React, { useState } from 'react';
import type { ClinicalScaffold, EvidenceRef } from '@/lib/surgeonEngine/types';

// ============================================================================
// Scaffold Step Configuration
// ============================================================================

interface StepConfig {
  key: keyof Pick<ClinicalScaffold, 'observe' | 'test' | 'decide' | 'act' | 'verify'> | 'hypothesize';
  label: string;
  icon: string;
  color: string;
  bgColor: string;
  borderColor: string;
  description: string;
}

const STEPS: StepConfig[] = [
  {
    key: 'observe',
    label: 'OBSERVE',
    icon: '👁️',
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-900/20',
    borderColor: 'border-cyan-700/50',
    description: 'Key findings',
  },
  {
    key: 'hypothesize',
    label: 'HYPOTHESIZE',
    icon: '🧠',
    color: 'text-purple-400',
    bgColor: 'bg-purple-900/20',
    borderColor: 'border-purple-700/50',
    description: 'Likely diagnoses',
  },
  {
    key: 'test',
    label: 'TEST',
    icon: '🧪',
    color: 'text-green-400',
    bgColor: 'bg-green-900/20',
    borderColor: 'border-green-700/50',
    description: 'Confirm/deny',
  },
  {
    key: 'decide',
    label: 'DECIDE',
    icon: '⚖️',
    color: 'text-amber-400',
    bgColor: 'bg-amber-900/20',
    borderColor: 'border-amber-700/50',
    description: 'Rule + contraindications',
  },
  {
    key: 'act',
    label: 'ACT',
    icon: '💊',
    color: 'text-blue-400',
    bgColor: 'bg-blue-900/20',
    borderColor: 'border-blue-700/50',
    description: 'First-line management',
  },
  {
    key: 'verify',
    label: 'VERIFY',
    icon: '✅',
    color: 'text-rose-400',
    bgColor: 'bg-rose-900/20',
    borderColor: 'border-rose-700/50',
    description: 'Red flags + follow-up',
  },
];

// ============================================================================
// Main Component
// ============================================================================

interface ClinicalScaffoldPanelProps {
  scaffold: ClinicalScaffold;
  onJumpToPage: (page: number) => void;
  onClose?: () => void;
  compact?: boolean;
}

export const ClinicalScaffoldPanel: React.FC<ClinicalScaffoldPanelProps> = ({
  scaffold,
  onJumpToPage,
  onClose,
  compact = false,
}) => {
  const [expandedStep, setExpandedStep] = useState<string | null>(compact ? null : 'observe');

  return (
    <div className="bg-gray-800/50 rounded-lg border border-gray-700">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-lg">🔬</span>
          <div>
            <h3 className="text-sm font-semibold text-white">Surgeon Mode</h3>
            <p className="text-[10px] text-gray-500">Clinical Reasoning Flow</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* References */}
          {scaffold.references.length > 0 && (
            <button
              onClick={() => onJumpToPage(scaffold.references[0].page)}
              className="text-[10px] text-teal-400 hover:text-teal-300"
            >
              p.{scaffold.references[0].page}
            </button>
          )}
          {onClose && (
            <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xs">
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Steps */}
      <div className={compact ? 'p-2 space-y-1' : 'p-3 space-y-2'}>
        {STEPS.map((step) => {
          const items = getStepItems(scaffold, step.key);
          const isExpanded = expandedStep === step.key;
          const hasContent = items.length > 0;

          return (
            <div
              key={step.key}
              className={`rounded-lg border ${step.borderColor} ${
                isExpanded ? step.bgColor : 'bg-transparent'
              } transition-colors`}
            >
              {/* Step Header */}
              <button
                onClick={() => setExpandedStep(isExpanded ? null : step.key)}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-left ${
                  hasContent ? 'cursor-pointer' : 'cursor-default opacity-50'
                }`}
                disabled={!hasContent}
              >
                <span className="text-sm">{step.icon}</span>
                <span className={`text-xs font-bold ${step.color} uppercase tracking-wider`}>
                  {step.label}
                </span>
                <span className="text-[10px] text-gray-500 flex-1">
                  {step.description}
                </span>
                {hasContent && (
                  <span className="text-[10px] text-gray-500">
                    {items.length}
                  </span>
                )}
                {hasContent && (
                  <span className="text-xs text-gray-500">
                    {isExpanded ? '▾' : '▸'}
                  </span>
                )}
              </button>

              {/* Step Content (expanded) */}
              {isExpanded && hasContent && (
                <div className="px-3 pb-2 space-y-1">
                  {items.map((item, idx) => (
                    <StepItem
                      key={idx}
                      item={item}
                      stepColor={step.color}
                      index={idx}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Page References */}
      {scaffold.references.length > 1 && (
        <div className="px-3 pb-2 flex flex-wrap gap-1">
          <span className="text-[10px] text-gray-500">Refs:</span>
          {scaffold.references.map((ref, idx) => (
            <button
              key={idx}
              onClick={() => onJumpToPage(ref.page)}
              className="text-[10px] text-teal-400 hover:text-teal-300 px-1 py-0.5 bg-gray-700/50 rounded"
            >
              p.{ref.page}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Step Item Renderer
// ============================================================================

interface StepItemProps {
  item: string | { label: string; rationale?: string; confidence: number };
  stepColor: string;
  index: number;
}

const StepItem: React.FC<StepItemProps> = ({ item, stepColor, index }) => {
  if (typeof item === 'string') {
    return (
      <div className="flex items-start gap-1.5">
        <span className={`text-[10px] ${stepColor} mt-0.5`}>•</span>
        <p className="text-xs text-gray-200 leading-relaxed">{item}</p>
      </div>
    );
  }

  // Hypothesis item (with confidence)
  return (
    <div className="flex items-start gap-1.5">
      <span className={`text-[10px] ${stepColor} mt-0.5 font-bold`}>{index + 1}.</span>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-200 font-medium">{item.label}</span>
          <ConfidenceChip confidence={item.confidence} />
        </div>
        {item.rationale && (
          <p className="text-[10px] text-gray-500 mt-0.5">{item.rationale}</p>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// Confidence Chip
// ============================================================================

const ConfidenceChip: React.FC<{ confidence: number }> = ({ confidence }) => {
  const pct = Math.round(confidence * 100);
  const color = pct >= 70 ? 'text-green-400' : pct >= 40 ? 'text-amber-400' : 'text-gray-400';

  return (
    <span className={`text-[10px] ${color}`}>
      {pct}%
    </span>
  );
};

// ============================================================================
// Helper
// ============================================================================

function getStepItems(
  scaffold: ClinicalScaffold,
  key: string
): (string | { label: string; rationale?: string; confidence: number })[] {
  switch (key) {
    case 'observe': return scaffold.observe;
    case 'hypothesize': return scaffold.hypothesize;
    case 'test': return scaffold.test;
    case 'decide': return scaffold.decide;
    case 'act': return scaffold.act;
    case 'verify': return scaffold.verify;
    default: return [];
  }
}

export default ClinicalScaffoldPanel;
