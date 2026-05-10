// lib/insights/science/normalizeScienceTitle.ts
// Science/biology-specific title normalization + Memory Hook extraction.
// Mirrors the pattern in lib/insights/math/extractMathConcepts.ts.

// Fragments that signal a broken science title — fall back to concept map
const BROKEN_SCIENCE_TITLE_RE =
  /^(figure|table|box|in fact|another|these are|this is|for example|such as|note that|they are|the following|it is|there are|there is|we can|we use|one of)\b/i;

// Map anchor text keywords to clean science concept titles
const SCIENCE_CONCEPT_MAP: Array<{ test: RegExp; title: string }> = [
  { test: /\bemergent\s+propert/i,      title: "Emergent Properties"     },
  { test: /\bcompound\b/i,              title: "Compound Properties"     },
  { test: /\belement\b.*\bperiodic/i,   title: "Periodic Table Elements" },
  { test: /\bwater\b.*\bh[₂2]o\b/i,    title: "Water (H₂O) Structure"  },
  { test: /\bwater\b.*\bpolar/i,        title: "Water Polarity"          },
  { test: /\bmolecule\b/i,              title: "Molecular Structure"     },
  { test: /\bcell\s+membrane\b/i,       title: "Cell Membrane"           },
  { test: /\bphospholipid/i,            title: "Phospholipid Bilayer"    },
  { test: /\bdna\b.*\breplicat/i,       title: "DNA Replication"         },
  { test: /\bdna\b/i,                   title: "DNA Structure"           },
  { test: /\bprotein\s+synthes/i,       title: "Protein Synthesis"       },
  { test: /\bprotein\b/i,               title: "Protein Function"        },
  { test: /\bphotosynthes/i,            title: "Photosynthesis"          },
  { test: /\bcellular\s+respir/i,       title: "Cellular Respiration"    },
  { test: /\bnatural\s+selection/i,     title: "Natural Selection"       },
  { test: /\bgenetic\s+inherit/i,       title: "Genetic Inheritance"     },
  { test: /\bgenetic/i,                 title: "Genetics"                },
  { test: /\bmitosis\b/i,               title: "Mitosis"                 },
  { test: /\bmeiosis\b/i,               title: "Meiosis"                 },
  { test: /\bactive\s+transport/i,      title: "Active Transport"        },
  { test: /\bosmosis\b/i,               title: "Osmosis"                 },
  { test: /\bdiffusion\b/i,             title: "Diffusion"               },
  { test: /\benz[yi]me\b.*\bactiv/i,    title: "Enzyme Activity"         },
  { test: /\benz[yi]me\b/i,             title: "Enzyme Function"         },
  { test: /\bevolution\b/i,             title: "Evolution"               },
  { test: /\bisotope\b/i,               title: "Isotopes"                },
  { test: /\batom\b.*\bstructure/i,     title: "Atomic Structure"        },
  { test: /\batom\b/i,                  title: "Atomic Structure"        },
  { test: /\bcovalent\b/i,              title: "Covalent Bonding"        },
  { test: /\bionic\s+bond/i,            title: "Ionic Bonds"             },
  { test: /\bhydrogen\s+bond/i,         title: "Hydrogen Bonds"          },
  { test: /\bcell\s+division\b/i,       title: "Cell Division"           },
  { test: /\bgene\s+express/i,          title: "Gene Expression"         },
  { test: /\bmutation\b/i,              title: "Mutation"                },
  { test: /\becosystem\b/i,             title: "Ecosystem Dynamics"      },
  { test: /\bfood\s+web\b/i,            title: "Food Web"                },
  { test: /\bpH\b/i,                    title: "pH and Acidity"          },
  { test: /\bacid.*\bbase\b/i,          title: "Acid-Base Chemistry"     },
  { test: /\belement\b/i,               title: "Chemical Elements"       },
];

/**
 * Returns a clean science concept title.
 * If rawTitle looks like a fragment, searches SCIENCE_CONCEPT_MAP against anchorText.
 * Falls back to the first 2 meaningful words from the anchor.
 */
export function normalizeScienceTitle(rawTitle: string, anchorText: string): string {
  if (BROKEN_SCIENCE_TITLE_RE.test(rawTitle.trim())) {
    for (const { test, title } of SCIENCE_CONCEPT_MAP) {
      if (test.test(anchorText)) return title;
    }
    const words = anchorText.trim().split(/\s+/).filter((w) => w.length >= 4);
    if (words.length >= 2) return words.slice(0, 2).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
    return "Biology Concept";
  }

  // Title looks OK — check if concept map gives a better match
  for (const { test, title } of SCIENCE_CONCEPT_MAP) {
    if (test.test(rawTitle) || test.test(anchorText)) return title;
  }

  return rawTitle;
}

// ---------------------------------------------------------------------------
// Example extraction (concrete instance with numbers or named examples)
// ---------------------------------------------------------------------------

// Signals that a sentence introduces a concrete example
const SCIENCE_EXAMPLE_RE =
  /\b(?:for example|for instance|such as|e\.g\.|consider|one example|like\s+(?:water|salt|oxygen|glucose|hemoglobin|carbon dioxide)|h[₂2]o\b|nacl\b|c[₆6]h[₁1][₂2]o[₆6]\b|\d+:\d+\s+ratio|\d+%\s+of)\b/i;

/**
 * Finds a concrete example sentence in anchorText or supportTexts.
 * Returns the first matching sentence trimmed to ≤ 18 words, or null.
 */
export function extractScienceExample(
  anchorText: string,
  supportTexts: string[]
): string | null {
  const candidates = [anchorText, ...supportTexts];
  for (const text of candidates) {
    const sentences = text.split(/(?<=[.!?])\s+/);
    for (const sentence of sentences) {
      if (SCIENCE_EXAMPLE_RE.test(sentence)) {
        const words = sentence.trim().split(/\s+/);
        if (words.length >= 4 && words.length <= 40) {
          const trimmed = words.slice(0, 18).join(" ").replace(/[.!?,;]$/, "").trim();
          return trimmed;
        }
      }
    }
  }
  return null;
}

// Patterns that signal an analogy or mnemonic sentence
const ANALOGY_RE =
  /\b(similar to|just like|think of|analogous to|just as\b|like a\b|like the\b|acts? like|works? like|functions? like|is like|are like|as if|can be compared)\b/i;

/**
 * Finds an analogy/mnemonic sentence in anchorText or supportTexts.
 * Returns the first matching sentence trimmed to ≤ 15 words, or null.
 */
export function extractScienceMemoryHook(
  anchorText: string,
  supportTexts: string[]
): string | null {
  const candidates = [anchorText, ...supportTexts];
  for (const text of candidates) {
    // Split on sentence boundaries
    const sentences = text.split(/(?<=[.!?])\s+/);
    for (const sentence of sentences) {
      if (ANALOGY_RE.test(sentence)) {
        const words = sentence.trim().split(/\s+/);
        return words.slice(0, 15).join(" ").replace(/[.!?,;]$/, "").trim();
      }
    }
  }
  return null;
}
