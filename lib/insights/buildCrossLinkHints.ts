// lib/insights/buildCrossLinkHints.ts
// Heuristic cross-link hint generator — no session state required.
// Produces prerequisite-relationship hints from the current page's concept structure
// using a domain-specific knowledge map.

import type { PageDomain } from "./detectPageDomain";

export interface CrossLinkInput {
  title: string;
  anchorSentence?: string;
}

const PREREQUISITE_MAP: Record<string, string[]> = {
  // Math
  "convergence":        ["limit", "sequence"],
  "converges":          ["limit", "sequence"],
  "limit":              ["sequence", "function"],
  "derivative":         ["limit", "rate of change"],
  "integral":           ["derivative", "area under curve"],
  "series":             ["sequence", "partial sum"],
  "taylor":             ["derivative", "polynomial"],
  "differential equation": ["derivative", "function"],
  "eigenvalue":         ["matrix", "linear transformation"],
  "linear transformation": ["matrix", "vector space"],
  // Science / Biology
  "compound":           ["element", "emergent property"],
  "emergent property":  ["compound", "level of organization"],
  "cell membrane":      ["phospholipid bilayer", "selective permeability"],
  "osmosis":            ["concentration gradient", "membrane permeability"],
  "photosynthesis":     ["chlorophyll", "light reaction"],
  "cellular respiration": ["glycolysis", "ATP"],
  "dna replication":    ["nucleotide", "polymerase"],
  "protein synthesis":  ["transcription", "translation"],
  "enzyme":             ["substrate", "active site"],
  "natural selection":  ["variation", "inheritance"],
  // Clinical / Medical
  "diagnosis":          ["differential diagnosis", "chief complaint"],
  "inflammation":       ["innate immunity", "cytokines"],
  "sepsis":             ["infection", "inflammatory response"],
  "heart failure":      ["cardiac output", "preload"],
  "hypertension":       ["vascular resistance", "cardiac output"],
  "diabetes":           ["insulin", "glucose metabolism"],
  "renal failure":      ["GFR", "creatinine clearance"],
  "coagulation":        ["platelet", "clotting cascade"],
};

export function buildCrossLinkHints(
  concepts: CrossLinkInput[],
  _domain: PageDomain,
): string[] {
  const hints: string[] = [];
  const titleTokens = concepts.map((c) => c.title.toLowerCase());

  for (const [concept, prerequisites] of Object.entries(PREREQUISITE_MAP)) {
    if (!titleTokens.some((t) => t.includes(concept))) continue;
    for (const prereq of prerequisites) {
      if (titleTokens.some((t) => t.includes(prereq))) continue;
      hints.push(`${capitalize(concept)} builds on: ${prereq}`);
      if (hints.length >= 3) return hints;
    }
  }
  return hints;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
