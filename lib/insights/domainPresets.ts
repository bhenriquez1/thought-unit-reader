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
    thesis:      "Master This",
    definition:  "Master This",
    mechanism:   "Procedure Step",
    formula:     "Procedure Step",
    application: "Decision Point",
    comparison:  "Decision Point",
    keyDetail:   "Checkpoint",
    keyAnatomy:  "Decision Point",
    trap:        "Danger Zone",
    clinical:    "Pearl",
    memoryAnchor:"Pearl",
    dat_fact:    "Checkpoint",
  },
  kindGroups: [
    { id: "master",     label: "Master This",    kinds: ["thesis", "definition"] },
    { id: "procedure",  label: "Procedure Step", kinds: ["mechanism", "formula"] },
    { id: "decision",   label: "Decision Point", kinds: ["application", "comparison", "keyAnatomy"] },
    { id: "trap",       label: "Danger Zone",    kinds: ["trap"] },
    { id: "pearl",      label: "Pearl",          kinds: ["clinical", "memoryAnchor", "reference", "filler", "unknown"] },
    { id: "checkpoint", label: "Checkpoint",     kinds: ["dat_fact", "keyDetail"] },
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
      thesis:      "Master This",
      definition:  "Master This",
      mechanism:   "Procedure Step",
      formula:     "Procedure Step",
      application: "Decision Point",
      comparison:  "Decision Point",
      keyAnatomy:  "Decision Point",
      trap:        "Danger Zone",
      clinical:    "Clinical Pearl",
      memoryAnchor:"Clinical Pearl",
      dat_fact:    "Clinical Pearl",
      keyDetail:   "Clinical Pearl",
    },
    kindGroups: [
      { id: "master",          label: "Master This",    kinds: ["thesis", "definition"] },
      { id: "procedure_steps", label: "Procedure Step", kinds: ["mechanism", "formula"] },
      { id: "decision_points", label: "Decision Point", kinds: ["application", "comparison", "keyAnatomy"] },
      { id: "danger_zones",    label: "Danger Zone",    kinds: ["trap"] },
      { id: "pearls",          label: "Clinical Pearl", kinds: ["clinical", "memoryAnchor", "dat_fact", "keyDetail", "reference", "filler", "unknown"] },
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
      thesis:      "Core Concept",
      definition:  "Core Concept",
      mechanism:   "Mechanism",
      formula:     "Mechanism",
      application: "Cause and Effect",
      comparison:  "Cause and Effect",
      keyDetail:   "Cause and Effect",
      keyAnatomy:  "Cause and Effect",
      dat_fact:    "Key Fact",
      memoryAnchor:"Key Fact",
      trap:        "Exception",
      clinical:    "Exception",
    },
    kindGroups: [
      { id: "core_concept",    label: "Core Concept",    kinds: ["thesis", "definition"] },
      { id: "mechanism",       label: "Mechanism",       kinds: ["mechanism", "formula"] },
      { id: "cause_effect",    label: "Cause and Effect", kinds: ["application", "comparison", "keyDetail", "keyAnatomy"] },
      { id: "key_facts",       label: "Key Fact",        kinds: ["dat_fact", "memoryAnchor"] },
      { id: "exception",       label: "Exception",       kinds: ["trap", "clinical", "reference", "filler", "unknown"] },
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
      thesis:      "Rule",
      definition:  "Rule",
      formula:     "Formula",
      mechanism:   "Procedure Step",
      application: "Worked Example",
      clinical:    "Worked Example",
      trap:        "Common Error",
      dat_fact:    "Common Error",
      keyDetail:   "Common Error",
      memoryAnchor:"Common Error",
    },
    kindGroups: [
      { id: "formula",        label: "Formula",        kinds: ["formula"] },
      { id: "rule",           label: "Rule",           kinds: ["thesis", "definition"] },
      { id: "procedure_step", label: "Procedure Step", kinds: ["mechanism"] },
      { id: "worked_example", label: "Worked Example", kinds: ["application", "clinical"] },
      { id: "common_error",   label: "Common Error",   kinds: ["trap", "dat_fact", "keyDetail", "comparison", "keyAnatomy", "memoryAnchor", "reference", "filler", "unknown"] },
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
      thesis:      "Rule",
      definition:  "Element",
      mechanism:   "Element",
      comparison:  "Exception",
      trap:        "Exception",
      dat_fact:    "Holding",
      application: "Holding",
      clinical:    "Holding",
      keyDetail:   "Holding",
      memoryAnchor:"Holding",
      formula:     "Application",
      keyAnatomy:  "Application",
    },
    kindGroups: [
      { id: "rule",        label: "Rule",        kinds: ["thesis"] },
      { id: "element",     label: "Element",     kinds: ["definition", "mechanism"] },
      { id: "exception",   label: "Exception",   kinds: ["comparison", "trap"] },
      { id: "holding",     label: "Holding",     kinds: ["dat_fact", "application", "clinical", "keyDetail", "memoryAnchor"] },
      { id: "application", label: "Application", kinds: ["formula", "keyAnatomy", "reference", "filler", "unknown"] },
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
  {
    id: "business",
    label: "Business / Economics",
    description: "Business, economics, management, marketing — decisions, strategy, models.",
    titleKeywords: ["business", "economics", "management", "finance", "marketing", "strategy", "entrepreneurship"],
    contentKeywords: [
      "revenue", "profit", "market", "strategy", "consumer", "supply", "demand",
      "investment", "competitive", "firm", "stakeholder", "growth", "leadership", "value",
    ],
    kindLabels: {
      thesis:       "Principle",
      definition:   "Principle",
      mechanism:    "Strategy",
      formula:      "Strategy",
      application:  "Decision",
      comparison:   "Decision",
      keyAnatomy:   "Decision",
      trap:         "Risk",
      dat_fact:     "Metric",
      keyDetail:    "Metric",
      clinical:     "Metric",
      memoryAnchor: "Metric",
    },
    kindGroups: [
      { id: "principle", label: "Principle", kinds: ["thesis", "definition"] },
      { id: "strategy",  label: "Strategy",  kinds: ["mechanism", "formula"] },
      { id: "decision",  label: "Decision",  kinds: ["application", "comparison", "keyAnatomy"] },
      { id: "risk",      label: "Risk",      kinds: ["trap"] },
      { id: "metric",    label: "Metric",    kinds: ["dat_fact", "keyDetail", "clinical", "memoryAnchor", "reference", "filler", "unknown"] },
    ],
  },
  {
    id: "humanities",
    label: "Humanities",
    description: "History, philosophy, political science, sociology — arguments, evidence, context.",
    titleKeywords: ["history", "philosophy", "political science", "sociology", "anthropology", "humanities", "rhetoric"],
    contentKeywords: [
      "argument", "evidence", "perspective", "analysis", "critique", "theory",
      "historical", "cultural", "society", "ideology", "narrative", "discourse",
    ],
    kindLabels: {
      thesis:       "Thesis",
      definition:   "Thesis",
      mechanism:    "Evidence",
      dat_fact:     "Evidence",
      application:  "Theme",
      keyDetail:    "Theme",
      keyAnatomy:   "Theme",
      comparison:   "Counterargument",
      trap:         "Counterargument",
      clinical:     "Interpretation",
      memoryAnchor: "Interpretation",
      formula:      "Evidence",
    },
    kindGroups: [
      { id: "thesis",          label: "Thesis",          kinds: ["thesis", "definition"] },
      { id: "evidence",        label: "Evidence",        kinds: ["mechanism", "dat_fact", "formula"] },
      { id: "theme",           label: "Theme",           kinds: ["application", "keyDetail", "keyAnatomy"] },
      { id: "counterargument", label: "Counterargument", kinds: ["comparison", "trap"] },
      { id: "interpretation",  label: "Interpretation",  kinds: ["clinical", "memoryAnchor", "reference", "filler", "unknown"] },
    ],
  },
  {
    id: "notes",
    label: "Notes / Outline",
    description: "Lecture notes, class outlines, study guides — main points and details.",
    titleKeywords: ["notes", "lecture", "outline", "summary", "study guide"],
    contentKeywords: [
      "summary", "review", "note", "key point", "important", "remember",
      "chapter", "section", "overview", "highlight",
    ],
    kindLabels: {
      thesis:       "Main Point",
      definition:   "Main Point",
      mechanism:    "Detail",
      keyDetail:    "Detail",
      dat_fact:     "Key Fact",
      application:  "Example",
      clinical:     "Example",
      trap:         "Watch Out",
      memoryAnchor: "To Remember",
      formula:      "To Remember",
    },
    kindGroups: [
      { id: "main_points", label: "Main Point",  kinds: ["thesis", "definition"] },
      { id: "details",     label: "Detail",      kinds: ["mechanism", "keyDetail", "keyAnatomy"] },
      { id: "key_facts",   label: "Key Fact",    kinds: ["dat_fact", "comparison", "formula"] },
      { id: "examples",    label: "Example",     kinds: ["application", "clinical"] },
      { id: "watch_out",   label: "Watch Out",   kinds: ["trap"] },
      { id: "to_remember", label: "To Remember", kinds: ["memoryAnchor", "reference", "filler", "unknown"] },
    ],
  },
  {
    id: "engineering",
    label: "Engineering",
    description: "Engineering coursework — principles, constraints, design decisions, failure modes.",
    titleKeywords: ["engineering", "mechanical engineering", "civil engineering", "electrical engineering", "structural engineering"],
    contentKeywords: [
      "stress", "strain", "load", "material", "design", "constraint", "failure mode",
      "safety factor", "torque", "circuit", "resistance", "structural", "truss", "beam",
    ],
    kindLabels: {
      thesis:      "Principle",
      definition:  "Principle",
      mechanism:   "Design Step",
      formula:     "Formula",
      application: "Worked Example",
      clinical:    "Worked Example",
      trap:        "Failure Mode",
      dat_fact:    "Safety Factor",
      keyDetail:   "Constraint",
      memoryAnchor:"Key Pattern",
      keyAnatomy:  "System Component",
    },
    kindGroups: [
      { id: "principle",      label: "Principle",      kinds: ["thesis", "definition"] },
      { id: "formula",        label: "Formula",         kinds: ["formula"] },
      { id: "design_step",    label: "Design Step",     kinds: ["mechanism"] },
      { id: "worked_example", label: "Worked Example",  kinds: ["application", "clinical"] },
      { id: "failure_mode",   label: "Failure Mode",    kinds: ["trap"] },
      { id: "constraint",     label: "Constraint",      kinds: ["dat_fact", "keyDetail", "keyAnatomy", "comparison", "memoryAnchor", "reference", "filler", "unknown"] },
    ],
  },
  {
    id: "architecture",
    label: "Architecture / Design",
    description: "Architecture and design — spatial relationships, structural systems, precedents.",
    titleKeywords: ["architecture", "architectural design", "urban planning", "building design"],
    contentKeywords: [
      "space", "form", "material", "structure", "facade", "program", "site",
      "precedent", "proportion", "enclosure", "circulation", "light", "spatial",
    ],
    kindLabels: {
      thesis:      "Design Principle",
      definition:  "Design Principle",
      mechanism:   "Spatial Relationship",
      formula:     "Structural System",
      application: "Precedent",
      clinical:    "Precedent",
      trap:        "Design Constraint",
      dat_fact:    "Material",
      keyDetail:   "Detail",
      keyAnatomy:  "Program Element",
      memoryAnchor:"Key Precedent",
    },
    kindGroups: [
      { id: "principle",         label: "Design Principle",    kinds: ["thesis", "definition"] },
      { id: "spatial_relation",  label: "Spatial Relationship", kinds: ["mechanism"] },
      { id: "structural_system", label: "Structural System",    kinds: ["formula"] },
      { id: "precedent",         label: "Precedent",            kinds: ["application", "clinical", "memoryAnchor"] },
      { id: "design_constraint", label: "Design Constraint",    kinds: ["trap", "comparison"] },
      { id: "material_detail",   label: "Material / Detail",    kinds: ["dat_fact", "keyDetail", "keyAnatomy", "reference", "filler", "unknown"] },
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
