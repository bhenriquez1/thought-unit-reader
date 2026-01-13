// components/HighlightActionMenu.tsx
// Inline action menu for highlighted text in Surgeon View PDRM

import React, { useRef, useEffect } from 'react';

export type PDRMTag = 'P' | 'D' | 'R' | 'M';

export interface HighlightAction {
  type: 'note' | 'flashcard' | 'tag' | 'hyperchunk';
  tagType?: PDRMTag;
}

interface HighlightActionMenuProps {
  selectedText: string;
  position: { x: number; y: number };
  onAction: (action: HighlightAction) => void;
  onClose: () => void;
  visible: boolean;
}

export default function HighlightActionMenu({
  selectedText,
  position,
  onAction,
  onClose,
  visible,
}: HighlightActionMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!visible) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [visible, onClose]);

  // Close on escape
  useEffect(() => {
    if (!visible) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [visible, onClose]);

  if (!visible || !selectedText) return null;

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-gray-800 border border-gray-600 rounded-lg shadow-2xl p-2 min-w-[200px]"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: 'translate(-50%, 8px)',
      }}
    >
      {/* Selected text preview */}
      <div className="px-2 py-1 text-xs text-gray-400 border-b border-gray-700 mb-2 max-w-[300px] truncate">
        "{selectedText.substring(0, 60)}{selectedText.length > 60 ? '...' : ''}"
      </div>

      {/* Action buttons */}
      <div className="flex flex-col gap-1">
        {/* Add Note */}
        <button
          onClick={() => {
            onAction({ type: 'note' });
            onClose();
          }}
          className="flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-700 text-left text-sm transition-colors"
          title="Add note to this text"
        >
          <span className="text-blue-400">📝</span>
          <span>Add Note</span>
        </button>

        {/* Create Flashcard */}
        <button
          onClick={() => {
            onAction({ type: 'flashcard' });
            onClose();
          }}
          className="flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-700 text-left text-sm transition-colors"
          title="Create flashcard from this text"
        >
          <span className="text-green-400">🎴</span>
          <span>Create Flashcard</span>
        </button>

        {/* Pattern Tags */}
        <div className="border-t border-gray-700 mt-1 pt-1">
          <div className="px-3 py-1 text-xs text-gray-500 uppercase">Pattern Tags</div>
          <div className="grid grid-cols-2 gap-1">
            <button
              onClick={() => {
                onAction({ type: 'tag', tagType: 'P' });
                onClose();
              }}
              className="flex items-center gap-1 px-2 py-1.5 rounded hover:bg-purple-900/30 text-left text-sm transition-colors"
              title="Pattern: Core principle or recurring pattern"
            >
              <span className="font-bold text-purple-400">P</span>
              <span className="text-xs">Pattern</span>
            </button>
            <button
              onClick={() => {
                onAction({ type: 'tag', tagType: 'D' });
                onClose();
              }}
              className="flex items-center gap-1 px-2 py-1.5 rounded hover:bg-blue-900/30 text-left text-sm transition-colors"
              title="Decision: Critical decision point or clinical reasoning"
            >
              <span className="font-bold text-blue-400">D</span>
              <span className="text-xs">Decision</span>
            </button>
            <button
              onClick={() => {
                onAction({ type: 'tag', tagType: 'R' });
                onClose();
              }}
              className="flex items-center gap-1 px-2 py-1.5 rounded hover:bg-red-900/30 text-left text-sm transition-colors"
              title="Risk: Warning, contraindication, or failure mode"
            >
              <span className="font-bold text-red-400">R</span>
              <span className="text-xs">Risk</span>
            </button>
            <button
              onClick={() => {
                onAction({ type: 'tag', tagType: 'M' });
                onClose();
              }}
              className="flex items-center gap-1 px-2 py-1.5 rounded hover:bg-yellow-900/30 text-left text-sm transition-colors"
              title="Mechanism: How it works (MOA, pathway, process)"
            >
              <span className="font-bold text-yellow-400">M</span>
              <span className="text-xs">Mechanism</span>
            </button>
          </div>
        </div>

        {/* Hyper-Chunk */}
        <button
          onClick={() => {
            onAction({ type: 'hyperchunk' });
            onClose();
          }}
          className="flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-700 text-left text-sm transition-colors border-t border-gray-700 mt-1 pt-2"
          title="Group this with related concepts into a Hyper-Chunk"
        >
          <span className="text-orange-400">🔗</span>
          <span>Add to Hyper-Chunk</span>
        </button>
      </div>
    </div>
  );
}
