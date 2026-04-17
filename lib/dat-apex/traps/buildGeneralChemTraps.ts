// lib/dat-apex/traps/buildGeneralChemTraps.ts

import type { DatTopicFamily } from "../types";

interface TrapEntry {
  signal: RegExp;
  trap: string;
}

const GC_TRAPS: TrapEntry[] = [
  {
    signal: /equilibrium|kinetics|rate|catalyst/i,
    trap: "Equilibrium constant (K) says NOTHING about reaction rate. A large K means the reaction favors products at equilibrium — it does NOT mean the reaction is fast. A catalyst speeds up the rate but does NOT change K or ΔG.",
  },
  {
    signal: /acid|base|conjugate|stronger|weaker/i,
    trap: "Stronger acid → weaker conjugate base. Weaker acid → stronger conjugate base. Students frequently reverse this. HCl (strong acid) → Cl⁻ (weak conjugate base).",
  },
  {
    signal: /spontaneous|enthalpy|entropy|gibbs|delta g/i,
    trap: "Spontaneity is determined by ΔG = ΔH − TΔS, NOT by ΔH alone. An endothermic reaction (ΔH > 0) is spontaneous when TΔS > ΔH (i.e., at high temperature with positive ΔS).",
  },
  {
    signal: /le chatelier|equilibrium|shift|pressure|temperature/i,
    trap: "Temperature changes K itself (only temperature does). Adding reactants, removing products, or changing pressure shifts Q but does NOT change K. For exothermic reactions, increasing T shifts left AND lowers K.",
  },
  {
    signal: /periodic|radius|ionization|electronegativity|electron affinity/i,
    trap: "Atomic radius decreases left → right across a period (more nuclear charge). Atomic radius increases top → bottom in a group (more electron shells). Ionization energy and electronegativity are inversely related to atomic radius.",
  },
  {
    signal: /electrochemistry|redox|cell|anode|cathode|galvanic|electrolytic/i,
    trap: "Anode = oxidation (AnOx), Cathode = reduction (RedCat). In a galvanic cell, anode is negative; in electrolytic, anode is positive. E°cell = E°cathode − E°anode (subtracted, not added).",
  },
  {
    signal: /solubility|ksp|common ion|precipitate/i,
    trap: "Common ion effect: adding a common ion to a saturated solution decreases solubility (Le Chatelier shifts equilibrium left). More soluble salt does NOT always mean higher Ksp — depends on ion charges.",
  },
  {
    signal: /hybridization|vsepr|geometry|lone pair|bond angle/i,
    trap: "Lone pairs occupy more space than bonding pairs, compressing bond angles. NH₃ (sp³, 3 bonds + 1 LP) → ~107°. H₂O (sp³, 2 bonds + 2 LP) → ~104.5°. Electron geometry ≠ molecular geometry when lone pairs present.",
  },
  {
    signal: /kinetics|rate law|order|concentration|experiment/i,
    trap: "Rate law exponents are determined experimentally — they are NOT taken from stoichiometric coefficients in the balanced equation (except for elementary steps).",
  },
  {
    signal: /colligative|boiling point|freezing point|van.t.hoff|electrolyte/i,
    trap: "Colligative properties depend on the NUMBER of solute particles, not their identity. NaCl dissociates into 2 ions (i = 2), doubling the effect vs. a nonelectrolyte.",
  },
  {
    signal: /oxidation state|oxidation number/i,
    trap: "Free element oxidation state = 0. Monatomic ion = charge. O is usually −2 (except peroxide: −1). H is usually +1 (except metal hydride: −1). Sum of oxidation states in a compound = 0.",
  },
  {
    signal: /half.life|first order|second order|zero order/i,
    trap: "First-order half-life: t½ = 0.693/k — constant, independent of concentration. Second-order: t½ = 1/(k[A]₀) — depends on initial concentration. Zero-order: t½ = [A]₀/(2k).",
  },
];

const TOPIC_TRAP_OVERRIDES: Partial<Record<DatTopicFamily, string[]>> = {
  acid_base: [
    "pKa + pKb = 14 for a conjugate acid-base pair at 25°C. Lower pKa = stronger acid.",
    "Buffer capacity is greatest when pH = pKa (Henderson-Hasselbalch: pH = pKa + log([A⁻]/[HA])).",
  ],
  electrochemistry: [
    "Positive E°cell → spontaneous → ΔG° < 0 → large K. Negative E°cell → nonspontaneous.",
    "In electrolysis: the species with the MOST POSITIVE reduction potential is reduced at the cathode.",
  ],
  equilibrium: [
    "Only temperature changes K. Pressure changes shift position but not K (for gas-phase reactions).",
    "Kp = Kc(RT)^Δn, where Δn = moles gaseous products − moles gaseous reactants.",
  ],
  thermodynamics: [
    "At equilibrium, ΔG = 0 (not ΔG°). ΔG° tells you the equilibrium position; ΔG tells you which way the reaction will go from current conditions.",
  ],
};

export function buildGeneralChemTraps(
  pageText: string,
  topicFamily: DatTopicFamily,
  explicitTraps: string[]
): string[] {
  const matched = GC_TRAPS.filter(({ signal }) => signal.test(pageText)).map(
    ({ trap }) => trap
  );

  const topicOverrides = TOPIC_TRAP_OVERRIDES[topicFamily] ?? [];

  const all = [
    ...new Set([...explicitTraps, ...topicOverrides, ...matched]),
  ];

  return all.slice(0, 4);
}
