// components/NotesList.tsx
// Display and manage notes created from Surgeon View highlights

import React, { useState } from 'react';

interface Note {
  id: string;
  content: string;
  source: {
    bookId: string;
    selectedText: string;
    pageNumber?: number;
    thoughtUnitIndex?: number;
    chapterId?: string;
  };
  tags: ('P' | 'D' | 'R' | 'M')[];
  hyperChunkId?: string;
  createdAt: number;
  updatedAt: number;
  archived: boolean;
}

interface NotesListProps {
  bookId: string;
  notes: Note[];
  onEdit: (noteId: string, content: string) => void;
  onDelete: (noteId: string) => void;
  onTagToggle: (noteId: string, tag: 'P' | 'D' | 'R' | 'M') => void;
}

export default function NotesList({
  bookId,
  notes,
  onEdit,
  onDelete,
  onTagToggle,
}: NotesListProps) {
  const [expandedNote, setExpandedNote] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  const handleEdit = (note: Note) => {
    setEditingNote(note.id);
    setEditContent(note.content);
  };

  const handleSave = (noteId: string) => {
    onEdit(noteId, editContent);
    setEditingNote(null);
  };

  const getTagColor = (tag: 'P' | 'D' | 'R' | 'M') => {
    const colors = {
      P: 'bg-purple-500/20 text-purple-300 border-purple-500',
      D: 'bg-blue-500/20 text-blue-300 border-blue-500',
      R: 'bg-red-500/20 text-red-300 border-red-500',
      M: 'bg-yellow-500/20 text-yellow-300 border-yellow-500',
    };
    return colors[tag];
  };

  const getTagLabel = (tag: 'P' | 'D' | 'R' | 'M') => {
    const labels = {
      P: 'Pattern',
      D: 'Decision',
      R: 'Risk',
      M: 'Mechanism',
    };
    return labels[tag];
  };

  // Group notes by chapter
  const groupedNotes = notes.reduce((acc, note) => {
    const chapter = note.source.chapterId || 'Uncategorized';
    if (!acc[chapter]) acc[chapter] = [];
    acc[chapter].push(note);
    return acc;
  }, {} as Record<string, Note[]>);

  if (notes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <div className="text-6xl mb-4">📝</div>
        <h3 className="text-xl font-semibold mb-2">No notes yet</h3>
        <p className="text-gray-400">
          Highlight text in Surgeon View to create notes
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 space-y-6">
      <div className="mb-4">
        <h2 className="text-2xl font-bold mb-2">📝 Your Notes</h2>
        <p className="text-sm text-gray-400">
          {notes.length} note{notes.length !== 1 ? 's' : ''} for this book
        </p>
      </div>

      {Object.entries(groupedNotes).map(([chapter, chapterNotes]) => (
        <div key={chapter} className="space-y-3">
          <h3 className="text-lg font-semibold text-blue-400 sticky top-0 bg-gray-900 py-2">
            {chapter}
          </h3>

          {chapterNotes.map((note) => (
            <div
              key={note.id}
              className="bg-gray-800 rounded-lg p-4 border border-gray-700 hover:border-gray-600 transition-all"
            >
              {/* Source reference */}
              <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
                <span>📍</span>
                {note.source.pageNumber && (
                  <span>Page {note.source.pageNumber}</span>
                )}
                {note.source.thoughtUnitIndex && (
                  <span>• Unit {note.source.thoughtUnitIndex}</span>
                )}
                <span className="ml-auto">
                  {new Date(note.createdAt).toLocaleDateString()}
                </span>
              </div>

              {/* Source text (quoted) */}
              <div className="bg-gray-900 border-l-4 border-blue-500 p-3 mb-3 rounded">
                <p className="text-sm italic text-gray-300">
                  "{note.source.selectedText.substring(0, 150)}
                  {note.source.selectedText.length > 150 ? '...' : ''}"
                </p>
              </div>

              {/* Note content */}
              {editingNote === note.id ? (
                <div className="space-y-2">
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="w-full bg-gray-700 rounded p-2 text-sm min-h-[100px] focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Add your note here..."
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSave(note.id)}
                      className="px-3 py-1 bg-green-600 hover:bg-green-500 rounded text-sm"
                    >
                      💾 Save
                    </button>
                    <button
                      onClick={() => setEditingNote(null)}
                      className="px-3 py-1 bg-gray-600 hover:bg-gray-500 rounded text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className={`text-sm ${
                    note.content ? 'text-white' : 'text-gray-500 italic'
                  } ${expandedNote === note.id ? '' : 'line-clamp-3'} cursor-pointer`}
                  onClick={() =>
                    setExpandedNote(expandedNote === note.id ? null : note.id)
                  }
                >
                  {note.content || 'Click to add note content...'}
                </div>
              )}

              {/* Tags */}
              {note.tags.length > 0 && (
                <div className="flex gap-2 mt-3">
                  {note.tags.map((tag) => (
                    <span
                      key={tag}
                      className={`px-2 py-1 rounded text-xs font-semibold border ${getTagColor(
                        tag
                      )}`}
                    >
                      {tag} - {getTagLabel(tag)}
                    </span>
                  ))}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 mt-3 pt-3 border-t border-gray-700">
                <button
                  onClick={() => handleEdit(note)}
                  className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded"
                  data-testid={`edit-note-${note.id}`}
                >
                  ✏️ Edit
                </button>
                <button
                  onClick={() => onDelete(note.id)}
                  className="text-xs px-2 py-1 bg-red-900/30 hover:bg-red-800/50 rounded text-red-300"
                >
                  🗑️ Delete
                </button>
                <div className="flex-1"></div>
                {/* PDRM tag toggles */}
                <div className="flex gap-1">
                  {(['P', 'D', 'R', 'M'] as const).map((tag) => (
                    <button
                      key={tag}
                      onClick={() => onTagToggle(note.id, tag)}
                      className={`text-xs px-2 py-1 rounded border ${
                        note.tags.includes(tag)
                          ? getTagColor(tag)
                          : 'bg-gray-700 text-gray-400 border-gray-600'
                      }`}
                      title={`Toggle ${getTagLabel(tag)} tag`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
