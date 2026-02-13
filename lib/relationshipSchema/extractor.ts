// lib/relationshipSchema/extractor.ts
// Relationship-First Extraction Engine
// Extracts: Concepts → Relations → PatternClusters → DecisionRules

import type {
  Concept,
  ConceptType,
  Relation,
  RelationPredicate,
  PatternCluster,
  PatternClusterKind,
  DecisionRule,
  DocRef,
  ExtractionResult,
} from './types';
import {
  createDocRef,
  createConceptId,
  createRelationId,
  createClusterId,
  createRuleId,
} from './types';

// ============================================================================
// Relation Extraction Patterns
// ============================================================================

interface RelationPattern {
  predicate: RelationPredicate;
  patterns: RegExp[];
  subjType?: ConceptType[];
  objType?: ConceptType[];
  confidence: number;
}

const RELATION_PATTERNS: RelationPattern[] = [
  // Causal patterns
  {
    predicate: 'causes',
    patterns: [
      /(\w+(?:\s+\w+)?)\s+(?:causes?|leads?\s+to|results?\s+in|produces?)\s+(\w+(?:\s+\w+)?)/gi,
      /(\w+(?:\s+\w+)?)\s+→\s+(\w+(?:\s+\w+)?)/gi,
    ],
    confidence: 0.85,
  },
  {
    predicate: 'prevents',
    patterns: [
      /(\w+(?:\s+\w+)?)\s+(?:prevents?|inhibits?|blocks?|stops?)\s+(\w+(?:\s+\w+)?)/gi,
    ],
    confidence: 0.85,
  },
  {
    predicate: 'triggers',
    patterns: [
      /(\w+(?:\s+\w+)?)\s+(?:triggers?|initiates?|starts?|activates?)\s+(\w+(?:\s+\w+)?)/gi,
    ],
    confidence: 0.80,
  },

  // Transformational patterns
  {
    predicate: 'differentiate_into',
    patterns: [
      /(\w+(?:\s+\w+)?)\s+(?:differentiate(?:s)?|transform(?:s)?|develop(?:s)?|mature(?:s)?)\s+into\s+(\w+(?:\s+\w+)?)/gi,
      /(\w+(?:\s+\w+)?)\s+(?:become(?:s)?|turn(?:s)?)\s+(?:into\s+)?(\w+(?:\s+\w+)?)/gi,
    ],
    confidence: 0.90,
  },
  {
    predicate: 'produces',
    patterns: [
      /(\w+(?:\s+\w+)?)\s+(?:produces?|generates?|creates?|synthesizes?|secretes?)\s+(\w+(?:\s+\w+)?)/gi,
    ],
    confidence: 0.85,
  },

  // Diagnostic patterns
  {
    predicate: 'suggests',
    patterns: [
      /(\w+(?:\s+\w+)?)\s+(?:suggests?|indicates?|implies?|points?\s+to)\s+(\w+(?:\s+\w+)?)/gi,
      /presence\s+of\s+(\w+(?:\s+\w+)?)\s+(?:suggests?|indicates?)\s+(\w+(?:\s+\w+)?)/gi,
    ],
    subjType: ['finding'],
    confidence: 0.80,
  },
  {
    predicate: 'rules_out',
    patterns: [
      /(\w+(?:\s+\w+)?)\s+(?:rules?\s+out|excludes?|eliminates?)\s+(\w+(?:\s+\w+)?)/gi,
      /absence\s+of\s+(\w+(?:\s+\w+)?)\s+(?:rules?\s+out|excludes?)\s+(\w+(?:\s+\w+)?)/gi,
    ],
    confidence: 0.85,
  },
  {
    predicate: 'confirms',
    patterns: [
      /(\w+(?:\s+\w+)?)\s+(?:confirms?|verifies?|establishes?)\s+(?:the\s+)?(?:diagnosis\s+of\s+)?(\w+(?:\s+\w+)?)/gi,
    ],
    confidence: 0.85,
  },

  // Structural patterns
  {
    predicate: 'part_of',
    patterns: [
      /(\w+(?:\s+\w+)?)\s+(?:is\s+)?(?:a\s+)?part\s+of\s+(\w+(?:\s+\w+)?)/gi,
      /(\w+(?:\s+\w+)?)\s+(?:is\s+)?(?:a\s+)?component\s+of\s+(\w+(?:\s+\w+)?)/gi,
    ],
    confidence: 0.90,
  },
  {
    predicate: 'located_in',
    patterns: [
      /(\w+(?:\s+\w+)?)\s+(?:is\s+)?(?:located|found|present)\s+in\s+(\w+(?:\s+\w+)?)/gi,
    ],
    confidence: 0.85,
  },

  // Clinical patterns
  {
    predicate: 'treats',
    patterns: [
      /(\w+(?:\s+\w+)?)\s+(?:treats?|is\s+used\s+(?:to\s+)?treat|manages?)\s+(\w+(?:\s+\w+)?)/gi,
    ],
    subjType: ['tool'],
    objType: ['finding', 'process'],
    confidence: 0.85,
  },
  {
    predicate: 'contraindicates',
    patterns: [
      /(\w+(?:\s+\w+)?)\s+(?:is\s+)?contraindicated\s+(?:in|for|with)\s+(\w+(?:\s+\w+)?)/gi,
      /(?:do\s+not|avoid)\s+(\w+(?:\s+\w+)?)\s+(?:in|with)\s+(\w+(?:\s+\w+)?)/gi,
    ],
    confidence: 0.90,
  },
];

// ============================================================================
// Concept Extraction
// ============================================================================

const CONCEPT_INDICATORS: Record<ConceptType, RegExp[]> = {
  entity: [
    /\b(cell|nerve|tissue|bone|tooth|organ|muscle|vessel|gland)\b/gi,
    /\b(\w+cyte|\w+blast|\w+phage)\b/gi, // monocyte, osteoblast, macrophage
  ],
  process: [
    /\b(\w+tion|\w+sis|\w+ing)\b/gi, // inflammation, apoptosis, healing
    /\b(differentiation|proliferation|migration|secretion)\b/gi,
  ],
  finding: [
    /\b(symptom|sign|finding|pain|swelling|redness|fever)\b/gi,
    /\b(tender|positive|negative|elevated|decreased)\b/gi,
  ],
  risk: [
    /\b(risk|complication|contraindication|warning|danger)\b/gi,
    /\b(failure|damage|injury|necrosis)\b/gi,
  ],
  tool: [
    /\b(test|exam|instrument|device|probe|radiograph)\b/gi,
    /\b(transillumination|percussion|palpation|auscultation)\b/gi,
  ],
  definition: [
    /\b(\w+)\s+is\s+defined\s+as\b/gi,
    /\bthe\s+term\s+(\w+)\s+refers\s+to\b/gi,
  ],
};

// ============================================================================
// Pattern Cluster Detection
// ============================================================================

interface ClusterPattern {
  kind: PatternClusterKind;
  predicates: RelationPredicate[];
  minRelations: number;
  titleTemplate: (concepts: string[]) => string;
}

const CLUSTER_PATTERNS: ClusterPattern[] = [
  {
    kind: 'process',
    predicates: ['differentiate_into', 'transforms_into', 'produces', 'precedes', 'follows'],
    minRelations: 2,
    titleTemplate: (concepts) => `${concepts[0]} process pathway`,
  },
  {
    kind: 'causal',
    predicates: ['causes', 'triggers', 'activates', 'inhibits', 'prevents'],
    minRelations: 2,
    titleTemplate: (concepts) => `${concepts[0]} causal chain`,
  },
  {
    kind: 'diagnostic',
    predicates: ['suggests', 'indicates', 'rules_out', 'confirms', 'associated_with'],
    minRelations: 2,
    titleTemplate: (concepts) => `${concepts[0]} diagnostic pathway`,
  },
  {
    kind: 'risk',
    predicates: ['contraindicates', 'complicates', 'causes'],
    minRelations: 1,
    titleTemplate: (concepts) => `${concepts[0]} risk pattern`,
  },
];

// ============================================================================
// Decision Rule Detection
// ============================================================================

const DECISION_PATTERNS = [
  // IF ... THEN patterns
  /if\s+(.+?),?\s+then\s+(.+?)(?:\.|$)/gi,
  /when\s+(.+?),?\s+(?:you\s+should|consider|use|avoid)\s+(.+?)(?:\.|$)/gi,
  // Recommendation patterns
  /(.+?)\s+(?:requires?|necessitates?|indicates?)\s+(.+?)(?:\.|$)/gi,
  // Warning patterns
  /(?:do\s+not|never|avoid)\s+(.+?)\s+(?:when|if|in\s+case\s+of)\s+(.+?)(?:\.|$)/gi,
];

// ============================================================================
// Main Extraction Functions
// ============================================================================

export function extractConcepts(
  text: string,
  docId: string,
  page: number
): Concept[] {
  const concepts: Map<string, Concept> = new Map();
  const docRef = createDocRef(docId, page, text);

  // Extract by type indicators
  for (const [type, patterns] of Object.entries(CONCEPT_INDICATORS)) {
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const label = match[1] || match[0];
        if (label.length < 3 || label.length > 50) continue;

        const id = createConceptId(label, type as ConceptType);
        if (!concepts.has(id)) {
          concepts.set(id, {
            id,
            label: capitalizeFirst(label),
            type: type as ConceptType,
            refs: [docRef],
          });
        } else {
          // Add additional reference
          const existing = concepts.get(id)!;
          if (!existing.refs.some(r => r.spanHash === docRef.spanHash)) {
            existing.refs.push(docRef);
          }
        }
      }
    }
  }

  return Array.from(concepts.values());
}

export function extractRelations(
  text: string,
  concepts: Concept[],
  docId: string,
  page: number
): Relation[] {
  const relations: Relation[] = [];
  const conceptLookup = new Map(concepts.map(c => [c.label.toLowerCase(), c]));

  for (const pattern of RELATION_PATTERNS) {
    for (const regex of pattern.patterns) {
      let match;
      while ((match = regex.exec(text)) !== null) {
        const subjLabel = match[1]?.trim().toLowerCase();
        const objLabel = match[2]?.trim().toLowerCase();

        if (!subjLabel || !objLabel) continue;

        // Find or create concepts
        let subj = conceptLookup.get(subjLabel);
        let obj = conceptLookup.get(objLabel);

        // Skip if neither concept found
        if (!subj && !obj) continue;

        // Create missing concepts
        if (!subj) {
          subj = {
            id: createConceptId(subjLabel, 'entity'),
            label: capitalizeFirst(subjLabel),
            type: 'entity',
            refs: [createDocRef(docId, page, match[0])],
          };
          concepts.push(subj);
          conceptLookup.set(subjLabel, subj);
        }
        if (!obj) {
          obj = {
            id: createConceptId(objLabel, 'entity'),
            label: capitalizeFirst(objLabel),
            type: 'entity',
            refs: [createDocRef(docId, page, match[0])],
          };
          concepts.push(obj);
          conceptLookup.set(objLabel, obj);
        }

        const relation: Relation = {
          id: createRelationId(subj.id, pattern.predicate, obj.id),
          subjId: subj.id,
          predicate: pattern.predicate,
          objId: obj.id,
          evidence: [createDocRef(docId, page, match[0])],
          confidence: pattern.confidence,
          extractedAt: Date.now(),
        };

        // Avoid duplicates
        if (!relations.some(r => r.id === relation.id)) {
          relations.push(relation);
        }
      }
    }
  }

  return relations;
}

export function extractClusters(
  relations: Relation[],
  concepts: Concept[]
): PatternCluster[] {
  const clusters: PatternCluster[] = [];
  const usedRelations = new Set<string>();

  const conceptLookup = new Map(concepts.map(c => [c.id, c]));

  for (const clusterPattern of CLUSTER_PATTERNS) {
    // Find relations matching this cluster pattern
    const matchingRelations = relations.filter(
      r => clusterPattern.predicates.includes(r.predicate as RelationPredicate)
        && !usedRelations.has(r.id)
    );

    if (matchingRelations.length < clusterPattern.minRelations) continue;

    // Group by subject concept
    const bySubject = new Map<string, Relation[]>();
    for (const rel of matchingRelations) {
      const group = bySubject.get(rel.subjId) || [];
      group.push(rel);
      bySubject.set(rel.subjId, group);
    }

    // Create clusters
    for (const [subjId, rels] of bySubject) {
      if (rels.length < clusterPattern.minRelations) continue;

      const subjConcept = conceptLookup.get(subjId);
      if (!subjConcept) continue;

      const conceptIds = [subjId, ...rels.map(r => r.objId)];
      const conceptLabels = conceptIds
        .map(id => conceptLookup.get(id)?.label || id)
        .filter(Boolean);

      const cluster: PatternCluster = {
        id: createClusterId(`${subjConcept.label}_${clusterPattern.kind}`),
        title: clusterPattern.titleTemplate(conceptLabels),
        kind: clusterPattern.kind,
        relationIds: rels.map(r => r.id),
        conceptIds,
        refs: rels.flatMap(r => r.evidence),
        confidence: rels.reduce((sum, r) => sum + r.confidence, 0) / rels.length,
      };

      clusters.push(cluster);
      rels.forEach(r => usedRelations.add(r.id));
    }
  }

  return clusters;
}

export function extractDecisionRules(
  text: string,
  relations: Relation[],
  docId: string,
  page: number
): DecisionRule[] {
  const rules: DecisionRule[] = [];

  for (const pattern of DECISION_PATTERNS) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const condition = match[1]?.trim();
      const action = match[2]?.trim();

      if (!condition || !action) continue;
      if (condition.length < 5 || action.length < 5) continue;

      // Find related relations
      const relatedRelations = relations.filter(r =>
        r.evidence.some(e => e.page === page)
      );

      const rule: DecisionRule = {
        id: createRuleId(),
        if: {
          text: condition,
          relationIds: relatedRelations.slice(0, 3).map(r => r.id),
        },
        then: {
          text: action,
        },
        confirm: {
          text: 'Verify with clinical examination',
        },
        refs: [createDocRef(docId, page, match[0])],
        createdBy: 'ai',
        createdAt: Date.now(),
      };

      // Add tags based on content
      const tags: DecisionRule['tags'] = [];
      if (/avoid|never|contraindicated/i.test(match[0])) tags.push('trap');
      if (/first|primary|initial/i.test(match[0])) tags.push('first_line');
      if (tags.length > 0) rule.tags = tags;

      rules.push(rule);
    }
  }

  return rules;
}

// ============================================================================
// Full Extraction Pipeline
// ============================================================================

export function runRelationshipExtraction(
  text: string,
  docId: string,
  pageIndex: number
): ExtractionResult {
  // Step 1: Extract concepts
  const concepts = extractConcepts(text, docId, pageIndex);

  // Step 2: Extract relations (may add more concepts)
  const relations = extractRelations(text, concepts, docId, pageIndex);

  // Step 3: Group into clusters
  const clusters = extractClusters(relations, concepts);

  // Step 4: Extract decision rules
  const rules = extractDecisionRules(text, relations, docId, pageIndex);

  // Calculate overall confidence
  const allConfidences = [
    ...relations.map(r => r.confidence),
    ...clusters.map(c => c.confidence),
  ];
  const avgConfidence = allConfidences.length > 0
    ? allConfidences.reduce((a, b) => a + b, 0) / allConfidences.length
    : 0;

  return {
    docId,
    pageIndex,
    concepts,
    relations,
    clusters,
    rules,
    extractedAt: Date.now(),
    confidence: avgConfidence,
  };
}

// ============================================================================
// Helpers
// ============================================================================

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
