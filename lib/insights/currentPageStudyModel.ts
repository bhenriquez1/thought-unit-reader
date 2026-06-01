// lib/insights/currentPageStudyModel.ts
// Shared typed model emitted by RightPanel when OpenAI synthesis resolves.
// All downstream features (highlights, NoteLab, Recall Lab, CrossLinks) read from this.

import type { MiniTestItem } from "@/lib/insights/synthesizeTeachingOutput";
import { cleanThesisLine } from "@/lib/insights/cleanActivePageText";

export type CurrentPageStudyModel = {
  page: number;
  bookId: string;
  /** pageTruthKey under which this model was synthesized — used for render-time staleness guard */
  pageTruthKey?: string;
  pageThesis: string;
  studyNotes: {
    whyThisMatters: string | null;
    keyMechanism: string | null;
    commonConfusion: string | null;
    quickMemory: string | null;
    reasoningFlow: string | null;
    examSignal: string | null;
  };
  conceptBlocks: Array<{
    title: string;
    pattern: string;
    mechanism?: string;
    trap?: string;
    rule?: string;
  }>;
  miniTest: string[];
  miniTestItems?: MiniTestItem[];
  preReadRecallItems?: MiniTestItem[];
  highlightAnchors: Array<{ text: string; anchorType: string; reason: string }>;
  externalStudyLinks: Array<{ label: string; searchQuery: string; type: string }>;
  relatedVideoQueries?: string[];
};

type AnchorCandidate = { text: string; anchorType: string; reason: string; spanStart?: string | null; spanEnd?: string | null };

// Build 3–5 anchor candidates so the left panel (the "visual pathway") reflects the
// full right-panel brain — not just the one or two verbatim spans the model returned.
//
// Sources, in priority order:
//   1. synth.highlightAnchors — AI's verbatim spans (already grounded-quality)
//   2. Page Thesis            → anchorType "thesis"
//   3. Why This Matters       → anchorType "application"
//   4. Key Mechanism          → anchorType "mechanism"
//   5. Common Confusion       → anchorType "trap"
//   6. Concept Blocks         → anchorType "definition" (one per block)
//
// Every derived candidate is cleaned of running-header/page-number debris first.
// These are CANDIDATES: groundHighlightAnchors() recovers the verbatim page sentence
// for each (or drops it), so prose study fields still produce grounded PDF spans when
// the exact page text supports them. Returning many candidates here is what prevents
// the "only one generic anchor" failure — grounding/arbitration trims to the real set.
function buildAnchorCandidates(
  thesis: string,
  synth: Record<string, unknown>,
  conceptBlocks: Array<{ title: string; pattern: string }>,
): AnchorCandidate[] {
  const aiAnchors = (synth.highlightAnchors as AnchorCandidate[] | null) ?? [];

  const fieldCandidates: AnchorCandidate[] = [
    { text: thesis,                                       anchorType: "thesis",      reason: "Page thesis" },
    { text: (synth.whyItMatters    as string | null) ?? "", anchorType: "application", reason: "Why this matters" },
    { text: (synth.keyMechanism    as string | null) ?? "", anchorType: "mechanism",   reason: "Key mechanism" },
    { text: (synth.commonConfusion as string | null) ?? "", anchorType: "trap",        reason: "Common confusion" },
    ...conceptBlocks.slice(0, 3).map((b) => ({
      text: b.pattern || b.title || "",
      anchorType: "definition" as const,
      reason: b.title ? `Concept: ${b.title.slice(0, 40)}` : "Concept block",
    })),
  ];

  // Clean debris and drop empties/too-short before deduping.
  const cleaned: AnchorCandidate[] = [...aiAnchors, ...fieldCandidates]
    .map((a) => ({ ...a, text: (cleanThesisLine(a.text) ?? "").trim() }))
    .filter((a) => a.text.length >= 12);

  // Dedupe by normalized prefix so the same idea isn't sent under two roles.
  const seen = new Set<string>();
  const deduped: AnchorCandidate[] = [];
  for (const a of cleaned) {
    const key = a.text.toLowerCase().replace(/\s+/g, " ").slice(0, 50);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(a);
  }

  // Cap candidates — grounding + semantic arbitration narrow to the final 3–5.
  const candidates = deduped.slice(0, 8);

  console.log("[STUDYMODEL_ANCHORS]", {
    count: candidates.length,
    aiAnchorCount: aiAnchors.length,
    texts: candidates.map((a) => a.text.slice(0, 60)),
    sourceFields: candidates.map((a) => a.anchorType),
  });

  return candidates;
}

export function buildStudyModel(
  view: {
    title?: string;
    coreIdea?: string;
    blocks: Array<{
      title: string;
      pattern?: string;
      surgicalReason?: string;
      trap?: string;
      rule?: string;
    }>;
    miniTest?: string[];
  },
  synth: Record<string, unknown>,
  bookId: string,
  page: number
): CurrentPageStudyModel {
  const thesis = (view.coreIdea || view.title || "") as string;
  const rawExtLinks = (synth.externalStudyLinks as Array<{ label: string; searchQuery: string; type: string }> | null) ?? [];
  // OpenAI-reinterpreted concept blocks — preferred over heuristic view.blocks
  const rawAIConcepts = (synth.aiConcepts as Array<{
    title: string; principle: string; mechanism: string; trap: string | null; rule: string;
  }> | null) ?? null;

  const conceptBlocks = (rawAIConcepts?.length ? rawAIConcepts : view.blocks).map((b: any) => ({
    title:     b.title ?? "",
    pattern:   b.principle ?? b.pattern ?? "",         // OpenAI uses 'principle'; heuristic uses 'pattern'
    mechanism: b.mechanism ?? b.surgicalReason ?? undefined,
    trap:      b.trap ?? undefined,
    rule:      b.rule ?? undefined,
  }));

  // Build 3–5 grounded-quality anchor candidates from thesis + study notes + concept
  // blocks, not just the model's verbatim spans. The left-panel grounding layer recovers
  // the exact page sentence for each candidate (or drops it), so every supported study
  // field becomes a PDF highlight — the visual pathway mirrors the right-panel brain.
  const cleanThesis = cleanThesisLine(thesis) ?? thesis;
  const highlightAnchors = buildAnchorCandidates(cleanThesis, synth, conceptBlocks);

  return {
    page,
    bookId,
    pageThesis: cleanThesis,
    studyNotes: {
      whyThisMatters:  (synth.whyItMatters   as string | null) ?? null,
      keyMechanism:    (synth.keyMechanism   as string | null) ?? null,
      commonConfusion: (synth.commonConfusion as string | null) ?? null,
      quickMemory:     (synth.memoryAnchor   as string | null) ?? null,
      reasoningFlow:   (synth.reasoningFlow  as string | null) ?? null,
      examSignal:      (synth.examSignal     as string | null) ?? null,
    },
    conceptBlocks,
    miniTest: (view.miniTest ?? []).filter(Boolean),
    miniTestItems: (synth.miniTestItems as MiniTestItem[] | null) ?? undefined,
    preReadRecallItems: (synth.preReadRecallItems as MiniTestItem[] | null) ?? undefined,
    highlightAnchors,
    externalStudyLinks: rawExtLinks,
    relatedVideoQueries: (synth.relatedVideoQueries as string[] | null) ?? undefined,
  };
}
