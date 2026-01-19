"use client";

// components/PureNoteLabView.tsx
// PURE NOTELAB MODE - Review collected notes, highlights, quiz misses ONLY
// ❌ No Reader, No Surgeon View - This is a dedicated workspace for review

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { 
  useAnnotationStore, 
  type Annotation,
  getPDRMColorForType
} from '@/lib/stores/annotationStore';
import { useQuizStore } from '@/lib/stores/quizStore';
import { getPDRMTypeLabel } from '@/lib/autoPDRM';

interface PureNoteLabViewProps {
  documentId: string;
  userId: string;
  documentTitle?: string;
  chapters?: Array<{ id: string; title: string; pageNumber: number }>;
  onNavigateToPage?: (pageIndex: number) => void;
  onStartStudy?: () => void;
}

type FilterType = 'all' | 'highlights' | 'notes' | 'flashcards' | 'weak' | 'pattern' | 'decision' | 'mnemonic' | 'absorption';
type SortType = 'recent' | 'page' | 'type';
type GroupByType = 'none' | 'chapter' | 'type';

export default function PureNoteLabView({
  documentId,
  userId,
  documentTitle = 'Document',
  chapters = [],
  onNavigateToPage,
  onStartStudy
}: PureNoteLabViewProps) {
  // Store
  const {
    annotations,
    setActiveDocument,
    getHighlightsOnly,
    getFlashcards,
    getMistakes,
    getPDRMAnnotations,
    getAllAnnotationsArray,
    updateAnnotation,
    deleteAnnotation
  } = useAnnotationStore();

  const { getLastAttempt, getBestScore } = useQuizStore();

  // Local state
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [sortBy, setSortBy] = useState<SortType>('recent');
  const [groupBy, setGroupBy] = useState<GroupByType>('chapter');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  // Initialize
  useEffect(() => {
    setActiveDocument(documentId, userId);
  }, [documentId, userId, setActiveDocument]);

  // Filter annotations
  const filteredAnnotations = useMemo(() => {
    let result: Annotation[] = [];
    
    switch (activeFilter) {
      case 'highlights':
        result = getHighlightsOnly();
        break;
      case 'flashcards':
        result = getFlashcards();
        break;
      case 'weak':
        result = getMistakes();
        break;
      case 'notes':
        result = getAllAnnotationsArray().filter(a => a.noteContent);
        break;
      case 'pattern':
        result = getPDRMAnnotations('P');
        break;
      case 'decision':
        result = getPDRMAnnotations('D');
        break;
      case 'mnemonic':
        result = getPDRMAnnotations('M');
        break;
      default:
        result = getAllAnnotationsArray();
    }

    // Filter by document
    result = result.filter(a => a.documentId === documentId);

    // Apply search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(ann =>
        ann.selectedText.toLowerCase().includes(query) ||
        ann.noteContent?.toLowerCase().includes(query) ||
        ann.noteTitle?.toLowerCase().includes(query) ||
        ann.tags.some(t => t.toLowerCase().includes(query))
      );
    }

    // Sort
    switch (sortBy) {
      case 'recent':
        result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
      case 'page':
        result.sort((a, b) => a.pageIndex - b.pageIndex);
        break;
      case 'type':
        result.sort((a, b) => {
          const getTypePriority = (ann: Annotation) => {
            if (ann.pdrm?.isMistake) return 0;
            if (ann.pdrm?.pattern) return 1;
            if (ann.pdrm?.decisionRule) return 2;
            if (ann.pdrm?.mnemonic) return 3;
            if (ann.flashcardFront) return 4;
            return 5;
          };
          return getTypePriority(a) - getTypePriority(b);
        });
        break;
    }

    return result;
  }, [annotations, activeFilter, searchQuery, sortBy, documentId, getHighlightsOnly, getFlashcards, getMistakes, getPDRMAnnotations, getAllAnnotationsArray]);

  // Group annotations
  const groupedAnnotations = useMemo(() => {
    if (groupBy === 'none') {
      return { 'All Items': filteredAnnotations };
    }

    const groups: Record<string, Annotation[]> = {};

    if (groupBy === 'chapter') {
      // Create chapter groups
      chapters.forEach(ch => {
        groups[ch.title] = [];
      });
      groups['Uncategorized'] = [];

      filteredAnnotations.forEach(ann => {
        const chapter = chapters.find(ch => ch.id === ann.chapterId);
        const groupKey = chapter?.title || 'Uncategorized';
        if (!groups[groupKey]) groups[groupKey] = [];
        groups[groupKey].push(ann);
      });
    } else if (groupBy === 'type') {
      groups['⚠️ Weak/Mistakes'] = [];
      groups['🎯 Patterns'] = [];
      groups['⚖️ Decisions'] = [];
      groups['🧠 Mnemonics'] = [];
      groups['📇 Flashcards'] = [];
      groups['📝 Notes'] = [];
      groups['✨ Highlights'] = [];

      filteredAnnotations.forEach(ann => {
        if (ann.pdrm?.isMistake) {
          groups['⚠️ Weak/Mistakes'].push(ann);
        } else if (ann.pdrm?.pattern) {
          groups['🎯 Patterns'].push(ann);
        } else if (ann.pdrm?.decisionRule) {
          groups['⚖️ Decisions'].push(ann);
        } else if (ann.pdrm?.mnemonic) {
          groups['🧠 Mnemonics'].push(ann);
        } else if (ann.flashcardFront) {
          groups['📇 Flashcards'].push(ann);
        } else if (ann.noteContent) {
          groups['📝 Notes'].push(ann);
        } else {
          groups['✨ Highlights'].push(ann);
        }
      });
    }

    // Remove empty groups
    return Object.fromEntries(
      Object.entries(groups).filter(([_, items]) => items.length > 0)
    );
  }, [filteredAnnotations, groupBy, chapters]);

  // Stats
  const stats = useMemo(() => ({
    total: getAllAnnotationsArray().filter(a => a.documentId === documentId).length,
    weak: getMistakes().filter(a => a.documentId === documentId).length,
    flashcards: getFlashcards().filter(a => a.documentId === documentId).length,
    patterns: getPDRMAnnotations('P').filter(a => a.documentId === documentId).length,
    decisions: getPDRMAnnotations('D').filter(a => a.documentId === documentId).length,
    mnemonics: getPDRMAnnotations('M').filter(a => a.documentId === documentId).length
  }), [annotations, documentId, getAllAnnotationsArray, getMistakes, getFlashcards, getPDRMAnnotations]);

  // Handlers
  const handleToggleExpand = (id: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleStartEdit = (ann: Annotation) => {
    setEditingId(ann.id);
    setEditContent(ann.noteContent || '');
  };

  const handleSaveEdit = async (ann: Annotation) => {
    await updateAnnotation(ann.id, { noteContent: editContent });
    setEditingId(null);
    setEditContent('');
  };

  const handleDelete = async (ann: Annotation) => {
    if (confirm('Delete this item?')) {
      await deleteAnnotation(ann.id);
    }
  };

  // Get annotation type label
  const getTypeInfo = (ann: Annotation) => {
    if (ann.pdrm?.isMistake) return { label: 'Weak', color: '#EF4444', icon: '⚠️' };
    if (ann.pdrm?.pattern) return { label: 'Pattern', color: '#9333EA', icon: '🎯' };
    if (ann.pdrm?.decisionRule) return { label: 'Decision', color: '#3B82F6', icon: '⚖️' };
    if (ann.pdrm?.mnemonic) return { label: 'Mnemonic', color: '#F59E0B', icon: '🧠' };
    if (ann.flashcardFront) return { label: 'Flashcard', color: '#10B981', icon: '📇' };
    if (ann.noteContent) return { label: 'Note', color: '#6B7280', icon: '📝' };
    return { label: 'Highlight', color: '#FFEB3B', icon: '✨' };
  };

  return (
    <div className="h-full flex bg-gray-900" data-testid="pure-notelab-view">
      {/* Sidebar Filters */}
      <div className="w-64 border-r border-gray-700 flex flex-col bg-gray-800">
        {/* Header */}
        <div className="p-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white mb-1">📝 NoteLab</h2>
          <p className="text-sm text-gray-400 truncate">{documentTitle}</p>
        </div>

        {/* Stats */}
        <div className="p-4 border-b border-gray-700">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="p-2 bg-gray-900 rounded">
              <span className="text-gray-400">Total</span>
              <p className="font-bold text-white">{stats.total}</p>
            </div>
            <div className="p-2 bg-red-900/20 rounded">
              <span className="text-red-400">Weak</span>
              <p className="font-bold text-red-400">{stats.weak}</p>
            </div>
          </div>
        </div>

        {/* Filter Buttons */}
        <div className="flex-1 overflow-auto p-3 space-y-1">
          <p className="text-xs text-gray-500 uppercase mb-2">Filters</p>
          
          {([
            { key: 'all', label: 'All Items', icon: '📚', count: stats.total },
            { key: 'weak', label: 'Weak/Mistakes', icon: '⚠️', count: stats.weak },
            { key: 'pattern', label: 'Patterns', icon: '🎯', count: stats.patterns },
            { key: 'decision', label: 'Decisions', icon: '⚖️', count: stats.decisions },
            { key: 'mnemonic', label: 'Mnemonics', icon: '🧠', count: stats.mnemonics },
            { key: 'flashcards', label: 'Flashcards', icon: '📇', count: stats.flashcards },
            { key: 'highlights', label: 'Highlights', icon: '✨', count: null }
          ] as const).map(({ key, label, icon, count }) => (
            <button
              key={key}
              onClick={() => setActiveFilter(key)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                activeFilter === key
                  ? 'bg-purple-600 text-white'
                  : 'text-gray-300 hover:bg-gray-700'
              }`}
              data-testid={`filter-${key}`}
            >
              <span>{icon} {label}</span>
              {count !== null && (
                <span className={`text-xs px-2 py-0.5 rounded ${
                  activeFilter === key ? 'bg-purple-500' : 'bg-gray-700'
                }`}>
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Study Button */}
        {stats.weak > 0 && (
          <div className="p-3 border-t border-gray-700">
            <button
              onClick={onStartStudy}
              className="w-full px-4 py-3 bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-500 hover:to-orange-500 rounded-lg font-medium transition-colors"
              data-testid="notelab-study-btn"
            >
              🧠 Study Weak Items ({stats.weak})
            </button>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Search & Controls */}
        <div className="p-4 border-b border-gray-700 bg-gray-800 flex items-center gap-4">
          <div className="flex-1 relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search notes, highlights..."
              className="w-full px-4 py-2 pl-10 bg-gray-900 border border-gray-700 rounded-lg focus:outline-none focus:border-purple-500 text-white"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">🔍</span>
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortType)}
            className="px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
          >
            <option value="recent">Recent First</option>
            <option value="page">By Page</option>
            <option value="type">By Type</option>
          </select>

          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as GroupByType)}
            className="px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
          >
            <option value="chapter">Group by Chapter</option>
            <option value="type">Group by Type</option>
            <option value="none">No Grouping</option>
          </select>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {filteredAnnotations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <div className="text-6xl mb-4">📭</div>
              <p>No items found</p>
              <p className="text-sm mt-2">
                {activeFilter === 'all' 
                  ? 'Start highlighting text in Surgeon View to build your NoteLab'
                  : `No ${activeFilter} items yet`
                }
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedAnnotations).map(([groupName, items]) => (
                <div key={groupName}>
                  {groupBy !== 'none' && (
                    <h3 className="text-sm font-medium text-gray-400 mb-3 sticky top-0 bg-gray-900 py-2">
                      {groupName} ({items.length})
                    </h3>
                  )}
                  
                  <div className="space-y-3">
                    {items.map(ann => {
                      const typeInfo = getTypeInfo(ann);
                      const isExpanded = expandedItems.has(ann.id);
                      const isEditing = editingId === ann.id;
                      
                      return (
                        <div
                          key={ann.id}
                          className="p-4 rounded-lg border border-gray-700 bg-gray-800 hover:border-gray-600 transition-colors"
                          style={{ borderLeftColor: typeInfo.color, borderLeftWidth: 4 }}
                        >
                          {/* Header */}
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <div className="flex items-center gap-2">
                              <span 
                                className="text-xs px-2 py-0.5 rounded"
                                style={{ backgroundColor: `${typeInfo.color}20`, color: typeInfo.color }}
                              >
                                {typeInfo.icon} {typeInfo.label}
                              </span>
                              {ann.tags.length > 0 && ann.tags.slice(0, 2).map(tag => (
                                <span key={tag} className="text-xs px-2 py-0.5 bg-gray-700 rounded text-gray-400">
                                  {tag}
                                </span>
                              ))}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                              <span>p.{ann.pageIndex + 1}</span>
                              <button
                                onClick={() => handleToggleExpand(ann.id)}
                                className="hover:text-white transition-colors"
                              >
                                {isExpanded ? '▼' : '▶'}
                              </button>
                            </div>
                          </div>

                          {/* Selected Text */}
                          <p 
                            className={`text-white mb-2 ${isExpanded ? '' : 'line-clamp-2'} cursor-pointer`}
                            onClick={() => onNavigateToPage?.(ann.pageIndex + 1)}
                          >
                            "{ann.selectedText}"
                          </p>

                          {/* Expanded Content */}
                          {isExpanded && (
                            <div className="mt-3 pt-3 border-t border-gray-700 space-y-3">
                              {/* Flashcard */}
                              {ann.flashcardFront && (
                                <div className="p-3 bg-gray-900 rounded">
                                  <p className="text-xs text-purple-400 mb-1">Flashcard:</p>
                                  <p className="text-sm text-white">{ann.flashcardFront}</p>
                                  {ann.flashcardBack && (
                                    <p className="text-sm text-gray-400 mt-2">→ {ann.flashcardBack}</p>
                                  )}
                                </div>
                              )}

                              {/* Note */}
                              {isEditing ? (
                                <div>
                                  <textarea
                                    value={editContent}
                                    onChange={(e) => setEditContent(e.target.value)}
                                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm text-white focus:outline-none focus:border-purple-500"
                                    rows={4}
                                    autoFocus
                                  />
                                  <div className="flex gap-2 mt-2">
                                    <button
                                      onClick={() => handleSaveEdit(ann)}
                                      className="px-3 py-1 bg-green-600 hover:bg-green-500 rounded text-sm transition-colors"
                                    >
                                      Save
                                    </button>
                                    <button
                                      onClick={() => setEditingId(null)}
                                      className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : ann.noteContent ? (
                                <div className="p-3 bg-gray-900 rounded">
                                  <p className="text-xs text-gray-500 mb-1">Note:</p>
                                  <p className="text-sm text-gray-300 whitespace-pre-wrap">{ann.noteContent}</p>
                                </div>
                              ) : null}

                              {/* PDRM Details */}
                              {ann.pdrm?.pattern && (
                                <div className="p-3 bg-purple-900/20 rounded border border-purple-800/30">
                                  <p className="text-xs text-purple-400 mb-1">🎯 Pattern:</p>
                                  <p className="text-sm text-gray-300">{ann.pdrm.pattern}</p>
                                </div>
                              )}
                              {ann.pdrm?.decisionRule && (
                                <div className="p-3 bg-blue-900/20 rounded border border-blue-800/30">
                                  <p className="text-xs text-blue-400 mb-1">⚖️ Decision Rule:</p>
                                  <p className="text-sm text-gray-300">{ann.pdrm.decisionRule}</p>
                                </div>
                              )}
                              {ann.pdrm?.mnemonic && (
                                <div className="p-3 bg-orange-900/20 rounded border border-orange-800/30">
                                  <p className="text-xs text-orange-400 mb-1">🧠 Mnemonic:</p>
                                  <p className="text-sm text-gray-300">{ann.pdrm.mnemonic}</p>
                                </div>
                              )}

                              {/* Actions */}
                              <div className="flex gap-2">
                                <button
                                  onClick={() => onNavigateToPage?.(ann.pageIndex + 1)}
                                  className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs transition-colors"
                                >
                                  📖 Go to Page
                                </button>
                                <button
                                  onClick={() => handleStartEdit(ann)}
                                  className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs transition-colors"
                                >
                                  ✏️ Edit Note
                                </button>
                                <button
                                  onClick={() => handleDelete(ann)}
                                  className="px-3 py-1 bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded text-xs transition-colors"
                                >
                                  🗑️ Delete
                                </button>
                              </div>

                              {/* Metadata */}
                              <div className="text-xs text-gray-500 flex gap-4">
                                <span>Created: {new Date(ann.createdAt).toLocaleDateString()}</span>
                                {ann.updatedAt !== ann.createdAt && (
                                  <span>Updated: {new Date(ann.updatedAt).toLocaleDateString()}</span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
