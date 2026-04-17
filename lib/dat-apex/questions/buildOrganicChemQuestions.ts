// lib/dat-apex/questions/buildOrganicChemQuestions.ts

import type { DatQuestion, DatTopicFamily } from "../types";
import type { PdrmBlock } from "../types";

function qid(pageNumber: number, n: number): string {
  return `dat-orgo-${pageNumber}-${n}`;
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
  substitution_elimination: {
    stems: [
      {
        stem: "A primary alkyl bromide reacts with NaCN in DMSO. What is the most likely product and mechanism?",
        answerLogic: "SN2: primary substrate + strong nucleophile (CN⁻) + polar aprotic solvent (DMSO) = backside attack → nitrile product with inverted configuration.",
        distractorLogic: ["SN1 (requires tertiary substrate for stable carbocation)", "E2 (requires strong base; CN⁻ is a nucleophile, not primarily a base)"],
        difficulty: "medium",
        type: "mechanism",
      },
      {
        stem: "A tertiary alkyl bromide is treated with t-BuOK in t-BuOH. What is the major product?",
        answerLogic: "E2 elimination: tertiary substrate + bulky strong base (t-BuOK) + heat → alkene (Zaitsev product, more substituted). SN2 is blocked by sterics; SN1 would occur with weak nucleophile but base here favors elimination.",
        distractorLogic: ["SN2 product (backside attack blocked by three alkyl groups)", "SN1 product (t-BuOK is a strong base, not a weak nucleophile)"],
        difficulty: "hard",
        type: "product_prediction",
      },
      {
        stem: "Which solvent best promotes an SN2 reaction?",
        answerLogic: "Polar aprotic solvents (DMSO, DMF, acetone) do not hydrogen-bond to the nucleophile, leaving it bare and reactive. This maximizes nucleophilicity for SN2.",
        distractorLogic: ["Polar protic solvents (water, ethanol) solvate nucleophile → reduce reactivity → favor SN1/E1"],
        difficulty: "medium",
        type: "concept_check",
      },
    ],
  },
  stereochemistry: {
    stems: [
      {
        stem: "A chiral compound undergoes SN2 with a strong nucleophile. What is the stereochemical outcome?",
        answerLogic: "SN2 proceeds with inversion of configuration (Walden inversion) — the nucleophile attacks the backside of the C–LG bond, flipping the stereocenters' configuration from R to S or vice versa.",
        distractorLogic: ["Retention of configuration (SN1-type, not SN2)", "Racemization (SN1 with carbocation intermediate)"],
        difficulty: "medium",
        type: "mechanism",
      },
      {
        stem: "Which of the following is a meso compound?",
        answerLogic: "A meso compound has stereocenters but an internal mirror plane, making it achiral overall. E.g., (2R,3S)-tartaric acid. It is superimposable on its mirror image.",
        distractorLogic: ["A compound with one stereocenter (enantiomers, not meso)", "A pair of enantiomers (meso is a single compound)"],
        difficulty: "hard",
        type: "concept_check",
      },
    ],
  },
  alkenes: {
    stems: [
      {
        stem: "HBr adds to propene (CH₃CH=CH₂). What is the major product according to Markovnikov's rule?",
        answerLogic: "Markovnikov: H adds to the less substituted carbon (CH₂), Br adds to the more substituted carbon (CH₃CH–). Major product: 2-bromopropane.",
        distractorLogic: ["1-bromopropane (anti-Markovnikov product, requires radical/peroxide conditions)", "Equal mixture (applies only if both carbons are equally substituted)"],
        difficulty: "medium",
        type: "product_prediction",
      },
      {
        stem: "Which reagent would convert an alkene to a diol with SYN stereochemistry?",
        answerLogic: "OsO₄ (followed by H₂O₂ workup) or KMnO₄ (cold, dilute) gives syn dihydroxylation — both OH groups add to the same face.",
        distractorLogic: ["mCPBA gives epoxide (not diol directly)", "Br₂/H₂O gives bromohydrin (anti addition)"],
        difficulty: "hard",
        type: "product_prediction",
      },
    ],
  },
  aromatic: {
    stems: [
      {
        stem: "Toluene (methylbenzene) undergoes electrophilic aromatic substitution with Br₂/FeBr₃. Where is the major product substituted?",
        answerLogic: "The methyl group is an activating, ortho/para director. Major products are ortho- and para-bromotoluene.",
        distractorLogic: ["Meta-bromotoluene (meta is the product of deactivating, electron-withdrawing groups like NO₂, not alkyl groups)"],
        difficulty: "medium",
        type: "product_prediction",
      },
      {
        stem: "Chlorobenzene undergoes nitration (HNO₃/H₂SO₄). What is the major product?",
        answerLogic: "Cl is a deactivating but ortho/para director (deactivates ring via inductive withdrawal, but lone pairs donate via resonance → o/p). Major product: ortho- and para-chloronitrobenzene.",
        distractorLogic: ["Meta-chloronitrobenzene (meta is for purely deactivating/EW groups without lone pair donation, like NO₂)"],
        difficulty: "hard",
        type: "trap_check",
      },
    ],
  },
  carbonyl: {
    stems: [
      {
        stem: "Which compound is more reactive toward nucleophilic addition: acetaldehyde (ethanal) or acetone (propan-2-one)?",
        answerLogic: "Acetaldehyde (aldehyde) is more reactive. Aldehydes have less steric hindrance (one H vs. two alkyl groups in ketone) and the carbonyl is more electrophilic (alkyl groups donate electron density, reducing electrophilicity in ketones).",
        distractorLogic: ["Acetone is more reactive (false — the two methyl groups decrease electrophilicity)", "They are equally reactive (structural differences matter)"],
        difficulty: "medium",
        type: "comparison",
      },
      {
        stem: "What product is formed when an aldehyde reacts with two equivalents of an alcohol under acid catalysis?",
        answerLogic: "Acetal formation: aldehyde + 2 ROH → acetal + H₂O (under acid catalyst, reversible). The intermediate is a hemiacetal.",
        distractorLogic: ["Imine (requires primary amine, not alcohol)", "Enamine (requires secondary amine + ketone)"],
        difficulty: "medium",
        type: "product_prediction",
      },
    ],
  },
  carboxylic_derivatives: {
    stems: [
      {
        stem: "Which acyl compound is LEAST reactive toward nucleophilic acyl substitution?",
        answerLogic: "Amide. The nitrogen lone pair donates into the carbonyl via resonance, reducing carbonyl electrophilicity. Reactivity order: acid chloride > anhydride > ester > carboxylic acid > amide.",
        distractorLogic: ["Acid chloride (MOST reactive — best leaving group)", "Ester (moderately reactive — weaker alkoxide LG)"],
        difficulty: "medium",
        type: "comparison",
      },
    ],
  },
  acids_bases_orgo: {
    stems: [
      {
        stem: "Rank the following in order of increasing acidity: ethanol (pKa ≈ 16), acetic acid (pKa ≈ 5), phenol (pKa ≈ 10), acetylene (pKa ≈ 25).",
        answerLogic: "Increasing acidity (lowest pKa = strongest acid): acetylene (25) < ethanol (16) < phenol (10) < acetic acid (5). Acetic acid strongest because resonance-stabilized conjugate base. Acetylene weakest in this group but more acidic than alkane C–H.",
        distractorLogic: ["Ranking by bond polarity alone ignores conjugate base stability and resonance effects"],
        difficulty: "hard",
        type: "comparison",
      },
    ],
  },
  alkyl_halides: {
    stems: [
      {
        stem: "Which alkyl halide is the best substrate for an SN2 reaction?",
        answerLogic: "Primary alkyl halides (especially CH₃X and RCH₂X) are best for SN2 — minimal steric hindrance allows backside attack. Among halogens, iodide is the best leaving group (weakest conjugate base of HI).",
        distractorLogic: ["Tertiary alkyl halide (sterically blocked for SN2)", "Fluoride (worst leaving group — C–F bond too strong)"],
        difficulty: "medium",
        type: "concept_check",
      },
    ],
  },
};

export function buildOrganicChemQuestions(
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
      type: "mechanism",
      stem: `A student encounters: "${pdrm.pattern}." What decision process should they follow?`,
      answerLogic: `${pdrm.decision} — ${pdrm.reason}`,
      distractorLogic: [pdrm.miss],
      difficulty: "medium",
    });
  }

  if (traps[0] && questions.length < 5) {
    questions.push({
      id: qid(pageNumber, n++),
      type: "trap_check",
      stem: `True or False: "${traps[0].split(":")[0]}." Explain.`,
      answerLogic: traps[0],
      difficulty: "hard",
    });
  }

  return questions.slice(0, 5);
}
