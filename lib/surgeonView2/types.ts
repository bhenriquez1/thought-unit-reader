// lib/surgeonView2/types.ts
// Surgeon View 2.0 Core Types - Universal (not medical-only)

// ============================================================================
// Source Anchors - Stable linking between concepts and PDF source
// ============================================================================

export interface SourceAnchor {
  pageIndex: number;           // 0-based page index
  paragraphIndex: number;      // Paragraph position on page
  snippetHash: string;         // SHA256 hash of first 100 chars for re-finding
  charStart?: number;          // Optional character offset
  charEnd?: number;
  boundingBox?: {              // Optional PDF coordinates
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

// ============================================================================
// Core Concepts with Clustering Support
// ============================================================================

export type ConceptPriority = 'high' | 'medium' | 'low';
export type ConceptTag = 'definition' | 'process' | 'rule' | 'example' | 'pitfall' | 'formula' | 'comparison' | 'pearl';

export interface CoreConceptV2 {
  id: string;
  label: string;              // Short title (3-8 words)
  oneLiner: string;           // Core sentence (the concept itself)
  explanation?: string;       // Extended explanation
  priority: ConceptPriority;
  tags: ConceptTag[];
  confidence: number;         // 0-1 extraction confidence

  // Source linking
  anchor: SourceAnchor;
  sourceExcerpt: string;      // Full source paragraph/sentence

  // Clustering
  clusterId?: string;         // Which cluster this belongs to

  // Exam relevance
  examWeight?: number;        // 0-1 how testable
  questionHint?: string;      // Potential question angle
}

export interface ConceptCluster {
  id: string;
  title: string;              // Cluster label (e.g., "Cell Division Phases")
  subtitle?: string;          // Secondary label
  conceptIds: string[];       // Concepts in this cluster
  priority: ConceptPriority;  // Highest priority in cluster
  collapsed: boolean;
  pageRange: { start: number; end: number };
}

// ============================================================================
// Pearls (Universal High-Value Insights)
// ============================================================================

export type PearlType = 'insight' | 'tip' | 'warning' | 'mnemonic' | 'shortcut' | 'exception';

export interface Pearl {
  id: string;
  type: PearlType;
  content: string;            // The pearl itself
  context?: string;           // Why this matters
  anchor: SourceAnchor;
  sourceExcerpt: string;
  priority: ConceptPriority;
  tags: string[];
}

// ============================================================================
// View Modes and Filters
// ============================================================================

export type ViewMode = 'study' | 'exam' | 'review' | 'clinical';
export type DATLens = 'bio' | 'gc' | 'oc' | 'rc' | 'qr' | 'pat' | 'general';

export interface ViewFilters {
  mode: ViewMode;
  datLens?: DATLens;
  highYieldOnly: boolean;
  showPearls: boolean;
  showDefinitions: boolean;
  showProcesses: boolean;
  showExamples: boolean;
  priorityFilter: ConceptPriority[];
}

// ============================================================================
// Reasoning Overlay (Lens-based generation)
// ============================================================================

export type ReasoningLens = 'general' | 'exam' | 'clinical' | 'business' | 'learning';

export interface ReasoningOverlay {
  conceptId: string;
  lens: ReasoningLens;
  meaning: string;
  whyItMatters: string;
  whenToUse: string;
  commonTrap?: string;
  example?: string;
  question?: {
    q: string;
    choices: string[];
    answer: string;
    explanation: string;
  };
}

// ============================================================================
// Bottom Drawer Tabs
// ============================================================================

export type DrawerTab = 'source' | 'reasoning' | 'flashcards' | 'notes' | 'related';

export interface DrawerState {
  isOpen: boolean;
  activeTab: DrawerTab;
  selectedConceptId: string | null;
  selectedPearlId: string | null;
}

// ============================================================================
// Surgeon View 2.0 Page State
// ============================================================================

export interface SurgeonView2State {
  // Document
  documentId: string;
  currentPage: number;

  // Concepts & Clustering
  concepts: CoreConceptV2[];
  clusters: ConceptCluster[];
  pearls: Pearl[];

  // Selection & Navigation
  selectedConceptId: string | null;
  highlightedAnchor: SourceAnchor | null;

  // Filters
  filters: ViewFilters;

  // Drawer
  drawer: DrawerState;

  // Extraction status
  isExtracting: boolean;
  extractionProgress: number;
}

// ============================================================================
// Component Props Interfaces
// ============================================================================

export interface SurgeonViewPageProps {
  fileUrl: string | null;
  documentId: string;
  userId: string;
  currentPage: number;
  pdfPageCount: number;
  pageText: string;
  chapters: Array<{ id: string; title: string; pageNumber: number }>;
  onPageChange: (page: number) => void;
}

export interface PdfPanelProps {
  fileUrl: string;
  currentPage: number;
  highlightedAnchor: SourceAnchor | null;
  onPageChange: (page: number) => void;
  onTextSelect: (text: string, anchor: SourceAnchor) => void;
}

export interface SurgeonStackPanelProps {
  documentId: string;
  pageNumber: number;
  concepts: CoreConceptV2[];
  clusters: ConceptCluster[];
  pearls: Pearl[];
  filters: ViewFilters;
  selectedConceptId: string | null;
  onConceptClick: (concept: CoreConceptV2) => void;
  onPearlClick: (pearl: Pearl) => void;
  onTagChange: (conceptId: string, tags: ConceptTag[]) => void;
  onFilterChange: (filters: ViewFilters) => void;
  onClusterToggle: (clusterId: string) => void;
}

export interface ConceptCardProps {
  concept: CoreConceptV2;
  isSelected: boolean;
  onClick: () => void;
  onTagChange: (tags: ConceptTag[]) => void;
  onJumpToSource: () => void;
}

export interface ClusterCardProps {
  cluster: ConceptCluster;
  concepts: CoreConceptV2[];
  isCollapsed: boolean;
  onToggle: () => void;
  onConceptClick: (concept: CoreConceptV2) => void;
}

export interface PearlCardProps {
  pearl: Pearl;
  onClick: () => void;
  onJumpToSource: () => void;
}

export interface BottomDrawerProps {
  isOpen: boolean;
  activeTab: DrawerTab;
  selectedConcept: CoreConceptV2 | null;
  selectedPearl: Pearl | null;
  reasoning: ReasoningOverlay | null;
  onTabChange: (tab: DrawerTab) => void;
  onClose: () => void;
  onJumpToSource: (anchor: SourceAnchor) => void;
}
