// lib/insights/buildCrossLinkHints.ts
// Heuristic cross-link hint generator.
// Layer 1: local prerequisite map (no session state needed)
// Layer 2: session registry lookup (optional — passed from ConceptRegistry context)

import type { PageDomain } from "./detectPageDomain";
import type { ConceptRegistry } from "./conceptRegistry";

export interface CrossLinkInput {
  title: string;
  anchorSentence?: string;
}

// Prerequisite map: concept → what it builds on.
// Kept flat (lowercase keys) for fast substring matching.
const PREREQUISITE_MAP: Record<string, string[]> = {
  // ── Math ──────────────────────────────────────────────────────────────────
  "convergence":            ["limit", "sequence"],
  "converges":              ["limit", "sequence"],
  "divergence":             ["limit", "sequence"],
  "diverges":               ["limit", "sequence"],
  "limit":                  ["sequence", "function"],
  "derivative":             ["limit", "rate of change"],
  "integral":               ["derivative", "area under curve"],
  "definite integral":      ["antiderivative", "riemann sum"],
  "fundamental theorem":    ["derivative", "integral"],
  "chain rule":             ["derivative", "composite function"],
  "series":                 ["sequence", "partial sum"],
  "taylor series":          ["derivative", "polynomial approximation"],
  "maclaurin":              ["taylor series", "derivative"],
  "differential equation":  ["derivative", "function"],
  "eigenvalue":             ["matrix", "linear transformation"],
  "linear transformation":  ["matrix", "vector space"],
  "continuous":             ["limit", "function"],
  "continuity":             ["limit", "function"],
  "differentiable":         ["continuous", "derivative"],
  "mean value theorem":     ["derivative", "continuous function"],
  "intermediate value":     ["continuous", "closed interval"],
  "l'hôpital":              ["derivative", "indeterminate form"],
  "probability":            ["sample space", "event"],
  "conditional probability":["probability", "independence"],
  "bayes":                  ["conditional probability", "prior probability"],

  // ── Science / Biology ─────────────────────────────────────────────────────
  "compound":               ["element", "emergent property"],
  "emergent property":      ["compound", "level of organization"],
  "cell membrane":          ["phospholipid bilayer", "selective permeability"],
  "osmosis":                ["concentration gradient", "membrane permeability"],
  "diffusion":              ["concentration gradient", "kinetic energy"],
  "active transport":       ["concentration gradient", "ATP"],
  "photosynthesis":         ["chlorophyll", "light reaction"],
  "cellular respiration":   ["glycolysis", "ATP"],
  "krebs cycle":            ["glycolysis", "acetyl-CoA"],
  "electron transport":     ["krebs cycle", "NADH"],
  "dna replication":        ["nucleotide", "polymerase"],
  "transcription":          ["dna", "rna polymerase"],
  "translation":            ["transcription", "ribosome"],
  "protein synthesis":      ["transcription", "translation"],
  "enzyme":                 ["substrate", "active site"],
  "enzyme kinetics":        ["enzyme", "michaelis-menten"],
  "natural selection":      ["variation", "inheritance"],
  "evolution":              ["natural selection", "genetic variation"],
  "mutation":               ["dna replication", "gene"],
  "meiosis":                ["mitosis", "homologous chromosomes"],
  "mitosis":                ["cell cycle", "chromosomes"],
  "membrane potential":     ["ion channel", "concentration gradient"],
  "action potential":       ["membrane potential", "sodium channel"],
  "synaptic transmission":  ["action potential", "neurotransmitter"],
  "hormone":                ["receptor", "signal transduction"],

  // ── Pharmacology ──────────────────────────────────────────────────────────
  "pharmacokinetics":       ["absorption", "distribution"],
  "bioavailability":        ["absorption", "first-pass metabolism"],
  "half-life":              ["elimination rate", "volume of distribution"],
  "receptor agonist":       ["receptor", "dose-response"],
  "receptor antagonist":    ["agonist", "receptor binding"],
  "enzyme inhibition":      ["enzyme", "competitive inhibition"],
  "cytochrome p450":        ["drug metabolism", "liver"],
  "drug interaction":       ["cytochrome p450", "enzyme inhibition"],
  "tolerance":              ["receptor downregulation", "chronic exposure"],
  "addiction":              ["tolerance", "dopamine pathway"],

  // ── Clinical / Medical ────────────────────────────────────────────────────
  "diagnosis":              ["differential diagnosis", "chief complaint"],
  "differential diagnosis": ["chief complaint", "history and physical"],
  "inflammation":           ["innate immunity", "cytokines"],
  "sepsis":                 ["infection", "inflammatory response"],
  "septic shock":           ["sepsis", "vasodilation"],
  "heart failure":          ["cardiac output", "preload"],
  "hypertension":           ["vascular resistance", "cardiac output"],
  "diabetes mellitus":      ["insulin", "glucose metabolism"],
  "diabetic ketoacidosis":  ["diabetes mellitus", "insulin deficiency"],
  "renal failure":          ["GFR", "creatinine clearance"],
  "coagulation":            ["platelet", "clotting cascade"],
  "thrombosis":             ["coagulation", "platelet aggregation"],
  "anemia":                 ["hemoglobin", "red blood cell production"],
  "hypoxia":                ["oxygen delivery", "hemoglobin"],
  "acid-base":              ["ph", "bicarbonate buffer"],
  "metabolic acidosis":     ["acid-base", "bicarbonate"],
  "respiratory acidosis":   ["acid-base", "co2 retention"],
  "pneumonia":              ["infection", "alveolar inflammation"],
  "myocardial infarction":  ["coronary artery disease", "ischemia"],
  "ischemia":               ["blood flow", "oxygen demand"],
  "stroke":                 ["thrombosis", "cerebral blood flow"],
};

export function buildCrossLinkHints(
  concepts: CrossLinkInput[],
  domain: PageDomain,
  registry?: ConceptRegistry,
): string[] {
  const hints: string[] = [];
  const seen = new Set<string>();

  // Tokens to match against: titles + key terms from anchor sentences
  const searchTokens = concepts.flatMap((c) => {
    const tokens = [c.title.toLowerCase()];
    if (c.anchorSentence) {
      // Extract meaningful noun phrases from anchor (words 5+ chars)
      const anchorTokens = c.anchorSentence.toLowerCase()
        .match(/\b[a-z]{5,}\b/g) ?? [];
      tokens.push(...anchorTokens);
    }
    return tokens;
  });

  // Layer 1: Local prerequisite map
  for (const [concept, prerequisites] of Object.entries(PREREQUISITE_MAP)) {
    if (!searchTokens.some((t) => t.includes(concept))) continue;
    for (const prereq of prerequisites) {
      // Skip if the prerequisite is already present on this page
      if (searchTokens.some((t) => t.includes(prereq.toLowerCase()))) continue;
      const hint = `${capitalize(concept)} builds on: ${prereq}`;
      if (!seen.has(hint)) {
        seen.add(hint);
        hints.push(hint);
        if (hints.length >= 3) break;
      }
    }
    if (hints.length >= 3) break;
  }

  // Layer 2: Session registry — connect to concepts seen on earlier pages
  if (registry && hints.length < 3) {
    for (const concept of concepts) {
      const titleKey = concept.title.toLowerCase().slice(0, 40);
      // Look for matching prerequisite keys seen in registry
      for (const [mapKey, prereqs] of Object.entries(PREREQUISITE_MAP)) {
        if (!titleKey.includes(mapKey)) continue;
        for (const prereq of prereqs) {
          // Check registry for earlier pages that covered this prerequisite
          for (const [regKey, entries] of registry.entries()) {
            if (!regKey.includes(prereq.toLowerCase().slice(0, 30))) continue;
            const earliestPage = Math.min(...entries.map((e) => e.pageNumber));
            const hint = `${capitalize(concept.title)} — see "${capitalize(prereq)}" (p. ${earliestPage})`;
            if (!seen.has(hint)) {
              seen.add(hint);
              hints.push(hint);
              if (hints.length >= 3) return hints;
            }
          }
        }
      }
    }
  }

  return hints;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
