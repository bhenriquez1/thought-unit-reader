// lib/dat-apex/questions/buildGeneralChemQuestions.ts

import type { DatQuestion, DatTopicFamily } from "../types";
import type { PdrmBlock } from "../types";

function qid(pageNumber: number, n: number): string {
  return `dat-gc-${pageNumber}-${n}`;
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
  acid_base: {
    stems: [
      {
        stem: "Which of the following pairs represents a conjugate acid-base pair?",
        answerLogic: "A conjugate acid-base pair differs by exactly one proton: e.g., HCO₃⁻/CO₃²⁻ or NH₄⁺/NH₃.",
        distractorLogic: ["H₂O and OH⁻ together with H₃O⁺ confuses students — H₂O/OH⁻ is one conjugate pair, H₂O/H₃O⁺ is another"],
        difficulty: "medium",
        type: "concept_check",
      },
      {
        stem: "A weak acid (pKa = 5.0) is titrated with NaOH. At the half-equivalence point, what is the pH?",
        answerLogic: "At the half-equivalence point, [HA] = [A⁻], so the Henderson-Hasselbalch equation gives pH = pKa = 5.0.",
        distractorLogic: ["pH = 7 (equivalence point of a strong acid — not applicable here)", "pH > 7 (would be after equivalence point)"],
        difficulty: "medium",
        type: "application",
      },
      {
        stem: "Which acid is stronger: HF (pKa = 3.2) or HCN (pKa = 9.2)?",
        answerLogic: "Lower pKa = stronger acid. HF (pKa 3.2) is ~10⁶ times stronger than HCN (pKa 9.2).",
        distractorLogic: ["HCN (pKa 9.2 is larger, meaning weaker)", "They are equal strength (pKa values are very different)"],
        difficulty: "easy",
        type: "comparison",
      },
    ],
  },
  equilibrium: {
    stems: [
      {
        stem: "At equilibrium, the reaction N₂(g) + 3H₂(g) ⇌ 2NH₃(g) is at equilibrium. What happens to the equilibrium position when pressure is increased?",
        answerLogic: "Increasing pressure shifts toward fewer moles of gas. Reactants = 1 + 3 = 4 moles gas; products = 2 moles gas. Equilibrium shifts RIGHT (toward NH₃).",
        distractorLogic: ["Shifts left (would be if products had more moles of gas)", "No effect (would apply if Δn = 0)"],
        difficulty: "medium",
        type: "application",
      },
      {
        stem: "For an exothermic reaction at equilibrium, what happens to K when temperature is increased?",
        answerLogic: "Increasing temperature for an exothermic reaction shifts equilibrium LEFT (Le Chatelier: heat is a product). K decreases.",
        distractorLogic: ["K increases (that would be for endothermic reactions)", "K is unchanged (only temperature changes K — but direction depends on ΔH)"],
        difficulty: "hard",
        type: "concept_check",
      },
    ],
  },
  electrochemistry: {
    stems: [
      {
        stem: "In a galvanic cell with E°cell = +1.1 V, which statement is correct?",
        answerLogic: "Positive E°cell → spontaneous reaction → ΔG° = −nFE° < 0 → large K. The galvanic cell does electrical work spontaneously.",
        distractorLogic: ["E°cell > 0 means nonspontaneous (opposite)", "ΔG° is positive (wrong sign: ΔG° = −nFE°, positive E° gives negative ΔG°)"],
        difficulty: "medium",
        type: "concept_check",
      },
      {
        stem: "Which species is oxidized in the reaction: Zn(s) + Cu²⁺(aq) → Zn²⁺(aq) + Cu(s)?",
        answerLogic: "Zn is oxidized (loses electrons: Zn → Zn²⁺ + 2e⁻). Cu²⁺ is reduced (gains electrons: Cu²⁺ + 2e⁻ → Cu). OIL RIG.",
        distractorLogic: ["Cu²⁺ is oxidized (it gains electrons — that is reduction)", "Both species are oxidized (impossible in a redox reaction)"],
        difficulty: "easy",
        type: "mechanism",
      },
    ],
  },
  kinetics: {
    stems: [
      {
        stem: "The rate law for a reaction is rate = k[A]²[B]. If [A] is doubled and [B] is held constant, what happens to the rate?",
        answerLogic: "Rate is second order in A. Doubling [A] increases rate by 2² = 4-fold.",
        distractorLogic: ["Rate doubles (only if first order in A)", "Rate quadruples AND depends on [B] (B is first order, held constant so no effect)"],
        difficulty: "medium",
        type: "application",
      },
      {
        stem: "A catalyst is added to a reaction at equilibrium. What is the effect on K?",
        answerLogic: "A catalyst lowers activation energy and speeds up both forward and reverse reactions equally. K is unchanged. Equilibrium position does not shift.",
        distractorLogic: ["K increases (catalyst favors forward reaction — false)", "K decreases (catalyst favors reverse — false)"],
        difficulty: "medium",
        type: "trap_check",
      },
    ],
  },
  thermodynamics: {
    stems: [
      {
        stem: "A reaction has ΔH = +50 kJ/mol and ΔS = +200 J/mol·K. At 500 K, is the reaction spontaneous?",
        answerLogic: "ΔG = ΔH − TΔS = 50,000 − (500)(200) = 50,000 − 100,000 = −50,000 J/mol < 0. Spontaneous at 500 K.",
        distractorLogic: ["Nonspontaneous (incorrect: TΔS > ΔH so ΔG < 0)", "Units must match: ΔH in J, not kJ, when using ΔS in J/mol·K"],
        difficulty: "hard",
        type: "application",
      },
    ],
  },
  periodic_trends: {
    stems: [
      {
        stem: "Which element has the highest first ionization energy: Na, Mg, Al, or Cl?",
        answerLogic: "Cl has the highest ionization energy in this set. Ionization energy increases left → right across a period. Na is on the far left; Cl is near the right.",
        distractorLogic: ["Mg > Al (true locally due to filled 3s²)", "Na (lowest IE — readily loses its electron)"],
        difficulty: "medium",
        type: "comparison",
      },
    ],
  },
  stoichiometry: {
    stems: [
      {
        stem: "In the reaction 2H₂ + O₂ → 2H₂O, if 4 moles of H₂ react with 1 mole of O₂, which is the limiting reagent?",
        answerLogic: "Stoichiometry requires H₂:O₂ = 2:1. For 4 mol H₂, need 2 mol O₂, but only 1 mol O₂ available. O₂ is the limiting reagent.",
        distractorLogic: ["H₂ is limiting (we have excess H₂ relative to O₂)", "Neither is limiting (we need to check the mole ratio, not just amounts)"],
        difficulty: "medium",
        type: "application",
      },
    ],
  },
};

export function buildGeneralChemQuestions(
  pdrm: PdrmBlock,
  traps: string[],
  topicFamily: DatTopicFamily,
  pageNumber: number
): DatQuestion[] {
  const questions: DatQuestion[] = [];
  let n = 1;

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

  if (pdrm.pattern && questions.length < 4) {
    questions.push({
      id: qid(pageNumber, n++),
      type: "concept_check",
      stem: `Which of the following correctly describes: "${pdrm.pattern}"?`,
      answerLogic: pdrm.reason,
      distractorLogic: [pdrm.miss],
      difficulty: "medium",
    });
  }

  if (traps[0] && questions.length < 5) {
    questions.push({
      id: qid(pageNumber, n++),
      type: "trap_check",
      stem: `A student states: "${traps[0].split(".")[0]}." Is this correct? Explain.`,
      answerLogic: traps[0],
      difficulty: "hard",
    });
  }

  return questions.slice(0, 5);
}
