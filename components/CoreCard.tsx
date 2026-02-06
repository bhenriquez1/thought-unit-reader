"use client";

import React, { useState, memo } from 'react';
import type { CoreItem, Trigger, LearningState } from '../lib/core/types';
import { TRIGGER_LABELS, CORE_LIMITS } from '../lib/core';

// ============================================================================
// Types
// ============================================================================

interface CoreCardProps {
  item: CoreItem;
  learningState?: LearningState;
  confidence?: number;
  isHighlighted?: boolean;
  onSelect?: (item: CoreItem) => void;
  onRequestAttachment?: (item: CoreItem, type: 'procedure' | 'example' | 'visual') => void;
}

// ============================================================================
// Trigger Badge Component
// ============================================================================

const TRIGGER_COLORS: Record<Trigger, string> = {
  A: 'bg-blue-600/30 text-blue-300 border-blue-500/50',      // Conditional
  B: 'bg-orange-600/30 text-orange-300 border-orange-500/50', // Contrast
  C: 'bg-green-600/30 text-green-300 border-green-500/50',    // Causation
  D: 'bg-purple-600/30 text-purple-300 border-purple-500/50', // Definition
  E: 'bg-cyan-600/30 text-cyan-300 border-cyan-500/50',       // Enumeration
  F: 'bg-red-600/30 text-red-300 border-red-500/50',          // Formula
  G: 'bg-yellow-600/30 text-yellow-300 border-yellow-500/50', // Gradation
  H: 'bg-pink-600/30 text-pink-300 border-pink-500/50',       // Hierarchy
};

const TriggerBadge = memo(function TriggerBadge({ trigger }: { trigger: Trigger }) {
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 text-xs font-mono border rounded ${TRIGGER_COLORS[trigger]}`}
      title={TRIGGER_LABELS[trigger]}
    >
      {trigger}
    </span>
  );
});

// ============================================================================
// Learning State Badge
// ============================================================================

const LEARNING_STATE_STYLES: Record<LearningState, { bg: string; label: string }> = {
  new: { bg: 'bg-gray-600/50 text-gray-300', label: 'New' },
  learning: { bg: 'bg-blue-600/50 text-blue-300', label: 'Learning' },
  review: { bg: 'bg-yellow-600/50 text-yellow-300', label: 'Review' },
  weak: { bg: 'bg-red-600/50 text-red-300', label: 'Weak' },
  mastered: { bg: 'bg-green-600/50 text-green-300', label: 'Mastered' },
};

const LearningBadge = memo(function LearningBadge({ state }: { state: LearningState }) {
  const style = LEARNING_STATE_STYLES[state];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs rounded-full ${style.bg}`}>
      {style.label}
    </span>
  );
});

// ============================================================================
// Confidence Bar
// ============================================================================

const ConfidenceBar = memo(function ConfidenceBar({ value }: { value: number }) {
  const percentage = Math.round(value * 100);
  const color =
    value >= 0.8 ? 'bg-green-500' :
    value >= 0.6 ? 'bg-yellow-500' :
    value >= 0.4 ? 'bg-orange-500' : 'bg-red-500';

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} transition-all duration-300`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-xs text-gray-500 tabular-nums">{percentage}%</span>
    </div>
  );
});

// ============================================================================
// Attachment Buttons
// ============================================================================

interface AttachmentButtonsProps {
  available: CoreItem['attachments_available'];
  onRequest: (type: 'procedure' | 'example' | 'visual') => void;
}

const AttachmentButtons = memo(function AttachmentButtons({ available, onRequest }: AttachmentButtonsProps) {
  const buttons = [
    { type: 'procedure' as const, icon: '📋', label: 'Steps', enabled: available.procedure },
    { type: 'example' as const, icon: '💡', label: 'Example', enabled: available.example },
    { type: 'visual' as const, icon: '🖼️', label: 'Visual', enabled: available.visual },
  ];

  const enabledButtons = buttons.filter(b => b.enabled);

  if (enabledButtons.length === 0) return null;

  return (
    <div className="flex gap-1.5 mt-2">
      {enabledButtons.map(({ type, icon, label }) => (
        <button
          key={type}
          onClick={(e) => {
            e.stopPropagation();
            onRequest(type);
          }}
          className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-700/50 hover:bg-gray-600/50 text-gray-300 rounded transition-colors"
        >
          <span>{icon}</span>
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
});

// ============================================================================
// Main CoreCard Component
// ============================================================================

export const CoreCard = memo(function CoreCard({
  item,
  learningState,
  confidence,
  isHighlighted = false,
  onSelect,
  onRequestAttachment,
}: CoreCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasExceptions = item.exceptions.length > 0;
  const hasAttachments = Object.values(item.attachments_available).some(Boolean);

  const handleClick = () => {
    if (hasExceptions || hasAttachments) {
      setIsExpanded(!isExpanded);
    }
    onSelect?.(item);
  };

  return (
    <div
      className={`
        relative p-3 rounded-lg border transition-all duration-200 cursor-pointer
        ${isHighlighted
          ? 'bg-purple-900/30 border-purple-500/50 shadow-lg shadow-purple-500/10'
          : 'bg-gray-800/50 border-gray-700/50 hover:border-gray-600/50 hover:bg-gray-800/70'
        }
      `}
      onClick={handleClick}
    >
      {/* Header: Triggers + Learning State */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5">
          {item.triggers.map((trigger, i) => (
            <TriggerBadge key={`${trigger}-${i}`} trigger={trigger} />
          ))}
        </div>
        <div className="flex items-center gap-2">
          {learningState && <LearningBadge state={learningState} />}
          {hasExceptions && (
            <span className="text-xs text-gray-500">
              {item.exceptions.length} exception{item.exceptions.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Core Sentence */}
      <p className="text-sm text-gray-200 leading-relaxed">
        {item.core_sentence}
      </p>

      {/* Confidence Bar */}
      <div className="mt-2">
        <ConfidenceBar value={confidence ?? item.confidence} />
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-gray-700/50 space-y-3">
          {/* Exceptions */}
          {hasExceptions && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                Exceptions
              </div>
              {item.exceptions.map((exc, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 pl-2 border-l-2 border-orange-500/50"
                >
                  <TriggerBadge trigger={exc.trigger} />
                  <p className="text-sm text-gray-300">{exc.sentence}</p>
                </div>
              ))}
            </div>
          )}

          {/* Source Info */}
          <div className="text-xs text-gray-500">
            <span>Page {item.source.page}</span>
            {item.source.paragraph_index !== null && (
              <span> · Paragraph {item.source.paragraph_index + 1}</span>
            )}
          </div>

          {/* Attachment Buttons */}
          {hasAttachments && onRequestAttachment && (
            <AttachmentButtons
              available={item.attachments_available}
              onRequest={(type) => onRequestAttachment(item, type)}
            />
          )}
        </div>
      )}

      {/* Expand Indicator */}
      {(hasExceptions || hasAttachments) && !isExpanded && (
        <div className="absolute bottom-1 right-2 text-xs text-gray-500">
          ▼
        </div>
      )}
    </div>
  );
});

// ============================================================================
// CoreCard List Component
// ============================================================================

interface CoreCardListProps {
  items: CoreItem[];
  learningStates?: Record<string, LearningState>;
  highlightedId?: string | null;
  onSelectItem?: (item: CoreItem) => void;
  onRequestAttachment?: (item: CoreItem, type: 'procedure' | 'example' | 'visual') => void;
  emptyMessage?: string;
}

export const CoreCardList = memo(function CoreCardList({
  items,
  learningStates = {},
  highlightedId,
  onSelectItem,
  onRequestAttachment,
  emptyMessage = 'No concepts extracted for this view.',
}: CoreCardListProps) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="text-4xl mb-3">⚡</div>
        <p className="text-sm text-gray-400">{emptyMessage}</p>
        <p className="text-xs text-gray-500 mt-1">
          Scroll through the document to extract core concepts
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <CoreCard
          key={item.id}
          item={item}
          learningState={learningStates[item.id]}
          isHighlighted={item.id === highlightedId}
          onSelect={onSelectItem}
          onRequestAttachment={onRequestAttachment}
        />
      ))}
    </div>
  );
});

// ============================================================================
// Stats Display
// ============================================================================

interface CoreStatsProps {
  stats: {
    input_paragraphs: number;
    items_returned: number;
    sentences_total: number;
  };
  extractionTimeMs?: number;
}

export const CoreStats = memo(function CoreStats({ stats, extractionTimeMs }: CoreStatsProps) {
  return (
    <div className="flex items-center gap-4 px-3 py-2 bg-gray-800/30 rounded-lg text-xs text-gray-400">
      <span>
        <strong className="text-gray-300">{stats.items_returned}</strong>/{CORE_LIMITS.MAX_ITEMS} items
      </span>
      <span>
        <strong className="text-gray-300">{stats.sentences_total}</strong>/{CORE_LIMITS.MAX_SENTENCES_TOTAL} sentences
      </span>
      <span>
        <strong className="text-gray-300">{stats.input_paragraphs}</strong> paragraphs
      </span>
      {extractionTimeMs !== undefined && (
        <span className="ml-auto text-gray-500">
          {extractionTimeMs.toFixed(0)}ms
        </span>
      )}
    </div>
  );
});

export default CoreCard;
