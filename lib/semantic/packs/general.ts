// lib/semantic/packs/general.ts
// General (fallback) pack — used when domain confidence < 0.55 or when no
// subject pack is registered for the detected domain.
// Shares the universal label set; no domain specialisation.

import type { SemanticPack } from "../types";
import { UNIVERSAL_LABELS } from "./universal";

export const GENERAL_PACK: SemanticPack = {
  id: "general",
  label: "General",
  labels: UNIVERSAL_LABELS,
  promptInstructions: [
    "Identify key learning elements: definitions, main ideas, processes, examples, warnings, and high-yield facts.",
    "Ground every highlight in an exact source span.",
  ],
  rankingRules: [
    { canonicalType: "definition",   boostFactor: 1.1 },
    { canonicalType: "core-concept", boostFactor: 1.2 },
    { canonicalType: "high-yield",   boostFactor: 1.3 },
  ],
  minimumConfidence: 0,
  fallbackPackId: "general",
  tierLabels: { master: "CORE", step: "STEP", decision: "APPLY", danger: "TRAP", pearl: "PEARL" },
  whiteboardGrammar: "flow",
};
