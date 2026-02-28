// lib/intelligence/orientation.ts
// Paragraph Orientation — assigns cognitive role, purpose, and function metadata.
//
// Removes the "where am I?" friction by telling the reader exactly what job
// a paragraph performs in the broader knowledge structure.
//
// PurposeTag → what the paragraph IS (epistemological role)
// OrientationHeader → the full display metadata block

import type { ParagraphUnit } from '@/lib/page-intelligence/types';

// ============================================================================
// Types
// ============================================================================

export type PurposeTag =
  | 'Definition'
  | 'Mechanism'
  | 'Clinical Reasoning'
  | 'Representation Example'
  | 'Supporting Evidence'
  | 'Exam Relevance'
  | 'Common Error Warning'
  | 'Threshold / Criterion'
  | 'Diagnostic Principle'
  | 'Foundational Concept';

export interface OrientationHeader {
  /** Page number (1-based) */
  page: number | null;
  /** Section/chapter title if derivable */
  section: string | null;
  /** 1-based paragraph index within the page */
  paragraphIndex: number | null;
  /** Semantic role label */
  role: string;
  /** PurposeTag — what this paragraph IS */
  purposeTag: PurposeTag;
  /** One-line purpose statement */
  purpose: string;
  /** One-line function statement */
  function: string;
}

// ============================================================================
// Pattern-based purpose detector
// ============================================================================

interface PurposeRule {
  tag: PurposeTag;
  role: string;
  purpose: string;
  function: string;
  patterns: RegExp[];
}

const PURPOSE_RULES: PurposeRule[] = [
  {
    tag: 'Definition',
    role: 'Conceptual Anchor',
    purpose: 'Establishes conceptual boundaries',
    function: 'Foundational terminology',
    patterns: [
      /\bis defined as\b/i,
      /\brefers to\b/i,
      /\bterm[s]? (means?|denotes?|describes?)\b/i,
      /^[A-Z][^.]{3,40}(is|are) (a|an|the) /,
    ],
  },
  {
    tag: 'Mechanism',
    role: 'Mechanistic Explanation',
    purpose: 'Explains how a system operates',
    function: 'Process and pathway logic',
    patterns: [
      /\bmechanism\b/i,
      /\bpathway\b/i,
      /\bleads to\b/i,
      /\bcauses?\b/i,
      /\bresults in\b/i,
      /\bproduces?\b/i,
      /\bactivates?\b/i,
      /\binhibits?\b/i,
      /\btriggers?\b/i,
    ],
  },
  {
    tag: 'Clinical Reasoning',
    role: 'Diagnostic Reasoning Principle',
    purpose: 'Guides clinical decision-making',
    function: 'Foundational diagnostic logic',
    patterns: [
      /\bdiagnos[ei]/i,
      /\bclinical (reasoning|decision|judgment|approach)\b/i,
      /\bdifferential\b/i,
      /\bpresent(s|ing|ation)?\b/i,
      /\bhistory[\s-]taking\b/i,
      /\bclinician must\b/i,
      /\bphysician (should|must|can)\b/i,
    ],
  },
  {
    tag: 'Representation Example',
    role: 'Conceptual Illustration',
    purpose: 'Shows an alternate conceptual form',
    function: 'Bridges theory to application',
    patterns: [
      /\bfor example\b/i,
      /\bfor instance\b/i,
      /\bsuch as\b/i,
      /\bconsider (the case|a patient)\b/i,
      /\billustrat(e|ed|ion)\b/i,
      /\banalog[uy]\b/i,
    ],
  },
  {
    tag: 'Exam Relevance',
    role: 'High-Yield Exam Point',
    purpose: 'Frequently tested principle',
    function: 'Direct exam preparation value',
    patterns: [
      /\bhigh[- ]yield\b/i,
      /\bcommonly tested\b/i,
      /\bclassic(ally)?\b/i,
      /\bmost common\b/i,
      /\bgold standard\b/i,
      /\bfirst[- ]line\b/i,
      /\bhallmark\b/i,
      /\bpathognomonic\b/i,
    ],
  },
  {
    tag: 'Common Error Warning',
    role: 'Diagnostic Pitfall',
    purpose: 'Prevents diagnostic mistake',
    function: 'Error-prevention guidance',
    patterns: [
      /\bcommon (error|mistake|pitfall)\b/i,
      /\bdo not confuse\b/i,
      /\bmistakenly\b/i,
      /\bpitfall\b/i,
      /\bincorrectly\b/i,
      /\boverlook\b/i,
      /\bDAT trap\b/i,
      /\bdistractor\b/i,
    ],
  },
  {
    tag: 'Threshold / Criterion',
    role: 'Diagnostic Criterion',
    purpose: 'Defines decision boundary',
    function: 'Quantitative clinical cutoff',
    patterns: [
      /\b(greater|more|less) than\b/i,
      /\b≥|≤|>|</,
      /\b(mg\/dL|mmHg|bpm|mEq|μg)\b/i,
      /\bthreshold\b/i,
      /\bcriterion\b/i,
      /\bcriteria\b/i,
      /\bstage [IVX\d]/i,
      /\bgrade [IVX\d]/i,
    ],
  },
  {
    tag: 'Supporting Evidence',
    role: 'Evidentiary Support',
    purpose: 'Strengthens concept validity',
    function: 'Backing data or rationale',
    patterns: [
      /\bstud(y|ies) (show|demonstrate|found)\b/i,
      /\bevidence\b/i,
      /\bresearch\b/i,
      /\bdata (suggest|indicate|show)\b/i,
      /\btrial\b/i,
    ],
  },
  {
    tag: 'Diagnostic Principle',
    role: 'Clinical Principle',
    purpose: 'Encodes a broad diagnostic truth',
    function: 'Orienting framework for reasoning',
    patterns: [
      /\bprinciple\b/i,
      /\bfoundation(al)?\b/i,
      /\brule of\b/i,
      /\bgeneral(ly|ization)?\b/i,
      /\bapproach to\b/i,
    ],
  },
];

// ============================================================================
// Detector
// ============================================================================

/**
 * Determine the PurposeTag and orientation metadata for a ParagraphUnit.
 * Falls back to 'Foundational Concept' if no rules match.
 */
export function orientParagraph(
  unit: ParagraphUnit,
  paragraphIndex?: number,
): OrientationHeader {
  const text = unit.text ?? '';

  // Map ParagraphUnit.role → fallback orientation
  const roleBasedFallback = getRoleBasedFallback(unit.role);

  // Score each rule
  const scored = PURPOSE_RULES.map((rule) => {
    const hits = rule.patterns.filter((re) => re.test(text)).length;
    return { rule, hits };
  }).filter((r) => r.hits > 0);

  scored.sort((a, b) => b.hits - a.hits);

  const best = scored[0]?.rule ?? roleBasedFallback;

  return {
    page: unit.pageIndex != null ? unit.pageIndex + 1 : null,
    section: null, // populated by caller if chapter data is available
    paragraphIndex: paragraphIndex != null ? paragraphIndex + 1 : null,
    role: best.role,
    purposeTag: best.tag,
    purpose: best.purpose,
    function: best.function,
  };
}

function getRoleBasedFallback(role: string | undefined): PurposeRule {
  switch (role) {
    case 'definition':    return PURPOSE_RULES[0]; // Definition
    case 'mechanism':     return PURPOSE_RULES[1]; // Mechanism
    case 'clinical':      return PURPOSE_RULES[2]; // Clinical Reasoning
    case 'example':       return PURPOSE_RULES[3]; // Representation Example
    case 'exam_trap':     return PURPOSE_RULES[5]; // Common Error Warning
    case 'formula':       return PURPOSE_RULES[6]; // Threshold / Criterion
    default:
      return {
        tag: 'Foundational Concept',
        role: 'Foundational Concept',
        purpose: 'Establishes core domain knowledge',
        function: 'Conceptual grounding',
        patterns: [],
      };
  }
}

// ============================================================================
// Purpose tag display config
// ============================================================================

export interface PurposeTagConfig {
  label: PurposeTag;
  color: string;       // Tailwind bg class
  textColor: string;   // Tailwind text class
  icon: string;
  description: string;
}

export const PURPOSE_TAG_CONFIG: Record<PurposeTag, PurposeTagConfig> = {
  'Definition':             { label: 'Definition',             color: 'bg-blue-900/40',    textColor: 'text-blue-300',   icon: '📖', description: 'Establishes conceptual boundary' },
  'Mechanism':              { label: 'Mechanism',              color: 'bg-violet-900/40',  textColor: 'text-violet-300', icon: '⚙️', description: 'Explains how a system operates' },
  'Clinical Reasoning':     { label: 'Clinical Reasoning',     color: 'bg-teal-900/40',    textColor: 'text-teal-300',   icon: '🧠', description: 'Guides diagnostic decisions' },
  'Representation Example': { label: 'Representation Example', color: 'bg-amber-900/40',   textColor: 'text-amber-300',  icon: '🔁', description: 'Shows alternate conceptual form' },
  'Supporting Evidence':    { label: 'Supporting Evidence',    color: 'bg-gray-800/60',    textColor: 'text-gray-400',   icon: '📊', description: 'Strengthens concept validity' },
  'Exam Relevance':         { label: 'Exam Relevance',         color: 'bg-yellow-900/40',  textColor: 'text-yellow-300', icon: '⭐', description: 'Frequently tested principle' },
  'Common Error Warning':   { label: 'Common Error Warning',   color: 'bg-red-900/40',     textColor: 'text-red-300',    icon: '⚠️', description: 'Prevents diagnostic mistake' },
  'Threshold / Criterion':  { label: 'Threshold / Criterion',  color: 'bg-cyan-900/40',    textColor: 'text-cyan-300',   icon: '📏', description: 'Quantitative clinical cutoff' },
  'Diagnostic Principle':   { label: 'Diagnostic Principle',   color: 'bg-indigo-900/40',  textColor: 'text-indigo-300', icon: '🎯', description: 'Orienting diagnostic framework' },
  'Foundational Concept':   { label: 'Foundational Concept',   color: 'bg-gray-800/40',    textColor: 'text-gray-400',   icon: '🔩', description: 'Core domain knowledge' },
};
