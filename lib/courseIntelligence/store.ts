// lib/courseIntelligence/store.ts
// Course Intelligence State Management

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  CourseIntelligenceState,
  SyllabusBlock,
  SyllabusStatus,
  ObjectiveMapping,
  ClusterMapping,
  CoverageGraph,
  StudyPlan,
  PlanBlock,
  TimelineItem,
  TimelineItemType,
  Exam,
  TimeBudget,
  WeakCluster,
  ExplainerSession,
} from './types';
import { runMatchingPipeline, applyGoldMapping } from './matcher';
import type { TocItem } from '../stores/tocStore';
import {
  saveSyllabusBlocks,
  saveTimeline,
  saveMappings,
  loadAllDocumentData,
} from './indexedDBStorage';

// ============================================================================
// Store Interface
// ============================================================================

interface CourseIntelligenceActions {
  // Document
  setDocument: (documentId: string, documentTitle: string) => void;

  // Syllabus
  uploadSyllabus: (rawText: string) => Promise<void>;
  setSyllabusBlocks: (blocks: SyllabusBlock[]) => void;
  setSyllabusStatus: (status: SyllabusStatus) => void;

  // Mapping
  runMapping: (tocItems: TocItem[]) => void;
  acceptMapping: (mappingId: string) => void;
  rejectMapping: (mappingId: string) => void;
  setGoldMapping: (objectiveId: string, tocId: string, userId: string) => void;
  recomputeMappings: (tocItems: TocItem[]) => void;

  // Exams
  addExam: (exam: Omit<Exam, 'id'>) => void;
  selectExam: (examId: string | undefined) => void;
  updateExam: (examId: string, updates: Partial<Exam>) => void;
  deleteExam: (examId: string) => void;

  // Coverage
  buildCoverageGraph: (tocItems: TocItem[]) => void;

  // Plan
  generatePlan: (examId?: string) => void;
  lockPlan: () => void;
  unlockPlan: () => void;
  updateTimeBudget: (budget: Partial<TimeBudget>) => void;
  completePlanBlock: (blockId: string) => void;
  skipPlanBlock: (blockId: string) => void;

  // Timeline
  selectTimelineItem: (itemId: string | undefined) => void;

  // UI State
  toggleExamMode: () => void;
  toggleHighYieldOnly: () => void;
  toggleExplainerMode: () => void;

  // Explainer Session
  startExplainerSession: (examId: string) => void;
  endExplainerSession: () => void;
}

type CourseIntelligenceStore = CourseIntelligenceState & CourseIntelligenceActions;

// ============================================================================
// Default State
// ============================================================================

const defaultState: CourseIntelligenceState = {
  documentId: '',
  documentTitle: '',
  syllabusStatus: 'none',
  syllabusBlocks: [],
  objectiveMappings: [],
  clusterMappings: [],
  lowConfidenceMappings: [],
  exams: [],
  coverageGraph: null,
  studyPlan: null,
  timeline: [],
  examModeEnabled: false,
  highYieldOnly: false,
  explainerModeEnabled: false,
  isLoading: false,
};

// ============================================================================
// Store Implementation
// ============================================================================

export const useCourseIntelligenceStore = create<CourseIntelligenceStore>()(
  persist(
    (set, get) => ({
      ...defaultState,

      // ========================================
      // Document
      // ========================================

      setDocument: (documentId, documentTitle) => {
        const currentDocId = get().documentId;
        set({ documentId, documentTitle });

        // Hydrate from IndexedDB if document changed
        if (documentId && documentId !== currentDocId) {
          console.log('📚 Course Intelligence: Hydrating from IndexedDB for', documentId);
          loadAllDocumentData(documentId).then((data) => {
            if (data) {
              console.log('📚 Course Intelligence: Loaded from IndexedDB:', {
                syllabusBlocks: data.syllabusBlocks.length,
                timeline: data.timeline.length,
                mappings: data.objectiveMappings.length,
              });
              set({
                syllabusBlocks: data.syllabusBlocks,
                timeline: data.timeline,
                objectiveMappings: data.objectiveMappings,
                lowConfidenceMappings: data.lowConfidenceMappings,
                coverageGraph: data.coverageGraph,
                studyPlan: data.studyPlan,
                syllabusStatus: data.syllabusBlocks.length > 0 ? 'parsed' : 'none',
              });
            }
          }).catch((err) => {
            console.warn('📚 Course Intelligence: IndexedDB hydration failed:', err);
          });
        }
      },

      // ========================================
      // Syllabus
      // ========================================

      uploadSyllabus: async (rawText: string) => {
        console.log('📚 Course Intelligence: Starting syllabus upload...');
        set({ syllabusStatus: 'parsing', isLoading: true, error: undefined });

        try {
          // Parse syllabus (using the parser from syllabusParser module)
          const { parseSyllabus } = await import('../syllabusParser/parser');
          const parsed = parseSyllabus(rawText);
          console.log('📚 Course Intelligence: Parsed', parsed.blocks.length, 'blocks');

          if (parsed.blocks.length === 0) {
            console.warn('📚 Course Intelligence: No blocks found in syllabus');
            set({
              syllabusStatus: 'none',
              isLoading: false,
              error: 'No content blocks found in syllabus. Try a different format.',
            });
            return;
          }

          // Convert to SyllabusBlocks
          const blocks: SyllabusBlock[] = parsed.blocks.map((block) => ({
            id: block.id,
            type: block.type.toLowerCase() as SyllabusBlock['type'],
            title: block.label,
            dateRange: block.dateRange && block.dateRange.start && block.dateRange.end
              ? { start: block.dateRange.start, end: block.dateRange.end }
              : undefined,
            rawText: block.rawText,
            extractedEntities: {
              chapters: block.readings
                .filter((r) => r.kind === 'CHAPTER')
                .map((r) => r.normalized?.chapter || 0)
                .filter((n) => n > 0),
              pages: block.readings
                .filter((r) => r.kind === 'PAGES')
                .map((r) => ({
                  start: r.normalized?.pageStart || 0,
                  end: r.normalized?.pageEnd || 0,
                })),
              keywords: block.topics,
              topics: block.topics,
            },
            children: [],
          }));

          // Extract exams
          const exams: Exam[] = parsed.blocks
            .filter((b) => b.type === 'EXAM')
            .map((b) => ({
              id: `exam_${b.id}`,
              title: b.label,
              date: b.dateRange?.start || '',
              syllabusBlockId: b.id,
              coveredObjectiveIds: [],
              isPast: b.dateRange?.start ? new Date(b.dateRange.start) < new Date() : false,
              daysUntil: b.dateRange?.start
                ? Math.ceil((new Date(b.dateRange.start).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                : 999,
            }));

          // Generate timeline from blocks
          const today = new Date();
          const timeline: TimelineItem[] = blocks.map((block, idx) => {
            const startDate = block.dateRange?.start ? new Date(block.dateRange.start) : null;
            const daysUntil = startDate
              ? Math.ceil((startDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
              : undefined;

            return {
              id: `timeline_${block.id}`,
              type: (block.type === 'exam' ? 'exam' : block.type === 'week' ? 'week' : 'deliverable') as TimelineItemType,
              title: block.title,
              dateRange: block.dateRange,
              objectives: [block.id],
              mappedTocSections: [],
              mappedClusters: [],
              isOverdue: daysUntil !== undefined && daysUntil < 0,
              isCurrent: daysUntil !== undefined && daysUntil >= 0 && daysUntil <= 7,
              isUpcoming: daysUntil !== undefined && daysUntil > 7,
              daysUntil,
              progressPercent: 0,
              masteryAvg: 0,
            };
          });

          console.log('📚 Course Intelligence: Generated timeline with', timeline.length, 'items');

          // Update store state
          set({
            syllabusBlocks: blocks,
            exams,
            timeline,
            syllabusStatus: 'parsed',
            isLoading: false,
            lastSyncAt: Date.now(),
          });

          // Save large data to IndexedDB (async, non-blocking)
          const { documentId } = get();
          if (documentId) {
            console.log('📚 Course Intelligence: Saving to IndexedDB...');
            Promise.all([
              saveSyllabusBlocks(documentId, blocks, rawText),
              saveTimeline(documentId, timeline),
            ]).then(() => {
              console.log('📚 Course Intelligence: Saved to IndexedDB successfully');
            }).catch((err) => {
              console.warn('📚 Course Intelligence: IndexedDB save failed:', err);
            });
          }
        } catch (error) {
          console.error('📚 Course Intelligence: Syllabus parsing error:', error);
          set({
            syllabusStatus: 'none',
            isLoading: false,
            error: `Failed to parse syllabus: ${error instanceof Error ? error.message : 'Unknown error'}`,
          });
        }
      },

      setSyllabusBlocks: (blocks) => {
        set({ syllabusBlocks: blocks });
      },

      setSyllabusStatus: (status) => {
        set({ syllabusStatus: status });
      },

      // ========================================
      // Mapping
      // ========================================

      runMapping: (tocItems) => {
        const { syllabusBlocks, documentId } = get();
        if (syllabusBlocks.length === 0) return;

        set({ syllabusStatus: 'mapping', isLoading: true });

        try {
          const { mappings, lowConfidence } = runMatchingPipeline(syllabusBlocks, tocItems);

          set({
            objectiveMappings: mappings,
            lowConfidenceMappings: lowConfidence,
            syllabusStatus: lowConfidence.length > 0 ? 'needs_review' : 'mapped',
            isLoading: false,
          });

          // Save mappings to IndexedDB
          if (documentId) {
            saveMappings(documentId, mappings, lowConfidence).catch((err) => {
              console.warn('📚 Course Intelligence: Failed to save mappings to IndexedDB:', err);
            });
          }

          // Build coverage graph after mapping
          get().buildCoverageGraph(tocItems);
        } catch (error) {
          console.error('Mapping error:', error);
          set({
            syllabusStatus: 'parsed',
            isLoading: false,
            error: 'Failed to compute mappings',
          });
        }
      },

      acceptMapping: (mappingId) => {
        set((state) => ({
          objectiveMappings: state.objectiveMappings.map((m) =>
            m.id === mappingId ? { ...m, status: 'auto_accepted' as const } : m
          ),
          lowConfidenceMappings: state.lowConfidenceMappings.filter((m) => m.id !== mappingId),
        }));
      },

      rejectMapping: (mappingId) => {
        set((state) => ({
          objectiveMappings: state.objectiveMappings.map((m) =>
            m.id === mappingId ? { ...m, status: 'rejected' as const } : m
          ),
          lowConfidenceMappings: state.lowConfidenceMappings.filter((m) => m.id !== mappingId),
        }));
      },

      setGoldMapping: (objectiveId, tocId, userId) => {
        const { objectiveMappings } = get();
        const updated = applyGoldMapping(objectiveMappings, objectiveId, tocId, userId);

        set({
          objectiveMappings: updated,
          lowConfidenceMappings: get().lowConfidenceMappings.filter(
            (m) => m.objectiveId !== objectiveId
          ),
        });
      },

      recomputeMappings: (tocItems) => {
        const { objectiveMappings, syllabusBlocks } = get();

        // Preserve gold mappings
        const goldMappings = objectiveMappings.filter((m) => m.status === 'gold');
        const goldObjectiveIds = new Set(goldMappings.map((m) => m.objectiveId));

        // Re-run mapping for non-gold blocks
        const blocksToMap = syllabusBlocks.filter((b) => !goldObjectiveIds.has(b.id));

        const { mappings, lowConfidence } = runMatchingPipeline(blocksToMap, tocItems);

        set({
          objectiveMappings: [...goldMappings, ...mappings],
          lowConfidenceMappings: lowConfidence,
          syllabusStatus: lowConfidence.length > 0 ? 'needs_review' : 'mapped',
        });
      },

      // ========================================
      // Exams
      // ========================================

      addExam: (examData) => {
        const exam: Exam = {
          ...examData,
          id: `exam_${Date.now()}`,
        };
        set((state) => ({ exams: [...state.exams, exam] }));
      },

      selectExam: (examId) => {
        set({ selectedExamId: examId });
      },

      updateExam: (examId, updates) => {
        set((state) => ({
          exams: state.exams.map((e) => (e.id === examId ? { ...e, ...updates } : e)),
        }));
      },

      deleteExam: (examId) => {
        set((state) => ({
          exams: state.exams.filter((e) => e.id !== examId),
          selectedExamId: state.selectedExamId === examId ? undefined : state.selectedExamId,
        }));
      },

      // ========================================
      // Coverage Graph
      // ========================================

      buildCoverageGraph: (tocItems) => {
        const { syllabusBlocks, objectiveMappings, highYieldOnly } = get();

        // Build coverage graph from mappings
        const coveragePercent =
          objectiveMappings.filter((m) => m.status !== 'rejected').length / syllabusBlocks.length || 0;

        const lowConfidenceCount = objectiveMappings.filter(
          (m) => m.status === 'needs_review' || m.status === 'suggested_review'
        ).length;

        const graph: CoverageGraph = {
          roots: [],
          coveragePercent: Math.round(coveragePercent * 100),
          weakClustersCount: 0, // Would be computed from mastery data
          dueSoonCount: 0,
          lowConfidenceCount,
          highYieldOnly,
        };

        set({ coverageGraph: graph });
      },

      // ========================================
      // Study Plan
      // ========================================

      generatePlan: (examId) => {
        const { documentId, objectiveMappings, syllabusBlocks, selectedExamId } = get();
        const targetExamId = examId || selectedExamId;

        // Generate plan blocks based on mappings
        const todayBlocks: PlanBlock[] = [];
        const weekBlocks: PlanBlock[] = [];

        // Get relevant objectives for the exam
        const relevantMappings = objectiveMappings.filter(
          (m) => m.status !== 'rejected'
        ).slice(0, 10);

        // Create reading blocks
        relevantMappings.forEach((mapping, idx) => {
          const block = syllabusBlocks.find((b) => b.id === mapping.objectiveId);
          if (!block) return;

          const planBlock: PlanBlock = {
            id: `plan_${Date.now()}_${idx}`,
            type: 'reading',
            title: block.title,
            description: `Review ${block.title}`,
            estimatedMinutes: 20,
            sectionIds: [mapping.tocId],
            clusterIds: [],
            conceptIds: [],
            status: 'pending',
            canPlay: true,
            canExplain: true,
          };

          if (idx < 3) {
            todayBlocks.push(planBlock);
          } else {
            weekBlocks.push(planBlock);
          }
        });

        // Add reasoning blocks
        todayBlocks.push({
          id: `reasoning_${Date.now()}`,
          type: 'reasoning',
          title: 'Active Reasoning Session',
          description: 'Practice clinical reasoning with prompts',
          estimatedMinutes: 15,
          sectionIds: [],
          clusterIds: [],
          conceptIds: [],
          status: 'pending',
          canPlay: false,
          canExplain: true,
        });

        // Add drill block
        todayBlocks.push({
          id: `drill_${Date.now()}`,
          type: 'drill',
          title: 'Quick Review Drills',
          description: 'Test your knowledge',
          estimatedMinutes: 10,
          sectionIds: [],
          clusterIds: [],
          conceptIds: [],
          status: 'pending',
          canPlay: false,
          canExplain: false,
        });

        const plan: StudyPlan = {
          id: `plan_${Date.now()}`,
          examId: targetExamId,
          documentId,
          planLocked: false,
          generatedAt: Date.now(),
          timeBudget: {
            reading: 60,
            reasoning: 30,
            drills: 20,
            total: 110,
          },
          todayBlocks,
          weekBlocks,
          examBlocks: [],
          weakClusters: [],
        };

        set({ studyPlan: plan });
      },

      lockPlan: () => {
        set((state) => ({
          studyPlan: state.studyPlan
            ? { ...state.studyPlan, planLocked: true, lockedAt: Date.now() }
            : null,
        }));
      },

      unlockPlan: () => {
        set((state) => ({
          studyPlan: state.studyPlan
            ? { ...state.studyPlan, planLocked: false, lockedAt: undefined }
            : null,
        }));
      },

      updateTimeBudget: (budget) => {
        set((state) => ({
          studyPlan: state.studyPlan
            ? {
                ...state.studyPlan,
                timeBudget: { ...state.studyPlan.timeBudget, ...budget },
              }
            : null,
        }));
      },

      completePlanBlock: (blockId) => {
        set((state) => {
          if (!state.studyPlan) return state;

          const updateBlock = (blocks: PlanBlock[]) =>
            blocks.map((b) =>
              b.id === blockId ? { ...b, status: 'completed' as const, completedAt: Date.now() } : b
            );

          return {
            studyPlan: {
              ...state.studyPlan,
              todayBlocks: updateBlock(state.studyPlan.todayBlocks),
              weekBlocks: updateBlock(state.studyPlan.weekBlocks),
              examBlocks: updateBlock(state.studyPlan.examBlocks),
            },
          };
        });
      },

      skipPlanBlock: (blockId) => {
        set((state) => {
          if (!state.studyPlan) return state;

          const updateBlock = (blocks: PlanBlock[]) =>
            blocks.map((b) => (b.id === blockId ? { ...b, status: 'skipped' as const } : b));

          return {
            studyPlan: {
              ...state.studyPlan,
              todayBlocks: updateBlock(state.studyPlan.todayBlocks),
              weekBlocks: updateBlock(state.studyPlan.weekBlocks),
              examBlocks: updateBlock(state.studyPlan.examBlocks),
            },
          };
        });
      },

      // ========================================
      // Timeline
      // ========================================

      selectTimelineItem: (itemId) => {
        set({ selectedTimelineItemId: itemId });
      },

      // ========================================
      // UI State
      // ========================================

      toggleExamMode: () => {
        set((state) => ({ examModeEnabled: !state.examModeEnabled }));
      },

      toggleHighYieldOnly: () => {
        set((state) => ({ highYieldOnly: !state.highYieldOnly }));
      },

      toggleExplainerMode: () => {
        set((state) => ({ explainerModeEnabled: !state.explainerModeEnabled }));
      },

      // ========================================
      // Explainer Session
      // ========================================

      startExplainerSession: (examId) => {
        console.log('Starting explainer session for exam:', examId);
        set({ explainerModeEnabled: true, selectedExamId: examId });
      },

      endExplainerSession: () => {
        set({ explainerModeEnabled: false });
      },
    }),
    {
      name: 'course-intelligence-store',
      storage: createJSONStorage(() => {
        if (typeof window === 'undefined') {
          return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
        }
        // Custom storage with size guard
        return {
          getItem: (name: string) => localStorage.getItem(name),
          setItem: (name: string, value: string) => {
            // Size guard: don't write if payload > 50KB
            if (value.length > 50 * 1024) {
              console.warn('Course Intelligence: Skipping localStorage write (payload too large:', Math.round(value.length / 1024), 'KB)');
              return;
            }
            try {
              localStorage.setItem(name, value);
            } catch (e) {
              console.warn('Course Intelligence: localStorage write failed:', e);
              // Clear old data and retry with minimal state
              try {
                localStorage.removeItem(name);
              } catch {}
            }
          },
          removeItem: (name: string) => localStorage.removeItem(name),
        };
      }),
      // Only persist essential small pointers - NOT large data arrays
      partialize: (state) => ({
        documentId: state.documentId,
        documentTitle: state.documentTitle,
        syllabusStatus: state.syllabusStatus,
        // Store only IDs, not full objects
        examIds: state.exams.map(e => e.id),
        selectedExamId: state.selectedExamId,
        selectedTimelineItemId: state.selectedTimelineItemId,
        // UI preferences only
        examModeEnabled: state.examModeEnabled,
        highYieldOnly: state.highYieldOnly,
        explainerModeEnabled: state.explainerModeEnabled,
        // Plan locked status only (not full plan)
        planLocked: state.studyPlan?.planLocked || false,
      }),
      skipHydration: typeof window === 'undefined',
    }
  )
);

export default useCourseIntelligenceStore;
