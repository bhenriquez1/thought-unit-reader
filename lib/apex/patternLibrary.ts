// lib/apex/patternLibrary.ts
// DAT Apex Pattern Library - High-Yield Exam Patterns

import type { RankedInsight } from '@/lib/relationshipSchema/types';

// ============================================================================
// Types
// ============================================================================

export type DATSection =
  | 'biology'
  | 'chemistry'
  | 'organic'
  | 'perceptual'
  | 'reading'
  | 'quantitative';

export type PatternFrequency = 'very_high' | 'high' | 'moderate' | 'low';

export interface ExamPattern {
  id: string;
  patternName: string;

  // Trigger conditions
  triggerKeywords: string[];
  triggerRelations: string[];  // Predicate types that trigger this
  trapKeywords: string[];      // Keywords that indicate trap

  // Output content
  output: {
    whatTheyTest: string;
    commonTrap: string;
    decisionRule: string;
    quickMnemonic?: string;
  };

  // Metadata
  section: DATSection;
  frequency: PatternFrequency;
}

export interface PatternMatch {
  pattern: ExamPattern;
  matchScore: number;       // 0-1
  matchedKeywords: string[];
  matchedRelations: string[];
  isTrapContext: boolean;
}

// ============================================================================
// Pattern Library
// ============================================================================

export const DAT_PATTERNS: ExamPattern[] = [
  // ============================================
  // BIOLOGY - Cell Biology
  // ============================================
  {
    id: 'bio-enzyme-kinetics',
    patternName: 'Enzyme Kinetics',
    triggerKeywords: [
      'michaelis-menten', 'km', 'vmax', 'enzyme inhibition',
      'competitive', 'noncompetitive', 'uncompetitive', 'allosteric',
    ],
    triggerRelations: ['inhibits', 'activates', 'increases', 'reduces'],
    trapKeywords: ['competitive vs noncompetitive', 'km unchanged', 'vmax unchanged'],
    output: {
      whatTheyTest: 'Distinguish inhibition types by effect on Km and Vmax',
      commonTrap: 'Confusing competitive (Km increases, Vmax same) with noncompetitive (Km same, Vmax decreases)',
      decisionRule: 'IF inhibitor binds active site THEN competitive (Km up). IF binds elsewhere THEN noncompetitive (Vmax down).',
      quickMnemonic: 'C = Competes at site = Km Changes. N = Not at site = No Km change',
    },
    section: 'biology',
    frequency: 'very_high',
  },
  {
    id: 'bio-cell-cycle',
    patternName: 'Cell Cycle Regulation',
    triggerKeywords: [
      'g1', 'g2', 's phase', 'mitosis', 'cyclin', 'cdk',
      'checkpoint', 'p53', 'rb', 'tumor suppressor',
    ],
    triggerRelations: ['activates', 'inhibits', 'triggers', 'prevents'],
    trapKeywords: ['g1 vs g2 checkpoint', 'cyclin-cdk'],
    output: {
      whatTheyTest: 'Checkpoint functions and cyclin-CDK regulation',
      commonTrap: 'Mixing up G1 (DNA damage check) vs G2 (replication complete check)',
      decisionRule: 'IF DNA damaged THEN p53 activates → G1 arrest. IF unreplicated THEN G2 arrest.',
      quickMnemonic: 'G1 = Growth check (size, damage). G2 = Genome check (replication)',
    },
    section: 'biology',
    frequency: 'high',
  },
  {
    id: 'bio-membrane-transport',
    patternName: 'Membrane Transport',
    triggerKeywords: [
      'passive', 'active transport', 'facilitated diffusion',
      'channel', 'carrier', 'pump', 'atp', 'concentration gradient',
    ],
    triggerRelations: ['requires', 'enables', 'causes'],
    trapKeywords: ['with gradient vs against', 'atp required'],
    output: {
      whatTheyTest: 'Classify transport mechanisms by energy requirement',
      commonTrap: 'Facilitated diffusion is passive (no ATP) but uses proteins',
      decisionRule: 'IF against gradient THEN active (ATP). IF with gradient THEN passive.',
      quickMnemonic: 'Against = Active = ATP',
    },
    section: 'biology',
    frequency: 'very_high',
  },

  // ============================================
  // BIOLOGY - Genetics
  // ============================================
  {
    id: 'bio-genetics-inheritance',
    patternName: 'Inheritance Patterns',
    triggerKeywords: [
      'autosomal dominant', 'autosomal recessive', 'x-linked',
      'carrier', 'pedigree', 'affected', 'heterozygous', 'homozygous',
    ],
    triggerRelations: ['causes', 'indicates', 'suggests'],
    trapKeywords: ['skip generation', 'male only', 'carrier female'],
    output: {
      whatTheyTest: 'Identify inheritance pattern from pedigree',
      commonTrap: 'X-linked recessive affects males primarily but carrier females pass it on',
      decisionRule: 'IF male-to-male transmission THEN autosomal. IF no male-to-male AND mostly males THEN X-linked.',
      quickMnemonic: 'Father → Son = Not X-linked (Y goes there)',
    },
    section: 'biology',
    frequency: 'very_high',
  },

  // ============================================
  // BIOLOGY - Microbiology
  // ============================================
  {
    id: 'bio-gram-staining',
    patternName: 'Gram Staining',
    triggerKeywords: [
      'gram positive', 'gram negative', 'peptidoglycan',
      'lipopolysaccharide', 'lps', 'cell wall', 'bacteria',
    ],
    triggerRelations: ['contains', 'causes', 'produces'],
    trapKeywords: ['crystal violet', 'thick vs thin'],
    output: {
      whatTheyTest: 'Cell wall structure and gram stain results',
      commonTrap: 'Gram-negative has thin peptidoglycan (not absent) plus outer membrane',
      decisionRule: 'IF thick peptidoglycan THEN gram-positive (purple). IF thin + LPS THEN gram-negative (pink).',
      quickMnemonic: 'Positive = Purple = Peptidoglycan thick',
    },
    section: 'biology',
    frequency: 'high',
  },

  // ============================================
  // CHEMISTRY - General
  // ============================================
  {
    id: 'chem-acid-base',
    patternName: 'Acid-Base Chemistry',
    triggerKeywords: [
      'ph', 'pka', 'buffer', 'henderson-hasselbalch',
      'conjugate acid', 'conjugate base', 'weak acid', 'strong acid',
    ],
    triggerRelations: ['increases', 'reduces', 'produces'],
    trapKeywords: ['ph vs pka', 'buffer capacity'],
    output: {
      whatTheyTest: 'Henderson-Hasselbalch application and buffer selection',
      commonTrap: 'Buffer works best when pH = pKa (50% ionized)',
      decisionRule: 'IF pH < pKa THEN more protonated (HA). IF pH > pKa THEN more deprotonated (A-).',
      quickMnemonic: 'pH = pKa when [HA] = [A-]',
    },
    section: 'chemistry',
    frequency: 'very_high',
  },
  {
    id: 'chem-oxidation-reduction',
    patternName: 'Oxidation-Reduction',
    triggerKeywords: [
      'oxidation', 'reduction', 'redox', 'electron transfer',
      'oxidizing agent', 'reducing agent', 'galvanic', 'electrolytic',
    ],
    triggerRelations: ['causes', 'produces', 'enables'],
    trapKeywords: ['loses vs gains electrons', 'oilrig', 'leoger'],
    output: {
      whatTheyTest: 'Identify oxidation states and predict electron flow',
      commonTrap: 'Oxidizing agent gets reduced (gains electrons)',
      decisionRule: 'IF loses electrons THEN oxidized. IF gains electrons THEN reduced.',
      quickMnemonic: 'OIL RIG: Oxidation Is Loss, Reduction Is Gain',
    },
    section: 'chemistry',
    frequency: 'very_high',
  },

  // ============================================
  // ORGANIC CHEMISTRY
  // ============================================
  {
    id: 'org-sn1-vs-sn2',
    patternName: 'SN1 vs SN2 Reactions',
    triggerKeywords: [
      'sn1', 'sn2', 'nucleophilic substitution', 'carbocation',
      'backside attack', 'inversion', 'racemization', 'leaving group',
    ],
    triggerRelations: ['causes', 'produces', 'enables'],
    trapKeywords: ['primary vs tertiary', 'polar protic', 'polar aprotic'],
    output: {
      whatTheyTest: 'Predict mechanism based on substrate and conditions',
      commonTrap: 'SN2 needs aprotic solvent; SN1 favored by protic solvent',
      decisionRule: 'IF primary/methyl + strong nucleophile THEN SN2. IF tertiary + weak nucleophile THEN SN1.',
      quickMnemonic: 'SN2 = 2 molecules in rate step = needs access (primary). SN1 = 1 molecule = stable carbocation (tertiary)',
    },
    section: 'organic',
    frequency: 'very_high',
  },
  {
    id: 'org-e1-vs-e2',
    patternName: 'E1 vs E2 Elimination',
    triggerKeywords: [
      'e1', 'e2', 'elimination', 'beta elimination',
      'dehydrohalogenation', 'zaitsev', 'hofmann',
    ],
    triggerRelations: ['produces', 'causes'],
    trapKeywords: ['strong base vs weak base', 'anti-periplanar'],
    output: {
      whatTheyTest: 'Predict elimination product and mechanism',
      commonTrap: 'E2 requires anti-periplanar geometry; E1 can rotate to most stable alkene',
      decisionRule: 'IF strong base + secondary/tertiary THEN E2. IF weak base + tertiary THEN E1.',
      quickMnemonic: 'E2 = 2 things leaving at once = needs strong base to pull',
    },
    section: 'organic',
    frequency: 'high',
  },

  // ============================================
  // DENTAL-SPECIFIC BIOLOGY
  // ============================================
  {
    id: 'dental-enamel-formation',
    patternName: 'Amelogenesis',
    triggerKeywords: [
      'ameloblast', 'enamel', 'amelogenin', 'hydroxyapatite',
      'secretory', 'maturation', 'enamel rod',
    ],
    triggerRelations: ['produces', 'secretes', 'causes'],
    trapKeywords: ['secretory vs maturation stage', 'amelogenin removal'],
    output: {
      whatTheyTest: 'Stages of enamel formation and ameloblast function',
      commonTrap: 'Amelogenin is secreted then removed during maturation; enamelins remain',
      decisionRule: 'IF secretory stage THEN amelogenin + matrix proteins. IF maturation THEN amelogenin removed, mineralization increases.',
      quickMnemonic: 'Secretory = Soft matrix. Maturation = Mineral hard',
    },
    section: 'biology',
    frequency: 'high',
  },
  {
    id: 'dental-pulp-innervation',
    patternName: 'Pulp Innervation',
    triggerKeywords: [
      'pulp', 'trigeminal', 'v2', 'v3', 'innervation',
      'maxillary', 'mandibular', 'dental nerve',
    ],
    triggerRelations: ['innervates', 'located_in', 'part_of'],
    trapKeywords: ['maxillary vs mandibular', 'referred pain'],
    output: {
      whatTheyTest: 'Nerve supply to teeth and pain referral',
      commonTrap: 'Maxillary teeth = V2. Mandibular teeth = V3. Pain can refer between them.',
      decisionRule: 'IF upper teeth THEN V2 (maxillary). IF lower teeth THEN V3 (mandibular).',
      quickMnemonic: 'V2 = "2"p = upper. V3 = "3"rd = lower (mandible)',
    },
    section: 'biology',
    frequency: 'very_high',
  },
];

// ============================================================================
// Pattern Matching Functions
// ============================================================================

/**
 * Find matching patterns for an insight
 */
export function findMatchingPatterns(insight: RankedInsight): PatternMatch[] {
  const matches: PatternMatch[] = [];
  const insightText = [
    insight.title,
    insight.claim,
    insight.whyItMatters,
    ...insight.tags,
  ].join(' ').toLowerCase();

  for (const pattern of DAT_PATTERNS) {
    const matchedKeywords: string[] = [];
    const matchedRelations: string[] = [];
    let isTrapContext = false;

    // Check keyword matches
    for (const keyword of pattern.triggerKeywords) {
      if (insightText.includes(keyword.toLowerCase())) {
        matchedKeywords.push(keyword);
      }
    }

    // Check trap context
    for (const trapWord of pattern.trapKeywords) {
      if (insightText.includes(trapWord.toLowerCase())) {
        isTrapContext = true;
        break;
      }
    }

    // Calculate match score
    const keywordScore = matchedKeywords.length / pattern.triggerKeywords.length;
    const matchScore = Math.min(1, keywordScore * 1.5); // Boost for partial matches

    if (matchScore >= 0.2) { // Threshold for relevance
      matches.push({
        pattern,
        matchScore,
        matchedKeywords,
        matchedRelations,
        isTrapContext,
      });
    }
  }

  // Sort by match score descending
  return matches.sort((a, b) => b.matchScore - a.matchScore);
}

/**
 * Get the best matching pattern for an insight
 */
export function getBestPattern(insight: RankedInsight): PatternMatch | null {
  const matches = findMatchingPatterns(insight);
  return matches.length > 0 ? matches[0] : null;
}

/**
 * Enrich insight with DAT Apex badge
 */
export function enrichInsightWithApex(insight: RankedInsight): RankedInsight {
  const match = getBestPattern(insight);

  if (!match || match.matchScore < 0.3) {
    return insight;
  }

  return {
    ...insight,
    apexPatternId: match.pattern.id,
    apexBadge: {
      patternName: match.pattern.patternName,
      whatTheyTest: match.pattern.output.whatTheyTest,
      commonTrap: match.pattern.output.commonTrap,
      decisionRule: match.pattern.output.decisionRule,
      quickMnemonic: match.pattern.output.quickMnemonic,
    },
  };
}

/**
 * Batch enrich insights with DAT Apex badges
 */
export function enrichInsightsWithApex(insights: RankedInsight[]): RankedInsight[] {
  return insights.map(enrichInsightWithApex);
}

/**
 * Get patterns by section
 */
export function getPatternsBySection(section: DATSection): ExamPattern[] {
  return DAT_PATTERNS.filter(p => p.section === section);
}

/**
 * Get high-frequency patterns
 */
export function getHighFrequencyPatterns(): ExamPattern[] {
  return DAT_PATTERNS.filter(p => p.frequency === 'very_high' || p.frequency === 'high');
}

export default {
  DAT_PATTERNS,
  findMatchingPatterns,
  getBestPattern,
  enrichInsightWithApex,
  enrichInsightsWithApex,
  getPatternsBySection,
  getHighFrequencyPatterns,
};
