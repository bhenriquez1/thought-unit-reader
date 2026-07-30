// lib/semantic/packs/generalChemistry.ts
// General Chemistry subject pack (Layer 2) — extends Universal for GChem
// textbooks and DAT General Chemistry review material.
//
// Activation: confidence ≥ 0.55 (tentative), ≥ 0.80 (full pack)
//
// Universal specialisations:
//   process   → Calculation Step
//   mechanism → Reaction Mechanism
//   warning   → Common Trap
//   high-yield → DAT High Yield
//   relationship → Trend / Relationship

import type { SemanticPack, SemanticLabelDefinition } from "../types";

const GENERAL_CHEMISTRY_LABELS: SemanticLabelDefinition[] = [
  {
    id: "general-chemistry:definition",
    canonicalType: "definition",
    label: "Definition",
    shortLabel: "Def",
    icon: "📖",
    priority: 1,
    maxPerPage: 5,
    requiresExactSourceSpan: true,
    allowPageSynthesis: false,
  },
  {
    id: "general-chemistry:core-concept",
    canonicalType: "core-concept",
    label: "Core Concept",
    shortLabel: "Core",
    icon: "⭐",
    priority: 2,
    maxPerPage: 3,
    requiresExactSourceSpan: true,
    allowPageSynthesis: false,
  },
  {
    id: "general-chemistry:formula",
    canonicalType: "formula",
    label: "Formula",
    shortLabel: "Formula",
    icon: "🧪",
    priority: 2,
    maxPerPage: 8,
    requiresExactSourceSpan: true,
    allowPageSynthesis: false,
  },
  {
    id: "general-chemistry:mechanism",
    canonicalType: "mechanism",
    label: "Reaction Mechanism",
    shortLabel: "Rxn",
    icon: "⚛️",
    priority: 3,
    maxPerPage: 4,
    requiresExactSourceSpan: true,
    allowPageSynthesis: false,
  },
  {
    id: "general-chemistry:process",
    canonicalType: "process",
    label: "Calculation Step",
    shortLabel: "Calc",
    icon: "🔢",
    priority: 3,
    maxPerPage: 6,
    requiresExactSourceSpan: true,
    allowPageSynthesis: false,
  },
  {
    id: "general-chemistry:worked-example",
    canonicalType: "worked-example",
    label: "Worked Example",
    shortLabel: "Ex",
    icon: "📝",
    priority: 4,
    maxPerPage: 3,
    requiresExactSourceSpan: true,
    allowPageSynthesis: false,
  },
  {
    id: "general-chemistry:exception",
    canonicalType: "exception",
    label: "Exception / Anomaly",
    shortLabel: "Anomaly",
    icon: "🚩",
    priority: 2,
    maxPerPage: 3,
    requiresExactSourceSpan: true,
    allowPageSynthesis: false,
    examples: ["Water is denser as a liquid than as a solid — opposite of most substances."],
  },
  {
    id: "general-chemistry:common-error",
    canonicalType: "common-error",
    label: "Common Trap",
    shortLabel: "Trap",
    icon: "⚠️",
    priority: 2,
    maxPerPage: 3,
    requiresExactSourceSpan: true,
    allowPageSynthesis: false,
  },
  {
    id: "general-chemistry:relationship",
    canonicalType: "relationship",
    label: "Trend / Relationship",
    shortLabel: "Trend",
    icon: "📈",
    priority: 4,
    maxPerPage: 4,
    requiresExactSourceSpan: true,
    allowPageSynthesis: false,
  },
  {
    id: "general-chemistry:high-yield",
    canonicalType: "high-yield",
    label: "DAT High Yield",
    shortLabel: "DAT HY",
    icon: "🎯",
    priority: 1,
    maxPerPage: 4,
    requiresExactSourceSpan: true,
    allowPageSynthesis: true,
  },
];

export const GENERAL_CHEMISTRY_PACK: SemanticPack = {
  id: "general-chemistry",
  label: "General Chemistry",
  labels: GENERAL_CHEMISTRY_LABELS,
  promptInstructions: [
    "Identify chemistry-specific elements: formulas (with variable definitions), reaction mechanisms, calculation steps, periodic trends, exceptions, and DAT high-yield facts.",
    "Formulas must include the variable definitions when present in the source text.",
    "Worked examples must use exact source text — do not reconstruct or paraphrase the steps.",
    "Distinguish trends (X increases as Y decreases) from exceptions (a substance that violates the trend).",
    "Flag any concept that commonly appears as a trap on the DAT as Common Trap.",
  ],
  rankingRules: [
    { canonicalType: "formula",      boostFactor: 1.4, reason: "chemistry is equation-driven" },
    { canonicalType: "exception",    boostFactor: 1.3, reason: "anomalies appear frequently on DAT" },
    { canonicalType: "common-error", boostFactor: 1.3, reason: "DAT traps are predictable" },
    { canonicalType: "high-yield",   boostFactor: 1.5, reason: "DAT priority" },
    { canonicalType: "mechanism",    boostFactor: 1.2, reason: "reaction logic is tested" },
    { canonicalType: "relationship", boostFactor: 1.1, reason: "periodic trends are heavily tested" },
  ],
  minimumConfidence: 0.55,
  fallbackPackId: "general",
  tierLabels: { master: "CONCEPT", step: "FORMULA", decision: "APPLY", danger: "ERROR", pearl: "EXAMPLE" },
  whiteboardGrammar: "pathway",
};
