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
  memoryAnchor: "Memory Anchor",
  definition: "Definition",
  clinical: "Applied Note",
  comparison: "Comparison",
  formula: "Formula",
  reference: "Reference",
  filler: "Filler",
  dat_fact: "High Yield",
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
      { id: "high_yield_facts", label: "High-Yield Facts", kinds: ["dat_fact", "formula"] },
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
      { id: "anatomy", label: "Anatomy", kinds: ["definition"] },
      { id: "procedure_steps", label: "Procedure Steps", kinds: ["mechanism"] },
      { id: "danger_zones", label: "Danger Zones", kinds: ["trap"] },
      { id: "complications", label: "Complications", kinds: ["dat_fact", "formula"] },
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
      { id: "memory_items", label: "Memory Items", kinds: ["dat_fact"] },
      { id: "performance_calculations", label: "Performance Calculations", kinds: ["formula"] },
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
      { id: "materials", label: "Materials", kinds: ["definition"] },
      { id: "complications", label: "Complications", kinds: ["trap"] },
      { id: "clinical_pearls", label: "Clinical Pearls", kinds: ["dat_fact", "formula", "application", "clinical"] },
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
export function detectDomainPreset(bodyText: string, titleText?: string): string {
  const body = (bodyText || "").toLowerCase();
  const title = (titleText || "").toLowerCase();
  if (!body && !title) return UNIVERSAL_PRESET.id;

  let bestId = UNIVERSAL_PRESET.id;
  let bestScore = 0;
  for (const preset of DOMAIN_PRESETS) {
    let score = 0;
    for (const kw of preset.contentKeywords) {
      const re = new RegExp(`\\b${escapeRegExp(kw)}\\b`, "gi");
      score += body.match(re)?.length ?? 0;
    }
    for (const kw of preset.titleKeywords ?? []) {
      const re = new RegExp(`\\b${escapeRegExp(kw)}\\b`, "i");
      if (re.test(title)) score += 5;
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
