// lib/dat-apex/pdrm/buildBiologyPdrm.ts

import type { PdrmBlock } from "../types";
import type { DatTopicFamily } from "../types";
import type { PageGraphInput } from "../buildDatApexPageModel";

function first(...candidates: Array<string | null | undefined>): string {
  for (const c of candidates) {
    const s = (c ?? "").trim();
    if (s) return s;
  }
  return "";
}

// Per-topic PDRM templates — used when graph signals are thin
const TOPIC_PDRM: Partial<Record<DatTopicFamily, PdrmBlock>> = {
  cellular_respiration: {
    pattern: "Cellular respiration: glycolysis → pyruvate oxidation → Krebs cycle → ETC",
    decision: "Which stage? What inputs/outputs? Where in the cell does it occur?",
    reason: "Each stage has a specific location, substrate, and net ATP/NADH/FADH₂ yield. DAT tests process-location-output matching.",
    miss: "Mixing cytoplasm (glycolysis) with mitochondrial matrix (Krebs) vs. inner membrane (ETC). Also: confusing net vs. gross ATP.",
  },
  photosynthesis: {
    pattern: "Photosynthesis: light reactions (thylakoid) → Calvin cycle (stroma)",
    decision: "Which stage uses light? Which fixes CO₂? What does each produce?",
    reason: "Light reactions split water → O₂, produce ATP + NADPH. Calvin cycle uses ATP + NADPH to fix CO₂ into G3P.",
    miss: "Saying the Calvin cycle requires light directly, or confusing NADPH (photosynthesis) with NADH (respiration).",
  },
  cell_cycle: {
    pattern: "Cell cycle: G1 → S (DNA synthesis) → G2 → M (mitosis) → cytokinesis",
    decision: "What happens at each checkpoint? Which phase replicates DNA? When do chromosomes condense?",
    reason: "G1/S/G2 checkpoints control cell growth and DNA integrity. Cyclins and CDKs regulate progression.",
    miss: "Confusing mitosis stages (PMAT) with meiosis I vs. II, or forgetting that cytokinesis is separate from nuclear division.",
  },
  meiosis_genetics: {
    pattern: "Meiosis I (homologs separate) → Meiosis II (chromatids separate) → 4 haploid cells",
    decision: "Which division is reductive? When does crossing over occur? How do Mendelian ratios apply?",
    reason: "Crossing over occurs in prophase I. Independent assortment in metaphase I. Each adds genetic diversity.",
    miss: "Mixing up meiosis I vs. II mechanics, or applying mitosis logic (identical daughter cells) to meiosis.",
  },
  gene_expression: {
    pattern: "DNA → (transcription) → mRNA → (translation) → protein",
    decision: "Template strand vs. coding strand? 5'→3' synthesis direction? Role of each RNA type?",
    reason: "RNA polymerase reads 3'→5' template to make 5'→3' mRNA. Ribosomes translate codons; tRNA anticodons match.",
    miss: "Confusing template and coding strands, or stating that translation occurs in the nucleus (it occurs at ribosomes in cytoplasm/ER).",
  },
  gene_regulation: {
    pattern: "Operons: promoter + operator + structural genes; activated or repressed by regulatory proteins",
    decision: "Inducible vs. repressible operon? What does the inducer/co-repressor do?",
    reason: "Lac operon: repressor dissociates when lactose present (inducible). Trp operon: co-repressor tryptophan activates repressor (repressible).",
    miss: "Mixing up inducible/repressible logic, or confusing the role of the operator vs. promoter.",
  },
  membranes_transport: {
    pattern: "Membrane transport: simple diffusion → facilitated diffusion → active transport",
    decision: "Does it require ATP? Does it follow the concentration gradient? What crosses unaided?",
    reason: "Simple diffusion (small, nonpolar) and facilitated diffusion follow gradients—no ATP. Active transport moves against gradient—requires ATP.",
    miss: "Confusing facilitated diffusion (no ATP, with gradient) with active transport (ATP, against gradient).",
  },
  metabolism: {
    pattern: "Enzymes lower activation energy; allosteric regulation and feedback inhibition control metabolic flux",
    decision: "Competitive vs. noncompetitive inhibition? What changes Vmax vs. Km?",
    reason: "Competitive inhibitor raises apparent Km (blocks active site); noncompetitive lowers Vmax (changes enzyme shape). Feedback inhibition uses end-product.",
    miss: "Saying competitive inhibition lowers Vmax, or forgetting that allosteric sites are distinct from active sites.",
  },
  physiology_endocrine: {
    pattern: "Steroid hormones enter cell → bind nuclear receptor → gene expression. Peptide hormones bind surface receptor → second messenger cascade.",
    decision: "Is the hormone steroid or peptide? Lipophilic or hydrophilic? Which intracellular pathway?",
    reason: "Steroids (lipophilic) cross membrane freely. Peptides (hydrophilic) use receptors + cAMP/IP₃ cascades.",
    miss: "Forgetting that steroid hormones act on nuclear receptors (slower, gene-level) vs. peptide hormones (faster, signal cascade).",
  },
  physiology_nervous: {
    pattern: "Action potential: resting → depolarization (Na⁺ in) → repolarization (K⁺ out) → hyperpolarization → reset",
    decision: "What triggers the action potential? What is the refractory period? How do synapses propagate signal?",
    reason: "Threshold depolarization opens voltage-gated Na⁺ channels. All-or-nothing principle. Myelin speeds conduction via saltatory propagation.",
    miss: "Confusing Na⁺/K⁺ roles in each phase, or saying action potentials vary in strength (they are all-or-nothing).",
  },
  physiology_immune: {
    pattern: "Innate (fast, nonspecific) vs. adaptive (slow, specific): B cells → antibodies; T cells → cell-mediated",
    decision: "Innate or adaptive? Humoral or cell-mediated? First exposure vs. memory response?",
    reason: "B cells produce antibodies (humoral). Helper T cells activate B cells and cytotoxic T cells. Memory cells enable faster secondary response.",
    miss: "Mixing up B cell and T cell roles, or forgetting that NK cells belong to innate immunity.",
  },
  biomolecules: {
    pattern: "Carbohydrates (energy/structure), lipids (membranes/hormones), proteins (function/structure), nucleic acids (information)",
    decision: "What monomer? What bond forms it? What is the biological role?",
    reason: "Glycosidic bonds (carbs), ester/phosphodiester bonds (lipids/nucleic acids), peptide bonds (proteins). Each class has unique roles.",
    miss: "Confusing dehydration synthesis (bonds form, water released) with hydrolysis (bonds break, water added).",
  },
  evolution_population: {
    pattern: "Hardy-Weinberg equilibrium: p² + 2pq + q² = 1; evolution = change in allele frequencies",
    decision: "Is the population in HW equilibrium? Which force is acting (mutation, selection, drift, gene flow, non-random mating)?",
    reason: "HW equilibrium requires large population, random mating, no mutation/selection/migration. Any violation = evolution occurring.",
    miss: "Assuming the most common phenotype is dominant, or applying HW to small populations where drift is significant.",
  },
};

export function buildBiologyPdrm(
  graph: PageGraphInput,
  topicFamily: DatTopicFamily
): PdrmBlock {
  const template = TOPIC_PDRM[topicFamily];

  // If we have a strong template match, use it but enrich with graph signals
  if (template) {
    return {
      pattern: first(graph.mainSignal, template.pattern),
      decision: first(graph.supportSignals?.[0], template.decision),
      reason: first(graph.supportSignals?.[1], template.reason),
      miss: first(graph.traps?.[0], template.miss),
    };
  }

  // Generic bio fallback driven by graph signals
  return {
    pattern: first(graph.mainSignal, graph.pageSummary, "Biological process / structure-function relationship"),
    decision: first(
      graph.supportSignals?.[0],
      "Where does this occur? What does it produce? What controls it?"
    ),
    reason: first(
      graph.supportSignals?.[1],
      "Understand the pathway, location, molecular inputs and outputs."
    ),
    miss: first(
      graph.traps?.[0],
      "Location confusion, process-order swap, or similar-name substitution."
    ),
  };
}
