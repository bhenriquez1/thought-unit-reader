// components/courseIntelligence/index.ts
// Course Intelligence Component Exports

export { CourseIntelligenceLayout } from './CourseIntelligenceLayout';
export { CourseIntelligenceHeader } from './CourseIntelligenceHeader';
export { CourseTimelinePane } from './CourseTimelinePane';
export { CoverageMapPane } from './CoverageMapPane';
export { ActionPlanPane } from './ActionPlanPane';
export { MappingReviewDrawer } from './MappingReviewDrawer';

// Re-export store
export { useCourseIntelligenceStore } from '../../lib/courseIntelligence/store';

// Re-export types
export type {
  SyllabusBlock,
  ObjectiveMapping,
  ClusterMapping,
  CoverageGraph,
  CoverageNode,
  StudyPlan,
  PlanBlock,
  WeakCluster,
  TimelineItem,
  Exam,
  TimeBudget,
  TOCEntry,
  MatchingConfig,
  ExplainerSession,
} from '../../lib/courseIntelligence/types';
