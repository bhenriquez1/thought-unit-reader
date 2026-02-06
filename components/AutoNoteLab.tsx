"use client";

import React, { useState, useMemo, useCallback, memo } from 'react';
import type { CoreItemWithLearning, Trigger } from '../lib/core/types';
import { TRIGGER_LABELS } from '../lib/core/types';
import {
  generateAutoNotes,
  organizeNotes,
  filterNotesByType,
  filterNotesByPriority,
  getAttentionNotes,
  type AutoNote,
  type NoteType,
} from '../lib/core/autoNotes';
import type { RecallAttempt } from '../lib/core/analytics';

// ============================================================================
// Types
// ============================================================================

interface AutoNoteLabProps {
  items: CoreItemWithLearning[];
  recallHistory?: RecallAttempt[];
  onNoteClick?: (note: AutoNote) => void;
  onManualNoteAdd?: (text: string) => void;
}

type ViewMode = 'auto' | 'priority' | 'by-type' | 'by-trigger';
type FilterType = 'all' | NoteType;

// ============================================================================
// Note Card Component
// ============================================================================

const NoteCard = memo(function NoteCard({
  note,
  onClick,
  isExpanded,
  onToggle,
}: {
  note: AutoNote;
  onClick?: () => void;
  isExpanded?: boolean;
  onToggle?: () => void;
}) {
  const typeColors: Record<NoteType, string> = {
    concept: 'border-purple-500/50 bg-purple-900/20',
    exception: 'border-orange-500/50 bg-orange-900/20',
    procedure: 'border-blue-500/50 bg-blue-900/20',
    example: 'border-green-500/50 bg-green-900/20',
    flashcard: 'border-yellow-500/50 bg-yellow-900/20',
    mistake: 'border-red-500/50 bg-red-900/20',
    connection: 'border-cyan-500/50 bg-cyan-900/20',
  };

  const typeIcons: Record<NoteType, string> = {
    concept: '💡',
    exception: '⚠️',
    procedure: '📋',
    example: '💭',
    flashcard: '🃏',
    mistake: '❌',
    connection: '🔗',
  };

  return (
    <div
      className={`p-3 rounded-lg border cursor-pointer transition-all ${typeColors[note.type]} ${
        note.fromMistake ? 'ring-1 ring-red-500/50' : ''
      }`}
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm">{typeIcons[note.type]}</span>
          <span className="text-xs text-gray-400 capitalize">{note.type}</span>
          {note.fromMistake && (
            <span className="px-1.5 py-0.5 text-[10px] bg-red-600/30 text-red-300 rounded">
              Review
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {note.triggers.map((t) => (
            <span
              key={t}
              className="px-1.5 py-0.5 text-[10px] bg-gray-700/50 text-gray-300 rounded"
              title={TRIGGER_LABELS[t]}
            >
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* Content - Collapsed or Expanded */}
      <p
        className={`text-sm text-gray-200 leading-relaxed ${
          isExpanded ? '' : 'line-clamp-2'
        }`}
      >
        {note.content}
      </p>

      {/* Expanded Content */}
      {isExpanded && note.meta && (
        <div className="mt-3 pt-3 border-t border-gray-700/50 space-y-2">
          {note.meta.question && note.meta.answer && (
            <div className="space-y-1">
              <p className="text-xs text-gray-400">Q: {note.meta.question}</p>
              <p className="text-xs text-green-400">A: {note.meta.answer}</p>
            </div>
          )}
          {note.meta.steps && note.meta.steps.length > 0 && (
            <div>
              <p className="text-xs text-gray-400 mb-1">Steps:</p>
              <ol className="text-xs text-gray-300 list-decimal list-inside space-y-0.5">
                {note.meta.steps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </div>
          )}
          {note.meta.relatedItems && note.meta.relatedItems.length > 0 && (
            <div className="text-xs text-gray-500">
              Related: {note.meta.relatedItems.join(', ')}
            </div>
          )}
        </div>
      )}

      {/* Priority Badge */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-700/30">
        <span
          className={`text-[10px] ${
            note.priority >= 80
              ? 'text-red-400'
              : note.priority >= 60
              ? 'text-yellow-400'
              : 'text-gray-500'
          }`}
        >
          Priority: {note.priority}
        </span>
        {onToggle && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className="text-xs text-purple-400 hover:text-purple-300"
          >
            {isExpanded ? 'Collapse' : 'Expand'}
          </button>
        )}
      </div>
    </div>
  );
});

// ============================================================================
// Notes List Component
// ============================================================================

const NotesList = memo(function NotesList({
  notes,
  onNoteClick,
}: {
  notes: AutoNote[];
  onNoteClick?: (note: AutoNote) => void;
}) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  if (notes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="text-4xl mb-3">📝</div>
        <p className="text-sm text-gray-400">No notes yet.</p>
        <p className="text-xs text-gray-500 mt-1">
          Extract concepts with ⚡ Core to auto-generate notes.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {notes.map((note) => (
        <NoteCard
          key={note.id}
          note={note}
          onClick={() => onNoteClick?.(note)}
          isExpanded={expandedIds.has(note.id)}
          onToggle={() => toggleExpand(note.id)}
        />
      ))}
    </div>
  );
});

// ============================================================================
// Main Auto NoteLab Component
// ============================================================================

export const AutoNoteLab = memo(function AutoNoteLab({
  items,
  recallHistory = [],
  onNoteClick,
  onManualNoteAdd,
}: AutoNoteLabProps) {
  // State
  const [viewMode, setViewMode] = useState<ViewMode>('auto');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualNote, setManualNote] = useState('');

  // Generate auto-notes from Core items
  const autoNotesResult = useMemo(() => {
    return generateAutoNotes(items, recallHistory, {
      includeFlashcards: true,
      includeProcedures: true,
      includeExamples: true,
      prioritizeMistakes: true,
    });
  }, [items, recallHistory]);

  // Organize notes
  const organized = useMemo(
    () => organizeNotes(autoNotesResult.notes),
    [autoNotesResult.notes]
  );

  // Filter notes based on view mode and filter type
  const displayNotes = useMemo(() => {
    let notes = autoNotesResult.notes;

    // Filter by type
    if (filterType !== 'all') {
      notes = filterNotesByType(notes, [filterType]);
    }

    // Apply view mode
    switch (viewMode) {
      case 'priority':
        return [...organized.byPriority.urgent, ...organized.byPriority.high];
      case 'by-type':
        return notes;
      case 'by-trigger':
        return notes;
      default:
        return notes;
    }
  }, [autoNotesResult.notes, viewMode, filterType, organized]);

  // Attention notes (mistakes + weak items)
  const attentionNotes = useMemo(
    () => getAttentionNotes(autoNotesResult.notes),
    [autoNotesResult.notes]
  );

  // Handle manual note add
  const handleAddManualNote = useCallback(() => {
    if (manualNote.trim() && onManualNoteAdd) {
      onManualNoteAdd(manualNote.trim());
      setManualNote('');
      setShowManualInput(false);
    }
  }, [manualNote, onManualNoteAdd]);

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-700/50">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">📝</span>
            <h2 className="text-sm font-semibold text-white">Auto NoteLab</h2>
            <span className="px-1.5 py-0.5 text-xs bg-purple-600/30 text-purple-300 rounded">
              {autoNotesResult.notes.length} notes
            </span>
          </div>
          <button
            onClick={() => setShowManualInput(!showManualInput)}
            className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
          >
            + Manual
          </button>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <span>💡 {autoNotesResult.stats.byConcept}</span>
          <span>⚠️ {autoNotesResult.stats.byException}</span>
          <span>🃏 {autoNotesResult.stats.byFlashcard}</span>
          {autoNotesResult.stats.byMistake > 0 && (
            <span className="text-red-400">❌ {autoNotesResult.stats.byMistake}</span>
          )}
        </div>
      </div>

      {/* Attention Alert */}
      {attentionNotes.length > 0 && (
        <div className="px-4 py-2 bg-red-900/20 border-b border-red-600/30">
          <p className="text-xs text-red-400">
            ⚠️ {attentionNotes.length} notes need attention (mistakes + weak items)
          </p>
        </div>
      )}

      {/* Manual Note Input */}
      {showManualInput && (
        <div className="px-4 py-3 border-b border-gray-700/30">
          <textarea
            value={manualNote}
            onChange={(e) => setManualNote(e.target.value)}
            placeholder="Add a manual note..."
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 resize-none"
            rows={3}
          />
          <div className="flex justify-end gap-2 mt-2">
            <button
              onClick={() => setShowManualInput(false)}
              className="px-3 py-1 text-xs text-gray-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              onClick={handleAddManualNote}
              disabled={!manualNote.trim()}
              className="px-3 py-1 text-xs bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 text-white rounded transition-colors"
            >
              Add Note
            </button>
          </div>
        </div>
      )}

      {/* View Mode Tabs */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-gray-700/30">
        {[
          { mode: 'auto' as const, label: 'All' },
          { mode: 'priority' as const, label: 'Priority' },
          { mode: 'by-type' as const, label: 'By Type' },
        ].map(({ mode, label }) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`px-3 py-1 text-xs rounded transition-colors ${
              viewMode === mode
                ? 'bg-purple-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            {label}
          </button>
        ))}

        {/* Type Filter (when in by-type mode) */}
        {viewMode === 'by-type' && (
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as FilterType)}
            className="ml-auto px-2 py-1 text-xs bg-gray-800 border border-gray-700 rounded text-white"
          >
            <option value="all">All Types</option>
            <option value="concept">Concepts</option>
            <option value="exception">Exceptions</option>
            <option value="flashcard">Flashcards</option>
            <option value="procedure">Procedures</option>
            <option value="example">Examples</option>
            <option value="mistake">Mistakes</option>
          </select>
        )}
      </div>

      {/* Notes List */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <NotesList notes={displayNotes} onNoteClick={onNoteClick} />
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-gray-700/30 text-xs text-gray-500">
        Auto-generated from ⚡ Core • Manual highlighting optional
      </div>
    </div>
  );
});

export default AutoNoteLab;
