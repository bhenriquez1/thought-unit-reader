// lib/reader/semanticPackResolver.ts
// Resolves the active SemanticPack from a DomainPreset id (e.g. "dental_school",
// "chemistry") or SemanticDomain string. Falls back to UNIVERSAL_PACK when no
// matching subject pack exists.
//
// This bridges the two existing layer systems:
//   Layer 1: DomainPreset (lib/insights/domainPresets.ts) — presentation presets
//   Layer 2: SemanticPack (lib/semantic/packs/) — canonical type label definitions
//
// Phase 3 uses SemanticPack labels to drive the adaptive left panel sections.

import type { SemanticPack } from "@/lib/semantic/types";
import { UNIVERSAL_PACK } from "@/lib/semantic/packs/universal";
import { DENTISTRY_PACK } from "@/lib/semantic/packs/dentistry";
import { GENERAL_CHEMISTRY_PACK } from "@/lib/semantic/packs/generalChemistry";

// Registry of all available semantic packs, keyed by their domain id.
const PACK_REGISTRY: Record<string, SemanticPack> = {
  universal:          UNIVERSAL_PACK,
  general:            UNIVERSAL_PACK,
  dentistry:          DENTISTRY_PACK,
  "general-chemistry": GENERAL_CHEMISTRY_PACK,
  "organic-chemistry": UNIVERSAL_PACK,
  biology:            UNIVERSAL_PACK,
  medicine:           UNIVERSAL_PACK,
  physics:            UNIVERSAL_PACK,
  anatomy:            UNIVERSAL_PACK,
  law:                UNIVERSAL_PACK,
  history:            UNIVERSAL_PACK,
  finance:            UNIVERSAL_PACK,
  "computer-science": UNIVERSAL_PACK,
  fiction:            UNIVERSAL_PACK,
};

// Mapping from DomainPreset.id strings (Layer 1) to SemanticDomain strings (Layer 2).
const PRESET_TO_DOMAIN: Record<string, string> = {
  dat:                  "universal",
  dental_school:        "dentistry",
  chemistry:            "general-chemistry",
  biology:              "biology",
  physics:              "physics",
  medical_surgical:     "medicine",
  nursing_pharmacology: "medicine",
  computer_science:     "computer-science",
  law:                  "law",
  business:             "finance",
  fiction:              "fiction",
  humanities:           "universal",
  math:                 "universal",
  notes:                "universal",
  pilot:                "universal",
  engineering:          "universal",
  architecture:         "universal",
};

/**
 * Resolve the active SemanticPack from a DomainPreset.id or SemanticDomain string.
 * Falls back gracefully to UNIVERSAL_PACK for unknown values.
 */
export function resolveSemanticPack(presetIdOrDomain: string | null | undefined): SemanticPack {
  if (!presetIdOrDomain) return UNIVERSAL_PACK;
  // Try direct domain match first (e.g. "dentistry", "general-chemistry")
  if (PACK_REGISTRY[presetIdOrDomain]) return PACK_REGISTRY[presetIdOrDomain];
  // Try DomainPreset.id → domain mapping (e.g. "dental_school" → "dentistry")
  const domain = PRESET_TO_DOMAIN[presetIdOrDomain];
  if (domain && PACK_REGISTRY[domain]) return PACK_REGISTRY[domain];
  return UNIVERSAL_PACK;
}

/**
 * Look up the display label for a canonicalType within the given pack.
 * Falls back to the universal pack, then to a formatted version of the type string.
 */
export function resolveTypeLabel(
  canonicalType: string,
  pack: SemanticPack,
): { label: string; shortLabel: string; icon: string } {
  const def = pack.labels.find((l) => l.canonicalType === canonicalType)
    ?? UNIVERSAL_PACK.labels.find((l) => l.canonicalType === canonicalType);
  if (def) return { label: def.label, shortLabel: def.shortLabel, icon: def.icon };
  // Final fallback: title-case the hyphenated type string
  const label = canonicalType.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return { label, shortLabel: label.slice(0, 6), icon: "•" };
}
