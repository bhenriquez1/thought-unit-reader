// lib/insights/currentPageStudyModel.ts
// Shared typed model emitted by RightPanel when OpenAI synthesis resolves.
// All downstream features (highlights, NoteLab, Recall Lab, CrossLinks) read from this.

import type { MiniTestItem } from "@/lib/insights/synthesizeTeachingOutput";

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
  const anchors = (synth.highlightAnchors as Array<{ text: string; anchorType: string; reason: string }> | null) ?? [];
  const rawExtLinks = (synth.externalStudyLinks as Array<{ label: string; searchQuery: string; type: string }> | null) ?? [];
  // OpenAI-reinterpreted concept blocks — preferred over heuristic view.blocks
  const rawAIConcepts = (synth.aiConcepts as Array<{
    title: string; principle: string; mechanism: string; trap: string | null; rule: string;
  }> | null) ?? null;

  return {
    page,
    bookId,
    pageThesis: thesis,
    studyNotes: {
      whyThisMatters:  (synth.whyItMatters   as string | null) ?? null,
      keyMechanism:    (synth.keyMechanism   as string | null) ?? null,
      commonConfusion: (synth.commonConfusion as string | null) ?? null,
      quickMemory:     (synth.memoryAnchor   as string | null) ?? null,
      reasoningFlow:   (synth.reasoningFlow  as string | null) ?? null,
      examSignal:      (synth.examSignal     as string | null) ?? null,
    },
    // Prefer OpenAI-reinterpreted concepts (principle/mechanism) over heuristic view.blocks
    conceptBlocks: (rawAIConcepts?.length ? rawAIConcepts : view.blocks).map((b: any) => ({
      title:     b.title ?? "",
      pattern:   b.principle ?? b.pattern ?? "",         // OpenAI uses 'principle'; heuristic uses 'pattern'
      mechanism: b.mechanism ?? b.surgicalReason ?? undefined,
      trap:      b.trap ?? undefined,
      rule:      b.rule ?? undefined,
    })),
    miniTest: (view.miniTest ?? []).filter(Boolean),
    miniTestItems: (synth.miniTestItems as MiniTestItem[] | null) ?? undefined,
    preReadRecallItems: (synth.preReadRecallItems as MiniTestItem[] | null) ?? undefined,
    highlightAnchors: anchors,
    externalStudyLinks: rawExtLinks,
    relatedVideoQueries: (synth.relatedVideoQueries as string[] | null) ?? undefined,
  };
}
