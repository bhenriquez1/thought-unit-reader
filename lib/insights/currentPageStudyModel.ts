// lib/insights/currentPageStudyModel.ts
// Shared typed model emitted by RightPanel when OpenAI synthesis resolves.
// All downstream features (highlights, NoteLab, Recall Lab, CrossLinks) read from this.

export type CurrentPageStudyModel = {
  page: number;
  bookId: string;
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
  highlightAnchors: Array<{ text: string; anchorType: string; reason: string }>;
  crossLinks: Array<{ label: string; resolvedPage?: number; confidence?: number }>;
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
  const rawCrossLinks = (synth.crossLinks as Array<{ label: string; targetPage: number | null }> | null) ?? [];

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
    conceptBlocks: view.blocks.map((b) => ({
      title:     b.title ?? "",
      pattern:   b.pattern ?? "",
      mechanism: b.surgicalReason ?? undefined,
      trap:      b.trap ?? undefined,
      rule:      b.rule ?? undefined,
    })),
    miniTest: (view.miniTest ?? []).filter(Boolean),
    highlightAnchors: anchors,
    crossLinks: rawCrossLinks.map((cl) => ({
      label:       cl.label,
      resolvedPage: cl.targetPage ?? undefined,
    })),
    relatedVideoQueries: (synth.relatedVideoQueries as string[] | null) ?? undefined,
  };
}
