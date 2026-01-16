"use client";

// components/NoteLabViewEnhanced.tsx
// NoteLab - Organized study notebook that reads from unified AnnotationStore
// Structure: Document → Chapter → Section → Thought-Unit → Notes
// Uses same IDs as Surgeon View (documentId/chapterId/pageIndex/thoughtUnitId)

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  useAnnotationStore, 
  type Annotation,
  getPDRMColorForType 
} from '@/lib/stores/annotationStore';
import { getAuthInstance } from '@/lib/firebase';
import type { User } from 'firebase/auth';

interface NoteLabViewProps {
  documentId: string;
  userId: string;
  documentTitle?: string;
  chapters?: Array<{ id: string; title: string; pageIndex: number }>;
  onNavigateToSurgeonView: (pageIndex: number, annotationId?: string) => void;
}

type FilterType = 'all' | 'notes' | 'flashcards' | 'mnemonics' | 'mistakes' | 'highlights' | 'patterns' | 'decisions' | 'weak';

interface GroupedAnnotations {
  [chapterId: string]: {
    title: string;
    pageIndex: number;
    annotations: Annotation[];
  };
}

export default function NoteLabView({
  documentId,
  userId,
  documentTitle = 'Document',
  chapters = [],
  onNavigateToSurgeonView
}: NoteLabViewProps) {
  // Auth state
  const [user, setUser] = useState<User | null>(null);
  
  // Store state - use the updated API
  const {
    annotations,
    isLoading,
    setActiveDocument,
    getHighlightsOnly,
    getFlashcards,
    getMistakes,
    getPDRMAnnotations,
    getAllAnnotationsArray,
    updateAnnotation,
    deleteAnnotation
  } = useAnnotationStore();

  // Local state
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set());
  const [editingAnnotation, setEditingAnnotation] = useState<Annotation | null>(null);

  // Auth listener
  useEffect(() => {
    const auth = getAuthInstance();
    if (!auth) {
      // Firebase not configured - use guest mode
      setUser(null);
      return;
    }
    const unsub = auth.onAuthStateChanged((u) => setUser(u));
    return () => unsub?.();
  }, []);

  // Initialize store
  useEffect(() => {
    if (userId) {
      setActiveDocument(documentId, userId);
    }
  }, [documentId, userId, setActiveDocument]);

  // Get filtered annotations using new API
  const filteredAnnotations = useMemo(() => {
    let result: Annotation[] = [];
    
    switch (activeFilter) {
      case 'highlights':
        result = getHighlightsOnly();
        break;
      case 'flashcards':
        result = getFlashcards();
        break;
      case 'mnemonics':
        result = getPDRMAnnotations('M');
        break;
      case 'mistakes':
        result = getMistakes();
        break;
      case 'patterns':
        result = getPDRMAnnotations('P');
        break;
      case 'decisions':
        result = getPDRMAnnotations('D');
        break;
      case 'notes':
        result = getAllAnnotationsArray().filter(a => a.noteContent);
        break;
      case 'weak':
        // Show all items tagged as weak, miss, or quiz-miss
        result = getAllAnnotationsArray().filter(a => 
          a.tags.some(t => ['weak', 'miss', 'quiz-generated', 'quiz-miss'].includes(t)) ||
          (a.pdrm?.weakAreaTags && a.pdrm.weakAreaTags.length > 0) ||
          a.pdrm?.isMistake
        );
        break;
      default:
        result = getAllAnnotationsArray();
    }
    
    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(ann => 
        ann.selectedText.toLowerCase().includes(query) ||
        ann.noteTitle?.toLowerCase().includes(query) ||
        ann.noteContent?.toLowerCase().includes(query) ||
        ann.tags.some(tag => tag.toLowerCase().includes(query))
      );
    }
    
    return result;
  }, [annotations, activeFilter, searchQuery, getHighlightsOnly, getFlashcards, getPDRMAnnotations, getMistakes, getAllAnnotationsArray]);

  // Group annotations by chapter
  const groupedAnnotations = useMemo(() => {
    const grouped: GroupedAnnotations = {};
    
    // Initialize with chapters
    chapters.forEach(chapter => {
      grouped[chapter.id] = {
        title: chapter.title,
        pageIndex: chapter.pageIndex,
        annotations: []
      };
    });
    
    // Add ungrouped section
    grouped['_ungrouped'] = {
      title: 'General Notes',
      pageIndex: 0,
      annotations: []
    };
    
    // Distribute annotations
    filteredAnnotations.forEach(ann => {
      const chapterId = ann.chapterId || '_ungrouped';
      if (grouped[chapterId]) {
        grouped[chapterId].annotations.push(ann);
      } else {
        grouped['_ungrouped'].annotations.push(ann);
      }
    });
    
    // Sort annotations within each chapter by page
    Object.values(grouped).forEach(group => {
      group.annotations.sort((a, b) => a.pageIndex - b.pageIndex);
    });
    
    return grouped;
  }, [filteredAnnotations, chapters]);

  // Toggle chapter expansion
  const toggleChapter = useCallback((chapterId: string) => {
    setExpandedChapters(prev => {
      const next = new Set(prev);
      if (next.has(chapterId)) {
        next.delete(chapterId);
      } else {
        next.add(chapterId);
      }
      return next;
    });
  }, []);

  // Navigate to annotation
  const handleAnnotationClick = useCallback((annotation: Annotation) => {
    onNavigateToSurgeonView(annotation.pageIndex, annotation.id);
  }, [onNavigateToSurgeonView]);

  // Save edited annotation
  const handleSaveEdit = useCallback(async (annotation: Annotation, updates: Partial<Annotation>) => {
    await updateAnnotation(annotation.id, updates);
    setEditingAnnotation(null);
  }, [updateAnnotation]);

  // Delete annotation
  const handleDelete = useCallback(async (id: string) => {
    if (confirm('Delete this annotation?')) {
      await deleteAnnotation(id);
    }
  }, [deleteAnnotation]);

  // Stats - use Object.keys for Record instead of .size for Map
  const stats = useMemo(() => {
    const allAnns = getAllAnnotationsArray();
    const weakCount = allAnns.filter(a => 
      a.tags.some(t => ['weak', 'miss', 'quiz-generated', 'quiz-miss'].includes(t)) ||
      (a.pdrm?.weakAreaTags && a.pdrm.weakAreaTags.length > 0) ||
      a.pdrm?.isMistake
    ).length;
    
    return {
      total: Object.keys(annotations).length,
      highlights: getHighlightsOnly().length,
      flashcards: getFlashcards().length,
      patterns: getPDRMAnnotations('P').length,
      decisions: getPDRMAnnotations('D').length,
      mnemonics: getPDRMAnnotations('M').length,
      mistakes: getMistakes().length,
      notes: allAnns.filter(a => a.noteContent).length,
      weak: weakCount
    };
  }, [annotations, getHighlightsOnly, getFlashcards, getPDRMAnnotations, getMistakes, getAllAnnotationsArray]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-900">
        <div className="text-center">
          <div className="animate-spin text-6xl mb-4">📝</div>
          <p className="text-gray-400">Loading NoteLab...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-gray-900 text-white">
      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gray-800">
          <div>
            <h2 className="text-xl font-bold text-green-400">📝 NoteLab</h2>
            <p className="text-sm text-gray-400">{documentTitle}</p>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Search */}
            <div className="relative">
              <input
                type="text"
                placeholder="Search notes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-64 px-4 py-2 pl-10 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-green-500"
              />
              <span className="absolute left-3 top-2.5 text-gray-400">🔍</span>
            </div>
            
            {/* User info */}
            {user && (
              <span className="text-sm text-gray-400">
                {user.email}
              </span>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 p-4 border-b border-gray-700 bg-gray-850 overflow-x-auto">
          {([
            { key: 'all', label: '📚 All', count: stats.total },
            { key: 'highlights', label: '🔆 Highlights', count: stats.highlights },
            { key: 'notes', label: '📝 Notes', count: stats.notes },
            { key: 'flashcards', label: '📇 Flashcards', count: stats.flashcards },
            { key: 'weak', label: '⚠️ Missed/Weak', count: stats.weak },
            { key: 'mnemonics', label: '🧠 Mnemonics', count: stats.mnemonics },
            { key: 'mistakes', label: '❌ Mistakes', count: stats.mistakes }
          ] as const).map(filter => (
            <button
              key={filter.key}
              onClick={() => setActiveFilter(filter.key)}
              data-testid={`filter-${filter.key}`}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                activeFilter === filter.key
                  ? filter.key === 'weak' ? 'bg-red-600 text-white' : 'bg-green-600 text-white'
                  : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
              }`}
            >
              {filter.label} ({filter.count})
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {filteredAnnotations.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-6xl mb-4">📝</div>
              <h3 className="text-xl font-medium text-gray-300 mb-2">No annotations yet</h3>
              <p className="text-gray-500 mb-6">
                {activeFilter === 'all' 
                  ? 'Start highlighting text in Surgeon View to create annotations'
                  : `No ${activeFilter} found. Try a different filter.`
                }
              </p>
              <button
                onClick={() => onNavigateToSurgeonView(0)}
                className="px-6 py-3 bg-green-600 hover:bg-green-500 rounded-lg font-medium transition-colors"
              >
                Open Surgeon View
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(groupedAnnotations).map(([chapterId, group]) => {
                if (group.annotations.length === 0) return null;
                
                const isExpanded = expandedChapters.has(chapterId) || expandedChapters.size === 0;
                
                return (
                  <div key={chapterId} className="border border-gray-700 rounded-lg overflow-hidden">
                    {/* Chapter Header */}
                    <button
                      onClick={() => toggleChapter(chapterId)}
                      className="w-full flex items-center justify-between p-4 bg-gray-800 hover:bg-gray-750 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                          ▶
                        </span>
                        <span className="font-medium">{group.title}</span>
                        <span className="text-sm text-gray-500">
                          ({group.annotations.length} item{group.annotations.length !== 1 ? 's' : ''})
                        </span>
                      </div>
                      {chapterId !== '_ungrouped' && (
                        <span className="text-xs text-gray-500">
                          p.{group.pageIndex + 1}
                        </span>
                      )}
                    </button>
                    
                    {/* Annotations */}
                    {isExpanded && (
                      <div className="p-4 space-y-3 bg-gray-850">
                        {group.annotations.map(annotation => (
                          <AnnotationCard
                            key={annotation.id}
                            annotation={annotation}
                            onClick={() => handleAnnotationClick(annotation)}
                            onEdit={() => setEditingAnnotation(annotation)}
                            onDelete={() => handleDelete(annotation.id)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Stats Sidebar */}
      <div className="w-64 bg-gray-800 border-l border-gray-700 p-4">
        <h3 className="font-semibold mb-4">📊 Statistics</h3>
        
        <div className="space-y-3">
          <StatCard label="Total Items" value={stats.total} icon="📚" />
          <StatCard label="Highlights" value={stats.highlights} icon="🔆" color="yellow" />
          <StatCard label="Notes" value={stats.notes} icon="📝" color="green" />
          <StatCard label="Flashcards" value={stats.flashcards} icon="📇" color="purple" />
          <StatCard label="Mnemonics" value={stats.mnemonics} icon="🧠" color="orange" />
          <StatCard label="Mistakes" value={stats.mistakes} icon="❌" color="red" />
        </div>

        {/* Quick Actions */}
        <div className="mt-6 pt-6 border-t border-gray-700">
          <h4 className="text-sm font-medium text-gray-400 mb-3">Quick Actions</h4>
          <div className="space-y-2">
            <button
              onClick={() => onNavigateToSurgeonView(0)}
              className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
            >
              🔬 Open Surgeon View
            </button>
            <button
              className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
            >
              📤 Export Notes
            </button>
            <button
              className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
            >
              📇 Review Flashcards
            </button>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {editingAnnotation && (
        <EditAnnotationModal
          annotation={editingAnnotation}
          onSave={(updates) => handleSaveEdit(editingAnnotation, updates)}
          onClose={() => setEditingAnnotation(null)}
        />
      )}
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

interface AnnotationCardProps {
  annotation: Annotation;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function AnnotationCard({ annotation, onClick, onEdit, onDelete }: AnnotationCardProps) {
  // Determine type based on content/PDRM tags
  const getTypeLabel = () => {
    if (annotation.flashcardFront || annotation.flashcardBack) return { label: 'Flashcard', icon: '📇', bgColor: 'bg-purple-500/20', textColor: 'text-purple-400' };
    if (annotation.noteContent) return { label: 'Note', icon: '📝', bgColor: 'bg-green-500/20', textColor: 'text-green-400' };
    if (annotation.pdrm?.pattern) return { label: 'Pattern', icon: '🎯', bgColor: 'bg-purple-500/20', textColor: 'text-purple-400' };
    if (annotation.pdrm?.decisionRule) return { label: 'Decision', icon: '⚖️', bgColor: 'bg-blue-500/20', textColor: 'text-blue-400' };
    if (annotation.pdrm?.mnemonic) return { label: 'Mnemonic', icon: '🧠', bgColor: 'bg-orange-500/20', textColor: 'text-orange-400' };
    if (annotation.pdrm?.isMistake) return { label: 'Mistake', icon: '❌', bgColor: 'bg-red-500/20', textColor: 'text-red-400' };
    return { label: 'Highlight', icon: '🔆', bgColor: 'bg-yellow-500/20', textColor: 'text-yellow-400' };
  };
  
  const typeConfig = getTypeLabel();
  
  return (
    <div
      className="p-4 bg-gray-800 rounded-lg border border-gray-700 hover:border-gray-600 cursor-pointer transition-all group"
      onClick={onClick}
      data-testid={`annotation-card-${annotation.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Type badge */}
          <div className="flex items-center gap-2 mb-2">
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${typeConfig.bgColor} ${typeConfig.textColor}`}>
              {typeConfig.icon} {typeConfig.label}
            </span>
            {/* Show PDRM tags */}
            {annotation.pdrm?.pattern && (
              <span className="px-2 py-0.5 rounded text-xs font-bold bg-purple-600 text-white">P</span>
            )}
            {annotation.pdrm?.decisionRule && (
              <span className="px-2 py-0.5 rounded text-xs font-bold bg-blue-600 text-white">D</span>
            )}
            {annotation.pdrm?.mnemonic && (
              <span className="px-2 py-0.5 rounded text-xs font-bold bg-yellow-600 text-black">M</span>
            )}
            {annotation.pdrm?.isMistake && (
              <span className="px-2 py-0.5 rounded text-xs bg-red-500 text-white">
                Mistake
              </span>
            )}
          </div>
          
          {/* Title */}
          {annotation.noteTitle && (
            <h4 className="font-medium text-white mb-1 truncate">
              {annotation.noteTitle}
            </h4>
          )}
          
          {/* Text/Content */}
          <p className="text-sm text-gray-300 line-clamp-2">
            {annotation.noteContent || annotation.selectedText}
          </p>
          
          {/* Tags */}
          {annotation.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {annotation.tags.slice(0, 3).map((tag, idx) => (
                <span key={idx} className="px-2 py-0.5 bg-gray-700 rounded text-xs text-gray-400">
                  {tag}
                </span>
              ))}
              {annotation.tags.length > 3 && (
                <span className="text-xs text-gray-500">+{annotation.tags.length - 3}</span>
              )}
            </div>
          )}
          
          {/* Meta */}
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
            <span>p.{annotation.pageIndex + 1}</span>
            <span>{new Date(annotation.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
        
        {/* Actions */}
        <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-white"
            title="Edit"
          >
            ✏️
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-1.5 hover:bg-red-900/50 rounded text-gray-400 hover:text-red-400"
            title="Delete"
          >
            🗑️
          </button>
        </div>
      </div>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: number;
  icon: string;
  color?: 'yellow' | 'green' | 'purple' | 'orange' | 'red';
}

function StatCard({ label, value, icon, color }: StatCardProps) {
  const colorClasses = {
    yellow: 'text-yellow-400',
    green: 'text-green-400',
    purple: 'text-purple-400',
    orange: 'text-orange-400',
    red: 'text-red-400'
  };
  
  return (
    <div className="flex items-center justify-between p-3 bg-gray-700 rounded-lg">
      <div className="flex items-center gap-2">
        <span>{icon}</span>
        <span className="text-sm text-gray-300">{label}</span>
      </div>
      <span className={`font-bold ${color ? colorClasses[color] : 'text-white'}`}>
        {value}
      </span>
    </div>
  );
}

interface EditAnnotationModalProps {
  annotation: Annotation;
  onSave: (updates: Partial<Annotation>) => void;
  onClose: () => void;
}

function EditAnnotationModal({ annotation, onSave, onClose }: EditAnnotationModalProps) {
  const [title, setTitle] = useState(annotation.noteTitle || '');
  const [content, setContent] = useState(annotation.noteContent || annotation.selectedText);
  const [tags, setTags] = useState(annotation.tags.join(', '));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      noteTitle: title.trim() || undefined,
      noteContent: content.trim(),
      tags: tags.split(',').map(t => t.trim()).filter(Boolean)
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg w-full max-w-lg">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h3 className="text-lg font-semibold">Edit Annotation</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Title (optional)</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Add a title..."
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-green-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Content</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={5}
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-green-500 resize-none"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Tags (comma-separated)</label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="tag1, tag2, tag3..."
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-green-500"
            />
          </div>
          
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg font-medium transition-colors"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
