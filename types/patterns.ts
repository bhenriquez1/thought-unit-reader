// DAT Pattern Recognition System - Based on Thought Unit Program & DAT Apex
// Comprehensive pattern library for medical/dental exam preparation

export interface PatternRule {
  key: string;
  description: string;
  example?: string;
}

export interface Pattern {
  id: string;
  name: string;
  category: 'organic-chemistry' | 'general-chemistry' | 'biology' | 'dentistry' | 'reading-comprehension';
  description: string;
  rules: PatternRule[];
  examples: string[];
  commonMistakes: string[];
  tags: string[];
}

export const DAT_PATTERNS: Pattern[] = [
  // ORGANIC CHEMISTRY PATTERNS
  {
    id: 'cardio',
    name: 'Acid/Base - CARDIO',
    category: 'organic-chemistry',
    description: 'Systematic approach to predicting acid/base strength using 5 factors',
    rules: [
      {
        key: 'C - Charge',
        description: '(+) charge makes more acidic, (-) charge makes more basic',
        example: 'NH₄⁺ more acidic than NH₃'
      },
      {
        key: 'A - Atom',
        description: 'Across row: electronegativity ↑ → acidity ↑. Down group: size ↑ → acidity ↑',
        example: 'HF > H₂O > NH₃ > CH₄ (across period 2)'
      },
      {
        key: 'R - Resonance',
        description: 'Resonance delocalization stabilizes conjugate base → acidity ↑',
        example: 'Carboxylic acids vs alcohols (COOH vs CH₃OH)'
      },
      {
        key: 'D - Dipole Induction',
        description: 'Electron-withdrawing groups (EWG) increase acidity',
        example: 'CCl₃COOH > CH₃COOH (trichloroacetic vs acetic)'
      },
      {
        key: 'I - Hybridization (Orbital)',
        description: 'More s-character → more acidic: sp > sp² > sp³',
        example: 'Terminal alkyne > alkene > alkane acidity'
      }
    ],
    examples: [
      'Rank acidity: CH₃COOH, CCl₃COOH, CH₃CH₂OH',
      'Which is more basic: NH₃ or PH₃?',
      'Explain why phenol is more acidic than cyclohexanol'
    ],
    commonMistakes: [
      'Forgetting resonance stabilization',
      'Confusing inductive effects direction',
      'Ignoring hybridization differences'
    ],
    tags: ['acid-base', 'pka', 'organic', 'high-yield']
  },
  {
    id: '5q-rule',
    name: 'Reaction Recognition - 5Q Rule',
    category: 'organic-chemistry',
    description: 'Systematic analysis of organic reactions using 5 key questions',
    rules: [
      {
        key: 'Q1 - What adds?',
        description: 'Identify the reagent and what it contributes to the reaction',
        example: 'HBr adds H⁺ and Br⁻'
      },
      {
        key: 'Q2 - Where does it add?',
        description: 'Determine regioselectivity (Markovnikov vs anti-Markovnikov)',
        example: 'HBr to alkenes: H to less substituted carbon (Markovnikov)'
      },
      {
        key: 'Q3 - How does it add?',
        description: 'Determine stereochemistry (syn vs anti addition)',
        example: 'Br₂ addition is anti, OsO₄ is syn'
      },
      {
        key: 'Q4 - What\'s the intermediate?',
        description: 'Identify reaction mechanism (carbocation, bromonium ion, radical, etc.)',
        example: 'HBr + alkene → carbocation intermediate'
      },
      {
        key: 'Q5 - Rearrangement possible?',
        description: 'Check if carbocation can rearrange (1°→2°→3°)',
        example: 'Yes if carbocation intermediate, no for concerted reactions'
      }
    ],
    examples: [
      'Predict product of 1-butene + HBr',
      'What happens when 3,3-dimethyl-1-butene reacts with HCl?',
      'Compare addition of Br₂ vs HBr to cyclohexene'
    ],
    commonMistakes: [
      'Forgetting carbocation rearrangements',
      'Mixing up syn vs anti stereochemistry',
      'Not considering regioselectivity'
    ],
    tags: ['reactions', 'mechanism', 'alkenes', 'carbocation']
  },
  {
    id: 'sn-e-flow',
    name: 'SN1/SN2/E1/E2 Flow',
    category: 'organic-chemistry',
    description: 'Decision tree for substitution vs elimination reactions',
    rules: [
      {
        key: 'Strong nucleophile + 1°/2° + aprotic solvent',
        description: '→ SN2 mechanism',
        example: 'CH₃I + CN⁻ in acetone → SN2'
      },
      {
        key: 'Weak nucleophile + 3° + protic solvent',
        description: '→ SN1 mechanism',
        example: 't-BuBr + H₂O → SN1'
      },
      {
        key: 'Strong base + 2°/3° substrate',
        description: '→ E2 elimination',
        example: 't-BuBr + KOtBu → E2'
      },
      {
        key: 'Weak base + 3° + protic solvent + heat',
        description: '→ E1 elimination',
        example: 't-BuBr + H₂O, heat → E1'
      }
    ],
    examples: [
      'Predict mechanism: CH₃CH₂Br + OH⁻ in ethanol',
      'What happens to 2-bromo-2-methylpropane in water?',
      'Choose conditions for SN2: primary vs tertiary substrate'
    ],
    commonMistakes: [
      'Confusing nucleophile vs base strength',
      'Forgetting solvent effects',
      'Not considering substrate structure'
    ],
    tags: ['substitution', 'elimination', 'mechanism', 'stereochemistry']
  },
  {
    id: 'spectroscopy-anchors',
    name: 'Spectroscopy Anchors',
    category: 'organic-chemistry',
    description: 'Key IR and NMR signals for structure determination',
    rules: [
      {
        key: 'IR 1700 cm⁻¹',
        description: 'C=O stretch (carbonyl group)',
        example: 'Ketones, aldehydes, carboxylic acids, esters'
      },
      {
        key: 'IR broad 3300 cm⁻¹',
        description: 'O-H stretch (alcohol, carboxylic acid)',
        example: 'Broad = hydrogen bonded OH'
      },
      {
        key: 'IR sharp 3300 cm⁻¹',
        description: 'N-H stretch (1 peak = NH, 2 peaks = NH₂)',
        example: 'Amines, amides'
      },
      {
        key: 'IR 2200 cm⁻¹',
        description: 'Triple bond (C≡N nitrile or C≡C alkyne)',
        example: 'CH₃CN or HC≡CH'
      },
      {
        key: 'IR 1600 cm⁻¹',
        description: 'C=C aromatic ring stretches',
        example: 'Benzene derivatives'
      },
      {
        key: '¹³C NMR',
        description: 'Count unique carbons (consider symmetry)',
        example: 'Benzene = 1 signal, toluene = 5 signals'
      }
    ],
    examples: [
      'Distinguish ketone vs aldehyde using IR',
      'How many ¹³C signals in para-dichlorobenzene?',
      'Identify functional groups from IR spectrum'
    ],
    commonMistakes: [
      'Confusing broad vs sharp peaks',
      'Forgetting symmetry in NMR',
      'Misassigning carbonyl frequencies'
    ],
    tags: ['spectroscopy', 'ir', 'nmr', 'structure-determination']
  },
  {
    id: 'eas-directors',
    name: 'Aromatic Substitution (EAS)',
    category: 'organic-chemistry',
    description: 'Predicting directing effects in electrophilic aromatic substitution',
    rules: [
      {
        key: 'Ortho/para directors (EDG)',
        description: 'Electron-donating groups: -OH, -NH₂, -OR, -CH₃, halogens*',
        example: 'Toluene gives ortho and para products'
      },
      {
        key: 'Meta directors (EWG)',
        description: 'Electron-withdrawing groups: -NO₂, -CN, -COOH, -SO₃H, -CHO',
        example: 'Nitrobenzene gives meta substitution'
      },
      {
        key: 'Activating vs Deactivating',
        description: 'EDG = activating, EWG = deactivating (except halogens)',
        example: 'Halogens are o,p-directing but deactivating'
      }
    ],
    examples: [
      'Predict products of toluene + Br₂/FeBr₃',
      'Where does NO₂⁺ attack benzoic acid?',
      'Rank reactivity: benzene, toluene, nitrobenzene'
    ],
    commonMistakes: [
      'Thinking halogens are activating',
      'Forgetting resonance effects',
      'Confusing directing vs activating effects'
    ],
    tags: ['aromatic', 'substitution', 'directing-effects', 'resonance']
  },

  // GENERAL CHEMISTRY PATTERNS
  {
    id: 'q-vs-k',
    name: 'Equilibrium - Q vs K',
    category: 'general-chemistry',
    description: 'Predicting reaction direction using reaction quotient vs equilibrium constant',
    rules: [
      {
        key: 'Calculate Q',
        description: 'Q = [products]/[reactants] using current concentrations',
        example: 'For aA + bB ⇌ cC + dD: Q = [C]ᶜ[D]ᵈ/[A]ᵃ[B]ᵇ'
      },
      {
        key: 'Q < K',
        description: 'Reaction shifts forward (toward products)',
        example: 'More products will form'
      },
      {
        key: 'Q > K',
        description: 'Reaction shifts backward (toward reactants)',
        example: 'More reactants will form'
      },
      {
        key: 'Q = K',
        description: 'System is at equilibrium',
        example: 'No net change in concentrations'
      }
    ],
    examples: [
      'Given K = 100, [A] = 0.1 M, [B] = 2.0 M, predict direction',
      'If Q = 0.5 and K = 10, which way does reaction proceed?',
      'Calculate Q for N₂ + 3H₂ ⇌ 2NH₃ given concentrations'
    ],
    commonMistakes: [
      'Using equilibrium vs current concentrations',
      'Forgetting to raise to stoichiometric powers',
      'Confusing Q and K definitions'
    ],
    tags: ['equilibrium', 'thermodynamics', 'reaction-quotient']
  },
  {
    id: 'delta-g-signs',
    name: 'Thermodynamics - ΔG Sign Rules',
    category: 'general-chemistry',
    description: 'Predicting spontaneity using ΔG = ΔH - TΔS',
    rules: [
      {
        key: 'ΔH < 0, ΔS > 0',
        description: '→ Always spontaneous (ΔG always negative)',
        example: 'Exothermic with increased entropy'
      },
      {
        key: 'ΔH > 0, ΔS < 0',
        description: '→ Never spontaneous (ΔG always positive)',
        example: 'Endothermic with decreased entropy'
      },
      {
        key: 'ΔH < 0, ΔS < 0',
        description: '→ Spontaneous at low T (ΔH dominates)',
        example: 'Exothermic but entropy decreases'
      },
      {
        key: 'ΔH > 0, ΔS > 0',
        description: '→ Spontaneous at high T (TΔS dominates)',
        example: 'Endothermic but entropy increases'
      }
    ],
    examples: [
      'Ice melting: ΔH > 0, ΔS > 0. When spontaneous?',
      'Combustion: ΔH < 0, ΔS > 0. Always/never/depends?',
      'Protein folding: ΔH < 0, ΔS < 0. Temperature effect?'
    ],
    commonMistakes: [
      'Forgetting temperature dependence',
      'Confusing sign conventions',
      'Not considering entropy changes'
    ],
    tags: ['thermodynamics', 'spontaneity', 'gibbs-energy']
  },
  {
    id: 'gas-laws',
    name: 'Gas Laws (PV = nRT)',
    category: 'general-chemistry',
    description: 'Universal approach to gas problems using ideal gas law',
    rules: [
      {
        key: 'Identify knowns/unknowns',
        description: 'List P, V, n, R, T values and identify what to solve for',
        example: 'Given P, V, T → solve for n'
      },
      {
        key: 'Use PV = nRT',
        description: 'Always reduce problem to ideal gas law form',
        example: 'P₁V₁/T₁ = P₂V₂/T₂ when n constant'
      },
      {
        key: 'Partial pressures',
        description: 'For mixtures: Pᵢ = XᵢPₜₒₜₐₗ where Xᵢ = nᵢ/nₜₒₜₐₗ',
        example: 'P(O₂) = X(O₂) × Pₜₒₜₐₗ'
      },
      {
        key: 'Units consistency',
        description: 'Match units: R = 0.0821 L·atm/mol·K or 8.314 J/mol·K',
        example: 'Use K for temperature, atm for pressure'
      }
    ],
    examples: [
      'Calculate moles of gas at STP',
      'Find final pressure after temperature change',
      'Determine partial pressure in gas mixture'
    ],
    commonMistakes: [
      'Using Celsius instead of Kelvin',
      'Forgetting to convert pressure units',
      'Misapplying combined gas law'
    ],
    tags: ['gas-laws', 'ideal-gas', 'partial-pressure']
  },

  // BIOLOGY PATTERNS
  {
    id: 'organelle-function',
    name: 'Organelle → Function',
    category: 'biology',
    description: 'Key organelle-function relationships for cell biology',
    rules: [
      {
        key: 'RER (Rough Endoplasmic Reticulum)',
        description: 'Protein synthesis and export (ribosomes attached)',
        example: 'Secreted proteins, membrane proteins'
      },
      {
        key: 'SER (Smooth Endoplasmic Reticulum)',
        description: 'Lipid synthesis and detoxification',
        example: 'Steroid hormones, drug metabolism'
      },
      {
        key: 'Golgi Apparatus',
        description: 'Protein modification, packaging, and sorting',
        example: 'Adding carbohydrates, creating vesicles'
      },
      {
        key: 'Lysosomes',
        description: 'Cellular digestion and waste removal',
        example: 'Break down worn organelles, digest food particles'
      },
      {
        key: 'Mitochondria',
        description: 'ATP production via cellular respiration',
        example: 'Electron transport chain, citric acid cycle'
      }
    ],
    examples: [
      'Which organelle makes steroids?',
      'Where are secreted proteins processed?',
      'What happens to damaged mitochondria?'
    ],
    commonMistakes: [
      'Confusing RER vs SER functions',
      'Forgetting Golgi processing steps',
      'Missing lysosome digestive role'
    ],
    tags: ['cell-biology', 'organelles', 'cellular-functions']
  },
  {
    id: 'genetics-hardy-weinberg',
    name: 'Genetics (Hardy-Weinberg)',
    category: 'biology',
    description: 'Population genetics calculations using Hardy-Weinberg principle',
    rules: [
      {
        key: 'p + q = 1',
        description: 'Allele frequencies must sum to 1',
        example: 'If p = 0.7, then q = 0.3'
      },
      {
        key: 'p² + 2pq + q² = 1',
        description: 'Genotype frequencies: AA + Aa + aa = 1',
        example: 'p² = homozygous dominant frequency'
      },
      {
        key: '2pq = heterozygote frequency',
        description: 'Frequency of heterozygous genotype',
        example: 'If p = 0.8, q = 0.2, then 2pq = 0.32'
      },
      {
        key: 'Assumptions',
        description: 'No mutation, selection, migration, or mating preferences',
        example: 'Large population, random mating'
      }
    ],
    examples: [
      'If 16% have recessive phenotype, find allele frequencies',
      'Calculate heterozygote frequency given p = 0.6',
      'What fraction carries recessive allele?'
    ],
    commonMistakes: [
      'Confusing allele vs genotype frequencies',
      'Forgetting to take square root for q',
      'Not checking if assumptions are met'
    ],
    tags: ['genetics', 'population-genetics', 'allele-frequency']
  },

  // DENTISTRY PATTERNS
  {
    id: 'caries-treatment',
    name: 'Caries/Treatment Algorithm',
    category: 'dentistry',
    description: 'Systematic approach to caries diagnosis and treatment planning',
    rules: [
      {
        key: 'Assess caries risk',
        description: 'Categorize as low, moderate, or high risk',
        example: 'High: frequent snacking, poor hygiene, dry mouth'
      },
      {
        key: 'Evaluate lesion depth',
        description: 'Classify as incipient, moderate, or cavitated',
        example: 'Radiographic depth: enamel, outer/inner dentin, pulpal'
      },
      {
        key: 'Choose management approach',
        description: 'Preventive → Restorative → Surgical as needed',
        example: 'Fluoride/SDF → GIC/composite → RCT/extraction'
      },
      {
        key: 'Consider patient factors',
        description: 'Age, cooperation, medical history, prognosis',
        example: 'Pediatric patients may need different approach'
      }
    ],
    examples: [
      'White spot lesion in high-risk patient',
      'Moderate dentin caries in primary tooth',
      'Deep caries approaching pulp in permanent tooth'
    ],
    commonMistakes: [
      'Over-treating incipient lesions',
      'Ignoring patient risk factors',
      'Not considering tooth prognosis'
    ],
    tags: ['caries', 'treatment-planning', 'preventive-dentistry']
  },
  {
    id: 'endo-pulp-diagnosis',
    name: 'Endo Pulp Vitality Diagnosis',
    category: 'dentistry',
    description: 'Systematic pulpal diagnosis using testing and symptoms',
    rules: [
      {
        key: 'Cold test/EPT response',
        description: 'Normal, lingering, or no response to thermal/electrical tests',
        example: 'Lingering cold pain suggests irreversible pulpitis'
      },
      {
        key: 'Pain characteristics',
        description: 'Spontaneous, provoked, duration, quality',
        example: 'Throbbing, spontaneous pain = irreversible pulpitis'
      },
      {
        key: 'Diagnostic categories',
        description: 'Normal pulp, reversible pulpitis, irreversible pulpitis, necrotic',
        example: 'Based on test results and symptoms'
      },
      {
        key: 'Treatment planning',
        description: 'Monitor, restore, or RCT based on diagnosis',
        example: 'Irreversible pulpitis requires RCT or extraction'
      }
    ],
    examples: [
      'Brief cold sensitivity after restoration',
      'Spontaneous throbbing pain keeping patient awake',
      'No response to cold test, percussion positive'
    ],
    commonMistakes: [
      'Relying on single test result',
      'Ignoring patient pain history',
      'Confusing reversible vs irreversible pulpitis'
    ],
    tags: ['endodontics', 'pulpal-diagnosis', 'pain-management']
  },

  // READING COMPREHENSION PATTERNS
  {
    id: 'cause-effect',
    name: 'Cause ↔ Effect',
    category: 'reading-comprehension',
    description: 'Identifying and preserving causal relationships in passages',
    rules: [
      {
        key: 'Signal words',
        description: 'because, therefore, thus, as a result, consequently, due to',
        example: 'The enzyme was inhibited because of the competitive inhibitor'
      },
      {
        key: 'Map cause → effect clearly',
        description: 'Identify what leads to what in the logical chain',
        example: 'Low pH → enzyme denaturation → reduced activity'
      },
      {
        key: 'Preserve relationship',
        description: 'Correct answer maintains the causal connection',
        example: 'Don\'t reverse cause and effect or break the link'
      },
      {
        key: 'Avoid correlation vs causation',
        description: 'Distinguish between correlation and true causation',
        example: 'Two things happening together ≠ one causes the other'
      }
    ],
    examples: [
      'Identify cause of enzyme inhibition in passage',
      'What effect did temperature change have?',
      'Explain the causal chain in the experimental results'
    ],
    commonMistakes: [
      'Reversing cause and effect',
      'Missing intermediate steps',
      'Confusing correlation with causation'
    ],
    tags: ['reading-comprehension', 'logical-reasoning', 'causation']
  },
  {
    id: 'compare-contrast',
    name: 'Compare ↔ Contrast',
    category: 'reading-comprehension',
    description: 'Identifying similarities and differences in comparative passages',
    rules: [
      {
        key: 'Signal words for comparison',
        description: 'similarly, likewise, both, also, in the same way',
        example: 'Both enzymes showed similar kinetic properties'
      },
      {
        key: 'Signal words for contrast',
        description: 'however, whereas, but, on the other hand, unlike, in contrast',
        example: 'However, enzyme A was more stable than enzyme B'
      },
      {
        key: 'Preserve comparison structure',
        description: 'Answer must maintain the comparative relationship',
        example: 'If passage compares A to B, answer should reflect this'
      },
      {
        key: 'Avoid distortion',
        description: 'Don\'t exaggerate similarities or differences',
        example: 'Keep comparisons proportional to passage emphasis'
      }
    ],
    examples: [
      'Compare effectiveness of two treatments',
      'What distinguishes method A from method B?',
      'Identify similarities between the two studies'
    ],
    commonMistakes: [
      'Overstating differences',
      'Missing subtle comparisons',
      'Confusing compared elements'
    ],
    tags: ['reading-comprehension', 'comparative-analysis', 'contrast']
  }
];

// Pattern categories for organization
export const PATTERN_CATEGORIES = {
  'organic-chemistry': 'Organic Chemistry',
  'general-chemistry': 'General Chemistry', 
  'biology': 'Biology',
  'dentistry': 'Dentistry',
  'reading-comprehension': 'Reading Comprehension'
} as const;

// Helper functions for pattern management
export function getPatternsByCategory(category: keyof typeof PATTERN_CATEGORIES): Pattern[] {
  return DAT_PATTERNS.filter(pattern => pattern.category === category);
}

export function getPatternById(id: string): Pattern | undefined {
  return DAT_PATTERNS.find(pattern => pattern.id === id);
}

export function searchPatterns(query: string): Pattern[] {
  const lowerQuery = query.toLowerCase();
  return DAT_PATTERNS.filter(pattern => 
    pattern.name.toLowerCase().includes(lowerQuery) ||
    pattern.description.toLowerCase().includes(lowerQuery) ||
    pattern.tags.some(tag => tag.includes(lowerQuery))
  );
}

// Pattern mastery tracking
export interface PatternMastery {
  patternId: string;
  userId: string;
  attempts: number;
  correct: number;
  lastAttempt: string;
  masteryLevel: 'learning' | 'practicing' | 'mastered';
  averageTime: number; // seconds
  commonErrors: string[];
}

export interface PatternAttempt {
  id: string;
  userId: string;
  patternId: string;
  thoughtUnitId: string;
  bookId: string;
  timestamp: string;
  selectedPattern: string | null;
  correct: boolean;
  timeSpent: number; // seconds
  skipped: boolean;
  notes?: string;
}
