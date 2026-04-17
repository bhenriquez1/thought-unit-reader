// lib/reader/types.ts
// Universal reader types — shared by left-panel highlights and right-panel concept blocks.

export type HighlightTier = "important" | "support" | "additional" | "trap";
export type ConceptImportance = "critical" | "high" | "medium" | "low";

export interface ConceptBlock {
  id: string;
  title: string;
  pattern: string;     // what it is
  reason: string;      // why it matters / how it works
  trap: string;        // what could be misunderstood (empty string if none)
  rule: string;        // clear takeaway
  importance: ConceptImportance;
  tier: HighlightTier;
  anchorText: string;  // text span to anchor left-panel highlight
}

export interface ReaderPageView {
  coreIdea: string;
  concepts: ConceptBlock[];
  miniTest: string[];   // 2–3 short recall questions
  compression: string;  // one-sentence synthesis
  isWeak: boolean;
}
