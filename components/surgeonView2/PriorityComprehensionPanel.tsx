// components/surgeonView2/PriorityComprehensionPanel.tsx
// Priority Comprehension Panel — full paragraph intelligence, structure map, Deep Analysis

import React, { useMemo, useRef, useEffect, useState } from 'react';
import type { RankedInsight, ImportanceBucket } from '@/lib/relationshipSchema/types';
import type {
  PageIntelligence,
  SourceRef,
  ParagraphUnit,
  StructureMapStage,
} from '@/lib/page-intelligence';
import { ImportanceBar } from './MathDisplay';
import { SourceAnchor } from './SourceAnchor';
import { buildQuoteHash, detectParagraphTraps } from '@/lib/page-intelligence';
import type { TrapHit } from '@/lib/page-intelligence';

// ============================================================================
// Types
// ============================================================================

export type PriorityScore = 'MUST_KNOW' | 'HIGH_YIELD' | 'SUPPORTING';

/** Tier grouping for raw paragraph units (no suppression) */
type ParagraphTier = 'core' | 'important' | 'supporting' | 'background';

interface PriorityItem {
  id: string;
  title: string;
  content: string;
  priority: PriorityScore;
  category: 'high_yield' | 'mechanism' | 'trap' | 'threshold' | 'clinical';
  evidence?: { page: number; text: string }[];
  tags?: string[];
  /** Full source anchor — enables precise click-to-focus in the PDF viewer. */
  sourceRef?: SourceRef;
}

interface PriorityComprehensionPanelProps {
  // Primary data sources
  rankedInsights: RankedInsight[];
  pageIntelligence?: PageIntelligence | null;

  // Actions
  onInsightClick?: (insight: RankedInsight) => void;
  onJumpToPage?: (page: number) => void;
  onSaveToNoteLab?: (insight: RankedInsight) => void;
  onMarkConfusing?: (insight: RankedInsight) => void;
  onHighlightParagraph?: (text: string) => void;
  /** Called when user clicks "Jump to source" on a SourceAnchor */
  onJumpToSource?: (ref: SourceRef) => void;

  // Panel zoom & sync
  /** CSS font-size multiplier (e.g. 0.9, 1.0, 1.25). Applied via --insightScale variable. */
  insightScale?: number;
  /**
   * ID of the currently active insight item.
   * When syncEnabled is true, the panel scrolls this item into view (block: nearest).
   */
  activeItemId?: string | null;
  /** Whether sync-scroll is enabled. Default: true */
  syncEnabled?: boolean;
  /**
   * Deep Analysis Mode — when true, shows ALL paragraph units, structure map,
   * mechanism chains, and exam traps without filters.
   */
  deepAnalysisMode?: boolean;
}

// ============================================================================
// Priority Score Styling
// ============================================================================

const PRIORITY_STYLES: Record<PriorityScore, { icon: string; bg: string; text: string; badge: string }> = {
  MUST_KNOW: {
    icon: '🔥',
    bg: 'bg-red-900/30',
    text: 'text-red-300',
    badge: 'bg-red-600 text-white',
  },
  HIGH_YIELD: {
    icon: '⭐',
    bg: 'bg-amber-900/30',
    text: 'text-amber-300',
    badge: 'bg-amber-600 text-white',
  },
  SUPPORTING: {
    icon: '○',
    bg: 'bg-gray-800/50',
    text: 'text-gray-300',
    badge: 'bg-gray-600 text-gray-200',
  },
};

const CATEGORY_HEADERS: Record<PriorityItem['category'], { icon: string; label: string; description: string }> = {
  high_yield: {
    icon: '🔥',
    label: 'High-Yield Statements',
    description: 'Core concepts, definitions, clinical implications',
  },
  mechanism: {
    icon: '🧠',
    label: 'Key Mechanisms',
    description: 'Pathways and causal chains',
  },
  trap: {
    icon: '⚠️',
    label: 'Exam Traps',
    description: 'Common confusions and pitfalls',
  },
  threshold: {
    icon: '📊',
    label: 'Numbers, Formulas & Thresholds',
    description: 'Critical values, equations, and cutoffs',
  },
  clinical: {
    icon: '🧬',
    label: 'Clinical Relevance',
    description: 'Why this matters in practice',
  },
};

const STAGE_META: Record<StructureMapStage, { icon: string; color: string }> = {
  definition: { icon: '📖', color: 'text-blue-300' },
  mechanism: { icon: '⚙️', color: 'text-purple-300' },
  application: { icon: '🔧', color: 'text-amber-300' },
  clinical_relevance: { icon: '🩺', color: 'text-teal-300' },
};

// ============================================================================
// Tier helpers for paragraph units
// ============================================================================

function scoreToParagraphTier(importance: number): ParagraphTier {
  if (importance >= 85) return 'core';
  if (importance >= 60) return 'important';
  if (importance >= 40) return 'supporting';
  return 'background';
}

const TIER_META: Record<ParagraphTier, { label: string; icon: string; bg: string; text: string }> = {
  core: { label: 'Core', icon: '🔥', bg: 'bg-red-900/25', text: 'text-red-300' },
  important: { label: 'Important', icon: '⭐', bg: 'bg-amber-900/25', text: 'text-amber-300' },
  supporting: { label: 'Supporting', icon: '◈', bg: 'bg-blue-900/20', text: 'text-blue-300' },
  background: { label: 'Background', icon: '○', bg: 'bg-gray-800/40', text: 'text-gray-400' },
};

// ============================================================================
// Categorization Logic
// ============================================================================

function categorizePriorityItems(
  insights: RankedInsight[],
  pageIntelligence?: PageIntelligence | null
): Map<PriorityItem['category'], PriorityItem[]> {
  const categories = new Map<PriorityItem['category'], PriorityItem[]>();

  // Initialize all categories
  categories.set('high_yield', []);
  categories.set('mechanism', []);
  categories.set('trap', []);
  categories.set('threshold', []);
  categories.set('clinical', []);

  // Process ranked insights
  for (const insight of insights) {
    const priority = bucketToPriority(insight.bucket);
    const category = determineCategory(insight);

    const item: PriorityItem = {
      id: insight.id,
      title: insight.title,
      content: insight.claim || insight.whyItMatters,
      priority,
      category,
      evidence: insight.evidence?.map(e => ({ page: e.page, text: e.text })),
      tags: insight.tags,
    };

    categories.get(category)?.push(item);
  }

  // Add Page Intelligence insights — attach sourceRef for precise click-to-focus
  if (pageIntelligence?.insights) {
    const piPage = pageIntelligence.pageNumber;
    const piPageIndex = piPage - 1;
    const paragraphUnits = pageIntelligence.paragraphUnits ?? [];

    for (const pi of pageIntelligence.insights) {
      const priority: PriorityScore =
        pi.score >= 85 ? 'MUST_KNOW' :
        pi.score >= 60 ? 'HIGH_YIELD' : 'SUPPORTING';

      const category = determineCategoryFromTags(pi.tags);

      // Match to a ParagraphUnit via evidenceSegmentIds or direct id
      const matchedUnit = paragraphUnits.find(u =>
        pi.evidenceSegmentIds.includes(u.id)
      );

      const quoteText = matchedUnit?.text.slice(0, 180) ?? '';
      const sourceRef: SourceRef | undefined = matchedUnit
        ? {
            pageIndex: piPageIndex,
            paragraphId: matchedUnit.id,
            startChar: matchedUnit.startChar,
            endChar: matchedUnit.endChar,
            quote: quoteText,
            quoteText,
            quoteHash: buildQuoteHash(quoteText),
            textOrigin: 'pdfText',
            confidence: matchedUnit.importance / 100,
          }
        : undefined;

      const item: PriorityItem = {
        id: pi.id,
        title: pi.title,
        // Prefer sourceRef.quote for highlight accuracy; fall back to body
        content: sourceRef?.quote ?? pi.body,
        priority,
        category,
        tags: pi.tags,
        sourceRef,
        // Attach page ref so jump-to-page button renders
        evidence: [{ page: piPage, text: pi.body.slice(0, 100) }],
      };

      const existing = categories.get(category);
      if (existing && !existing.some(e => e.title === item.title)) {
        existing.push(item);
      }
    }
  }

  // Sort each category by priority
  for (const [key, items] of categories) {
    categories.set(key, items.sort((a, b) => {
      const priorityOrder: PriorityScore[] = ['MUST_KNOW', 'HIGH_YIELD', 'SUPPORTING'];
      return priorityOrder.indexOf(a.priority) - priorityOrder.indexOf(b.priority);
    }));
  }

  return categories;
}

function bucketToPriority(bucket: ImportanceBucket): PriorityScore {
  switch (bucket) {
    case 'CRITICAL': return 'MUST_KNOW';
    case 'HIGH_YIELD': return 'HIGH_YIELD';
    default: return 'SUPPORTING';
  }
}

function determineCategory(insight: RankedInsight): PriorityItem['category'] {
  if (insight.type === 'EXAM_TRAP' || insight.trap) return 'trap';
  if (insight.type === 'CLINICAL_PEARL' || insight.clinicalPearl) return 'clinical';
  if (insight.type === 'DECISION_RULE' || insight.type === 'DIAGNOSTIC_SIGNAL') return 'mechanism';

  const text = (insight.claim || '') + (insight.whyItMatters || '');
  if (/\d+(?:\.\d+)?(?:\s*(?:mg|ml|mm|%|mmHg|mEq|IU|mcg|g\/dL))/i.test(text)) return 'threshold';
  if (/(?:causes?|leads? to|results? in|→|triggers?)/i.test(text)) return 'mechanism';
  return 'high_yield';
}

function determineCategoryFromTags(tags: string[]): PriorityItem['category'] {
  const tagStr = tags.join(' ').toLowerCase();
  if (tagStr.includes('trap') || tagStr.includes('pitfall') || tagStr.includes('confusion')) return 'trap';
  if (tagStr.includes('clinical') || tagStr.includes('practice') || tagStr.includes('treatment')) return 'clinical';
  if (tagStr.includes('mechanism') || tagStr.includes('pathway') || tagStr.includes('process')) return 'mechanism';
  if (tagStr.includes('threshold') || tagStr.includes('value') || tagStr.includes('number')) return 'threshold';
  return 'high_yield';
}

// ============================================================================
// Paragraph Unit grouping (NO suppression — show all tiers)
// ============================================================================

function groupParagraphUnitsByTier(
  units: ParagraphUnit[]
): Map<ParagraphTier, ParagraphUnit[]> {
  const map = new Map<ParagraphTier, ParagraphUnit[]>([
    ['core', []],
    ['important', []],
    ['supporting', []],
    ['background', []],
  ]);
  for (const u of units) {
    map.get(scoreToParagraphTier(u.importance))!.push(u);
  }
  // Sort each tier descending by importance
  for (const [tier, items] of map) {
    map.set(tier, items.sort((a, b) => b.importance - a.importance));
  }
  return map;
}

// ============================================================================
// Structure Map sub-component
// ============================================================================

const StructureMapSection: React.FC<{
  structureMap: PageIntelligence['structureMap'];
  paragraphUnits?: ParagraphUnit[];
  pageNumber?: number;
  onHighlightParagraph?: (text: string) => void;
  onJumpToSource?: (ref: SourceRef) => void;
}> = ({ structureMap, paragraphUnits = [], pageNumber, onHighlightParagraph, onJumpToSource }) => {
  if (!structureMap || structureMap.nodes.length === 0) return null;

  /** Build a SourceRef for a structure map node via its sourceIds. */
  function nodeToSourceRef(node: { sourceIds: string[]; text: string }): SourceRef | null {
    for (const id of node.sourceIds) {
      const unit = paragraphUnits.find(u => u.id === id);
      if (unit) {
        const q = unit.text.slice(0, 180);
        return {
          pageIndex: unit.pageIndex,
          paragraphId: unit.id,
          startChar: unit.startChar,
          endChar: unit.endChar,
          quote: q,
          quoteText: q,
          quoteHash: buildQuoteHash(q),
          textOrigin: 'pdfText',
          confidence: unit.importance / 100,
        };
      }
    }
    return null;
  }

  return (
    <section className="mb-5">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm">🗺️</span>
        <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wide">
          Structure Map
        </h3>
        <span className="text-[10px] text-gray-500 italic">
          {structureMap.topic.slice(0, 40)}
        </span>
        <span className="ml-auto text-[10px] text-teal-500">
          {Math.round(structureMap.completeness * 100)}% complete
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {structureMap.nodes.map((node, idx) => {
          const meta = STAGE_META[node.stage];
          return (
            <div
              key={node.id}
              className="flex items-start gap-2 p-2 rounded-lg bg-gray-800/40 border border-gray-700/50 cursor-pointer hover:border-gray-600"
              onClick={() => {
                onHighlightParagraph?.(node.text);
                const ref = nodeToSourceRef(node);
                if (ref) onJumpToSource?.(ref);
              }}
            >
              {/* Stage connector */}
              <div className="flex flex-col items-center flex-shrink-0 mt-0.5">
                <span className="text-xs">{meta.icon}</span>
                {idx < structureMap.nodes.length - 1 && (
                  <div className="w-px h-3 bg-gray-600 mt-0.5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className={`text-[10px] font-semibold uppercase tracking-wide ${meta.color}`}>
                    {node.label}
                  </span>
                  {pageNumber !== undefined && (
                    <span className="text-[9px] text-gray-500 font-mono">PDF p.{pageNumber}</span>
                  )}
                </div>
                <p className="text-[11px] text-gray-300 mt-0.5">
                  {node.text}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

// ============================================================================
// Continuity sub-component
// ============================================================================

const ContinuitySection: React.FC<{
  continuity: PageIntelligence['continuity'];
}> = ({ continuity }) => {
  if (!continuity) return null;

  const rows: Array<{ icon: string; label: string; text: string; color: string }> = [
    { icon: '🎯', label: 'Core Pattern', text: continuity.corePattern, color: 'text-teal-300' },
    { icon: '🔗', label: 'Conceptual Bridge', text: continuity.conceptualBridge, color: 'text-blue-300' },
    { icon: '🩺', label: 'Clinical Connection', text: continuity.clinicalConnection, color: 'text-green-300' },
    { icon: '⚠️', label: 'Watch For', text: continuity.commonMisunderstanding, color: 'text-amber-300' },
  ];

  return (
    <section className="mb-5">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm">🧩</span>
        <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wide">
          Insight Continuity
        </h3>
        <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded ${
          continuity.quality === 'rich' ? 'bg-teal-500/20 text-teal-400' :
          continuity.quality === 'minimal' ? 'bg-amber-500/20 text-amber-400' :
          'bg-gray-700 text-gray-500'
        }`}>
          {continuity.quality}
        </span>
      </div>
      <div className="space-y-1.5">
        {rows.map(({ icon, label, text, color }) => (
          <div key={label} className="p-2 rounded-lg bg-gray-800/40 border border-gray-700/50">
            <div className="flex items-center gap-1 mb-0.5">
              <span className="text-xs">{icon}</span>
              <span className={`text-[10px] font-semibold uppercase tracking-wide ${color}`}>
                {label}
              </span>
            </div>
            <p className="text-[11px] text-gray-300 pl-4">
              {text}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
};

// ============================================================================
// Paragraph Unit tier card (Deep Analysis Mode)
// ============================================================================

const ROLE_COLORS: Record<string, string> = {
  definition: 'bg-blue-900/40 text-blue-300 border-blue-700/40',
  mechanism: 'bg-purple-900/40 text-purple-300 border-purple-700/40',
  clinical: 'bg-teal-900/40 text-teal-300 border-teal-700/40',
  example: 'bg-amber-900/30 text-amber-300 border-amber-700/40',
  step: 'bg-indigo-900/30 text-indigo-300 border-indigo-700/40',
  warning: 'bg-red-900/30 text-red-300 border-red-700/40',
  exam_trap: 'bg-orange-900/30 text-orange-300 border-orange-700/40',
  formula: 'bg-cyan-900/30 text-cyan-300 border-cyan-700/40',
  summary: 'bg-gray-800/60 text-gray-300 border-gray-700/40',
};

// Sub-score mini bar (0–100)
const SubScoreBar: React.FC<{ label: string; score: number; color: string }> = ({ label, score, color }) => (
  <div className="flex items-center gap-1">
    <span className="text-[8px] text-gray-500 w-14 flex-shrink-0 truncate">{label}</span>
    <div className="flex-1 h-1.5 bg-gray-700/60 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full ${color}`}
        style={{ width: `${Math.round(score)}%` }}
      />
    </div>
    <span className="text-[8px] font-mono text-gray-600 w-5 text-right">{Math.round(score)}</span>
  </div>
);

const SubScorePanel: React.FC<{ subScores: NonNullable<ParagraphUnit['subScores']>; expanded: boolean }> = ({
  subScores, expanded,
}) => {
  if (!expanded) return null;
  return (
    <div className="mt-2 p-1.5 bg-gray-900/50 rounded border border-gray-700/40 space-y-0.5">
      <SubScoreBar label="Concept" score={subScores.conceptScore} color="bg-blue-500/70" />
      <SubScoreBar label="Mechanism" score={subScores.mechanismScore} color="bg-purple-500/70" />
      <SubScoreBar label="Decision" score={subScores.decisionScore} color="bg-amber-500/70" />
      <SubScoreBar label="Exam Trap" score={subScores.examTrapScore} color="bg-red-500/70" />
      <SubScoreBar label="Math" score={subScores.mathScore} color="bg-cyan-500/70" />
      <SubScoreBar label="Clinical" score={subScores.clinicalScore} color="bg-teal-500/70" />
      <SubScoreBar label="Structure" score={subScores.structureScore} color="bg-green-500/60" />
    </div>
  );
};

// ============================================================================
// Intelligence Debug Panel — raw SourceRef + signal data for dev/audit mode
// ============================================================================

const DebugInfoPanel: React.FC<{
  unit: ParagraphUnit;
  sourceRef: SourceRef;
  expanded: boolean;
}> = ({ unit, sourceRef, expanded }) => {
  if (!expanded) return null;
  return (
    <div className="mt-2 p-2 bg-black/60 border border-teal-900/50 rounded text-[9px] font-mono space-y-0.5">
      <div className="text-teal-600 uppercase tracking-wide mb-1 text-[8px]">Intelligence Debug</div>
      <div><span className="text-gray-600">id:</span> <span className="text-teal-400">{unit.id}</span></div>
      <div><span className="text-gray-600">role:</span> <span className="text-amber-400">{unit.role}</span></div>
      <div><span className="text-gray-600">importance:</span> <span className="text-white">{unit.importance}</span></div>
      <div><span className="text-gray-600">startChar:</span> <span className="text-blue-400">{unit.startChar}</span> <span className="text-gray-600">endChar:</span> <span className="text-blue-400">{unit.endChar}</span></div>
      <div><span className="text-gray-600">pageIndex:</span> <span className="text-white">{sourceRef.pageIndex}</span></div>
      <div><span className="text-gray-600">quoteHash:</span> <span className="text-green-400">{sourceRef.quoteHash ?? '—'}</span></div>
      <div><span className="text-gray-600">textOrigin:</span> <span className="text-purple-400">{sourceRef.textOrigin ?? '—'}</span></div>
      <div><span className="text-gray-600">confidence:</span> <span className="text-white">{(sourceRef.confidence * 100).toFixed(0)}%</span></div>
      {unit.trapTypes && unit.trapTypes.length > 0 && (
        <div><span className="text-gray-600">trapTypes:</span> <span className="text-orange-400">{unit.trapTypes.join(', ')}</span></div>
      )}
      <div className="text-gray-600">signals: {[
        unit.signals.hasNumbers && 'numbers',
        unit.signals.hasUnits && 'units',
        unit.signals.hasNegation && 'negation',
        unit.signals.hasComparison && 'comparison',
        unit.signals.hasCausal && 'causal',
        unit.signals.hasTemporal && 'temporal',
        unit.signals.hasClinicalTerms && 'clinical',
      ].filter(Boolean).join(' · ')}</div>
    </div>
  );
};

// Inline trap badge using detectParagraphTraps for full prompt text
const InlineTrapBadges: React.FC<{ unit: ParagraphUnit }> = ({ unit }) => {
  const [expanded, setExpanded] = useState(false);
  if (!unit.trapTypes || unit.trapTypes.length === 0) return null;

  const hits = expanded
    ? detectParagraphTraps(unit)
    : undefined;

  return (
    <div className="mt-1">
      <div className="flex gap-1 flex-wrap items-center">
        {unit.trapTypes.map(t => (
          <span key={t} className="text-[8px] px-1 py-0.5 bg-amber-900/30 text-amber-400 rounded border border-amber-800/30">
            ⚠ {t.toLowerCase().replace(/_/g, ' ')}
          </span>
        ))}
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded(v => !v); }}
          className="text-[8px] text-amber-600 hover:text-amber-400 px-1 py-0.5 rounded border border-amber-900/30 bg-amber-900/10"
        >
          {expanded ? '▲' : '▼ what distractor?'}
        </button>
      </div>
      {expanded && hits && hits.length > 0 && (
        <div className="mt-1 space-y-1">
          {hits.map((hit, i) => (
            <div key={i} className="p-1.5 bg-amber-950/40 border border-amber-800/30 rounded text-[10px]">
              <span className="text-amber-300 font-semibold">⚠ DAT Trap: </span>
              <span className="text-amber-200">{hit.prompt}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const ParagraphUnitCard: React.FC<{
  unit: ParagraphUnit;
  tier: ParagraphTier;
  onHighlightParagraph?: (text: string) => void;
  onJumpToSource?: (ref: SourceRef) => void;
  /** When true, shows raw SourceRef + signal debug panel */
  debugMode?: boolean;
  /** When true, always show full text without clamp */
  deepMode?: boolean;
}> = ({ unit, tier, onHighlightParagraph, onJumpToSource, debugMode = false, deepMode = false }) => {
  const [showSubScores, setShowSubScores] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [textExpanded, setTextExpanded] = useState(false);
  const meta = TIER_META[tier];
  const roleColor = ROLE_COLORS[unit.role] ?? 'bg-gray-800/40 text-gray-400 border-gray-700/40';

  // Build a complete SourceRef from the ParagraphUnit for jump + debug
  const unitQuote = unit.text.slice(0, 180);
  const unitSourceRef: SourceRef = {
    pageIndex: unit.pageIndex,
    paragraphId: unit.id,
    startChar: unit.startChar,
    endChar: unit.endChar,
    quote: unitQuote,
    quoteText: unitQuote,
    quoteHash: buildQuoteHash(unitQuote),
    textOrigin: 'pdfText',
    confidence: unit.importance / 100,
  };

  return (
    <div
      className={`p-2.5 rounded-lg border border-gray-700/60 cursor-pointer hover:border-gray-500/60 transition-all ${meta.bg}`}
      onClick={() => onHighlightParagraph?.(unit.text)}
    >
      {/* Header: tier icon + role chip + score + sub-score toggle */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-xs flex-shrink-0">{meta.icon}</span>
        <span className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${roleColor}`}>
          {unit.role.replace('_', ' ')}
        </span>
        <div className="flex-1" />
        {unit.subScores && (
          <button
            onClick={(e) => { e.stopPropagation(); setShowSubScores(v => !v); }}
            className="text-[8px] text-gray-500 hover:text-gray-300 px-1 py-0.5 rounded bg-gray-700/30 border border-gray-700/40"
            title="Toggle sub-scores"
          >
            {showSubScores ? '▲ scores' : '▼ scores'}
          </button>
        )}
        {debugMode && (
          <button
            onClick={(e) => { e.stopPropagation(); setShowDebug(v => !v); }}
            className="text-[8px] text-teal-700 hover:text-teal-400 px-1 py-0.5 rounded bg-teal-900/20 border border-teal-900/30"
            title="Toggle debug info"
          >
            {showDebug ? '▲ dbg' : '▼ dbg'}
          </button>
        )}
        <span className="text-[10px] font-mono text-gray-500 flex-shrink-0">{unit.importance}</span>
      </div>

      {/* Importance bar */}
      <ImportanceBar score={unit.importance} className="mb-1.5 mx-0.5" />

      {/* Sub-score visualization (expandable) */}
      {unit.subScores && (
        <SubScorePanel subScores={unit.subScores} expanded={showSubScores} />
      )}

      {/* Why-scored signal labels */}
      {unit.whyScoredSignals && unit.whyScoredSignals.length > 0 && (
        <div className="flex gap-1 mt-1.5 flex-wrap">
          {unit.whyScoredSignals.map(sig => (
            <span key={sig} className="text-[8px] px-1 py-0.5 bg-teal-900/30 text-teal-500 rounded border border-teal-800/30">
              {sig}
            </span>
          ))}
        </div>
      )}

      {/* Trap badges — inline with expandable DAT Trap prompt */}
      <div onClick={(e) => e.stopPropagation()}>
        <InlineTrapBadges unit={unit} />
      </div>

      {/* Source text — verbatim, expand/collapse in quick mode */}
      <div className="mt-1.5">
        <p className={`text-[11px] text-gray-300 ${deepMode || textExpanded ? '' : 'line-clamp-3'}`}>
          {unit.text}
        </p>
        {!deepMode && unit.text.length > 200 && (
          <button
            onClick={(e) => { e.stopPropagation(); setTextExpanded(v => !v); }}
            className="mt-0.5 text-[9px] text-teal-600 hover:text-teal-400"
          >
            {textExpanded ? '▲ Collapse' : '▼ Expand source'}
          </button>
        )}
      </div>

      {/* Key terms */}
      {unit.keyTerms.length > 0 && (
        <div className="flex gap-1 mt-1.5 flex-wrap">
          {unit.keyTerms.slice(0, 4).map(t => (
            <span key={t} className="text-[9px] px-1 py-0.5 bg-gray-700/40 text-gray-400 rounded border border-gray-700/40">
              {t}
            </span>
          ))}
        </div>
      )}

      {/* Signal indicators */}
      <div className="flex gap-1 mt-1 flex-wrap">
        {unit.signals.hasClinicalTerms && (
          <span className="text-[8px] px-1 py-0.5 bg-teal-900/40 text-teal-500 rounded">clinical</span>
        )}
        {unit.signals.hasNumbers && (
          <span className="text-[8px] px-1 py-0.5 bg-blue-900/40 text-blue-500 rounded">numbers</span>
        )}
        {unit.signals.hasCausal && (
          <span className="text-[8px] px-1 py-0.5 bg-purple-900/40 text-purple-500 rounded">causal</span>
        )}
        {unit.signals.hasNegation && (
          <span className="text-[8px] px-1 py-0.5 bg-red-900/30 text-red-400 rounded">negation</span>
        )}
      </div>

      {/* Source anchor with jump-to-source */}
      {onJumpToSource && (
        <div className="mt-2" onClick={(e) => e.stopPropagation()}>
          <SourceAnchor
            sourceRef={unitSourceRef}
            paragraphText={unit.text}
            onJump={onJumpToSource}
            collapsed={true}
          />
        </div>
      )}

      {/* Intelligence Debug Panel */}
      <div onClick={(e) => e.stopPropagation()}>
        <DebugInfoPanel unit={unit} sourceRef={unitSourceRef} expanded={showDebug} />
      </div>
    </div>
  );
};

// ============================================================================
// Main Component
// ============================================================================

export const PriorityComprehensionPanel: React.FC<PriorityComprehensionPanelProps> = ({
  rankedInsights,
  pageIntelligence,
  onInsightClick,
  onJumpToPage,
  onSaveToNoteLab,
  onMarkConfusing,
  onHighlightParagraph,
  onJumpToSource,
  insightScale = 1.0,
  activeItemId,
  syncEnabled = true,
  deepAnalysisMode = false,
}) => {
  // Ref map: insight item ID → DOM element for scroll-into-view
  const itemRefs = useRef<Map<string, HTMLElement>>(new Map());

  // Local Quick|Deep toggle — overrides external deepAnalysisMode when user switches
  const [localDeepMode, setLocalDeepMode] = useState<boolean | null>(null);
  const isDeepMode = localDeepMode !== null ? localDeepMode : deepAnalysisMode;

  // Collapse state for supporting/background tiers in deep analysis
  const [showBackground, setShowBackground] = useState(false);

  // Scroll active item into view when sync is on and activeItemId changes
  useEffect(() => {
    if (!syncEnabled || !activeItemId) return;
    const el = itemRefs.current.get(activeItemId);
    if (el) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [activeItemId, syncEnabled]);

  // Categorize all priority items
  const categorizedItems = useMemo(() => {
    return categorizePriorityItems(rankedInsights, pageIntelligence);
  }, [rankedInsights, pageIntelligence]);

  // Filter to only non-empty categories
  const activeCategories = useMemo(() => {
    const result: Array<{ category: PriorityItem['category']; items: PriorityItem[] }> = [];
    const order: PriorityItem['category'][] = ['high_yield', 'mechanism', 'trap', 'threshold', 'clinical'];
    for (const cat of order) {
      const items = categorizedItems.get(cat) || [];
      if (items.length > 0) result.push({ category: cat, items });
    }
    return result;
  }, [categorizedItems]);

  // Paragraph unit tiers (no suppression)
  const paragraphTiers = useMemo(() => {
    const units = pageIntelligence?.paragraphUnits ?? [];
    return groupParagraphUnitsByTier(units);
  }, [pageIntelligence]);

  const totalParagraphUnits = (pageIntelligence?.paragraphUnits ?? []).length;

  // Total count for header
  const totalItems = activeCategories.reduce((sum, c) => sum + c.items.length, 0);

  // If no content at all, show a helpful prompt (not an empty state error)
  if (totalItems === 0 && totalParagraphUnits === 0) {
    // Show continuity scaffold even for empty pages
    if (pageIntelligence?.continuity) {
      const panelStyle = { '--insightScale': String(insightScale) } as React.CSSProperties;
      return (
        <div className="p-3 overflow-y-auto h-full" style={panelStyle}>
          <ContinuitySection continuity={pageIntelligence.continuity} />
          <div className="text-center py-6">
            <div className="text-3xl mb-2">📖</div>
            <p className="text-xs text-gray-500">
              Extract the page to populate priority cards.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="p-4 h-full flex flex-col items-center justify-center">
        <div className="text-center max-w-[240px]">
          <div className="text-4xl mb-4">📖</div>
          <h3 className="text-sm font-medium text-gray-300 mb-2">Ready to Extract</h3>
          <p className="text-xs text-gray-500 mb-4">
            Click "Extract Page" to discover what matters most on this page.
          </p>
          <div className="text-[10px] text-gray-600 space-y-1">
            <p>• High-yield statements</p>
            <p>• Key mechanisms</p>
            <p>• Exam traps</p>
            <p>• Clinical relevance</p>
          </div>
        </div>
      </div>
    );
  }

  const panelStyle = { '--insightScale': String(insightScale) } as React.CSSProperties;

  return (
    <div className="p-3 overflow-y-auto h-full" style={panelStyle}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold text-teal-400 flex items-center gap-2">
            <span>🎯</span>
            Priority Comprehension
          </h2>
          <p className="text-[10px] text-gray-500 mt-0.5">
            What you must know from this page
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Quick | Deep segmented toggle */}
          <div className="flex rounded border border-gray-700 overflow-hidden">
            <button
              onClick={() => setLocalDeepMode(false)}
              className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${
                !isDeepMode
                  ? 'bg-teal-700/60 text-teal-200 border-r border-teal-600/50'
                  : 'bg-gray-800/60 text-gray-500 hover:text-gray-300 border-r border-gray-700'
              }`}
            >
              Quick
            </button>
            <button
              onClick={() => setLocalDeepMode(true)}
              className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${
                isDeepMode
                  ? 'bg-teal-700/60 text-teal-200'
                  : 'bg-gray-800/60 text-gray-500 hover:text-gray-300'
              }`}
            >
              Deep
            </button>
          </div>
          <span className="px-2 py-0.5 text-[10px] bg-teal-500/20 text-teal-400 rounded">
            {totalItems}
          </span>
        </div>
      </div>

      {/* Priority Score Legend */}
      {totalItems > 0 && (
        <div className="flex gap-2 mb-4 pb-3 border-b border-gray-700">
          {(['MUST_KNOW', 'HIGH_YIELD', 'SUPPORTING'] as PriorityScore[]).map(priority => {
            const style = PRIORITY_STYLES[priority];
            const count = activeCategories.reduce((sum, c) =>
              sum + c.items.filter(i => i.priority === priority).length, 0
            );
            if (count === 0) return null;
            return (
              <div key={priority} className="flex items-center gap-1 text-[10px]">
                <span>{style.icon}</span>
                <span className={style.text}>{priority.replace('_', ' ')}</span>
                <span className="text-gray-500">({count})</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Structure Map — always shown when available */}
      <StructureMapSection
        structureMap={pageIntelligence?.structureMap}
        paragraphUnits={pageIntelligence?.paragraphUnits}
        pageNumber={pageIntelligence?.pageNumber}
        onHighlightParagraph={onHighlightParagraph}
        onJumpToSource={onJumpToSource}
      />

      {/* Insight Continuity — always shown */}
      {pageIntelligence?.continuity && (
        <ContinuitySection continuity={pageIntelligence.continuity} />
      )}

      {/* Deep Analysis Mode: Paragraph Units (all tiers, no suppression) */}
      {isDeepMode && totalParagraphUnits > 0 && (
        <section className="mb-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm">🔬</span>
            <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wide">
              Full Paragraph Intelligence
            </h3>
            <span className="text-[10px] text-gray-500">({totalParagraphUnits})</span>
          </div>

          {(['core', 'important', 'supporting'] as ParagraphTier[]).map(tier => {
            const units = paragraphTiers.get(tier) ?? [];
            if (units.length === 0) return null;
            const meta = TIER_META[tier];
            return (
              <div key={tier} className="mb-3">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="text-xs">{meta.icon}</span>
                  <span className={`text-[10px] font-semibold uppercase ${meta.text}`}>
                    {meta.label}
                  </span>
                  <span className="text-[10px] text-gray-600">({units.length})</span>
                </div>
                <div className="space-y-1.5">
                  {units.map(u => (
                    <ParagraphUnitCard
                      key={u.id}
                      unit={u}
                      tier={tier}
                      onHighlightParagraph={onHighlightParagraph}
                      onJumpToSource={onJumpToSource}
                      debugMode={isDeepMode}
                      deepMode={isDeepMode}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          {/* Background tier — collapsed by default */}
          {(paragraphTiers.get('background') ?? []).length > 0 && (
            <div className="mb-3">
              <button
                className="flex items-center gap-1.5 text-[10px] text-gray-500 hover:text-gray-400 mb-1"
                onClick={() => setShowBackground(b => !b)}
              >
                <span>{showBackground ? '▼' : '▶'}</span>
                <span className="uppercase tracking-wide">Background</span>
                <span>({paragraphTiers.get('background')!.length})</span>
              </button>
              {showBackground && (
                <div className="space-y-1.5">
                  {(paragraphTiers.get('background') ?? []).map(u => (
                    <ParagraphUnitCard
                      key={u.id}
                      unit={u}
                      tier="background"
                      onHighlightParagraph={onHighlightParagraph}
                      onJumpToSource={onJumpToSource}
                      debugMode={isDeepMode}
                      deepMode={isDeepMode}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Category Sections */}
      <div className="space-y-5">
        {activeCategories.map(({ category, items }) => (
          <CategorySection
            key={category}
            category={category}
            items={items}
            rankedInsights={rankedInsights}
            activeItemId={activeItemId}
            itemRefs={itemRefs.current}
            onInsightClick={onInsightClick}
            onJumpToPage={onJumpToPage}
            onSaveToNoteLab={onSaveToNoteLab}
            onMarkConfusing={onMarkConfusing}
            onHighlightParagraph={onHighlightParagraph}
            onJumpToSource={onJumpToSource}
          />
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// Category Section
// ============================================================================

interface CategorySectionProps {
  category: PriorityItem['category'];
  items: PriorityItem[];
  rankedInsights: RankedInsight[];
  activeItemId?: string | null;
  itemRefs: Map<string, HTMLElement>;
  onInsightClick?: (insight: RankedInsight) => void;
  onJumpToPage?: (page: number) => void;
  onSaveToNoteLab?: (insight: RankedInsight) => void;
  onMarkConfusing?: (insight: RankedInsight) => void;
  onHighlightParagraph?: (text: string) => void;
  onJumpToSource?: (ref: SourceRef) => void;
}

const CategorySection: React.FC<CategorySectionProps> = ({
  category,
  items,
  rankedInsights,
  activeItemId,
  itemRefs,
  onInsightClick,
  onJumpToPage,
  onSaveToNoteLab,
  onMarkConfusing,
  onHighlightParagraph,
  onJumpToSource,
}) => {
  const header = CATEGORY_HEADERS[category];
  const [showAll, setShowAll] = useState(false);
  const visibleItems = showAll ? items : items.slice(0, 8);

  return (
    <section>
      {/* Category Header */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm">{header.icon}</span>
        <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wide">
          {header.label}
        </h3>
        <span className="text-[10px] text-gray-500">({items.length})</span>
      </div>

      {/* Items */}
      <div className="space-y-2">
        {visibleItems.map(item => (
          <PriorityItemCard
            key={item.id}
            item={item}
            rankedInsights={rankedInsights}
            isActive={activeItemId === item.id}
            itemRefs={itemRefs}
            onInsightClick={onInsightClick}
            onJumpToPage={onJumpToPage}
            onSaveToNoteLab={onSaveToNoteLab}
            onMarkConfusing={onMarkConfusing}
            onHighlightParagraph={onHighlightParagraph}
            onJumpToSource={onJumpToSource}
          />
        ))}

        {/* Expand / collapse control */}
        {items.length > 8 && (
          <button
            className="text-[10px] text-teal-500 hover:text-teal-400 pl-2 italic"
            onClick={() => setShowAll(s => !s)}
          >
            {showAll ? `▲ Show less` : `▼ +${items.length - 8} more items`}
          </button>
        )}
      </div>
    </section>
  );
};

// ============================================================================
// Priority Item Card
// ============================================================================

interface PriorityItemCardProps {
  item: PriorityItem;
  rankedInsights: RankedInsight[];
  isActive?: boolean;
  itemRefs: Map<string, HTMLElement>;
  onInsightClick?: (insight: RankedInsight) => void;
  onJumpToPage?: (page: number) => void;
  onSaveToNoteLab?: (insight: RankedInsight) => void;
  onMarkConfusing?: (insight: RankedInsight) => void;
  onHighlightParagraph?: (text: string) => void;
  onJumpToSource?: (ref: SourceRef) => void;
}

const PriorityItemCard: React.FC<PriorityItemCardProps> = ({
  item,
  rankedInsights,
  isActive = false,
  itemRefs,
  onInsightClick,
  onJumpToPage,
  onSaveToNoteLab,
  onMarkConfusing,
  onHighlightParagraph,
  onJumpToSource,
}) => {
  const [contentExpanded, setContentExpanded] = useState(false);
  const style = PRIORITY_STYLES[item.priority];
  const linkedInsight = rankedInsights.find(r => r.id === item.id);
  const page = item.evidence?.[0]?.page;

  const handleClick = () => {
    // Use sourceRef.quote for precise paragraph focus; fall back to content text
    const focusText = item.sourceRef?.quote ?? item.content;
    if (onHighlightParagraph && focusText) {
      onHighlightParagraph(focusText);
    }
    if (linkedInsight && onInsightClick) {
      onInsightClick(linkedInsight);
    }
  };

  // Base font sizes scaled by --insightScale CSS variable (set by parent panel)
  const titleStyle: React.CSSProperties = { fontSize: 'calc(0.75rem * var(--insightScale, 1))' };
  const bodyStyle: React.CSSProperties = {
    fontSize: 'calc(0.6875rem * var(--insightScale, 1))',
    lineHeight: 'calc(1.4 * var(--insightScale, 1))',
  };
  const metaStyle: React.CSSProperties = { fontSize: 'calc(0.625rem * var(--insightScale, 1))' };

  return (
    <div
      ref={(el) => {
        if (el) itemRefs.set(item.id, el);
        else itemRefs.delete(item.id);
      }}
      onClick={handleClick}
      className={`
        p-2.5 rounded-lg border transition-all cursor-pointer
        ${style.bg} hover:border-gray-600
        ${isActive ? 'border-teal-500 ring-1 ring-teal-500/50' : 'border-gray-700'}
      `}
    >
      {/* Header Row */}
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm flex-shrink-0">{style.icon}</span>
          <span className={`font-medium ${style.text} truncate`} style={titleStyle}>
            {item.title}
          </span>
        </div>

        {/* Page link */}
        {page !== undefined && onJumpToPage && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onJumpToPage(page);
            }}
            className="text-teal-400 hover:text-teal-300 flex-shrink-0"
            style={metaStyle}
          >
            p.{page + 1}
          </button>
        )}
      </div>

      {/* Content — monospace for math items, prose otherwise. Expand/collapse for long text. */}
      {item.tags?.includes('math') ? (
        <div>
          <code
            className={`block text-teal-300 bg-gray-900/60 rounded px-2 py-1 pl-5 overflow-x-auto whitespace-pre-wrap font-mono ${contentExpanded ? '' : 'line-clamp-3'}`}
            style={bodyStyle}
          >
            {item.content}
          </code>
          {item.content.length > 180 && (
            <button
              onClick={(e) => { e.stopPropagation(); setContentExpanded(v => !v); }}
              className="mt-0.5 pl-5 text-[9px] text-teal-600 hover:text-teal-400"
            >
              {contentExpanded ? '▲ Collapse' : '▼ Expand'}
            </button>
          )}
        </div>
      ) : (
        <div>
          <p className={`text-gray-300 pl-5 ${contentExpanded ? '' : 'line-clamp-2'}`} style={bodyStyle}>
            {item.content}
          </p>
          {item.content.length > 160 && (
            <button
              onClick={(e) => { e.stopPropagation(); setContentExpanded(v => !v); }}
              className="mt-0.5 pl-5 text-[9px] text-teal-600 hover:text-teal-400"
            >
              {contentExpanded ? '▲ Collapse' : '▼ Expand source'}
            </button>
          )}
        </div>
      )}

      {/* Tags */}
      {item.tags && item.tags.length > 0 && (
        <div className="flex gap-1 mt-1.5 pl-5 flex-wrap">
          {item.tags.slice(0, 3).map(tag => (
            <span
              key={tag}
              className="px-1 py-0.5 bg-gray-700/50 text-gray-400 rounded"
              style={metaStyle}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Source Anchor — only when we have a sourceRef */}
      {item.sourceRef && (onJumpToSource || onJumpToPage) && (
        <div className="mt-2 pl-1" onClick={(e) => e.stopPropagation()}>
          <SourceAnchor
            sourceRef={item.sourceRef}
            onJump={onJumpToSource}
            collapsed={true}
          />
        </div>
      )}

      {/* Actions (only if linked to an insight) */}
      {linkedInsight && (onSaveToNoteLab || onMarkConfusing) && (
        <div className="flex gap-1 mt-2 pl-5">
          {onSaveToNoteLab && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSaveToNoteLab(linkedInsight);
              }}
              className="px-1.5 py-0.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded"
              style={metaStyle}
            >
              💾 Save
            </button>
          )}
          {onMarkConfusing && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMarkConfusing(linkedInsight);
              }}
              className="px-1.5 py-0.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded"
              style={metaStyle}
            >
              ❓ Confusing
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default PriorityComprehensionPanel;
