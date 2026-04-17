// lib/dat-apex/traps/buildOrganicChemTraps.ts

import type { DatTopicFamily } from "../types";

interface TrapEntry {
  signal: RegExp;
  trap: string;
}

const ORGO_TRAPS: TrapEntry[] = [
  {
    signal: /sn1|sn2|substitution/i,
    trap: "SN1 vs. SN2: SN1 requires tertiary substrate + polar protic solvent + weak nucleophile → racemization. SN2 requires primary substrate + polar aprotic + strong nucleophile → inversion of configuration. SN2 is blocked by tertiary substrates (steric hindrance).",
  },
  {
    signal: /e1|e2|elimination|base/i,
    trap: "E2 requires a strong base and proceeds with anti periplanar geometry (H and LG must be anti). E1 requires only a tertiary carbocation (weak base OK). Strong bulky base + 2°/3° substrate + heat → E2 over SN2.",
  },
  {
    signal: /nucleophil|base|strong|weak/i,
    trap: "Strong nucleophile ≠ strong base (though many are both). A bulky strong base (LDA, t-BuOK) favors elimination. A small strong nucleophile (CN⁻, I⁻) favors substitution. Polarity of solvent matters: polar aprotic (DMSO, DMF) enhances nucleophilicity.",
  },
  {
    signal: /markovnikov|anti.markovnikov|addition|alkene/i,
    trap: "Markovnikov: electrophilic addition — H adds to less-substituted carbon → most stable carbocation intermediate. Anti-Markovnikov: HBr with peroxides (radical mechanism) — Br adds to less-substituted carbon. Hydroboration: syn addition, anti-Markovnikov.",
  },
  {
    signal: /enantiomer|diastereomer|chiral|stereo|r.s|meso/i,
    trap: "Enantiomers: mirror images, same physical properties except optical rotation. Diastereomers: NOT mirror images, different physical properties. Meso compounds have stereocenters but are achiral due to internal mirror plane.",
  },
  {
    signal: /eas|aromatic|benzene|ortho|para|meta|director|activating|deactivating/i,
    trap: "Halogens are deactivating (inductive withdrawal) but ORTHO/PARA directors (lone pair donation via resonance). All other deactivating groups (NO₂, CN, COOH, CF₃) direct META.",
  },
  {
    signal: /carbonyl|aldehyde|ketone|nucleophilic addition/i,
    trap: "Aldehydes are more reactive than ketones toward nucleophilic addition: less steric hindrance + more electrophilic carbonyl carbon (less alkyl donation). Ketones are still reactive — just less so.",
  },
  {
    signal: /acetal|ketal|imine|enamine|hemiacetal/i,
    trap: "Acetal formation from aldehyde + 2 equivalents of alcohol requires ACID catalyst and removal of water (reversible). Imine formation from aldehyde + primary amine; enamine from ketone + secondary amine.",
  },
  {
    signal: /leaving group|fluorine|iodine|halide|cl|br|f/i,
    trap: "Leaving group ability order: I⁻ > Br⁻ > Cl⁻ >> F⁻. Fluorine is the WORST leaving group despite being the most electronegative — the C–F bond is too strong. Leaving group ability correlates with the stability (weakness) of the leaving anion as a conjugate base.",
  },
  {
    signal: /carboxylic|ester|amide|anhydride|acyl|reactivity/i,
    trap: "Acyl substitution reactivity: acid chloride > anhydride > ester ≈ acid > amide. Amide is LEAST reactive because nitrogen lone pair donates into carbonyl, reducing electrophilicity. Hydrolysis of amides requires harsh conditions (strong acid/base + heat).",
  },
  {
    signal: /resonance|stability|carbocation|carbanion/i,
    trap: "Carbocation stability: 3° > 2° > 1° > methyl. Carbanion stability (and acidity): sp > sp² > sp³ (more s-character holds electrons closer to nucleus). Resonance-stabilized carbocations/carbanions are more stable than simple alkyl ones.",
  },
  {
    signal: /rearrangement|hydride|methyl shift|carbocation/i,
    trap: "Carbocation rearrangements occur when a 1,2-hydride or 1,2-methyl shift would produce a MORE stable carbocation. Watch for rearrangements in SN1 and E1 reactions with 2° substrates adjacent to 3° carbons.",
  },
];

const TOPIC_TRAP_OVERRIDES: Partial<Record<DatTopicFamily, string[]>> = {
  substitution_elimination: [
    "The rate-determining step for SN1/E1 is carbocation formation (unimolecular). For SN2/E2 it is the concerted backside attack / anti-elimination step (bimolecular).",
    "Polar aprotic solvents (DMSO, DMF, acetone) enhance SN2 by not solvating the nucleophile. Polar protic solvents (water, alcohol) favor SN1/E1.",
  ],
  stereochemistry: [
    "SN2 = inversion (Walden inversion). SN1 = racemization (attack from both faces). E2 requires anti-periplanar arrangement — check dihedral angle.",
    "R/S priority uses CIP rules: higher atomic number = higher priority. If the lowest-priority group points away from you: clockwise = R, counterclockwise = S.",
  ],
  aromatic: [
    "Benzene undergoes substitution (EAS), NOT addition — addition would destroy aromaticity. Nucleophilic aromatic substitution (NAS) occurs only with strongly electron-withdrawing substituents.",
    "For disubstituted benzene: if substituents agree on position, that position is strongly activated. If they disagree, the activating group wins.",
  ],
  carbonyl: [
    "Aldol condensation: requires α-hydrogen. Enolate attacks carbonyl carbon of another molecule → β-hydroxy carbonyl. Dehydration gives α,β-unsaturated carbonyl (aldol condensation product).",
  ],
};

export function buildOrganicChemTraps(
  pageText: string,
  topicFamily: DatTopicFamily,
  explicitTraps: string[]
): string[] {
  const matched = ORGO_TRAPS.filter(({ signal }) => signal.test(pageText)).map(
    ({ trap }) => trap
  );

  const topicOverrides = TOPIC_TRAP_OVERRIDES[topicFamily] ?? [];

  const all = [
    ...new Set([...explicitTraps, ...topicOverrides, ...matched]),
  ];

  return all.slice(0, 4);
}
