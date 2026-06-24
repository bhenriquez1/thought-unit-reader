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
