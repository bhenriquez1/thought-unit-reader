// lib/dat-apex/questions/buildBiologyQuestions.ts

import type { DatQuestion, DatTopicFamily } from "../types";
import type { PdrmBlock } from "../types";

function qid(pageNumber: number, n: number): string {
  return `dat-bio-${pageNumber}-${n}`;
}

interface TopicQTemplate {
  stems: Array<{
    stem: string;
    answerLogic: string;
    distractorLogic: string[];
    difficulty: DatQuestion["difficulty"];
    type: DatQuestion["type"];
  }>;
}

const TOPIC_QUESTIONS: Partial<Record<DatTopicFamily, TopicQTemplate>> = {
  cellular_respiration: {
    stems: [
      {
        stem: "In which cellular compartment does the Krebs cycle occur?",
        answerLogic: "The Krebs cycle occurs in the mitochondrial matrix, where acetyl-CoA is oxidized to CO₂ and electrons are transferred to NAD⁺ and FAD.",
        distractorLogic: ["Cytoplasm (glycolysis)", "Inner mitochondrial membrane (ETC)", "Nucleus"],
        difficulty: "medium",
        type: "concept_check",
      },
      {
        stem: "Which stage of cellular respiration produces the most ATP per glucose molecule?",
        answerLogic: "Oxidative phosphorylation (ETC + ATP synthase on the inner mitochondrial membrane) produces ~32–34 of the ~36–38 ATP per glucose.",
        distractorLogic: ["Glycolysis (net 2 ATP)", "Krebs cycle (2 ATP directly)"],
        difficulty: "medium",
        type: "concept_check",
      },
      {
        stem: "A cell is treated with a drug that blocks NADH from donating electrons to the ETC. What is the most likely consequence?",
        answerLogic: "Electron transport and oxidative phosphorylation stop; cells must rely on fermentation for ATP; NADH accumulates and the Krebs cycle slows.",
        distractorLogic: ["Glycolysis stops immediately (incorrect — glycolysis does not directly require ETC)", "No effect on ATP production"],
        difficulty: "hard",
        type: "application",
      },
    ],
  },
  meiosis_genetics: {
    stems: [
      {
        stem: "A diploid organism (2n = 8) completes meiosis. How many chromosomes does each daughter cell contain?",
        answerLogic: "Meiosis halves the chromosome number. 2n = 8 → n = 4 chromosomes per gamete.",
        distractorLogic: ["8 (diploid — meiosis I is reductive)", "2 (would require 2n = 4)"],
        difficulty: "easy",
        type: "concept_check",
      },
      {
        stem: "During which phase of meiosis does crossing over occur?",
        answerLogic: "Crossing over (chiasmata formation) occurs during Prophase I, when homologous chromosomes are synapsed as tetrads (bivalents).",
        distractorLogic: ["Metaphase I (chromosomes align, but crossing over already done)", "Prophase II (no homologs paired)"],
        difficulty: "medium",
        type: "concept_check",
      },
      {
        stem: "A monohybrid cross between two Aa heterozygotes is performed. What fraction of offspring will have the recessive phenotype?",
        answerLogic: "Aa × Aa → AA:Aa:aa = 1:2:1. Recessive phenotype (aa) = 1/4 = 25%.",
        distractorLogic: ["50% (Aa × aa cross, not Aa × Aa)", "75% (dominant phenotype frequency)"],
        difficulty: "easy",
        type: "application",
      },
    ],
  },
  gene_expression: {
    stems: [
      {
        stem: "During translation, which molecule reads the mRNA codon and delivers the correct amino acid?",
        answerLogic: "tRNA (transfer RNA) has an anticodon that base-pairs with the mRNA codon and carries the corresponding amino acid to the ribosome.",
        distractorLogic: ["rRNA (structural component of ribosome)", "mRNA (carries the codon, does not deliver amino acid)"],
        difficulty: "easy",
        type: "concept_check",
      },
      {
        stem: "The coding strand of a DNA template has the sequence 5'-ATGCCC-3'. What is the mRNA sequence?",
        answerLogic: "The mRNA sequence is identical to the coding strand, replacing T with U: 5'-AUGCCC-3'.",
        distractorLogic: ["3'-UACGGG-5' (complementary to mRNA, not the mRNA itself)", "5'-TACGGG-3' (DNA coding strand with T instead of U)"],
        difficulty: "medium",
        type: "concept_check",
      },
    ],
  },
  membranes_transport: {
    stems: [
      {
        stem: "A red blood cell is placed in a solution with a solute concentration higher than the cell's cytoplasm. What happens?",
        answerLogic: "The cell is in a hypertonic solution. Water moves OUT of the cell by osmosis (toward higher solute concentration outside), causing the cell to crenate (shrink).",
        distractorLogic: ["Cell lyses (occurs in hypotonic solution)", "No change (occurs in isotonic solution)"],
        difficulty: "medium",
        type: "application",
      },
      {
        stem: "Which of the following transport processes requires ATP?",
        answerLogic: "Active transport requires ATP to move solutes AGAINST their concentration gradient (e.g., Na⁺/K⁺ ATPase).",
        distractorLogic: ["Facilitated diffusion (no ATP, uses carriers/channels, with gradient)", "Simple diffusion (no ATP, no protein)"],
        difficulty: "easy",
        type: "comparison",
      },
    ],
  },
  physiology_endocrine: {
    stems: [
      {
        stem: "Which class of hormones binds to cell surface receptors and acts through second messenger cascades?",
        answerLogic: "Peptide (protein) hormones are hydrophilic and cannot cross the plasma membrane. They bind surface receptors and activate intracellular cascades (e.g., cAMP via adenylyl cyclase).",
        distractorLogic: ["Steroid hormones (lipophilic, cross membrane, bind nuclear receptors)", "Thyroid hormones (lipophilic, similar to steroids)"],
        difficulty: "medium",
        type: "comparison",
      },
    ],
  },
  physiology_nervous: {
    stems: [
      {
        stem: "During the rising phase of an action potential, which ion rushes into the cell?",
        answerLogic: "Voltage-gated Na⁺ channels open during depolarization, allowing Na⁺ to rush IN, making the inside of the cell more positive.",
        distractorLogic: ["K⁺ flows in (K⁺ flows OUT during repolarization)", "Ca²⁺ (important in synaptic vesicle release, not action potential depolarization)"],
        difficulty: "easy",
        type: "mechanism",
      },
    ],
  },
};

export function buildBiologyQuestions(
  pdrm: PdrmBlock,
  traps: string[],
  topicFamily: DatTopicFamily,
  pageNumber: number
): DatQuestion[] {
  const questions: DatQuestion[] = [];
  let n = 1;

  // Topic-specific grounded questions
  const topicTemplate = TOPIC_QUESTIONS[topicFamily];
  if (topicTemplate) {
    for (const s of topicTemplate.stems.slice(0, 3)) {
      questions.push({
        id: qid(pageNumber, n++),
        type: s.type,
        stem: s.stem,
        answerLogic: s.answerLogic,
        distractorLogic: s.distractorLogic,
        difficulty: s.difficulty,
      });
    }
  }

  // PDRM-grounded question
  if (pdrm.pattern && questions.length < 4) {
    questions.push({
      id: qid(pageNumber, n++),
      type: "concept_check",
      stem: `Which of the following best describes: "${pdrm.pattern}"?`,
      answerLogic: pdrm.reason,
      distractorLogic: [pdrm.miss],
      difficulty: "medium",
    });
  }

  // Trap check question
  if (traps[0] && questions.length < 5) {
    questions.push({
      id: qid(pageNumber, n++),
      type: "trap_check",
      stem: `A student claims: "${traps[0].split(":")[0]}." What is wrong with this reasoning?`,
      answerLogic: traps[0],
      difficulty: "hard",
    });
  }

  return questions.slice(0, 5);
}
