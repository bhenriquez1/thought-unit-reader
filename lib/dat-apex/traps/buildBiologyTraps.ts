// lib/dat-apex/traps/buildBiologyTraps.ts

import type { DatTopicFamily } from "../types";
import type { PdrmBlock } from "../types";

interface TrapEntry {
  signal: RegExp;
  family: string;
  trap: string;
  distractor: string;
}

const BIO_TRAPS: TrapEntry[] = [
  {
    signal: /mitosis|meiosis|cell division/i,
    family: "process_confusion",
    trap: "Mitosis vs. meiosis: mitosis → 2 genetically identical diploid cells. Meiosis → 4 genetically distinct haploid cells.",
    distractor: "Both involve chromosome condensation and spindle formation — students mix up which produces gametes.",
  },
  {
    signal: /glycolysis|krebs|citric acid|electron transport|atp/i,
    family: "location_output_swap",
    trap: "Glycolysis (cytoplasm, net 2 ATP). Pyruvate oxidation + Krebs (mitochondrial matrix). ETC / oxidative phosphorylation (inner mitochondrial membrane, ~32–34 ATP).",
    distractor: "DAT tests which stage is in the matrix vs. inner membrane, and net vs. gross ATP yield.",
  },
  {
    signal: /transcription|translation|mrna|trna|rrna/i,
    family: "location_direction_swap",
    trap: "Transcription (nucleus, 5'→3' mRNA synthesis from 3'→5' template). Translation (ribosome in cytoplasm or rough ER). Students say translation occurs in the nucleus.",
    distractor: "Template strand is read 3'→5'; coding strand = same sequence as mRNA (replace T with U).",
  },
  {
    signal: /dominant|recessive|allele|genotype|phenotype/i,
    family: "frequency_dominance_swap",
    trap: "The most common phenotype is NOT necessarily dominant. Recessive alleles can be prevalent in a population.",
    distractor: "DAT tests whether you confuse allele frequency with dominance/recessiveness.",
  },
  {
    signal: /steroid|peptide|hormone|receptor/i,
    family: "hormone_mechanism_swap",
    trap: "Steroid hormones (lipophilic) cross the plasma membrane → bind nuclear/cytoplasmic receptors → alter gene expression. Peptide hormones (hydrophilic) bind surface receptors → second messenger (cAMP, IP₃) cascades.",
    distractor: "Speed: peptide hormone effects are faster (minutes); steroid effects are slower (hours, gene-level).",
  },
  {
    signal: /active transport|facilitated diffusion|passive/i,
    family: "energy_requirement_swap",
    trap: "Facilitated diffusion: protein channel/carrier, NO ATP, follows gradient. Active transport: ATP required, moves AGAINST gradient. Osmosis: passive movement of water toward higher solute concentration.",
    distractor: "Both facilitated diffusion and active transport use proteins — students confuse them by focusing on the protein rather than the ATP requirement.",
  },
  {
    signal: /competitive|noncompetitive|inhibit|enzyme|vmax|km/i,
    family: "enzyme_inhibition_swap",
    trap: "Competitive inhibitor: raises apparent Km, Vmax unchanged (can outcompete with excess substrate). Noncompetitive: lowers Vmax, Km unchanged (cannot overcome with substrate).",
    distractor: "Both lower the reaction rate at normal substrate concentrations — students forget to distinguish Km vs. Vmax effects.",
  },
  {
    signal: /b cell|t cell|antibody|innate|adaptive|lymphocyte|natural killer/i,
    family: "immune_cell_swap",
    trap: "B cells → antibodies (humoral immunity). Helper T cells → activate B and cytotoxic T cells. Cytotoxic T cells → kill infected cells. NK cells → innate immunity (not adaptive).",
    distractor: "NK cells are part of innate, not adaptive immunity. Students often group them with T cells.",
  },
  {
    signal: /crossing over|independent assortment|prophase|metaphase|meiosis/i,
    family: "meiosis_stage_swap",
    trap: "Crossing over occurs in Prophase I (homologs synapsed as tetrads). Independent assortment occurs in Metaphase I (random orientation of bivalents).",
    distractor: "Students confuse which stage generates which source of genetic variation.",
  },
  {
    signal: /hardy.weinberg|allele frequency|population genetics/i,
    family: "hw_assumptions",
    trap: "H-W equilibrium requires ALL five conditions: large population, random mating, no mutation, no migration, no natural selection. Violation of ANY = evolution occurring.",
    distractor: "p² + 2pq + q² = 1 (genotype). p + q = 1 (allele). Recessive genotype = q²; use this to find q, then p.",
  },
];

// Topic-level trap overrides for thin-text pages
const TOPIC_TRAP_OVERRIDES: Partial<Record<DatTopicFamily, string[]>> = {
  cellular_respiration: [
    "Location confusion: glycolysis is in the cytoplasm; Krebs is in the mitochondrial matrix; ETC is on the inner mitochondrial membrane.",
    "Net vs. gross ATP: glycolysis yields net 2 ATP; the full aerobic pathway yields ~36–38 ATP total per glucose.",
  ],
  gene_expression: [
    "Template strand vs. coding strand: RNA polymerase reads the template 3'→5'; mRNA is synthesized 5'→3' and matches the coding strand (U for T).",
    "Translation occurs in the cytoplasm (free ribosomes) or rough ER — NOT in the nucleus.",
  ],
  meiosis_genetics: [
    "Meiosis I is reductive (2n → n); Meiosis II is equational (like mitosis). Crossing over happens ONLY in Prophase I.",
    "A diploid organism with 2n = 46 produces gametes with n = 23, not 46.",
  ],
  membranes_transport: [
    "Osmosis moves water toward higher solute (lower water potential). A cell in hypertonic solution loses water (crenates); in hypotonic solution gains water (lyses if no wall).",
  ],
};

export function buildBiologyTraps(
  pageText: string,
  topicFamily: DatTopicFamily,
  explicitTraps: string[]
): string[] {
  const matched = BIO_TRAPS.filter(({ signal }) => signal.test(pageText)).map(
    ({ trap }) => trap
  );

  const topicOverrides = TOPIC_TRAP_OVERRIDES[topicFamily] ?? [];

  const all = [
    ...new Set([...explicitTraps, ...topicOverrides, ...matched]),
  ];

  return all.slice(0, 4);
}
