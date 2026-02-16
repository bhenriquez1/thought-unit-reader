// lib/engines/reasoningFlowEngine.ts
// Clinical reasoning flow detection MVP
// Builds a simple graph model from extracted text
// Detects missing common nodes for context

import type {
  DocID,
  PageIndex,
  ChapterID,
  ReasoningFlow,
  RelationNode,
  RelationEdge,
  RelationNodeType,
  RelationEdgeType,
  EvidenceRef,
  ExtractionMode,
  PageExtractionResult,
  ChapterExtractionResult,
} from './types';
import { putDocCache, getDocCache } from '../storage/indexedDB';

// ============================================================================
// Edge Detection Patterns
// ============================================================================

interface EdgePattern {
  type: RelationEdgeType;
  patterns: RegExp[];
}

const EDGE_PATTERNS: EdgePattern[] = [
  {
    type: 'CAUSES',
    patterns: [
      /([^,]+)\s+(?:causes|leads to|results in|produces)\s+([^,.]+)/gi,
      /([^,]+)\s+→\s+([^,.]+)/gi,
      /(?:due to|because of)\s+([^,]+),?\s+([^,.]+)/gi,
    ],
  },
  {
    type: 'ASSOCIATED_WITH',
    patterns: [
      /([^,]+)\s+(?:is associated with|correlates with|linked to)\s+([^,.]+)/gi,
      /([^,]+)\s+(?:and|along with)\s+([^,]+)\s+(?:occur|present|seen)/gi,
    ],
  },
  {
    type: 'DIAGNOSED_BY',
    patterns: [
      /([^,]+)\s+(?:is diagnosed by|confirmed by|identified by)\s+([^,.]+)/gi,
      /(?:diagnosis of)\s+([^,]+)\s+(?:requires|uses|involves)\s+([^,.]+)/gi,
      /([^,]+)\s+(?:shows|reveals|demonstrates)\s+([^,.]+)/gi,
    ],
  },
  {
    type: 'TREATED_WITH',
    patterns: [
      /([^,]+)\s+(?:is treated with|managed with|requires)\s+([^,.]+)/gi,
      /(?:treatment of|therapy for)\s+([^,]+)\s+(?:includes|involves|is)\s+([^,.]+)/gi,
      /(?:first-line|drug of choice|gold standard)\s+for\s+([^,]+)\s+is\s+([^,.]+)/gi,
    ],
  },
  {
    type: 'CONTRAINDICATED',
    patterns: [
      /([^,]+)\s+(?:is contraindicated in|should not be used in|avoid in)\s+([^,.]+)/gi,
      /(?:contraindication|avoid)\s+([^,]+)\s+(?:in|with|when)\s+([^,.]+)/gi,
    ],
  },
  {
    type: 'LEADS_TO',
    patterns: [
      /([^,]+)\s+(?:can lead to|may cause|progresses to)\s+([^,.]+)/gi,
      /(?:complication of|consequence of)\s+([^,]+)\s+(?:is|includes)\s+([^,.]+)/gi,
    ],
  },
  {
    type: 'RISK_FOR',
    patterns: [
      /([^,]+)\s+(?:is a risk factor for|increases risk of|predisposes to)\s+([^,.]+)/gi,
      /(?:risk of)\s+([^,]+)\s+(?:with|in|due to)\s+([^,.]+)/gi,
    ],
  },
  {
    type: 'EXCEPTION_TO',
    patterns: [
      /(?:except|however|but not)\s+([^,]+)\s+(?:in|when|with)\s+([^,.]+)/gi,
      /([^,]+)\s+(?:is an exception to|differs from)\s+([^,.]+)/gi,
    ],
  },
];

// ============================================================================
// Node Type Detection
// ============================================================================

interface NodeTypePattern {
  type: RelationNodeType;
  indicators: string[];
}

const NODE_TYPE_PATTERNS: NodeTypePattern[] = [
  {
    type: 'SYMPTOM',
    indicators: ['pain', 'fever', 'fatigue', 'nausea', 'weakness', 'symptom', 'complaint'],
  },
  {
    type: 'FINDING',
    indicators: ['finding', 'sign', 'present', 'observe', 'elevated', 'decreased', 'abnormal'],
  },
  {
    type: 'TEST',
    indicators: ['test', 'assay', 'measurement', 'imaging', 'biopsy', 'culture', 'level'],
  },
  {
    type: 'DIAGNOSIS',
    indicators: ['diagnosis', 'disease', 'syndrome', 'disorder', 'condition', 'pathology'],
  },
  {
    type: 'TREATMENT',
    indicators: ['treatment', 'therapy', 'medication', 'drug', 'surgery', 'intervention'],
  },
  {
    type: 'RISK',
    indicators: ['risk', 'factor', 'predispose', 'susceptible', 'vulnerable'],
  },
  {
    type: 'EXCEPTION',
    indicators: ['exception', 'contraindicated', 'avoid', 'unless', 'except'],
  },
];

function inferNodeType(label: string): RelationNodeType {
  const lower = label.toLowerCase();

  for (const pattern of NODE_TYPE_PATTERNS) {
    if (pattern.indicators.some(ind => lower.includes(ind))) {
      return pattern.type;
    }
  }

  return 'CONCEPT';
}

// ============================================================================
// Build Reasoning Flow from Extraction
// ============================================================================

export async function buildReasoningFlow(
  extraction: PageExtractionResult | ChapterExtractionResult
): Promise<ReasoningFlow> {
  const { docId, text, evidence } = extraction;

  const scope = extraction.mode === 'PAGE'
    ? { mode: 'PAGE' as ExtractionMode, pageIndex: (extraction as PageExtractionResult).pageIndex }
    : { mode: 'CHAPTER' as ExtractionMode, chapterId: (extraction as ChapterExtractionResult).chapterId };

  // Check cache
  const cacheKey = `reasoning:${scope.pageIndex ?? scope.chapterId}`;
  const cached = await getDocCache<ReasoningFlow>(cacheKey);
  if (cached) {
    return cached;
  }

  // Extract nodes and edges
  const nodes: Map<string, RelationNode> = new Map();
  const edges: RelationEdge[] = [];

  // Process each edge pattern
  for (const edgePattern of EDGE_PATTERNS) {
    for (const regex of edgePattern.patterns) {
      regex.lastIndex = 0;
      let match;

      while ((match = regex.exec(text)) !== null) {
        const subject = match[1]?.trim();
        const object = match[2]?.trim();

        if (!subject || !object || subject.length < 3 || object.length < 3) {
          continue;
        }

        // Create or get nodes
        const subjId = normalizeNodeId(subject);
        const objId = normalizeNodeId(object);

        if (!nodes.has(subjId)) {
          nodes.set(subjId, {
            id: subjId,
            type: inferNodeType(subject),
            label: subject.slice(0, 50),
          });
        }

        if (!nodes.has(objId)) {
          nodes.set(objId, {
            id: objId,
            type: inferNodeType(object),
            label: object.slice(0, 50),
          });
        }

        // Create edge
        const edgeId = `edge_${edges.length}_${Date.now()}`;
        edges.push({
          id: edgeId,
          from: subjId,
          to: objId,
          type: edgePattern.type,
          evidence: [{
            docId,
            pageIndex: scope.pageIndex,
            chapterId: scope.chapterId,
            snippet: match[0].slice(0, 100),
          }],
          confidence: 0.7,
        });
      }
    }
  }

  // Detect missing nodes
  const missingNodeSuggestions = detectMissingNodes(Array.from(nodes.values()), edges);

  const result: ReasoningFlow = {
    docId,
    scope,
    nodes: Array.from(nodes.values()),
    edges,
    missingNodeSuggestions,
  };

  // Cache result
  await putDocCache(cacheKey, result);

  return result;
}

function normalizeNodeId(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .slice(0, 30);
}

// ============================================================================
// Missing Node Detection
// ============================================================================

const EXPECTED_STRUCTURE: Record<RelationNodeType, RelationNodeType[]> = {
  CONCEPT: ['SYMPTOM', 'FINDING', 'DIAGNOSIS'],
  SYMPTOM: ['FINDING', 'TEST', 'DIAGNOSIS'],
  FINDING: ['TEST', 'DIAGNOSIS', 'TREATMENT'],
  TEST: ['DIAGNOSIS', 'FINDING'],
  DIAGNOSIS: ['TREATMENT', 'RISK', 'EXCEPTION'],
  TREATMENT: ['RISK', 'EXCEPTION', 'DIAGNOSIS'],
  RISK: ['TREATMENT', 'EXCEPTION'],
  EXCEPTION: ['TREATMENT', 'DIAGNOSIS'],
};

function detectMissingNodes(nodes: RelationNode[], edges: RelationEdge[]): string[] {
  const suggestions: string[] = [];

  // Get present node types
  const presentTypes = new Set(nodes.map(n => n.type));

  // Get edge targets by type
  const edgesBySourceType = new Map<RelationNodeType, Set<RelationNodeType>>();

  for (const edge of edges) {
    const sourceNode = nodes.find(n => n.id === edge.from);
    const targetNode = nodes.find(n => n.id === edge.to);

    if (sourceNode && targetNode) {
      if (!edgesBySourceType.has(sourceNode.type)) {
        edgesBySourceType.set(sourceNode.type, new Set());
      }
      edgesBySourceType.get(sourceNode.type)!.add(targetNode.type);
    }
  }

  // Check for missing expected relationships
  for (const [sourceType, targetTypes] of Object.entries(EXPECTED_STRUCTURE)) {
    if (presentTypes.has(sourceType as RelationNodeType)) {
      const actualTargets = edgesBySourceType.get(sourceType as RelationNodeType) || new Set();

      for (const expectedTarget of targetTypes) {
        if (!presentTypes.has(expectedTarget) && !actualTargets.has(expectedTarget)) {
          const suggestion = generateMissingSuggestion(sourceType as RelationNodeType, expectedTarget);
          if (!suggestions.includes(suggestion)) {
            suggestions.push(suggestion);
          }
        }
      }
    }
  }

  // Check for isolated concepts (no relationships)
  const connectedNodes = new Set<string>();
  for (const edge of edges) {
    connectedNodes.add(edge.from);
    connectedNodes.add(edge.to);
  }

  for (const node of nodes) {
    if (!connectedNodes.has(node.id)) {
      suggestions.push(`Consider: How does "${node.label}" relate to other concepts?`);
    }
  }

  // Limit suggestions
  return suggestions.slice(0, 8);
}

function generateMissingSuggestion(sourceType: RelationNodeType, missingType: RelationNodeType): string {
  const templates: Record<string, string> = {
    'DIAGNOSIS-TREATMENT': 'Missing: What is the treatment for this diagnosis?',
    'DIAGNOSIS-RISK': 'Missing: What are the risk factors for this diagnosis?',
    'DIAGNOSIS-EXCEPTION': 'Missing: Are there any exceptions or contraindications?',
    'SYMPTOM-DIAGNOSIS': 'Missing: What diagnoses should be considered for these symptoms?',
    'SYMPTOM-TEST': 'Missing: What tests would help evaluate these symptoms?',
    'FINDING-DIAGNOSIS': 'Missing: What diagnoses are associated with this finding?',
    'FINDING-TREATMENT': 'Missing: How is this finding managed?',
    'TREATMENT-RISK': 'Missing: What are the risks or side effects of this treatment?',
    'TREATMENT-EXCEPTION': 'Missing: When should this treatment be avoided?',
    'CONCEPT-SYMPTOM': 'Missing: What symptoms are associated with this concept?',
    'CONCEPT-DIAGNOSIS': 'Missing: What diagnoses relate to this concept?',
  };

  const key = `${sourceType}-${missingType}`;
  return templates[key] || `Consider: What ${formatType(missingType).toLowerCase()} relates to this ${formatType(sourceType).toLowerCase()}?`;
}

function formatType(type: RelationNodeType): string {
  const labels: Record<RelationNodeType, string> = {
    CONCEPT: 'concept',
    SYMPTOM: 'symptoms',
    FINDING: 'clinical findings',
    TEST: 'diagnostic tests',
    DIAGNOSIS: 'diagnosis',
    TREATMENT: 'treatment',
    RISK: 'risk factors',
    EXCEPTION: 'exceptions',
  };
  return labels[type] || type;
}

// ============================================================================
// Analysis Helpers
// ============================================================================

export function getReasoningStats(flow: ReasoningFlow): {
  nodeCount: number;
  edgeCount: number;
  nodeTypes: Record<RelationNodeType, number>;
  edgeTypes: Record<RelationEdgeType, number>;
  density: number;
  missingCount: number;
} {
  const nodeTypes = {} as Record<RelationNodeType, number>;
  const edgeTypes = {} as Record<RelationEdgeType, number>;

  for (const node of flow.nodes) {
    nodeTypes[node.type] = (nodeTypes[node.type] || 0) + 1;
  }

  for (const edge of flow.edges) {
    edgeTypes[edge.type] = (edgeTypes[edge.type] || 0) + 1;
  }

  const maxPossibleEdges = flow.nodes.length * (flow.nodes.length - 1);
  const density = maxPossibleEdges > 0 ? flow.edges.length / maxPossibleEdges : 0;

  return {
    nodeCount: flow.nodes.length,
    edgeCount: flow.edges.length,
    nodeTypes,
    edgeTypes,
    density,
    missingCount: flow.missingNodeSuggestions.length,
  };
}

// ============================================================================
// Export
// ============================================================================

export {
  inferNodeType,
  normalizeNodeId,
  detectMissingNodes,
  EDGE_PATTERNS,
  NODE_TYPE_PATTERNS,
  EXPECTED_STRUCTURE,
};
