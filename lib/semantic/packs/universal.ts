// lib/semantic/packs/universal.ts
// Universal (Layer 1) semantic pack — structural concepts valid for any textbook.
//
// Subject packs extend these via canonicalType mapping. When a subject label is
// a precise specialisation of a universal label, show only the subject label.
// When both add distinct meaning, show both (up to the page cap).
//
// Icons: single emoji that reads clearly in light mode, dark mode, and dyslexia mode.
// Colors are NOT encoded here — KIND_COLORS in ThoughtUnitNavigator drives all color.

import type { SemanticPack, SemanticLabelDefinition } from "../types";

export const UNIVERSAL_LABELS: SemanticLabelDefinition[] = [
  {
    id: "universal:definition",
    canonicalType: "definition",
    label: "Definition",
    shortLabel: "Def",
    icon: "📖",
    priority: 1,
    maxPerPage: 6,
    requiresExactSourceSpan: true,
    allowPageSynthesis: false,
    examples: ["A catalyst is a substance that increases reaction rate without being consumed."],
  },
  {
    id: "universal:core-concept",
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
    id: "universal:process",
    canonicalType: "process",
    label: "Process",
    shortLabel: "Process",
    icon: "🔄",
    priority: 3,
    maxPerPage: 4,
    requiresExactSourceSpan: true,
    allowPageSynthesis: false,
  },
  {
    id: "universal:mechanism",
    canonicalType: "mechanism",
    label: "Mechanism",
    shortLabel: "Mech",
    icon: "⚙️",
    priority: 4,
    maxPerPage: 4,
    requiresExactSourceSpan: true,
    allowPageSynthesis: false,
  },
  {
    id: "universal:relationship",
    canonicalType: "relationship",
    label: "Relationship",
    shortLabel: "Rel",
    icon: "🔗",
    priority: 5,
    maxPerPage: 3,
    requiresExactSourceSpan: true,
    allowPageSynthesis: false,
  },
  {
    id: "universal:formula",
    canonicalType: "formula",
    label: "Formula",
    shortLabel: "Formula",
    icon: "🧮",
    priority: 3,
    maxPerPage: 5,
    requiresExactSourceSpan: true,
    allowPageSynthesis: false,
  },
  {
    id: "universal:worked-example",
    canonicalType: "worked-example",
    label: "Example",
    shortLabel: "Ex",
    icon: "📝",
    priority: 5,
    maxPerPage: 3,
    requiresExactSourceSpan: true,
    allowPageSynthesis: false,
  },
  {
    id: "universal:exception",
    canonicalType: "exception",
    label: "Exception",
    shortLabel: "Except",
    icon: "🚩",
    priority: 3,
    maxPerPage: 3,
    requiresExactSourceSpan: true,
    allowPageSynthesis: false,
  },
  {
    id: "universal:warning",
    canonicalType: "warning",
    label: "Warning",
    shortLabel: "Warn",
    icon: "⚠️",
    priority: 2,
    maxPerPage: 3,
    requiresExactSourceSpan: true,
    allowPageSynthesis: false,
  },
  {
    id: "universal:high-yield",
    canonicalType: "high-yield",
    label: "High Yield",
    shortLabel: "HY",
    icon: "🎯",
    priority: 1,
    maxPerPage: 4,
    requiresExactSourceSpan: true,
    allowPageSynthesis: true,
  },
];

export const UNIVERSAL_PACK: SemanticPack = {
  id: "universal",
  label: "Universal",
  labels: UNIVERSAL_LABELS,
  promptInstructions: [
    "Identify structural learning elements: definitions, core concepts, processes, mechanisms, relationships, formulas, examples, exceptions, warnings, and high-yield facts.",
    "Every highlight must be grounded in an exact source span from the text. Do not synthesise content that is not present.",
    "Assign one canonical type per highlight. Choose the most specific type that fits.",
  ],
  rankingRules: [
    { canonicalType: "definition",   boostFactor: 1.2, reason: "definitions anchor all other concepts" },
    { canonicalType: "core-concept", boostFactor: 1.3, reason: "page-level master idea" },
    { canonicalType: "warning",      boostFactor: 1.1, reason: "safety and danger flags" },
    { canonicalType: "exception",    boostFactor: 1.15, reason: "common source of exam errors" },
    { canonicalType: "high-yield",   boostFactor: 1.4, reason: "exam priority" },
  ],
  minimumConfidence: 0,
  fallbackPackId: "general",
  tierLabels: { master: "CORE", step: "STEP", decision: "APPLY", danger: "TRAP", pearl: "PEARL" },
  whiteboardGrammar: "flow",
};
