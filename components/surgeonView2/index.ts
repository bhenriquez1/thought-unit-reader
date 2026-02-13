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
export { SurgeonCockpit } from './SurgeonCockpit';
export { CockpitHeader } from './CockpitHeader';
export { ClusterRail } from './ClusterRail';
export { RelationPanel } from './RelationPanel';
export { InsightOverlay } from './InsightOverlay';

// Re-export relationship store
export { useRelationshipStore } from '../../lib/relationshipSchema/store';

// Speech + Whiteboard integration
export { SpeechExplainActions, PauseActionPanel } from './SpeechExplainActions';
export { WhiteboardOverlay } from './WhiteboardOverlay';

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
