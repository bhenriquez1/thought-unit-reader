"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { libraryService, type LibraryItem, type TopStudentNote } from "@/lib/libraryService";

interface LibraryPanelProps {
  userId: string;
  bookId: string;
  currentPage: number;
  isOpen: boolean;
  onClose: () => void;
  onGenerateTopStudentNote?: (content: string, pageNumber: number) => void;
}

const ITEM_TYPE_LABELS = {
  'note': '📝 Note',
  'mindmap': '🧠 Mind Map',
  'highlight': '🖍️ Highlight',
  'summary': '📋 Summary',
  'flashcard': '🃏 Flashcard',
  'top-student-note': '🎓 Top Student Note',
};

const DIFFICULTY_COLORS = {
  'easy': 'text-green-400',
  'medium': 'text-yellow-400',
  'hard': 'text-red-400',
};

export default function LibraryPanel({
  userId,
  bookId,
  currentPage,
  isOpen,
  onClose,
  onGenerateTopStudentNote,
}: LibraryPanelProps) {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedType, setSelectedType] = useState<LibraryItem['type'] | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newItemType, setNewItemType] = useState<LibraryItem['type']>('note');
  const [newItemTitle, setNewItemTitle] = useState('');
  const [newItemContent, setNewItemContent] = useState('');
  const [selectedItem, setSelectedItem] = useState<LibraryItem | null>(null);

  // Load library items
  useEffect(() => {
    if (!isOpen || !userId || !bookId) return;
    
    loadItems();
  }, [isOpen, userId, bookId, selectedType]);

  const loadItems = async () => {
    setLoading(true);
    try {
      let loadedItems: LibraryItem[];
      
      if (selectedType === 'all') {
        loadedItems = await libraryService.getItemsByBook(userId, bookId);
      } else {
        loadedItems = await libraryService.getItemsByBook(userId, bookId, selectedType);
      }
      
      // Filter by search term if provided
      if (searchTerm.trim()) {
        const searchLower = searchTerm.toLowerCase();
        loadedItems = loadedItems.filter(item =>
          item.title.toLowerCase().includes(searchLower) ||
          item.content.toLowerCase().includes(searchLower) ||
          item.tags.some(tag => tag.toLowerCase().includes(searchLower))
        );
      }
      
      setItems(loadedItems);
    } catch (error) {
      console.error('Error loading library items:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateItem = async () => {
    if (!newItemTitle.trim() || !newItemContent.trim()) return;

    try {
      const newItem: Omit<LibraryItem, 'id' | 'createdAt' | 'updatedAt'> = {
        userId,
        bookId,
        type: newItemType,
        title: newItemTitle,
        content: newItemContent,
        pageNumber: currentPage,
        tags: [newItemType],
      };

      await libraryService.saveItem(newItem);
      
      // Reset form
      setNewItemTitle('');
      setNewItemContent('');
      setShowCreateForm(false);
      
      // Reload items
      loadItems();
    } catch (error) {
      console.error('Error creating item:', error);
    }
  };

  const handleGenerateTopStudentNote = async () => {
    if (!onGenerateTopStudentNote) return;
    
    try {
      // This would typically get content from the current page/selection
      const content = `Content from page ${currentPage}`;
      const subject = 'General'; // Could be detected or user-selected
      
      await libraryService.generateTopStudentNote(userId, bookId, content, currentPage, subject);
      loadItems();
    } catch (error) {
      console.error('Error generating top student note:', error);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!confirm('Are you sure you want to delete this item?')) return;
    
    try {
      await libraryService.deleteItem(userId, itemId);
      loadItems();
      setSelectedItem(null);
    } catch (error) {
      console.error('Error deleting item:', error);
    }
  };

  const renderTopStudentNote = (note: TopStudentNote) => (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className={`text-sm font-medium ${DIFFICULTY_COLORS[note.metadata.difficulty]}`}>
          {note.metadata.difficulty.toUpperCase()}
        </span>
        <span className="text-xs bg-blue-500/20 text-blue-300 px-2 py-1 rounded">
          {note.metadata.subject}
        </span>
        <span className="text-xs bg-green-500/20 text-green-300 px-2 py-1 rounded">
          Confidence: {note.metadata.confidenceScore}/10
        </span>
      </div>

      {note.metadata.keyPoints.length > 0 && (
        <div>
          <h5 className="text-sm font-semibold text-yellow-400 mb-2">🎯 Key Points</h5>
          <ul className="text-sm space-y-1">
            {note.metadata.keyPoints.map((point, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="text-yellow-400 mt-1">•</span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {note.metadata.mnemonics.length > 0 && (
        <div>
          <h5 className="text-sm font-semibold text-purple-400 mb-2">🧩 Memory Aids</h5>
          <ul className="text-sm space-y-1">
            {note.metadata.mnemonics.map((mnemonic, idx) => (
              <li key={idx} className="bg-purple-500/10 p-2 rounded text-purple-300">
                {mnemonic}
              </li>
            ))}
          </ul>
        </div>
      )}

      {note.metadata.studyTips.length > 0 && (
        <div>
          <h5 className="text-sm font-semibold text-green-400 mb-2">💡 Study Tips</h5>
          <ul className="text-sm space-y-1">
            {note.metadata.studyTips.map((tip, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="text-green-400 mt-1">→</span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {note.metadata.examTips.length > 0 && (
        <div>
          <h5 className="text-sm font-semibold text-red-400 mb-2">🎯 Exam Tips</h5>
          <ul className="text-sm space-y-1">
            {note.metadata.examTips.map((tip, idx) => (
              <li key={idx} className="bg-red-500/10 p-2 rounded text-red-300">
                {tip}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ x: 400, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 400, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="fixed top-0 right-0 w-96 h-full bg-gray-900 text-white shadow-2xl z-50 flex flex-col"
      >
        {/* Header */}
        <div className="p-4 bg-gray-800 border-b border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold">📚 Study Library</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              ✕
            </button>
          </div>

          {/* Search */}
          <input
            type="text"
            placeholder="Search your notes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full p-2 bg-gray-700 rounded text-sm mb-3"
          />

          {/* Type Filter */}
          <div className="flex gap-1 flex-wrap">
            <button
              onClick={() => setSelectedType('all')}
              className={`text-xs px-2 py-1 rounded ${
                selectedType === 'all' ? 'bg-yellow-500 text-black' : 'bg-gray-700'
              }`}
            >
              All
            </button>
            {Object.entries(ITEM_TYPE_LABELS).map(([type, label]) => (
              <button
                key={type}
                onClick={() => setSelectedType(type as LibraryItem['type'])}
                className={`text-xs px-2 py-1 rounded ${
                  selectedType === type ? 'bg-yellow-500 text-black' : 'bg-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="p-4 bg-gray-800 border-b border-gray-700">
          <div className="flex gap-2">
            <button
              onClick={() => setShowCreateForm(true)}
              className="flex-1 text-xs px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded transition-colors"
            >
              ➕ Create Note
            </button>
            <button
              onClick={handleGenerateTopStudentNote}
              className="flex-1 text-xs px-3 py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 rounded transition-colors"
            >
              🎓 Generate Top Student Note
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center">
              <div className="animate-spin w-6 h-6 border-2 border-yellow-400 border-t-transparent rounded-full mx-auto mb-2"></div>
              <p className="text-sm text-gray-400">Loading your library...</p>
            </div>
          ) : items.length === 0 ? (
            <div className="p-4 text-center text-gray-400">
              <p className="text-sm">No items found.</p>
              <p className="text-xs mt-1">Create your first note or generate a top student note!</p>
            </div>
          ) : (
            <div className="p-4 space-y-3">
              {items.map((item) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-gray-800 rounded-lg p-3 cursor-pointer hover:bg-gray-700 transition-colors"
                  onClick={() => setSelectedItem(item)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs">{ITEM_TYPE_LABELS[item.type]}</span>
                      {item.pageNumber && (
                        <span className="text-xs bg-gray-700 px-2 py-0.5 rounded">
                          p.{item.pageNumber}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-400">
                      {item.createdAt.toLocaleDateString()}
                    </span>
                  </div>
                  <h4 className="text-sm font-medium mb-1 line-clamp-2">{item.title}</h4>
                  <p className="text-xs text-gray-400 line-clamp-2">{item.content}</p>
                  
                  {item.type === 'top-student-note' && item.metadata?.difficulty && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className={`text-xs ${DIFFICULTY_COLORS[item.metadata.difficulty as keyof typeof DIFFICULTY_COLORS]}`}>
                        {item.metadata.difficulty}
                      </span>
                      {(item as TopStudentNote).metadata.confidenceScore && (
                        <span className="text-xs text-green-400">
                          {(item as TopStudentNote).metadata.confidenceScore}/10
                        </span>
                      )}
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {/* Create Form Modal */}
        {showCreateForm && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-gray-800 rounded-lg p-4 w-full max-w-sm">
              <h3 className="text-lg font-bold mb-3">Create New Item</h3>
              
              <select
                value={newItemType}
                onChange={(e) => setNewItemType(e.target.value as LibraryItem['type'])}
                className="w-full p-2 bg-gray-700 rounded mb-3 text-sm"
              >
                {Object.entries(ITEM_TYPE_LABELS).map(([type, label]) => (
                  <option key={type} value={type}>{label}</option>
                ))}
              </select>

              <input
                type="text"
                placeholder="Title"
                value={newItemTitle}
                onChange={(e) => setNewItemTitle(e.target.value)}
                className="w-full p-2 bg-gray-700 rounded mb-3 text-sm"
              />

              <textarea
                placeholder="Content"
                value={newItemContent}
                onChange={(e) => setNewItemContent(e.target.value)}
                className="w-full p-2 bg-gray-700 rounded mb-3 text-sm h-24 resize-none"
              />

              <div className="flex gap-2">
                <button
                  onClick={handleCreateItem}
                  className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm"
                >
                  Create
                </button>
                <button
                  onClick={() => setShowCreateForm(false)}
                  className="flex-1 px-3 py-2 bg-gray-600 hover:bg-gray-500 rounded text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Item Detail Modal */}
        {selectedItem && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-gray-800 rounded-lg p-4 w-full max-w-md max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold">{selectedItem.title}</h3>
                <button
                  onClick={() => setSelectedItem(null)}
                  className="text-gray-400 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <div className="mb-3 flex items-center gap-2 text-sm">
                <span>{ITEM_TYPE_LABELS[selectedItem.type]}</span>
                {selectedItem.pageNumber && (
                  <span className="bg-gray-700 px-2 py-0.5 rounded">
                    Page {selectedItem.pageNumber}
                  </span>
                )}
                <span className="text-gray-400">
                  {selectedItem.createdAt.toLocaleDateString()}
                </span>
              </div>

              <div className="mb-4">
                {selectedItem.type === 'top-student-note' ? (
                  renderTopStudentNote(selectedItem as TopStudentNote)
                ) : (
                  <div className="text-sm whitespace-pre-wrap">{selectedItem.content}</div>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleDeleteItem(selectedItem.id)}
                  className="px-3 py-2 bg-red-600 hover:bg-red-500 rounded text-sm"
                >
                  Delete
                </button>
                <button
                  onClick={() => setSelectedItem(null)}
                  className="flex-1 px-3 py-2 bg-gray-600 hover:bg-gray-500 rounded text-sm"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
