// lib/reader/semanticPackResolver.ts
// Resolves the active SemanticPack from a DomainPreset id (e.g. "dental_school",
// "chemistry") or SemanticDomain string. Falls back to UNIVERSAL_PACK when no
// matching subject pack exists.
//
// Layer 1: DomainPreset (lib/insights/domainPresets.ts) — presentation presets
// Layer 2: SemanticPack (lib/semantic/packs/) — canonical type + annotation pack

import type { SemanticPack } from "@/lib/semantic/types";
import { UNIVERSAL_PACK } from "@/lib/semantic/packs/universal";
import { GENERAL_PACK } from "@/lib/semantic/packs/general";
import { DENTISTRY_PACK } from "@/lib/semantic/packs/dentistry";
import { GENERAL_CHEMISTRY_PACK } from "@/lib/semantic/packs/generalChemistry";
import { BIOLOGY_PACK } from "@/lib/semantic/packs/biology";
import { MATHEMATICS_PACK } from "@/lib/semantic/packs/mathematics";
import { LAW_PACK } from "@/lib/semantic/packs/law";
import { HISTORY_PACK } from "@/lib/semantic/packs/history";

const PACK_REGISTRY: Record<string, SemanticPack> = {
  universal:           UNIVERSAL_PACK,
  general:             GENERAL_PACK,
  dentistry:           DENTISTRY_PACK,
  "general-chemistry": GENERAL_CHEMISTRY_PACK,
  "organic-chemistry": GENERAL_CHEMISTRY_PACK,
  biology:             BIOLOGY_PACK,
  medicine:            DENTISTRY_PACK,  // clinical lens is shared
  anatomy:             BIOLOGY_PACK,
  physics:             MATHEMATICS_PACK, // formula-heavy; worked-solution grammar
  law:                 LAW_PACK,
  history:             HISTORY_PACK,
  finance:             UNIVERSAL_PACK,
  "computer-science":  UNIVERSAL_PACK,
  fiction:             HISTORY_PACK,    // humanistic reading lens
};

// DomainPreset.id → SemanticDomain
const PRESET_TO_DOMAIN: Record<string, string> = {
  dat:                  "general-chemistry",
  dental_school:        "dentistry",
  chemistry:            "general-chemistry",
  biology:              "biology",
  physics:              "physics",
  math:                 "physics",
  medical_surgical:     "medicine",
  nursing_pharmacology: "medicine",
  computer_science:     "computer-science",
  law:                  "law",
  business:             "finance",
  fiction:              "fiction",
  humanities:           "history",
  notes:                "universal",
  pilot:                "universal",
  engineering:          "physics",
  architecture:         "universal",
};

export function resolveSemanticPack(presetIdOrDomain: string | null | undefined): SemanticPack {
  if (!presetIdOrDomain) return UNIVERSAL_PACK;
  if (PACK_REGISTRY[presetIdOrDomain]) return PACK_REGISTRY[presetIdOrDomain];
  const domain = PRESET_TO_DOMAIN[presetIdOrDomain];
  if (domain && PACK_REGISTRY[domain]) return PACK_REGISTRY[domain];
  return UNIVERSAL_PACK;
}

export function resolveTypeLabel(
  canonicalType: string,
  pack: SemanticPack,
): { label: string; shortLabel: string; icon: string } {
  const def = pack.labels.find((l) => l.canonicalType === canonicalType)
    ?? UNIVERSAL_PACK.labels.find((l) => l.canonicalType === canonicalType);
  if (def) return { label: def.label, shortLabel: def.shortLabel, icon: def.icon };
  const label = canonicalType.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return { label, shortLabel: label.slice(0, 6), icon: "•" };
}
