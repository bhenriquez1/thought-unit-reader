// lib/dat-apex/pdrm/buildGeneralChemPdrm.ts

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
  acid_base: {
    pattern: "Acid-base strength correlates with conjugate base stability: resonance, electronegativity, inductive effect, orbital size",
    decision: "Which acid is stronger? Which conjugate base is more stable? What is the pH after mixing?",
    reason: "Stronger acid → weaker conjugate base. Stability of conjugate base predicts acid strength. Henderson-Hasselbalch for buffer calculations.",
    miss: "Reversing the relationship: thinking a stronger acid gives a stronger conjugate base. Also: confusing Ka with Kb; forgetting pKa + pKb = 14.",
  },
  equilibrium: {
    pattern: "Equilibrium: K = products/reactants (at equilibrium). Le Chatelier: system resists any change.",
    decision: "Which direction does the reaction shift? What changes K vs. what only shifts Q?",
    reason: "Adding reactants/removing products shifts right. Pressure increase shifts toward fewer moles of gas. Temperature changes K itself (only temperature does).",
    miss: "Thinking a catalyst shifts equilibrium (it only speeds reaching it). Confusing effect on rate with effect on equilibrium position.",
  },
  kinetics: {
    pattern: "Reaction rate depends on activation energy, concentration (rate law), and temperature (Arrhenius).",
    decision: "What is the rate order? What is the half-life formula? How does a catalyst work?",
    reason: "Rate = k[A]^m[B]^n. For first-order: t½ = 0.693/k (constant). Catalyst lowers Ea, does NOT change ΔH or K.",
    miss: "Using stoichiometric coefficients as rate-law exponents (they are empirically determined). Confusing kinetics (rate) with thermodynamics (spontaneity).",
  },
  electrochemistry: {
    pattern: "Galvanic cell: spontaneous redox → electrical work. Electrolytic: electrical work → nonspontaneous redox.",
    decision: "Which species is oxidized? Which is reduced? What is E°cell = E°cathode − E°anode?",
    reason: "OIL RIG. Higher reduction potential = stronger oxidizing agent (cathode). ΔG° = −nFE°. Positive E°cell → spontaneous.",
    miss: "Swapping anode (oxidation) and cathode (reduction). Forgetting the sign convention: E°cell = E°cathode − E°anode (NOT added).",
  },
  thermodynamics: {
    pattern: "ΔG = ΔH − TΔS determines spontaneity. ΔG < 0 = spontaneous.",
    decision: "Is ΔH negative or positive? Is ΔS positive or negative? At what temperature is the reaction spontaneous?",
    reason: "When ΔH < 0 and ΔS > 0: always spontaneous. When ΔH > 0 and ΔS < 0: never spontaneous. Temperature determines the winner in mixed cases.",
    miss: "Assuming exothermic means spontaneous (endothermic reactions can be spontaneous at high T when ΔS > 0).",
  },
  periodic_trends: {
    pattern: "Atomic radius ↑ down and ↑ right-to-left. Ionization energy and electronegativity are inverse.",
    decision: "Moving across a period or down a group? Which property follows which direction?",
    reason: "Across period: more protons pull electrons closer (radius ↓, IE ↑, EN ↑). Down group: more shells added (radius ↑, IE ↓, EN ↓).",
    miss: "Applying period trend to group or vice versa. Also: electron affinity anomalies at Group 2 (filled s) and Group 5 (half-filled p).",
  },
  stoichiometry: {
    pattern: "Mole ratios from balanced equations link reactants to products. Limiting reagent determines max yield.",
    decision: "Which reactant is limiting? What is the theoretical yield? What is percent yield?",
    reason: "Convert masses to moles, compare mole ratio to stoichiometry, identify limiting reagent, calculate product moles → grams.",
    miss: "Using mass ratio instead of mole ratio. Forgetting to identify limiting reagent before calculating yield.",
  },
  bonding: {
    pattern: "Bond polarity, formal charge, and resonance determine molecular properties.",
    decision: "Which bond is more polar? What is the formal charge? Which resonance structure is most stable?",
    reason: "Electronegativity difference → bond polarity. Formal charge = valence − nonbonding − ½(bonding). Lower formal charge = more stable resonance.",
    miss: "Confusing bond polarity with molecule polarity (symmetric polar bonds → nonpolar molecule). Mixing formal charge with oxidation state.",
  },
  molecular_geometry: {
    pattern: "VSEPR: electron geometry determined by all electron pairs; molecular geometry by bonded atoms only.",
    decision: "How many electron domains? Are there lone pairs? What hybridization and geometry result?",
    reason: "2 domains = linear (sp), 3 = trigonal planar (sp²), 4 = tetrahedral (sp³), 5 = trigonal bipyramidal (sp³d), 6 = octahedral (sp³d²). Lone pairs compress bond angles.",
    miss: "Using only bonded atoms to count electron domains. Forgetting that lone pairs compress bond angles (tetrahedral lone pairs → bent/pyramidal).",
  },
  gases: {
    pattern: "Ideal gas: PV = nRT. Real gases deviate at high P (volume > ideal) and low T (pressure < ideal).",
    decision: "Which variable changes? Constant T? Constant P? Which law applies?",
    reason: "Boyle's: P₁V₁ = P₂V₂ (const T). Charles's: V₁/T₁ = V₂/T₂ (const P). Dalton's: Ptotal = ΣPpartial. Graham's: rate ∝ 1/√M.",
    miss: "Using Celsius instead of Kelvin. Forgetting that partial pressures are additive, not multiplicative.",
  },
  solutions: {
    pattern: "Colligative properties depend on solute particle count, not identity: ΔTb, ΔTf, π, osmotic pressure.",
    decision: "How many particles does the solute dissociate into? Which colligative formula applies?",
    reason: "Strong electrolytes dissociate fully (NaCl → 2 ions, van't Hoff factor i = 2). Covalent solutes: i = 1. More particles → greater effect.",
    miss: "Forgetting the van't Hoff factor for ionic solutes. Confusing boiling point elevation (↑) with freezing point depression (↓).",
  },
  thermochemistry: {
    pattern: "Hess's Law: ΔH of a reaction = sum of ΔH of steps regardless of path.",
    decision: "Can you decompose the reaction into known steps? Which steps are reversed (flip sign)?",
    reason: "Enthalpy is a state function—path independent. Reverse a reaction: flip sign. Multiply by coefficient: multiply ΔH.",
    miss: "Forgetting to flip the sign when reversing a step. Treating bond energy as if formation enthalpy (they differ in sign convention).",
  },
};

export function buildGeneralChemPdrm(
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
    pattern: first(graph.mainSignal, graph.pageSummary, "Quantitative or conceptual chemistry relationship"),
    decision: first(
      graph.supportSignals?.[0],
      "What changes? What is the relationship? Which equation applies?"
    ),
    reason: first(
      graph.supportSignals?.[1],
      "Apply the underlying law, trend, or thermodynamic principle."
    ),
    miss: first(
      graph.traps?.[0],
      "Sign error, trend reversal, or mixing equilibrium with kinetics."
    ),
  };
}
