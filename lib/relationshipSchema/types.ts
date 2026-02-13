// lib/relationshipSchema/types.ts
// Standard Relationship-First Schema for Surgeon View 2.0
// Primary unit = Relations, not Concepts

// ============================================================================
// Document Reference (Source Grounding)
// ============================================================================

export interface DocRef {
  docId: string;
  page: number;
  spanHash: string;        // Stable anchor to text span
  bbox?: [number, number, number, number]; // Optional PDF coords [x1, y1, x2, y2]
  quote?: string;          // Short excerpt for display
}

// ============================================================================
// Concepts
// ============================================================================

export type ConceptType =
  | 'entity'      // Physical thing: cell, tooth, nerve
  | 'process'     // Action/change: differentiation, inflammation
  | 'finding'     // Observable: symptom, sign, result
  | 'risk'        // Danger/trap: complication, contraindication
  | 'tool'        // Diagnostic/therapeutic: transillumination, anesthetic
  | 'definition'; // Formal definition

export interface Concept {
  id: string;              // "c:monocyte"
  label: string;           // "Monocyte"
  type: ConceptType;
  aliases?: string[];      // Alternative names
  embeddingKey?: string;   // For semantic search
  refs: DocRef[];          // Where it came from (source grounding)
}

// ============================================================================
// Relations (Primary Unit)
// ============================================================================

export type RelationPolarity = 'pos' | 'neg' | 'conditional';
export type RelationModality = 'always' | 'often' | 'may' | 'rare' | 'never';

// Normalized predicates for consistent querying
export type RelationPredicate =
  // Causal
  | 'causes'
  | 'prevents'
  | 'triggers'
  | 'inhibits'
  | 'activates'
  | 'reduces'
  | 'increases'
  // Transformational
  | 'differentiate_into'
  | 'transforms_into'
  | 'produces'
  | 'secretes'
  | 'releases'
  // Diagnostic
  | 'suggests'
  | 'indicates'
  | 'rules_out'
  | 'confirms'
  | 'associated_with'
  // Structural
  | 'part_of'
  | 'contains'
  | 'located_in'
  | 'adjacent_to'
  // Functional
  | 'function_of'
  | 'requires'
  | 'enables'
  | 'used_for'
  // Comparative
  | 'similar_to'
  | 'different_from'
  | 'more_than'
  | 'less_than'
  // Clinical
  | 'treats'
  | 'contraindicates'
  | 'complicates'
  | 'precedes'
  | 'follows';

export interface Relation {
  id: string;              // "r:monocyte-diff-macrophage"
  subjId: string;          // Concept.id (subject)
  predicate: RelationPredicate | string; // Normalized verb
  objId: string;           // Concept.id (object)
  polarity?: RelationPolarity;
  modality?: RelationModality;
  evidence: DocRef[];      // MUST include spanHash/page
  confidence: number;      // 0..1
  extractedAt?: number;    // Timestamp
}

// ============================================================================
// Pattern Clusters (Groups of Related Relations)
// ============================================================================

export type PatternClusterKind =
  | 'process'     // Sequential steps: "Monocyte fate in tissues"
  | 'causal'      // Cause-effect chains: "Inflammation cascade"
  | 'diagnostic'  // Symptom → finding → diagnosis: "Fracture detection"
  | 'risk'        // Danger patterns: "Contraindication chains"
  | 'exception';  // Edge cases, exceptions to rules

export interface PatternCluster {
  id: string;                // "pc:innate-immunity-lineage"
  title: string;             // "Innate immune cell lineage"
  kind: PatternClusterKind;
  relationIds: string[];     // Group of Relation.id
  conceptIds: string[];      // Concepts involved (optional for filtering)
  refs: DocRef[];            // Cluster evidence anchor(s)
  confidence: number;        // Average or min of relations
  summary?: string;          // AI-generated 1-liner
}

// ============================================================================
// Decision Rules (IF → THEN → CONFIRM)
// ============================================================================

export type DecisionRuleTag =
  | 'DAT'            // Differential/Algorithm/Tree
  | 'high_yield'     // Exam-relevant
  | 'trap'           // Common mistake
  | 'clinical_pearl' // Expert insight
  | 'first_line'     // Primary treatment
  | 'contraindicated'; // Must avoid

export interface DecisionRule {
  id: string;
  // IF condition (what triggers this rule)
  if: {
    relationIds?: string[];  // Relations that trigger
    conceptIds?: string[];   // Concepts that trigger
    text?: string;           // Human-readable condition
  };
  // THEN action (what to do)
  then: {
    text: string;            // Human-readable action
    action?: string;         // Structured action type
    conceptIds?: string[];   // Concepts involved in action
  };
  // CONFIRM verification (how to verify)
  confirm: {
    text: string;            // Human-readable verification
    tests?: string[];        // Specific tests/checks
  };
  tags?: DecisionRuleTag[];
  refs: DocRef[];            // Anchor to source(s)
  createdBy: 'ai' | 'user';
  createdAt: number;
  updatedAt?: number;
}

// ============================================================================
// Insight (For Surgeon View Overlay)
// ============================================================================

export interface Insight {
  id: string;
  targetId: string;          // Relation.id, PatternCluster.id, or DecisionRule.id
  targetType: 'relation' | 'cluster' | 'rule';

  // Display content
  whyItMatters: string;      // 1-2 lines
  clinicalPearl?: string;    // If available
  trap?: string;             // Common mistake

  // Navigation
  relatedClusterIds: string[];
  relatedRuleIds: string[];
  refs: DocRef[];            // Jump-to-source
}

// ============================================================================
// Extraction Result (What the extractor produces)
// ============================================================================

export interface ExtractionResult {
  docId: string;
  pageIndex: number;

  // Extracted items
  concepts: Concept[];
  relations: Relation[];
  clusters: PatternCluster[];
  rules: DecisionRule[];

  // Metadata
  extractedAt: number;
  confidence: number;        // Overall extraction confidence
  tokenCount?: number;
}

// ============================================================================
// Store State
// ============================================================================

export interface RelationshipStoreState {
  // Document scope
  docId: string;

  // Primary data (in-memory, not persisted)
  concepts: Map<string, Concept>;
  relations: Map<string, Relation>;
  clusters: Map<string, PatternCluster>;
  rules: Map<string, DecisionRule>;
  insights: Map<string, Insight>;

  // Indexes for fast lookup
  relationsBySubject: Map<string, string[]>;  // conceptId -> relationIds
  relationsByObject: Map<string, string[]>;   // conceptId -> relationIds
  relationsByCluster: Map<string, string[]>;  // clusterId -> relationIds
  conceptsByPage: Map<number, string[]>;      // page -> conceptIds

  // UI state (persisted)
  selectedClusterId?: string;
  selectedRelationId?: string;
  expandedClusters: Set<string>;
  expertModeEnabled: boolean;

  // Filters
  filterByKind?: PatternClusterKind;
  filterByConfidence?: number;

  // Loading
  isExtracting: boolean;
  extractionProgress: number;
}

// ============================================================================
// Cockpit View Data (Computed for UI)
// ============================================================================

export interface CockpitViewData {
  // Left rail: Cluster list
  clusterGroups: {
    kind: PatternClusterKind;
    clusters: PatternCluster[];
    relationCount: number;
  }[];

  // Main panel: Relations for selected cluster
  activeRelations: {
    relation: Relation;
    subject: Concept;
    object: Concept;
    confidence: number;
  }[];

  // Chains (causal/diagnostic sequences)
  chains: {
    id: string;
    title: string;
    relations: Relation[];
    isComplete: boolean;
  }[];

  // Stats
  totalConcepts: number;
  totalRelations: number;
  totalClusters: number;
  totalRules: number;
  avgConfidence: number;
}

// ============================================================================
// Helpers
// ============================================================================

export function createDocRef(
  docId: string,
  page: number,
  text: string
): DocRef {
  // Create stable hash from text content
  const spanHash = hashText(text);
  return {
    docId,
    page,
    spanHash,
    quote: text.slice(0, 100),
  };
}

function hashText(text: string): string {
  // Simple hash for stable text anchoring
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return `span_${Math.abs(hash).toString(36)}`;
}

export function createConceptId(label: string, type: ConceptType): string {
  const normalized = label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  return `c:${normalized}`;
}

export function createRelationId(subjId: string, predicate: string, objId: string): string {
  const subj = subjId.replace('c:', '');
  const obj = objId.replace('c:', '');
  return `r:${subj}-${predicate}-${obj}`;
}

export function createClusterId(title: string): string {
  const normalized = title.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  return `pc:${normalized}`;
}

export function createRuleId(): string {
  return `dr:${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}
