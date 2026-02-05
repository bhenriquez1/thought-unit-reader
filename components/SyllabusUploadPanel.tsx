"use client";

/**
 * SyllabusUploadPanel - Upload syllabus to identify important sections
 *
 * Features:
 * - Upload syllabus PDF/TXT/MD
 * - Parse and extract topics
 * - Match syllabus topics with PDF chapters/pages
 * - Show coverage analysis
 * - Highlight important sections for study
 * - Priority-based study recommendations
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useSyllabusStore, type SyllabusTopic, type TopicStatus } from '@/lib/stores/syllabusStore';
import { useAnnotationStore } from '@/lib/stores/annotationStore';
import { extractTextFromPdf } from '@/lib/pdfjs-handler';

interface SyllabusUploadPanelProps {
  documentId: string;
  documentTitle?: string;
  chapters: Array<{ id: string; title: string; pageNumber: number; endPage?: number }>;
  pdfPageCount: number;
  onJumpToPage: (pageIndex: number) => void;
  onStartStudySession: (topicId?: string) => void;
}

// Priority levels for topics
type Priority = 'high' | 'medium' | 'low' | 'unknown';

interface ParsedTopic {
  title: string;
  pageRange?: { start: number; end: number };
  priority: Priority;
  keywords: string[];
  matchedChapters: string[];
  coverage: number;
}

// Status badge colors
const STATUS_CONFIG: Record<TopicStatus, { color: string; bgColor: string; icon: string; label: string }> = {
  not_started: { color: 'text-gray-400', bgColor: 'bg-gray-700', icon: '○', label: 'Not Started' },
  in_progress: { color: 'text-blue-400', bgColor: 'bg-blue-900/30', icon: '◐', label: 'In Progress' },
  needs_review: { color: 'text-yellow-400', bgColor: 'bg-yellow-900/30', icon: '⚠', label: 'Needs Review' },
  mastered: { color: 'text-green-400', bgColor: 'bg-green-900/30', icon: '✓', label: 'Mastered' }
};

const PRIORITY_CONFIG: Record<Priority, { color: string; bgColor: string; label: string; icon: string }> = {
  high: { color: 'text-red-400', bgColor: 'bg-red-900/30', label: 'High Priority', icon: '🔴' },
  medium: { color: 'text-yellow-400', bgColor: 'bg-yellow-900/30', label: 'Medium', icon: '🟡' },
  low: { color: 'text-green-400', bgColor: 'bg-green-900/30', label: 'Low', icon: '🟢' },
  unknown: { color: 'text-gray-400', bgColor: 'bg-gray-700', label: 'Unknown', icon: '⚪' }
};

export default function SyllabusUploadPanel({
  documentId,
  documentTitle = 'Document',
  chapters,
  pdfPageCount,
  onJumpToPage,
  onStartStudySession
}: SyllabusUploadPanelProps) {
  // Stores
  const {
    currentSyllabus,
    syllabi,
    activeTopicId,
    createSyllabus,
    addTopic,
    updateTopic,
    setActiveTopic,
    importFromChapters,
    getStudyQueue,
    calculateOverallProgress
  } = useSyllabusStore();

  const { getAllAnnotationsArray } = useAnnotationStore();

  // Local state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [parsedTopics, setParsedTopics] = useState<ParsedTopic[]>([]);
  const [showMatchAnalysis, setShowMatchAnalysis] = useState(false);
  const [syllabusText, setSyllabusText] = useState('');
  const [filterPriority, setFilterPriority] = useState<Priority | 'all'>('all');

  const syllabus = syllabi[documentId] || currentSyllabus;

  // Get annotations for coverage
  const annotations = useMemo(() => {
    return getAllAnnotationsArray().filter(a => a.documentId === documentId);
  }, [getAllAnnotationsArray, documentId]);

  // Detect priority from syllabus text patterns
  const detectPriority = (text: string, title: string): Priority => {
    const lowered = (text + ' ' + title).toLowerCase();

    // High priority indicators
    if (/\b(important|critical|must know|required|exam|test|essential|key concept|mandatory)\b/i.test(lowered)) {
      return 'high';
    }

    // Medium priority
    if (/\b(should know|recommended|review|understand|learn)\b/i.test(lowered)) {
      return 'medium';
    }

    // Low priority
    if (/\b(optional|supplementary|extra|bonus|advanced|skip|skim)\b/i.test(lowered)) {
      return 'low';
    }

    return 'unknown';
  };

  // Extract keywords from title
  const extractKeywords = (title: string): string[] => {
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']);
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w));
  };

  // Match syllabus topic with PDF chapters
  const matchWithChapters = useCallback((topic: ParsedTopic): string[] => {
    const matched: string[] = [];
    const keywords = topic.keywords;

    chapters.forEach(chapter => {
      const chapterWords = extractKeywords(chapter.title);
      const overlap = keywords.filter(k => chapterWords.some(cw => cw.includes(k) || k.includes(cw)));

      if (overlap.length >= Math.min(2, keywords.length * 0.5)) {
        matched.push(chapter.id);
      }
    });

    return matched;
  }, [chapters]);

  // Calculate coverage for a topic
  const calculateCoverage = useCallback((topic: ParsedTopic): number => {
    if (!topic.pageRange) return 0;

    const topicAnnotations = annotations.filter(
      a => a.pageIndex >= topic.pageRange!.start && a.pageIndex <= topic.pageRange!.end
    );

    const pageSpan = topic.pageRange.end - topic.pageRange.start + 1;
    const annotatedPages = new Set(topicAnnotations.map(a => a.pageIndex)).size;

    return Math.min(100, Math.round((annotatedPages / pageSpan) * 100));
  }, [annotations]);

  // Parse syllabus file
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadError(null);
    setParsedTopics([]);

    try {
      let text = '';
      const extension = file.name.split('.').pop()?.toLowerCase();

      if (extension === 'pdf') {
        text = await extractTextFromPdf(file);
        if (!text || text.length < 10) {
          throw new Error('Could not extract text from PDF. Try TXT format.');
        }
      } else if (extension === 'txt' || extension === 'md') {
        text = await file.text();
      } else {
        throw new Error(`Unsupported format: .${extension}. Use PDF, TXT, or MD.`);
      }

      setSyllabusText(text);

      // Parse topics from text
      const topics = parseSyllabusText(text);

      if (topics.length === 0) {
        throw new Error('No topics found. Check the file format.');
      }

      // Enhance topics with matching and coverage
      const enhancedTopics: ParsedTopic[] = topics.map(t => {
        const topic: ParsedTopic = {
          ...t,
          keywords: extractKeywords(t.title),
          matchedChapters: [],
          coverage: 0
        };
        topic.matchedChapters = matchWithChapters(topic);
        topic.coverage = calculateCoverage(topic);
        return topic;
      });

      setParsedTopics(enhancedTopics);
      setShowMatchAnalysis(true);

    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to parse file');
    } finally {
      setIsUploading(false);
    }
  };

  // Parse syllabus text into topics
  const parseSyllabusText = (text: string): ParsedTopic[] => {
    const topics: ParsedTopic[] = [];
    const lines = text.split('\n').filter(l => l.trim());

    const patterns = [
      /^(Chapter|Section|Unit|Topic|Module|Lecture|Week|Part)\s*(\d+)[:\.\s-]+\s*(.+)/i,
      /^(\d+)[\.)\s]+\s*(.+)/,
      /^([IVXLCDM]+)[\.)\s]+\s*(.+)/i,
      /^[-•*]\s+(.+)/,
      /^(.+?)\s*\.{2,}\s*(\d+)\s*$/,
    ];

    const pageNumberPattern = /\s+(\d{1,4})\s*$/;

    lines.forEach((line, lineIdx) => {
      const trimmed = line.trim();
      if (trimmed.length < 3) return;

      // Get context (previous/next lines) for priority detection
      const context = lines.slice(Math.max(0, lineIdx - 2), lineIdx + 3).join(' ');

      for (const pattern of patterns) {
        const match = trimmed.match(pattern);
        if (match) {
          let title = '';
          let pageNum: number | undefined;

          if (match.length === 4) {
            title = `${match[1]} ${match[2]}: ${match[3].trim()}`;
          } else if (match.length === 3) {
            const possiblePage = parseInt(match[2]);
            if (possiblePage > 0 && possiblePage < 2000 && match[1].length > 3) {
              title = match[1].trim();
              pageNum = possiblePage;
            } else {
              title = `${match[1]}. ${match[2].trim()}`;
            }
          } else if (match.length === 2) {
            title = match[1].trim();
          }

          title = title.replace(/\.{2,}\s*\d+$/, '').trim();

          if (!pageNum) {
            const pageMatch = title.match(pageNumberPattern);
            if (pageMatch) {
              pageNum = parseInt(pageMatch[1]);
              title = title.replace(pageNumberPattern, '').trim();
            }
          }

          if (title.length > 2 && !topics.find(t => t.title === title)) {
            const priority = detectPriority(context, title);
            topics.push({
              title,
              pageRange: pageNum ? { start: pageNum - 1, end: Math.min(pageNum + 9, pdfPageCount - 1) } : undefined,
              priority,
              keywords: [],
              matchedChapters: [],
              coverage: 0
            });
          }
          break;
        }
      }
    });

    return topics;
  };

  // Import parsed topics to syllabus store
  const handleImportTopics = () => {
    if (!syllabus) {
      createSyllabus(documentId, documentTitle);
    }

    parsedTopics.forEach((topic, idx) => {
      addTopic({
        title: topic.title,
        order: idx,
        chapterIds: topic.matchedChapters,
        pageRanges: topic.pageRange ? [topic.pageRange] : []
      });
    });

    setParsedTopics([]);
    setShowMatchAnalysis(false);
  };

  // Filter topics by priority
  const filteredTopics = useMemo(() => {
    if (filterPriority === 'all') return parsedTopics;
    return parsedTopics.filter(t => t.priority === filterPriority);
  }, [parsedTopics, filterPriority]);

  // Stats
  const stats = useMemo(() => {
    return {
      total: parsedTopics.length,
      high: parsedTopics.filter(t => t.priority === 'high').length,
      medium: parsedTopics.filter(t => t.priority === 'medium').length,
      low: parsedTopics.filter(t => t.priority === 'low').length,
      matched: parsedTopics.filter(t => t.matchedChapters.length > 0).length,
      withPages: parsedTopics.filter(t => t.pageRange).length
    };
  }, [parsedTopics]);

  // Render upload state (no syllabus yet)
  if (!syllabus && parsedTopics.length === 0) {
    return (
      <div className="h-full flex flex-col bg-gray-900 text-white" data-testid="syllabus-upload-empty">
        <div className="p-4 border-b border-gray-700 bg-gray-800">
          <h3 className="text-lg font-semibold text-teal-400">📋 Syllabus Mode</h3>
          <p className="text-sm text-gray-400">Upload your syllabus to identify important sections</p>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="text-center max-w-md w-full">
            <div className="text-7xl mb-6">📤</div>
            <h2 className="text-2xl font-bold mb-4">Upload Your Syllabus</h2>
            <p className="text-gray-400 mb-8">
              Upload your course syllabus to automatically identify which sections are most important to study.
            </p>

            {/* Upload area */}
            <div className="space-y-4">
              <label className="block">
                <div className={`p-8 border-2 border-dashed rounded-xl cursor-pointer transition-all ${
                  isUploading
                    ? 'border-teal-500 bg-teal-900/20'
                    : 'border-gray-600 hover:border-teal-500 hover:bg-teal-900/10'
                }`}>
                  {isUploading ? (
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-10 h-10 border-3 border-teal-500 border-t-transparent rounded-full animate-spin" />
                      <span className="text-teal-400">Parsing syllabus...</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3">
                      <span className="text-4xl">📄</span>
                      <span className="text-gray-300 font-medium">Drop syllabus file here</span>
                      <span className="text-sm text-gray-500">or click to browse</span>
                    </div>
                  )}
                </div>
                <input
                  type="file"
                  accept=".txt,.pdf,.md"
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={isUploading}
                  data-testid="syllabus-file-input"
                />
              </label>

              <p className="text-xs text-gray-500">Supports PDF, TXT, MD files</p>

              {uploadError && (
                <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg">
                  <p className="text-sm text-red-400">{uploadError}</p>
                </div>
              )}

              {/* Alternative: Import from TOC */}
              {chapters.length > 0 && (
                <div className="pt-4 border-t border-gray-700">
                  <p className="text-sm text-gray-500 mb-3">Or use the document's table of contents:</p>
                  <button
                    onClick={() => {
                      if (!syllabus) createSyllabus(documentId, documentTitle);
                      importFromChapters(chapters);
                    }}
                    className="w-full px-4 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium transition-colors"
                  >
                    📑 Import from TOC ({chapters.length} chapters)
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Render match analysis (after parsing)
  if (showMatchAnalysis && parsedTopics.length > 0) {
    return (
      <div className="h-full flex flex-col bg-gray-900 text-white" data-testid="syllabus-analysis">
        <div className="p-4 border-b border-gray-700 bg-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-teal-400">📋 Syllabus Analysis</h3>
              <p className="text-sm text-gray-400">Review matched topics before importing</p>
            </div>
            <button
              onClick={() => { setParsedTopics([]); setShowMatchAnalysis(false); }}
              className="text-gray-400 hover:text-white"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Stats bar */}
        <div className="p-4 bg-gray-800/50 border-b border-gray-700">
          <div className="grid grid-cols-5 gap-3 text-center">
            <div className="p-2 bg-gray-800 rounded-lg">
              <div className="text-xl font-bold text-teal-400">{stats.total}</div>
              <div className="text-xs text-gray-400">Topics</div>
            </div>
            <div className="p-2 bg-gray-800 rounded-lg">
              <div className="text-xl font-bold text-red-400">{stats.high}</div>
              <div className="text-xs text-gray-400">High Priority</div>
            </div>
            <div className="p-2 bg-gray-800 rounded-lg">
              <div className="text-xl font-bold text-yellow-400">{stats.medium}</div>
              <div className="text-xs text-gray-400">Medium</div>
            </div>
            <div className="p-2 bg-gray-800 rounded-lg">
              <div className="text-xl font-bold text-blue-400">{stats.matched}</div>
              <div className="text-xs text-gray-400">Matched</div>
            </div>
            <div className="p-2 bg-gray-800 rounded-lg">
              <div className="text-xl font-bold text-purple-400">{stats.withPages}</div>
              <div className="text-xs text-gray-400">With Pages</div>
            </div>
          </div>
        </div>

        {/* Priority filter */}
        <div className="px-4 py-2 border-b border-gray-700 flex gap-2 overflow-x-auto">
          {(['all', 'high', 'medium', 'low'] as const).map(priority => (
            <button
              key={priority}
              onClick={() => setFilterPriority(priority)}
              className={`px-3 py-1 rounded-full text-sm whitespace-nowrap transition-colors ${
                filterPriority === priority
                  ? 'bg-teal-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {priority === 'all' ? 'All Topics' : PRIORITY_CONFIG[priority].icon + ' ' + PRIORITY_CONFIG[priority].label}
            </button>
          ))}
        </div>

        {/* Topics list */}
        <div className="flex-1 overflow-auto p-4 space-y-3">
          {filteredTopics.map((topic, idx) => (
            <div
              key={idx}
              className="p-4 bg-gray-800 rounded-lg border border-gray-700 hover:border-gray-600 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${PRIORITY_CONFIG[topic.priority].bgColor} ${PRIORITY_CONFIG[topic.priority].color}`}>
                      {PRIORITY_CONFIG[topic.priority].icon} {PRIORITY_CONFIG[topic.priority].label}
                    </span>
                    {topic.pageRange && (
                      <span className="text-xs text-gray-500">
                        pp. {topic.pageRange.start + 1}-{topic.pageRange.end + 1}
                      </span>
                    )}
                  </div>

                  <h4 className="font-medium text-white mb-2">{topic.title}</h4>

                  {/* Matched chapters */}
                  {topic.matchedChapters.length > 0 && (
                    <div className="flex items-center gap-2 text-xs text-green-400">
                      <span>✓ Matched:</span>
                      {topic.matchedChapters.slice(0, 2).map(chId => {
                        const ch = chapters.find(c => c.id === chId);
                        return ch ? (
                          <span key={chId} className="px-2 py-0.5 bg-green-900/30 rounded">
                            {ch.title.substring(0, 30)}
                          </span>
                        ) : null;
                      })}
                      {topic.matchedChapters.length > 2 && (
                        <span className="text-gray-500">+{topic.matchedChapters.length - 2} more</span>
                      )}
                    </div>
                  )}

                  {/* Coverage bar */}
                  {topic.pageRange && (
                    <div className="mt-2">
                      <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span>Coverage</span>
                        <span>{topic.coverage}%</span>
                      </div>
                      <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-teal-500 transition-all"
                          style={{ width: `${topic.coverage}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                {topic.pageRange && (
                  <button
                    onClick={() => onJumpToPage(topic.pageRange!.start + 1)}
                    className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
                  >
                    📖
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Import button */}
        <div className="p-4 border-t border-gray-700 bg-gray-800">
          <button
            onClick={handleImportTopics}
            className="w-full px-6 py-3 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 rounded-xl font-semibold transition-all shadow-lg"
          >
            ✓ Import {parsedTopics.length} Topics to Study Plan
          </button>
        </div>
      </div>
    );
  }

  // Render syllabus view (after import)
  const overallProgress = calculateOverallProgress();
  const studyQueue = getStudyQueue();

  // Sort topics by priority
  const sortedTopics = useMemo(() => {
    if (!syllabus) return [];
    return [...syllabus.topics].sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2, unknown: 3 };
      // We don't have priority in SyllabusTopic, so sort by status
      const statusOrder = { needs_review: 0, in_progress: 1, not_started: 2, mastered: 3 };
      return (statusOrder[a.status] || 3) - (statusOrder[b.status] || 3);
    });
  }, [syllabus]);

  return (
    <div className="h-full flex flex-col bg-gray-900 text-white" data-testid="syllabus-panel">
      {/* Header */}
      <div className="p-4 border-b border-gray-700 bg-gray-800">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-teal-400">📋 {syllabus?.title || 'Study Plan'}</h3>
          <label className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm cursor-pointer transition-colors">
            📤 Upload New
            <input
              type="file"
              accept=".txt,.pdf,.md"
              onChange={handleFileUpload}
              className="hidden"
              disabled={isUploading}
            />
          </label>
        </div>

        {/* Progress */}
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Overall Progress</span>
            <span className="font-medium">{overallProgress}%</span>
          </div>
          <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-teal-500 to-cyan-500 transition-all duration-500"
              style={{ width: `${overallProgress}%` }}
            />
          </div>
        </div>
      </div>

      {/* High priority alert */}
      {syllabus && syllabus.topics.filter(t => t.status === 'needs_review').length > 0 && (
        <div className="p-3 bg-red-900/20 border-b border-red-800/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-red-400">🔴</span>
              <span className="text-sm text-red-300">
                {syllabus.topics.filter(t => t.status === 'needs_review').length} topics need review
              </span>
            </div>
            <button
              onClick={() => onStartStudySession()}
              className="px-3 py-1 bg-red-600 hover:bg-red-500 rounded text-sm font-medium transition-colors"
            >
              Study Now
            </button>
          </div>
        </div>
      )}

      {/* Topics list */}
      <div className="flex-1 overflow-auto p-4 space-y-2">
        {sortedTopics.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>No topics yet</p>
            <p className="text-sm mt-2">Upload a syllabus to get started</p>
          </div>
        ) : (
          sortedTopics.map((topic, idx) => {
            const statusConfig = STATUS_CONFIG[topic.status];
            const isActive = activeTopicId === topic.id;

            return (
              <div
                key={topic.id}
                className={`p-3 rounded-lg border cursor-pointer transition-all ${
                  isActive
                    ? 'border-teal-500 bg-teal-900/20'
                    : 'border-gray-700 bg-gray-800 hover:border-gray-600'
                }`}
                onClick={() => {
                  setActiveTopic(topic.id);
                  if (topic.pageRanges.length > 0) {
                    onJumpToPage(topic.pageRanges[0].start + 1);
                  }
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-gray-500 text-sm">{idx + 1}.</span>
                      <h4 className="font-medium truncate">{topic.title}</h4>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className={`px-2 py-0.5 rounded ${statusConfig.bgColor} ${statusConfig.color}`}>
                        {statusConfig.icon} {statusConfig.label}
                      </span>
                      {topic.pageRanges.length > 0 && (
                        <span className="text-gray-500">
                          pp. {topic.pageRanges[0].start + 1}-{topic.pageRanges[0].end + 1}
                        </span>
                      )}
                    </div>
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

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onStartStudySession(topic.id);
                    }}
                    className="px-3 py-2 bg-teal-600 hover:bg-teal-500 rounded text-sm font-medium transition-colors"
                  >
                    Study
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Study queue */}
      {studyQueue.length > 0 && (
        <div className="p-4 border-t border-gray-700 bg-gray-800">
          <button
            onClick={() => onStartStudySession()}
            className="w-full px-6 py-3 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 rounded-xl font-semibold transition-all shadow-lg"
          >
            Start Study Session ({studyQueue.length} topics)
          </button>
        </div>
      )}
    </div>
  );
}
