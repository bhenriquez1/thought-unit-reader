// lib/stores/syllabusStore.ts
// Syllabus Mode - Course-structured study system
// Maps topics → chapters → highlights → study sessions

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// ============================================================================
// Types
// ============================================================================

export type TopicStatus = 'not_started' | 'in_progress' | 'needs_review' | 'mastered';

export interface SyllabusTopic {
  id: string;
  title: string;
  description?: string;
  order: number;
  
  // Links to document structure
  chapterIds: string[];      // Linked chapter IDs
  pageRanges: Array<{ start: number; end: number }>;
  
  // Progress tracking
  status: TopicStatus;
  completionPercentage: number;
  
  // Study metrics
  highlightCount: number;
  quizScore?: number;
  lastStudied?: string;
  
  // Timestamps
  createdAt: string;
  updatedAt: string;
}

export interface Syllabus {
  id: string;
  documentId: string;
  title: string;
  description?: string;
  examType?: 'DAT' | 'MCAT' | 'USMLE' | 'dental' | 'custom';
  
  topics: SyllabusTopic[];
  
  // Overall progress
  overallProgress: number;
  
  createdAt: string;
  updatedAt: string;
}

export interface SyllabusState {
  // Current syllabus
  currentSyllabus: Syllabus | null;
  syllabi: Record<string, Syllabus>;  // documentId -> syllabus
  
  // Active topic for study
  activeTopicId: string | null;
  
  // Actions
  createSyllabus: (documentId: string, title: string, examType?: Syllabus['examType']) => string;
  deleteSyllabus: (documentId: string) => void;
  
  // Topic management
  addTopic: (topic: Omit<SyllabusTopic, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'completionPercentage' | 'highlightCount'>) => string;
  updateTopic: (topicId: string, updates: Partial<SyllabusTopic>) => void;
  deleteTopic: (topicId: string) => void;
  reorderTopics: (topicIds: string[]) => void;
  
  // Progress tracking
  updateTopicStatus: (topicId: string, status: TopicStatus) => void;
  updateTopicProgress: (topicId: string, highlightCount: number, quizScore?: number) => void;
  markTopicStudied: (topicId: string) => void;
  
  // Study Session Integration
  updateTopicAfterStudy: (topicId: string, sessionScore: number) => void;
  linkHighlightToTopic: (topicId: string, highlightId: string) => void;
  
  // Navigation
  setActiveTopic: (topicId: string | null) => void;
  getTopicForChapter: (chapterId: string) => SyllabusTopic | null;
  getTopicForPage: (pageIndex: number) => SyllabusTopic | null;
  
  // Study queue
  getStudyQueue: () => SyllabusTopic[];
  getNextRecommendedTopic: () => SyllabusTopic | null;
  
  // Import/Export
  importFromCSV: (csv: string) => void;
  importFromChapters: (chapters: Array<{ id: string; title: string; pageNumber: number }>) => void;
  exportToCSV: () => string;
  
  // Getters
  getSyllabus: (documentId: string) => Syllabus | null;
  getTopicById: (topicId: string) => SyllabusTopic | null;
  calculateOverallProgress: () => number;
}

// ============================================================================
// Helpers
// ============================================================================

function generateId(): string {
  return `syllabus_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function generateTopicId(): string {
  return `topic_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Calculate status based on metrics
function calculateStatus(topic: SyllabusTopic): TopicStatus {
  if (topic.quizScore !== undefined && topic.quizScore >= 80) {
    return 'mastered';
  }
  if (topic.quizScore !== undefined && topic.quizScore < 60) {
    return 'needs_review';
  }
  if (topic.highlightCount > 0 || topic.lastStudied) {
    return 'in_progress';
  }
  return 'not_started';
}

// ============================================================================
// Store Implementation
// ============================================================================

export const useSyllabusStore = create<SyllabusState>()(
  persist(
    (set, get) => ({
      currentSyllabus: null,
      syllabi: {},
      activeTopicId: null,
      
      // Create new syllabus
      createSyllabus: (documentId: string, title: string, examType?: Syllabus['examType']) => {
        const id = generateId();
        const now = new Date().toISOString();
        
        const syllabus: Syllabus = {
          id,
          documentId,
          title,
          examType,
          topics: [],
          overallProgress: 0,
          createdAt: now,
          updatedAt: now
        };
        
        set((state) => ({
          syllabi: { ...state.syllabi, [documentId]: syllabus },
          currentSyllabus: syllabus
        }));
        
        return id;
      },
      
      // Delete syllabus
      deleteSyllabus: (documentId: string) => {
        set((state) => {
          const { [documentId]: removed, ...rest } = state.syllabi;
          return {
            syllabi: rest,
            currentSyllabus: state.currentSyllabus?.documentId === documentId ? null : state.currentSyllabus
          };
        });
      },
      
      // Add topic
      addTopic: (topicData) => {
        const { currentSyllabus } = get();
        if (!currentSyllabus) return '';
        
        const id = generateTopicId();
        const now = new Date().toISOString();
        
        const topic: SyllabusTopic = {
          ...topicData,
          id,
          status: 'not_started',
          completionPercentage: 0,
          highlightCount: 0,
          createdAt: now,
          updatedAt: now
        };
        
        const updatedSyllabus: Syllabus = {
          ...currentSyllabus,
          topics: [...currentSyllabus.topics, topic],
          updatedAt: now
        };
        
        set((state) => ({
          currentSyllabus: updatedSyllabus,
          syllabi: { ...state.syllabi, [currentSyllabus.documentId]: updatedSyllabus }
        }));
        
        return id;
      },
      
      // Update topic
      updateTopic: (topicId: string, updates: Partial<SyllabusTopic>) => {
        const { currentSyllabus } = get();
        if (!currentSyllabus) return;
        
        const now = new Date().toISOString();
        const updatedTopics = currentSyllabus.topics.map(t => 
          t.id === topicId ? { ...t, ...updates, updatedAt: now } : t
        );
        
        const updatedSyllabus: Syllabus = {
          ...currentSyllabus,
          topics: updatedTopics,
          overallProgress: get().calculateOverallProgress(),
          updatedAt: now
        };
        
        set((state) => ({
          currentSyllabus: updatedSyllabus,
          syllabi: { ...state.syllabi, [currentSyllabus.documentId]: updatedSyllabus }
        }));
      },
      
      // Delete topic
      deleteTopic: (topicId: string) => {
        const { currentSyllabus } = get();
        if (!currentSyllabus) return;
        
        const now = new Date().toISOString();
        const updatedSyllabus: Syllabus = {
          ...currentSyllabus,
          topics: currentSyllabus.topics.filter(t => t.id !== topicId),
          updatedAt: now
        };
        
        set((state) => ({
          currentSyllabus: updatedSyllabus,
          syllabi: { ...state.syllabi, [currentSyllabus.documentId]: updatedSyllabus },
          activeTopicId: state.activeTopicId === topicId ? null : state.activeTopicId
        }));
      },
      
      // Reorder topics
      reorderTopics: (topicIds: string[]) => {
        const { currentSyllabus } = get();
        if (!currentSyllabus) return;
        
        const topicMap = new Map(currentSyllabus.topics.map(t => [t.id, t]));
        const reorderedTopics = topicIds
          .map((id, idx) => {
            const topic = topicMap.get(id);
            return topic ? { ...topic, order: idx } : null;
          })
          .filter((t): t is SyllabusTopic => t !== null);
        
        const now = new Date().toISOString();
        const updatedSyllabus: Syllabus = {
          ...currentSyllabus,
          topics: reorderedTopics,
          updatedAt: now
        };
        
        set((state) => ({
          currentSyllabus: updatedSyllabus,
          syllabi: { ...state.syllabi, [currentSyllabus.documentId]: updatedSyllabus }
        }));
      },
      
      // Update topic status
      updateTopicStatus: (topicId: string, status: TopicStatus) => {
        get().updateTopic(topicId, { status });
      },
      
      // Update topic progress
      updateTopicProgress: (topicId: string, highlightCount: number, quizScore?: number) => {
        const topic = get().getTopicById(topicId);
        if (!topic) return;
        
        const updates: Partial<SyllabusTopic> = {
          highlightCount,
          quizScore
        };
        
        // Auto-calculate status
        updates.status = calculateStatus({ ...topic, ...updates });
        
        // Calculate completion percentage
        let completion = 0;
        if (highlightCount > 0) completion += 30;
        if (quizScore !== undefined) {
          completion += Math.min(70, quizScore * 0.7);
        }
        updates.completionPercentage = Math.min(100, completion);
        
        get().updateTopic(topicId, updates);
      },
      
      // Mark topic as studied
      markTopicStudied: (topicId: string) => {
        get().updateTopic(topicId, { lastStudied: new Date().toISOString() });
      },
      
      // Update topic after study session (auto-calculate status)
      updateTopicAfterStudy: (topicId: string, sessionScore: number) => {
        const topic = get().getTopicById(topicId);
        if (!topic) return;
        
        let newStatus: TopicStatus = topic.status;
        
        // Calculate new status based on score
        if (sessionScore >= 80) {
          newStatus = 'mastered';
        } else if (sessionScore >= 60) {
          newStatus = 'in_progress';
        } else {
          newStatus = 'needs_review';
        }
        
        // Calculate completion percentage
        let completionPercentage = topic.completionPercentage;
        if (sessionScore >= 80) {
          completionPercentage = Math.min(100, completionPercentage + 25);
        } else if (sessionScore >= 60) {
          completionPercentage = Math.min(100, completionPercentage + 10);
        }
        
        get().updateTopic(topicId, {
          status: newStatus,
          quizScore: sessionScore,
          completionPercentage,
          lastStudied: new Date().toISOString()
        });
        
        console.log(`📊 Topic ${topicId} updated: score=${sessionScore}%, status=${newStatus}`);
      },
      
      // Link a highlight to a topic (for tracking)
      linkHighlightToTopic: (topicId: string, highlightId: string) => {
        const topic = get().getTopicById(topicId);
        if (!topic) return;
        
        // Update highlight count
        get().updateTopic(topicId, {
          highlightCount: topic.highlightCount + 1
        });
      },
      
      // Set active topic
      setActiveTopic: (topicId: string | null) => {
        set({ activeTopicId: topicId });
      },
      
      // Get topic for chapter
      getTopicForChapter: (chapterId: string) => {
        const { currentSyllabus } = get();
        if (!currentSyllabus) return null;
        
        return currentSyllabus.topics.find(t => t.chapterIds.includes(chapterId)) || null;
      },
      
      // Get topic for page
      getTopicForPage: (pageIndex: number) => {
        const { currentSyllabus } = get();
        if (!currentSyllabus) return null;
        
        return currentSyllabus.topics.find(t => 
          t.pageRanges.some(r => pageIndex >= r.start && pageIndex <= r.end)
        ) || null;
      },
      
      // Get study queue (topics that need attention)
      getStudyQueue: () => {
        const { currentSyllabus } = get();
        if (!currentSyllabus) return [];
        
        return currentSyllabus.topics
          .filter(t => t.status !== 'mastered')
          .sort((a, b) => {
            // Priority: needs_review > in_progress > not_started
            const statusPriority = { needs_review: 0, in_progress: 1, not_started: 2, mastered: 3 };
            return statusPriority[a.status] - statusPriority[b.status];
          });
      },
      
      // Get next recommended topic
      getNextRecommendedTopic: () => {
        const queue = get().getStudyQueue();
        return queue[0] || null;
      },
      
      // Import from CSV
      importFromCSV: (csv: string) => {
        const { currentSyllabus } = get();
        if (!currentSyllabus) return;
        
        const lines = csv.split('\n').filter(l => l.trim());
        const topics: SyllabusTopic[] = [];
        
        lines.forEach((line, idx) => {
          const [title, description, pageStart, pageEnd] = line.split(',').map(s => s.trim());
          if (!title) return;
          
          const now = new Date().toISOString();
          topics.push({
            id: generateTopicId(),
            title,
            description: description || undefined,
            order: idx,
            chapterIds: [],
            pageRanges: pageStart && pageEnd ? [{ start: parseInt(pageStart) - 1, end: parseInt(pageEnd) - 1 }] : [],
            status: 'not_started',
            completionPercentage: 0,
            highlightCount: 0,
            createdAt: now,
            updatedAt: now
          });
        });
        
        const now = new Date().toISOString();
        const updatedSyllabus: Syllabus = {
          ...currentSyllabus,
          topics: [...currentSyllabus.topics, ...topics],
          updatedAt: now
        };
        
        set((state) => ({
          currentSyllabus: updatedSyllabus,
          syllabi: { ...state.syllabi, [currentSyllabus.documentId]: updatedSyllabus }
        }));
      },
      
      // Import from chapters (auto-generate syllabus from TOC)
      importFromChapters: (chapters) => {
        const { currentSyllabus } = get();
        if (!currentSyllabus) return;
        
        const topics: SyllabusTopic[] = chapters.map((ch, idx) => {
          const now = new Date().toISOString();
          const nextChapter = chapters[idx + 1];
          
          return {
            id: generateTopicId(),
            title: ch.title,
            order: idx,
            chapterIds: [ch.id],
            pageRanges: [{
              start: ch.pageNumber - 1,
              end: nextChapter ? nextChapter.pageNumber - 2 : ch.pageNumber + 10
            }],
            status: 'not_started',
            completionPercentage: 0,
            highlightCount: 0,
            createdAt: now,
            updatedAt: now
          };
        });
        
        const now = new Date().toISOString();
        const updatedSyllabus: Syllabus = {
          ...currentSyllabus,
          topics,
          updatedAt: now
        };
        
        set((state) => ({
          currentSyllabus: updatedSyllabus,
          syllabi: { ...state.syllabi, [currentSyllabus.documentId]: updatedSyllabus }
        }));
      },
      
      // Export to CSV
      exportToCSV: () => {
        const { currentSyllabus } = get();
        if (!currentSyllabus) return '';
        
        return currentSyllabus.topics
          .map(t => {
            const pageRange = t.pageRanges[0];
            return `${t.title},${t.description || ''},${pageRange ? pageRange.start + 1 : ''},${pageRange ? pageRange.end + 1 : ''}`;
          })
          .join('\n');
      },
      
      // Get syllabus
      getSyllabus: (documentId: string) => {
        return get().syllabi[documentId] || null;
      },
      
      // Get topic by ID
      getTopicById: (topicId: string) => {
        const { currentSyllabus } = get();
        if (!currentSyllabus) return null;
        return currentSyllabus.topics.find(t => t.id === topicId) || null;
      },
      
      // Calculate overall progress
      calculateOverallProgress: () => {
        const { currentSyllabus } = get();
        if (!currentSyllabus || currentSyllabus.topics.length === 0) return 0;
        
        const totalProgress = currentSyllabus.topics.reduce((sum, t) => sum + t.completionPercentage, 0);
        return Math.round(totalProgress / currentSyllabus.topics.length);
      }
    }),
    {
      name: 'syllabus-store',
      storage: createJSONStorage(() => {
        if (typeof window === 'undefined') {
          return {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
          };
        }
        return localStorage;
      }),
      partialize: (state) => ({
        syllabi: state.syllabi,
        currentSyllabus: state.currentSyllabus
      }),
      skipHydration: typeof window === 'undefined',
    }
  )
);

export default useSyllabusStore;
