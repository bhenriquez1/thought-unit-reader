"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { 
  DAT_PATTERNS, 
  getPatternById,
  type Pattern
} from "@/types/patterns";
import type { ThoughtUnit } from "@/types/reading";
import { auth } from "@/lib/firebase";
import type { User } from "firebase/auth";

// Define missing types
interface PatternTag {
  patternId: string;
  patternName: string;
  confidence: number;
}

interface OptimizedNoteLabViewProps {
  bookId: string;
  userId: string;
  thoughtUnits: ThoughtUnit[];
  currentThoughtUnit: number;
  currentPage: number;
  pdfPageCount?: number;
  fontSize: number;
  fontFamily: string;
  lineSpacing: number;
  onWordClick?: (word: string) => void;
  onTextSelect?: (text: string) => void;
  onGenerateNote?: (text: string, mnemonic?: string, mode?: "sketch" | "highYield") => void;
  selBind?: { onMouseUp?: (e: React.MouseEvent) => void };
  externalSelectionText?: string;
}

type StudyLevel = 'basic' | 'intermediate' | 'advanced';
type NoteStatus = 'draft' | 'reviewing' | 'complete';

interface NoteState {
  title: string;
  content: string;
  tags: PatternTag[];
  studyLevel: StudyLevel;
  status: NoteStatus;
  linkedThoughtUnit: number;
  createdAt: string;
  lastModified: string;
}

interface FilterState {
  searchQuery: string;
  selectedPattern: string;
  selectedLevel: StudyLevel | 'all';
  selectedStatus: NoteStatus | 'all';
}

// Enhanced loading states
interface LoadingState {
  isLoadingNotes: boolean;
  isSavingNote: boolean;
  isExporting: boolean;
  isGeneratingFlashcard: boolean;
  progress: number;
  message: string;
}

// Optimized helper functions
const getPatternColor = (patternId: string): string => {
  const colors: Record<string, string> = {
    'cardio': 'bg-red-500',
    '5q-rule': 'bg-blue-500',
    'sn-e-flow': 'bg-green-500',
    'spectroscopy-anchors': 'bg-purple-500',
    'eas-directors': 'bg-yellow-500',
    'q-vs-k': 'bg-pink-500',
    'delta-g-signs': 'bg-indigo-500',
    'gas-laws': 'bg-teal-500',
    'organelle-function': 'bg-orange-500',
    'genetics-hardy-weinberg': 'bg-cyan-500',
    'caries-treatment': 'bg-lime-500',
    'endo-pulp-diagnosis': 'bg-amber-500',
    'cause-effect': 'bg-emerald-500',
    'compare-contrast': 'bg-violet-500'
  };
  return colors[patternId] || 'bg-gray-500';
};

const getStudyLevelIcon = (level: StudyLevel): string => {
  switch (level) {
    case 'basic': return '🟢';
    case 'intermediate': return '🟡';
    case 'advanced': return '🔴';
  }
};

const getStatusIcon = (status: NoteStatus): string => {
  switch (status) {
    case 'draft': return '📝';
    case 'reviewing': return '👁️';
    case 'complete': return '✅';
  }
};

// Memoized components for better performance
const LoadingSpinner = React.memo(({ message, progress }: { message: string; progress?: number }) => (
  <div className="flex flex-col items-center justify-center p-8">
    <div className="relative">
      <div className="animate-spin text-6xl mb-4">📝</div>
      {progress !== undefined && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-xs font-bold text-white">
            {Math.round(progress)}%
          </div>
        </div>
      )}
    </div>
    <p className="text-gray-400 text-center max-w-md">{message}</p>
    {progress !== undefined && (
      <div className="w-64 bg-gray-700 rounded-full h-2 mt-4">
        <div 
          className="bg-green-500 h-2 rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    )}
  </div>
));
LoadingSpinner.displayName = 'LoadingSpinner';

const NoteCard = React.memo(({ 
  note, 
  onEdit, 
  onDelete, 
  onExportFlashcard 
}: { 
  note: NoteState; 
  onEdit: (note: NoteState) => void;
  onDelete: (id: string) => void;
  onExportFlashcard: (note: NoteState) => void;
}) => (
  <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 hover:bg-gray-750 transition-all duration-200">
    <div className="flex justify-between items-start mb-2">
      <h4 className="text-white text-sm font-medium">
        {note.title || `Unit ${note.linkedThoughtUnit} Note`}
      </h4>
      <div className="flex items-center gap-1">
        <span>{getStatusIcon(note.status)}</span>
        <span>{getStudyLevelIcon(note.studyLevel)}</span>
      </div>
    </div>
    
    <div className="flex flex-wrap gap-1 mb-2">
      {note.tags.map((tag, index) => (
        <span
          key={index}
          className={`px-2 py-1 rounded text-xs text-white ${getPatternColor(tag.patternId)}`}
        >
          {tag.patternName}
        </span>
      ))}
    </div>
    
    <p className="text-gray-300 text-sm mb-3">
      {note.content.substring(0, 100)}...
    </p>
    
    <div className="flex gap-2">
      <button
        onClick={() => onEdit(note)}
        className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-500 rounded text-white transition-colors"
      >
        Edit
      </button>
      <button
        onClick={() => onExportFlashcard(note)}
        className="px-2 py-1 text-xs bg-purple-600 hover:bg-purple-500 rounded text-white transition-colors"
      >
        📇 Flashcard
      </button>
      <button
        onClick={() => onDelete(note.linkedThoughtUnit.toString())}
        className="px-2 py-1 text-xs bg-red-600 hover:bg-red-500 rounded text-white transition-colors"
      >
        Delete
      </button>
    </div>
  </div>
));
NoteCard.displayName = 'NoteCard';

const FilterControls = React.memo(({ 
  filters, 
  onFilterChange 
}: { 
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
}) => (
  <div className="mb-6 p-4 bg-gray-800 rounded-lg">
    <h3 className="text-white font-semibold mb-3">🔍 Filter Notes</h3>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
      <input
        type="text"
        placeholder="Search notes..."
        value={filters.searchQuery}
        onChange={(e) => onFilterChange({ ...filters, searchQuery: e.target.value })}
        className="px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400"
      />
      
      <select
        value={filters.selectedPattern}
        onChange={(e) => onFilterChange({ ...filters, selectedPattern: e.target.value })}
        className="px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
      >
        <option value="">All Patterns</option>
        {DAT_PATTERNS.map(pattern => (
          <option key={pattern.id} value={pattern.id}>
            {pattern.name}
          </option>
        ))}
      </select>
      
      <select
        value={filters.selectedLevel}
        onChange={(e) => onFilterChange({ ...filters, selectedLevel: e.target.value as StudyLevel | 'all' })}
        className="px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
      >
        <option value="all">All Levels</option>
        <option value="basic">🟢 Basic</option>
        <option value="intermediate">🟡 Intermediate</option>
        <option value="advanced">🔴 Advanced</option>
      </select>
      
      <select
        value={filters.selectedStatus}
        onChange={(e) => onFilterChange({ ...filters, selectedStatus: e.target.value as NoteStatus | 'all' })}
        className="px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
      >
        <option value="all">All Statuses</option>
        <option value="draft">📝 Draft</option>
        <option value="reviewing">👁️ Reviewing</option>
        <option value="complete">✅ Complete</option>
      </select>
    </div>
  </div>
));
FilterControls.displayName = 'FilterControls';

export default React.memo(function OptimizedNoteLabView({
  bookId,
  userId,
  thoughtUnits,
  currentThoughtUnit,
  currentPage,
  pdfPageCount,
  fontSize,
  fontFamily,
  lineSpacing,
  onWordClick,
  onTextSelect,
  onGenerateNote,
  selBind,
  externalSelectionText,
}: OptimizedNoteLabViewProps) {
  const [user, setUser] = useState<User | null>(null);
  const [notes, setNotes] = useState<NoteState[]>([]);
  const [showNoteEditor, setShowNoteEditor] = useState(false);
  const [editingNote, setEditingNote] = useState<NoteState | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    searchQuery: '',
    selectedPattern: '',
    selectedLevel: 'all',
    selectedStatus: 'all'
  });
  
  const [loadingState, setLoadingState] = useState<LoadingState>({
    isLoadingNotes: true,
    isSavingNote: false,
    isExporting: false,
    isGeneratingFlashcard: false,
    progress: 0,
    message: 'Loading NoteLab...'
  });

  // Auth
  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => setUser(u));
    return () => unsub();
  }, []);

  // Simulate loading notes with progress
  useEffect(() => {
    if (userId) {
      setLoadingState(prev => ({ ...prev, isLoadingNotes: true, message: 'Loading your notes...' }));
      
      // Simulate progressive loading
      const progressInterval = setInterval(() => {
        setLoadingState(prev => {
          const newProgress = prev.progress + Math.random() * 15;
          if (newProgress >= 100) {
            clearInterval(progressInterval);
            return { 
              ...prev, 
              progress: 100, 
              isLoadingNotes: false,
              message: 'Notes loaded successfully!'
            };
          }
          return { ...prev, progress: newProgress };
        });
      }, 200);

      // Load actual notes (simulated for now)
      setTimeout(() => {
        setNotes([]); // Replace with actual note loading
        clearInterval(progressInterval);
        setLoadingState(prev => ({ 
          ...prev, 
          isLoadingNotes: false,
          progress: 100,
          message: 'Ready to take notes!'
        }));
      }, 2000);

      return () => clearInterval(progressInterval);
    } else {
      setLoadingState(prev => ({ ...prev, isLoadingNotes: false }));
    }
  }, [userId]);

  // Memoized filtered notes
  const filteredNotes = useMemo(() => {
    return notes.filter(note => {
      if (filters.searchQuery && !note.content.toLowerCase().includes(filters.searchQuery.toLowerCase()) && 
          !note.title.toLowerCase().includes(filters.searchQuery.toLowerCase())) {
        return false;
      }
      
      if (filters.selectedPattern && !note.tags.some(tag => tag.patternId === filters.selectedPattern)) {
        return false;
      }
      
      if (filters.selectedLevel !== 'all' && note.studyLevel !== filters.selectedLevel) {
        return false;
      }
      
      if (filters.selectedStatus !== 'all' && note.status !== filters.selectedStatus) {
        return false;
      }
      
      return true;
    });
  }, [notes, filters]);

  // Get current unit text
  const currentUnitText = useMemo(() => {
    const unit = thoughtUnits[currentThoughtUnit - 1];
    if (typeof unit === 'string') return unit;
    if (Array.isArray(unit)) return unit.join(' ');
    return (unit as any)?.text || '';
  }, [thoughtUnits, currentThoughtUnit]);

  // Handlers
  const handleCreateNote = useCallback(() => {
    const newNote: NoteState = {
      title: `Unit ${currentThoughtUnit} Note`,
      content: externalSelectionText || currentUnitText.substring(0, 200) || '',
      tags: [],
      studyLevel: 'basic',
      status: 'draft',
      linkedThoughtUnit: currentThoughtUnit,
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString()
    };
    
    setEditingNote(newNote);
    setShowNoteEditor(true);
  }, [currentThoughtUnit, externalSelectionText, currentUnitText]);

  const handleEditNote = useCallback((note: NoteState) => {
    setEditingNote(note);
    setShowNoteEditor(true);
  }, []);

  const handleSaveNote = useCallback(async (note: NoteState) => {
    setLoadingState(prev => ({ 
      ...prev, 
      isSavingNote: true, 
      message: 'Saving note...',
      progress: 0
    }));

    // Simulate save progress
    const progressInterval = setInterval(() => {
      setLoadingState(prev => {
        const newProgress = prev.progress + 25;
        if (newProgress >= 100) {
          clearInterval(progressInterval);
          return { ...prev, progress: 100 };
        }
        return { ...prev, progress: newProgress };
      });
    }, 200);

    // Simulate save delay
    setTimeout(() => {
      const existingIndex = notes.findIndex(n => n.linkedThoughtUnit === note.linkedThoughtUnit);
      
      if (existingIndex >= 0) {
        setNotes(prev => prev.map((n, i) => i === existingIndex ? { ...note, lastModified: new Date().toISOString() } : n));
      } else {
        setNotes(prev => [...prev, note]);
      }
      
      clearInterval(progressInterval);
      setLoadingState(prev => ({ 
        ...prev, 
        isSavingNote: false,
        progress: 0,
        message: 'Note saved successfully!'
      }));
      
      setShowNoteEditor(false);
      setEditingNote(null);
    }, 1000);
  }, [notes]);

  const handleDeleteNote = useCallback((id: string) => {
    if (confirm('Delete this note?')) {
      setNotes(prev => prev.filter(n => n.linkedThoughtUnit.toString() !== id));
    }
  }, []);

  const handleExportFlashcard = useCallback(async (note: NoteState) => {
    setLoadingState(prev => ({ 
      ...prev, 
      isGeneratingFlashcard: true,
      message: 'Generating flashcard...',
      progress: 0
    }));

    // Simulate flashcard generation
    const progressInterval = setInterval(() => {
      setLoadingState(prev => {
        const newProgress = prev.progress + 20;
        if (newProgress >= 100) {
          clearInterval(progressInterval);
          return { ...prev, progress: 100 };
        }
        return { ...prev, progress: newProgress };
      });
    }, 150);

    setTimeout(() => {
      alert(`Flashcard created for: ${note.title}`);
      clearInterval(progressInterval);
      setLoadingState(prev => ({ 
        ...prev, 
        isGeneratingFlashcard: false,
        progress: 0,
        message: 'Flashcard generated!'
      }));
    }, 1500);
  }, []);

  const handleExportStudyOutline = useCallback(async () => {
    setLoadingState(prev => ({ 
      ...prev, 
      isExporting: true,
      message: 'Generating study outline...',
      progress: 0
    }));

    // Simulate export progress
    const progressInterval = setInterval(() => {
      setLoadingState(prev => {
        const newProgress = prev.progress + 10;
        if (newProgress >= 100) {
          clearInterval(progressInterval);
          return { ...prev, progress: 100 };
        }
        return { ...prev, progress: newProgress };
      });
    }, 100);

    setTimeout(() => {
      const outline = filteredNotes.map(note => ({
        title: note.title,
        content: note.content,
        patterns: note.tags.map(tag => tag.patternName).join(', '),
        level: note.studyLevel
      }));
      
      console.log('Study outline:', outline);
      alert(`Study outline exported with ${filteredNotes.length} notes!`);
      
      clearInterval(progressInterval);
      setLoadingState(prev => ({ 
        ...prev, 
        isExporting: false,
        progress: 0,
        message: 'Export complete!'
      }));
    }, 2000);
  }, [filteredNotes]);

  // Show loading state
  if (loadingState.isLoadingNotes) {
    return <LoadingSpinner message={loadingState.message} progress={loadingState.progress} />;
  }

  return (
    <div className="h-full flex flex-col bg-gray-900 text-white">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold text-green-400">📝 NoteLab - Structured Study Notes</h2>
          <span className="text-sm text-gray-400">
            Unit {currentThoughtUnit} of {thoughtUnits.length}
            {pdfPageCount && ` • Page ${currentPage}`}
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={handleCreateNote}
            disabled={loadingState.isSavingNote}
            className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded text-white font-medium transition-colors disabled:opacity-50"
          >
            {loadingState.isSavingNote ? '💾' : '📝'} New Note
          </button>
          <button
            onClick={handleExportStudyOutline}
            disabled={filteredNotes.length === 0 || loadingState.isExporting}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-500 border border-gray-500 rounded text-white font-medium transition-colors disabled:opacity-50"
          >
            {loadingState.isExporting ? '📤' : '📄'} Export Outline
          </button>
        </div>
      </div>

      {/* Loading overlays */}
      {(loadingState.isSavingNote || loadingState.isExporting || loadingState.isGeneratingFlashcard) && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <LoadingSpinner 
            message={loadingState.message} 
            progress={loadingState.progress}
          />
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Main Content */}
        <div className="flex-1 p-6">
          {/* Current Thought Unit */}
          <div
            className="mb-6 p-4 bg-gray-800 rounded-lg border-l-4 border-green-400"
            style={{ fontSize: `${fontSize}px`, fontFamily, lineHeight: lineSpacing }}
            onMouseUp={selBind?.onMouseUp}
          >
            <h3 className="text-lg font-semibold text-green-400 mb-3">
              📖 Current Thought Unit
            </h3>
            <div className="leading-relaxed">
              {currentUnitText.split(' ').map((word, idx) => (
                <span
                  key={idx}
                  className="hover:bg-green-700 hover:bg-opacity-30 cursor-pointer px-0.5 rounded"
                  onClick={() => onWordClick?.(word)}
                >
                  {word}{' '}
                </span>
              ))}
            </div>
          </div>

          {/* Filter Controls */}
          <FilterControls 
            filters={filters} 
            onFilterChange={setFilters}
          />

          {/* Notes Grid */}
          <div className="mb-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">
                📚 Your Notes ({filteredNotes.length})
              </h3>
            </div>

            {filteredNotes.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <div className="text-6xl mb-4">📝</div>
                <h3 className="text-xl mb-2">No notes yet</h3>
                <p className="mb-4">Create your first study note to get started!</p>
                <button 
                  onClick={handleCreateNote} 
                  className="px-6 py-3 bg-green-600 hover:bg-green-500 rounded text-white font-medium transition-colors"
                >
                  Create First Note
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredNotes.map((note, index) => (
                  <NoteCard
                    key={index}
                    note={note}
                    onEdit={handleEditNote}
                    onDelete={handleDeleteNote}
                    onExportFlashcard={handleExportFlashcard}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-80 bg-gray-800 p-4 border-l border-gray-700">
          <h3 className="font-semibold mb-4">📊 Note Statistics</h3>
          
          <div className="space-y-4">
            {/* Study Level Distribution */}
            <div className="p-3 bg-gray-700 rounded">
              <h4 className="font-medium mb-2">Study Levels</h4>
              {(['basic', 'intermediate', 'advanced'] as StudyLevel[]).map(level => {
                const count = notes.filter(n => n.studyLevel === level).length;
                return (
                  <div key={level} className="flex justify-between items-center text-sm">
                    <span className="flex items-center gap-2">
                      <span>{getStudyLevelIcon(level)}</span>
                      <span className="capitalize">{level}</span>
                    </span>
                    <span className="text-gray-400">{count}</span>
                  </div>
                );
              })}
            </div>

            {/* Status Distribution */}
            <div className="p-3 bg-gray-700 rounded">
              <h4 className="font-medium mb-2">Note Status</h4>
              {(['draft', 'reviewing', 'complete'] as NoteStatus[]).map(status => {
                const count = notes.filter(n => n.status === status).length;
                return (
                  <div key={status} className="flex justify-between items-center text-sm">
                    <span className="flex items-center gap-2">
                      <span>{getStatusIcon(status)}</span>
                      <span className="capitalize">{status}</span>
                    </span>
                    <span className="text-gray-400">{count}</span>
                  </div>
                );
              })}
            </div>

            {/* Quick Actions */}
            <div className="p-3 bg-gray-700 rounded">
              <h4 className="font-medium mb-2">Quick Actions</h4>
              <div className="space-y-2">
                <button
                  onClick={() => onGenerateNote?.(currentUnitText, undefined, "highYield")}
                  className="w-full px-3 py-2 text-xs bg-gray-600 hover:bg-gray-500 border border-gray-500 rounded text-white transition-colors"
                >
                  🧠 AI High-Yield Note
                </button>
                <button
                  onClick={() => onGenerateNote?.(currentUnitText, undefined, "sketch")}
                  className="w-full px-3 py-2 text-xs bg-gray-600 hover:bg-gray-500 border border-gray-500 rounded text-white transition-colors"
                >
                  🎨 Visual Study Note
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Simple Note Editor Modal */}
      {showNoteEditor && editingNote && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-white">
                  {editingNote.linkedThoughtUnit ? 'Edit Note' : 'Create New Note'}
                </h3>
                <button
                  onClick={() => setShowNoteEditor(false)}
                  className="text-gray-400 hover:text-white"
                >
                  ✕
                </button>
              </div>
              
              <NoteEditor
                note={editingNote}
                onSave={handleSaveNote}
                onCancel={() => setShowNoteEditor(false)}
                patterns={DAT_PATTERNS}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

// Note Editor Component
const NoteEditor = React.memo(({ 
  note, 
  onSave, 
  onCancel, 
  patterns 
}: {
  note: NoteState;
  onSave: (note: NoteState) => void;
  onCancel: () => void;
  patterns: Pattern[];
}) => {
  const [editedNote, setEditedNote] = useState<NoteState>(note);

  const handleSave = useCallback(() => {
    onSave(editedNote);
  }, [editedNote, onSave]);

  const addPatternTag = useCallback((patternId: string) => {
    const pattern = patterns.find(p => p.id === patternId);
    if (!pattern) return;
    
    const newTag: PatternTag = {
      patternId: pattern.id,
      patternName: pattern.name,
      confidence: 1.0
    };
    
    if (!editedNote.tags.some(tag => tag.patternId === patternId)) {
      setEditedNote(prev => ({ ...prev, tags: [...prev.tags, newTag] }));
    }
  }, [editedNote.tags, patterns]);

  const removePatternTag = useCallback((patternId: string) => {
    setEditedNote(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag.patternId !== patternId)
    }));
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1 text-white">Title</label>
        <input
          type="text"
          value={editedNote.title}
          onChange={(e) => setEditedNote(prev => ({ ...prev, title: e.target.value }))}
          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400"
          placeholder="Enter note title..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1 text-white">Content</label>
        <textarea
          value={editedNote.content}
          onChange={(e) => setEditedNote(prev => ({ ...prev, content: e.target.value }))}
          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400 min-h-[200px] resize-none"
          placeholder="Write your study notes here..."
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1 text-white">Study Level</label>
          <select
            value={editedNote.studyLevel}
            onChange={(e) => setEditedNote(prev => ({ ...prev, studyLevel: e.target.value as StudyLevel }))}
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
          >
            <option value="basic">🟢 Basic</option>
            <option value="intermediate">🟡 Intermediate</option>
            <option value="advanced">🔴 Advanced</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1 text-white">Status</label>
          <select
            value={editedNote.status}
            onChange={(e) => setEditedNote(prev => ({ ...prev, status: e.target.value as NoteStatus }))}
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
          >
            <option value="draft">📝 Draft</option>
            <option value="reviewing">👁️ Reviewing</option>
            <option value="complete">✅ Complete</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1 text-white">Pattern Tags</label>
        <div className="flex flex-wrap gap-2 mb-2">
          {editedNote.tags.map((tag, index) => (
            <span
              key={index}
              className={`px-2 py-1 rounded text-xs text-white ${getPatternColor(tag.patternId)} flex items-center gap-1`}
            >
              {tag.patternName}
              <button
                onClick={() => removePatternTag(tag.patternId)}
                className="ml-1 text-xs hover:text-red-200"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
        <select
          onChange={(e) => {
            if (e.target.value) {
              addPatternTag(e.target.value);
              e.target.value = '';
            }
          }}
          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
          defaultValue=""
        >
          <option value="">Add Pattern Tag...</option>
          {patterns.map(pattern => (
            <option key={pattern.id} value={pattern.id}>
              {pattern.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-3 pt-4">
        <button
          onClick={handleSave}
          className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded text-white font-medium transition-colors"
        >
          Save Note
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded text-white font-medium transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
});
