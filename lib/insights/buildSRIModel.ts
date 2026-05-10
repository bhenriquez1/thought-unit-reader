// lib/insights/buildSRIModel.ts
// Structural Reading Intelligence — classifies each paragraph into a reading mode
// so the right panel can show the reader exactly how to engage with each block.

import type { ParagraphInsight, ParagraphType } from "./types";
import type { PageDomain } from "./detectPageDomain";

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

export type ReadingDepth =
  | "deep_understand"  // must master — theorem, causal mechanism, core definition
  | "memorize"         // commit to memory — formula, key fact, signal
  | "understand"       // follow the logic — process, application, comparison
  | "clinical_logic"   // diagnostic mode — next step, finding, interpretation
  | "formula_logic"    // math theorem or formula — derive/apply
  | "exam_trap"        // high-alert pitfall — frequently tested confusion
  | "skim"             // context / background — read once, do not dwell
  | "example_only";    // worked example — follow if confused, skip if confident

export const SRI_META: Record<ReadingDepth, { icon: string; label: string; color: string; salience: number }> = {
  deep_understand: { icon: "🔥", label: "Deep Understand",  color: "#f59e0b", salience: 1.0  },
  memorize:        { icon: "📌", label: "Memorize",         color: "#818cf8", salience: 0.9  },
  clinical_logic:  { icon: "🏥", label: "Clinical Logic",   color: "#34d399", salience: 0.88 },
  formula_logic:   { icon: "∑",  label: "Formula Logic",    color: "#60a5fa", salience: 0.85 },
  exam_trap:       { icon: "⚠️", label: "Exam Trap",        color: "#f87171", salience: 0.95 },
  understand:      { icon: "🧠", label: "Understand",        color: "#a3e635", salience: 0.7  },
  skim:            { icon: "👀", label: "Skim",              color: "#94a3b8", salience: 0.3  },
  example_only:    { icon: "→",  label: "Example Only",     color: "#64748b", salience: 0.25 },
};

export interface ParagraphSRIAnnotation {
  paragraphIndex: number;
  text: string;
  depth: ReadingDepth;
  icon: string;
  depthLabel: string;
  color: string;
  salience: number;
}

export interface SRIModel {
  annotations: ParagraphSRIAnnotation[];
  primaryDepth: ReadingDepth;
  summary: string;
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

const TRAP_SIGNALS = /\b(common mistake|students often|frequently confused|do not confuse|easy to confuse|beware|trap|pitfall|commonly missed|incorrect to|wrong to assume|note:|careful:|important:)\b/i;
const FORMULA_SIGNALS = /\b(theorem|formula|proof|equation|corollary|lemma|derivative|integral|let\s+[a-z]\b|\\frac|[=∫∂∑]|\bln\b|\bcos\b|\bsin\b)\b/i;
const CLINICAL_SIGNALS = /\b(diagnosis|presents with|next step|treatment|management|differential|workup|rule out|indicated|contraindicated|first-line|pathophysiology|etiology)\b/i;
const MECHANISM_SIGNALS = /\b(because|therefore|leads to|results in|causes?|produces?|activates?|inhibits?|blocks?|stimulates?|mechanism)\b/i;
const DEFINITION_SIGNALS = /\b(is defined as|refers to|is the|is a|are the|consists of|is known as|is characterized by)\b/i;
const PROCESS_SIGNALS = /\b(first|then|next|finally|step|sequence|process|pathway|stage|phase|after|before|following)\b/i;

function classifyParagraphDepth(p: ParagraphInsight, domain: PageDomain): ReadingDepth {
  const text = (p.cleanedText || p.rawText || "").trim();
  const lower = text.toLowerCase();

  // Noise → skip
  if (p.paragraphType === "noise" || text.length < 30) return "skim";

  // Exam trap signals win first
  if ((p.traps && p.traps.length > 0) || TRAP_SIGNALS.test(text)) return "exam_trap";

  // Domain-aware clinical override
  if (domain === "clinical" && CLINICAL_SIGNALS.test(text)) return "clinical_logic";
  if (p.paragraphType === "clinical_reasoning") return "clinical_logic";

  // Math domain formula detection
  if ((domain === "math" || p.paragraphType === "formula") && FORMULA_SIGNALS.test(text)) return "formula_logic";

  // High-priority score + explanation signal → deep understand
  if (p.priorityScore >= 8 && DEFINITION_SIGNALS.test(text)) return "deep_understand";
  if (p.priorityScore >= 8 && MECHANISM_SIGNALS.test(text)) return "deep_understand";

  // By paragraph type
  switch (p.paragraphType as ParagraphType) {
    case "definition":
      return "deep_understand";
    case "formula":
      return domain === "math" ? "formula_logic" : "memorize";
    case "cause_effect":
      return p.priorityScore >= 6 ? "deep_understand" : "understand";
    case "concept":
      return p.priorityScore >= 7 ? "deep_understand" : "understand";
    case "signal":
      return "memorize";
    case "process":
      return MECHANISM_SIGNALS.test(lower) ? "understand" : "skim";
    case "clinical_reasoning":
      return "clinical_logic";
    case "comparison":
      return "understand";
    case "decision":
      return domain === "clinical" ? "clinical_logic" : "understand";
    case "consequence":
      return p.priorityScore >= 6 ? "understand" : "skim";
    case "example":
      return "example_only";
    case "narrative":
      return domain === "fiction" ? "understand" : "skim";
    case "mixed":
      if (DEFINITION_SIGNALS.test(text) && p.priorityScore >= 6) return "deep_understand";
      if (MECHANISM_SIGNALS.test(text) && p.priorityScore >= 5) return "understand";
      return p.priorityScore >= 7 ? "understand" : "skim";
    default:
      return p.priorityScore >= 7 ? "understand" : "skim";
  }
}

function computeSalience(depth: ReadingDepth, priorityScore: number): number {
  const baseSalience = SRI_META[depth].salience;
  // Blend base salience with normalized priorityScore (0–10 scale)
  const scoreBoost = Math.min((priorityScore / 10) * 0.2, 0.2);
  return Math.min(baseSalience + scoreBoost, 1.0);
}

// ---------------------------------------------------------------------------
// Primary SRI summary
// ---------------------------------------------------------------------------

const DEPTH_PRIORITY: ReadingDepth[] = [
  "exam_trap", "deep_understand", "memorize", "clinical_logic",
  "formula_logic", "understand", "skim", "example_only",
];

function computePrimaryDepth(annotations: ParagraphSRIAnnotation[]): ReadingDepth {
  const counts = new Map<ReadingDepth, number>();
  for (const a of annotations) {
    // Weight by salience so rare high-salience depths win over many skim entries
    counts.set(a.depth, (counts.get(a.depth) ?? 0) + a.salience);
  }
  // Return the highest-priority depth that has any presence
  for (const d of DEPTH_PRIORITY) {
    if ((counts.get(d) ?? 0) > 0) return d;
  }
  return "understand";
}

const DEPTH_SUMMARIES: Record<ReadingDepth, string> = {
  deep_understand: "High-density concept page — read slowly, trace each causal link.",
  memorize:        "Key facts and formulas page — commit the highlighted items to memory.",
  clinical_logic:  "Clinical reasoning page — map each finding to its interpretation and next step.",
  formula_logic:   "Math derivation page — follow each step, understand the conditions of application.",
  exam_trap:       "Trap-heavy page — study the misconceptions as carefully as the correct principles.",
  understand:      "Process or application page — follow the logic, don't memorize word-for-word.",
  skim:            "Background context — one read-through is sufficient.",
  example_only:    "Worked examples page — reference when stuck, do not over-study.",
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function buildSRIModel(
  paragraphInsights: ParagraphInsight[],
  domain: PageDomain,
): SRIModel {
  const annotations: ParagraphSRIAnnotation[] = [];

  for (const p of paragraphInsights) {
    const text = (p.cleanedText || p.rawText || "").trim();
    if (!text) continue;

    const depth = classifyParagraphDepth(p, domain);
    const meta = SRI_META[depth];
    const salience = computeSalience(depth, p.priorityScore ?? 5);

    annotations.push({
      paragraphIndex: p.paragraphIndex,
      text: text.slice(0, 90).replace(/\s+/g, " "),
      depth,
      icon: meta.icon,
      depthLabel: meta.label,
      color: meta.color,
      salience,
    });
  }

  // Sort by paragraphIndex (preserve reading order)
  annotations.sort((a, b) => a.paragraphIndex - b.paragraphIndex);

  const primaryDepth = computePrimaryDepth(annotations);

  return {
    annotations,
    primaryDepth,
    summary: DEPTH_SUMMARIES[primaryDepth],
  };
}
