// components/surgeonView2/index.ts
// Surgeon View 2.0 Component Exports

export { ConceptCard } from './ConceptCard';
export { ClusterCard } from './ClusterCard';
export { PearlCard } from './PearlCard';
export { FilterBar } from './FilterBar';
export { BottomDrawer } from './BottomDrawer';
export { SurgeonStackPanel } from './SurgeonStackPanel';

// Re-export types for convenience
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
