// lib/datApex/blueprintTopology.ts
// Full topic/subtopic hierarchy for all DAT sections.
//
// Each TopicNode represents one entry in the blueprint's topicWeights.
// The subtopics are the "Canonical Units" a student must master within that topic —
// the DAT-level granularity map that drives Chief Resident Teaching and adaptive practice.

import type { DatSectionId } from "@/lib/datApex/blueprint";
import { ACTIVE_DAT_BLUEPRINT } from "@/lib/datApex/activeBlueprint";

export interface SubtopicNode {
  /** Matches a canonical datSubtopic string in IDB. */
  id: string;
  label: string;
}

export interface TopicNode {
  /** Matches topicId in blueprint topicWeights (e.g. "cell-biology"). */
  topicId: string;
  label: string;
  /** DAT item weight (0–100) from the blueprint. */
  targetPct: number;
  /** Canonical subtopics — the Thought Unit clusters a student must own. */
  subtopics: SubtopicNode[];
  /** High-yield traps tested on the DAT for this topic. */
  datTraps: string[];
  /** Memory anchors — rapid recall pegs. */
  memoryAnchors: string[];
}

export interface SectionTopology {
  sectionId: DatSectionId;
  label: string;
  topics: TopicNode[];
}

/* ─── Static topology ────────────────────────────────────────────────────────── */

const BIOLOGY_TOPICS: TopicNode[] = [
  {
    topicId: "cell-biology",
    label: "Cell Biology",
    targetPct: 17,
    subtopics: [
      { id: "cell-membrane",          label: "Cell Membrane & Transport" },
      { id: "organelles",             label: "Organelles & Functions" },
      { id: "cell-cycle",             label: "Cell Cycle & Checkpoints" },
      { id: "mitosis",                label: "Mitosis" },
      { id: "meiosis",                label: "Meiosis" },
      { id: "apoptosis",              label: "Apoptosis" },
      { id: "cell-signaling",         label: "Cell Signaling Pathways" },
      { id: "endocytosis-exocytosis", label: "Endocytosis & Exocytosis" },
    ],
    datTraps: [
      "Meiosis II vs mitosis — chromosome number identical; ploidy differs",
      "Osmosis direction: water moves toward higher solute, not lower",
      "G1 checkpoint controls entry into S phase, not M phase",
      "Facilitated diffusion is passive — no ATP; don't confuse with active transport",
    ],
    memoryAnchors: [
      "PMAT (Prophase → Metaphase → Anaphase → Telophase)",
      "Fluid mosaic model: phospholipids + proteins floating laterally",
      "G1→S→G2→M: 'Go Spend Good Money'",
    ],
  },
  {
    topicId: "genetics",
    label: "Genetics",
    targetPct: 15,
    subtopics: [
      { id: "mendelian-genetics",      label: "Mendelian Inheritance & Ratios" },
      { id: "dna-replication",         label: "DNA Replication" },
      { id: "transcription",           label: "Transcription & RNA Processing" },
      { id: "translation",             label: "Translation & Genetic Code" },
      { id: "mutations",               label: "Mutations & Repair" },
      { id: "gene-regulation",         label: "Gene Regulation (Operons)" },
      { id: "linkage-mapping",         label: "Linkage & Genetic Mapping" },
      { id: "sex-linked-traits",       label: "Sex-Linked Inheritance" },
    ],
    datTraps: [
      "Semiconservative replication: each daughter DNA has one original + one new strand",
      "Polymerase III adds nucleotides 5'→3'; reads template 3'→5'",
      "mRNA codon AUG starts translation (Met); UAA/UAG/UGA are STOP — no tRNA",
      "Test cross: cross unknown × homozygous recessive (aa), not another unknown",
      "X-linked recessive: affected sons always from carrier mothers",
    ],
    memoryAnchors: [
      "Helicase Unwinds, SSB Stabilizes, Primase Primes, Pol III Polymerizes, Ligase Links",
      "9:3:3:1 dihybrid ratio: nine dominant-dominant, three each single dominant, one recessive-recessive",
      "Lac operon: glucose low + lactose present → transcription ON",
    ],
  },
  {
    topicId: "animal-systems",
    label: "Animal Systems & Physiology",
    targetPct: 20,
    subtopics: [
      { id: "nervous-system",          label: "Nervous System (Action Potential, Synapse)" },
      { id: "endocrine-system",        label: "Endocrine System & Hormones" },
      { id: "cardiovascular",          label: "Cardiovascular System" },
      { id: "respiratory",             label: "Respiratory System & Gas Exchange" },
      { id: "digestive",               label: "Digestive System & Enzymes" },
      { id: "renal",                   label: "Renal System & Nephron" },
      { id: "immune-system",           label: "Immune System (Innate & Adaptive)" },
      { id: "musculoskeletal",         label: "Musculoskeletal System" },
      { id: "reproductive",            label: "Reproductive System" },
    ],
    datTraps: [
      "Depolarization: Na⁺ rushes IN; repolarization: K⁺ flows OUT",
      "Negative feedback is the default; positive feedback examples: childbirth (oxytocin), blood clotting",
      "Pulmonary circulation is low-pressure; systemic is high-pressure",
      "Loop of Henle: descending = water permeable; ascending = ion pumps",
      "B cells → antibodies; T cells → cell-mediated; plasma cells secrete Ig",
    ],
    memoryAnchors: [
      "All-or-nothing law for action potentials",
      "Arteries Away, Veins return (relative to heart)",
      "PCT reabsorbs most; loop concentrates; DCT fine-tunes with aldosterone",
    ],
  },
  {
    topicId: "molecular-biology",
    label: "Molecular Biology & Biochemistry",
    targetPct: 13,
    subtopics: [
      { id: "protein-structure",       label: "Protein Structure (1°–4°)" },
      { id: "enzyme-kinetics",         label: "Enzyme Kinetics & Inhibition" },
      { id: "glycolysis",              label: "Glycolysis" },
      { id: "krebs-cycle",             label: "Krebs Cycle" },
      { id: "oxidative-phosphorylation",label: "Electron Transport & ATP Synthesis" },
      { id: "fatty-acid-metabolism",   label: "Fatty Acid & Amino Acid Metabolism" },
      { id: "dna-repair",              label: "DNA Repair Mechanisms" },
    ],
    datTraps: [
      "Glycolysis is in cytoplasm; Krebs and ETC are in mitochondria",
      "Net ATP from glycolysis: 2 ATP (not 4 — subtract 2 invested)",
      "Competitive inhibitor raises Km; noncompetitive raises Km and lowers Vmax",
      "Km = substrate concentration at half Vmax (NOT a rate)",
    ],
    memoryAnchors: [
      "2 ATP in, 4 out = net 2 ATP per glucose in glycolysis",
      "Krebs: Citrate Is Kept Safely For Oxidative Success (steps mnemonic)",
      "ETC: NADH → Complex I → Q → Complex III → Cyt c → Complex IV → O₂",
    ],
  },
  {
    topicId: "microbiology",
    label: "Microbiology",
    targetPct: 8,
    subtopics: [
      { id: "bacteria-structure",      label: "Bacterial Cell Structure" },
      { id: "viral-replication",       label: "Viral Replication Cycles" },
      { id: "bacteria-genetics",       label: "Bacterial Genetics (Transformation, Conjugation, Transduction)" },
      { id: "immune-evasion",          label: "Pathogen Immune Evasion" },
      { id: "antibiotic-mechanisms",   label: "Antibiotic Mechanisms & Resistance" },
    ],
    datTraps: [
      "Lysogenic cycle: phage integrates as prophage — cell lives; lytic cycle: cell lyses",
      "Gram-positive = thick peptidoglycan, purple stain; Gram-negative = thin + outer membrane, pink",
      "Conjugation requires direct cell contact (pilus); transformation is DNA uptake from environment",
    ],
    memoryAnchors: [
      "Purple Positive (Gram+ stains purple)",
      "Lytic = Lysis, Lysogenic = Latent",
    ],
  },
  {
    topicId: "vertebrate-anatomy",
    label: "Vertebrate Anatomy",
    targetPct: 10,
    subtopics: [
      { id: "skeletal-system",         label: "Skeletal System & Bone Types" },
      { id: "muscle-types",            label: "Muscle Types & Contraction" },
      { id: "cranial-anatomy",         label: "Cranial & Dental Anatomy" },
      { id: "sensory-organs",          label: "Sensory Organs" },
    ],
    datTraps: [
      "Cardiac muscle: striated AND involuntary (unique — smooth is unstriated & involuntary)",
      "Sliding filament: myosin (thick) walks along actin (thin); H zone shortens, I band shortens, A band constant",
      "Compact bone: osteons/Haversian canals; spongy bone: trabeculae",
    ],
    memoryAnchors: [
      "ACTin = thin, myosin is thick (M is thick in alphabet sense — bigger letter = thicker)",
      "H zone shortens, I band shortens, A band stays (A = Always the same)",
    ],
  },
  {
    topicId: "evolution-ecology",
    label: "Evolution & Ecology",
    targetPct: 8,
    subtopics: [
      { id: "natural-selection",       label: "Natural Selection & Fitness" },
      { id: "hardy-weinberg",          label: "Hardy-Weinberg Equilibrium" },
      { id: "speciation",              label: "Speciation & Reproductive Isolation" },
      { id: "population-ecology",      label: "Population Ecology (r vs K selection)" },
      { id: "community-ecology",       label: "Community Interactions (predation, competition)" },
      { id: "biomes",                  label: "Biomes & Ecosystems" },
    ],
    datTraps: [
      "Hardy-Weinberg requires: no mutation, random mating, no selection, no drift, no migration",
      "p + q = 1; p² + 2pq + q² = 1 (p = dominant allele frequency)",
      "Allopatric speciation: geographic barrier; sympatric: same location (polyploidy, niche divergence)",
    ],
    memoryAnchors: [
      "p² = homozygous dominant, 2pq = heterozygous carriers, q² = homozygous recessive (the one you can measure from phenotype)",
      "r-selected: many offspring, low parental care; K-selected: few offspring, high care",
    ],
  },
  {
    topicId: "developmental-biology",
    label: "Developmental Biology",
    targetPct: 5,
    subtopics: [
      { id: "fertilization",           label: "Fertilization & Cleavage" },
      { id: "gastrulation",            label: "Gastrulation & Germ Layers" },
      { id: "organogenesis",           label: "Organogenesis & Induction" },
      { id: "stem-cells",              label: "Stem Cells & Differentiation" },
    ],
    datTraps: [
      "Ectoderm → skin, nervous system; Mesoderm → muscle, bone, cardiovascular; Endoderm → gut, lungs",
      "Blastula → Gastrula: invagination creates the archenteron (primitive gut)",
    ],
    memoryAnchors: [
      "Ecto = outer (skin/nerves), Endo = inner (gut/lungs), Meso = middle (muscle/bone)",
    ],
  },
  {
    topicId: "plant-biology",
    label: "Plant Biology",
    targetPct: 5,
    subtopics: [
      { id: "photosynthesis",          label: "Photosynthesis (Light & Calvin Cycle)" },
      { id: "plant-transport",         label: "Water & Nutrient Transport (Xylem/Phloem)" },
      { id: "plant-reproduction",      label: "Plant Reproduction & Alternation of Generations" },
      { id: "plant-hormones",          label: "Plant Hormones (Auxin, Gibberellin)" },
    ],
    datTraps: [
      "Light reactions: in thylakoid membrane; Calvin cycle: in stroma",
      "Xylem: water + minerals UP (passive, cohesion-tension); Phloem: sugar DOWN (pressure flow, active loading)",
      "C4 plants fix CO₂ first as malate to avoid photorespiration — NOT a different Calvin cycle",
    ],
    memoryAnchors: [
      "Xylem = Xylophone goes Up, Phloem = phone goes Down",
      "Light reactions produce ATP + NADPH; Calvin uses them to fix CO₂ into G3P",
    ],
  },
  {
    topicId: "diversity-of-life",
    label: "Diversity of Life",
    targetPct: 5,
    subtopics: [
      { id: "classification",          label: "Classification & Taxonomy" },
      { id: "kingdom-features",        label: "Kingdom-Level Features" },
      { id: "invertebrates",           label: "Invertebrate Phyla" },
    ],
    datTraps: [
      "Domain Bacteria vs Archaea: both prokaryotic, but Archaea have ether-linked lipids, no peptidoglycan",
      "Fungi: heterotrophic by absorption (not ingestion); cell walls of chitin, not cellulose",
    ],
    memoryAnchors: [
      "Domain → Kingdom → Phylum → Class → Order → Family → Genus → Species (Dear King Philip Came Over From Germany, Spain)",
    ],
  },
  {
    topicId: "biochemistry",
    label: "Biochemistry",
    targetPct: 7,
    subtopics: [
      { id: "amino-acids",             label: "Amino Acid Properties & Structures" },
      { id: "lipid-structure",         label: "Lipid Structures & Membranes" },
      { id: "carbohydrate-chemistry",  label: "Carbohydrate Structure & Glycolysis Link" },
      { id: "nucleic-acid-structure",  label: "Nucleic Acid Structure" },
    ],
    datTraps: [
      "Isoelectric point (pI): net charge = 0; at pH < pI protein is positively charged",
      "Phospholipids: glycerol backbone, NOT sphingosine (that's sphingolipids)",
    ],
    memoryAnchors: [
      "GAVLIS (Gly, Ala, Val, Leu, Ile, Ser) — remember nonpolar vs polar side chains",
    ],
  },
];

const GEN_CHEM_TOPICS: TopicNode[] = [
  {
    topicId: "acids-and-bases",
    label: "Acids & Bases",
    targetPct: 15,
    subtopics: [
      { id: "brønsted-lowry",          label: "Brønsted-Lowry & Lewis Definitions" },
      { id: "ph-calculations",         label: "pH, pOH, pKa Calculations" },
      { id: "buffer-systems",          label: "Buffer Systems & Henderson-Hasselbalch" },
      { id: "titration-curves",        label: "Titration Curves & Equivalence Points" },
      { id: "salt-hydrolysis",         label: "Salt Hydrolysis & Acid-Base Nature" },
    ],
    datTraps: [
      "Strong acids fully dissociate: pH = −log[HA]₀; weak acids need ICE table",
      "At the equivalence point of a weak acid titration, pH > 7 (the conjugate base hydrolyzes)",
      "Henderson-Hasselbalch: pH = pKa + log([A⁻]/[HA]) — ratio, not concentrations individually",
      "Ka × Kb = Kw (conjugate pair product always = 1×10⁻¹⁴)",
    ],
    memoryAnchors: [
      "HH equation: pH = pKa when [A⁻] = [HA] (halfway point on titration curve)",
      "Buffers resist pH change best when pH ≈ pKa ± 1",
    ],
  },
  {
    topicId: "equilibria",
    label: "Chemical Equilibrium",
    targetPct: 10,
    subtopics: [
      { id: "equilibrium-constants",   label: "Keq, Kc, Kp Expressions" },
      { id: "le-chatelier",            label: "Le Chatelier's Principle" },
      { id: "solubility-product",      label: "Solubility Product Ksp" },
      { id: "reaction-quotient",       label: "Reaction Quotient Q vs K" },
    ],
    datTraps: [
      "Q < K: reaction proceeds forward; Q > K: reaction goes reverse",
      "Adding catalyst: does NOT shift equilibrium, just reaches it faster",
      "Kp = Kc(RT)^Δn — only differs from Kc when Δn ≠ 0 (change in moles of gas)",
    ],
    memoryAnchors: [
      "Le Chatelier: stress → system shifts to relieve stress",
      "Ksp: solids and liquids NOT in expression; dissolved ions only",
    ],
  },
  {
    topicId: "electrochemistry",
    label: "Electrochemistry",
    targetPct: 10,
    subtopics: [
      { id: "oxidation-states",        label: "Oxidation States & Balancing Redox" },
      { id: "galvanic-cells",          label: "Galvanic Cells & Cell Notation" },
      { id: "cell-potential",          label: "Standard Cell Potential (E°cell)" },
      { id: "nernst-equation",         label: "Nernst Equation" },
      { id: "electrolytic-cells",      label: "Electrolytic Cells & Electrolysis" },
    ],
    datTraps: [
      "Galvanic cell: anode = oxidation (negative electrode); cathode = reduction (positive electrode)",
      "Electrolytic cell: anode = oxidation BUT is POSITIVE (connected to + terminal of battery)",
      "E°cell = E°cathode − E°anode (reduction potentials; never reverse the sign of Eanode in the table)",
      "ΔG° = −nFE°cell: positive E°cell → negative ΔG° → spontaneous",
    ],
    memoryAnchors: [
      "AN OX RED CAT: ANode OXidation, REDuction CAThode",
      "Galvanic = GAlvanic = Gets energy (spontaneous); Electrolytic = Electrolysis = Electricity in",
    ],
  },
  {
    topicId: "thermodynamics",
    label: "Thermodynamics",
    targetPct: 10,
    subtopics: [
      { id: "enthalpy",                label: "Enthalpy & Hess's Law" },
      { id: "entropy",                 label: "Entropy & Spontaneity" },
      { id: "gibbs-free-energy",       label: "Gibbs Free Energy (ΔG = ΔH − TΔS)" },
      { id: "calorimetry",             label: "Calorimetry & Heat Capacity" },
      { id: "first-second-law",        label: "First & Second Laws" },
    ],
    datTraps: [
      "ΔG < 0: spontaneous; ΔH < 0 + ΔS > 0 → always spontaneous regardless of T",
      "Hess's Law: if you reverse a reaction, flip sign of ΔH; if you multiply, scale ΔH",
      "Bond breaking = endothermic (absorbs energy); bond forming = exothermic",
    ],
    memoryAnchors: [
      "ΔG = ΔH − TΔS: 'Gibbs Helps Thermodynamics Succeed'",
      "Four ΔG cases: −/+, +/−, −/−, +/+ (temperature-dependent)",
    ],
  },
  {
    topicId: "kinetics",
    label: "Kinetics",
    targetPct: 10,
    subtopics: [
      { id: "rate-laws",               label: "Rate Laws & Rate Constants" },
      { id: "reaction-order",          label: "Reaction Order & Half-Life" },
      { id: "activation-energy",       label: "Activation Energy & Arrhenius" },
      { id: "catalysis",               label: "Catalysis & Reaction Profiles" },
    ],
    datTraps: [
      "Rate law order determined ONLY from experimental data — not from balanced equation (unless elementary step)",
      "First-order: t½ = 0.693/k (constant); second-order: t½ = 1/(k[A]₀) (depends on concentration)",
      "Catalyst lowers Ea for both forward AND reverse reactions; doesn't change ΔH or K",
    ],
    memoryAnchors: [
      "Rate = k[A]^m[B]^n — exponents from experiment, not stoichiometry",
      "Arrhenius: k = Ae^(−Ea/RT) — higher T → larger k → faster reaction",
    ],
  },
  {
    topicId: "stoichiometry",
    label: "Stoichiometry",
    targetPct: 10,
    subtopics: [
      { id: "mole-calculations",       label: "Mole & Mass Calculations" },
      { id: "limiting-reagent",        label: "Limiting Reagent" },
      { id: "percent-yield",           label: "Percent Yield & Theoretical Yield" },
      { id: "empirical-molecular",     label: "Empirical & Molecular Formula" },
    ],
    datTraps: [
      "Limiting reagent: divide moles of each reactant by its stoichiometric coefficient; smallest ratio is limiting",
      "Empirical formula: divide by GCD; molecular formula: divide molar mass by empirical mass to get multiplier",
    ],
    memoryAnchors: [
      "Molar mass (g/mol) = bridge from grams to moles",
      "% yield = (actual/theoretical) × 100",
    ],
  },
  {
    topicId: "gases",
    label: "Gases",
    targetPct: 10,
    subtopics: [
      { id: "ideal-gas-law",           label: "Ideal Gas Law (PV = nRT)" },
      { id: "dalton-law",              label: "Dalton's Law of Partial Pressures" },
      { id: "kinetic-molecular-theory",label: "Kinetic Molecular Theory" },
      { id: "graham-effusion",         label: "Graham's Law of Effusion" },
      { id: "real-gases",              label: "Real Gases & van der Waals" },
    ],
    datTraps: [
      "PV = nRT: T must be in Kelvin always; R = 0.0821 L·atm/mol·K",
      "At STP (0°C, 1 atm): 1 mol ideal gas = 22.4 L",
      "Heavier gases effuse slower: rate ∝ 1/√M",
    ],
    memoryAnchors: [
      "PV = nRT — 'Pretty Vast needs R and T'",
      "Graham: rate ∝ √(1/M) — lighter = faster",
    ],
  },
  {
    topicId: "solutions",
    label: "Solutions",
    targetPct: 10,
    subtopics: [
      { id: "concentration-units",     label: "Molarity, Molality, Mole Fraction" },
      { id: "colligative-properties",  label: "Colligative Properties" },
      { id: "solubility-factors",      label: "Factors Affecting Solubility" },
    ],
    datTraps: [
      "Colligative properties depend on number of particles, not identity — ionic compounds split",
      "Boiling point elevation: ΔTb = iKbm; freezing point depression: ΔTf = iKfm (i = van't Hoff)",
      "Molality (mol/kg solvent) vs molarity (mol/L solution) — molality used in colligative property calculations",
    ],
    memoryAnchors: [
      "i = van't Hoff factor: NaCl → i=2, CaCl₂ → i=3, glucose → i=1",
      "Like dissolves like: polar in polar, nonpolar in nonpolar",
    ],
  },
  {
    topicId: "liquids-and-solids",
    label: "Liquids & Solids",
    targetPct: 10,
    subtopics: [
      { id: "intermolecular-forces",   label: "Intermolecular Forces" },
      { id: "phase-diagrams",          label: "Phase Diagrams & Phase Changes" },
      { id: "crystal-structures",      label: "Crystal Lattice Structures" },
    ],
    datTraps: [
      "IMF strength order: London dispersion < dipole-dipole < H-bond < ion-dipole < ionic bonds",
      "Triple point: all three phases in equilibrium; critical point: gas/liquid distinction disappears",
      "H-bond requires H bonded to N, O, or F — NOT just any H",
    ],
    memoryAnchors: [
      "H-bond = H on N, O, F (NOF = 'No Other Friend')",
      "Phase diagram: solid left, liquid middle, gas right; pressure up → melting/vaporization delayed",
    ],
  },
  {
    topicId: "atomic-structure",
    label: "Atomic Structure",
    targetPct: 5,
    subtopics: [
      { id: "quantum-numbers",         label: "Quantum Numbers & Electron Configuration" },
      { id: "periodic-trends",         label: "Periodic Trends" },
      { id: "electromagnetic-spectra", label: "Electromagnetic Spectra & Bohr Model" },
      { id: "nuclear-chemistry",       label: "Nuclear Chemistry & Radioactive Decay" },
    ],
    datTraps: [
      "Electronegativity increases up and to the right; atomic radius decreases same direction",
      "Hund's rule: fill each orbital singly before pairing",
      "Alpha decay: −4 mass, −2 atomic number; beta: −0 mass, +1 atomic number",
    ],
    memoryAnchors: [
      "Periodic trends: EN, IE, EA increase → up and right; radius increases ← down and left",
      "n, l, ml, ms — principal, angular momentum, magnetic, spin",
    ],
  },
];

const ORGO_TOPICS: TopicNode[] = [
  {
    topicId: "mechanisms",
    label: "Reaction Mechanisms",
    targetPct: 25,
    subtopics: [
      { id: "sn1",                     label: "SN1 Mechanism" },
      { id: "sn2",                     label: "SN2 Mechanism" },
      { id: "e1",                      label: "E1 Elimination" },
      { id: "e2",                      label: "E2 Elimination" },
      { id: "addition-reactions",      label: "Electrophilic Addition" },
      { id: "radical-reactions",       label: "Radical Chain Mechanism" },
      { id: "acyl-substitution",       label: "Nucleophilic Acyl Substitution" },
    ],
    datTraps: [
      "SN2: inversion of configuration (Walden inversion); SN1: racemization at chiral center",
      "SN2 favored: primary substrate, strong nucleophile, polar aprotic solvent",
      "SN1 favored: tertiary substrate, weak nucleophile, polar protic solvent (stabilizes carbocation)",
      "E2 requires anti-periplanar geometry (180° dihedral) between H and leaving group",
    ],
    memoryAnchors: [
      "SN2 = Back attack, inversion; SN1 = stepwise, racemic",
      "Zaitsev's rule: major elimination product = more substituted alkene (more stable)",
      "Markovnikov's rule: H goes to carbon with more H's (carbocation stability)",
    ],
  },
  {
    topicId: "functional-groups",
    label: "Functional Groups",
    targetPct: 20,
    subtopics: [
      { id: "alkanes-alkenes-alkynes",  label: "Alkanes, Alkenes, Alkynes" },
      { id: "alcohols-ethers",          label: "Alcohols & Ethers" },
      { id: "aldehydes-ketones",        label: "Aldehydes & Ketones" },
      { id: "carboxylic-acids",         label: "Carboxylic Acids & Derivatives" },
      { id: "amines",                   label: "Amines" },
      { id: "aromatic-compounds",       label: "Aromatic Compounds & EAS" },
    ],
    datTraps: [
      "Aldehydes are more reactive than ketones (less steric, less electron-donating R groups)",
      "Carboxylic acid derivatives reactivity order: acyl halide > anhydride > ester > amide",
      "EAS: activating groups direct ortho/para; deactivating groups (halogens except) direct meta; halogens are ortho/para directors but deactivating",
    ],
    memoryAnchors: [
      "IUPAC suffix: -ane (alkane), -ene (alkene), -yne (alkyne), -ol (alcohol), -al (aldehyde), -one (ketone), -oic acid",
      "Ortho/para directors: activators + halides; meta directors: deactivators (EWG)",
    ],
  },
  {
    topicId: "stereochemistry",
    label: "Stereochemistry",
    targetPct: 15,
    subtopics: [
      { id: "chirality",               label: "Chirality & Stereocenters" },
      { id: "r-s-nomenclature",        label: "R/S Configuration (CIP Rules)" },
      { id: "enantiomers-diastereomers",label: "Enantiomers vs Diastereomers" },
      { id: "geometric-isomers",       label: "Geometric Isomers (cis/trans, E/Z)" },
      { id: "optical-activity",        label: "Optical Rotation & Racemic Mixtures" },
    ],
    datTraps: [
      "Enantiomers: opposite R/S at all stereocenters; diastereomers: opposite at some, same at others",
      "Meso compound: has stereocenters but internal mirror plane → achiral, optically inactive",
      "E/Z: higher priority groups same side = Z (German: zusammen = together); opposite = E",
    ],
    memoryAnchors: [
      "CIP priority: higher atomic number = higher priority",
      "R (clockwise) if viewing from opposite of lowest priority; S (counterclockwise)",
    ],
  },
  {
    topicId: "reactions",
    label: "Named Reactions & Synthesis",
    targetPct: 20,
    subtopics: [
      { id: "oxidation-reduction",      label: "Oxidation & Reduction Reactions" },
      { id: "aldol-reaction",           label: "Aldol Condensation" },
      { id: "diels-alder",              label: "Diels-Alder Reaction" },
      { id: "grignard",                 label: "Grignard Reactions" },
      { id: "reduction-reagents",       label: "LiAlH4 vs NaBH4 Selectivity" },
    ],
    datTraps: [
      "LiAlH4 reduces: all carbonyls including acids/esters; NaBH4 only reduces aldehydes & ketones",
      "Grignard is a very strong base — destroyed by water/acidic protons; use anhydrous conditions",
      "Diels-Alder: diene must be in s-cis conformation; electron-withdrawing group on dienophile increases rate",
    ],
    memoryAnchors: [
      "Grignard: RMgBr + carbonyl → alcohol (adds carbon nucleophile)",
      "Aldol: base deprotonates α-carbon → enolate attacks another carbonyl → β-hydroxy carbonyl",
    ],
  },
  {
    topicId: "spectroscopy",
    label: "Spectroscopy",
    targetPct: 10,
    subtopics: [
      { id: "ir-spectroscopy",          label: "Infrared Spectroscopy" },
      { id: "nmr-spectroscopy",         label: "NMR Spectroscopy (¹H)" },
      { id: "mass-spectrometry",        label: "Mass Spectrometry" },
      { id: "uv-vis",                   label: "UV-Vis Spectroscopy" },
    ],
    datTraps: [
      "IR: broad 3200–3550 cm⁻¹ = O-H stretch (alcohol); sharp ~3300 = N-H; ~1700 = C=O (carbonyl)",
      "NMR: downfield (high ppm) = deshielded; TMS reference = 0 ppm",
      "Mass spec base peak = most abundant fragment (NOT molecular ion M⁺ unless very stable)",
    ],
    memoryAnchors: [
      "IR carbonyl fingerprint: ~1700 cm⁻¹ for ketone/aldehyde, ~1735 for ester, ~1650 for amide",
      "NMR splitting: n+1 rule (n adjacent H's → n+1 peaks)",
    ],
  },
  {
    topicId: "lab-techniques",
    label: "Lab Techniques",
    targetPct: 10,
    subtopics: [
      { id: "extraction",              label: "Extraction & Separation" },
      { id: "chromatography",          label: "Chromatography (TLC, column, GC)" },
      { id: "distillation",            label: "Distillation" },
      { id: "recrystallization",       label: "Recrystallization" },
    ],
    datTraps: [
      "TLC: higher Rf = more nonpolar compound (travels further with nonpolar mobile phase)",
      "Column chromatography: nonpolar compounds elute first with nonpolar solvent (normal phase)",
      "Simple distillation: boiling point separation; fractional distillation: close boiling points",
    ],
    memoryAnchors: [
      "Rf = distance spot traveled / distance solvent front traveled (always 0–1)",
    ],
  },
];

const PAT_TOPICS: TopicNode[] = [
  {
    topicId: "keyholes",
    label: "Keyhole Apertures",
    targetPct: 17,
    subtopics: [
      { id: "keyhole-strategy",        label: "Entry Aperture Strategy" },
      { id: "perspective-projection",  label: "3D to 2D Projection" },
    ],
    datTraps: [
      "The aperture must allow the object to PASS THROUGH — not just silhouette match",
      "Curved surfaces projected edge-on can look like straight lines — rotate mentally first",
    ],
    memoryAnchors: [
      "Check all three axes: front, side, top entry",
      "The outline at entry = the exact 2D cross-section at that view plane",
    ],
  },
  {
    topicId: "top-front-end",
    label: "Top/Front/End Views",
    targetPct: 17,
    subtopics: [
      { id: "orthographic-views",      label: "Orthographic Projection Rules" },
      { id: "hidden-lines",            label: "Hidden Lines vs Visible Lines" },
      { id: "tfe-synthesis",           label: "Synthesizing 3D from 3 Views" },
    ],
    datTraps: [
      "Top view = looking straight down; Front = looking straight at face; End = looking from right side",
      "A feature visible in two of three views narrows the location to one possibility",
      "Dashed lines = hidden edges; solid lines = visible edges",
    ],
    memoryAnchors: [
      "T-F-E are like a standard engineering drawing — top = plan, front = elevation, end = section",
    ],
  },
  {
    topicId: "angle-ranking",
    label: "Angle Ranking",
    targetPct: 16,
    subtopics: [
      { id: "angle-estimation",        label: "Acute vs Obtuse Classification" },
      { id: "line-length-independence", label: "Ignoring Arm Length" },
    ],
    datTraps: [
      "Angle size is independent of arm length — longer arms do NOT make the angle bigger",
      "Compare angles to known references: 45°, 90°, 135° as anchors",
    ],
    memoryAnchors: [
      "Cover the arm lengths and compare only the opening of the angle",
    ],
  },
  {
    topicId: "hole-punching",
    label: "Hole Punching",
    targetPct: 17,
    subtopics: [
      { id: "fold-tracking",           label: "Tracking Fold Lines" },
      { id: "symmetry-unfolding",      label: "Unfolding Symmetry" },
    ],
    datTraps: [
      "Each fold doubles the number of holes (for single punches): 1 fold → 2 holes, 2 folds → 4 holes",
      "The hole unfolds symmetrically across each fold line",
    ],
    memoryAnchors: [
      "Unfold backwards: reverse each fold from last to first, reflect hole across each fold line",
    ],
  },
  {
    topicId: "cube-counting",
    label: "Cube Counting",
    targetPct: 16,
    subtopics: [
      { id: "exposed-faces",           label: "Counting Exposed Faces" },
      { id: "hidden-cubes",            label: "Identifying Hidden Cubes" },
    ],
    datTraps: [
      "Bottom faces touching the ground count as painted if specified",
      "Count each face independently — systematic layer-by-layer approach prevents errors",
    ],
    memoryAnchors: [
      "Work top-to-bottom, left-to-right, count visible + hidden cubes by layer",
    ],
  },
  {
    topicId: "pattern-folding",
    label: "Pattern Folding",
    targetPct: 17,
    subtopics: [
      { id: "net-recognition",         label: "Net Recognition & Cube Assembly" },
      { id: "face-orientation",        label: "Face Orientation When Folded" },
    ],
    datTraps: [
      "A cube net folded: opposite faces sum to 7 on a standard die — not always on DAT",
      "Track which edge folds onto which edge; adjacent faces share an edge",
    ],
    memoryAnchors: [
      "Physically fold the net mentally: pick a base face, fold walls up, then fold top",
    ],
  },
];

const RC_TOPICS: TopicNode[] = [
  {
    topicId: "main-idea",
    label: "Main Idea & Primary Purpose",
    targetPct: 20,
    subtopics: [
      { id: "thesis-identification",   label: "Identifying the Central Thesis" },
      { id: "purpose-vs-topic",        label: "Purpose vs Topic Distinction" },
    ],
    datTraps: [
      "Main idea ≠ topic; the main idea is what the author ARGUES about the topic",
      "Trap answers are too broad (whole discipline) or too narrow (single detail)",
    ],
    memoryAnchors: ["Main idea: the one sentence that would appear in an abstract of the passage"],
  },
  {
    topicId: "detail",
    label: "Supporting Details",
    targetPct: 30,
    subtopics: [
      { id: "fact-location",           label: "Locating Specific Facts" },
      { id: "paraphrase-accuracy",     label: "Paraphrase vs Distortion" },
    ],
    datTraps: [
      "Detail questions: the answer is in the passage — trust the text, not your external knowledge",
      "Attractive wrong answers often distort facts slightly or swap cause/effect",
    ],
    memoryAnchors: ["Line reference: go back to the passage before answering"],
  },
  {
    topicId: "inference",
    label: "Inference",
    targetPct: 20,
    subtopics: [
      { id: "implication",             label: "Implied Conclusions" },
      { id: "authorial-assumption",    label: "Authorial Assumptions" },
    ],
    datTraps: [
      "Inference ≠ speculation — the correct answer MUST be directly supported by the passage",
      "Extreme language (always, never, completely) often signals a wrong inference answer",
    ],
    memoryAnchors: ["Inference = stepping stone from stated facts — one logical step, no leaps"],
  },
  {
    topicId: "tone-and-purpose",
    label: "Tone, Attitude & Author Purpose",
    targetPct: 15,
    subtopics: [
      { id: "author-tone",             label: "Author Tone Identification" },
      { id: "rhetorical-function",     label: "Rhetorical Function of Paragraphs" },
    ],
    datTraps: [
      "Scientific passages are usually objective — 'enthusiastic' or 'alarmed' are rarely correct",
      "Look for hedge words (may, might, suggests) that signal cautious vs. assertive tone",
    ],
    memoryAnchors: ["Tone key words: neutral, objective, critical, cautious, advocatory"],
  },
  {
    topicId: "application",
    label: "Application & Extrapolation",
    targetPct: 15,
    subtopics: [
      { id: "principle-application",   label: "Applying a Principle to a New Case" },
      { id: "analogy-questions",       label: "Analogy-Based Questions" },
    ],
    datTraps: [
      "Application questions ask how the passage's principle applies elsewhere — stay in the passage's logic",
    ],
    memoryAnchors: ["Ask: which answer choice behaves exactly like the example in the passage?"],
  },
];

const QR_TOPICS: TopicNode[] = [
  {
    topicId: "algebra",
    label: "Algebra",
    targetPct: 30,
    subtopics: [
      { id: "linear-equations",        label: "Linear Equations & Systems" },
      { id: "quadratic-equations",     label: "Quadratic Equations & Factoring" },
      { id: "inequalities",            label: "Inequalities & Absolute Value" },
      { id: "word-problems",           label: "Word Problem Translation" },
      { id: "exponents-radicals",      label: "Exponents & Radicals" },
    ],
    datTraps: [
      "When multiplying/dividing an inequality by a negative number, FLIP the inequality sign",
      "Absolute value equations can have 2 solutions: |x| = 5 → x = 5 or x = −5",
    ],
    memoryAnchors: [
      "System of 2 equations: substitution or elimination",
      "Quadratic formula: x = (−b ± √(b²−4ac)) / 2a",
    ],
  },
  {
    topicId: "geometry",
    label: "Geometry",
    targetPct: 15,
    subtopics: [
      { id: "triangles",               label: "Triangle Properties & Theorems" },
      { id: "circles",                 label: "Circle Theorems & Equations" },
      { id: "polygons",                label: "Area & Perimeter of Polygons" },
      { id: "coordinate-geometry",     label: "Coordinate Geometry" },
      { id: "solid-geometry",          label: "3D Solids (Volume & Surface Area)" },
    ],
    datTraps: [
      "Pythagorean theorem only applies to RIGHT triangles",
      "Sum of interior angles: (n−2)×180 for an n-sided polygon",
    ],
    memoryAnchors: [
      "Special right triangles: 30-60-90 (1:√3:2), 45-45-90 (1:1:√2)",
      "Circle area = πr²; circumference = 2πr",
    ],
  },
  {
    topicId: "numerical-calculations",
    label: "Numerical Calculations",
    targetPct: 20,
    subtopics: [
      { id: "fractions-decimals",      label: "Fractions, Decimals, Percentages" },
      { id: "ratios-proportions",      label: "Ratios & Proportions" },
      { id: "scientific-notation",     label: "Scientific Notation" },
    ],
    datTraps: [
      "% change = (new−old)/old × 100; NOT (old−new)/new",
      "Cross-multiply only when you have a proportion (single fraction = single fraction)",
    ],
    memoryAnchors: ["Percent → decimal: move decimal 2 left (45% = 0.45)"],
  },
  {
    topicId: "trigonometry",
    label: "Trigonometry",
    targetPct: 10,
    subtopics: [
      { id: "trig-ratios",             label: "Sin, Cos, Tan (SOH-CAH-TOA)" },
      { id: "unit-circle",             label: "Unit Circle Values" },
      { id: "trig-identities",         label: "Key Trig Identities" },
    ],
    datTraps: [
      "sin²θ + cos²θ = 1 (Pythagorean identity — memorize this)",
      "Inverse trig (arcsin, arccos, arctan) gives angle, not ratio",
    ],
    memoryAnchors: [
      "SOH-CAH-TOA: Sin=Opp/Hyp, Cos=Adj/Hyp, Tan=Opp/Adj",
      "ASTC: All Sinners Take Calculus (which functions positive in each quadrant: I=all, II=sin, III=tan, IV=cos)",
    ],
  },
  {
    topicId: "applied-math",
    label: "Applied Math & Statistics",
    targetPct: 15,
    subtopics: [
      { id: "probability",             label: "Probability" },
      { id: "statistics",              label: "Mean, Median, Mode, Standard Deviation" },
      { id: "combinatorics",           label: "Combinations & Permutations" },
      { id: "data-interpretation",     label: "Data Interpretation (Tables & Graphs)" },
    ],
    datTraps: [
      "P(A and B) = P(A) × P(B) only if independent; P(A or B) = P(A) + P(B) − P(A∩B)",
      "Permutation = order matters (nPr); Combination = order doesn't matter (nCr)",
    ],
    memoryAnchors: [
      "nCr = n! / (r!(n−r)!); nPr = n! / (n−r)!",
      "P(at least 1) = 1 − P(none)",
    ],
  },
  {
    topicId: "conversions",
    label: "Conversions & Units",
    targetPct: 10,
    subtopics: [
      { id: "unit-conversions",        label: "Unit Conversions (metric/imperial)" },
      { id: "scientific-units",        label: "Scientific Unit Relationships" },
    ],
    datTraps: [
      "Set up dimensional analysis: cancel units by writing them as fractions",
    ],
    memoryAnchors: [
      "Metric prefixes: kilo(10³), centi(10⁻²), milli(10⁻³), micro(10⁻⁶), nano(10⁻⁹)",
    ],
  },
];

/* ─── Build the full topology from blueprint + static data ──────────────────── */

function buildTopology(): SectionTopology[] {
  return [
    { sectionId: "biology",               label: "Biology",               topics: BIOLOGY_TOPICS },
    { sectionId: "general-chemistry",     label: "General Chemistry",     topics: GEN_CHEM_TOPICS },
    { sectionId: "organic-chemistry",     label: "Organic Chemistry",     topics: ORGO_TOPICS },
    { sectionId: "perceptual-ability",    label: "Perceptual Ability",    topics: PAT_TOPICS },
    { sectionId: "reading-comprehension", label: "Reading Comprehension", topics: RC_TOPICS },
    { sectionId: "quantitative-reasoning",label: "Quantitative Reasoning",topics: QR_TOPICS },
  ];
}

let _cachedTopology: SectionTopology[] | null = null;

export function getDATTopology(): SectionTopology[] {
  if (!_cachedTopology) _cachedTopology = buildTopology();
  return _cachedTopology;
}

export function getSectionTopology(sectionId: DatSectionId): SectionTopology | null {
  return getDATTopology().find((s) => s.sectionId === sectionId) ?? null;
}

export function getTopicNode(sectionId: DatSectionId, topicId: string): TopicNode | null {
  return getSectionTopology(sectionId)?.topics.find((t) => t.topicId === topicId) ?? null;
}

/**
 * Lookup topicId from a datTopic string (may use spaces or underscores).
 * Returns the best-matching TopicNode from the topology.
 */
export function resolveTopicId(sectionId: DatSectionId, datTopic: string): string | null {
  const topo = getSectionTopology(sectionId);
  if (!topo) return null;

  const normalized = datTopic.toLowerCase().replace(/\s+/g, "-").replace(/_/g, "-");

  // Exact match
  const exact = topo.topics.find((t) => t.topicId === normalized);
  if (exact) return exact.topicId;

  // Partial match
  const partial = topo.topics.find(
    (t) => t.topicId.includes(normalized) || normalized.includes(t.topicId),
  );
  return partial?.topicId ?? null;
}

/** Blueprint target item count for a given topic within a section. */
export function topicItemCount(sectionId: DatSectionId, topicId: string): number {
  const bp = ACTIVE_DAT_BLUEPRINT;
  for (const section of bp.sections) {
    for (const sub of section.subSections) {
      if (sub.id === sectionId) {
        const tw = sub.topicWeights.find((w) => w.topicId === topicId);
        if (tw) return Math.round((tw.targetPct / 100) * sub.itemCount);
      }
    }
  }
  return 0;
}
