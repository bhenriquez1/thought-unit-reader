// components/surgeonView2/PearlCard.tsx
// Pearl card for high-value insights, tips, warnings, mnemonics

import React from 'react';
import type { Pearl, PearlType } from '../../lib/surgeonView2/types';

interface PearlCardProps {
  pearl: Pearl;
  isSelected: boolean;
  onClick: () => void;
  onJumpToSource: () => void;
}

// Pearl type styling
const PEARL_STYLES: Record<PearlType, { bg: string; border: string; icon: string; label: string }> = {
  insight: {
    bg: 'bg-amber-50',
    border: 'border-amber-300',
    icon: '💡',
    label: 'Insight',
  },
  tip: {
    bg: 'bg-green-50',
    border: 'border-green-300',
    icon: '✓',
    label: 'Tip',
  },
  warning: {
    bg: 'bg-red-50',
    border: 'border-red-300',
    icon: '⚠',
    label: 'Warning',
  },
  mnemonic: {
    bg: 'bg-purple-50',
    border: 'border-purple-300',
    icon: '🧠',
    label: 'Mnemonic',
  },
  shortcut: {
    bg: 'bg-blue-50',
    border: 'border-blue-300',
    icon: '⚡',
    label: 'Shortcut',
  },
  exception: {
    bg: 'bg-orange-50',
    border: 'border-orange-300',
    icon: '!',
    label: 'Exception',
  },
};

export const PearlCard: React.FC<PearlCardProps> = ({
  pearl,
  isSelected,
  onClick,
  onJumpToSource,
}) => {
  const style = PEARL_STYLES[pearl.type];

  return (
    <div
      onClick={onClick}
      className={`
        relative p-3 rounded-lg border-2 cursor-pointer transition-all duration-200
        ${style.bg} ${style.border}
        ${isSelected ? 'ring-2 ring-blue-400 shadow-md' : 'hover:shadow-sm'}
      `}
    >
      {/* Header: Type badge + Priority */}
      <div className="flex items-center justify-between mb-2">
        <span className="flex items-center gap-1.5">
          <span className="text-lg">{style.icon}</span>
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-600">
            {style.label}
          </span>
        </span>

        {pearl.priority === 'high' && (
          <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-700 rounded font-medium">
            HY
          </span>
        )}
      </div>

      {/* Pearl content */}
      <p className="text-sm text-gray-800 font-medium leading-relaxed mb-2">
        {pearl.content}
      </p>

      {/* Context (if available) */}
      {pearl.context && (
        <p className="text-xs text-gray-600 italic mb-2">
          {pearl.context}
        </p>
      )}

      {/* Tags & Source link */}
      <div className="flex items-center justify-between">
        {/* Tags */}
        <div className="flex flex-wrap gap-1">
          {pearl.tags.slice(0, 3).map((tag, idx) => (
            <span
              key={idx}
              className="text-xs px-1.5 py-0.5 bg-white/60 rounded text-gray-600"
            >
              {tag}
            </span>
          ))}
        </div>

        {/* Jump to source */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onJumpToSource();
          }}
          className="
            flex items-center gap-1 px-2 py-0.5 rounded
            text-gray-600 hover:bg-white/50 transition-colors text-xs
          "
          title={`Jump to page ${pearl.anchor.pageIndex + 1}`}
        >
          <span>p.{pearl.anchor.pageIndex + 1}</span>
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

      {/* Selection indicator */}
      {isSelected && (
        <div className="absolute -left-0.5 top-2 bottom-2 w-1 bg-blue-500 rounded-r" />
      )}
    </div>
  );
};

export default PearlCard;
