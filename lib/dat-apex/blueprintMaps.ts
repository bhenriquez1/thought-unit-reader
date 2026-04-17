// lib/dat-apex/blueprintMaps.ts
//
// Maps normalized chapter/section titles to DAT topic families and weights.
// Each entry is a pattern (substring or regex source) plus the classification.

import type { DatTopicFamily, DatWeight, DatSubject } from "./types";

export interface BlueprintEntry {
  patterns: RegExp[];
  topicFamily: DatTopicFamily;
  datWeight: DatWeight;
  tags: string[];
}

// ---------------------------------------------------------------------------
// Biology blueprint
// ---------------------------------------------------------------------------

export const BIOLOGY_BLUEPRINT: BlueprintEntry[] = [
  {
    patterns: [/chemical basis|water|hydrogen bond|molecule/i],
    topicFamily: "chemical_foundations",
    datWeight: "very_high",
    tags: ["water", "chemistry", "bonds"],
  },
  {
    patterns: [/biomolecule|carbohydrate|lipid|protein|nucleic acid|macromolecule/i],
    topicFamily: "biomolecules",
    datWeight: "very_high",
    tags: ["biomolecules", "macromolecules"],
  },
  {
    patterns: [/cell structure|prokaryot|eukaryot|organelle|cytoskeleton/i],
    topicFamily: "cell_structure",
    datWeight: "very_high",
    tags: ["cell", "structure"],
  },
  {
    patterns: [/membrane|transport|osmosis|diffusion|channel|pump|phospholipid/i],
    topicFamily: "membranes_transport",
    datWeight: "very_high",
    tags: ["membrane", "transport"],
  },
  {
    patterns: [/metabolism|enzyme|catabolism|anabolism|free energy|atp/i],
    topicFamily: "metabolism",
    datWeight: "very_high",
    tags: ["metabolism", "enzymes"],
  },
  {
    patterns: [/cellular respiration|glycolysis|krebs|citric acid|electron transport|oxidative phosphorylation|fermentation/i],
    topicFamily: "cellular_respiration",
    datWeight: "very_high",
    tags: ["respiration", "ATP", "glycolysis"],
  },
  {
    patterns: [/photosynthesis|light reaction|calvin|chloroplast|thylakoid|stroma/i],
    topicFamily: "photosynthesis",
    datWeight: "very_high",
    tags: ["photosynthesis", "light reactions"],
  },
  {
    patterns: [/cell signal|signal transduction|second messenger|receptor|kinase/i],
    topicFamily: "cell_signaling",
    datWeight: "very_high",
    tags: ["signaling"],
  },
  {
    patterns: [/cell cycle|mitosis|cytokinesis|checkpoint|interphase|prophase|metaphase|anaphase|telophase/i],
    topicFamily: "cell_cycle",
    datWeight: "very_high",
    tags: ["mitosis", "cell cycle"],
  },
  {
    patterns: [/meiosis|sexual reproduction|crossing over|independent assortment|mendelian|inheritance|genetics|allele|genotype|phenotype|punnett/i],
    topicFamily: "meiosis_genetics",
    datWeight: "very_high",
    tags: ["meiosis", "genetics"],
  },
  {
    patterns: [/dna replication|replication fork|polymerase|helicase|primase|okazaki/i],
    topicFamily: "dna_replication",
    datWeight: "very_high",
    tags: ["DNA replication"],
  },
  {
    patterns: [/transcription|translation|rna polymerase|ribosome|mrna|trna|rrna|codon|anticodon|gene expression/i],
    topicFamily: "gene_expression",
    datWeight: "very_high",
    tags: ["transcription", "translation"],
  },
  {
    patterns: [/gene regulation|operon|lac operon|trp operon|promoter|enhancer|epigenetic/i],
    topicFamily: "gene_regulation",
    datWeight: "very_high",
    tags: ["gene regulation"],
  },
  {
    patterns: [/biotechnology|pcr|cloning|restriction enzyme|gel electrophoresis|crispr|recombinant/i],
    topicFamily: "biotechnology",
    datWeight: "very_high",
    tags: ["biotechnology"],
  },
  {
    patterns: [/endocrine|hormone|insulin|glucagon|cortisol|thyroid|pituitary|hypothalamus|negative feedback/i],
    topicFamily: "physiology_endocrine",
    datWeight: "very_high",
    tags: ["endocrine", "hormones"],
  },
  {
    patterns: [/nervous system|neuron|action potential|synapse|neurotransmitter|myelin|reflex|brain/i],
    topicFamily: "physiology_nervous",
    datWeight: "very_high",
    tags: ["nervous system"],
  },
  {
    patterns: [/immune|antibody|antigen|b cell|t cell|lymphocyte|innate|adaptive|vaccine|inflammation/i],
    topicFamily: "physiology_immune",
    datWeight: "very_high",
    tags: ["immune system"],
  },
  {
    patterns: [/digestive|cardiovascular|respiratory|renal|musculo|excretion|osmoregulation|circulat/i],
    topicFamily: "physiology_other",
    datWeight: "high",
    tags: ["physiology"],
  },
  {
    patterns: [/evolution|natural selection|speciation|phylogeny|population genetics|hardy.weinberg|genetic drift/i],
    topicFamily: "evolution_population",
    datWeight: "high",
    tags: ["evolution"],
  },
  {
    patterns: [/ecology|ecosystem|biome|food web|community|succession|nutrient cycle/i],
    topicFamily: "ecology",
    datWeight: "medium",
    tags: ["ecology"],
  },
  {
    patterns: [/diversity|kingdom|phylum|class|order|family|genus|species|taxonomy|fungi|protist|plant|animal/i],
    topicFamily: "diversity",
    datWeight: "medium",
    tags: ["diversity", "taxonomy"],
  },
];

// ---------------------------------------------------------------------------
// General chemistry blueprint
// ---------------------------------------------------------------------------

export const GEN_CHEM_BLUEPRINT: BlueprintEntry[] = [
  {
    patterns: [/stoichiometry|mole|limiting reagent|percent yield|empirical formula/i],
    topicFamily: "stoichiometry",
    datWeight: "very_high",
    tags: ["stoichiometry", "moles"],
  },
  {
    patterns: [/periodic trend|ionization energy|electron affinity|atomic radius|electronegativity/i],
    topicFamily: "periodic_trends",
    datWeight: "very_high",
    tags: ["periodic trends"],
  },
  {
    patterns: [/chemical bond|ionic|covalent|polar|nonpolar|bond energy|bond length/i],
    topicFamily: "bonding",
    datWeight: "very_high",
    tags: ["bonding"],
  },
  {
    patterns: [/molecular geometry|vsepr|hybridization|sigma|pi bond|orbital/i],
    topicFamily: "molecular_geometry",
    datWeight: "very_high",
    tags: ["geometry", "VSEPR"],
  },
  {
    patterns: [/solution|solubility|concentration|molarity|molality|dilution|colligative/i],
    topicFamily: "solutions",
    datWeight: "very_high",
    tags: ["solutions"],
  },
  {
    patterns: [/kinetics|rate law|rate constant|half.life|activation energy|arrhenius|catalyst/i],
    topicFamily: "kinetics",
    datWeight: "very_high",
    tags: ["kinetics"],
  },
  {
    patterns: [/equilibrium|le chatelier|keq|reaction quotient|kp|kc|ksp/i],
    topicFamily: "equilibrium",
    datWeight: "very_high",
    tags: ["equilibrium"],
  },
  {
    patterns: [/acid|base|ph|poh|pka|pkb|buffer|henderson|titration|conjugate|strong acid|weak acid/i],
    topicFamily: "acid_base",
    datWeight: "very_high",
    tags: ["acid-base", "pH"],
  },
  {
    patterns: [/thermodynamics|gibbs|entropy|enthalpy|spontaneous|free energy|delta g/i],
    topicFamily: "thermodynamics",
    datWeight: "very_high",
    tags: ["thermodynamics"],
  },
  {
    patterns: [/electrochemistry|galvanic|electrolytic|cell potential|nernst|faraday|redox|oxidation state/i],
    topicFamily: "electrochemistry",
    datWeight: "very_high",
    tags: ["electrochemistry", "redox"],
  },
  {
    patterns: [/atomic structure|electron configuration|quantum|orbital|aufbau|hund|pauli/i],
    topicFamily: "atomic_structure",
    datWeight: "high",
    tags: ["atomic structure"],
  },
  {
    patterns: [/gas law|ideal gas|boyle|charles|dalton|graham|kinetic molecular/i],
    topicFamily: "gases",
    datWeight: "high",
    tags: ["gases"],
  },
  {
    patterns: [/intermolecular|van der waals|london|dipole|hydrogen bond|boiling point|melting point/i],
    topicFamily: "intermolecular_forces",
    datWeight: "high",
    tags: ["IMFs"],
  },
  {
    patterns: [/thermochemistry|hess|calorimetry|heat capacity|enthalpy of formation/i],
    topicFamily: "thermochemistry",
    datWeight: "high",
    tags: ["thermochemistry"],
  },
];

// ---------------------------------------------------------------------------
// Organic chemistry blueprint
// ---------------------------------------------------------------------------

export const ORGO_BLUEPRINT: BlueprintEntry[] = [
  {
    patterns: [/structure and bonding|orbital|hybridization|resonance|formal charge|lewis structure/i],
    topicFamily: "structure_bonding",
    datWeight: "very_high",
    tags: ["structure", "bonding"],
  },
  {
    patterns: [/acid.base|pka|conjugate|brønsted|lewis acid|nucleophilicity/i],
    topicFamily: "acids_bases_orgo",
    datWeight: "very_high",
    tags: ["acids/bases"],
  },
  {
    patterns: [/stereochemistry|chirality|chiral|enantiomer|diastereomer|r.s|meso|optical activity|racemic/i],
    topicFamily: "stereochemistry",
    datWeight: "very_high",
    tags: ["stereochemistry"],
  },
  {
    patterns: [/alkyl halide|haloalkane|leaving group/i],
    topicFamily: "alkyl_halides",
    datWeight: "very_high",
    tags: ["alkyl halides"],
  },
  {
    patterns: [/sn1|sn2|e1|e2|substitution|elimination|nucleophil|backside attack|zaitsev|hofmann/i],
    topicFamily: "substitution_elimination",
    datWeight: "very_high",
    tags: ["SN1", "SN2", "E1", "E2"],
  },
  {
    patterns: [/alkene|double bond|markovnikov|anti-markovnikov|hydrohalogenation|hydration|halogenation|ozonolysis|hydrogenation/i],
    topicFamily: "alkenes",
    datWeight: "very_high",
    tags: ["alkenes"],
  },
  {
    patterns: [/benzene|aromatic|electrophilic aromatic|eas|friedel.crafts|naphthalene|phenol/i],
    topicFamily: "aromatic",
    datWeight: "very_high",
    tags: ["aromatic", "EAS"],
  },
  {
    patterns: [/aldehyde|ketone|carbonyl|nucleophilic addition|acetal|imine|enamine|wittig|aldol/i],
    topicFamily: "carbonyl",
    datWeight: "very_high",
    tags: ["aldehydes", "ketones", "carbonyl"],
  },
  {
    patterns: [/carboxylic acid|acyl|ester|amide|anhydride|hydrolysis|saponification|acyl substitution/i],
    topicFamily: "carboxylic_derivatives",
    datWeight: "very_high",
    tags: ["carboxylic acids", "esters"],
  },
  {
    patterns: [/alcohol|ether|epoxide|diol|grignard|williamson|ring opening/i],
    topicFamily: "alcohols_ethers_epoxides",
    datWeight: "high",
    tags: ["alcohols", "ethers", "epoxides"],
  },
  {
    patterns: [/alkyne|triple bond|terminal alkyne|internal alkyne|reduction of alkyne/i],
    topicFamily: "alkynes",
    datWeight: "high",
    tags: ["alkynes"],
  },
  {
    patterns: [/amine|nitrogen|basicity|amide|amine synthesis/i],
    topicFamily: "amines",
    datWeight: "high",
    tags: ["amines"],
  },
  {
    patterns: [/nmr|ir spectroscopy|mass spec|spectroscopy|uv.vis/i],
    topicFamily: "spectroscopy",
    datWeight: "medium",
    tags: ["spectroscopy"],
  },
];

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

export function getBlueprintForSubject(subject: DatSubject): BlueprintEntry[] {
  if (subject === "biology") return BIOLOGY_BLUEPRINT;
  if (subject === "general_chemistry") return GEN_CHEM_BLUEPRINT;
  if (subject === "organic_chemistry") return ORGO_BLUEPRINT;
  return [];
}

export function matchBlueprintEntry(
  title: string,
  subject: DatSubject
): BlueprintEntry | undefined {
  const blueprint = getBlueprintForSubject(subject);
  for (const entry of blueprint) {
    if (entry.patterns.some((re) => re.test(title))) return entry;
  }
  return undefined;
}
