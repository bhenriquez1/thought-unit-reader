// lib/cognitive/clinicalReasoningEngine.ts
// Clinical Reasoning Engine - Build reasoning chains, detect missing nodes
// Flow: Problem -> Findings -> Mechanism -> Dx -> Tx -> Exceptions -> Risks

import type {
  KnowledgeCard,
  PageContext,
  ReasoningNode,
  ReasoningChain,
  ClinicalReasoningEngine,
  CardId,
  EvidenceSpan,
} from './types';

// ============================================================================
// Node Type Detection Patterns
// ============================================================================

type NodeType = ReasoningNode['type'];

interface NodePattern {
  type: NodeType;
  patterns: RegExp[];
  priority: number; // Higher = more important to detect
}

const NODE_PATTERNS: NodePattern[] = [
  {
    type: 'problem',
    patterns: [
      /\bchief\s+complaint\b/i,
      /\bpresenting\s+(with|complaint|problem)\b/i,
      /\bpatient\s+(has|with|presents)\b/i,
      /\bsymptom(s)?\b/i,
      /\bcomplains?\s+of\b/i,
    ],
    priority: 10,
  },
  {
    type: 'finding',
    patterns: [
      /\bfinding(s)?\b/i,
      /\bsign(s)?\b/i,
      /\bobserve[ds]?\b/i,
      /\bexam(ination)?\s+(shows?|reveals?|demonstrates?)\b/i,
      /\bpresent(s|ation)?\b/i,
      /\bcharacteristic\b/i,
      /\bpathognomonic\b/i,
    ],
    priority: 9,
  },
  {
    type: 'mechanism',
    patterns: [
      /\bmechanism\b/i,
      /\bpathophysiology\b/i,
      /\bpathogenesis\b/i,
      /\bcaused\s+by\b/i,
      /\bresults?\s+(in|from)\b/i,
      /\bleads?\s+to\b/i,
      /\bdue\s+to\b/i,
      /\bmediated\s+by\b/i,
      /\bpathway\b/i,
    ],
    priority: 8,
  },
  {
    type: 'dx',
    patterns: [
      /\bdiagnos(is|tic|ed)\b/i,
      /\bdifferential\b/i,
      /\bconfirmed\s+by\b/i,
      /\brule\s+out\b/i,
      /\bgold\s+standard\b/i,
      /\bcriteria\s+for\b/i,
    ],
    priority: 10,
  },
  {
    type: 'tx',
    patterns: [
      /\btreatment\b/i,
      /\btherapy\b/i,
      /\bmanagement\b/i,
      /\bfirst[- ]line\b/i,
      /\bdrug\s+of\s+choice\b/i,
      /\bprocedure\b/i,
      /\bprescribe[ds]?\b/i,
      /\badminister(ed)?\b/i,
    ],
    priority: 9,
  },
  {
    type: 'contraindication',
    patterns: [
      /\bcontraindicated?\b/i,
      /\bavoid\b/i,
      /\bdo\s+not\b/i,
      /\bnever\s+use\b/i,
      /\bcaution\b/i,
    ],
    priority: 7,
  },
  {
    type: 'risk',
    patterns: [
      /\brisk\s+(factor)?\b/i,
      /\bcomplication(s)?\b/i,
      /\bprogression\b/i,
      /\bprognosis\b/i,
      /\badvance[ds]?\s+to\b/i,
    ],
    priority: 6,
  },
  {
    type: 'exception',
    patterns: [
      /\bexcept\b/i,
      /\bhowever\b/i,
      /\bunlike\b/i,
      /\brare(ly)?\b/i,
      /\batypical\b/i,
      /\bin\s+contrast\b/i,
    ],
    priority: 8,
  },
];

// ============================================================================
// Edge Inference Patterns
// ============================================================================

interface EdgePattern {
  from: NodeType;
  to: NodeType;
  label: ReasoningChain['edges'][0]['label'];
  patterns: RegExp[];
}

const EDGE_PATTERNS: EdgePattern[] = [
  {
    from: 'finding',
    to: 'dx',
    label: 'supports',
    patterns: [/\bconfirms?\b/i, /\bindicates?\b/i, /\bsuggests?\b/i],
  },
  {
    from: 'mechanism',
    to: 'finding',
    label: 'leads_to',
    patterns: [/\bresults?\s+in\b/i, /\bcauses?\b/i, /\bleads?\s+to\b/i],
  },
  {
    from: 'dx',
    to: 'tx',
    label: 'leads_to',
    patterns: [/\btreated?\s+(with|by)\b/i, /\bmanage[ds]?\s+with\b/i],
  },
  {
    from: 'tx',
    to: 'contraindication',
    label: 'contra',
    patterns: [/\bcontraindicated?\b/i, /\bavoid\b/i],
  },
  {
    from: 'tx',
    to: 'exception',
    label: 'exception_of',
    patterns: [/\bexcept\b/i, /\bunless\b/i],
  },
];

// ============================================================================
// Node Detection
// ============================================================================

function detectNodeType(card: KnowledgeCard): NodeType | undefined {
  const text = `${card.title} ${card.summary}`;
  let bestMatch: { type: NodeType; priority: number } | undefined;

  for (const nodePattern of NODE_PATTERNS) {
    for (const pattern of nodePattern.patterns) {
      if (pattern.test(text)) {
        if (!bestMatch || nodePattern.priority > bestMatch.priority) {
          bestMatch = { type: nodePattern.type, priority: nodePattern.priority };
        }
        break; // Found a match for this node type
      }
    }
  }

  // Also consider card kind
  if (!bestMatch && card.kind) {
    const kindToType: Record<string, NodeType> = {
      'definition': 'finding',
      'pattern': 'finding',
      'decision': 'dx',
      'rule': 'tx',
      'exception': 'exception',
      'trap': 'risk',
    };
    const mapped = kindToType[card.kind];
    if (mapped) {
      bestMatch = { type: mapped, priority: 1 };
    }
  }

  return bestMatch?.type;
}

function createReasoningNode(card: KnowledgeCard, type: NodeType): ReasoningNode {
  return {
    id: `node_${card.id}`,
    type,
    text: card.title,
    cardIds: [card.id],
    evidence: card.evidence,
  };
}

// ============================================================================
// Edge Inference
// ============================================================================

function inferEdges(
  nodes: ReasoningNode[]
): ReasoningChain['edges'] {
  const edges: ReasoningChain['edges'] = [];
  const nodeMap = new Map(nodes.map(n => [n.type, n]));

  // Standard clinical reasoning flow
  const standardFlow: Array<[NodeType, NodeType, ReasoningChain['edges'][0]['label']]> = [
    ['problem', 'finding', 'leads_to'],
    ['finding', 'mechanism', 'supports'],
    ['mechanism', 'dx', 'supports'],
    ['finding', 'dx', 'supports'],
    ['dx', 'tx', 'leads_to'],
    ['tx', 'contraindication', 'contra'],
    ['tx', 'exception', 'exception_of'],
    ['dx', 'risk', 'leads_to'],
  ];

  for (const [fromType, toType, label] of standardFlow) {
    const fromNode = nodeMap.get(fromType);
    const toNode = nodeMap.get(toType);

    if (fromNode && toNode) {
      edges.push({
        from: fromNode.id,
        to: toNode.id,
        label,
      });
    }
  }

  return edges;
}

// ============================================================================
// Missing Node Detection
// ============================================================================

function detectMissingNodes(
  nodes: ReasoningNode[],
  cards: KnowledgeCard[]
): ReasoningChain['missing'] {
  const missing: ReasoningChain['missing'] = [];
  const presentTypes = new Set(nodes.map(n => n.type));

  // Check for common missing patterns
  const missingPatterns: Array<{
    condition: () => boolean;
    expectedType: NodeType;
    detail: string;
  }> = [
    {
      condition: () => presentTypes.has('dx') && !presentTypes.has('mechanism'),
      expectedType: 'mechanism',
      detail: 'Diagnosis present but no mechanism captured - understanding WHY helps retention',
    },
    {
      condition: () => presentTypes.has('tx') && !presentTypes.has('contraindication'),
      expectedType: 'contraindication',
      detail: 'Treatment described but no contraindications - watch for "when NOT to use"',
    },
    {
      condition: () => presentTypes.has('dx') && !presentTypes.has('finding'),
      expectedType: 'finding',
      detail: 'Diagnosis without findings - how do you recognize this clinically?',
    },
    {
      condition: () => presentTypes.has('tx') && !presentTypes.has('exception'),
      expectedType: 'exception',
      detail: 'Treatment rule without exception - exceptions are frequently tested',
    },
    {
      condition: () => presentTypes.has('finding') && !presentTypes.has('dx'),
      expectedType: 'dx',
      detail: 'Findings without diagnosis - what condition causes these findings?',
    },
    {
      condition: () => presentTypes.has('dx') && !presentTypes.has('risk'),
      expectedType: 'risk',
      detail: 'Diagnosis without complications/risks - what happens if untreated?',
    },
  ];

  for (const { condition, expectedType, detail } of missingPatterns) {
    if (condition()) {
      // Find cards that might fill this gap
      const suggestionCards = cards.filter(c => {
        const detectedType = detectNodeType(c);
        return detectedType === expectedType;
      });

      missing.push({
        expectedType,
        suggestionCardIds: suggestionCards.map(c => c.id).slice(0, 3),
        detail,
      });
    }
  }

  return missing;
}

// ============================================================================
// Main Engine
// ============================================================================

export function buildChain(
  cards: KnowledgeCard[],
  ctx: PageContext
): ReasoningChain {
  // Filter cards to current page/chapter context
  const relevantCards = cards.filter(card => {
    // Cards from current page
    if (card.pageRefs.includes(ctx.pageIndex)) return true;

    // Cards from current chapter (if TOC path available)
    if (ctx.tocPath?.chapterId && card.chapterId === ctx.tocPath.chapterId) return true;

    return false;
  });

  // Detect node types for each card
  const nodes: ReasoningNode[] = [];
  const nodesByType = new Map<NodeType, ReasoningNode>();

  for (const card of relevantCards) {
    const type = detectNodeType(card);
    if (type) {
      // Merge cards of same type
      const existing = nodesByType.get(type);
      if (existing) {
        existing.cardIds.push(card.id);
        existing.text += ` | ${card.title}`;
        existing.evidence.push(...card.evidence);
      } else {
        const node = createReasoningNode(card, type);
        nodes.push(node);
        nodesByType.set(type, node);
      }
    }
  }

  // Infer edges based on node types
  const edges = inferEdges(nodes);

  // Detect missing nodes
  const missing = detectMissingNodes(nodes, cards);

  return {
    docId: ctx.docId,
    pageIndex: ctx.pageIndex,
    nodes,
    edges,
    missing,
  };
}

export const clinicalReasoningEngine: ClinicalReasoningEngine = {
  buildChain,
};

export default clinicalReasoningEngine;
