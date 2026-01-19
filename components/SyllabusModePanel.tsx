"use client";

// components/SyllabusModePanel.tsx
// Syllabus Mode - Course-structured study system
// Shows topics, tracks progress, links to study sessions

import React, { useState, useMemo, useCallback } from 'react';
import { useSyllabusStore, type SyllabusTopic, type TopicStatus } from '@/lib/stores/syllabusStore';
import { useAnnotationStore } from '@/lib/stores/annotationStore';
import { useStudySessionStore } from '@/lib/stores/studySessionStore';

interface SyllabusModePanelProps {
  documentId: string;
  documentTitle?: string;
  chapters: Array<{ id: string; title: string; pageNumber: number }>;
  onJumpToPage: (pageIndex: number) => void;
  onStartStudySession: (topicId?: string) => void;
}

// Status badge colors and icons
const STATUS_CONFIG: Record<TopicStatus, { color: string; bgColor: string; icon: string; label: string }> = {
  not_started: { color: 'text-gray-400', bgColor: 'bg-gray-700', icon: '○', label: 'Not Started' },
  in_progress: { color: 'text-blue-400', bgColor: 'bg-blue-900/30', icon: '◐', label: 'In Progress' },
  needs_review: { color: 'text-yellow-400', bgColor: 'bg-yellow-900/30', icon: '⚠', label: 'Needs Review' },
  mastered: { color: 'text-green-400', bgColor: 'bg-green-900/30', icon: '✓', label: 'Mastered' }
};

export default function SyllabusModePanel({
  documentId,
  documentTitle = 'Document',
  chapters,
  onJumpToPage,
  onStartStudySession
}: SyllabusModePanelProps) {
  // Stores
  const {
    currentSyllabus,
    syllabi,
    activeTopicId,
    createSyllabus,
    addTopic,
    updateTopic,
    deleteTopic,
    setActiveTopic,
    importFromChapters,
    getStudyQueue,
    getNextRecommendedTopic,
    calculateOverallProgress,
    updateTopicAfterStudy
  } = useSyllabusStore();
  
  const { getAllAnnotationsArray } = useAnnotationStore();
  const { startTopicSession, startQuickStudy, getWeakItemsCount } = useStudySessionStore();
  
  // Local state
  const [showAddTopic, setShowAddTopic] = useState(false);
  const [newTopicTitle, setNewTopicTitle] = useState('');
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
  const [showImportOptions, setShowImportOptions] = useState(false);
  const [uploadedSyllabusText, setUploadedSyllabusText] = useState('');
  const [isParsingFile, setIsParsingFile] = useState(false);
  
  // Handle syllabus file upload (PDF/TXT/DOCX)
  const handleSyllabusFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsParsingFile(true);
    
    try {
      const text = await file.text();
      setUploadedSyllabusText(text);
      
      // Parse topics from text
      const topics = parseSyllabusText(text);
      
      // Create syllabus if not exists
      if (!syllabus) {
        createSyllabus(documentId, documentTitle);
      }
      
      // Add parsed topics
      topics.forEach((topic, idx) => {
        addTopic({
          title: topic.title,
          order: idx,
          chapterIds: [],
          pageRanges: topic.pageRange ? [topic.pageRange] : []
        });
      });
      
      console.log(`📋 Imported ${topics.length} topics from ${file.name}`);
    } catch (err) {
      console.error('Failed to parse syllabus file:', err);
    } finally {
      setIsParsingFile(false);
    }
  };
  
  // Parse syllabus text into topics
  const parseSyllabusText = (text: string): Array<{ title: string; pageRange?: { start: number; end: number } }> => {
    const topics: Array<{ title: string; pageRange?: { start: number; end: number } }> = [];
    const lines = text.split('\n').filter(l => l.trim());
    
    // Common patterns for topic/chapter lines
    const patterns = [
      /^(Chapter|Section|Unit|Topic|Module|Lecture|Week)\s*(\d+)[:\.\s-]+(.+)/i,
      /^(\d+)[\.)\s]+(.+)/,
      /^[-•*]\s*(.+)/,
    ];
    
    lines.forEach(line => {
      const trimmed = line.trim();
      if (trimmed.length < 3) return;
      
      for (const pattern of patterns) {
        const match = trimmed.match(pattern);
        if (match) {
          let title = match.length === 4 
            ? `${match[1]} ${match[2]}: ${match[3].trim()}`
            : match.length === 3 
              ? `${match[1]}. ${match[2].trim()}`
              : match[1].trim();
          
          // Clean up title
          title = title.replace(/\.{2,}\s*\d+$/, '').trim();
          
          if (title.length > 2 && !topics.find(t => t.title === title)) {
            topics.push({ title });
          }
          break;
        }
      }
    });
    
    // If no patterns matched, treat each non-empty line as a topic
    if (topics.length === 0) {
      lines.slice(0, 50).forEach(line => {
        const trimmed = line.trim();
        if (trimmed.length >= 3 && trimmed.length < 200) {
          topics.push({ title: trimmed });
        }
      });
    }
    
    return topics;
  };
  
  // Initialize syllabus if not exists
  const syllabus = syllabi[documentId] || currentSyllabus;
  
  // Get annotations for progress calculation
  const annotations = useMemo(() => {
    return getAllAnnotationsArray().filter(a => a.documentId === documentId);
  }, [getAllAnnotationsArray, documentId]);
  
  // Calculate topic highlight counts
  const topicHighlightCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    if (!syllabus) return counts;
    
    syllabus.topics.forEach(topic => {
      const count = annotations.filter(a => {
        // Check if annotation is in topic's page range
        return topic.pageRanges.some(r => a.pageIndex >= r.start && a.pageIndex <= r.end);
      }).length;
      counts[topic.id] = count;
    });
    
    return counts;
  }, [syllabus, annotations]);
  
  // Study queue
  const studyQueue = syllabus ? getStudyQueue() : [];
  const nextRecommended = syllabus ? getNextRecommendedTopic() : null;
  
  // Handlers
  const handleCreateSyllabus = () => {
    createSyllabus(documentId, documentTitle);
  };
  
  const handleImportFromChapters = () => {
    if (!syllabus) {
      createSyllabus(documentId, documentTitle);
    }
    importFromChapters(chapters);
    setShowImportOptions(false);
  };
  
  const handleAddTopic = () => {
    if (!newTopicTitle.trim()) return;
    addTopic({
      title: newTopicTitle.trim(),
      order: syllabus?.topics.length || 0,
      chapterIds: [],
      pageRanges: []
    });
    setNewTopicTitle('');
    setShowAddTopic(false);
  };
  
  const handleTopicClick = (topic: SyllabusTopic) => {
    setActiveTopic(topic.id);
    // Jump to first page of topic
    if (topic.pageRanges.length > 0) {
      onJumpToPage(topic.pageRanges[0].start + 1);
    }
  };
  
  const handleStartStudy = (topicId?: string) => {
    if (topicId) {
      setActiveTopic(topicId);
      // Find the topic and start a filtered session
      const topic = syllabus?.topics.find(t => t.id === topicId);
      if (topic) {
        startTopicSession(documentId, topicId, topic.chapterIds, topic.pageRanges);
      }
    }
    onStartStudySession(topicId);
  };
  
  // Quick study from syllabus
  const handleQuickStudy = () => {
    const weakCount = getWeakItemsCount(documentId);
    if (weakCount > 0) {
      startQuickStudy(documentId, 15);
      onStartStudySession();
    }
  };
  
  // Get weak items count for Quick Study button
  const weakItemsCount = getWeakItemsCount(documentId);
  
  // Render empty state (no syllabus)
  if (!syllabus) {
    return (
      <div className="h-full flex flex-col bg-gray-900 text-white" data-testid="syllabus-empty">
        <div className="p-4 border-b border-gray-700 bg-gray-800">
          <h3 className="text-lg font-semibold text-orange-400">📚 Syllabus Mode</h3>
        </div>
        
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="text-center max-w-md">
            <div className="text-6xl mb-6">📋</div>
            <h2 className="text-2xl font-bold mb-4">Create Your Study Plan</h2>
            <p className="text-gray-400 mb-8">
              Organize your study with topics, track progress, and get smart recommendations.
            </p>
            
            <div className="space-y-3">
              <button
                onClick={handleCreateSyllabus}
                className="w-full px-6 py-3 bg-orange-600 hover:bg-orange-500 rounded-lg font-semibold transition-colors"
                data-testid="create-syllabus-btn"
              >
                ✨ Create New Syllabus
              </button>
              
              {chapters.length > 0 && (
                <button
                  onClick={handleImportFromChapters}
                  className="w-full px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium transition-colors"
                  data-testid="import-chapters-btn"
                >
                  📑 Import from Table of Contents ({chapters.length} chapters)
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  // Render syllabus view
  const overallProgress = calculateOverallProgress();
  
  return (
    <div className="h-full flex flex-col bg-gray-900 text-white" data-testid="syllabus-panel">
      {/* Header */}
      <div className="p-4 border-b border-gray-700 bg-gray-800">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-orange-400">📚 {syllabus.title}</h3>
          <div className="flex items-center gap-2">
            {syllabus.examType && (
              <span className="px-2 py-1 bg-orange-900/30 text-orange-400 text-xs rounded">
                {syllabus.examType}
              </span>
            )}
          </div>
        </div>
        
        {/* Overall Progress */}
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Overall Progress</span>
            <span className="font-medium">{overallProgress}%</span>
          </div>
          <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-orange-500 to-yellow-500 transition-all duration-500"
              style={{ width: `${overallProgress}%` }}
            />
          </div>
        </div>
      </div>
      
      {/* Recommended Action */}
      {nextRecommended && (
        <div className="p-3 bg-gradient-to-r from-orange-900/30 to-yellow-900/30 border-b border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-orange-400 font-medium">📍 Recommended Next</p>
              <p className="text-sm text-white">{nextRecommended.title}</p>
            </div>
            <button
              onClick={() => handleStartStudy(nextRecommended.id)}
              className="px-3 py-1.5 bg-orange-600 hover:bg-orange-500 rounded text-sm font-medium transition-colors"
              data-testid="study-recommended-btn"
            >
              Study Now
            </button>
          </div>
        </div>
      )}
      
      {/* Quick Study Button - shown when weak items exist */}
      {weakItemsCount > 0 && (
        <div className="p-3 border-b border-gray-700">
          <button
            onClick={handleQuickStudy}
            className="w-full px-4 py-3 bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-500 hover:to-orange-500 rounded-lg font-medium transition-all shadow-lg flex items-center justify-center gap-2"
            data-testid="syllabus-quick-study-btn"
          >
            ⚡ Quick Study ({weakItemsCount} weak items)
          </button>
        </div>
      )}
      
      {/* Topics List */}
      <div className="flex-1 overflow-auto">
        <div className="p-3 space-y-2">
          {syllabus.topics.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No topics yet</p>
              <p className="text-sm mt-2">Add topics to build your study plan</p>
            </div>
          ) : (
            syllabus.topics.map((topic, idx) => {
              const statusConfig = STATUS_CONFIG[topic.status];
              const highlightCount = topicHighlightCounts[topic.id] || 0;
              const isActive = activeTopicId === topic.id;
              
              return (
                <div
                  key={topic.id}
                  className={`p-3 rounded-lg border cursor-pointer transition-all ${
                    isActive 
                      ? 'border-orange-500 bg-orange-900/20' 
                      : 'border-gray-700 bg-gray-800 hover:border-gray-600'
                  }`}
                  onClick={() => handleTopicClick(topic)}
                  data-testid={`topic-${topic.id}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    {/* Topic Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-gray-500 text-sm">{idx + 1}.</span>
                        <h4 className="font-medium truncate">{topic.title}</h4>
                      </div>
                      
                      {/* Status & Stats */}
                      <div className="flex items-center gap-3 text-xs">
                        <span className={`px-2 py-0.5 rounded ${statusConfig.bgColor} ${statusConfig.color}`}>
                          {statusConfig.icon} {statusConfig.label}
                        </span>
                        <span className="text-gray-500">
                          {highlightCount} highlight{highlightCount !== 1 ? 's' : ''}
                        </span>
                        {topic.quizScore !== undefined && (
                          <span className="text-gray-500">
                            Quiz: {topic.quizScore}%
                          </span>
                        )}
                      </div>
                      
                      {/* Progress bar */}
                      <div className="mt-2 h-1 bg-gray-700 rounded-full overflow-hidden">
                        <div 
                          className={`h-full transition-all ${
                            topic.status === 'mastered' ? 'bg-green-500' :
                            topic.status === 'needs_review' ? 'bg-yellow-500' :
                            topic.status === 'in_progress' ? 'bg-blue-500' :
                            'bg-gray-600'
                          }`}
                          style={{ width: `${topic.completionPercentage}%` }}
                        />
                      </div>
                    </div>
                    
                    {/* Actions */}
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartStudy(topic.id);
                        }}
                        className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs transition-colors"
                        title="Study this topic"
                      >
                        🧠
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (topic.pageRanges.length > 0) {
                            onJumpToPage(topic.pageRanges[0].start + 1);
                          }
                        }}
                        className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs transition-colors"
                        title="Jump to page"
                      >
                        📖
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
      
      {/* Add Topic Form */}
      {showAddTopic ? (
        <div className="p-3 border-t border-gray-700 bg-gray-800">
          <div className="flex gap-2">
            <input
              type="text"
              value={newTopicTitle}
              onChange={(e) => setNewTopicTitle(e.target.value)}
              placeholder="Topic title..."
              className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-orange-500"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleAddTopic()}
            />
            <button
              onClick={handleAddTopic}
              disabled={!newTopicTitle.trim()}
              className="px-3 py-2 bg-orange-600 hover:bg-orange-500 disabled:bg-gray-600 rounded text-sm font-medium transition-colors"
            >
              Add
            </button>
            <button
              onClick={() => setShowAddTopic(false)}
              className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
            >
              ✕
            </button>
          </div>
        </div>
      ) : (
        <div className="p-3 border-t border-gray-700 bg-gray-800 flex gap-2">
          <button
            onClick={() => setShowAddTopic(true)}
            className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors"
            data-testid="add-topic-btn"
          >
            + Add Topic
          </button>
          {chapters.length > 0 && syllabus.topics.length === 0 && (
            <button
              onClick={handleImportFromChapters}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-500 rounded-lg text-sm font-medium transition-colors"
            >
              Import TOC
            </button>
          )}
        </div>
      )}
      
      {/* Study Queue Summary */}
      {studyQueue.length > 0 && (
        <div className="p-3 border-t border-gray-700 bg-gray-800">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">
              {studyQueue.length} topic{studyQueue.length !== 1 ? 's' : ''} to study
            </span>
            <button
              onClick={() => handleStartStudy()}
              className="px-3 py-1.5 bg-gradient-to-r from-orange-600 to-yellow-600 hover:from-orange-500 hover:to-yellow-500 rounded text-sm font-medium transition-colors"
              data-testid="start-study-queue-btn"
            >
              Start Study Session
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
