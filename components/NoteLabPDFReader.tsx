"use client";

import React, { useState, useEffect } from "react";
import BaseInteractivePDFReader from "./BaseInteractivePDFReader";
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
import { auth } from "@/lib/firebase";

type HRUnit = BaseThoughtUnit | string | string[] | { text?: string };

// Extended note interface with pattern tagging
interface PatternNote extends RightBrainNote {
  patterns?: string[]; // Array of pattern IDs
  thoughtUnitId?: string;
  studyLevel?: 'basic' | 'intermediate' | 'advanced';
  reviewDate?: string;
  flashcardGenerated?: boolean;
}

interface NoteLabPDFReaderProps {
  bookId: string;
  userId: string;
  pdfUrl: string;
  currentPage: number;
  pdfPageCount?: number;
  onPageChange: (page: number) => void;
  thoughtUnits: HRUnit[];
  currentThoughtUnit: number;
  setCurrentThoughtUnit: React.Dispatch<React.SetStateAction<number>>;
  highlightedWord: string;
  setHighlightedWord: (word: string) => void;
  onWordClick: (word: string) => void;
  onTextSelect?: (text: string) => void;
  selBind?: { onMouseUp?: (e: React.MouseEvent) => void };
  externalSelectionText?: string;
  fontSize: number;
  fontFamily: string;
  lineSpacing: number;
  selectedVoice?: SpeechSynthesisVoice;
  onVoiceChange?: (voice: SpeechSynthesisVoice) => void;
  speechRate?: number;
  onSpeechRateChange?: (rate: number) => void;
  tableOfContents?: any[];
}

export default function NoteLabPDFReader(props: NoteLabPDFReaderProps) {
  // Note-taking state
  const [notes, setNotes] = useState<PatternNote[]>([]);
  const [showNoteOverlay, setShowNoteOverlay] = useState(false);
  const [activeSelection, setActiveSelection] = useState("");
  const [currentNote, setCurrentNote] = useState<PatternNote>({
    title: "",
    content: "",
    mnemonic: "",
    tags: [],
    patterns: [],
    thoughtUnitId: props.currentThoughtUnit.toString(),
    studyLevel: 'basic',
    bookId: props.bookId,
    page: props.currentPage,
    attachments: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [quickActionPosition, setQuickActionPosition] = useState({ x: 0, y: 0 });

  // Load notes
  useEffect(() => {
    if (!props.userId) return;
    loadNotes();
  }, [props.userId, props.bookId]);

  // Update current note with current thought unit and page
  useEffect(() => {
    if (!selectedNoteId) {
      setCurrentNote(prev => ({
        ...prev,
        thoughtUnitId: props.currentThoughtUnit.toString(),
        page: props.currentPage
      }));
    }
  }, [props.currentThoughtUnit, props.currentPage, selectedNoteId]);

  const loadNotes = async () => {
    try {
      const bookNotes = await getNotesForBook(props.userId, props.bookId);
      setNotes(bookNotes as PatternNote[]);
    } catch (error) {
      console.error("Failed to load notes:", error);
    }
  };

  // Handle text selection for note creation
  const handleTextSelect = (text: string) => {
    setActiveSelection(text);
    if (text.trim().length > 5) {
      // Show quick actions for selected text
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        setQuickActionPosition({ 
          x: rect.left + rect.width / 2, 
          y: rect.top - 10 
        });
        setShowQuickActions(true);
      }
    }
    props.onTextSelect?.(text);
  };

  const handleCreateNote = (mode: 'quick' | 'detailed' = 'quick') => {
    if (!activeSelection) return;

    setCurrentNote({
      title: activeSelection.slice(0, 50) + (activeSelection.length > 50 ? '...' : ''),
      content: activeSelection,
      mnemonic: "",
      tags: [],
      patterns: [],
      thoughtUnitId: props.currentThoughtUnit.toString(),
      studyLevel: 'basic',
      bookId: props.bookId,
      page: props.currentPage,
      attachments: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    
    setSelectedNoteId(null);
    setShowQuickActions(false);
    
    if (mode === 'detailed') {
      setShowNoteOverlay(true);
    } else {
      // Quick save
      handleSaveNote();
    }
  };

  const handleSaveNote = async () => {
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
        await updateNote(props.userId, selectedNoteId, noteData);
        setNotes(prev => prev.map(note => 
          note.id === selectedNoteId ? { ...noteData, id: selectedNoteId } : note
        ));
      } else {
        const savedNote = await saveNote(props.userId, noteData);
        setNotes(prev => [...prev, { ...noteData, id: (savedNote as any).id }]);
      }
      
      // Reset form
      setCurrentNote({
        title: "",
        content: "",
        mnemonic: "",
        tags: [],
        patterns: [],
        thoughtUnitId: props.currentThoughtUnit.toString(),
        studyLevel: 'basic',
        bookId: props.bookId,
        page: props.currentPage,
        attachments: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      setSelectedNoteId(null);
      setShowNoteOverlay(false);
      
    } catch (error) {
      console.error("Failed to save note:", error);
      alert("Failed to save note.");
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

  const handleGenerateFlashcard = async (content: string) => {
    try {
      await createFlashcardFromSelection(content);
      alert("Flashcard created successfully!");
    } catch (error) {
      console.error("Failed to create flashcard:", error);
      alert("Failed to create flashcard.");
    }
  };

  const handleCloseOverlay = () => {
    setShowNoteOverlay(false);
    setSelectedNoteId(null);
    setActiveSelection("");
  };

  const handleCloseQuickActions = () => {
    setShowQuickActions(false);
    setActiveSelection("");
  };

  // Get notes for current page
  const pageNotes = notes.filter(note => note.page === props.currentPage);

  // NoteLab Controls
  const noteLabControls = (
    <div className="flex items-center gap-2">
      <div className="text-sm text-gray-600">
        Notes: {notes.length} total • {pageNotes.length} on this page
      </div>
      <button
        onClick={() => setShowNoteOverlay(true)}
        className="px-3 py-1 bg-green-600 hover:bg-green-500 text-white rounded text-sm"
      >
        📝 New Note
      </button>
    </div>
  );

  return (
    <>
      <BaseInteractivePDFReader
        {...props}
        onTextSelect={handleTextSelect}
        extraControls={noteLabControls}
        className="relative"
      >
        {/* Page Notes Sidebar */}
        {pageNotes.length > 0 && (
          <div className="absolute top-16 right-4 w-64 bg-white border border-gray-300 rounded-lg shadow-lg z-10 max-h-96 overflow-y-auto">
            <div className="p-3 bg-green-50 border-b border-green-200">
              <h4 className="text-sm font-semibold text-green-700">📍 Page {props.currentPage} Notes</h4>
            </div>
            <div className="p-2">
              {pageNotes.map(note => (
                <div
                  key={note.id}
                  className="mb-2 p-2 bg-gray-50 rounded cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => {
                    setCurrentNote(note);
                    setSelectedNoteId(note.id || null);
                    setShowNoteOverlay(true);
                  }}
                >
                  <div className="text-xs font-medium text-gray-800 line-clamp-1">
                    {note.title}
                  </div>
                  <div className="text-xs text-gray-600 line-clamp-2 mt-1">
                    {note.content?.slice(0, 60)}...
                  </div>
                  {note.patterns && note.patterns.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {note.patterns.slice(0, 2).map(patternId => {
                        const pattern = getPatternById(patternId);
                        return (
                          <span key={patternId} className="px-1 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">
                            {pattern?.name || patternId}
                          </span>
                        );
                      })}
                      {note.patterns.length > 2 && (
                        <span className="text-xs text-gray-500">+{note.patterns.length - 2}</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </BaseInteractivePDFReader>

      {/* Quick Actions Popup */}
      {showQuickActions && activeSelection && (
        <div 
          className="fixed bg-white border border-gray-300 rounded-lg shadow-lg z-50 p-2 flex gap-2"
          style={{ 
            left: quickActionPosition.x - 100, 
            top: quickActionPosition.y - 40 
          }}
        >
          <button
            onClick={() => handleCreateNote('quick')}
            className="px-2 py-1 bg-green-600 hover:bg-green-500 text-white rounded text-xs"
          >
            📝 Quick Note
          </button>
          <button
            onClick={() => handleCreateNote('detailed')}
            className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs"
          >
            📋 Detailed
          </button>
          <button
            onClick={() => handleGenerateFlashcard(activeSelection)}
            className="px-2 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded text-xs"
          >
            📇 Flashcard
          </button>
          <button
            onClick={handleCloseQuickActions}
            className="px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded text-xs"
          >
            ✕
          </button>
        </div>
      )}

      {/* Note Creation/Edit Overlay */}
      {showNoteOverlay && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full m-4 max-h-[90vh] overflow-auto">
            <div className="p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-green-700">📝 {selectedNoteId ? 'Edit' : 'Create'} Note</h2>
                <button
                  onClick={handleCloseOverlay}
                  className="text-gray-500 hover:text-gray-700 text-xl font-bold"
                >
                  ✕
                </button>
              </div>

              {/* Selected Text Display */}
              {activeSelection && (
                <div className="mb-6 p-4 bg-blue-50 border-l-4 border-blue-400 rounded">
                  <h3 className="text-sm font-semibold text-blue-700 mb-2">Selected Text:</h3>
                  <p className="text-gray-700 italic">
                    "{activeSelection.slice(0, 200)}{activeSelection.length > 200 ? '...' : ''}"
                  </p>
                </div>
              )}

              {/* Note Form */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Note Title
                  </label>
                  <input
                    type="text"
                    value={currentNote.title}
                    onChange={(e) => setCurrentNote(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Enter note title..."
                    className="w-full p-3 border border-gray-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Note Content
                  </label>
                  <textarea
                    value={currentNote.content}
                    onChange={(e) => setCurrentNote(prev => ({ ...prev, content: e.target.value }))}
                    placeholder="Write your note content here..."
                    rows={6}
                    className="w-full p-3 border border-gray-300 rounded-lg resize-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Mnemonic (Optional)
                  </label>
                  <input
                    type="text"
                    value={currentNote.mnemonic}
                    onChange={(e) => setCurrentNote(prev => ({ ...prev, mnemonic: e.target.value }))}
                    placeholder="Memory aid or mnemonic..."
                    className="w-full p-3 border border-gray-300 rounded-lg"
                  />
                </div>

                {/* Pattern Tags */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Associated Patterns
                  </label>
                  <div className="space-y-3 max-h-40 overflow-y-auto">
                    {Object.entries(PATTERN_CATEGORIES).map(([categoryKey, categoryName]) => (
                      <div key={categoryKey}>
                        <h4 className="text-xs font-medium text-gray-500 mb-2">{categoryName}</h4>
                        <div className="flex flex-wrap gap-2">
                          {DAT_PATTERNS.filter(p => p.category === categoryKey).map(pattern => (
                            <button
                              key={pattern.id}
                              onClick={() => handlePatternToggle(pattern.id)}
                              className={`px-2 py-1 rounded text-xs transition-colors ${
                                currentNote.patterns?.includes(pattern.id)
                                  ? 'bg-green-600 text-white'
                                  : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
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
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Study Level
                    </label>
                    <select
                      value={currentNote.studyLevel}
                      onChange={(e) => setCurrentNote(prev => ({ 
                        ...prev, 
                        studyLevel: e.target.value as 'basic' | 'intermediate' | 'advanced'
                      }))}
                      className="w-full p-3 border border-gray-300 rounded-lg"
                    >
                      <option value="basic">Basic</option>
                      <option value="intermediate">Intermediate</option>
                      <option value="advanced">Advanced</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
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
                      className="w-full p-3 border border-gray-300 rounded-lg"
                    />
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={handleSaveNote}
                    className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg font-medium"
                  >
                    {selectedNoteId ? 'Update Note' : 'Save Note'}
                  </button>
                  
                  {activeSelection && (
                    <button
                      onClick={() => handleGenerateFlashcard(activeSelection)}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium"
                    >
                      📇 Create Flashcard
                    </button>
                  )}
                  
                  <button
                    onClick={handleCloseOverlay}
                    className="px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
