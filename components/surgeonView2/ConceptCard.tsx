// components/surgeonView2/ConceptCard.tsx
// Interactive concept card with source linking and tag management

import React, { useCallback } from 'react';
import type { CoreConceptV2, ConceptTag, ConceptPriority } from '../../lib/surgeonView2/types';

interface ConceptCardProps {
  concept: CoreConceptV2;
  isSelected: boolean;
  onClick: () => void;
  onTagChange: (tags: ConceptTag[]) => void;
  onJumpToSource: () => void;
}

// Priority badge colors
const PRIORITY_COLORS: Record<ConceptPriority, string> = {
  high: 'bg-red-100 text-red-800 border-red-200',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  low: 'bg-gray-100 text-gray-600 border-gray-200',
};

// Tag badge colors
const TAG_COLORS: Record<ConceptTag, string> = {
  definition: 'bg-blue-100 text-blue-700',
  process: 'bg-green-100 text-green-700',
  rule: 'bg-purple-100 text-purple-700',
  example: 'bg-orange-100 text-orange-700',
  pitfall: 'bg-red-100 text-red-700',
  formula: 'bg-indigo-100 text-indigo-700',
  comparison: 'bg-cyan-100 text-cyan-700',
  pearl: 'bg-amber-100 text-amber-700',
};

// Tag icons (simple text icons)
const TAG_ICONS: Record<ConceptTag, string> = {
  definition: 'DEF',
  process: 'PROC',
  rule: 'RULE',
  example: 'EX',
  pitfall: '!',
  formula: 'f(x)',
  comparison: 'vs',
  pearl: '*',
};

export const ConceptCard: React.FC<ConceptCardProps> = ({
  concept,
  isSelected,
  onClick,
  onTagChange,
  onJumpToSource,
}) => {
  const handleTagToggle = useCallback(
    (tag: ConceptTag) => {
      const currentTags = concept.tags;
      const newTags = currentTags.includes(tag)
        ? currentTags.filter((t) => t !== tag)
        : [...currentTags, tag];
      onTagChange(newTags);
    },
    [concept.tags, onTagChange]
  );

  const handleJumpClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onJumpToSource();
    },
    [onJumpToSource]
  );

  return (
    <div
      onClick={onClick}
      className={`
        relative p-3 rounded-lg border cursor-pointer transition-all duration-200
        ${isSelected
          ? 'border-blue-500 bg-blue-50 shadow-md ring-2 ring-blue-200'
          : 'border-gray-200 bg-white hover:border-blue-300 hover:shadow-sm'
        }
      `}
    >
      {/* Header: Label + Priority */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="text-sm font-semibold text-gray-900 leading-tight flex-1">
          {concept.label}
        </h3>
        <span
          className={`
            text-xs px-1.5 py-0.5 rounded border font-medium shrink-0
            ${PRIORITY_COLORS[concept.priority]}
          `}
        >
          {concept.priority === 'high' ? 'HY' : concept.priority === 'medium' ? 'M' : 'L'}
        </span>
      </div>

      {/* One-liner (the core concept) */}
      <p className="text-sm text-gray-700 mb-2 leading-relaxed">
        {concept.oneLiner}
      </p>

      {/* Tags row */}
      <div className="flex flex-wrap gap-1 mb-2">
        {concept.tags.map((tag) => (
          <span
            key={tag}
            onClick={(e) => {
              e.stopPropagation();
              handleTagToggle(tag);
            }}
            className={`
              text-xs px-1.5 py-0.5 rounded cursor-pointer
              ${TAG_COLORS[tag]}
              hover:opacity-80 transition-opacity
            `}
            title={`Click to remove ${tag} tag`}
          >
            {TAG_ICONS[tag]}
          </span>
        ))}
      </div>

      {/* Confidence & Exam Weight */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <div className="flex items-center gap-2">
          <span title="Extraction confidence">
            {Math.round(concept.confidence * 100)}% conf
          </span>
          {concept.examWeight !== undefined && concept.examWeight > 0.5 && (
            <span className="text-red-600 font-medium" title="Exam relevance">
              Exam {Math.round(concept.examWeight * 100)}%
            </span>
          )}
        </div>

        {/* Jump to source button */}
        <button
          onClick={handleJumpClick}
          className="
            flex items-center gap-1 px-2 py-0.5 rounded
            text-blue-600 hover:bg-blue-100 transition-colors
          "
          title={`Jump to page ${concept.anchor.pageIndex + 1}`}
        >
          <span>p.{concept.anchor.pageIndex + 1}</span>
          <svg
            className="w-3 h-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 7l5 5m0 0l-5 5m5-5H6"
            />
          </svg>
        </button>
      </div>

      {/* Question hint (if available) */}
      {concept.questionHint && (
        <div className="mt-2 pt-2 border-t border-gray-100">
          <p className="text-xs text-gray-500 italic">
            Q: {concept.questionHint}
          </p>
        </div>
      )}

      {/* Selection indicator */}
      {isSelected && (
        <div className="absolute -left-0.5 top-2 bottom-2 w-1 bg-blue-500 rounded-r" />
      )}
    </div>
  );
};

export default ConceptCard;
