// lib/cognitionPipeline/extractors.ts
// Cognition Pipeline Extractors
// Extracts relationships, patterns, and decision logic from text

import type {
  ExtractedConcept,
  Relationship,
  RelationshipType,
  Pattern,
  PatternType,
  DecisionLogic,
  DecisionLogicType,
  EvidenceSpan,
  ExtractionResult,
  ExtractionConfig,
  ConceptType,
  PatternRole,
} from './types';
import { DEFAULT_EXTRACTION_CONFIG } from './types';

// ============================================================================
// Relationship Detection Patterns
// ============================================================================

interface RelationshipPattern {
  type: RelationshipType;
  patterns: RegExp[];
  strength: 'strong' | 'moderate' | 'weak';
}

const RELATIONSHIP_PATTERNS: RelationshipPattern[] = [
  // Causal
  {
    type: 'causes',
    patterns: [
      /(\w+)\s+(?:causes?|leads?\s+to|results?\s+in|produces?|induces?)\s+(\w+)/gi,
      /(\w+)\s+(?:is\s+the\s+cause\s+of|is\s+responsible\s+for)\s+(\w+)/gi,
    ],
    strength: 'strong',
  },
  {
    type: 'prevents',
    patterns: [
      /(\w+)\s+(?:prevents?|blocks?|stops?|inhibits?)\s+(\w+)/gi,
      /(\w+)\s+(?:is\s+prevented\s+by)\s+(\w+)/gi,
    ],
    strength: 'strong',
  },
  {
    type: 'triggers',
    patterns: [
      /(\w+)\s+(?:triggers?|initiates?|activates?|stimulates?)\s+(\w+)/gi,
    ],
    strength: 'strong',
  },
  {
    type: 'inhibits',
    patterns: [
      /(\w+)\s+(?:inhibits?|suppresses?|decreases?|reduces?)\s+(\w+)/gi,
    ],
    strength: 'moderate',
  },

  // Process
  {
    type: 'precedes',
    patterns: [
      /(\w+)\s+(?:precedes?|comes?\s+before|occurs?\s+before)\s+(\w+)/gi,
    ],
    strength: 'moderate',
  },
  {
    type: 'follows',
    patterns: [
      /(\w+)\s+(?:follows?|comes?\s+after|occurs?\s+after)\s+(\w+)/gi,
    ],
    strength: 'moderate',
  },
  {
    type: 'leads_to',
    patterns: [
      /(\w+)\s+(?:leads?\s+to|→|->)\s+(\w+)/gi,
    ],
    strength: 'moderate',
  },

  // Structural
  {
    type: 'contains',
    patterns: [
      /(\w+)\s+(?:contains?|includes?|comprises?|consists?\s+of)\s+(\w+)/gi,
    ],
    strength: 'moderate',
  },
  {
    type: 'is_part_of',
    patterns: [
      /(\w+)\s+(?:is\s+(?:a\s+)?part\s+of|belongs?\s+to)\s+(\w+)/gi,
    ],
    strength: 'moderate',
  },
  {
    type: 'is_type_of',
    patterns: [
      /(\w+)\s+(?:is\s+a\s+(?:type|kind|form)\s+of)\s+(\w+)/gi,
    ],
    strength: 'strong',
  },
  {
    type: 'located_in',
    patterns: [
      /(\w+)\s+(?:is\s+(?:located|found)\s+in|occurs?\s+in)\s+(\w+)/gi,
    ],
    strength: 'moderate',
  },

  // Functional
  {
    type: 'structure_function',
    patterns: [
      /(\w+)\s+(?:functions?\s+(?:to|as)|serves?\s+(?:to|as)|is\s+responsible\s+for)\s+(\w+)/gi,
    ],
    strength: 'strong',
  },
  {
    type: 'regulates',
    patterns: [
      /(\w+)\s+(?:regulates?|controls?|modulates?|governs?)\s+(\w+)/gi,
    ],
    strength: 'strong',
  },
  {
    type: 'produces',
    patterns: [
      /(\w+)\s+(?:produces?|generates?|creates?|synthesizes?|secretes?)\s+(\w+)/gi,
    ],
    strength: 'strong',
  },
  {
    type: 'requires',
    patterns: [
      /(\w+)\s+(?:requires?|needs?|depends?\s+on)\s+(\w+)/gi,
    ],
    strength: 'moderate',
  },
  {
    type: 'converts_to',
    patterns: [
      /(\w+)\s+(?:converts?\s+to|transforms?\s+(?:into|to)|becomes?)\s+(\w+)/gi,
    ],
    strength: 'strong',
  },

  // Pathological
  {
    type: 'pathology_symptom',
    patterns: [
      /(\w+)\s+(?:presents?\s+with|manifests?\s+as|shows?)\s+(\w+)/gi,
      /(\w+)\s+(?:is\s+characterized\s+by)\s+(\w+)/gi,
    ],
    strength: 'strong',
  },
  {
    type: 'treatment_for',
    patterns: [
      /(\w+)\s+(?:treats?|is\s+used\s+(?:to\s+treat|for))\s+(\w+)/gi,
    ],
    strength: 'strong',
  },
  {
    type: 'risk_factor',
    patterns: [
      /(\w+)\s+(?:is\s+a\s+risk\s+factor\s+for|increases?\s+risk\s+of)\s+(\w+)/gi,
    ],
    strength: 'strong',
  },

  // Comparative
  {
    type: 'similar_to',
    patterns: [
      /(\w+)\s+(?:is\s+similar\s+to|resembles?|is\s+like)\s+(\w+)/gi,
    ],
    strength: 'weak',
  },
  {
    type: 'different_from',
    patterns: [
      /(\w+)\s+(?:differs?\s+from|is\s+different\s+from|unlike)\s+(\w+)/gi,
    ],
    strength: 'weak',
  },
];

// ============================================================================
// Pattern Detection
// ============================================================================

interface PatternTemplate {
  type: PatternType;
  indicators: RegExp[];
  requiredRelationships: RelationshipType[];
}

const PATTERN_TEMPLATES: PatternTemplate[] = [
  {
    type: 'sequential',
    indicators: [
      /step\s*\d+|first|second|third|then|next|finally|lastly/gi,
      /phase\s*\d+|stage\s*\d+/gi,
    ],
    requiredRelationships: ['precedes', 'follows', 'leads_to'],
  },
  {
    type: 'regulatory',
    indicators: [
      /feedback|regulation|homeostasis|balance|equilibrium/gi,
      /negative\s+feedback|positive\s+feedback/gi,
    ],
    requiredRelationships: ['regulates', 'inhibits', 'triggers'],
  },
  {
    type: 'diagnostic',
    indicators: [
      /diagnos|criterion|criteria|presentation|signs?\s+and\s+symptoms/gi,
      /pathognomonic|characteristic|hallmark/gi,
    ],
    requiredRelationships: ['pathology_symptom', 'causes'],
  },
  {
    type: 'pathological',
    indicators: [
      /disease|disorder|syndrome|pathology|dysfunction/gi,
      /abnormal|impaired|deficient|excess/gi,
    ],
    requiredRelationships: ['causes', 'pathology_symptom', 'risk_factor'],
  },
  {
    type: 'functional',
    indicators: [
      /function|role|purpose|mechanism|pathway/gi,
    ],
    requiredRelationships: ['structure_function', 'produces', 'regulates'],
  },
  {
    type: 'cyclical',
    indicators: [
      /cycle|loop|recurring|periodic|circadian/gi,
    ],
    requiredRelationships: ['leads_to', 'triggers', 'follows'],
  },
  {
    type: 'hierarchical',
    indicators: [
      /classif|categor|type|subtype|group|division/gi,
    ],
    requiredRelationships: ['is_type_of', 'contains', 'is_part_of'],
  },
];

// ============================================================================
// Decision Logic Detection
// ============================================================================

interface DecisionPattern {
  type: DecisionLogicType;
  patterns: RegExp[];
  actionType: 'assess' | 'treat' | 'monitor' | 'refer' | 'avoid' | 'consider' | 'conclude';
}

const DECISION_PATTERNS: DecisionPattern[] = [
  {
    type: 'clinical_implication',
    patterns: [
      /if\s+(.+?),?\s+(?:then\s+)?(?:consider|assess|evaluate|check)\s+(.+)/gi,
      /when\s+(.+?),?\s+(?:it\s+is\s+important\s+to|you\s+should)\s+(.+)/gi,
    ],
    actionType: 'assess',
  },
  {
    type: 'treatment_choice',
    patterns: [
      /(?:treatment|therapy|management)\s+(?:of\s+choice|for)\s+(.+?)\s+(?:is|includes?)\s+(.+)/gi,
      /(.+?)\s+(?:is\s+treated\s+with|responds?\s+to)\s+(.+)/gi,
    ],
    actionType: 'treat',
  },
  {
    type: 'contraindication',
    patterns: [
      /(.+?)\s+(?:is\s+)?contraindicated\s+(?:in|for|with)\s+(.+)/gi,
      /avoid\s+(.+?)\s+(?:in|when|if)\s+(.+)/gi,
    ],
    actionType: 'avoid',
  },
  {
    type: 'diagnostic_criterion',
    patterns: [
      /(?:diagnosis|diagnose)\s+(.+?)\s+(?:when|if|requires?)\s+(.+)/gi,
      /(.+?)\s+(?:is\s+diagnostic\s+of|indicates?)\s+(.+)/gi,
    ],
    actionType: 'conclude',
  },
  {
    type: 'risk_indicator',
    patterns: [
      /(.+?)\s+(?:increases?\s+risk|is\s+a\s+risk\s+factor)\s+(?:of|for)\s+(.+)/gi,
      /risk\s+of\s+(.+?)\s+(?:is\s+increased\s+by|with)\s+(.+)/gi,
    ],
    actionType: 'monitor',
  },
  {
    type: 'conditional_reasoning',
    patterns: [
      /if\s+(.+?),?\s+then\s+(.+)/gi,
      /when\s+(.+?),?\s+(.+?)\s+(?:will|occurs?|happens?)/gi,
    ],
    actionType: 'consider',
  },
];

// ============================================================================
// Concept Extraction
// ============================================================================

const CONCEPT_INDICATORS: { type: ConceptType; patterns: RegExp[] }[] = [
  {
    type: 'process',
    patterns: [
      /\b(\w+(?:tion|sion|sis|ment|ing))\b/g, // Process suffixes
      /\b(metabolism|synthesis|degradation|transport|signaling)\b/gi,
    ],
  },
  {
    type: 'entity',
    patterns: [
      /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g, // Proper nouns
      /\b(\w+(?:ase|ose|ide|ate|in|ol))\b/g, // Chemical suffixes
    ],
  },
  {
    type: 'principle',
    patterns: [
      /\b(\w+(?:'s)?\s+(?:law|principle|rule|theory|hypothesis))\b/gi,
    ],
  },
  {
    type: 'state',
    patterns: [
      /\b(normal|abnormal|elevated|decreased|deficient|excess|impaired)\b/gi,
    ],
  },
  {
    type: 'measurement',
    patterns: [
      /\b(\d+(?:\.\d+)?\s*(?:mg|ml|mmol|mEq|%|mmHg|°C|°F))\b/gi,
    ],
  },
];

// ============================================================================
// Main Extraction Functions
// ============================================================================

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function createEvidenceSpan(
  text: string,
  pageIndex: number,
  paragraphIndex: number,
  match: RegExpExecArray
): EvidenceSpan {
  return {
    pageIndex,
    paragraphIndex,
    charStart: match.index,
    charEnd: match.index + match[0].length,
    rawText: match[0],
    snippetHash: generateSnippetHash(match[0]),
  };
}

function generateSnippetHash(text: string): string {
  const snippet = text.slice(0, 50);
  let hash = 2166136261;
  for (let i = 0; i < snippet.length; i++) {
    hash ^= snippet.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Extract concepts from text
 */
export function extractConcepts(
  text: string,
  pageIndex: number,
  paragraphIndex: number
): ExtractedConcept[] {
  const concepts: ExtractedConcept[] = [];
  const seenConcepts = new Set<string>();

  for (const indicator of CONCEPT_INDICATORS) {
    for (const pattern of indicator.patterns) {
      let match;
      const regex = new RegExp(pattern.source, pattern.flags);

      while ((match = regex.exec(text)) !== null) {
        const conceptText = match[1] || match[0];
        const normalized = conceptText.toLowerCase().trim();

        // Skip if already seen or too short
        if (seenConcepts.has(normalized) || normalized.length < 3) continue;
        seenConcepts.add(normalized);

        concepts.push({
          id: generateId(),
          concept: conceptText.trim(),
          type: indicator.type,
          relationships: [],
          evidenceSpan: createEvidenceSpan(text, pageIndex, paragraphIndex, match),
          confidence: 0.7,
          priority: 'medium',
          tags: [],
        });
      }
    }
  }

  return concepts.slice(0, 30); // Limit per paragraph
}

/**
 * Extract relationships from text
 */
export function extractRelationships(
  text: string,
  pageIndex: number,
  paragraphIndex: number,
  conceptMap: Map<string, string> // concept text -> concept ID
): Relationship[] {
  const relationships: Relationship[] = [];

  for (const relPattern of RELATIONSHIP_PATTERNS) {
    for (const pattern of relPattern.patterns) {
      let match;
      const regex = new RegExp(pattern.source, pattern.flags);

      while ((match = regex.exec(text)) !== null) {
        const source = match[1]?.trim().toLowerCase();
        const target = match[2]?.trim().toLowerCase();

        if (!source || !target) continue;

        // Try to find matching concepts
        const sourceId = conceptMap.get(source) || `temp_${generateId()}`;
        const targetId = conceptMap.get(target) || `temp_${generateId()}`;

        relationships.push({
          id: generateId(),
          type: relPattern.type,
          sourceConceptId: sourceId,
          targetConceptId: targetId,
          strength: relPattern.strength,
          direction: 'unidirectional',
          evidence: [createEvidenceSpan(text, pageIndex, paragraphIndex, match)],
          confidence: 0.75,
        });
      }
    }
  }

  return relationships;
}

/**
 * Detect patterns from relationships
 */
export function detectPatterns(
  relationships: Relationship[],
  text: string,
  pageIndex: number
): Pattern[] {
  const patterns: Pattern[] = [];

  for (const template of PATTERN_TEMPLATES) {
    // Check if text contains pattern indicators
    const hasIndicators = template.indicators.some((pattern) => pattern.test(text));
    if (!hasIndicators) continue;

    // Check if we have required relationship types
    const relTypes = new Set(relationships.map((r) => r.type));
    const hasRequiredRels = template.requiredRelationships.some((rt) => relTypes.has(rt));

    if (!hasRequiredRels && relationships.length < 2) continue;

    // Find relationships that match this pattern
    const matchingRels = relationships.filter((r) =>
      template.requiredRelationships.includes(r.type)
    );

    if (matchingRels.length === 0) continue;

    // Create pattern
    const conceptIds = new Set<string>();
    matchingRels.forEach((r) => {
      conceptIds.add(r.sourceConceptId);
      conceptIds.add(r.targetConceptId);
    });

    patterns.push({
      id: generateId(),
      type: template.type,
      title: `${template.type.charAt(0).toUpperCase() + template.type.slice(1)} Pattern`,
      description: `Detected ${template.type} pattern involving ${conceptIds.size} concepts`,
      components: Array.from(conceptIds).map((id) => ({
        conceptId: id,
        role: 'participant' as PatternRole,
        required: true,
      })),
      relationships: matchingRels.map((r) => r.id),
      behaviorSummary: `${template.type} behavior detected`,
      confidence: 0.65,
      evidence: matchingRels.flatMap((r) => r.evidence),
    });
  }

  return patterns;
}

/**
 * Extract decision logic from text
 */
export function extractDecisionLogic(
  text: string,
  pageIndex: number,
  paragraphIndex: number,
  conceptMap: Map<string, string>
): DecisionLogic[] {
  const decisions: DecisionLogic[] = [];

  for (const decisionPattern of DECISION_PATTERNS) {
    for (const pattern of decisionPattern.patterns) {
      let match;
      const regex = new RegExp(pattern.source, pattern.flags);

      while ((match = regex.exec(text)) !== null) {
        const condition = match[1]?.trim();
        const implication = match[2]?.trim();

        if (!condition || !implication) continue;

        // Find concept references
        const conceptRefs: string[] = [];
        conceptMap.forEach((id, text) => {
          if (condition.toLowerCase().includes(text) || implication.toLowerCase().includes(text)) {
            conceptRefs.push(id);
          }
        });

        decisions.push({
          id: generateId(),
          conceptId: conceptRefs[0] || '',
          logicType: decisionPattern.type,
          condition: {
            ifStatement: condition,
            conceptRefs,
          },
          implication: {
            thenStatement: implication,
            actionType: decisionPattern.actionType,
          },
          priority: decisionPattern.type === 'contraindication' ? 'critical' : 'moderate',
          evidence: [createEvidenceSpan(text, pageIndex, paragraphIndex, match)],
          confidence: 0.7,
        });
      }
    }
  }

  return decisions;
}

/**
 * Main extraction pipeline
 */
export function runExtractionPipeline(
  text: string,
  pageIndex: number,
  documentId: string,
  config: ExtractionConfig = DEFAULT_EXTRACTION_CONFIG
): ExtractionResult {
  // Split into paragraphs
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 20);

  // Collect all extractions
  let allConcepts: ExtractedConcept[] = [];
  let allRelationships: Relationship[] = [];
  let allPatterns: Pattern[] = [];
  let allDecisionLogics: DecisionLogic[] = [];

  paragraphs.forEach((paragraph, paragraphIndex) => {
    // Layer 1: Extract concepts
    if (config.extractConcepts) {
      const concepts = extractConcepts(paragraph, pageIndex, paragraphIndex);
      allConcepts.push(...concepts);
    }

    // Build concept map for relationship extraction
    const conceptMap = new Map<string, string>();
    allConcepts.forEach((c) => {
      conceptMap.set(c.concept.toLowerCase(), c.id);
    });

    // Layer 2: Extract relationships
    if (config.extractRelationships) {
      const relationships = extractRelationships(paragraph, pageIndex, paragraphIndex, conceptMap);
      allRelationships.push(...relationships);
    }

    // Layer 3: Detect patterns
    if (config.extractPatterns) {
      const patterns = detectPatterns(allRelationships, paragraph, pageIndex);
      allPatterns.push(...patterns);
    }

    // Layer 4: Extract decision logic
    if (config.extractDecisionLogic) {
      const decisions = extractDecisionLogic(paragraph, pageIndex, paragraphIndex, conceptMap);
      allDecisionLogics.push(...decisions);
    }
  });

  // Update concept relationships
  allRelationships.forEach((rel) => {
    const sourceConcept = allConcepts.find((c) => c.id === rel.sourceConceptId);
    const targetConcept = allConcepts.find((c) => c.id === rel.targetConceptId);

    if (sourceConcept) {
      sourceConcept.relationships.push({ relationshipId: rel.id, role: 'source' });
    }
    if (targetConcept) {
      targetConcept.relationships.push({ relationshipId: rel.id, role: 'target' });
    }
  });

  // Calculate priority based on relationships and patterns
  allConcepts.forEach((concept) => {
    const relCount = concept.relationships.length;
    const inPattern = allPatterns.some((p) =>
      p.components.some((c) => c.conceptId === concept.id)
    );
    const hasDecision = allDecisionLogics.some((d) => d.conceptId === concept.id);

    if (relCount >= 3 || hasDecision) {
      concept.priority = 'high';
    } else if (relCount >= 1 || inPattern) {
      concept.priority = 'medium';
    } else {
      concept.priority = 'low';
    }
  });

  // Apply filters
  if (config.minConfidence > 0) {
    allConcepts = allConcepts.filter((c) => c.confidence >= config.minConfidence);
    allRelationships = allRelationships.filter((r) => r.confidence >= config.minConfidence);
    allPatterns = allPatterns.filter((p) => p.confidence >= config.minConfidence);
    allDecisionLogics = allDecisionLogics.filter((d) => d.confidence >= config.minConfidence);
  }

  // Limit results
  allConcepts = allConcepts.slice(0, config.maxConceptsPerPage);
  allRelationships = allRelationships.slice(0, config.maxRelationshipsPerPage);

  // Calculate stats
  const highPriorityCount =
    allConcepts.filter((c) => c.priority === 'high').length +
    allDecisionLogics.filter((d) => d.priority === 'critical' || d.priority === 'high').length;

  const totalItems =
    allConcepts.length + allRelationships.length + allPatterns.length + allDecisionLogics.length;

  const avgConfidence =
    totalItems > 0
      ? ([...allConcepts, ...allRelationships, ...allPatterns, ...allDecisionLogics].reduce(
          (sum, item) => sum + item.confidence,
          0
        ) / totalItems)
      : 0;

  return {
    documentId,
    pageIndex,
    timestamp: Date.now(),
    concepts: allConcepts,
    relationships: allRelationships,
    patterns: allPatterns,
    decisionLogics: allDecisionLogics,
    stats: {
      conceptCount: allConcepts.length,
      relationshipCount: allRelationships.length,
      patternCount: allPatterns.length,
      decisionLogicCount: allDecisionLogics.length,
      highPriorityCount,
      confidenceAvg: avgConfidence,
    },
    quality: {
      completeness: Math.min(1, totalItems / 20),
      coherence: allRelationships.length > 0 ? 0.7 : 0.3,
      confidence: avgConfidence,
    },
  };
}
