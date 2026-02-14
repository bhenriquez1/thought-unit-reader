// components/cognitiveEngine/NoteLab2.tsx
// NoteLab 2.0 - 3-Lane Kanban for Cognitive Notes

import React, { useState } from 'react';
import { useNoteLabStore } from '@/lib/cognitiveEngine/noteLabStore';
import type {
  NoteLabNote,
  NoteLabLane,
  NoteLabNoteType,
  QuickCaptureType,
  MissDetector,
} from '@/lib/cognitiveEngine/types';
import MissDetectorBox from './MissDetectorBox';

// ============================================================================
// Constants
// ============================================================================

const LANE_CONFIG: Record<NoteLabLane, { label: string; icon: string; color: string }> = {
  insights: { label: 'Insights', icon: '💡', color: 'teal' },
  reasoning: { label: 'Reasoning', icon: '🧠', color: 'purple' },
  memory: { label: 'Memory', icon: '🔁', color: 'amber' },
};

const TYPE_CONFIG: Record<NoteLabNoteType, { label: string; icon: string }> = {
  INSIGHT: { label: 'Insight', icon: '💡' },
  DIFFERENTIAL: { label: 'Differential', icon: '⚖️' },
  DECISION_RULE: { label: 'Decision Rule', icon: '🔀' },
  PATHWAY: { label: 'Pathway', icon: '🔗' },
  TRAP: { label: 'Trap', icon: '⚠️' },
  MNEMONIC: { label: 'Mnemonic', icon: '🧠' },
  QUESTION: { label: 'Question', icon: '❓' },
};

const BUCKET_STYLES: Record<string, string> = {
  CRITICAL: 'border-l-red-500',
  HIGH_YIELD: 'border-l-amber-500',
  IMPORTANT: 'border-l-blue-500',
  CONTEXT: 'border-l-gray-500',
};

// ============================================================================
// Main Component
// ============================================================================

interface NoteLab2Props {
  onJumpToPage?: (page: number) => void;
}

export const NoteLab2: React.FC<NoteLab2Props> = ({ onJumpToPage }) => {
  const {
    notes,
    selectedNoteId,
    activeLane,
    filterByType,
    showMasteredNotes,
    searchQuery,
    selectNote,
    setActiveLane,
    setFilterByType,
    toggleShowMastered,
    setSearchQuery,
    getNotesForLane,
    quickCapture,
    markConfusing,
    markMastered,
    moveToLane,
    updateMissDetector,
    deleteNote,
  } = useNoteLabStore();

  const [quickCaptureInput, setQuickCaptureInput] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);

  const selectedNote = selectedNoteId ? notes[selectedNoteId] : null;

  // Get notes for each lane
  const laneNotes: Record<NoteLabLane, NoteLabNote[]> = {
    insights: getNotesForLane('insights'),
    reasoning: getNotesForLane('reasoning'),
    memory: getNotesForLane('memory'),
  };

  const handleQuickCapture = (type: QuickCaptureType) => {
    if (!quickCaptureInput.trim()) return;
    quickCapture(type, quickCaptureInput.trim());
    setQuickCaptureInput('');
  };

  return (
    <div className="flex flex-col h-full bg-gray-900 text-white">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">NoteLab 2.0</h2>
          <div className="flex items-center gap-2">
            {/* Filter by type */}
            <select
              value={filterByType || ''}
              onChange={(e) => setFilterByType(e.target.value as NoteLabNoteType || undefined)}
              className="px-2 py-1 text-xs bg-gray-800 border border-gray-700 rounded"
            >
              <option value="">All Types</option>
              {Object.entries(TYPE_CONFIG).map(([type, config]) => (
                <option key={type} value={type}>{config.icon} {config.label}</option>
              ))}
            </select>

            {/* Show mastered toggle */}
            <button
              onClick={toggleShowMastered}
              className={`px-2 py-1 text-xs rounded ${showMasteredNotes ? 'bg-green-600' : 'bg-gray-700'}`}
            >
              {showMasteredNotes ? '✅ Show Mastered' : 'Hide Mastered'}
            </button>
          </div>
        </div>

        {/* Search */}
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search notes..."
          className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded"
        />

        {/* Quick Capture */}
        <div className="mt-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={quickCaptureInput}
              onChange={(e) => setQuickCaptureInput(e.target.value)}
              placeholder="Quick capture..."
              className="flex-1 px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleQuickCapture('insight');
              }}
            />
          </div>
          <div className="flex gap-1 mt-2">
            <QuickCaptureButton
              type="insight"
              icon="💡"
              label="Insight"
              disabled={!quickCaptureInput.trim()}
              onClick={() => handleQuickCapture('insight')}
            />
            <QuickCaptureButton
              type="confusing"
              icon="⚠️"
              label="Confusing"
              disabled={!quickCaptureInput.trim()}
              onClick={() => handleQuickCapture('confusing')}
            />
            <QuickCaptureButton
              type="review"
              icon="🔁"
              label="Review"
              disabled={!quickCaptureInput.trim()}
              onClick={() => handleQuickCapture('review')}
            />
            <QuickCaptureButton
              type="high_yield"
              icon="🔥"
              label="High-Yield"
              disabled={!quickCaptureInput.trim()}
              onClick={() => handleQuickCapture('high_yield')}
            />
            <QuickCaptureButton
              type="question"
              icon="❓"
              label="Question"
              disabled={!quickCaptureInput.trim()}
              onClick={() => handleQuickCapture('question')}
            />
          </div>
        </div>
      </div>

      {/* 3-Lane Kanban */}
      <div className="flex-1 flex overflow-hidden">
        {(['insights', 'reasoning', 'memory'] as NoteLabLane[]).map((lane) => {
          const config = LANE_CONFIG[lane];
          const notesInLane = laneNotes[lane];

          return (
            <div
              key={lane}
              className={`flex-1 flex flex-col border-r border-gray-700 last:border-r-0 ${
                activeLane === lane ? 'bg-gray-800/30' : ''
              }`}
            >
              {/* Lane Header */}
              <div
                className={`p-3 border-b border-gray-700 cursor-pointer hover:bg-gray-800/50 ${
                  activeLane === lane ? `bg-${config.color}-900/30` : ''
                }`}
                onClick={() => setActiveLane(lane)}
              >
                <div className="flex items-center gap-2">
                  <span>{config.icon}</span>
                  <span className="font-medium">{config.label}</span>
                  <span className="text-xs text-gray-500">({notesInLane.length})</span>
                </div>
              </div>

              {/* Notes List */}
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {notesInLane.length === 0 ? (
                  <div className="text-center text-gray-500 text-sm py-8">
                    No notes in {config.label.toLowerCase()}
                  </div>
                ) : (
                  notesInLane.map((note) => (
                    <NoteCard
                      key={note.id}
                      note={note}
                      isSelected={selectedNoteId === note.id}
                      onClick={() => selectNote(note.id)}
                      onMarkConfusing={() => markConfusing(note.id)}
                      onMarkMastered={() => markMastered(note.id)}
                      onDelete={() => deleteNote(note.id)}
                      onJumpToPage={onJumpToPage}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected Note Detail Panel */}
      {selectedNote && (
        <NoteDetailPanel
          note={selectedNote}
          onClose={() => selectNote(undefined)}
          onUpdateMissDetector={(md) => updateMissDetector(selectedNote.id, md)}
          onMoveToLane={(lane) => moveToLane(selectedNote.id, lane)}
          onMarkConfusing={() => markConfusing(selectedNote.id)}
          onMarkMastered={() => markMastered(selectedNote.id)}
          onJumpToPage={onJumpToPage}
        />
      )}
    </div>
  );
};

// ============================================================================
// Sub-components
// ============================================================================

const QuickCaptureButton: React.FC<{
  type: QuickCaptureType;
  icon: string;
  label: string;
  disabled: boolean;
  onClick: () => void;
}> = ({ icon, label, disabled, onClick }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`
      flex-1 px-2 py-1 text-xs rounded transition-colors
      ${disabled
        ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
        : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
      }
    `}
  >
    {icon} {label}
  </button>
);

const NoteCard: React.FC<{
  note: NoteLabNote;
  isSelected: boolean;
  onClick: () => void;
  onMarkConfusing: () => void;
  onMarkMastered: () => void;
  onDelete: () => void;
  onJumpToPage?: (page: number) => void;
}> = ({ note, isSelected, onClick, onMarkConfusing, onMarkMastered, onDelete, onJumpToPage }) => {
  const typeConfig = TYPE_CONFIG[note.noteType];
  const bucketStyle = note.importanceBucket ? BUCKET_STYLES[note.importanceBucket] : 'border-l-gray-600';

  return (
    <div
      className={`
        p-3 rounded-lg cursor-pointer transition-all border-l-4
        ${bucketStyle}
        ${isSelected
          ? 'bg-teal-900/30 ring-1 ring-teal-500'
          : 'bg-gray-800/50 hover:bg-gray-800'
        }
        ${note.isConfusing ? 'ring-1 ring-amber-500/50' : ''}
        ${note.isMastered ? 'opacity-60' : ''}
      `}
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-start gap-2">
        <span className="text-sm">{typeConfig.icon}</span>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-white truncate">{note.title}</h4>
          <p className="text-xs text-gray-400">{typeConfig.label}</p>
        </div>

        {/* Status indicators */}
        <div className="flex gap-1">
          {note.isConfusing && <span title="Confusing">⚠️</span>}
          {note.isMastered && <span title="Mastered">✅</span>}
          {note.missDetector && <span title="Has Miss Detector">🎯</span>}
        </div>
      </div>

      {/* Content preview */}
      <p className="text-xs text-gray-400 mt-2 line-clamp-2">{note.content}</p>

      {/* Footer */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-700">
        {note.pageIndex !== undefined && onJumpToPage && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onJumpToPage(note.pageIndex!);
            }}
            className="text-xs text-teal-400 hover:text-teal-300"
          >
            p.{note.pageIndex}
          </button>
        )}
        <div className="flex gap-1 ml-auto">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMarkConfusing();
            }}
            className="p-1 text-xs hover:bg-gray-700 rounded"
            title="Mark Confusing"
          >
            ⚠️
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMarkMastered();
            }}
            className="p-1 text-xs hover:bg-gray-700 rounded"
            title="Mark Mastered"
          >
            ✅
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-1 text-xs hover:bg-red-900/50 rounded text-red-400"
            title="Delete"
          >
            🗑️
          </button>
        </div>
      </div>
    </div>
  );
};

const NoteDetailPanel: React.FC<{
  note: NoteLabNote;
  onClose: () => void;
  onUpdateMissDetector: (md: MissDetector) => void;
  onMoveToLane: (lane: NoteLabLane) => void;
  onMarkConfusing: () => void;
  onMarkMastered: () => void;
  onJumpToPage?: (page: number) => void;
}> = ({
  note,
  onClose,
  onUpdateMissDetector,
  onMoveToLane,
  onMarkConfusing,
  onMarkMastered,
  onJumpToPage,
}) => {
  const typeConfig = TYPE_CONFIG[note.noteType];

  return (
    <div className="border-t border-gray-700 bg-gray-800 max-h-96 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-xl">{typeConfig.icon}</span>
          <div>
            <h3 className="font-medium text-white">{note.title}</h3>
            <p className="text-xs text-gray-400">{typeConfig.label}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-gray-700 rounded"
        >
          ✕
        </button>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Main content */}
        <div>
          <h4 className="text-xs font-semibold text-gray-400 uppercase mb-2">Content</h4>
          <p className="text-sm text-gray-200 whitespace-pre-wrap">{note.content}</p>
        </div>

        {/* Quote */}
        {note.quote && (
          <div className="p-3 bg-gray-900 rounded border-l-2 border-teal-500">
            <p className="text-sm text-gray-300 italic">&quot;{note.quote}&quot;</p>
            {note.pageIndex !== undefined && onJumpToPage && (
              <button
                onClick={() => onJumpToPage(note.pageIndex!)}
                className="text-xs text-teal-400 mt-2"
              >
                Jump to p.{note.pageIndex}
              </button>
            )}
          </div>
        )}

        {/* Miss Detector Box */}
        <MissDetectorBox
          missDetector={note.missDetector}
          onUpdate={onUpdateMissDetector}
        />

        {/* Actions */}
        <div className="flex flex-wrap gap-2 pt-4 border-t border-gray-700">
          <button
            onClick={onMarkConfusing}
            className={`px-3 py-1.5 text-sm rounded ${
              note.isConfusing ? 'bg-amber-600' : 'bg-gray-700 hover:bg-gray-600'
            }`}
          >
            ⚠️ {note.isConfusing ? 'Confusing' : 'Mark Confusing'}
          </button>
          <button
            onClick={onMarkMastered}
            className={`px-3 py-1.5 text-sm rounded ${
              note.isMastered ? 'bg-green-600' : 'bg-gray-700 hover:bg-gray-600'
            }`}
          >
            ✅ {note.isMastered ? 'Mastered' : 'Mark Mastered'}
          </button>

          {/* Move to lane */}
          <select
            value={note.lane}
            onChange={(e) => onMoveToLane(e.target.value as NoteLabLane)}
            className="px-3 py-1.5 text-sm bg-gray-700 rounded"
          >
            {(['insights', 'reasoning', 'memory'] as NoteLabLane[]).map((lane) => (
              <option key={lane} value={lane}>
                {LANE_CONFIG[lane].icon} Move to {LANE_CONFIG[lane].label}
              </option>
            ))}
          </select>
        </div>

        {/* Tags */}
        {note.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {note.tags.map((tag) => (
              <span key={tag} className="px-2 py-0.5 text-xs bg-gray-700 rounded">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default NoteLab2;
