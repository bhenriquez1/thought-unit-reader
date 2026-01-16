"use client";

import React, { useEffect, useState, useMemo } from "react";
import type { ThoughtUnit as BaseThoughtUnit } from "@/types/reading";
import {
  saveNote,
  updateNote,
  getNotesForBook,
  type RightBrainNote,
} from "@/lib/noteService";
import { 
  DAT_PATTERNS, 
  PATTERN_CATEGORIES,
  getPatternById,
  type Pattern
} from "@/types/patterns";
import { createFlashcardFromSelection } from "@/lib/flashcardService";
import { addMindMapNode } from "@/lib/mindMapService";
import { auth } from "@/lib/firebase";
import type { User } from "firebase/auth";
import { 
  loadPatternAttempts, 
  loadPatternMastery 
} from "@/lib/firebase";
import { 
  type PatternAttempt, 
  type PatternMastery 
} from "@/types/patterns";

type PVUnit = BaseThoughtUnit | string | string[] | { text?: string };

interface NoteLabViewProps {
  bookId: string;
  userId: string;
  thoughtUnits: PVUnit[];
  currentThoughtUnit: number;
  currentPage: number;
  fontSize: number;
  fontFamily: string;
  lineSpacing: number;
  onWordClick?: (word: string) => void;
  onTextSelect?: (text: string) => void;
}

// Helper functions
function unitToText(u: PVUnit): string {
  if (u == null) return "";
  if (typeof u === "string") return u;
  if (Array.isArray(u)) return u.join(" ");
  const maybeText = (u as any).text;
  return typeof maybeText === "string" ? maybeText : JSON.stringify(u);
}

// Extended note interface with pattern tagging
interface PatternNote extends RightBrainNote {
  patterns?: string[]; // Array of pattern IDs
  thoughtUnitId?: string;
  studyLevel?: 'basic' | 'intermediate' | 'advanced';
  reviewDate?: string;
  flashcardGenerated?: boolean;
}

export default function NoteLabView({
  bookId,
  userId,
  thoughtUnits,
  currentThoughtUnit,
  currentPage,
  fontSize,
  fontFamily,
  lineSpacing,
  onWordClick,
  onTextSelect,
}: NoteLabViewProps) {
  const [user, setUser] = useState<User | null>(null);
  const [notes, setNotes] = useState<PatternNote[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [currentNote, setCurrentNote] = useState<PatternNote>({
    title: "",
    content: "",
    mnemonic: "",
    tags: [],
    patterns: [],
    thoughtUnitId: currentThoughtUnit.toString(),
    studyLevel: 'basic',
    bookId,
    page: currentPage,
    attachments: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  
  const [viewMode, setViewMode] = useState<'edit' | 'list' | 'export'>('edit');
  const [filterPattern, setFilterPattern] = useState<string>("");
  const [filterStudyLevel, setFilterStudyLevel] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isGeneratingFlashcards, setIsGeneratingFlashcards] = useState(false);

  // Auth
  useEffect(() => {
    const unsub = auth?.onAuthStateChanged((u) => setUser(u));
    return () => unsub?.();
  }, []);

  // Load notes
  useEffect(() => {
    if (!user) return;
    loadNotes();
  }, [user, bookId]);

  // Update current note with current thought unit
  useEffect(() => {
    if (!selectedNoteId) {
      setCurrentNote(prev => ({
        ...prev,
        thoughtUnitId: currentThoughtUnit.toString(),
        page: currentPage
      }));
    }
  }, [currentThoughtUnit, currentPage, selectedNoteId]);

  const loadNotes = async () => {
    if (!user) return;
    try {
      const bookNotes = await getNotesForBook(user.uid, bookId);
      setNotes(bookNotes as PatternNote[]);
    } catch (error) {
      console.error("Failed to load notes:", error);
    }
  };

  const handleSaveNote = async () => {
    if (!user) {
      alert("Please sign in to save notes.");
      return;
    }
    
    if (!currentNote.title.trim() && !currentNote.content.trim()) {
      alert("Please enter a title or content.");
      return;
    }

    try {
      const noteData = {
        ...currentNote,
        title: currentNote.title.trim() || "(untitled)",
        content: currentNote.content.trim(),
        updatedAt: new Date().toISOString()
      };

      if (selectedNoteId) {
        await updateNote(user.uid, selectedNoteId, noteData);
        setNotes(prev => prev.map(note => 
          note.id === selectedNoteId ? { ...noteData, id: selectedNoteId } : note
        ));
      } else {
        const savedNote = await saveNote(user.uid, noteData);
        setNotes(prev => [...prev, { ...noteData, id: (savedNote as any).id }]);
      }
      
      // Reset form
      setCurrentNote({
        title: "",
        content: "",
        mnemonic: "",
        tags: [],
        patterns: [],
        thoughtUnitId: currentThoughtUnit.toString(),
        studyLevel: 'basic',
        bookId,
        page: currentPage,
        attachments: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      setSelectedNoteId(null);
      
    } catch (error) {
      console.error("Failed to save note:", error);
      alert("Failed to save note.");
    }
  };

  const handleSelectNote = (note: PatternNote) => {
    setCurrentNote(note);
    setSelectedNoteId(note.id || null);
    setViewMode('edit');
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!user || !window.confirm('Delete this note?')) return;
    
    try {
      // For now, just remove from local state since deleteNote isn't available
      setNotes(prev => prev.filter(note => note.id !== noteId));
      if (selectedNoteId === noteId) {
        setCurrentNote({
          title: "",
          content: "",
          mnemonic: "",
          tags: [],
          patterns: [],
          thoughtUnitId: currentThoughtUnit.toString(),
          studyLevel: 'basic',
          bookId,
          page: currentPage,
          attachments: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        setSelectedNoteId(null);
      }
    } catch (error) {
      console.error("Failed to delete note:", error);
      alert("Failed to delete note.");
    }
  };

  const handlePatternToggle = (patternId: string) => {
    setCurrentNote(prev => ({
      ...prev,
      patterns: prev.patterns?.includes(patternId)
        ? prev.patterns.filter(id => id !== patternId)
        : [...(prev.patterns || []), patternId]
    }));
  };

  const handleGenerateFlashcards = async () => {
    if (!user) {
      alert("Please sign in to generate flashcards.");
      return;
    }

    setIsGeneratingFlashcards(true);
    try {
      const filteredNotes = getFilteredNotes();
      let generated = 0;

      for (const note of filteredNotes) {
        if (!note.flashcardGenerated && note.content?.trim()) {
          try {
            await createFlashcardFromSelection(`${note.title}\n\n${note.content}`);
            generated++;
          } catch (error) {
            console.error(`Failed to create flashcard for note ${note.id}:`, error);
          }
        }
      }

      await loadNotes(); // Refresh notes
      alert(`Generated ${generated} flashcards!`);
    } catch (error) {
      console.error("Failed to generate flashcards:", error);
      alert("Failed to generate flashcards.");
    } finally {
      setIsGeneratingFlashcards(false);
    }
  };

  const handleExportStudyOutline = () => {
    const filteredNotes = getFilteredNotes();
    
    // Group notes by pattern
    const notesByPattern = new Map<string, PatternNote[]>();
    const untaggedNotes: PatternNote[] = [];

    filteredNotes.forEach(note => {
      if (note.patterns && note.patterns.length > 0) {
        note.patterns.forEach(patternId => {
          if (!notesByPattern.has(patternId)) {
            notesByPattern.set(patternId, []);
          }
          notesByPattern.get(patternId)!.push(note);
        });
      } else {
        untaggedNotes.push(note);
      }
    });

    // Generate study outline
    let outline = `# Study Outline - ${bookId}\n\n`;
    outline += `Generated on: ${new Date().toLocaleDateString()}\n`;
    outline += `Total Notes: ${filteredNotes.length}\n\n`;

    // Notes by pattern
    notesByPattern.forEach((notes, patternId) => {
      const pattern = getPatternById(patternId);
      outline += `## ${pattern?.name || patternId}\n\n`;
      
      if (pattern) {
        outline += `*${pattern.description}*\n\n`;
        outline += `**Key Rules:**\n`;
        pattern.rules.forEach((rule, index) => {
          outline += `${index + 1}. **${rule.key}**: ${rule.description}\n`;
        });
        outline += `\n`;
      }

      outline += `**Your Notes:**\n\n`;
      notes.forEach(note => {
        outline += `### ${note.title}\n`;
        if (note.content) {
          outline += `${note.content}\n\n`;
        }
        if (note.mnemonic) {
          outline += `**Mnemonic:** ${note.mnemonic}\n\n`;
        }
        if (note.page) {
          outline += `*Source: Page ${note.page}, Unit ${note.thoughtUnitId}*\n\n`;
        }
        outline += `---\n\n`;
      });
    });

    // Untagged notes
    if (untaggedNotes.length > 0) {
      outline += `## General Notes\n\n`;
      untaggedNotes.forEach(note => {
        outline += `### ${note.title}\n`;
        if (note.content) {
          outline += `${note.content}\n\n`;
        }
        if (note.mnemonic) {
          outline += `**Mnemonic:** ${note.mnemonic}\n\n`;
        }
        outline += `---\n\n`;
      });
    }

    // Download as file
    const blob = new Blob([outline], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `study-outline-${bookId}-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getFilteredNotes = (): PatternNote[] => {
    return notes.filter(note => {
      const matchesSearch = !searchQuery || 
        note.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        note.content?.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesPattern = !filterPattern || 
        note.patterns?.includes(filterPattern);
      
      const matchesStudyLevel = !filterStudyLevel || 
        note.studyLevel === filterStudyLevel;

      return matchesSearch && matchesPattern && matchesStudyLevel;
    });
  };

  // ✅ Simplified validation - main index.tsx handles empty states
  const rawUnit = thoughtUnits[currentThoughtUnit - 1] || thoughtUnits[0];
  const unitText = rawUnit ? unitToText(rawUnit) : "";

  const filteredNotes = getFilteredNotes();
  const notesByThoughtUnit = filteredNotes.filter(note => 
    note.thoughtUnitId === currentThoughtUnit.toString()
  );

  return (
    <div className="h-full flex flex-col bg-gray-900 text-white">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold text-green-400">📝 NoteLab - Structured Study Notes</h2>
          <span className="text-sm text-gray-400">
            Unit {currentThoughtUnit} of {thoughtUnits.length} • {notes.length} notes total
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('edit')}
            className={`px-3 py-1 rounded text-sm ${
              viewMode === 'edit' ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300'
            }`}
          >
            ✏️ Edit
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`px-3 py-1 rounded text-sm ${
              viewMode === 'list' ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300'
            }`}
          >
            📋 List
          </button>
          <button
            onClick={() => setViewMode('export')}
            className={`px-3 py-1 rounded text-sm ${
              viewMode === 'export' ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300'
            }`}
          >
            📤 Export
          </button>
        </div>
      </div>

      <div className="flex-1 flex">
        {/* Main Content Area */}
        <div className="flex-1 p-6 overflow-y-auto">
          {viewMode === 'edit' && (
            <>
              {/* Current Thought Unit Display */}
              {unitText && (
                <div className="mb-6 p-4 bg-gray-800 rounded-lg border-l-4 border-green-400">
                  <h3 className="text-lg font-semibold text-green-400 mb-3">
                    Current Thought Unit (Unit {currentThoughtUnit})
                  </h3>
                  <div
                    className="leading-relaxed text-gray-200"
                    style={{ fontSize: `${fontSize}px`, fontFamily, lineHeight: lineSpacing }}
                  >
                    {unitText.split(' ').map((word, idx) => (
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
              )}

              {/* Note Editor */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Note Title
                  </label>
                  <input
                    type="text"
                    value={currentNote.title}
                    onChange={(e) => setCurrentNote(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Enter note title..."
                    className="w-full p-3 bg-gray-800 border border-gray-600 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Note Content
                  </label>
                  <textarea
                    value={currentNote.content}
                    onChange={(e) => setCurrentNote(prev => ({ ...prev, content: e.target.value }))}
                    placeholder="Write your structured notes here..."
                    rows={8}
                    className="w-full p-3 bg-gray-800 border border-gray-600 rounded-lg resize-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Mnemonic (Optional)
                  </label>
                  <input
                    type="text"
                    value={currentNote.mnemonic}
                    onChange={(e) => setCurrentNote(prev => ({ ...prev, mnemonic: e.target.value }))}
                    placeholder="Memory aid or mnemonic..."
                    className="w-full p-3 bg-gray-800 border border-gray-600 rounded-lg"
                  />
                </div>

                {/* Pattern Tags */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Associated Patterns
                  </label>
                  <div className="space-y-3">
                    {Object.entries(PATTERN_CATEGORIES).map(([categoryKey, categoryName]) => (
                      <div key={categoryKey}>
                        <h4 className="text-xs font-medium text-gray-400 mb-2">{categoryName}</h4>
                        <div className="flex flex-wrap gap-2">
                          {DAT_PATTERNS.filter(p => p.category === categoryKey).map(pattern => (
                            <button
                              key={pattern.id}
                              onClick={() => handlePatternToggle(pattern.id)}
                              className={`px-3 py-1 rounded text-sm transition-colors ${
                                currentNote.patterns?.includes(pattern.id)
                                  ? 'bg-green-600 text-white'
                                  : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                              }`}
                            >
                              {pattern.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Study Level & Tags */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Study Level
                    </label>
                    <select
                      value={currentNote.studyLevel}
                      onChange={(e) => setCurrentNote(prev => ({ 
                        ...prev, 
                        studyLevel: e.target.value as 'basic' | 'intermediate' | 'advanced'
                      }))}
                      className="w-full p-3 bg-gray-800 border border-gray-600 rounded-lg"
                    >
                      <option value="basic">Basic</option>
                      <option value="intermediate">Intermediate</option>
                      <option value="advanced">Advanced</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Additional Tags
                    </label>
                    <input
                      type="text"
                      value={(currentNote.tags || []).join(', ')}
                      onChange={(e) => setCurrentNote(prev => ({ 
                        ...prev, 
                        tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean)
                      }))}
                      placeholder="tag1, tag2, tag3..."
                      className="w-full p-3 bg-gray-800 border border-gray-600 rounded-lg"
                    />
                  </div>
                </div>

                {/* Save Button */}
                <button
                  onClick={handleSaveNote}
                  className="w-full py-3 bg-green-600 hover:bg-green-500 rounded-lg font-medium"
                >
                  {selectedNoteId ? 'Update Note' : 'Save Note'}
                </button>
              </div>
            </>
          )}

          {viewMode === 'list' && (
            <>
              {/* Search and Filters */}
              <div className="mb-6 space-y-4">
                <div>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search notes..."
                    className="w-full p-3 bg-gray-800 border border-gray-600 rounded-lg"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <select
                    value={filterPattern}
                    onChange={(e) => setFilterPattern(e.target.value)}
                    className="p-3 bg-gray-800 border border-gray-600 rounded-lg"
                  >
                    <option value="">All Patterns</option>
                    {DAT_PATTERNS.map(pattern => (
                      <option key={pattern.id} value={pattern.id}>{pattern.name}</option>
                    ))}
                  </select>
                  <select
                    value={filterStudyLevel}
                    onChange={(e) => setFilterStudyLevel(e.target.value)}
                    className="p-3 bg-gray-800 border border-gray-600 rounded-lg"
                  >
                    <option value="">All Levels</option>
                    <option value="basic">Basic</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                  </select>
                </div>
              </div>

              {/* Notes List */}
              <div className="space-y-4">
                {filteredNotes.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <p>No notes found matching your criteria.</p>
                  </div>
                ) : (
                  filteredNotes.map(note => (
                    <div
                      key={note.id}
                      className="p-4 bg-gray-800 rounded-lg border border-gray-700 hover:border-gray-600"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-semibold text-green-400">{note.title}</h3>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSelectNote(note)}
                            className="px-2 py-1 bg-blue-600 hover:bg-blue-500 rounded text-xs"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteNote(note.id!)}
                            className="px-2 py-1 bg-red-600 hover:bg-red-500 rounded text-xs"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                      <p className="text-gray-300 text-sm mb-2">{note.content?.substring(0, 150)}...</p>
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        {note.patterns && note.patterns.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {note.patterns.map(patternId => {
                              const pattern = getPatternById(patternId);
                              return (
                                <span key={patternId} className="px-2 py-1 bg-gray-700 rounded">
                                  {pattern?.name || patternId}
                                </span>
                              );
                            })}
                          </div>
                        )}
                        <span>Unit {note.thoughtUnitId}</span>
                        <span>Page {note.page}</span>
                        <span className="capitalize">{note.studyLevel}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}

          {viewMode === 'export' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-green-400">Export Options</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  onClick={handleGenerateFlashcards}
                  disabled={isGeneratingFlashcards}
                  className="p-4 bg-blue-700 hover:bg-blue-600 rounded-lg disabled:opacity-50"
                >
                  <h4 className="font-medium mb-2">📇 Generate Flashcards</h4>
                  <p className="text-sm text-gray-300">
                    Convert your notes into flashcards for spaced repetition review
                  </p>
                  {isGeneratingFlashcards && (
                    <p className="text-xs text-blue-400 mt-2">Generating...</p>
                  )}
                </button>

                <button
                  onClick={handleExportStudyOutline}
                  className="p-4 bg-purple-700 hover:bg-purple-600 rounded-lg"
                >
                  <h4 className="font-medium mb-2">📄 Export Study Outline</h4>
                  <p className="text-sm text-gray-300">
                    Download a structured markdown outline organized by patterns
                  </p>
                </button>
              </div>

              <div className="mt-8">
                <h4 className="font-medium text-gray-300 mb-4">Export Statistics</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-3 bg-gray-800 rounded">
                    <div className="text-2xl font-bold text-green-400">{notes.length}</div>
                    <div className="text-sm text-gray-400">Total Notes</div>
                  </div>
                  <div className="p-3 bg-gray-800 rounded">
                    <div className="text-2xl font-bold text-blue-400">
                      {notes.filter(n => n.patterns && n.patterns.length > 0).length}
                    </div>
                    <div className="text-sm text-gray-400">Pattern Tagged</div>
                  </div>
                  <div className="p-3 bg-gray-800 rounded">
                    <div className="text-2xl font-bold text-purple-400">
                      {notes.filter(n => n.flashcardGenerated).length}
                    </div>
                    <div className="text-sm text-gray-400">Flashcards</div>
                  </div>
                  <div className="p-3 bg-gray-800 rounded">
                    <div className="text-2xl font-bold text-yellow-400">
                      {notes.filter(n => n.studyLevel === 'advanced').length}
                    </div>
                    <div className="text-sm text-gray-400">Advanced</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="w-80 bg-gray-800 p-4 border-l border-gray-700 overflow-y-auto">
          <h3 className="font-semibold mb-4">📍 Current Unit Notes</h3>
          
          {notesByThoughtUnit.length === 0 ? (
            <p className="text-sm text-gray-400">No notes for this unit yet.</p>
          ) : (
            <div className="space-y-2">
              {notesByThoughtUnit.map(note => (
                <div
                  key={note.id}
                  className="p-2 bg-gray-700 rounded cursor-pointer hover:bg-gray-600"
                  onClick={() => handleSelectNote(note)}
                >
                  <div className="font-medium text-sm">{note.title}</div>
                  <div className="text-xs text-gray-400 truncate">
                    {note.content?.substring(0, 50)}...
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6">
            <h4 className="font-semibold mb-3">📊 Pattern Summary</h4>
            <div className="space-y-2">
              {Object.entries(PATTERN_CATEGORIES).map(([categoryKey, categoryName]) => {
                const categoryNotes = notes.filter(note => 
                  note.patterns?.some(p => 
                    DAT_PATTERNS.find(pattern => pattern.id === p)?.category === categoryKey
                  )
                );
                
                return (
                  <div key={categoryKey} className="flex justify-between text-sm">
                    <span className="text-gray-300">{categoryName}</span>
                    <span className="text-gray-400">{categoryNotes.length}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
