// lib/insights/domainPresets.ts
//
// Level 4 — Expert Mode: a presentation-layer skin over the existing
// ParagraphKind taxonomy. No new extraction/AI pipeline — domain presets
// just relabel/reprioritize the same kinds the synthesis step already
// produces, with a generic "universal" fallback for any book that doesn't
// match a known preset. Presets are plain data, so adding a new domain
// later is an array entry, never a new code branch.

import type { ParagraphKind } from "@/lib/readerContracts";

export const UNIVERSAL_KIND_LABELS: Record<ParagraphKind, string> = {
  thesis: "Core Idea",
  mechanism: "Mechanism",
  application: "Example",
  trap: "Trap",
  memoryAnchor: "Memory Hook",
  definition: "Definition",
  clinical: "Applied Note",
  comparison: "Comparison",
  formula: "Formula",
  reference: "Reference",
  filler: "Filler",
  dat_fact: "High Yield",
  keyDetail: "Key Detail",
  keyAnatomy: "Key Anatomy",
  unknown: "Other",
};

export interface KindGroup {
  id: string;
  label: string;
  kinds: ParagraphKind[];
}

export interface DomainPreset {
  id: string;
  label: string;
  description: string;
  /** Words checked against page/document text; each hit adds to the preset's detection score. */
  contentKeywords: string[];
  /** Words checked against a title/filename, if one is available; weighted higher than content hits. */
  titleKeywords?: string[];
  /** Overrides UNIVERSAL_KIND_LABELS for specific kinds. Kinds not listed fall back to the universal label. */
  kindLabels?: Partial<Record<ParagraphKind, string>>;
  /** Optional reordering of which kinds surface first in the navigator. Falls back to default order. */
  kindPriority?: ParagraphKind[];
  /**
   * Level 3 "expert navigation" grouping: merges several raw kinds into one
   * navigator section (e.g. DAT's "Concepts" section covers both thesis and
   * definition paragraphs). Every kind must still end up in some group, or
   * its thought units would silently disappear from the navigator. When a
   * preset omits this, the navigator falls back to one section per kind.
   */
  kindGroups?: KindGroup[];
}

export const UNIVERSAL_PRESET: DomainPreset = {
  id: "universal",
  label: "Universal (generic)",
  description: "Generic academic taxonomy — used when no domain preset is detected.",
  contentKeywords: [],
  kindLabels: {
    thesis:      "MASTER",
    definition:  "MASTER",
    mechanism:   "PROCEDURE",
    formula:     "PROCEDURE",
    application: "DECISION",
    comparison:  "DECISION",
    keyDetail:   "DECISION",
    keyAnatomy:  "DECISION",
    trap:        "TRAP",
    clinical:    "PEARL",
    memoryAnchor:"PEARL",
    dat_fact:    "PEARL",
  },
  kindGroups: [
    { id: "master",    label: "MASTER",    kinds: ["thesis", "definition"] },
    { id: "procedure", label: "PROCEDURE", kinds: ["mechanism", "formula"] },
    { id: "decision",  label: "DECISION",  kinds: ["application", "comparison", "keyDetail", "keyAnatomy"] },
    { id: "trap",      label: "TRAP",      kinds: ["trap"] },
    { id: "pearl",     label: "PEARL",     kinds: ["clinical", "memoryAnchor", "dat_fact", "reference", "filler", "unknown"] },
  ],
};

// Seed presets. Not an exhaustive or hard-coded list — this is meant to grow.
// Any book/domain that doesn't match one of these falls back to UNIVERSAL_PRESET.
//
// Each preset maps AT MOST ONE label onto each existing ParagraphKind — modes
// relabel, they never split or merge the underlying thought units. Some
// domains (e.g. pilot checklists' Normal/Abnormal/Emergency/Memory Item) name
// more categories than we have kinds for; those are collapsed onto the
// closest-fit kind rather than invented as new data.
export const DOMAIN_PRESETS: DomainPreset[] = [
  {
    id: "dat",
    label: "DAT (Dental Admission Test)",
    description: "Pre-dental standardized test prep — biology, chemistry, perceptual ability.",
    titleKeywords: ["dat", "dental admission test", "perceptual ability"],
    contentKeywords: [
      "dat", "perceptual ability", "quantitative reasoning", "reading comprehension",
      "biology section", "organic chemistry", "gen chem",
    ],
    kindLabels: {
      thesis: "Concept",
      dat_fact: "High-Yield Fact",
    },
    kindGroups: [
      { id: "concepts", label: "Concepts", kinds: ["thesis", "definition"] },
      { id: "mechanisms", label: "Mechanisms", kinds: ["mechanism"] },
      { id: "applications", label: "Applications", kinds: ["application", "clinical"] },
      { id: "traps", label: "Traps", kinds: ["trap"] },
      { id: "high_yield_facts", label: "High-Yield Facts", kinds: ["dat_fact", "formula", "keyDetail", "memoryAnchor"] },
    ],
  },
  {
    id: "medical_surgical",
    label: "Medical / Surgical",
    description: "Surgical or clinical training material — anatomy, procedures, complications.",
    titleKeywords: ["surgery", "surgical", "operative", "clinical"],
    contentKeywords: [
      "incision", "anesthesia", "postoperative", "complication", "procedure",
      "patient", "diagnosis", "suture", "indication", "contraindication", "anatomy",
    ],
    kindLabels: {
      definition: "Anatomy",
      mechanism: "Procedure Step",
      trap: "Danger Zone",
      dat_fact: "Complication",
    },
    kindGroups: [
      { id: "anatomy", label: "Anatomy", kinds: ["definition", "keyAnatomy"] },
      { id: "procedure_steps", label: "Procedure Steps", kinds: ["mechanism"] },
      { id: "danger_zones", label: "Danger Zones", kinds: ["trap"] },
      { id: "complications", label: "Complications", kinds: ["dat_fact", "formula", "keyDetail", "memoryAnchor"] },
      { id: "pearls", label: "Pearls", kinds: ["thesis", "application", "clinical"] },
    ],
  },
  {
    id: "pilot",
    label: "Aviation / Pilot",
    description: "Flight training material — checklists, performance calculations, regulations.",
    titleKeywords: ["pilot", "aviation", "faa", "flight"],
    contentKeywords: [
      "checklist", "airspeed", "altitude", "runway", "faa", "instrument",
      "crosswind", "fuel", "airspace", "atc",
    ],
    kindLabels: {
      thesis: "Normal",
      trap: "Abnormal / Emergency",
      dat_fact: "Memory Item",
      formula: "Performance Calculation",
    },
    kindGroups: [
      { id: "normal", label: "Normal", kinds: ["thesis", "definition"] },
      { id: "procedures", label: "Procedures", kinds: ["mechanism", "application", "clinical"] },
      { id: "abnormal_emergency", label: "Abnormal / Emergency", kinds: ["trap"] },
      { id: "memory_items", label: "Memory Items", kinds: ["dat_fact", "memoryAnchor"] },
      { id: "performance_calculations", label: "Performance Calculations", kinds: ["formula", "keyDetail"] },
    ],
  },
  {
    id: "dental_school",
    label: "Dental School",
    description: "Dental school coursework — diagnosis, treatment steps, materials, complications.",
    titleKeywords: ["dental", "dentistry", "endodontics", "periodontics"],
    contentKeywords: [
      "tooth", "enamel", "dentin", "pulp", "caries", "periodontal",
      "occlusion", "restoration", "endodontic",
    ],
    kindLabels: {
      thesis: "Diagnosis",
      mechanism: "Treatment Step",
      definition: "Material",
      trap: "Complication",
      dat_fact: "Clinical Pearl",
    },
    kindGroups: [
      { id: "diagnosis", label: "Diagnosis", kinds: ["thesis"] },
      { id: "treatment_steps", label: "Treatment Steps", kinds: ["mechanism"] },
      { id: "materials", label: "Materials", kinds: ["definition", "keyAnatomy"] },
      { id: "complications", label: "Complications", kinds: ["trap"] },
      { id: "clinical_pearls", label: "Clinical Pearls", kinds: ["dat_fact", "formula", "application", "clinical", "keyDetail", "memoryAnchor"] },
    ],
  },
  {
    id: "chemistry",
    label: "Chemistry",
    description: "Chemistry coursework — reactions, mechanisms, stoichiometry, equilibrium.",
    titleKeywords: ["chemistry", "organic chemistry", "biochemistry"],
    contentKeywords: [
      "reaction", "molecule", "compound", "reagent", "stoichiometry", "equilibrium",
      "acid", "base", "mole", "synthesis", "organic chemistry",
    ],
    kindLabels: {
      thesis: "Concept",
      mechanism: "Reaction Mechanism",
      trap: "Common Error",
      formula: "Equation",
      dat_fact: "Key Fact",
    },
    kindGroups: [
      { id: "concepts", label: "Concepts", kinds: ["thesis", "definition"] },
      { id: "reaction_mechanisms", label: "Reaction Mechanisms", kinds: ["mechanism"] },
      { id: "applications", label: "Applications", kinds: ["application", "clinical"] },
      { id: "common_errors", label: "Common Errors", kinds: ["trap"] },
      { id: "key_facts", label: "Key Facts", kinds: ["dat_fact", "formula", "keyDetail", "memoryAnchor"] },
    ],
  },
  {
    id: "physics",
    label: "Physics",
    description: "Physics coursework — mechanics, electromagnetism, derivations, formulas.",
    titleKeywords: ["physics", "mechanics", "electromagnetism", "thermodynamics"],
    contentKeywords: [
      "force", "velocity", "acceleration", "momentum", "energy", "vector",
      "newton", "circuit", "wave", "field", "thermodynamics",
    ],
    kindLabels: {
      thesis: "Principle",
      mechanism: "Derivation",
      trap: "Common Mistake",
      formula: "Formula",
      dat_fact: "Key Constant",
    },
    kindGroups: [
      { id: "principles", label: "Principles", kinds: ["thesis", "definition"] },
      { id: "derivations", label: "Derivations", kinds: ["mechanism"] },
      { id: "applications", label: "Applications", kinds: ["application", "clinical"] },
      { id: "common_mistakes", label: "Common Mistakes", kinds: ["trap"] },
      { id: "key_constants", label: "Key Constants", kinds: ["dat_fact", "formula", "keyDetail", "memoryAnchor"] },
    ],
  },
  {
    id: "biology",
    label: "Biology",
    description: "Biology coursework — pathways, structures, regulation, physiology.",
    titleKeywords: ["biology", "physiology", "genetics", "cell biology", "microbiology"],
    contentKeywords: [
      "cell", "organism", "gene", "protein", "enzyme", "pathway", "membrane",
      "mutation", "regulation", "metabolism", "evolution",
    ],
    kindLabels: {
      thesis: "Concept",
      mechanism: "Pathway",
      trap: "Common Error",
      formula: "Structure",
      dat_fact: "Key Fact",
    },
    kindGroups: [
      { id: "concepts", label: "Concepts", kinds: ["thesis", "definition"] },
      { id: "pathways", label: "Pathways & Function", kinds: ["mechanism"] },
      { id: "applications", label: "Applications", kinds: ["application", "clinical"] },
      { id: "common_errors", label: "Common Errors", kinds: ["trap"] },
      { id: "key_facts", label: "Key Facts / Structures", kinds: ["dat_fact", "formula", "keyDetail", "memoryAnchor"] },
    ],
  },
  {
    id: "math",
    label: "Mathematics",
    description: "Math coursework — theorems, proofs, equations, problem-solving.",
    titleKeywords: ["calculus", "algebra", "mathematics", "geometry", "statistics", "linear algebra"],
    contentKeywords: [
      "theorem", "proof", "equation", "function", "derivative", "integral",
      "limit", "matrix", "vector", "probability",
    ],
    kindLabels: {
      thesis: "Theorem",
      mechanism: "Proof Step",
      trap: "Common Mistake",
      formula: "Equation",
      dat_fact: "Key Identity",
    },
    kindGroups: [
      { id: "theorems", label: "Theorems & Assumptions", kinds: ["thesis", "definition"] },
      { id: "proof_steps", label: "Proof Steps", kinds: ["mechanism"] },
      { id: "worked_examples", label: "Worked Examples", kinds: ["application", "clinical"] },
      { id: "common_mistakes", label: "Common Mistakes", kinds: ["trap"] },
      { id: "key_identities", label: "Key Equations", kinds: ["dat_fact", "formula", "keyDetail", "memoryAnchor"] },
    ],
  },
  {
    id: "fiction",
    label: "Fiction / Literature",
    description: "Literary fiction — plot, character, theme, technique.",
    titleKeywords: ["novel", "fiction", "literature", "short story", "poetry"],
    contentKeywords: [
      "character", "plot", "theme", "narrator", "symbolism", "foreshadowing",
      "metaphor", "protagonist", "conflict", "setting",
    ],
    kindLabels: {
      thesis: "Theme",
      mechanism: "Plot Event",
      trap: "Foreshadowing",
      application: "Character Action",
      memoryAnchor: "Symbolism",
      dat_fact: "Emotional Shift",
    },
    kindGroups: [
      { id: "themes", label: "Themes", kinds: ["thesis", "definition"] },
      { id: "plot_events", label: "Plot Events", kinds: ["mechanism"] },
      { id: "character_actions", label: "Character Actions", kinds: ["application", "clinical"] },
      { id: "foreshadowing", label: "Foreshadowing & Symbolism", kinds: ["trap", "dat_fact"] },
      { id: "memory_anchors", label: "Key Moments", kinds: ["formula", "memoryAnchor", "keyDetail"] },
    ],
  },
  {
    id: "computer_science",
    label: "Computer Science / Programming",
    description: "CS coursework — algorithms, data structures, complexity, code.",
    titleKeywords: ["computer science", "programming", "algorithms", "software"],
    contentKeywords: [
      "algorithm", "function", "variable", "loop", "array", "complexity",
      "recursion", "compiler", "runtime", "data structure",
    ],
    kindLabels: {
      thesis: "Concept",
      mechanism: "Algorithm Step",
      trap: "Common Bug",
      formula: "Complexity",
      dat_fact: "Key Fact",
    },
    kindGroups: [
      { id: "concepts", label: "Concepts", kinds: ["thesis", "definition"] },
      { id: "algorithm_steps", label: "Algorithm Steps", kinds: ["mechanism"] },
      { id: "applications", label: "Applications", kinds: ["application", "clinical"] },
      { id: "common_bugs", label: "Common Bugs", kinds: ["trap"] },
      { id: "key_facts", label: "Key Facts", kinds: ["dat_fact", "formula", "keyDetail", "memoryAnchor"] },
    ],
  },
  {
    id: "law",
    label: "Law",
    description: "Law school coursework — rules, legal tests, holdings, pitfalls.",
    titleKeywords: ["law", "legal", "torts", "contracts"],
    contentKeywords: [
      "plaintiff", "defendant", "statute", "precedent", "liability",
      "jurisdiction", "tort", "contract", "clause", "court",
    ],
    kindLabels: {
      thesis: "Rule",
      mechanism: "Legal Test",
      trap: "Common Pitfall",
      definition: "Term",
      dat_fact: "Key Holding",
    },
    kindGroups: [
      { id: "rules", label: "Rules", kinds: ["thesis"] },
      { id: "legal_tests", label: "Legal Tests", kinds: ["mechanism"] },
      { id: "terms", label: "Terms", kinds: ["definition"] },
      { id: "common_pitfalls", label: "Common Pitfalls", kinds: ["trap"] },
      { id: "key_holdings", label: "Key Holdings", kinds: ["dat_fact", "formula", "application", "clinical", "keyDetail", "memoryAnchor"] },
    ],
  },
  {
    id: "nursing_pharmacology",
    label: "Nursing / Pharmacology",
    description: "Nursing and pharmacology coursework — drug classes, interventions, patient care.",
    titleKeywords: ["nursing", "pharmacology", "nclex"],
    contentKeywords: [
      "medication", "dosage", "nursing intervention", "side effect", "contraindication",
      "vital signs", "assessment", "drug class", "nclex",
    ],
    kindLabels: {
      thesis: "Concept",
      mechanism: "Mechanism of Action",
      trap: "Nursing Alert",
      dat_fact: "Key Fact",
      clinical: "Patient Care",
    },
    kindGroups: [
      { id: "concepts", label: "Concepts", kinds: ["thesis", "definition", "keyAnatomy"] },
      { id: "mechanisms_of_action", label: "Mechanisms of Action", kinds: ["mechanism"] },
      { id: "patient_care", label: "Patient Care", kinds: ["application", "clinical"] },
      { id: "nursing_alerts", label: "Nursing Alerts", kinds: ["trap"] },
      { id: "key_facts", label: "Key Facts", kinds: ["dat_fact", "formula", "keyDetail", "memoryAnchor"] },
    ],
  },
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Scores each preset's keywords against the given text and returns the
 * best-matching preset id, or "universal" if nothing clears the threshold.
 * Designed to run on whatever text is already on hand (page text, visible
 * thought-unit text) — no new API calls.
 */
/**
 * Scores each preset's keywords against the given text and returns the
 * best-matching preset id, or "universal" if nothing clears the threshold.
 *
 * Signal weights (strongest → weakest):
 *   filenameText   titleKeyword match  +10  (e.g. "DAT Prep.pdf" → dat preset immediately)
 *   filenameText   contentKeyword match +8  (e.g. "chemistry_notes.pdf")
 *   titleText      titleKeyword match   +5  (chapter heading)
 *   bodyText       contentKeyword match  +1 per occurrence (page body — many weak hits)
 */
export function detectDomainPreset(bodyText: string, titleText?: string, filenameText?: string): string {
  const body = (bodyText || "").toLowerCase();
  const title = (titleText || "").toLowerCase();
  // Normalise filename separators so "DAT-prep_notes.pdf" matches word boundaries
  const filename = (filenameText || "").toLowerCase().replace(/[_\-\.]/g, " ");
  if (!body && !title && !filename) return UNIVERSAL_PRESET.id;

  let bestId = UNIVERSAL_PRESET.id;
  let bestScore = 0;
  for (const preset of DOMAIN_PRESETS) {
    let score = 0;
    for (const kw of preset.contentKeywords) {
      const re = new RegExp(`\\b${escapeRegExp(kw)}\\b`, "gi");
      score += body.match(re)?.length ?? 0;
      // One-shot filename test (not count — filename is short)
      if (filename && new RegExp(`\\b${escapeRegExp(kw)}\\b`, "i").test(filename)) score += 8;
    }
    for (const kw of preset.titleKeywords ?? []) {
      const re = new RegExp(`\\b${escapeRegExp(kw)}\\b`, "i");
      if (re.test(title)) score += 5;
      if (filename && re.test(filename)) score += 10;
    }
    if (score > bestScore) {
      bestScore = score;
      bestId = preset.id;
    }
  }
  // Threshold avoids a single stray keyword hit forcing a weak/wrong preset.
  return bestScore >= 2 ? bestId : UNIVERSAL_PRESET.id;
}

export function getDomainPreset(presetId: string): DomainPreset {
  return DOMAIN_PRESETS.find((p) => p.id === presetId) ?? UNIVERSAL_PRESET;
}

export function getKindLabel(presetId: string, kind: ParagraphKind): string {
  const preset = getDomainPreset(presetId);
  return preset.kindLabels?.[kind] ?? UNIVERSAL_KIND_LABELS[kind] ?? kind;
}

/** Level 3 grouping for a preset, or null when the preset has no kindGroups (falls back to one section per kind). */
export function getKindGroups(presetId: string): KindGroup[] | null {
  const preset = getDomainPreset(presetId);
  return preset.kindGroups ?? null;
}

/** Options for a manual override dropdown — "Universal" first, then seed presets. */
export function listDomainPresetOptions(): Array<{ id: string; label: string }> {
  return [UNIVERSAL_PRESET, ...DOMAIN_PRESETS].map((p) => ({ id: p.id, label: p.label }));
}

/** Default per-kind order when a preset has no kindGroups (and as the order strays append in within groupThoughtUnits). */
export const DEFAULT_KIND_ORDER: ParagraphKind[] = [
  "thesis", "dat_fact", "mechanism", "trap", "application", "definition", "clinical", "formula",
];

/**
 * Ordinal position of `kind` within a preset's domain-priority sequence —
 * the same kindGroups array order ThoughtUnitNavigator/ThoughtRoadmap use,
 * or DEFAULT_KIND_ORDER for presets without kindGroups (mirrors the universal
 * fallback exactly, so callers that don't pass a preset see unchanged ordering).
 * Lower index = higher priority. Kinds absent from the preset sort last.
 * Shared by the left-panel grouping and the speech engine's anchor ordering,
 * so both "views" agree on what's most important for a given domain.
 */
export function getKindPriorityIndex(presetId: string, kind: ParagraphKind): number {
  const kindGroups = getKindGroups(presetId);
  if (kindGroups) {
    const idx = kindGroups.findIndex((g) => g.kinds.includes(kind));
    return idx >= 0 ? idx : kindGroups.length;
  }
  const idx = DEFAULT_KIND_ORDER.indexOf(kind);
  return idx >= 0 ? idx : DEFAULT_KIND_ORDER.length;
}

export interface ThoughtUnitGroup<T> {
  id: string;
  /** Group label, or undefined when this is a per-kind fallback section (caller resolves via getKindLabel). */
  label: string | undefined;
  /** First kind in the group — used to pick a representative color. */
  representativeKind: ParagraphKind;
  items: T[];
}

/**
 * Shared Level 3 grouping logic used by both ThoughtUnitNavigator and the
 * Level 4 page roadmap, so the two views never disagree about which section
 * a thought unit belongs to. When the preset has kindGroups, any kind not
 * covered by one of them still gets its own section (keyed by the raw kind)
 * rather than silently disappearing — this is the completeness guarantee
 * the kindGroups field's doc comment promises.
 */
export function groupThoughtUnits<T extends { kind: ParagraphKind }>(
  entries: T[],
  presetId: string,
): ThoughtUnitGroup<T>[] {
  const kindGroups = getKindGroups(presetId);

  if (kindGroups) {
    const groupIdForKind = new Map<ParagraphKind, string>();
    for (const g of kindGroups) for (const k of g.kinds) groupIdForKind.set(k, g.id);

    const byGroup = new Map<string, T[]>();
    for (const e of entries) {
      const groupId = groupIdForKind.get(e.kind) ?? e.kind;
      const list = byGroup.get(groupId) ?? [];
      list.push(e);
      byGroup.set(groupId, list);
    }

    const defined: ThoughtUnitGroup<T>[] = kindGroups.map((g) => ({
      id: g.id,
      label: g.label,
      representativeKind: g.kinds[0],
      items: byGroup.get(g.id) ?? [],
    }));

    const definedIds = new Set(kindGroups.map((g) => g.id));
    const strays: ThoughtUnitGroup<T>[] = Array.from(byGroup.entries())
      .filter(([id]) => !definedIds.has(id))
      .map(([id, items]) => ({ id, label: undefined, representativeKind: id as ParagraphKind, items }));

    return [...defined, ...strays].filter((g) => g.items.length > 0);
  }

  const byKind = new Map<ParagraphKind, T[]>();
  for (const e of entries) {
    const list = byKind.get(e.kind) ?? [];
    list.push(e);
    byKind.set(e.kind, list);
  }
  return DEFAULT_KIND_ORDER
    .map((kind) => ({ id: kind, label: undefined, representativeKind: kind, items: byKind.get(kind) ?? [] }))
    .filter((g) => g.items.length > 0);
}
