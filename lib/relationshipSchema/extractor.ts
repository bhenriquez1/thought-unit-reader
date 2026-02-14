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
  // ============================================================================
  // Causal patterns (cause → effect)
  // ============================================================================
  {
    predicate: 'causes',
    patterns: [
      /(\w+(?:\s+\w+){0,3})\s+(?:causes?|leads?\s+to|results?\s+in|produces?|induces?)\s+(\w+(?:\s+\w+){0,3})/gi,
      /(\w+(?:\s+\w+){0,3})\s+→\s+(\w+(?:\s+\w+){0,3})/gi,
      /(\w+(?:\s+\w+){0,3})\s+(?:is\s+responsible\s+for|contributes?\s+to)\s+(\w+(?:\s+\w+){0,3})/gi,
      /(?:due\s+to|because\s+of)\s+(\w+(?:\s+\w+){0,3}).*?(\w+(?:\s+\w+){0,3})\s+(?:occurs?|happens?|develops?)/gi,
    ],
    confidence: 0.85,
  },
  {
    predicate: 'prevents',
    patterns: [
      /(\w+(?:\s+\w+){0,3})\s+(?:prevents?|inhibits?|blocks?|stops?|reduces?)\s+(\w+(?:\s+\w+){0,3})/gi,
      /(\w+(?:\s+\w+){0,3})\s+(?:protects?\s+against|guards?\s+against)\s+(\w+(?:\s+\w+){0,3})/gi,
    ],
    confidence: 0.85,
  },
  {
    predicate: 'triggers',
    patterns: [
      /(\w+(?:\s+\w+){0,3})\s+(?:triggers?|initiates?|starts?|activates?|stimulates?)\s+(\w+(?:\s+\w+){0,3})/gi,
    ],
    confidence: 0.80,
  },

  // ============================================================================
  // Process patterns (step → outcome)
  // ============================================================================
  {
    predicate: 'differentiate_into',
    patterns: [
      /(\w+(?:\s+\w+){0,3})\s+(?:differentiate(?:s)?|transform(?:s)?|develop(?:s)?|mature(?:s)?|evolve(?:s)?)\s+into\s+(\w+(?:\s+\w+){0,3})/gi,
      /(\w+(?:\s+\w+){0,3})\s+(?:become(?:s)?|turn(?:s)?|convert(?:s)?)\s+(?:into\s+)?(\w+(?:\s+\w+){0,3})/gi,
    ],
    confidence: 0.90,
  },
  {
    predicate: 'produces',
    patterns: [
      /(\w+(?:\s+\w+){0,3})\s+(?:produces?|generates?|creates?|synthesizes?|secretes?|releases?|forms?)\s+(\w+(?:\s+\w+){0,3})/gi,
    ],
    confidence: 0.85,
  },
  {
    predicate: 'precedes',
    patterns: [
      /(\w+(?:\s+\w+){0,3})\s+(?:precedes?|comes?\s+before|occurs?\s+before|leads?\s+to)\s+(\w+(?:\s+\w+){0,3})/gi,
      /(?:first|initially)\s+(\w+(?:\s+\w+){0,3}).*?(?:then|followed\s+by)\s+(\w+(?:\s+\w+){0,3})/gi,
    ],
    confidence: 0.80,
  },
  {
    predicate: 'follows',
    patterns: [
      /(\w+(?:\s+\w+){0,3})\s+(?:follows?|comes?\s+after|occurs?\s+after)\s+(\w+(?:\s+\w+){0,3})/gi,
      /(?:after|following)\s+(\w+(?:\s+\w+){0,3}).*?(\w+(?:\s+\w+){0,3})\s+(?:occurs?|happens?|begins?)/gi,
    ],
    confidence: 0.80,
  },

  // ============================================================================
  // Diagnostic patterns (finding → diagnosis)
  // ============================================================================
  {
    predicate: 'suggests',
    patterns: [
      /(\w+(?:\s+\w+){0,3})\s+(?:suggests?|indicates?|implies?|points?\s+to|is\s+characteristic\s+of)\s+(\w+(?:\s+\w+){0,3})/gi,
      /presence\s+of\s+(\w+(?:\s+\w+){0,3})\s+(?:suggests?|indicates?|is\s+seen\s+in)\s+(\w+(?:\s+\w+){0,3})/gi,
      /(\w+(?:\s+\w+){0,3})\s+(?:is\s+)?(?:a\s+)?(?:sign|symptom|feature|marker)\s+of\s+(\w+(?:\s+\w+){0,3})/gi,
    ],
    subjType: ['finding'],
    confidence: 0.80,
  },
  {
    predicate: 'rules_out',
    patterns: [
      /(\w+(?:\s+\w+){0,3})\s+(?:rules?\s+out|excludes?|eliminates?|makes?\s+unlikely)\s+(\w+(?:\s+\w+){0,3})/gi,
      /absence\s+of\s+(\w+(?:\s+\w+){0,3})\s+(?:rules?\s+out|excludes?|argues?\s+against)\s+(\w+(?:\s+\w+){0,3})/gi,
      /(?:negative|normal)\s+(\w+(?:\s+\w+){0,3})\s+(?:rules?\s+out|excludes?)\s+(\w+(?:\s+\w+){0,3})/gi,
    ],
    confidence: 0.85,
  },
  {
    predicate: 'confirms',
    patterns: [
      /(\w+(?:\s+\w+){0,3})\s+(?:confirms?|verifies?|establishes?|proves?)\s+(?:the\s+)?(?:diagnosis\s+of\s+)?(\w+(?:\s+\w+){0,3})/gi,
      /(?:positive|abnormal)\s+(\w+(?:\s+\w+){0,3})\s+(?:confirms?|indicates?)\s+(\w+(?:\s+\w+){0,3})/gi,
    ],
    confidence: 0.85,
  },
  {
    predicate: 'associated_with',
    patterns: [
      /(\w+(?:\s+\w+){0,3})\s+(?:is\s+)?associated\s+with\s+(\w+(?:\s+\w+){0,3})/gi,
      /(\w+(?:\s+\w+){0,3})\s+(?:is\s+)?(?:commonly\s+)?(?:seen|found|observed)\s+(?:in|with)\s+(\w+(?:\s+\w+){0,3})/gi,
      /(\w+(?:\s+\w+){0,3})\s+(?:is\s+)?linked\s+to\s+(\w+(?:\s+\w+){0,3})/gi,
    ],
    confidence: 0.75,
  },

  // ============================================================================
  // Structural patterns (part → whole)
  // ============================================================================
  {
    predicate: 'part_of',
    patterns: [
      /(\w+(?:\s+\w+){0,3})\s+(?:is\s+)?(?:a\s+)?part\s+of\s+(\w+(?:\s+\w+){0,3})/gi,
      /(\w+(?:\s+\w+){0,3})\s+(?:is\s+)?(?:a\s+)?component\s+of\s+(\w+(?:\s+\w+){0,3})/gi,
      /(\w+(?:\s+\w+){0,3})\s+(?:belongs?\s+to|is\s+included\s+in)\s+(\w+(?:\s+\w+){0,3})/gi,
    ],
    confidence: 0.90,
  },
  {
    predicate: 'contains',
    patterns: [
      /(\w+(?:\s+\w+){0,3})\s+(?:contains?|includes?|comprises?|consists?\s+of)\s+(\w+(?:\s+\w+){0,3})/gi,
      /(\w+(?:\s+\w+){0,3})\s+(?:is\s+)?(?:made\s+up\s+of|composed\s+of)\s+(\w+(?:\s+\w+){0,3})/gi,
    ],
    confidence: 0.85,
  },
  {
    predicate: 'located_in',
    patterns: [
      /(\w+(?:\s+\w+){0,3})\s+(?:is\s+)?(?:located|found|present|situated)\s+in\s+(\w+(?:\s+\w+){0,3})/gi,
      /(\w+(?:\s+\w+){0,3})\s+(?:resides?|exists?|occurs?)\s+in\s+(\w+(?:\s+\w+){0,3})/gi,
    ],
    confidence: 0.85,
  },

  // ============================================================================
  // Clinical patterns (treatment → condition)
  // ============================================================================
  {
    predicate: 'treats',
    patterns: [
      /(\w+(?:\s+\w+){0,3})\s+(?:treats?|is\s+used\s+(?:to\s+)?treat|manages?|alleviates?)\s+(\w+(?:\s+\w+){0,3})/gi,
      /(\w+(?:\s+\w+){0,3})\s+(?:is\s+)?(?:effective|indicated)\s+(?:for|in)\s+(\w+(?:\s+\w+){0,3})/gi,
      /(?:treatment\s+(?:of|for)|therapy\s+for)\s+(\w+(?:\s+\w+){0,3})\s+(?:includes?|involves?)\s+(\w+(?:\s+\w+){0,3})/gi,
    ],
    subjType: ['tool'],
    objType: ['finding', 'process'],
    confidence: 0.85,
  },
  {
    predicate: 'contraindicates',
    patterns: [
      /(\w+(?:\s+\w+){0,3})\s+(?:is\s+)?contraindicated\s+(?:in|for|with)\s+(\w+(?:\s+\w+){0,3})/gi,
      /(?:do\s+not|avoid|never)\s+(?:use\s+)?(\w+(?:\s+\w+){0,3})\s+(?:in|with|for)\s+(\w+(?:\s+\w+){0,3})/gi,
      /(\w+(?:\s+\w+){0,3})\s+(?:should\s+be\s+avoided|is\s+dangerous)\s+(?:in|with)\s+(\w+(?:\s+\w+){0,3})/gi,
    ],
    confidence: 0.90,
  },

  // ============================================================================
  // Functional patterns (structure → function)
  // ============================================================================
  {
    predicate: 'functions_as',
    patterns: [
      /(\w+(?:\s+\w+){0,3})\s+(?:functions?\s+as|acts?\s+as|serves?\s+as|works?\s+as)\s+(\w+(?:\s+\w+){0,3})/gi,
      /(\w+(?:\s+\w+){0,3})\s+(?:is\s+responsible\s+for|plays?\s+(?:a\s+)?role\s+in)\s+(\w+(?:\s+\w+){0,3})/gi,
    ],
    confidence: 0.80,
  },
  {
    predicate: 'regulates',
    patterns: [
      /(\w+(?:\s+\w+){0,3})\s+(?:regulates?|controls?|modulates?|influences?)\s+(\w+(?:\s+\w+){0,3})/gi,
      /(\w+(?:\s+\w+){0,3})\s+(?:affects?|impacts?|alters?)\s+(\w+(?:\s+\w+){0,3})/gi,
    ],
    confidence: 0.80,
  },

  // ============================================================================
  // Comparison patterns (A vs B)
  // ============================================================================
  {
    predicate: 'differs_from',
    patterns: [
      /(\w+(?:\s+\w+){0,3})\s+(?:differs?\s+from|is\s+different\s+from|unlike)\s+(\w+(?:\s+\w+){0,3})/gi,
      /(\w+(?:\s+\w+){0,3})\s+(?:vs\.?|versus|compared\s+to)\s+(\w+(?:\s+\w+){0,3})/gi,
    ],
    confidence: 0.75,
  },
  {
    predicate: 'similar_to',
    patterns: [
      /(\w+(?:\s+\w+){0,3})\s+(?:is\s+similar\s+to|resembles?|is\s+like)\s+(\w+(?:\s+\w+){0,3})/gi,
    ],
    confidence: 0.75,
  },

  // ============================================================================
  // Definition patterns (term = meaning)
  // ============================================================================
  {
    predicate: 'defined_as',
    patterns: [
      /(\w+(?:\s+\w+){0,3})\s+(?:is\s+defined\s+as|refers?\s+to|means?)\s+(\w+(?:\s+\w+){0,3})/gi,
      /(\w+(?:\s+\w+){0,3}):\s+(\w+(?:\s+\w+){0,3})/gi,
    ],
    confidence: 0.85,
  },

  // ============================================================================
  // Requirement patterns (condition → necessity)
  // ============================================================================
  {
    predicate: 'requires',
    patterns: [
      /(\w+(?:\s+\w+){0,3})\s+(?:requires?|needs?|depends?\s+on|necessitates?)\s+(\w+(?:\s+\w+){0,3})/gi,
      /(\w+(?:\s+\w+){0,3})\s+(?:is\s+)?(?:essential|necessary|required)\s+for\s+(\w+(?:\s+\w+){0,3})/gi,
    ],
    confidence: 0.80,
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
    predicates: ['differentiate_into', 'transforms_into', 'produces', 'precedes', 'follows', 'regulates', 'functions_as'],
    minRelations: 1, // Lower threshold for better detection
    titleTemplate: (concepts) => `${concepts[0]} process pathway`,
  },
  {
    kind: 'causal',
    predicates: ['causes', 'triggers', 'activates', 'inhibits', 'prevents', 'requires'],
    minRelations: 1, // Lower threshold for better detection
    titleTemplate: (concepts) => `${concepts[0]} causal chain`,
  },
  {
    kind: 'diagnostic',
    predicates: ['suggests', 'indicates', 'rules_out', 'confirms', 'associated_with', 'defined_as'],
    minRelations: 1, // Lower threshold for better detection
    titleTemplate: (concepts) => `${concepts[0]} diagnostic pathway`,
  },
  {
    kind: 'risk',
    predicates: ['contraindicates', 'complicates', 'causes', 'prevents'],
    minRelations: 1,
    titleTemplate: (concepts) => `${concepts[0]} risk pattern`,
  },
  {
    kind: 'exception',
    predicates: ['differs_from', 'contraindicates', 'rules_out'],
    minRelations: 1,
    titleTemplate: (concepts) => `${concepts[0]} exception`,
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
