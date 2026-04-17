// lib/dat-apex/pdrm/buildOrganicChemPdrm.ts

import type { PdrmBlock, DatTopicFamily } from "../types";
import type { PageGraphInput } from "../buildDatApexPageModel";

function first(...candidates: Array<string | null | undefined>): string {
  for (const c of candidates) {
    const s = (c ?? "").trim();
    if (s) return s;
  }
  return "";
}

const TOPIC_PDRM: Partial<Record<DatTopicFamily, PdrmBlock>> = {
  substitution_elimination: {
    pattern: "SN1/SN2/E1/E2: mechanism determined by substrate, nucleophile/base strength, solvent, and sterics",
    decision: "Substrate class (1°/2°/3°)? Strong or weak nucleophile/base? Polar protic or aprotic solvent? Compete with elimination?",
    reason: "SN2: 1° substrate + strong Nu + polar aprotic (backside attack). SN1: 3° substrate + weak Nu + polar protic (carbocation). E2: strong base + 2°/3°. E1: weak base + 3°, carbocation.",
    miss: "Confusing strong nucleophile (favors substitution) with strong base (favors elimination). Using SN2 logic for 3° substrates (steric hindrance blocks backside attack).",
  },
  stereochemistry: {
    pattern: "Chirality → enantiomers / diastereomers. Configuration assigned by R/S priority (CIP rules).",
    decision: "How many stereocenters? Are the molecules mirror images? Does the reaction invert or retain configuration?",
    reason: "Enantiomers: same connectivity, non-superimposable mirror images. Diastereomers: same connectivity, not mirror images. SN2 = inversion. SN1 = racemization.",
    miss: "Treating all stereoisomers as enantiomers. Forgetting meso compounds (internal mirror plane → achiral despite stereocenters).",
  },
  alkenes: {
    pattern: "Alkene addition reactions: Markovnikov (H to less substituted C) vs. anti-Markovnikov (radical/peroxide pathway)",
    decision: "Which reagent? Which regiochemistry? Syn or anti addition? Does carbocation rearrangement occur?",
    reason: "Markovnikov: more substituted carbocation intermediate is more stable → H adds to less substituted carbon. HBr/peroxide: radical reverses regioselectivity.",
    miss: "Applying Markovnikov to radical (anti-Markovnikov) conditions. Forgetting syn addition (hydroboration, catalytic hydrogenation) vs. anti (halogenation, halohydrin).",
  },
  aromatic: {
    pattern: "EAS on benzene: activating groups (ortho/para directors) vs. deactivating groups (meta directors, except halogens)",
    decision: "Activating or deactivating substituent? Which positions are activated? What electrophile is used?",
    reason: "Electron-donating groups stabilize the arenium ion at o/p → direct o/p. Electron-withdrawing groups destabilize o/p → direct meta. Halogens: deactivate but o/p direct (lone pair donation).",
    miss: "Thinking all deactivating groups direct meta. Halogens are the exception: they deactivate via induction but direct o/p via resonance donation.",
  },
  carbonyl: {
    pattern: "Nucleophilic addition to aldehydes/ketones: Nu⁻ attacks electrophilic carbonyl carbon",
    decision: "Aldehyde or ketone (reactivity)? Which nucleophile? Acid or base conditions? Reversible or irreversible?",
    reason: "Aldehydes more reactive than ketones (less steric hindrance + electronic effects). HCN, Grignard, NaBH₄, LiAlH₄ give different products. Acetal formation = reversible with alcohol + acid catalyst.",
    miss: "Forgetting the reactivity order: RCHO > RCOR'. Using strong nucleophile in base to form acetal (requires acid catalyst). Confusing imine (from amines) with hemiacetal (from alcohols).",
  },
  carboxylic_derivatives: {
    pattern: "Acyl substitution reactivity order: acid anhydride > acid chloride > ester ≈ carboxylic acid > amide",
    decision: "Which derivative? Nucleophile: alcohol, amine, water? Acid or base conditions?",
    reason: "Better leaving groups = more reactive acyl compounds. Transesterification, hydrolysis, aminolysis follow same mechanism: tetrahedral intermediate → leaving group departure.",
    miss: "Confusing reactivity order (more reactive toward nucleophiles) with thermodynamic stability. Forgetting amide is the least reactive (nitrogen lone pair resonates into carbonyl).",
  },
  acids_bases_orgo: {
    pattern: "Organic acid strength: resonance stabilization of conjugate base > inductive effect > hybridization (sp > sp² > sp³) > electronegativity",
    decision: "Which functional group is more acidic? Which pKa is lower? Does electron withdrawal stabilize the anion?",
    reason: "Carboxylic acids (pKa ~5) > phenols (~10) > alcohols (~16) > terminal alkynes (~25) > amines (~35). Resonance most powerful, then induction, then hybridization.",
    miss: "Ranking by functional group alone without considering substituent effects (e.g., electron-withdrawing groups lower pKa of nearby OH). Forgetting sp-hybridized C–H is more acidic than sp³.",
  },
  alcohols_ethers_epoxides: {
    pattern: "Alcohols: oxidized (primary→aldehyde→acid; secondary→ketone). Epoxides: ring opening by Nu⁻ at less hindered C (basic) or more substituted C (acid)",
    decision: "Alcohol oxidation state? Which oxidizing agent (PCC, KMnO₄)? Epoxide—acidic or basic conditions?",
    reason: "PCC stops at aldehyde. KMnO₄ goes to carboxylic acid. Epoxide ring opening: acidic conditions → more substituted (carbocation character); basic conditions → less hindered (SN2).",
    miss: "Using KMnO₄ when aldehyde product is needed (it over-oxidizes). Applying SN2 regioselectivity to acid-catalyzed epoxide opening (should be SN1-like → more substituted).",
  },
  structure_bonding: {
    pattern: "Resonance, formal charge, and hybridization determine reactivity and stability",
    decision: "How many equivalent resonance structures? Which has lower formal charge? What is the hybridization of each atom?",
    reason: "More resonance contributors → more stable. Lower formal charge on more electronegative atom = better resonance structure. Hybridization: sp (linear), sp² (trigonal planar), sp³ (tetrahedral).",
    miss: "Treating resonance structures as separate molecules (they are one molecule's electron delocalization). Confusing resonance with tautomerism.",
  },
  alkyl_halides: {
    pattern: "Alkyl halides: site of substitution/elimination reactions; leaving group ability order: I⁻ > Br⁻ > Cl⁻ > F⁻",
    decision: "Primary, secondary, or tertiary? What is the leaving group? Strong nucleophile or strong base?",
    reason: "LG ability correlates with acid strength of conjugate acid (weaker acid = better leaving group in polar solvents). Strong Nu + 1° halide = SN2. Strong base = E2.",
    miss: "Ranking leaving groups by electronegativity alone (F is the worst LG despite being most electronegative—C–F bond too strong to break).",
  },
};

export function buildOrganicChemPdrm(
  graph: PageGraphInput,
  topicFamily: DatTopicFamily
): PdrmBlock {
  const template = TOPIC_PDRM[topicFamily];

  if (template) {
    return {
      pattern: first(graph.mainSignal, template.pattern),
      decision: first(graph.supportSignals?.[0], template.decision),
      reason: first(graph.supportSignals?.[1], template.reason),
      miss: first(graph.traps?.[0], template.miss),
    };
  }

  return {
    pattern: first(graph.mainSignal, graph.pageSummary, "Reaction family / mechanism pattern"),
    decision: first(
      graph.supportSignals?.[0],
      "Substrate class, nucleophile/base, solvent, leaving group, sterics."
    ),
    reason: first(
      graph.supportSignals?.[1],
      "Mechanism depends on carbocation stability, sterics, or electron density."
    ),
    miss: first(
      graph.traps?.[0],
      "Wrong mechanism, wrong product, or incorrect stereochemical outcome."
    ),
  };
}
