// lib/insights/buildSRIModel.ts
// Structural Reading Intelligence — compresses all paragraph signals into
// 3–5 expert-curated reading directives.
//
// Behaves like a PRE-READ briefing from an expert tutor, NOT a paragraph log.
// Key principles:
//   - One card per reading mode (merge all clinical_logic into one)
//   - Hard limit of 4 primary signals + 1 background signal
//   - Text compressed to 6-10 words (tactical, not verbatim)
//   - skim/example_only always collapsed into one muted "Background" entry

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

/** One merged reading directive — represents N paragraphs of the same reading mode. */
export interface SRISignal {
  depth: ReadingDepth;
  icon: string;
  label: string;
  color: string;
  summary: string;       // compressed 6-10 word tactical phrase
  details: string[];     // 0-2 additional bullets from same-mode merging
  count: number;         // paragraphs merged
  isBackground: boolean; // skim/example_only — rendered muted, collapsed by default
}

export interface SRIModel {
  signals: SRISignal[];      // 3-5 total, ordered by educational priority
  primaryDepth: ReadingDepth;
  pageStrategy: string;      // one-sentence reading approach
}

// ---------------------------------------------------------------------------
// Paragraph classification
// ---------------------------------------------------------------------------

const TRAP_SIGNALS = /\b(common mistake|students often|frequently confused|do not confuse|easy to confuse|beware|trap|pitfall|commonly missed|incorrect to|wrong to assume|note:|careful:|important:)\b/i;
const FORMULA_SIGNALS = /\b(theorem|formula|proof|equation|corollary|lemma|derivative|integral|let\s+[a-z]\b|[=∫∂∑]|\bln\b|\bcos\b|\bsin\b)\b/i;
const CLINICAL_SIGNALS = /\b(diagnosis|presents with|next step|treatment|management|differential|workup|rule out|indicated|contraindicated|first-line|pathophysiology|etiology)\b/i;
const MECHANISM_SIGNALS = /\b(because|therefore|leads to|results in|causes?|produces?|activates?|inhibits?|blocks?|stimulates?|mechanism)\b/i;
const DEFINITION_SIGNALS = /\b(is defined as|refers to|is the|is a|are the|consists of|is known as|is characterized by)\b/i;

function classifyParagraphDepth(p: ParagraphInsight, domain: PageDomain): ReadingDepth {
  const text = (p.cleanedText || p.rawText || "").trim();

  if (p.paragraphType === "noise" || text.length < 30) return "skim";
  if ((p.traps && p.traps.length > 0) || TRAP_SIGNALS.test(text)) return "exam_trap";
  if (domain === "clinical" && CLINICAL_SIGNALS.test(text)) return "clinical_logic";
  if (p.paragraphType === "clinical_reasoning") return "clinical_logic";
  if ((domain === "math" || p.paragraphType === "formula") && FORMULA_SIGNALS.test(text)) return "formula_logic";
  if (p.priorityScore >= 8 && DEFINITION_SIGNALS.test(text)) return "deep_understand";
  if (p.priorityScore >= 8 && MECHANISM_SIGNALS.test(text)) return "deep_understand";

  switch (p.paragraphType as ParagraphType) {
    case "definition":       return "deep_understand";
    case "formula":          return domain === "math" ? "formula_logic" : "memorize";
    case "cause_effect":     return p.priorityScore >= 6 ? "deep_understand" : "understand";
    case "concept":          return p.priorityScore >= 7 ? "deep_understand" : "understand";
    case "signal":           return "memorize";
    case "process":          return MECHANISM_SIGNALS.test(text) ? "understand" : "skim";
    case "clinical_reasoning": return "clinical_logic";
    case "comparison":       return "understand";
    case "decision":         return domain === "clinical" ? "clinical_logic" : "understand";
    case "consequence":      return p.priorityScore >= 6 ? "understand" : "skim";
    case "example":          return "example_only";
    case "narrative":        return domain === "fiction" ? "understand" : "skim";
    case "mixed":
      if (DEFINITION_SIGNALS.test(text) && p.priorityScore >= 6) return "deep_understand";
      if (MECHANISM_SIGNALS.test(text) && p.priorityScore >= 5) return "understand";
      return p.priorityScore >= 7 ? "understand" : "skim";
    default:
      return p.priorityScore >= 7 ? "understand" : "skim";
  }
}

// ---------------------------------------------------------------------------
// Text compression — strip filler, take first clause, limit to 10 words
// ---------------------------------------------------------------------------

const FILLER_OPENER_RE = /^(the (?:clinician|student|reader|physician|nurse|author|teacher) (?:must|should|can|may|is able to|needs? to)|it is (?:important|essential|critical|necessary|worth noting) (?:to|that)|in order to|as a result[,]?|in this (?:case|context|section)[,]?|this means that[,]?|therefore[,]?|thus[,]?|note that|recall that|keep in mind that|we (?:can|must|should|note|see|observe|have)|consider(?:ing)? that|one (?:must|should|can)|for (?:example|instance)[,]?)\s+/i;

const TRAILING_FN_RE = /\s+(of|a|an|the|with|for|in|to|and|or|by|from|on|at|as|that|which|this|these|those)\.?$/i;

function compressToSignal(raw: string): string {
  // Strip leading ordinal (e.g. "1. ")
  let s = raw.replace(/^\d+[.)]\s*/, "").trim();
  // Strip filler opener
  s = s.replace(FILLER_OPENER_RE, "").trim();

  // Split on first natural clause boundary (comma/semicolon) within 20-90 chars
  const breakMatch = s.match(/^(.{20,90}?)(?<=[a-zA-Z]{3})[,;](?=\s+[a-z])/);
  if (breakMatch?.[1]) s = breakMatch[1].trim();

  // Limit to 10 words
  const words = s.split(/\s+/);
  if (words.length > 10) {
    s = words.slice(0, 10).join(" ");
    s = s.replace(TRAILING_FN_RE, "").trim();
  }

  // Capitalize and strip trailing period
  s = s.replace(/\.+$/, "").trim();
  return s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

// ---------------------------------------------------------------------------
// Signal building — group by depth, compress, merge
// ---------------------------------------------------------------------------

// Priority order determines card ordering in the Reading Map
const DEPTH_PRIORITY: ReadingDepth[] = [
  "exam_trap",
  "deep_understand",
  "formula_logic",
  "clinical_logic",
  "memorize",
  "understand",
  "skim",
  "example_only",
];

const BACKGROUND_DEPTHS = new Set<ReadingDepth>(["skim", "example_only"]);
const MAX_PRIMARY_SIGNALS = 4;
const MAX_DETAIL_BULLETS  = 2;

interface RatedParagraph {
  text: string;
  depth: ReadingDepth;
  priorityScore: number;
}

function buildSignals(rated: RatedParagraph[]): SRISignal[] {
  // Group by depth
  const groups = new Map<ReadingDepth, RatedParagraph[]>();
  for (const r of rated) {
    const g = groups.get(r.depth) ?? [];
    g.push(r);
    groups.set(r.depth, g);
  }

  const primary: SRISignal[] = [];
  let backgroundCount = 0;

  for (const depth of DEPTH_PRIORITY) {
    const items = groups.get(depth);
    if (!items?.length) continue;

    // Merge background depths into a count (rendered as one muted signal at end)
    if (BACKGROUND_DEPTHS.has(depth)) {
      backgroundCount += items.length;
      continue;
    }

    // Cap primary signals
    if (primary.length >= MAX_PRIMARY_SIGNALS) continue;

    // Best = highest priority score
    const sorted = [...items].sort((a, b) => b.priorityScore - a.priorityScore);
    const summary = compressToSignal(sorted[0].text);
    const details = sorted
      .slice(1, MAX_DETAIL_BULLETS + 1)
      .map(r => compressToSignal(r.text))
      .filter(s => s.length >= 4 && s !== summary);

    const meta = SRI_META[depth];
    primary.push({ depth, icon: meta.icon, label: meta.label, color: meta.color, summary, details, count: items.length, isBackground: false });
  }

  // Background signal — always last, always present if there is any background content
  if (backgroundCount > 0) {
    primary.push({
      depth: "skim",
      icon: "👀",
      label: "Background / Examples",
      color: "#94a3b8",
      summary: `${backgroundCount} supporting paragraph${backgroundCount > 1 ? "s" : ""} — skim on first pass`,
      details: [],
      count: backgroundCount,
      isBackground: true,
    });
  }

  return primary;
}

// ---------------------------------------------------------------------------
// Page strategy
// ---------------------------------------------------------------------------

const DEPTH_SUMMARIES: Record<ReadingDepth, string> = {
  exam_trap:       "Trap-heavy page — study misconceptions as carefully as correct principles.",
  deep_understand: "High-density concept page — read slowly, trace each causal link.",
  formula_logic:   "Math derivation page — follow each step; understand application conditions.",
  clinical_logic:  "Clinical reasoning page — map each finding to its next step.",
  memorize:        "Key facts page — commit highlighted items to memory.",
  understand:      "Process or application page — follow the logic; don't memorize word-for-word.",
  skim:            "Background context page — one read-through is sufficient.",
  example_only:    "Worked examples page — reference when stuck; do not over-study.",
};

function primaryDepthOf(signals: SRISignal[]): ReadingDepth {
  for (const d of DEPTH_PRIORITY) {
    if (signals.some(s => s.depth === d && !s.isBackground)) return d;
  }
  return "understand";
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function buildSRIModel(
  paragraphInsights: ParagraphInsight[],
  domain: PageDomain,
): SRIModel {
  const rated: RatedParagraph[] = [];

  for (const p of paragraphInsights) {
    const text = (p.cleanedText || p.rawText || "").trim();
    if (!text) continue;
    rated.push({
      text: text.slice(0, 200),
      depth: classifyParagraphDepth(p, domain),
      priorityScore: p.priorityScore ?? 5,
    });
  }

  const signals = buildSignals(rated);
  const primaryDepth = primaryDepthOf(signals);

  return {
    signals,
    primaryDepth,
    pageStrategy: DEPTH_SUMMARIES[primaryDepth],
  };
}
