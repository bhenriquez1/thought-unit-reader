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
import { scoreParagraph, detectClinicalReasoning, applyMicroPolish, orientParagraph, adaptTone, TONE_LABELS, PURPOSE_TAG_CONFIG } from '@/lib/intelligence';
import { useInsightsPanelStore } from '@/lib/stores/insightsPanelStore';
import type { InsightMode } from '@/lib/stores/insightsPanelStore';
import type { ScoreResult, ClinicalReasoningResult, ToneLevel, OrientationHeader } from '@/lib/intelligence';

// ============================================================================
// Types
// ============================================================================

export type PriorityScore = 'MUST_KNOW' | 'HIGH_YIELD' | 'SUPPORTING';

/** Tier grouping for raw paragraph units (no suppression) */
type ParagraphTier = 'core' | 'important' | 'supporting' | 'background';
type DepthLevel = 'minimal' | 'standard' | 'deep';
type Tone = 'polish' | 'student' | 'clinical' | 'expert';
type InsightView = 'condensed' | 'expanded';

type InsightSettings = {
  depth: DepthLevel;
  tone: Tone;
  view: InsightView;
};

type ReadingMode = 'minimal' | 'standard' | 'deep' | 'condensed' | 'expanded';

type SectionSynthesis = {
  title: string;
  overview: string;
  plainLanguage: string;
  structure: string[];
  takeaways: string[];
  whyItMatters: string;
  anchor?: {
    quote: string;
    sourceRef?: SourceRef;
  };
};

type InsightVariant = {
  title?: string;
  body: string;
  bullets?: string[];
  sectionContext?: {
    sectionPurpose: string;
    roleInChapter: string;
    dependencyLinks: string;
    nextConcept: string;
  };
};

type ParagraphInsight = {
  anchorId: string;
  variants: Record<Tone, InsightVariant>;
  updatedAt: number;
  statusByTone: Record<Tone, 'idle' | 'loading' | 'ready' | 'error'>;
};

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

interface LayeredCardContent {
  snapshot: string;
  coreMeaning: string[];
  structuredLogic: string[];
  examClinical: string[];
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
  /**
   * When true (extraction in flight), show "Scanning page…" skeleton instead of
   * the generic "Ready to Extract" prompt.
   */
  isExtracting?: boolean;
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


const ESSENTIAL_CATEGORY_ORDER: PriorityItem['category'][] = ['high_yield', 'clinical', 'mechanism', 'threshold', 'trap'];
const ESSENTIAL_CATEGORY_LIMITS: Partial<Record<PriorityItem['category'], number>> = {
  high_yield: 2,
  clinical: 1,
};


function pickEssentialItems(
  categories: Map<PriorityItem['category'], PriorityItem[]>,
  maxItems = 3,
): Array<{ category: PriorityItem['category']; items: PriorityItem[] }> {
  const picked: Array<{ category: PriorityItem['category']; items: PriorityItem[] }> = [];
  let remaining = maxItems;

  for (const category of ESSENTIAL_CATEGORY_ORDER) {
    if (remaining <= 0) break;
    const items = categories.get(category) ?? [];
    if (items.length === 0) continue;

    const categoryLimit = ESSENTIAL_CATEGORY_LIMITS[category] ?? 1;
    const take = Math.min(items.length, categoryLimit, remaining);
    if (take <= 0) continue;

    picked.push({ category, items: items.slice(0, take) });
    remaining -= take;
  }

  return picked;
}

function toStudentSentence(text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  return cleaned.length > 200 ? `${cleaned.slice(0, 197).trimEnd()}…` : cleaned;
}

function buildSectionSynthesis(pageIntelligence?: PageIntelligence | null): SectionSynthesis | null {
  if (!pageIntelligence) return null;

  const units = (pageIntelligence.paragraphUnits ?? []).filter((u) => u.text.trim().length > 20);
  const sortedUnits = [...units].sort((a, b) => b.importance - a.importance);
  const topic = pageIntelligence.structureMap?.topic?.trim() || `Page ${pageIntelligence.pageNumber}`;
  const mainUnit = sortedUnits[0];

  if (!mainUnit) return null;

  const overview = pageIntelligence.explain?.summary?.trim() || toStudentSentence(mainUnit.text);
  const plainLanguage = toStudentSentence(
    pageIntelligence.continuity?.corePattern
      ? `This section teaches ${pageIntelligence.continuity.corePattern.toLowerCase()}.`
      : `This section focuses on ${topic.toLowerCase()}.`
  );

  const structureFromMap = (pageIntelligence.structureMap?.nodes ?? [])
    .slice(0, 4)
    .map((node, idx) => `Part ${idx + 1}: ${node.label.toLowerCase()} — ${toStudentSentence(node.text)}`);

  const structure = structureFromMap.length > 0
    ? structureFromMap
    : sortedUnits.slice(0, 4).map((unit, idx) => `Part ${idx + 1}: ${unit.role.replace('_', ' ')} — ${toStudentSentence(firstSentence(unit.text))}`);

  const takeawaysFromExplain = (pageIntelligence.explain?.bullets ?? []).map(toStudentSentence).filter(Boolean);
  const takeaways = (takeawaysFromExplain.length > 0
    ? takeawaysFromExplain
    : sortedUnits.slice(0, 4).map((unit) => toStudentSentence(firstSentence(unit.text))))
    .filter(Boolean)
    .slice(0, 5);

  const whyItMatters = toStudentSentence(
    pageIntelligence.continuity?.conceptualBridge
      || pageIntelligence.continuity?.clinicalConnection
      || `Understanding this section helps you connect the main idea to what comes next in the chapter.`
  );

  return {
    title: topic,
    overview: toStudentSentence(overview),
    plainLanguage,
    structure,
    takeaways,
    whyItMatters,
    anchor: {
      quote: toStudentSentence(mainUnit.text),
      sourceRef: {
        pageIndex: mainUnit.pageIndex,
        paragraphId: mainUnit.id,
        startChar: mainUnit.startChar,
        endChar: mainUnit.endChar,
        quote: toStudentSentence(mainUnit.text),
        quoteText: mainUnit.text,
        quoteHash: buildQuoteHash(mainUnit.text),
        textOrigin: 'pdfText',
        confidence: mainUnit.importance / 100,
      },
    },
  };
}



function inferReadingMode(mode: InsightMode, depth: DepthLevel, view: InsightView): ReadingMode {
  if (mode === 'deep' || depth === 'deep') return 'deep';
  if (view === 'condensed' && depth === 'minimal') return 'minimal';
  if (view === 'condensed') return 'condensed';
  if (view === 'expanded' && depth !== 'minimal') return 'expanded';
  return 'standard';
}

function applyReadingModeSettings(
  nextMode: ReadingMode,
  handlers: {
    setMode: (mode: InsightMode) => void;
    setDepth: (depth: DepthLevel) => void;
    setView: (view: InsightView) => void;
    setEssentialStudentMode: (enabled: boolean) => void;
  }
) {
  if (nextMode === 'minimal') {
    handlers.setMode('quick');
    handlers.setDepth('minimal');
    handlers.setView('condensed');
    handlers.setEssentialStudentMode(true);
    return;
  }
  if (nextMode === 'standard') {
    handlers.setMode('quick');
    handlers.setDepth('standard');
    handlers.setView('expanded');
    handlers.setEssentialStudentMode(true);
    return;
  }
  if (nextMode === 'deep') {
    handlers.setMode('deep');
    handlers.setDepth('deep');
    handlers.setView('expanded');
    handlers.setEssentialStudentMode(false);
    return;
  }
  if (nextMode === 'condensed') {
    handlers.setMode('quick');
    handlers.setDepth('minimal');
    handlers.setView('condensed');
    handlers.setEssentialStudentMode(true);
    return;
  }
  handlers.setMode('quick');
  handlers.setDepth('standard');
  handlers.setView('expanded');
  handlers.setEssentialStudentMode(false);
}

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

      const quoteText = matchedUnit?.text ?? '';
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
        content: sourceRef?.quote || pi.body,
        priority,
        category,
        tags: pi.tags,
        sourceRef,
        // Attach page ref so jump-to-page button renders
        evidence: [{ page: piPage, text: pi.body }],
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

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(Boolean);
}


function firstSentence(text: string): string {
  const [first] = splitSentences(text);
  return (first || text || '').trim();
}

function buildLayeredCardContent(item: PriorityItem, settings: InsightSettings): LayeredCardContent {
  const source = item.content || item.title;
  const snapshot = toneSafe(firstSentence(source), settings.tone as ToneLevel);
  const coreMeaning = splitSentences(source)
    .filter(Boolean)
    .slice(0, settings.depth === 'minimal' ? 1 : 3)
    .map((sentence) => toneSafe(sentence, settings.tone as ToneLevel));

  const structuredLogic = [
    toneSafe(`Mechanism → ${item.title}`, settings.tone as ToneLevel),
    toneSafe(`Application → prioritize this as ${item.priority.replace('_', ' ').toLowerCase()}.`, settings.tone as ToneLevel),
  ];

  const examClinical = [
    toneSafe('Trap: look for look-alike distractors and negation wording around this concept.', settings.tone as ToneLevel),
    toneSafe('Decision shift: apply this anchor when choosing diagnosis, threshold, or intervention.', settings.tone as ToneLevel),
  ];

  return { snapshot, coreMeaning, structuredLogic, examClinical };
}

function toneSafe(text: string, toneLevel: ToneLevel): string {
  try {
    return adaptTone(text, toneLevel) || text;
  } catch {
    return text;
  }
}

function buildExamSignalBullets(unit: ParagraphUnit, toneLevel: ToneLevel, depthLevel: DepthLevel): string[] {
  const lower = unit.text.toLowerCase();
  const hasIfThen = /\bif\b.+\bthen\b|\bwhen\b.+\b(consider|expect|suspect|do)\b/.test(lower);
  const hasThreshold = /\b(threshold|cutoff|greater than|less than|\d+\s?(mg|%|mm|cm|mmhg|meq|iu))\b/.test(lower);
  const hasConfuser = /\b(confus|similar|mimic|pitfall|except|not)\b/.test(lower) || unit.signals.hasNegation;

  const bullets = [
    toneSafe(hasIfThen
      ? 'If this trigger appears, then use this paragraph to drive the next diagnostic or management step.'
      : 'If this concept appears in a vignette, then link it to the most likely action or interpretation.'
    , toneLevel),
    toneSafe(hasThreshold
      ? 'Decision cue: identify the threshold/cutoff and what changes once crossed.'
      : 'Decision cue: identify what specific finding changes the correct answer choice.'
    , toneLevel),
  ];

  if (depthLevel !== 'minimal') {
    bullets.push(
      toneSafe('Pitfall: avoid overgeneralizing this rule outside the context described in the paragraph.', toneLevel),
      toneSafe(hasConfuser
        ? 'Confuser: separate this concept from look-alikes by focusing on the discriminator stated here.'
        : 'Exam pattern: this is often tested as a discriminator between two plausible choices.'
      , toneLevel),
    );
  }

  if (depthLevel === 'deep') {
    bullets.push(toneSafe('Edge case: check exceptions, special populations, or severity shifts before finalizing the answer.', toneLevel));
  }

  return bullets;
}

function buildSectionContext(unit: ParagraphUnit, orientation: OrientationHeader, toneLevel: ToneLevel) {
  const sectionPurpose = toneSafe(
    `This paragraph anchors ${orientation.section || 'the current section'} by clarifying ${orientation.purpose.toLowerCase()}.`,
    toneLevel,
  );
  const roleInChapter = toneSafe(
    `Role in chapter: ${unit.role.replace('_', ' ')} bridge for paragraph ${(orientation.paragraphIndex ?? 0) + 1}.`,
    toneLevel,
  );
  const dependencyLinks = toneSafe(
    unit.keyTerms.length > 0
      ? `Depends on: ${unit.keyTerms.slice(0, 3).join(', ')}.`
      : 'Depends on preceding definitions and mechanism cues from this section.',
    toneLevel,
  );
  const nextConcept = toneSafe(
    unit.signals.hasClinicalTerms
      ? 'Next concept: apply this to diagnosis/treatment decisions in subsequent paragraphs.'
      : 'Next concept: expect a downstream mechanism or exam discriminator after this paragraph.',
    toneLevel,
  );

  return { sectionPurpose, roleInChapter, dependencyLinks, nextConcept };
}

/** Build a single check-yourself question from paragraph role */
function buildCheckQuestion(unit: ParagraphUnit): string {
  if (unit.role === 'definition') return 'Can you define this term without looking at the text?';
  if (unit.role === 'mechanism') return 'What is the first step in this pathway?';
  if (unit.role === 'exam_trap') return 'Which word in this paragraph would appear in a distractor answer choice?';
  if (unit.role === 'clinical') return 'What would change in management if this finding were absent?';
  if (unit.role === 'formula') return 'What does each variable represent and when is this applied clinically?';
  return 'What is the single most important takeaway from this paragraph?';
}

/**
 * Generate persona-branched paragraph intelligence.
 * Each persona produces a structurally different body and bullet set.
 *   student  → definition + why it matters + check question
 *   clinical → decision points + threshold triggers + differentials
 *   expert   → nuance/exceptions + discriminators + pitfalls
 */
function generateParagraphIntelligence(
  unit: ParagraphUnit,
  orientation: OrientationHeader,
  settings: { depth: DepthLevel; audience: ToneLevel; view: 'condensed' | 'expanded' },
): InsightVariant {
  const { depth, audience } = settings;
  const text = audience === 'polish' ? applyMicroPolish(unit.text) : toneSafe(unit.text, audience);
  const sentences = splitSentences(text);
  const snapshot = sentences[0] || text || 'No paragraph content available.';
  const role = unit.role.replace('_', ' ');
  const purpose = orientation.purpose;
  const sectionContext = buildSectionContext(unit, orientation, audience);
  const examSignal = buildExamSignalBullets(unit, audience, depth);
  const keyTermStr = unit.keyTerms.slice(0, 2).join(' and ') || 'this concept';

  // ── Student: definition → why it matters → check yourself ─────────────────
  if (audience === 'student') {
    const whyLine = toneSafe(
      `Understanding this helps you answer exam questions about ${keyTermStr}.`,
      audience,
    );
    const bodyParts = [
      `What This Means\n${toneSafe(`This paragraph is a ${role} that ${purpose.toLowerCase()}.`, audience)}`,
      depth !== 'minimal' ? `Why It Matters\n${whyLine}` : null,
      depth === 'deep' ? `Check Yourself\n${buildCheckQuestion(unit)}` : null,
    ];
    return {
      title: snapshot,
      body: bodyParts.filter(Boolean).join('\n\n'),
      bullets: [
        `Start here: ${snapshot.split(/[,.]/)[0].trim()}.`,
        ...examSignal.slice(0, depth === 'minimal' ? 0 : depth === 'standard' ? 1 : 2),
      ],
      sectionContext,
    };
  }

  // ── Clinical: decision points → thresholds → differentials ────────────────
  if (audience === 'clinical') {
    const actionLine = unit.signals.hasClinicalTerms
      ? toneSafe(`Clinical action hinge: ${purpose}.`, audience)
      : toneSafe(`Apply when: ${purpose.toLowerCase()}.`, audience);
    const bodyParts = [
      `Decision Points\n${actionLine}`,
      unit.signals.hasNumbers && depth !== 'minimal'
        ? `Threshold / Cutoff\nNumeric values present — identify the cutoff direction before answering.`
        : null,
      depth === 'deep'
        ? `Differential Considerations\nSeparate from look-alikes by the discriminator stated in this paragraph.`
        : null,
    ];
    return {
      title: snapshot,
      body: bodyParts.filter(Boolean).join('\n\n'),
      bullets: [
        `Action trigger: if this concept appears in a vignette, confirm ${role} before deciding.`,
        ...examSignal.slice(0, depth === 'minimal' ? 0 : 2),
      ],
      sectionContext,
    };
  }

  // ── Expert (including 'polish' fallback): nuance → discriminators → pitfalls
  const bodyParts = [
    `Nuance & Exceptions\n${
      unit.signals.hasNegation
        ? toneSafe('Negation or exception present — trace the specific condition that inverts the rule.', audience)
        : toneSafe(`Edge case: check for population-specific modifications to the rule stated here.`, audience)
    }`,
    depth !== 'minimal'
      ? `Discriminators\n${toneSafe(`Separate this ${role} from look-alikes by: ${purpose.toLowerCase()}.`, audience)}`
      : null,
    depth === 'deep'
      ? `Pitfalls\n${examSignal.slice(-2).join(' ')}`
      : null,
  ];
  return {
    title: snapshot,
    body: bodyParts.filter(Boolean).join('\n\n'),
    bullets: [
      `Discriminate by: ${purpose.toLowerCase()}.`,
      ...examSignal.slice(0, depth === 'minimal' ? 0 : depth === 'standard' ? 1 : 3),
    ],
    sectionContext,
  };
}

function buildInsightVariant(unit: ParagraphUnit, orientation: OrientationHeader, toneLevel: ToneLevel, depthLevel: DepthLevel, view: 'condensed' | 'expanded'): InsightVariant {
  return generateParagraphIntelligence(unit, orientation, {
    depth: depthLevel,
    audience: toneLevel,
    view,
  });
}

function buildLocationMeta(unit: ParagraphUnit, unitIndex = 0) {
  const yPct = unit.bbox ? Math.max(0, Math.min(100, Math.round((unit.bbox.y + unit.bbox.h / 2) * 100))) : Math.max(0, Math.min(100, Math.round(((unit.startChar + unit.endChar) / 2 / Math.max(unit.endChar + 1, 1)) * 100)));
  const column: 'left' | 'right' | 'full' = !unit.bbox ? 'full' : (unit.bbox.w > 0.7 ? 'full' : unit.bbox.x < 0.45 ? 'left' : 'right');
  return { yPct, column, block: unitIndex + 1 };
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

// Semantic left-border accent — instant visual classification
const ROLE_LEFT_BORDER: Record<string, string> = {
  definition: 'border-l-blue-500/80',
  mechanism:  'border-l-purple-500/80',
  clinical:   'border-l-teal-500/80',
  example:    'border-l-amber-500/70',
  step:       'border-l-indigo-500/70',
  warning:    'border-l-red-500/80',
  exam_trap:  'border-l-orange-500/80',
  formula:    'border-l-cyan-500/70',
  summary:    'border-l-gray-600/40',
};

const CATEGORY_LEFT_BORDER: Record<string, string> = {
  high_yield: 'border-l-green-500/80',
  mechanism:  'border-l-purple-500/80',
  trap:       'border-l-orange-500/80',
  threshold:  'border-l-blue-500/80',
  clinical:   'border-l-teal-500/80',
};

// Purpose-tag chip config for Quick-mode PriorityItemCard orientation header
const CATEGORY_PURPOSE_TAG: Record<PriorityItem['category'], { label: string; icon: string; color: string; textColor: string }> = {
  high_yield: { label: 'Exam Relevance',    icon: '⭐', color: 'bg-yellow-900/40', textColor: 'text-yellow-300' },
  mechanism:  { label: 'Mechanism',          icon: '⚙️', color: 'bg-violet-900/40', textColor: 'text-violet-300' },
  trap:       { label: 'Common Error',       icon: '⚠️', color: 'bg-red-900/40',    textColor: 'text-red-300'   },
  threshold:  { label: 'Threshold',          icon: '📏', color: 'bg-cyan-900/40',   textColor: 'text-cyan-300'  },
  clinical:   { label: 'Clinical Reasoning', icon: '🧠', color: 'bg-teal-900/40',   textColor: 'text-teal-300'  },
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

// ============================================================================
// Score badge — "Score: 82 • High Yield" with click-expand for breakdown
// ============================================================================

function scoreLabel(total: number): string {
  if (total >= 85) return 'Must Know';
  if (total >= 65) return 'High Yield';
  if (total >= 45) return 'Supporting';
  return 'Background';
}

function scoreBadgeColor(total: number): string {
  if (total >= 85) return 'bg-red-700/60 text-red-200 border-red-600/50';
  if (total >= 65) return 'bg-amber-700/60 text-amber-200 border-amber-600/50';
  if (total >= 45) return 'bg-blue-800/50 text-blue-300 border-blue-700/40';
  return 'bg-gray-700/50 text-gray-400 border-gray-600/40';
}

const ScoreBadge: React.FC<{ score: ScoreResult }> = ({ score }) => {
  const [open, setOpen] = useState(false);
  const label = scoreLabel(score.total);
  const color = scoreBadgeColor(score.total);

  const SUB_ROWS: Array<{ key: keyof ScoreResult['subs']; label: string; color: string }> = [
    { key: 'examYield',         label: 'Exam Yield',       color: 'bg-amber-500/70' },
    { key: 'mechanismDensity',  label: 'Mechanism',        color: 'bg-purple-500/70' },
    { key: 'numbersThresholds', label: 'Numbers',          color: 'bg-blue-500/70' },
    { key: 'decisionRules',     label: 'Decision Rules',   color: 'bg-teal-500/70' },
    { key: 'clinicalFlow',      label: 'Clinical Flow',    color: 'bg-green-500/70' },
    { key: 'trapRisk',          label: 'Trap Risk',        color: 'bg-red-500/70' },
  ];

  return (
    <div>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[10px] font-semibold ${color} hover:opacity-90`}
        title="Click to see score breakdown"
      >
        <span>Score: {score.total}</span>
        <span className="opacity-70">•</span>
        <span>{label}</span>
        <span className="opacity-50 text-[8px]">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="mt-1 p-2 bg-gray-900/60 border border-gray-700/50 rounded space-y-0.5">
          {SUB_ROWS.map(({ key, label: lbl, color: c }) => {
            const pct = Math.round(score.subs[key] * 100);
            return (
              <div key={key} className="flex items-center gap-1.5">
                <span className="text-[8px] text-gray-500 w-20 flex-shrink-0 truncate">{lbl}</span>
                <div className="flex-1 h-1.5 bg-gray-700/60 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${c}`} style={{ width: `${pct}%` }} />
                </div>
                <span className="text-[8px] font-mono text-gray-600 w-4 text-right">{pct}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Deep Mode stacked cards — spec Part C
// ============================================================================

const FLOW_NODE_ICONS: Record<string, string> = {
  Presentation: '🗣️',
  Findings:     '🔍',
  Differential: '⚖️',
  Decision:     '✅',
  NextStep:     '➡️',
};

const DeepModeCards: React.FC<{
  unit: ParagraphUnit;
  score: ScoreResult;
  reasoning: ClinicalReasoningResult;
  toneLevel?: ToneLevel;
  onJumpToSource?: (ref: SourceRef) => void;
  unitSourceRef: SourceRef;
}> = ({ unit, score, reasoning, toneLevel = 'student', onJumpToSource, unitSourceRef }) => {
  // Derive heuristic "core meaning" from role + signals
  const derivedMeaning = useMemo((): string => {
    if (unit.role === 'definition')
      return `This paragraph defines a key concept. The statement that follows "is" or "defined as" is the exam-critical information.`;
    if (unit.role === 'mechanism')
      return `This paragraph describes a causal chain or physiological pathway. Focus on the direction: what causes what.`;
    if (unit.role === 'formula')
      return `This paragraph contains a formula or quantitative relationship. Memorize the variables and their units.`;
    if (unit.role === 'exam_trap')
      return `This paragraph contains language patterns commonly exploited in exam distractors (exceptions, negations, absolute terms).`;
    if (unit.role === 'clinical')
      return `This paragraph has clinical relevance. Connect the mechanism to the patient presentation and management.`;
    return `This paragraph provides supporting context. Its value is in framing adjacent high-yield content.`;
  }, [unit.role]);

  // Derive mechanism summary from matched causal signals
  const derivedMechanism = useMemo((): string | null => {
    if (!unit.signals.hasCausal) return null;
    const markers = score.highlights.matchedRules.slice(0, 3);
    if (markers.length === 0) return null;
    return `Causal language detected: "${markers.join('", "')}". Trace the direction of each relationship to avoid reversal traps.`;
  }, [unit.signals.hasCausal, score.highlights.matchedRules]);

  // Extract numbers/thresholds
  const numbersText = useMemo((): string | null => {
    const nums = score.highlights.matchedNumbers;
    if (nums.length === 0) return null;
    return `Numeric values found: ${nums.join(', ')}. These are potential cutoffs, doses, or thresholds — memorize with their clinical context.`;
  }, [score.highlights.matchedNumbers]);

  // Generate check-yourself questions based on role
  const checkQuestions = useMemo((): string[] => {
    if (unit.role === 'definition')
      return [`How is this term defined?`, `What distinguishes it from similar terms?`];
    if (unit.role === 'mechanism')
      return [`What initiates this pathway?`, `What is the downstream effect?`];
    if (unit.role === 'formula')
      return [`What does each variable represent?`, `When is this formula applied clinically?`];
    if (unit.role === 'exam_trap')
      return [`What exception or negation is present?`, `How might a distractor exploit this?`];
    if (unit.role === 'clinical')
      return [`What is the clinical presentation?`, `What is the first-line management?`];
    return [`What is the key takeaway from this paragraph?`];
  }, [unit.role]);

  const trapHits = useMemo(() => {
    if (score.subs.trapRisk <= 0.25) return [];
    return detectParagraphTraps(unit);
  }, [unit, score.subs.trapRisk]);

  // "Why it matters" — derived from score subscores, max 2 bullets
  const whyItMatters = [
    score.subs.examYield > 0.5 ? 'High exam probability — this concept appears frequently on boards.' : null,
    score.subs.clinicalFlow > 0.5 ? 'Clinical decision point — directly affects diagnosis or management.' : null,
    score.subs.mechanismDensity > 0.5 ? 'Core mechanism — explains multiple downstream effects.' : null,
    score.subs.decisionRules > 0.5 ? 'Decision rule present — contains a threshold that changes the answer.' : null,
  ].filter(Boolean).slice(0, 2) as string[];

  const showClinicalReasoning = (toneLevel === 'clinical' || toneLevel === 'expert') &&
    reasoning.isClinicalReasoning && reasoning.nodes.length > 0;

  return (
    <div className="mt-2 space-y-1.5 border-t border-gray-700/40 pt-2">

      {/* 1. CORE MEANING — derived from role, never verbatim */}
      <div className="rounded-lg border border-blue-800/30 bg-blue-900/10 px-2 py-1.5">
        <div className="text-[9px] font-bold text-blue-400 uppercase tracking-widest mb-0.5">Core Meaning</div>
        <p className="text-[10px] text-blue-200">{derivedMeaning}</p>
      </div>

      {/* 2. MECHANISM / LOGIC (only if causal signals present) — 2–4 bullets */}
      {derivedMechanism && (
        <div className="rounded-lg border border-purple-800/30 bg-purple-900/10 px-2 py-1.5">
          <div className="text-[9px] font-bold text-purple-400 uppercase tracking-widest mb-0.5">Mechanism / Logic</div>
          <p className="text-[10px] text-purple-200">{derivedMechanism}</p>
          {numbersText && (
            <p className="text-[10px] text-cyan-300 mt-0.5">{numbersText}</p>
          )}
        </div>
      )}

      {/* 3. WHY IT MATTERS — max 2 bullets */}
      {whyItMatters.length > 0 && (
        <div className="rounded-lg border border-teal-800/30 bg-teal-900/10 px-2 py-1.5">
          <div className="text-[9px] font-bold text-teal-400 uppercase tracking-widest mb-0.5">Why It Matters</div>
          <ul className="space-y-0.5">
            {whyItMatters.map((w, i) => (
              <li key={i} className="text-[10px] text-teal-200">• {w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 4. EXAM TRAPS — 0–2 bullets (only if trapRisk > 0.25) */}
      {trapHits.length > 0 && (
        <div className="rounded-lg border border-amber-800/30 bg-amber-900/10 px-2 py-1.5">
          <div className="text-[9px] font-bold text-amber-400 uppercase tracking-widest mb-1">Exam Traps / Watch For</div>
          <div className="space-y-0.5">
            {trapHits.slice(0, 2).map((hit, i) => (
              <div key={i} className="text-[10px]">
                <span className="text-amber-300 font-semibold">⚠ {hit.kind.toLowerCase().replace(/_/g, ' ')}: </span>
                <span className="text-amber-200">{hit.prompt}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. CLINICAL REASONING — only for clinical/expert tone */}
      {showClinicalReasoning && (
        <div className="rounded-lg border border-green-800/30 bg-green-900/10 px-2 py-1.5">
          <div className="text-[9px] font-bold text-green-400 uppercase tracking-widest mb-1">Clinical Reasoning</div>
          <div className="space-y-0.5">
            {reasoning.nodes.map((node, i) => (
              <div key={i} className="flex gap-1.5 items-start">
                <span className="text-xs flex-shrink-0">{FLOW_NODE_ICONS[node.type] ?? '→'}</span>
                <div>
                  <span className="text-[8px] font-semibold text-green-500 uppercase">{node.type}: </span>
                  <span className="text-[10px] text-green-200">{node.text}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Numbers inline if no mechanism section to attach to */}
      {!derivedMechanism && numbersText && (
        <div className="rounded-lg border border-cyan-800/30 bg-cyan-900/10 px-2 py-1.5">
          <div className="text-[9px] font-bold text-cyan-400 uppercase tracking-widest mb-0.5">Numbers & Thresholds</div>
          <p className="text-[10px] text-cyan-200">{numbersText}</p>
        </div>
      )}
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

// ============================================================================
// Orientation Header Badge — cognitive anchor showing role + purpose
// ============================================================================

const OrientationHeaderBadge: React.FC<{ header: OrientationHeader }> = ({ header }) => {
  const cfg = PURPOSE_TAG_CONFIG[header.purposeTag];
  return (
    <div className="mb-1.5 rounded border border-gray-700/40 bg-gray-800/30 overflow-hidden">
      {/* Page • Section • Paragraph position */}
      <div className="flex items-center gap-2 px-2 py-0.5 border-b border-gray-700/30 bg-gray-800/50">
        {header.page !== null && (
          <span className="text-[8px] font-mono text-gray-500">p.{header.page}</span>
        )}
        {header.paragraphIndex !== null && (
          <span className="text-[8px] text-gray-600">¶{header.paragraphIndex}</span>
        )}
        <div className="flex-1" />
        {/* Purpose tag chip */}
        <span className={`text-[8px] font-semibold px-1.5 py-0.5 rounded ${cfg.color} ${cfg.textColor}`}>
          {cfg.icon} {cfg.label}
        </span>
      </div>
      {/* Role / Purpose / Function triplet */}
      <div className="px-2 py-1 grid grid-cols-3 gap-1">
        <div>
          <div className="text-[7px] text-gray-600 uppercase tracking-wide">Role</div>
          <div className="text-[9px] text-gray-400">{header.role}</div>
        </div>
        <div>
          <div className="text-[7px] text-gray-600 uppercase tracking-wide">Purpose</div>
          <div className="text-[9px] text-gray-400">{header.purpose}</div>
        </div>
        <div>
          <div className="text-[7px] text-gray-600 uppercase tracking-wide">Function</div>
          <div className="text-[9px] text-gray-400">{header.function}</div>
        </div>
      </div>
    </div>
  );
};

/**
 * Compact orientation bar shown at the TOP of every card in Quick mode.
 * Gives the brain instant: purpose-tag chip • one-line purpose • page anchor.
 * Zero cognitive cost — processed pre-attentively via color + position.
 */
const MiniOrientationHeader: React.FC<{ header: OrientationHeader }> = ({ header }) => {
  const cfg = PURPOSE_TAG_CONFIG[header.purposeTag];
  return (
    <div className="flex items-center gap-1.5 mb-1.5 pb-1.5 border-b border-gray-700/30">
      <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${cfg.color} ${cfg.textColor}`}>
        {cfg.icon} {cfg.label}
      </span>
      {header.section && (
        <span className="text-[8px] text-gray-600 leading-tight break-words">{header.section}</span>
      )}
      <span className="text-[9px] text-gray-500 flex-1 leading-tight break-words">{header.purpose}</span>
      {header.page !== null && (
        <span className="text-[8px] font-mono text-gray-700 flex-shrink-0 ml-auto">
          p.{header.page}{header.paragraphIndex !== null ? ` ¶${header.paragraphIndex}` : ''}
        </span>
      )}
    </div>
  );
};

// ============================================================================
// Page Minimap — horizontal paragraph-position strip
// Colored ticks by importance; click any tick to jump to that paragraph.
// Placed above the card list so both Quick and Deep modes benefit.
// ============================================================================

const IMPORTANCE_TICK_COLOR = (importance: number): string => {
  if (importance >= 85) return 'bg-red-400/80';
  if (importance >= 65) return 'bg-amber-400/70';
  if (importance >= 45) return 'bg-blue-400/60';
  return 'bg-gray-600/40';
};

const PageMinimap: React.FC<{
  units: ParagraphUnit[];
  onJumpToSource?: (ref: SourceRef) => void;
}> = ({ units, onJumpToSource }) => {
  if (units.length === 0) return null;
  // Sort by startChar to approximate page reading order (top → bottom)
  const sorted = [...units].sort((a, b) => a.startChar - b.startChar);
  const maxChar = Math.max(1, sorted[sorted.length - 1]?.endChar ?? 1);

  return (
    <div
      className="relative h-5 mb-3 rounded overflow-hidden bg-gray-800/50 border border-gray-700/40 flex-shrink-0"
      title="Page map — click a segment to jump to that paragraph"
    >
      {sorted.map(u => {
        const leftPct  = (u.startChar / maxChar) * 100;
        const widthPct = Math.max(0.8, ((u.endChar - u.startChar) / maxChar) * 100);
        return (
          <button
            key={u.id}
            className={`absolute top-0 h-full ${IMPORTANCE_TICK_COLOR(u.importance)} hover:brightness-125 transition-all`}
            style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
            title={`${u.role} · Score ${u.importance}`}
            onClick={() => {
              if (!onJumpToSource) return;
              const q = u.text.slice(0, 180);
              onJumpToSource({
                pageIndex: u.pageIndex,
                paragraphId: u.id,
                startChar: u.startChar,
                endChar: u.endChar,
                quote: q,
                quoteText: q,
                quoteHash: buildQuoteHash(q),
                textOrigin: 'pdfText',
                confidence: u.importance / 100,
              });
            }}
          />
        );
      })}
      {/* Legend tick marks */}
      <div className="absolute inset-0 flex items-center justify-end pr-1 pointer-events-none">
        <span className="text-[7px] text-gray-700 font-mono">map</span>
      </div>
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
  /** When true, always show full text without clamp + stacked deep cards */
  deepMode?: boolean;
  /** Micro Polish — refine grammar/tone */
  polishEnabled?: boolean;
  /** Tone adaptation level */
  toneLevel?: ToneLevel;
  /** Detail density for exam signal */
  depthLevel?: DepthLevel;
  renderPolicy?: 'condensed' | 'expanded';
  /** 0-based index within the page for orientation header */
  unitIndex?: number;
  /** Section title from structureMap.topic — populates OrientationHeader.section */
  sectionHint?: string;
}> = ({ unit, tier, onHighlightParagraph, onJumpToSource, debugMode = false, deepMode = false, polishEnabled = false, toneLevel = 'clinical', depthLevel = 'standard', renderPolicy = 'condensed', unitIndex, sectionHint }) => {
  const [showSubScores, setShowSubScores] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

  // Compute scoring and clinical reasoning (memoized — only in deep mode to avoid perf hit)
  const score = useMemo<ScoreResult | null>(
    () => deepMode ? scoreParagraph(unit.text) : null,
    [unit.text, deepMode],
  );
  const reasoning = useMemo<ClinicalReasoningResult | null>(
    () => deepMode ? detectClinicalReasoning(unit.text) : null,
    [unit.text, deepMode],
  );
  // Orientation header — always computed (pure regex, negligible cost)
  const orientation = useMemo<OrientationHeader>(
    () => orientParagraph(unit, unitIndex, sectionHint),
    [unit, unitIndex, sectionHint],
  );
  const roleLeftBorder = ROLE_LEFT_BORDER[unit.role] ?? 'border-l-gray-600/40';
  const { expandedCardIds, toggleExpandedCardId } = useInsightsPanelStore();
  const insightExpanded = expandedCardIds.includes(unit.id);
  const [paragraphInsight, setParagraphInsight] = useState<ParagraphInsight>(() => ({
    anchorId: unit.id,
    variants: { polish: { body: '' }, student: { body: '' }, clinical: { body: '' }, expert: { body: '' } },
    updatedAt: Date.now(),
    statusByTone: { polish: 'idle', student: 'idle', clinical: 'idle', expert: 'idle' },
  }));
  const latestRequestIdRef = useRef<Record<Tone, string>>({ polish: '', student: '', clinical: '', expert: '' });
  const requestCounterRef = useRef(0);

  useEffect(() => {
    const tone = toneLevel as Tone;
    const requestId = `${unit.id}_${tone}_${++requestCounterRef.current}`;
    latestRequestIdRef.current[tone] = requestId;

    setParagraphInsight(prev => ({ ...prev, anchorId: unit.id, statusByTone: { ...prev.statusByTone, [tone]: 'loading' } }));

    Promise.resolve().then(() => {
      const variant = buildInsightVariant(unit, orientation, toneLevel, depthLevel, renderPolicy);
      if (latestRequestIdRef.current[tone] !== requestId) return;
      setParagraphInsight(prev => ({
        ...prev,
        anchorId: unit.id,
        variants: { ...prev.variants, [tone]: variant },
        updatedAt: Date.now(),
        statusByTone: { ...prev.statusByTone, [tone]: 'ready' },
      }));
    }).catch(() => {
      if (latestRequestIdRef.current[tone] !== requestId) return;
      setParagraphInsight(prev => ({ ...prev, statusByTone: { ...prev.statusByTone, [tone]: 'error' } }));
    });
  // renderPolicy is intentionally excluded: variant content doesn't change between
  // condensed/expanded — the rendering layer handles what to show (bullets or not).
  // Keeping it in deps caused a spurious "Adapting…" flash on every toggle.
  }, [unit, orientation, toneLevel, depthLevel]);

  const activeTone = toneLevel as Tone;
  const activeVariant = paragraphInsight.variants[activeTone];
  const activeStatus = paragraphInsight.statusByTone[activeTone];
  const meta = TIER_META[tier];
  const roleColor = ROLE_COLORS[unit.role] ?? 'bg-gray-800/40 text-gray-400 border-gray-700/40';

  // Build a complete SourceRef from the ParagraphUnit for jump + debug
  const unitQuote = unit.text.slice(0, 180);
  const locationMeta = buildLocationMeta(unit, unitIndex ?? 0);
  const unitSourceRef: SourceRef = {
    pageIndex: unit.pageIndex,
    paragraphId: unit.id,
    yPct: locationMeta.yPct,
    column: locationMeta.column,
    block: locationMeta.block,
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
      className={`p-2.5 rounded-lg border border-l-4 ${roleLeftBorder} border-gray-700/60 cursor-pointer hover:border-gray-500/60 hover:-translate-y-0.5 hover:shadow-lg transition-all ${meta.bg}`}
      onClick={() => onHighlightParagraph?.(unit.text)}
    >
      {/* Cognitive anchor — orientation header at top of every card */}
      {deepMode
        ? <div className="mb-1.5" onClick={e => e.stopPropagation()}><OrientationHeaderBadge header={orientation} /></div>
        : <MiniOrientationHeader header={orientation} />
      }

      <div className="sticky top-0 z-10 mb-1.5 flex items-center gap-1.5 rounded border border-gray-700/50 bg-gray-950/90 px-2 py-1 text-[9px]" onClick={(e) => e.stopPropagation()}>
        <span className="font-mono text-gray-300 whitespace-nowrap">Pg {unit.pageIndex + 1}</span>
        <span className="font-mono text-gray-400 whitespace-nowrap">¶ {unit.id}</span>
        <span className="text-teal-400 whitespace-nowrap">{Math.round((unitSourceRef.confidence || 0) * 100)}% match</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onJumpToSource?.(unitSourceRef);
          }}
          className="ml-auto rounded border border-teal-700/50 bg-teal-900/20 px-1.5 py-0.5 text-[8px] text-teal-300 hover:bg-teal-800/30 whitespace-nowrap"
        >
          Jump to source
        </button>
      </div>

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
        {/* Score badge (deep mode) or plain number (quick mode) */}
        {deepMode && score ? (
          <div onClick={(e) => e.stopPropagation()}>
            <ScoreBadge score={score} />
          </div>
        ) : (
          <span className="text-[10px] font-mono text-gray-500 flex-shrink-0">{unit.importance}</span>
        )}
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

      {/* Source text — full paragraph only, no truncation. */}
      <div className="mt-1.5 space-y-1.5">
        {deepMode && (
          <div className="text-[8px] text-teal-700 mb-0.5 flex items-center gap-1">
            <span>✦ Tone: {TONE_LABELS[toneLevel]}</span>
            {polishEnabled && <span className="text-teal-800">• Micro Polish ON</span>}
          </div>
        )}

        {!deepMode && (
          <div className="mt-1">
            {activeStatus === 'loading' ? (
              <p className="text-[11px] text-gray-500 italic">Adapting…</p>
            ) : (
              <>
                <p
                  className="text-[11px] text-gray-300 whitespace-pre-wrap leading-relaxed"
                  style={{ fontSize: 'calc(0.6875rem * var(--insightScale, 1))', lineHeight: 'calc(1.5 * var(--insightScale, 1))' }}
                >
                  {activeVariant?.title || splitSentences(unit.text)[0] || unit.text}
                </p>
                {renderPolicy === 'expanded' && activeVariant?.bullets && activeVariant.bullets.length > 0 && (
                  <ul
                    className="list-disc pl-4 mt-1.5 space-y-0.5 text-[10px] text-gray-400"
                    style={{ fontSize: 'calc(0.625rem * var(--insightScale, 1))' }}
                  >
                    {activeVariant.bullets.slice(0, depthLevel === 'deep' ? undefined : 2).map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        )}

        {deepMode && (
          <div className="space-y-2 text-[11px] text-gray-300" style={{ fontSize: 'calc(0.6875rem * var(--insightScale, 1))' }}>
            <section className="rounded border border-gray-700/40 bg-gray-900/30 p-2">
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="text-[9px] font-bold text-blue-300 uppercase tracking-wide">Snapshot</div>
                <div className="text-[8px] text-gray-500">{activeStatus === 'loading' ? 'Updating…' : 'Ready'}</div>
              </div>
              <p>{activeVariant?.title || 'Generating insight snapshot…'}</p>
            </section>

            {depthLevel !== 'minimal' && (
            <section className="rounded border border-gray-700/40 bg-gray-900/30 p-2">
              <div className="text-[9px] font-bold text-purple-300 uppercase tracking-wide mb-1">Mechanism / Logic</div>
              <div className="flex gap-1 flex-wrap mb-1.5">
                <span className="text-[9px] px-1.5 py-0.5 rounded border border-purple-700/40 bg-purple-900/20">{unit.role.replace('_', ' ')}</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded border border-teal-700/40 bg-teal-900/20">{orientation.purpose}</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded border border-gray-700/40 bg-gray-800/40">Pg {unit.pageIndex + 1} · ¶ {(orientation.paragraphIndex ?? 0) + 1}</span>
              </div>
              <p className="text-gray-400">Why this exists here: {orientation.purpose}</p>
            </section>
            )}

            {depthLevel === 'deep' && (
            <section className="rounded border border-gray-700/40 bg-gray-900/30 p-2">
              <div className="text-[9px] font-bold text-amber-300 uppercase tracking-wide mb-1">Exam Signal / Clinical Reasoning</div>
              <ul className="list-disc pl-4 space-y-1">
                {(activeVariant?.bullets || []).slice(0, insightExpanded ? undefined : 2).map((step, idx) => <li key={`${unit.id}_exam_${idx}`}>{step}</li>)}
              </ul>
            </section>
            )}

            <section className="rounded border border-gray-700/40 bg-gray-900/30 p-2">
              <div className="text-[9px] font-bold text-green-300 uppercase tracking-wide mb-1">Location + Evidence</div>
              <p className="text-gray-400">p.{unit.pageIndex + 1} • y={locationMeta.yPct}% • col={locationMeta.column} • block={locationMeta.block}</p>
            </section>

            {activeVariant?.sectionContext && (
              <section className="rounded border border-gray-700/40 bg-gray-900/30 p-2">
                <div className="text-[9px] font-bold text-cyan-300 uppercase tracking-wide mb-1">Section Context Layer</div>
                <ul className="space-y-1 text-gray-400">
                  <li><span className="text-cyan-300">Section Purpose:</span> {activeVariant.sectionContext.sectionPurpose}</li>
                  <li><span className="text-cyan-300">Role In Chapter:</span> {activeVariant.sectionContext.roleInChapter}</li>
                  <li><span className="text-cyan-300">Dependency Links:</span> {activeVariant.sectionContext.dependencyLinks}</li>
                  <li><span className="text-cyan-300">Next Concept:</span> {activeVariant.sectionContext.nextConcept}</li>
                </ul>
              </section>
            )}

            {insightExpanded && (
              <section className="rounded border border-gray-700/40 bg-gray-900/30 p-2">
                <div className="text-[9px] font-bold text-green-300 uppercase tracking-wide mb-1">Full 4-Layer Breakdown</div>
                <p className="whitespace-pre-wrap">{activeVariant?.body || 'Generating full insight...'}</p>
              </section>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); toggleExpandedCardId(unit.id); }}
                className="text-[9px] px-2 py-1 rounded border border-gray-700/60 bg-gray-800/60 hover:bg-gray-700/60"
              >
                {insightExpanded ? 'Collapse' : 'Expand'}
              </button>
              <button type="button" className="text-[9px] px-2 py-1 rounded border border-gray-700/60 bg-gray-800/40">Save</button>
              <button type="button" className="text-[9px] px-2 py-1 rounded border border-gray-700/60 bg-gray-800/40">Cards</button>
            </div>
          </div>
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

      {/* Deep Mode stacked cards — spec Part C */}
      {deepMode && score && reasoning && (
        <div onClick={(e) => e.stopPropagation()}>
          <DeepModeCards
            unit={unit}
            score={score}
            reasoning={reasoning}
            toneLevel={toneLevel}
            onJumpToSource={onJumpToSource}
            unitSourceRef={unitSourceRef}
          />
        </div>
      )}
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
  isExtracting = false,
}) => {
  // Ref map: insight item ID → DOM element for scroll-into-view
  const itemRefs = useRef<Map<string, HTMLElement>>(new Map());

  // mode is now store-driven; deepAnalysisMode prop serves as initial default only
  const {
    mode, setMode,
    audience, setAudience,
    depth, setDepth,
    view, setView,
    followScroll, setFollowScroll,
    activeParagraphId,
    insightScale: storeInsightScale,
    resetScale,
    essentialStudentMode,
    setEssentialStudentMode,
    resetInsightLayout,
  } = useInsightsPanelStore();

  // Sync prop → store once on mount if store is still at default
  const [initializedMode, setInitializedMode] = useState(false);
  useEffect(() => {
    if (!initializedMode) {
      if (deepAnalysisMode && mode === 'quick') setMode('deep');
      setInitializedMode(true);
    }
  }, [deepAnalysisMode, mode, setMode, initializedMode]);

  const isDeepMode = mode === 'deep';
  const toneLevel = audience as ToneLevel;
  const depthLevel = depth as DepthLevel;
  const renderPolicy = view;

  // Collapse state for supporting/background tiers in deep analysis
  const [showBackground, setShowBackground] = useState(false);
  const [paragraphLayerOpen, setParagraphLayerOpen] = useState(false);
  const [controlError, setControlError] = useState<string | null>(null);

  const sectionSynthesis = useMemo(() => buildSectionSynthesis(pageIntelligence), [pageIntelligence]);
  const readingMode = inferReadingMode(mode, depthLevel, renderPolicy);
  const shouldShowParagraphLayer = isDeepMode || paragraphLayerOpen;

  useEffect(() => {
    if (isDeepMode) {
      setParagraphLayerOpen(true);
    }
  }, [isDeepMode]);

  const runSafeControlUpdate = (action: () => void) => {
    try {
      action();
      setControlError(null);
    } catch (error) {
      console.error('[PriorityComprehensionPanel] control update failed', error);
      setControlError('View didn’t update. Retry or reset?');
    }
  };

  // Scroll active item into view when sync is on and activeItemId changes
  useEffect(() => {
    if (!syncEnabled || !followScroll || !activeItemId) return;
    const el = itemRefs.current.get(activeItemId);
    if (el) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [activeItemId, syncEnabled, followScroll]);

  // Categorize all priority items
  const categorizedItems = useMemo(() => {
    return categorizePriorityItems(rankedInsights, pageIntelligence);
  }, [rankedInsights, pageIntelligence]);

  // Filter to only non-empty categories
  const activeCategories = useMemo(() => {
    if (essentialStudentMode && !isDeepMode) {
      return pickEssentialItems(categorizedItems, 3);
    }

    const result: Array<{ category: PriorityItem['category']; items: PriorityItem[] }> = [];
    const order: PriorityItem['category'][] = ['high_yield', 'mechanism', 'trap', 'threshold', 'clinical'];
    for (const cat of order) {
      const items = categorizedItems.get(cat) || [];
      if (items.length > 0) result.push({ category: cat, items });
    }
    return result;
  }, [categorizedItems, essentialStudentMode, isDeepMode]);

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
      const panelStyle = { '--insightScale': String(storeInsightScale ?? insightScale) } as React.CSSProperties;
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

    // Extraction in flight → "Scanning page…" skeleton
    if (isExtracting) {
      return (
        <div className="p-4 h-full flex flex-col items-center justify-center">
          <div className="text-center max-w-[240px]">
            <div className="text-3xl mb-3 animate-pulse">🔍</div>
            <h3 className="text-sm font-medium text-gray-300 mb-1">Scanning page…</h3>
            <p className="text-[10px] text-gray-600">Identifying priority paragraphs</p>
            <div className="mt-4 space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-3 bg-gray-800/60 rounded animate-pulse" style={{ width: `${70 + i * 8}%` }} />
              ))}
            </div>
          </div>
        </div>
      );
    }

    // Extraction complete but empty → clear "no anchors" state
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

  // Prefer store value; fall back to prop (e.g. when rendered without SurgeonCockpit)
  const effectiveScale = storeInsightScale ?? insightScale;
  const panelStyle = { '--insightScale': String(effectiveScale) } as React.CSSProperties;

  return (
    <div className="p-3 overflow-y-auto h-full" style={panelStyle}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold text-teal-400 flex items-center gap-2">
            <span>🎯</span>
            Section Comprehension
          </h2>
          <p className="text-[10px] text-gray-500 mt-0.5">
            Section-first explanation for any academic reading
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* Quick | Deep segmented toggle — writes to store */}
          <div className="flex rounded border border-gray-700 overflow-hidden">
            <button
              onClick={() => runSafeControlUpdate(() => setMode('quick'))}
              className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${
                !isDeepMode
                  ? 'bg-teal-700/60 text-teal-200 border-r border-teal-600/50'
                  : 'bg-gray-800/60 text-gray-500 hover:text-gray-300 border-r border-gray-700'
              }`}
            >
              Quick
            </button>
            <button
              onClick={() => runSafeControlUpdate(() => setMode('deep'))}
              className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${
                isDeepMode
                  ? 'bg-teal-700/60 text-teal-200'
                  : 'bg-gray-800/60 text-gray-500 hover:text-gray-300'
              }`}
            >
              Deep
            </button>
          </div>

          <div className="flex items-center gap-1">
              <span className="text-[9px] text-gray-500">Depth</span>
              <div className="flex rounded border border-gray-700 overflow-hidden">
                {(['minimal', 'standard', 'deep'] as DepthLevel[]).map(level => (
                  <button
                    key={level}
                    onClick={() => runSafeControlUpdate(() => setDepth(level))}
                    className={`text-[9px] px-2 py-0.5 ${depthLevel === level ? 'bg-blue-600/40 text-blue-200' : 'bg-gray-800/40 text-gray-400 hover:text-gray-200'}`}
                    title={`Set insight depth to ${level}`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>


          {/* Tone level — Polish | Student | Clinical | Expert */}
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-gray-500">View</span>
            <div className="flex rounded border border-gray-700 overflow-hidden">
              {(['condensed', 'expanded'] as const).map(policy => (
                <button key={policy} onClick={() => runSafeControlUpdate(() => setView(policy))} className={`text-[9px] px-2 py-0.5 ${renderPolicy === policy ? 'bg-indigo-600/40 text-indigo-200' : 'bg-gray-800/40 text-gray-400 hover:text-gray-200'}`}>{policy}</button>
              ))}
            </div>
            <button
              onClick={() => runSafeControlUpdate(() => setFollowScroll(!followScroll))}
              className={`text-[9px] px-2 py-0.5 rounded border border-gray-700/60 ${followScroll ? 'bg-teal-600/40 text-teal-200' : 'bg-gray-800/40 text-gray-400 hover:text-gray-200'}`}
            >
              Follow scroll
            </button>
          </div>

          <button
            onClick={() => runSafeControlUpdate(() => setEssentialStudentMode(!essentialStudentMode))}
            className={`text-[9px] px-2 py-0.5 rounded border border-gray-700/60 ${essentialStudentMode ? 'bg-emerald-600/40 text-emerald-200' : 'bg-gray-800/40 text-gray-400 hover:text-gray-200'}`}
            title="Essential Student Mode limits default cards to the most important study points"
          >
            Essential
          </button>

          <button
            onClick={() => runSafeControlUpdate(() => setMode('deep'))}
            className="text-[9px] px-2 py-0.5 rounded border border-gray-700/60 bg-gray-800/40 text-gray-300 hover:bg-gray-700/60"
            title="Show deeper reasoning"
          >
            Show deeper reasoning
          </button>

          <div className="flex rounded border border-gray-700 overflow-hidden">
              {(['polish', 'student', 'clinical', 'expert'] as ToneLevel[]).map((lvl, i) => (
                <button
                  key={lvl}
                  onClick={() => runSafeControlUpdate(() => setAudience(lvl as 'polish' | 'student' | 'clinical' | 'expert'))}
                  className={`px-1.5 py-0.5 text-[9px] font-medium transition-colors capitalize ${
                    i < 3 ? 'border-r border-gray-700' : ''
                  } ${
                    toneLevel === lvl
                      ? 'bg-indigo-700/60 text-indigo-200'
                      : 'bg-gray-800/60 text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {lvl.charAt(0).toUpperCase() + lvl.slice(1)}
                </button>
              ))}
            </div>

          {/* Reset insight layout — fallback recovery if controls feel broken */}
          <button
            onClick={() => runSafeControlUpdate(() => {
              resetScale();
              resetInsightLayout();
            })}
            className="text-[9px] px-1.5 py-0.5 rounded border border-gray-700/60 bg-gray-800/30 text-gray-500 hover:text-gray-300 hover:bg-gray-700/40 transition-colors"
            title="Reset insight layout to defaults (zoom, density, scroll sync)"
          >
            Reset insight layout
          </button>

          <span className="px-2 py-0.5 text-[10px] bg-teal-500/20 text-teal-400 rounded">
            {totalItems}
          </span>
        </div>
      </div>

      {controlError && (
        <div className="mb-3 px-2 py-1.5 rounded border border-amber-700/40 bg-amber-900/20 flex items-center gap-2 text-[10px] text-amber-200">
          <span>{controlError}</span>
          <button
            onClick={() => setControlError(null)}
            className="px-1.5 py-0.5 rounded border border-amber-700/60 hover:bg-amber-700/20"
          >
            Retry
          </button>
          <button
            onClick={() => runSafeControlUpdate(() => {
              resetScale();
              resetInsightLayout();
            })}
            className="px-1.5 py-0.5 rounded border border-amber-700/60 hover:bg-amber-700/20"
          >
            Reset view
          </button>
        </div>
      )}

      <section className="mb-5 space-y-2">
        <div className="p-3 rounded-lg border border-teal-700/40 bg-teal-900/10">
          <h3 className="text-xs font-semibold text-teal-300 uppercase tracking-wide">Section-first mode</h3>
          <div className="mt-2 flex flex-wrap gap-1">
            {(['minimal', 'standard', 'deep', 'condensed', 'expanded'] as ReadingMode[]).map((candidate) => (
              <button
                key={candidate}
                onClick={() => runSafeControlUpdate(() => applyReadingModeSettings(candidate, { setMode, setDepth, setView, setEssentialStudentMode }))}
                className={`text-[10px] px-2 py-1 rounded border ${readingMode === candidate ? 'bg-teal-700/60 text-teal-100 border-teal-500/70' : 'bg-gray-800/50 text-gray-300 border-gray-700/60 hover:bg-gray-700/60'}`}
              >
                {candidate}
              </button>
            ))}
          </div>
        </div>

        <div className="p-3 rounded-lg border border-gray-700/70 bg-gray-900/50">
          <h4 className="text-[11px] font-semibold text-gray-300 uppercase tracking-wide">1. Section Overview</h4>
          <p className="text-sm text-white mt-1">{sectionSynthesis?.title || `Page ${pageIntelligence?.pageNumber ?? ''}`}</p>
          <p className="text-xs text-gray-300 mt-1">{sectionSynthesis?.overview || 'Section summary unavailable; showing page essentials.'}</p>
          {(readingMode === 'standard' || readingMode === 'deep' || readingMode === 'expanded') && (
            <p className="text-xs text-gray-400 mt-1">{sectionSynthesis?.plainLanguage || 'This page introduces the core idea and how it connects to the surrounding chapter.'}</p>
          )}
        </div>

        {readingMode !== 'minimal' && readingMode !== 'condensed' && (
          <div className="p-3 rounded-lg border border-gray-700/70 bg-gray-900/50">
            <h4 className="text-[11px] font-semibold text-gray-300 uppercase tracking-wide">2. Section Breakdown</h4>
            <ul className="list-disc pl-5 mt-1 text-xs text-gray-300 space-y-1">
              {(sectionSynthesis?.structure?.length ? sectionSynthesis.structure : ['Part 1: framing', 'Part 2: core idea', 'Part 3: supporting examples', 'Part 4: implication']).slice(0, readingMode === 'deep' ? 6 : 4).map((entry, idx) => <li key={`section_part_${idx}`}>{entry}</li>)}
            </ul>
          </div>
        )}

        <div className="p-3 rounded-lg border border-gray-700/70 bg-gray-900/50">
          <h4 className="text-[11px] font-semibold text-gray-300 uppercase tracking-wide">3. Key Takeaways</h4>
          <ul className="list-disc pl-5 mt-1 text-xs text-gray-300 space-y-1">
            {(sectionSynthesis?.takeaways?.length ? sectionSynthesis.takeaways : ['Top point from this page', 'Second key takeaway', 'Third key takeaway'])
              .slice(0, readingMode === 'minimal' ? 3 : readingMode === 'condensed' ? 2 : 5)
              .map((entry, idx) => <li key={`takeaway_${idx}`}>{entry}</li>)}
          </ul>
        </div>

        {(readingMode === 'standard' || readingMode === 'deep' || readingMode === 'expanded') && (
          <div className="p-3 rounded-lg border border-gray-700/70 bg-gray-900/50">
            <h4 className="text-[11px] font-semibold text-gray-300 uppercase tracking-wide">4. Why It Matters</h4>
            <p className="text-xs text-gray-300 mt-1">{sectionSynthesis?.whyItMatters || 'This section helps you understand the author’s main teaching goal and what to retain for exams.'}</p>
          </div>
        )}

        {(readingMode === 'standard' || readingMode === 'deep' || readingMode === 'expanded') && sectionSynthesis?.anchor && (
          <div className="p-3 rounded-lg border border-gray-700/70 bg-gray-900/50">
            <h4 className="text-[11px] font-semibold text-gray-300 uppercase tracking-wide">5. Important Source Anchor</h4>
            <p className="text-xs text-gray-300 mt-1">“{sectionSynthesis.anchor.quote}”</p>
            {sectionSynthesis.anchor.sourceRef && (
              <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                <SourceAnchor sourceRef={sectionSynthesis.anchor.sourceRef} onJump={onJumpToSource} collapsed={false} />
              </div>
            )}
          </div>
        )}

        {!isDeepMode && (
          <button
            onClick={() => setParagraphLayerOpen((v) => !v)}
            className="text-[10px] px-2 py-1 rounded border border-gray-700/70 bg-gray-800/50 text-gray-200 hover:bg-gray-700/60"
          >
            {paragraphLayerOpen ? 'Hide paragraph-level intelligence' : 'Show paragraph-level intelligence'}
          </button>
        )}
      </section>

      {/* Priority Score Legend */}
      {shouldShowParagraphLayer && totalItems > 0 && (
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

      {/* Page Minimap — paragraph importance strip */}
      {shouldShowParagraphLayer && totalParagraphUnits > 0 && (!essentialStudentMode || isDeepMode) && (
        <PageMinimap
          units={pageIntelligence?.paragraphUnits ?? []}
          onJumpToSource={onJumpToSource}
        />
      )}

      {/* Structure Map — shown in deep mode or when essential mode is off */}
      {shouldShowParagraphLayer && (!essentialStudentMode || isDeepMode) && (<StructureMapSection
        structureMap={pageIntelligence?.structureMap}
        paragraphUnits={pageIntelligence?.paragraphUnits}
        pageNumber={pageIntelligence?.pageNumber}
        onHighlightParagraph={onHighlightParagraph}
        onJumpToSource={onJumpToSource}
      />
      )}

      {/* Insight Continuity — shown in deep mode or when essential mode is off */}
      {shouldShowParagraphLayer && (!essentialStudentMode || isDeepMode) && pageIntelligence?.continuity && (
        <ContinuitySection continuity={pageIntelligence.continuity} />
      )}

      {/* Full Paragraph Intelligence — view-aware rendering */}
      {shouldShowParagraphLayer && totalParagraphUnits > 0 && (
        <section className="mb-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm">{isDeepMode ? '🔬' : '📌'}</span>
            <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wide">
              {isDeepMode ? 'Full Paragraph Intelligence' : 'Active Paragraph Essentials'}
            </h3>
            <span className="text-[10px] text-gray-500">
              {isDeepMode ? `(${totalParagraphUnits})` : ''}
            </span>
          </div>

          {/* CONDENSED (quick mode): show only the active / top paragraph essentials */}
          {!isDeepMode && (() => {
            const allUnits = pageIntelligence?.paragraphUnits ?? [];
            // Prefer the activeParagraphId unit; fall back to highest-importance unit
            const activeUnit =
              (activeParagraphId ? allUnits.find(u => u.id === activeParagraphId) : null)
              ?? allUnits.reduce<ParagraphUnit | null>(
                (best, u) => (!best || u.importance > best.importance) ? u : best, null
              );
            if (!activeUnit) return null;
            const tier = scoreToParagraphTier(activeUnit.importance);
            return (
              <ParagraphUnitCard
                key={activeUnit.id}
                unit={activeUnit}
                tier={tier}
                onHighlightParagraph={onHighlightParagraph}
                onJumpToSource={onJumpToSource}
                debugMode={false}
                deepMode={false}
                polishEnabled={toneLevel === 'polish'}
                toneLevel={toneLevel}
                depthLevel={depthLevel}
                renderPolicy={renderPolicy}
                unitIndex={0}
                sectionHint={pageIntelligence?.structureMap?.topic}
              />
            );
          })()}

          {/* EXPANDED (deep mode): all tiers, full teaching scaffold */}
          {isDeepMode && (
            <>
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
                      {units.map((u, idx) => (
                        <ParagraphUnitCard
                          key={u.id}
                          unit={u}
                          tier={tier}
                          onHighlightParagraph={onHighlightParagraph}
                          onJumpToSource={onJumpToSource}
                          debugMode={true}
                          deepMode={true}
                          polishEnabled={toneLevel === 'polish'}
                          toneLevel={toneLevel}
                          depthLevel={depthLevel}
                          renderPolicy={renderPolicy}
                          unitIndex={idx}
                          sectionHint={pageIntelligence?.structureMap?.topic}
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
                      {(paragraphTiers.get('background') ?? []).map((u, idx) => (
                        <ParagraphUnitCard
                          key={u.id}
                          unit={u}
                          tier="background"
                          onHighlightParagraph={onHighlightParagraph}
                          onJumpToSource={onJumpToSource}
                          debugMode={true}
                          deepMode={true}
                          polishEnabled={toneLevel === 'polish'}
                          toneLevel={toneLevel}
                          depthLevel={depthLevel}
                          renderPolicy={renderPolicy}
                          unitIndex={idx}
                          sectionHint={pageIntelligence?.structureMap?.topic}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      )}

      {/* Category Sections */}
      {shouldShowParagraphLayer && <div className="space-y-5">
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
            settings={{ depth: depthLevel, tone: toneLevel as Tone, view: renderPolicy }}
          />
        ))}
      </div>}
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
  settings: InsightSettings;
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
  settings,
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
            settings={settings}
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
  settings: InsightSettings;
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
  settings,
}) => {
  const style = PRIORITY_STYLES[item.priority];
  const linkedInsight = rankedInsights.find(r => r.id === item.id);
  const page = item.evidence?.[0]?.page;
  const resolvedPage = page ?? (item.sourceRef?.pageIndex !== undefined ? item.sourceRef.pageIndex + 1 : undefined);
  const { expandedCardIds, toggleExpandedCard, pinnedTexts } = useInsightsPanelStore();
  const layered = useMemo(() => buildLayeredCardContent(item, settings), [item, settings]);
  const pinnedKey = (item.sourceRef?.quote ?? item.content ?? '').slice(0, 80);
  const isPinned = pinnedTexts.includes(pinnedKey);
  const isExpanded = expandedCardIds.includes(item.id);

  const handleClick = () => {
    const focusText = item.sourceRef?.quote ?? item.content;
    if (onHighlightParagraph && focusText) {
      onHighlightParagraph(focusText);
    }
    if (linkedInsight && onInsightClick) {
      onInsightClick(linkedInsight);
    }
  };

  const categoryTag = CATEGORY_PURPOSE_TAG[item.category];
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
        p-2.5 rounded-lg border border-l-4 transition-all cursor-pointer
        ${CATEGORY_LEFT_BORDER[item.category] ?? 'border-l-gray-600/40'}
        ${style.bg} hover:border-gray-600 hover:-translate-y-0.5 hover:shadow-lg
        ${isActive ? 'border-teal-500 ring-1 ring-teal-500/50' : isPinned ? 'border-teal-600/60 ring-1 ring-teal-700/40' : 'border-gray-700'}
      `}
    >
      <div className="sticky top-0 z-10 -mx-2.5 px-2.5 py-1.5 mb-1.5 border-b border-gray-700/40 bg-gray-900/70 backdrop-blur-sm flex items-center gap-1.5">
        <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap ${categoryTag.color} ${categoryTag.textColor}`}>
          {categoryTag.icon} {categoryTag.label}
        </span>
        <span className="text-[8px] font-mono text-gray-300 whitespace-nowrap">Pg {resolvedPage ?? '—'}</span>
        <span className="text-[8px] font-mono text-gray-400 whitespace-nowrap">¶ {item.sourceRef?.paragraphId || 'n/a'}</span>
        <span className="text-[8px] text-gray-500 whitespace-nowrap">match {(Math.round((item.sourceRef?.confidence ?? 0.7) * 100))}%</span>
        <span className="flex-1" />
        {isPinned && <span className="text-[8px] text-teal-400" title="Pinned highlight">📍</span>}
        {page !== undefined && onJumpToPage && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onJumpToPage(page);
            }}
            className="text-teal-400 hover:text-teal-300 flex-shrink-0 whitespace-nowrap"
            style={metaStyle}
          >
            Jump to source
          </button>
        )}
      </div>

      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm flex-shrink-0">{style.icon}</span>
          <span className={`font-medium ${style.text} whitespace-nowrap overflow-hidden text-ellipsis`} style={titleStyle}>
            {item.title}
          </span>
        </div>
      </div>

      <div className="space-y-1.5 pl-1" style={bodyStyle}>
        <p className={settings.view === 'condensed' && !isExpanded ? 'line-clamp-2 text-gray-300' : 'text-gray-300'}>{layered.snapshot}</p>

        {(settings.view === 'expanded' || isExpanded) && settings.depth !== 'minimal' && (
          <ul className="list-disc pl-4 text-gray-300">
            {layered.coreMeaning.map((point, idx) => <li key={`${item.id}_core_${idx}`}>{point}</li>)}
          </ul>
        )}

        {(settings.view === 'expanded' || isExpanded) && settings.depth !== 'minimal' && (
          <div className="text-gray-400">
            {layered.structuredLogic.map((line, idx) => <p key={`${item.id}_logic_${idx}`}>{line}</p>)}
          </div>
        )}

        {(settings.view === 'expanded' || isExpanded) && settings.depth === 'deep' && (
          <ul className="list-disc pl-4 text-amber-200">
            {layered.examClinical.map((point, idx) => <li key={`${item.id}_exam_${idx}`}>{point}</li>)}
          </ul>
        )}
      </div>

      <div className="mt-2 pl-1">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleExpandedCard(item.id);
          }}
          className="text-[10px] px-2 py-1 rounded border border-gray-700/60 bg-gray-800/40 hover:bg-gray-700/50"
        >
          {isExpanded ? 'Collapse' : 'Expand'}
        </button>
      </div>

      {item.tags && item.tags.length > 0 && (
        <div className="flex gap-1 mt-1.5 pl-1 flex-wrap">
          {item.tags.slice(0, 3).map(tag => (
            <span key={tag} className="px-1 py-0.5 bg-gray-700/50 text-gray-400 rounded" style={metaStyle}>
              {tag}
            </span>
          ))}
        </div>
      )}

      {item.sourceRef && (onJumpToSource || onJumpToPage) && (
        <div className="mt-2 pl-1" onClick={(e) => e.stopPropagation()}>
          <SourceAnchor sourceRef={item.sourceRef} onJump={onJumpToSource} collapsed={settings.view === 'condensed' && !isExpanded} />
        </div>
      )}

      {linkedInsight && (onSaveToNoteLab || onMarkConfusing) && (
        <div className="flex gap-1 mt-2 pl-1">
          {onSaveToNoteLab && (
            <button onClick={(e) => { e.stopPropagation(); onSaveToNoteLab(linkedInsight); }} className="px-1.5 py-0.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded" style={metaStyle}>💾 Save</button>
          )}
          {onMarkConfusing && (
            <button onClick={(e) => { e.stopPropagation(); onMarkConfusing(linkedInsight); }} className="px-1.5 py-0.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded" style={metaStyle}>❓ Confusing</button>
          )}
        </div>
      )}
    </div>
  );
};

export default PriorityComprehensionPanel;
