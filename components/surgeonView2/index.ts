// components/surgeonView2/index.ts
// Surgeon View 2.0 Component Exports

// Original components (concept-based)
export { ConceptCard } from './ConceptCard';
export { ClusterCard } from './ClusterCard';
export { PearlCard } from './PearlCard';
export { FilterBar } from './FilterBar';
export { BottomDrawer } from './BottomDrawer';
export { SurgeonStackPanel } from './SurgeonStackPanel';

// NEW: Relationship-first Cockpit (Surgeon View 2.0 redesign)
// SurgeonCockpit itself was removed as dead code (TestLab legacy-fallback
// audit) — zero importers outside this barrel; DATDrillMode.tsx (its sole
// child) was removed alongside it.
export { CockpitHeader } from './CockpitHeader';
export { ClusterRail } from './ClusterRail';
export { RelationPanel } from './RelationPanel';
export { InsightOverlay } from './InsightOverlay';

// Priority Comprehension Panel (cognitive-first UX)
export { PriorityComprehensionPanel } from './PriorityComprehensionPanel';
export { PriorityFeedPanel } from './PriorityFeedPanel';

// Unified Priority Workspace (Expert View 2.1 redesign)
export { PriorityWorkspacePanel } from './PriorityWorkspacePanel';
export { UnifiedInsightCard } from './UnifiedInsightCard';
export { SmartExtractControl } from './SmartExtractControl';
export type { ExtractScope } from './SmartExtractControl';

// Re-export relationship store
export { useRelationshipStore } from '../../lib/relationshipSchema/store';

// Speech + Whiteboard integration
export { SpeechExplainActions, PauseActionPanel } from './SpeechExplainActions';
// Phase B3-5: WhiteboardOverlay removed as dead code — zero importers outside
// this barrel file (TldrawCanvas's Professor Lesson Planner is the sole
// Whiteboard rendering pipeline; see components/WhiteboardPanel.tsx).

// Ninja Nerd Narration System
export { SpeechNarrationPanel } from './SpeechNarrationPanel';
export { SourceAnchor as SourceAnchorCard, SourceBadge } from './SourceAnchor';
export { ImportanceBar, BlockMath, InlineMath, MathSemanticCard } from './MathDisplay';

// Re-export types for convenience (original concept-based)
export type {
  CoreConceptV2,
  ConceptCluster,
  Pearl,
  ViewFilters,
  DrawerTab,
  ConceptTag,
  ConceptPriority,
  SourceAnchor,
  ReasoningOverlay,
} from '../../lib/surgeonView2/types';

// Re-export relationship-first types
export type {
  Concept,
  ConceptType,
  Relation,
  RelationPredicate,
  PatternCluster,
  PatternClusterKind,
  DecisionRule,
  DocRef,
  ExtractionResult,
  CockpitViewData,
} from '../../lib/relationshipSchema/types';
