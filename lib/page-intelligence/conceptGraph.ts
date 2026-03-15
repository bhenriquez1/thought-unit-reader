import type {
  PageIntelligence,
  ParagraphUnit,
  Relation,
  Segment,
  SourceRef,
  TabResponse,
  TabType,
  GraphNodeType,
  GraphEdgeType,
  ConceptGraph,
  ConceptGraphNode,
  ConceptGraphEdge,
  PageMemory,
  TabPayloadContracts,
} from './types';

const GRAPH_VERSION = 'v1';

function stableHash(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a_${(hash >>> 0).toString(16)}`;
}

function sanitizeLabel(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function graphNode(id: string, type: GraphNodeType, label: string, pageIndex: number, metadata: Record<string, unknown> = {}): ConceptGraphNode {
  return { id, type, label: sanitizeLabel(label), pageIndex, metadata, updatedAt: Date.now() };
}

function graphEdge(id: string, type: GraphEdgeType, fromId: string, toId: string, pageIndex: number, score = 0.75, metadata: Record<string, unknown> = {}): ConceptGraphEdge {
  return { id, type, fromId, toId, pageIndex, score, metadata, updatedAt: Date.now() };
}

function extractHeadingCandidates(segments: Segment[]): string[] {
  return segments
    .filter((s) => s.kind === 'heading' || s.kind === 'caption')
    .map((s) => sanitizeLabel(s.text))
    .filter(Boolean)
    .slice(0, 6);
}

function paragraphSource(unit: ParagraphUnit): SourceRef {
  return {
    pageIndex: unit.pageIndex,
    paragraphId: unit.id,
    startChar: unit.startChar,
    endChar: unit.endChar,
    quote: unit.text.slice(0, 180),
    quoteText: unit.text,
    quoteHash: stableHash(unit.text.toLowerCase()),
    confidence: Math.max(0.3, Math.min(1, unit.importance / 100)),
    bbox: unit.bbox,
  };
}

function relationToSentence(rel: Relation): string {
  const type = rel.type.replace(/_/g, ' ');
  return `${rel.from} ${type} ${rel.to}`;
}

function hasMeaningfulOverview(value: string): boolean {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length < 45) return false;
  const firstToken = normalized.split(/\s+/)[0]?.toLowerCase() ?? '';
  if (['an', 'a', 'the', 'this', 'that'].includes(firstToken) && normalized.split(/\s+/).length <= 3) {
    return false;
  }
  return /[a-z]{3,}/i.test(normalized);
}

function fallbackOverview(pageIntelligence: PageIntelligence, memory: PageMemory): string {
  const heading = memory.headingCandidates[0] || memory.sectionId || `Page ${pageIntelligence.pageNumber}`;
  const paragraphCluster = (pageIntelligence.paragraphUnits ?? [])
    .slice()
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 2)
    .map((u) => u.text.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ')
    .slice(0, 240);
  const candidate = `${heading}: ${paragraphCluster}`.trim();
  if (hasMeaningfulOverview(candidate)) return candidate;
  const explainSummary = pageIntelligence.explain.summary.replace(/\s+/g, ' ').trim();
  if (hasMeaningfulOverview(explainSummary)) return explainSummary;
  return `${heading}: Core concepts are being introduced on this page with clinically relevant framing.`;
}

function resolveOverview(pageIntelligence: PageIntelligence, memory: PageMemory): string {
  const summary = pageIntelligence.explain.summary.replace(/\s+/g, ' ').trim();
  const hasHeadingAnchor = memory.headingCandidates.some((h) => h && summary.toLowerCase().includes(h.toLowerCase().split(/\s+/)[0] || ''));
  if (hasMeaningfulOverview(summary) && (hasHeadingAnchor || memory.headingCandidates.length === 0)) {
    return summary;
  }
  return fallbackOverview(pageIntelligence, memory);
}

function debugTabGeneration(tab: TabType, memory: PageMemory, pageIntelligence: PageIntelligence, anchors: SourceRef[]): void {
  if (typeof console === 'undefined') return;
  const sourceParagraphIds = anchors.map((anchor) => anchor.paragraphId).filter(Boolean);
  console.debug('[TabDebug]', {
    pageIndex: memory.pageIndex,
    pageFingerprint: memory.fingerprint,
    sourceParagraphIds,
    tabMode: tab,
    generatedAt: new Date().toISOString(),
    heading: memory.headingCandidates[0] || null,
    segmentCount: pageIntelligence.segments.length,
  });
}

export function computePageFingerprint(docId: string, pageIndex: number, text: string, headings: string[]): string {
  const basis = [docId, String(pageIndex), text.slice(0, 1200).toLowerCase(), ...headings.slice(0, 4)].join('|');
  return stableHash(basis);
}

export function buildPageMemory(docId: string, pageIntelligence: PageIntelligence): PageMemory {
  const pageIndex = pageIntelligence.pageNumber - 1;
  const headings = extractHeadingCandidates(pageIntelligence.segments);
  const visibleParagraphIds = (pageIntelligence.paragraphUnits ?? []).map((u) => u.id);
  const visibleFigureIds = pageIntelligence.segments
    .filter((s) => s.kind === 'caption' || /figure|fig\.?\s*\d+/i.test(s.text))
    .map((s) => s.id);
  const dominantConceptIds = pageIntelligence.insights.slice(0, 5).map((i) => i.id);
  const sectionId = headings[0] || pageIntelligence.structureMap?.topic;
  const subsectionId = headings[1];
  const seedText = pageIntelligence.segments.slice(0, 8).map((s) => s.text).join(' ');
  const fingerprint = computePageFingerprint(docId, pageIndex, seedText, headings);

  return {
    docId,
    pageIndex,
    fingerprint,
    headingCandidates: headings,
    visibleParagraphIds,
    visibleFigureIds,
    sectionId,
    subsectionId,
    dominantConceptIds,
    updatedAt: Date.now(),
  };
}

export function upsertConceptGraph(docId: string, pageIntelligence: PageIntelligence, previous?: ConceptGraph): ConceptGraph {
  const graph: ConceptGraph = previous
    ? {
        ...previous,
        nodes: { ...previous.nodes },
        edges: { ...previous.edges },
      }
    : {
        docId,
        version: GRAPH_VERSION,
        nodes: {},
        edges: {},
        updatedAt: Date.now(),
      };

  const pageIndex = pageIntelligence.pageNumber - 1;
  const documentNodeId = `doc:${docId}`;
  graph.nodes[documentNodeId] = graphNode(documentNodeId, 'DocumentNode', docId, pageIndex, {
    title: docId,
  });

  const section = pageIntelligence.structureMap?.topic || `Page ${pageIntelligence.pageNumber}`;
  const sectionNodeId = `section:${docId}:${stableHash(section.toLowerCase())}`;
  graph.nodes[sectionNodeId] = graphNode(sectionNodeId, 'SectionNode', section, pageIndex);

  for (const segment of pageIntelligence.segments) {
    const type: GraphNodeType = segment.kind === 'heading'
      ? 'SubsectionNode'
      : segment.kind === 'caption'
        ? 'FigureNode'
        : segment.kind === 'tableHint'
          ? 'TableNode'
          : 'ParagraphNode';
    graph.nodes[`segment:${segment.id}`] = graphNode(`segment:${segment.id}`, type, segment.text.slice(0, 180), pageIndex, {
      segmentId: segment.id,
      kind: segment.kind,
      bbox: segment.bbox,
    });
    graph.edges[`e:${sectionNodeId}:contains:${segment.id}`] = graphEdge(
      `e:${sectionNodeId}:contains:${segment.id}`,
      'belongs_to',
      `segment:${segment.id}`,
      sectionNodeId,
      pageIndex,
      0.8,
    );
  }

  for (const insight of pageIntelligence.insights) {
    const termNodeId = `term:${stableHash(insight.title.toLowerCase())}`;
    graph.nodes[termNodeId] = graphNode(termNodeId, 'TermNode', insight.title, pageIndex, {
      score: insight.score,
      tags: insight.tags,
    });
    graph.edges[`e:${sectionNodeId}:explains:${termNodeId}`] = graphEdge(
      `e:${sectionNodeId}:explains:${termNodeId}`,
      'explains',
      sectionNodeId,
      termNodeId,
      pageIndex,
      insight.score / 100,
      { insightId: insight.id },
    );
  }

  for (const rel of pageIntelligence.relations) {
    const fromId = `term:${stableHash(rel.from.toLowerCase())}`;
    const toId = `term:${stableHash(rel.to.toLowerCase())}`;
    if (!graph.nodes[fromId]) graph.nodes[fromId] = graphNode(fromId, 'TermNode', rel.from, pageIndex);
    if (!graph.nodes[toId]) graph.nodes[toId] = graphNode(toId, 'TermNode', rel.to, pageIndex);

    const edgeType: GraphEdgeType = rel.type === 'is_a'
      ? 'defines'
      : rel.type === 'part_of'
        ? 'depends_on'
        : rel.type === 'associated_with'
          ? 'appears_with'
          : rel.type === 'causes' || rel.type === 'leads_to'
            ? 'leads_to'
            : 'mentioned_in';

    graph.edges[`rel:${rel.id}`] = graphEdge(`rel:${rel.id}`, edgeType, fromId, toId, pageIndex, rel.score, {
      relationType: rel.type,
      evidenceSegmentIds: rel.evidenceSegmentIds,
    });
  }

  graph.edges[`e:${documentNodeId}:contains:${sectionNodeId}`] = graphEdge(
    `e:${documentNodeId}:contains:${sectionNodeId}`,
    'belongs_to',
    sectionNodeId,
    documentNodeId,
    pageIndex,
    1,
  );

  graph.updatedAt = Date.now();
  return graph;
}

function anchorFromTopParagraph(pageIntelligence: PageIntelligence): SourceRef[] {
  const units = [...(pageIntelligence.paragraphUnits ?? [])].sort((a, b) => b.importance - a.importance);
  return units.slice(0, 3).map(paragraphSource);
}

export function verifyGrounding(memory: PageMemory, response: TabResponse): boolean {
  if (memory.fingerprint !== response.fingerprint) return false;
  return response.sourceAnchors.every((anchor) => anchor.pageIndex === memory.pageIndex || anchor.pageIndex === memory.pageIndex - 1 || anchor.pageIndex === memory.pageIndex + 1);
}

export function buildTabResponse(tab: TabType, docId: string, pageIntelligence: PageIntelligence, memory: PageMemory, graph: ConceptGraph): TabResponse {
  const anchors = anchorFromTopParagraph(pageIntelligence);
  const pageIndex = pageIntelligence.pageNumber - 1;
  const topInsights = [...pageIntelligence.insights].sort((a, b) => b.score - a.score);
  const relationLines = pageIntelligence.relations.slice(0, 6).map(relationToSentence);
  const compareRows = pageIntelligence.signals
    .filter((s) => s.type === 'contrast' || s.type === 'exception')
    .slice(0, 4)
    .map((s) => s.label);

  let sections: TabResponse['sections'] = [];
  let title = '';

  if (tab === 'priority') {
    title = `Priority: ${memory.sectionId || `Page ${pageIntelligence.pageNumber}`}`;
    sections = [
      { label: 'Page overview', content: resolveOverview(pageIntelligence, memory) },
      { label: 'Main ideas', content: topInsights.slice(0, 4).map((i) => i.title) },
      { label: 'Highest salience concepts', content: memory.dominantConceptIds },
      { label: 'Strongest anchor', content: anchors[0]?.quote || 'No anchor available' },
    ];
  } else if (tab === 'explain') {
    title = `Explain: ${memory.sectionId || 'Current section'}`;
    sections = [
      { label: 'Section explanation', content: pageIntelligence.explain.summary },
      { label: 'Subsection flow', content: pageIntelligence.explain.bullets.slice(0, 6) },
      { label: 'Why it matters', content: pageIntelligence.continuity?.clinicalConnection || 'Clinical relevance inferred from page context.' },
      { label: 'What to remember', content: pageIntelligence.explain.pitfalls.slice(0, 3) },
    ];
  } else if (tab === 'relations') {
    title = `Relations: ${memory.sectionId || `Page ${pageIntelligence.pageNumber}`}`;
    sections = [
      { label: 'Concept relationships on this page', content: relationLines.length ? relationLines : ['No grounded relations found for this page yet.'] },
      { label: 'Section dependencies', content: Object.values(graph.edges).filter((e) => e.pageIndex === pageIndex && e.type === 'depends_on').map((e) => `${graph.nodes[e.fromId]?.label} → ${graph.nodes[e.toId]?.label}`) },
      { label: 'Term ↔ mechanism links', content: Object.values(graph.edges).filter((e) => e.pageIndex === pageIndex && (e.type === 'leads_to' || e.type === 'explains')).slice(0, 6).map((e) => `${graph.nodes[e.fromId]?.label} → ${graph.nodes[e.toId]?.label}`) },
    ];
  } else if (tab === 'compare') {
    title = `Compare: ${memory.sectionId || 'Current topic'}`;
    const relContrasts = Object.values(graph.edges).filter((e) => e.pageIndex === pageIndex && e.type === 'contrasts_with');
    sections = [
      { label: 'A vs B candidates', content: relContrasts.length ? relContrasts.map((e) => `${graph.nodes[e.fromId]?.label} vs ${graph.nodes[e.toId]?.label}`) : (compareRows.length ? compareRows : ['No compare pair available from the current page cluster yet.']) },
      { label: 'Commonly confused concepts', content: pageIntelligence.explain.pitfalls.slice(0, 4) },
      { label: 'Definition contrasts', content: pageIntelligence.relations.filter((r) => r.type === 'is_a').slice(0, 4).map((r) => `${r.from} vs ${r.to}`) },
    ];
  } else {
    title = `Insights: ${memory.sectionId || `Page ${pageIntelligence.pageNumber}`}`;
    sections = [
      { label: 'Hidden implications', content: pageIntelligence.continuity?.conceptualBridge || 'No bridge available yet.' },
      { label: 'Subtle significance', content: topInsights.slice(0, 3).map((i) => i.body) },
      { label: 'Exam traps', content: pageIntelligence.explain.pitfalls.slice(0, 4) },
      { label: 'Cross-page bridges', content: Object.values(graph.edges).filter((e) => Math.abs(e.pageIndex - pageIndex) === 1 && e.type === 'appears_with').slice(0, 4).map((e) => `${graph.nodes[e.fromId]?.label} ↔ ${graph.nodes[e.toId]?.label}`) },
    ];
  }

  debugTabGeneration(tab, memory, pageIntelligence, anchors);

  const response: TabResponse = {
    pageIndex,
    fingerprint: memory.fingerprint,
    tab,
    title,
    sections,
    sourceAnchors: anchors,
    relatedNodeIds: memory.dominantConceptIds,
  };

  return verifyGrounding(memory, response)
    ? response
    : {
        ...response,
        sections: [{ label: 'Grounding mismatch', content: 'Output rejected because page fingerprint mismatched current memory.' }],
      };
}

export function buildAllTabResponses(docId: string, pageIntelligence: PageIntelligence, memory: PageMemory, graph: ConceptGraph): { tabResponses: Record<TabType, TabResponse>; tabPayloads: TabPayloadContracts } {
  const priorityPayload = buildTabResponse('priority', docId, pageIntelligence, memory, graph);
  const explainPayload = buildTabResponse('explain', docId, pageIntelligence, memory, graph);
  const relationsPayload = buildTabResponse('relations', docId, pageIntelligence, memory, graph);
  const comparePayload = buildTabResponse('compare', docId, pageIntelligence, memory, graph);
  const insightsPayload = buildTabResponse('insights', docId, pageIntelligence, memory, graph);

  return {
    tabResponses: {
      priority: priorityPayload,
      explain: explainPayload,
      relations: relationsPayload,
      compare: comparePayload,
      insights: insightsPayload,
    },
    tabPayloads: {
      priorityPayload,
      explainPayload,
      relationsPayload,
      comparePayload,
      insightsPayload,
    },
  };
}
