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
  category: 'organic-chemistry' | 'general-chemistry' | 'biology' | 'pat' | 'reading-comprehension';
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

  // PAT (PERCEPTUAL ABILITY TEST) PATTERNS
  {
    id: 'apertures-keyholes',
    name: 'Apertures (Keyholes)',
    category: 'pat',
    description: 'Systematic approach to hole punching and aperture problems',
    rules: [
      {
        key: 'Visualize the fold',
        description: 'Imagine how the paper folds along the indicated lines',
        example: 'Paper folded in half creates symmetrical holes when punched'
      },
      {
        key: 'Count fold layers',
        description: 'Determine how many layers of paper the hole goes through',
        example: '1 fold = 2 layers, 2 folds = 4 layers, etc.'
      },
      {
        key: 'Apply symmetry rules',
        description: 'Holes appear symmetrically across fold lines when unfolded',
        example: 'Hole near fold line creates mirror image on opposite side'
      },
      {
        key: 'Check all positions',
        description: 'Systematically verify each hole position in the unfolded pattern',
        example: 'Work through each punch mark methodically'
      }
    ],
    examples: [
      'Paper folded once vertically, single hole punched',
      'Paper folded twice, multiple holes punched',
      'Complex folding pattern with edge holes'
    ],
    commonMistakes: [
      'Forgetting symmetry across fold lines',
      'Miscounting paper layers',
      'Not tracking fold sequence properly'
    ],
    tags: ['apertures', 'keyholes', 'symmetry', 'spatial-visualization']
  },
  {
    id: 'orthographic-projections',
    name: 'View Recognition (Orthographic)',
    category: 'pat',
    description: 'Master systematic approach to top, front, and side view identification',
    rules: [
      {
        key: 'Establish orientation',
        description: 'Identify top, front, and right side views clearly',
        example: 'Top view shows object looking down from above'
      },
      {
        key: 'Project edges systematically',
        description: 'Trace how 3D edges appear in each 2D projection',
        example: 'Vertical edge appears as line in front/side, point in top'
      },
      {
        key: 'Hidden lines = dashed',
        description: 'Features blocked from view shown as dashed lines',
        example: 'Hole on back surface shows dashed circle in front view'
      },
      {
        key: 'Check all features',
        description: 'Verify every hole, edge, and surface appears correctly',
        example: 'Count holes, measure proportions, verify alignments'
      }
    ],
    examples: [
      'Rectangular block with cylindrical hole through center',
      'L-shaped object with multiple holes',
      'Complex object with angled surfaces'
    ],
    commonMistakes: [
      'Confusing solid vs dashed lines',
      'Wrong view orientation',
      'Missing hidden features'
    ],
    tags: ['orthographic', 'projections', 'technical-drawing', '3d-visualization']
  },
  {
    id: 'angle-discrimination',
    name: 'Angle Discrimination',
    category: 'pat',
    description: 'Precise angle measurement and comparison strategies',
    rules: [
      {
        key: 'Use reference angles',
        description: 'Compare to known angles: 90°, 45°, 30°, 60°',
        example: 'Is angle greater than, less than, or equal to 90°?'
      },
      {
        key: 'Bisection technique',
        description: 'Mentally bisect angles to estimate smaller increments',
        example: '45° bisected gives 22.5°, useful for fine discrimination'
      },
      {
        key: 'Overlay comparison',
        description: 'Mentally overlay one angle on another to compare',
        example: 'Which angle would fit inside the other?'
      },
      {
        key: 'Systematic elimination',
        description: 'Rule out obviously incorrect angles first',
        example: 'If target is acute, eliminate all obtuse options'
      }
    ],
    examples: [
      'Identify angle closest to 37°',
      'Which of four angles is exactly 83°?',
      'Rank angles from smallest to largest'
    ],
    commonMistakes: [
      'Rushing visual estimation',
      'Not using reference angles',
      'Misreading angle orientation'
    ],
    tags: ['angles', 'measurement', 'discrimination', 'precision']
  },
  {
    id: 'paper-folding',
    name: 'Paper Folding',
    category: 'pat',
    description: 'Master complex folding sequences and hole prediction',
    rules: [
      {
        key: 'Track fold sequence',
        description: 'Follow each fold step-by-step in the correct order',
        example: 'Fold 1: vertical, Fold 2: horizontal, then punch'
      },
      {
        key: 'Maintain orientation',
        description: 'Keep track of paper orientation after each fold',
        example: 'After vertical fold, left edge becomes center crease'
      },
      {
        key: 'Layer counting',
        description: 'Determine how many paper layers hole penetrates',
        example: '3 folds = 8 layers, so 1 punch = 8 holes when unfolded'
      },
      {
        key: 'Unfold in reverse',
        description: 'Mentally reverse the folding sequence to reveal pattern',
        example: 'Last fold opens first, creating initial hole positions'
      }
    ],
    examples: [
      'Two perpendicular folds with center punch',
      'Diagonal fold followed by edge fold',
      'Multiple holes punched in complex fold pattern'
    ],
    commonMistakes: [
      'Losing track of fold sequence',
      'Incorrect layer counting',
      'Wrong unfolding order'
    ],
    tags: ['paper-folding', 'sequences', 'layering', 'reverse-engineering']
  },
  {
    id: 'cube-counting',
    name: 'Cube Counting',
    category: 'pat',
    description: 'Systematic counting of hidden and visible cubes in 3D arrangements',
    rules: [
      {
        key: 'Layer-by-layer analysis',
        description: 'Count cubes systematically by layer (front to back, bottom to top)',
        example: 'Front layer: 6 cubes, middle layer: 4 cubes, back layer: 2 cubes'
      },
      {
        key: 'Use visible constraints',
        description: 'Hidden cubes must exist to support visible ones above/in front',
        example: 'Floating cube impossible - must have support underneath'
      },
      {
        key: 'Shadow analysis',
        description: 'Use shading patterns to infer depth and hidden cubes',
        example: 'Darker faces suggest cubes extending into the structure'
      },
      {
        key: 'Grid projection',
        description: 'Mentally project grid lines to count systematically',
        example: 'Divide structure into XYZ coordinates for accuracy'
      }
    ],
    examples: [
      'L-shaped arrangement with partial occlusion',
      'Pyramid-like structure with varying heights',
      'Complex interlocking cube arrangement'
    ],
    commonMistakes: [
      'Double-counting visible cubes',
      'Missing structural support requirements',
      'Incorrect depth perception'
    ],
    tags: ['cube-counting', '3d-structures', 'spatial-reasoning', 'hidden-objects']
  },
  {
    id: 'form-development',
    name: '3D Form Development',
    category: 'pat',
    description: 'Master unfolding 3D objects into 2D net patterns',
    rules: [
      {
        key: 'Identify base shape',
        description: 'Recognize the fundamental 3D shape (cube, pyramid, cylinder, etc.)',
        example: 'Cube has 6 faces, pyramid has triangular faces + base'
      },
      {
        key: 'Trace fold lines',
        description: 'Identify where faces connect and how they fold',
        example: 'Adjacent faces in 3D become connected faces in net'
      },
      {
        key: 'Check face relationships',
        description: 'Verify which faces are adjacent vs opposite in 3D',
        example: 'Opposite faces of cube never touch in correct net'
      },
      {
        key: 'Validate fold patterns',
        description: 'Ensure net can actually fold into the target shape',
        example: 'No overlapping faces, all connections physically possible'
      }
    ],
    examples: [
      'Cube with specific face markings',
      'Triangular prism with different face patterns',
      'Irregular polyhedron with unique features'
    ],
    commonMistakes: [
      'Confusing adjacent vs opposite faces',
      'Creating invalid fold patterns',
      'Misreading 3D orientation'
    ],
    tags: ['form-development', 'nets', '3d-unfolding', 'geometric-analysis']
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
  'pat': 'PAT (Perceptual Ability)',
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
