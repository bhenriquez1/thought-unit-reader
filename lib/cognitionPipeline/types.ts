// lib/cognitionPipeline/types.ts
// Cognition-First Architecture Types
// Pipeline: Text → Thought Units → Concepts → Relationships → Patterns → Decision Logic

// ============================================================================
// Layer 1: Core Concepts
// ============================================================================

export type ConceptType =
  | 'entity'           // Named thing (protein, organ, drug, term)
  | 'process'          // Action/mechanism (glycolysis, absorption)
  | 'property'         // Attribute (color, size, rate)
  | 'state'            // Condition (normal, pathological)
  | 'principle'        // Rule/law (Boyle's law, osmosis)
  | 'measurement'      // Quantifiable value
  | 'classification'   // Category/taxonomy
  | 'unknown';

export interface ExtractedConcept {
  id: string;
  concept: string;               // The concept label
  type: ConceptType;             // What kind of concept
  definition?: string;           // Brief definition if extractable
  relationships: RelationshipRef[];  // IDs of relationships involving this concept
  patternRole?: PatternRole;     // Role in detected patterns
  decisionLogic?: DecisionLogicRef;  // Clinical/functional implications
  evidenceSpan: EvidenceSpan;    // Where this was found
  confidence: number;            // 0-1
  priority: 'high' | 'medium' | 'low';
  tags: string[];                // Additional categorization
}

export interface EvidenceSpan {
  pageIndex: number;
  paragraphIndex: number;
  charStart: number;
  charEnd: number;
  rawText: string;               // The actual text that evidences this
  snippetHash: string;           // For re-finding
}

// ============================================================================
// Layer 2: Relationships
// ============================================================================

export type RelationshipType =
  // Causal relationships
  | 'causes'               // A causes B
  | 'prevents'             // A prevents B
  | 'enables'              // A enables/allows B
  | 'inhibits'             // A inhibits B
  | 'triggers'             // A triggers B
  | 'results_in'           // A results in B

  // Process relationships
  | 'precedes'             // A comes before B
  | 'follows'              // A comes after B
  | 'part_of'              // A is part of B (process step)
  | 'leads_to'             // A leads to B

  // Structural relationships
  | 'contains'             // A contains B
  | 'is_part_of'           // A is part of B (structure)
  | 'is_type_of'           // A is a type/subclass of B
  | 'has_property'         // A has property B
  | 'located_in'           // A is located in B

  // Functional relationships
  | 'structure_function'   // Structure A has function B
  | 'regulates'            // A regulates B
  | 'produces'             // A produces B
  | 'requires'             // A requires B
  | 'converts_to'          // A converts to B

  // Comparative relationships
  | 'similar_to'           // A is similar to B
  | 'different_from'       // A differs from B
  | 'greater_than'         // A > B
  | 'less_than'            // A < B
  | 'equals'               // A = B

  // Pathological relationships
  | 'pathology_symptom'    // Pathology A causes symptom B
  | 'treatment_for'        // A treats B
  | 'contraindicated'      // A is contraindicated for B
  | 'risk_factor'          // A is a risk factor for B

  // System relationships
  | 'interacts_with'       // A interacts with B
  | 'feedback_loop'        // A and B form feedback
  | 'dependent_on'         // A depends on B

  | 'unknown';

export interface Relationship {
  id: string;
  type: RelationshipType;
  sourceConceptId: string;       // The "A" in "A relates to B"
  targetConceptId: string;       // The "B"
  strength: 'strong' | 'moderate' | 'weak';
  direction: 'unidirectional' | 'bidirectional';
  evidence: EvidenceSpan[];      // Supporting text spans
  confidence: number;
  metadata?: {
    quantifier?: string;         // "always", "sometimes", "rarely"
    condition?: string;          // "when X occurs"
    mechanism?: string;          // How the relationship works
  };
}

export interface RelationshipRef {
  relationshipId: string;
  role: 'source' | 'target';
}

// ============================================================================
// Layer 3: Patterns & System Behaviors
// ============================================================================

export type PatternType =
  | 'functional'          // How a system works normally
  | 'diagnostic'          // Pattern for identifying conditions
  | 'pathological'        // Disease/dysfunction pattern
  | 'regulatory'          // Control/feedback pattern
  | 'developmental'       // Growth/maturation pattern
  | 'comparative'         // Comparison pattern
  | 'sequential'          // Step-by-step process
  | 'hierarchical'        // Classification/organization
  | 'cyclical'            // Repeating/feedback loop
  | 'threshold'           // Trigger-based behavior
  | 'unknown';

export interface Pattern {
  id: string;
  type: PatternType;
  title: string;                 // Human-readable pattern name
  description: string;           // What this pattern represents
  components: PatternComponent[];
  relationships: string[];       // Relationship IDs involved
  behaviorSummary: string;       // One-line behavior description
  clinicalRelevance?: string;    // Why this matters clinically
  examRelevance?: string;        // Why this matters for exams
  confidence: number;
  evidence: EvidenceSpan[];
}

export interface PatternComponent {
  conceptId: string;
  role: PatternRole;
  required: boolean;             // Is this component essential to the pattern?
}

export type PatternRole =
  | 'trigger'            // Initiates the pattern
  | 'mediator'           // Carries out the pattern
  | 'effector'           // Final action/output
  | 'regulator'          // Controls the pattern
  | 'substrate'          // Input/material
  | 'product'            // Output/result
  | 'inhibitor'          // Blocks the pattern
  | 'marker'             // Indicates pattern occurrence
  | 'context'            // Environmental factor
  | 'participant';       // General involvement

// ============================================================================
// Layer 4: Decision Logic & Clinical Implications
// ============================================================================

export interface DecisionLogic {
  id: string;
  conceptId: string;             // The concept this applies to
  patternId?: string;            // Optional pattern context

  // IF → THEN → CONFIRM structure
  condition: DecisionCondition;
  implication: DecisionImplication;
  confirmation?: DecisionConfirmation;

  // Categorization
  logicType: DecisionLogicType;
  priority: 'critical' | 'high' | 'moderate' | 'low';

  // Context
  context?: string;              // When this logic applies
  exceptions?: string[];         // When this logic does NOT apply

  evidence: EvidenceSpan[];
  confidence: number;
}

export type DecisionLogicType =
  | 'clinical_implication'   // What to do clinically
  | 'functional_consequence' // What happens functionally
  | 'conditional_reasoning'  // If X then Y reasoning
  | 'risk_indicator'         // Risk assessment
  | 'diagnostic_criterion'   // Diagnostic decision
  | 'treatment_choice'       // Treatment selection
  | 'contraindication'       // What NOT to do
  | 'prediction'             // What will happen
  | 'unknown';

export interface DecisionCondition {
  // The "IF" part
  ifStatement: string;
  conceptRefs: string[];         // Concept IDs involved in condition
  quantifiers?: string[];        // "elevated", "decreased", "absent"
}

export interface DecisionImplication {
  // The "THEN" part
  thenStatement: string;
  actionType: 'assess' | 'treat' | 'monitor' | 'refer' | 'avoid' | 'consider' | 'conclude';
  urgency?: 'immediate' | 'soon' | 'routine';
}

export interface DecisionConfirmation {
  // The "CONFIRM" part
  confirmStatement: string;
  method?: string;               // How to confirm
}

export interface DecisionLogicRef {
  decisionLogicId: string;
}

// ============================================================================
// Extraction Pipeline Output
// ============================================================================

export interface ExtractionResult {
  documentId: string;
  pageIndex: number;
  timestamp: number;

  // The extracted layers
  concepts: ExtractedConcept[];
  relationships: Relationship[];
  patterns: Pattern[];
  decisionLogics: DecisionLogic[];

  // Summary stats
  stats: {
    conceptCount: number;
    relationshipCount: number;
    patternCount: number;
    decisionLogicCount: number;
    highPriorityCount: number;
    confidenceAvg: number;
  };

  // Extraction quality
  quality: {
    completeness: number;        // 0-1 how much was extracted
    coherence: number;           // 0-1 how well things connect
    confidence: number;          // 0-1 overall confidence
  };
}

// ============================================================================
// Pipeline Configuration
// ============================================================================

export interface ExtractionConfig {
  // What to extract
  extractConcepts: boolean;
  extractRelationships: boolean;
  extractPatterns: boolean;
  extractDecisionLogic: boolean;

  // Filtering
  minConfidence: number;         // Minimum confidence to include
  priorityThreshold: 'all' | 'medium' | 'high';

  // Domain hints
  domain?: 'medical' | 'dental' | 'biology' | 'chemistry' | 'general';

  // Performance
  maxConceptsPerPage: number;
  maxRelationshipsPerPage: number;
}

export const DEFAULT_EXTRACTION_CONFIG: ExtractionConfig = {
  extractConcepts: true,
  extractRelationships: true,
  extractPatterns: true,
  extractDecisionLogic: true,
  minConfidence: 0.5,
  priorityThreshold: 'all',
  domain: 'general',
  maxConceptsPerPage: 50,
  maxRelationshipsPerPage: 100,
};
