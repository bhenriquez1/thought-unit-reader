"use client";

/**
 * ConceptCard - Universal Thought-Unit Card with Cognitive Compression
 *
 * Displays:
 * - Core sentence (always visible)
 * - Collapsible exceptions with trigger labels (A-H)
 * - Raw/Filtered toggle
 * - Confidence indicator
 */

import React, { useState, useCallback } from 'react';
import type {
  ConceptOutput,
  ExceptionItem,
  AttachmentItem,
  ExceptionTrigger,
} from '@/lib/universalExtractor';
import { useConceptStore } from '@/lib/stores/conceptStore';

// ============================================================================
// Types
// ============================================================================

interface ConceptCardProps {
  concept: ConceptOutput;
  showRaw?: boolean;
  onHighlightSelect?: (text: string) => void;
}

// ============================================================================
// Trigger Colors & Icons
// ============================================================================

const TRIGGER_STYLES: Record<ExceptionTrigger, { color: string; bgColor: string; icon: string }> = {
  A_CONDITIONAL: { color: 'text-blue-400', bgColor: 'bg-blue-900/30', icon: '?' },
  B_CONTRAST: { color: 'text-orange-400', bgColor: 'bg-orange-900/30', icon: '!' },
  C_CAUSATION: { color: 'text-green-400', bgColor: 'bg-green-900/30', icon: '>' },
  D_DEFINITION: { color: 'text-purple-400', bgColor: 'bg-purple-900/30', icon: '=' },
  E_ENUMERATION: { color: 'text-cyan-400', bgColor: 'bg-cyan-900/30', icon: '#' },
  F_FORMULA: { color: 'text-pink-400', bgColor: 'bg-pink-900/30', icon: 'f' },
  G_GRADATION: { color: 'text-yellow-400', bgColor: 'bg-yellow-900/30', icon: '^' },
  H_HIERARCHY: { color: 'text-indigo-400', bgColor: 'bg-indigo-900/30', icon: '/' },
};

// ============================================================================
// Sub-components
// ============================================================================

function ExceptionBadge({ trigger, label }: { trigger: ExceptionTrigger; label: string }) {
  const style = TRIGGER_STYLES[trigger];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${style.color} ${style.bgColor}`}
      title={`Exception Trigger: ${trigger}`}
    >
      <span className="font-mono">{style.icon}</span>
      {label}
    </span>
  );
}

function ConfidenceBar({ confidence }: { confidence: number }) {
  const percent = Math.round(confidence * 100);
  const color = confidence > 0.7 ? 'bg-green-500' : confidence > 0.4 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} transition-all duration-300`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="text-xs text-gray-500">{percent}%</span>
    </div>
  );
}

function ExceptionItem({
  item,
  isExpanded,
  onToggle,
}: {
  item: ExceptionItem;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const style = TRIGGER_STYLES[item.trigger];

  return (
    <div className={`border-l-2 ${style.color.replace('text-', 'border-')} pl-3 py-1`}>
      <button
        onClick={onToggle}
        className="flex items-center gap-2 w-full text-left hover:bg-gray-800/50 rounded px-1 py-0.5 transition-colors"
      >
        <span className={`transform transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
          {'>'}
        </span>
        <ExceptionBadge trigger={item.trigger} label={item.label} />
      </button>
      {isExpanded && (
        <p className="mt-1 text-sm text-gray-300 leading-relaxed pl-4">
          {item.content}
        </p>
      )}
    </div>
  );
}

function AttachmentBadge({ item }: { item: AttachmentItem }) {
  const icons: Record<string, string> = {
    P_PROCEDURE: 'Steps',
    X_EXAMPLE: 'Example',
    V_VISUAL: 'Figure',
  };

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-gray-700 text-gray-300">
      {icons[item.trigger] || item.trigger}
      {item.reference && <span className="text-gray-500">({item.reference})</span>}
    </span>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function ConceptCard({
  concept,
  showRaw = false,
  onHighlightSelect,
}: ConceptCardProps) {
  const [localExpanded, setLocalExpanded] = useState<Set<number>>(new Set());
  const { viewMode, setViewMode } = useConceptStore();

  const toggleException = useCallback((index: number) => {
    setLocalExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setLocalExpanded(new Set(concept.exceptions.map((_, i) => i)));
  }, [concept.exceptions]);

  const collapseAll = useCallback(() => {
    setLocalExpanded(new Set());
  }, []);

  const handleTextSelect = useCallback(() => {
    const selection = window.getSelection()?.toString();
    if (selection && onHighlightSelect) {
      onHighlightSelect(selection);
    }
  }, [onHighlightSelect]);

  // Raw mode - show original text
  if (showRaw || viewMode === 'raw') {
    return (
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-gray-500 uppercase tracking-wide">Raw Text</span>
          <button
            onClick={() => setViewMode('filtered')}
            className="text-xs text-blue-400 hover:text-blue-300"
          >
            Show Filtered
          </button>
        </div>
        <p
          className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed"
          onMouseUp={handleTextSelect}
        >
          {concept.metadata.sourceText}
        </p>
      </div>
    );
  }

  return (
    <div
      className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden"
      data-concept-id={concept.id}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-850 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
            {concept.page_type}
          </span>
          <ConfidenceBar confidence={concept.confidence} />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('raw')}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            Raw
          </button>
          <span className="text-xs text-gray-600">
            {concept.sentence_count} sentence{concept.sentence_count !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Core Sentence */}
      <div className="px-4 py-3" onMouseUp={handleTextSelect}>
        <p className="text-base text-white font-medium leading-relaxed">
          {concept.core_sentence}
        </p>
      </div>

      {/* Exceptions Section */}
      {concept.exceptions.length > 0 && (
        <div className="px-4 pb-3 border-t border-gray-700/50 pt-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500">
              {concept.exceptions.length} exception{concept.exceptions.length !== 1 ? 's' : ''}
            </span>
            <div className="flex gap-2">
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
          </div>
          <div className="space-y-1" onMouseUp={handleTextSelect}>
            {concept.exceptions.map((exc, idx) => (
              <ExceptionItem
                key={idx}
                item={exc}
                isExpanded={localExpanded.has(idx)}
                onToggle={() => toggleException(idx)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Attachments */}
      {concept.attachments.length > 0 && (
        <div className="px-4 py-2 bg-gray-850 border-t border-gray-700 flex flex-wrap gap-2">
          {concept.attachments.map((att, idx) => (
            <AttachmentBadge key={idx} item={att} />
          ))}
        </div>
      )}

      {/* Footer - Stop Reason */}
      <div className="px-4 py-1.5 bg-gray-900/50 border-t border-gray-700/50 flex items-center justify-between">
        <span className="text-xs text-gray-600">
          Stop: {concept.stop_reason.toLowerCase().replace('_', ' ')}
        </span>
        <span className="text-xs text-gray-600">
          {concept.metadata.processingTimeMs.toFixed(0)}ms
        </span>
      </div>
    </div>
  );
}
