// lib/apex/datApex.seed.ts
// DAT PDRM pattern modules — high-yield, testable, trap-aware seed data

import type { ApexSection } from "./datApexTypes";

export type PatSubtype =
  | "keyhole"
  | "angle_ranking"
  | "cube_counting"
  | "paper_folding"
  | "tfe";

export type PatternModule = {
  id: string;
  section: ApexSection;
  category: string;
  name: string;
  pattern: string;
  decisionRule: string;
  mechanism: string;
  trap: string;
  tags?: string[];
  patSubtype?: PatSubtype;
};

export const DAT_PATTERN_MODULES: PatternModule[] = [
  // ── BIOLOGY ──────────────────────────────────────────────────────────────
  {
    id: "bio-cell-cycle",
    section: "bio",
    category: "Cell Biology",
    name: "Mitosis vs Meiosis",
    pattern: "Division / chromosome number / variation question",
    decisionRule: "Mitosis preserves ploidy (2n → 2n); meiosis reduces ploidy and introduces variation (2n → n)",
    mechanism: "Homologs separate in meiosis I; sister chromatids separate in meiosis II; crossing over creates variation",
    trap: "Confusing meiosis II with mitosis or forgetting reduction happens in meiosis I",
    tags: ["cell-cycle", "division", "genetics"],
  },
  {
    id: "bio-respiration",
    section: "bio",
    category: "Metabolism",
    name: "Respiration vs Photosynthesis",
    pattern: "ATP / organelle / oxygen / energy transformation question",
    decisionRule: "Respiration extracts ATP from fuel; photosynthesis stores energy in glucose",
    mechanism: "ETC builds proton gradient for ATP synthase; light reactions feed Calvin cycle",
    trap: "Mixing NADH with NADPH or misunderstanding oxygen's role in each process",
    tags: ["metabolism", "photosynthesis", "respiration"],
  },
  {
    id: "bio-genetics",
    section: "bio",
    category: "Genetics",
    name: "Punnett and Probability",
    pattern: "Inheritance ratio or probability question",
    decisionRule: "Multiply independent probabilities; add mutually exclusive outcomes",
    mechanism: "Segregation and independent assortment drive expected genotype and phenotype ratios",
    trap: "Confusing genotype ratio (1:2:1) with phenotype ratio (3:1) or misusing probability rules",
    tags: ["genetics", "probability", "inheritance"],
  },
  {
    id: "bio-physiology",
    section: "bio",
    category: "Systems",
    name: "Physiology Integration",
    pattern: "Two-system interaction or compensation question",
    decisionRule: "Identify the primary system first, then the compensating or linked system",
    mechanism: "Function flows across organ systems through feedback loops and transport cascades",
    trap: "Choosing a true fact from the wrong system as the answer",
    tags: ["systems", "physiology", "integration"],
  },
  {
    id: "bio-evolution",
    section: "bio",
    category: "Evolution",
    name: "Natural Selection",
    pattern: "Population change over time / allele frequency / fitness question",
    decisionRule: "Evolution acts on populations, not on individual intention or desire",
    mechanism: "Selection pressure shifts allele frequencies over generations through differential reproduction",
    trap: "Teleological thinking: 'organisms adapt because they need to' — evolution has no goal",
    tags: ["evolution", "ecology", "selection"],
  },

  // ── GENERAL CHEMISTRY ───────────────────────────────────────────────────
  {
    id: "gc-equilibrium",
    section: "gc",
    category: "Equilibrium",
    name: "Le Chatelier's Principle",
    pattern: "System shift under concentration, pressure, or temperature disturbance",
    decisionRule: "System shifts to oppose the imposed change and reach a new equilibrium",
    mechanism: "Changing concentration, pressure, or temperature alters Q relative to K, driving shift direction",
    trap: "Treating temperature changes like concentration changes — temperature actually changes K, not just Q",
    tags: ["equilibrium", "le-chatelier"],
  },
  {
    id: "gc-thermo",
    section: "gc",
    category: "Thermodynamics",
    name: "Spontaneity (ΔG)",
    pattern: "Determine whether a process is spontaneous under given conditions",
    decisionRule: "Use ΔG = ΔH − TΔS; negative ΔG means spontaneous — enthalpy alone does not decide",
    mechanism: "Spontaneity depends on the balance between enthalpy (ΔH) and entropy (TΔS) at a given temperature",
    trap: "Assuming exothermic always means spontaneous — endothermic reactions can be spontaneous at high T",
    tags: ["thermo", "delta-g", "entropy"],
  },
  {
    id: "gc-acidbase",
    section: "gc",
    category: "Acid/Base",
    name: "Strength vs Concentration",
    pattern: "pH, dissociation, or strength comparison question",
    decisionRule: "Strength = extent of dissociation; concentration = moles per liter — they are independent",
    mechanism: "Strong acids/bases dissociate completely; weak acids/bases reach equilibrium with partial dissociation",
    trap: "Confusing a concentrated weak acid with a strong acid, or assuming low pH always means strong acid",
    tags: ["acid-base", "ph", "equilibrium"],
  },
  {
    id: "gc-kinetics",
    section: "gc",
    category: "Kinetics",
    name: "Rate Laws",
    pattern: "Rate change or reaction order question",
    decisionRule: "Reaction order is determined experimentally, not from stoichiometric coefficients (unless elementary step)",
    mechanism: "Rate depends on concentration of reactants raised to experimentally determined powers",
    trap: "Using balanced equation coefficients directly as rate-law exponents",
    tags: ["kinetics", "rate-law"],
  },
  {
    id: "gc-electrochem",
    section: "gc",
    category: "Redox",
    name: "Electrochemistry",
    pattern: "Cell potential / electron flow / oxidation state question",
    decisionRule: "Oxidation at anode (loses e−); reduction at cathode (gains e−); electrons flow anode → cathode",
    mechanism: "Potential difference drives electron movement through external circuit; ion flow in solution completes the circuit",
    trap: "Mixing up electrode sign conventions (anode is negative in galvanic, positive in electrolytic)",
    tags: ["redox", "electrochemistry"],
  },

  // ── ORGANIC CHEMISTRY ───────────────────────────────────────────────────
  {
    id: "orgo-sn1sn2",
    section: "orgo",
    category: "Substitution",
    name: "SN1 vs SN2",
    pattern: "Substitution reaction question — choose mechanism based on substrate and conditions",
    decisionRule: "Tertiary + weak nucleophile → SN1; primary + strong nucleophile → SN2; secondary depends on conditions",
    mechanism: "SN1: two-step — carbocation intermediate, racemization; SN2: one-step — concerted backside attack, inversion",
    trap: "Ignoring carbocation rearrangements in SN1 or forgetting solvent polarity affects mechanism",
    tags: ["sn1", "sn2", "substitution"],
  },
  {
    id: "orgo-e1e2",
    section: "orgo",
    category: "Elimination",
    name: "E1 vs E2",
    pattern: "Elimination reaction question — predict product and mechanism",
    decisionRule: "Strong bulky base → E2 (Zaitsev or Hofmann); weak base + heat → E1 via carbocation",
    mechanism: "E2: one-step anti-periplanar H and LG removal; E1: carbocation forms first, then proton lost",
    trap: "Confusing elimination with substitution conditions, or missing Zaitsev (most substituted) vs Hofmann (least substituted)",
    tags: ["e1", "e2", "elimination"],
  },
  {
    id: "orgo-acidbase",
    section: "orgo",
    category: "Acid/Base",
    name: "Acidity and Basicity Ranking",
    pattern: "Rank strongest acid/base or predict direction of equilibrium",
    decisionRule: "More stable conjugate base → stronger acid; compare resonance, electronegativity, size, induction, hybridization",
    mechanism: "Delocalization and electronegativity lower the energy of the conjugate base, increasing acid strength",
    trap: "Memorizing isolated pKa values instead of reasoning from conjugate base stability",
    tags: ["acidity", "basicity", "ranking"],
  },
  {
    id: "orgo-reaction",
    section: "orgo",
    category: "Reaction Prediction",
    name: "Reagent to Product",
    pattern: "Given reagents, predict the major organic product",
    decisionRule: "Identify the functional group and the reagent's role (nucleophile, electrophile, oxidant, reductant) before predicting",
    mechanism: "Electron-rich site attacks electron-poor site according to the reaction class and conditions",
    trap: "Skipping intermediate logic or misreading reagent strength and selectivity",
    tags: ["reaction-prediction", "products"],
  },
  {
    id: "orgo-spectroscopy",
    section: "orgo",
    category: "Spectroscopy",
    name: "IR and NMR",
    pattern: "Identify or confirm structure from spectral clues",
    decisionRule: "IR reveals functional groups (stretch frequencies); NMR reveals local structure (shift, splitting, integration)",
    mechanism: "Signal position reflects local electron density; NMR splitting follows n+1 rule for adjacent H neighbors",
    trap: "Over-focusing on one peak and ignoring the full spectral pattern — use IR + NMR together",
    tags: ["ir", "nmr", "spectroscopy"],
  },

  // ── PAT ─────────────────────────────────────────────────────────────────
  {
    id: "pat-keyhole",
    section: "pat",
    category: "PAT",
    name: "Keyhole (Apertures)",
    pattern: "Determine whether a 3D object can pass through a given aperture",
    decisionRule: "Eliminate options that violate any height, width, or depth constraint before considering rotation",
    mechanism: "Use bounding-box logic — match the object's maximum silhouette projection to the aperture shape",
    trap: "Choosing based on rough visual resemblance instead of systematically checking all three dimension constraints",
    patSubtype: "keyhole",
    tags: ["pat", "keyhole", "aperture"],
  },
  {
    id: "pat-angle",
    section: "pat",
    category: "PAT",
    name: "Angle Ranking",
    pattern: "Rank a set of angles from smallest to largest",
    decisionRule: "Compare vertex openness and arm spread systematically — do not trust visual length of arms",
    mechanism: "True angle magnitude is the opening at the vertex regardless of arm length or overall orientation",
    trap: "Falling for line-length illusion (longer arms → bigger angle) or orientation illusion (tilted angle appears different)",
    patSubtype: "angle_ranking",
    tags: ["pat", "angle-ranking"],
  },
  {
    id: "pat-cube",
    section: "pat",
    category: "PAT",
    name: "Cube Counting",
    pattern: "Count cubes with a specified number of exposed faces in a stacked arrangement",
    decisionRule: "Work layer by layer and classify each cube by how many of its six faces are exposed",
    mechanism: "Exposure is determined by adjacency — each face shared with another cube or the floor is hidden",
    trap: "Missing hidden cubes underneath visible ones, or double-counting shared faces",
    patSubtype: "cube_counting",
    tags: ["pat", "cube-counting"],
  },
  {
    id: "pat-paper",
    section: "pat",
    category: "PAT",
    name: "Paper Folding",
    pattern: "Predict the hole pattern after a punched sheet of paper is unfolded",
    decisionRule: "Reverse the folds in order and mirror each punch location across each fold line",
    mechanism: "Each fold creates a symmetry axis — punching through n layers creates 2ⁿ holes after unfolding",
    trap: "Skipping one fold reflection or mirroring in the wrong direction",
    patSubtype: "paper_folding",
    tags: ["pat", "paper-folding"],
  },
  {
    id: "pat-tfe",
    section: "pat",
    category: "PAT",
    name: "Top-Front-End (TFE)",
    pattern: "Match three orthographic 2D views (top, front, end) to the correct 3D form",
    decisionRule: "Track edges, heights, and hidden-line intersections across all three views simultaneously",
    mechanism: "Each 2D view constrains the same 3D structure from a different projection angle",
    trap: "Mentally rotating loosely without reconciling all three views — one mismatched edge eliminates the choice",
    patSubtype: "tfe",
    tags: ["pat", "tfe", "view-recognition"],
  },

  // ── QUANTITATIVE REASONING ───────────────────────────────────────────────
  {
    id: "qr-word",
    section: "qr",
    category: "QR",
    name: "Word Problems",
    pattern: "Translate a verbal setup into algebraic equations",
    decisionRule: "Define all variables explicitly before computing — label what each variable represents",
    mechanism: "Relationships stated in the text become algebraic constraints that form a solvable system",
    trap: "Rushing into arithmetic before setting up the model — misidentified variable leads to wrong answer",
    tags: ["qr", "word-problems"],
  },
  {
    id: "qr-probability",
    section: "qr",
    category: "QR",
    name: "Probability",
    pattern: "Chance / selection / event outcome question",
    decisionRule: "Multiply for independent events (AND); add for mutually exclusive outcomes (OR)",
    mechanism: "The structure of the outcome space determines which operation applies",
    trap: "Mixing dependent and independent event logic — conditional probability changes the sample space",
    tags: ["qr", "probability"],
  },
  {
    id: "qr-algebra",
    section: "qr",
    category: "QR",
    name: "Algebra",
    pattern: "Solve for an unknown variable",
    decisionRule: "Isolate the variable using inverse operations — simplify before solving",
    mechanism: "Equivalent transformations preserve equality while narrowing the solution space",
    trap: "Sign errors when distributing or moving terms, especially with negatives and fractions",
    tags: ["qr", "algebra"],
  },
  {
    id: "qr-ratios",
    section: "qr",
    category: "QR",
    name: "Ratios and Proportions",
    pattern: "Compare quantities proportionally or scale a relationship",
    decisionRule: "Set up equivalent ratios and keep units aligned before cross-multiplying",
    mechanism: "Cross-multiplication converts proportional relationships into solvable equations",
    trap: "Unit mismatch or inverting the ratio setup — check that units cancel correctly",
    tags: ["qr", "ratios"],
  },
  {
    id: "qr-data",
    section: "qr",
    category: "QR",
    name: "Data Analysis",
    pattern: "Interpret or calculate from charts, graphs, or tables",
    decisionRule: "Extract the trend and understand the scale before any calculation",
    mechanism: "Visualized data encodes quantitative relationships — axis labels and scale define meaning",
    trap: "Over-calculating before understanding axes and labels — misread scale causes order-of-magnitude errors",
    tags: ["qr", "data-analysis"],
  },

  // ── READING COMPREHENSION ────────────────────────────────────────────────
  {
    id: "rc-search",
    section: "rc",
    category: "Reading",
    name: "Search and Destroy",
    pattern: "Direct factual retrieval question",
    decisionRule: "Map the question keyword to a passage location, then read only that section",
    mechanism: "Targeted retrieval beats full re-reading for fact-based prompts — speed is the advantage",
    trap: "Re-reading the entire passage for a single-fact question — wastes time and invites distraction",
    tags: ["rc", "search-destroy"],
  },
  {
    id: "rc-inference",
    section: "rc",
    category: "Reading",
    name: "Inference",
    pattern: "Implied meaning or conclusion question",
    decisionRule: "The answer must be directly supported by the text — do not extend beyond what is stated",
    mechanism: "Valid inference extends explicit evidence without exceeding it or importing outside knowledge",
    trap: "Choosing a plausible but unsupported conclusion — 'could be true' is not the same as 'must be true'",
    tags: ["rc", "inference"],
  },
  {
    id: "rc-tone",
    section: "rc",
    category: "Reading",
    name: "Tone and Author Intent",
    pattern: "Author attitude or purpose question",
    decisionRule: "Track stance words, hedging language, and argumentative posture to identify tone",
    mechanism: "Tone emerges from word choice and argumentative direction — look for evaluative adjectives and verbs",
    trap: "Selecting an extreme tone answer — most DAT passages use measured, academic language",
    tags: ["rc", "tone"],
  },
  {
    id: "rc-mainidea",
    section: "rc",
    category: "Reading",
    name: "Main Idea",
    pattern: "Primary purpose or global summary question",
    decisionRule: "Combine paragraph purposes; do not over-fit to one detail — scope must match the whole passage",
    mechanism: "Main idea is the organizing function of the passage — details support it, not the other way around",
    trap: "Selecting a true and interesting detail instead of the central purpose",
    tags: ["rc", "main-idea"],
  },
];

/** All unique sections represented in the seed */
export const SEED_SECTIONS = ["bio", "gc", "orgo", "pat", "qr", "rc"] as const;

/** Get modules for a specific section */
export function getModulesBySection(section: ApexSection): PatternModule[] {
  return DAT_PATTERN_MODULES.filter((m) => m.section === section);
}

/** Get PAT modules by subtype */
export function getPatModulesBySubtype(subtype: PatSubtype): PatternModule[] {
  return DAT_PATTERN_MODULES.filter((m) => m.section === "pat" && m.patSubtype === subtype);
}
