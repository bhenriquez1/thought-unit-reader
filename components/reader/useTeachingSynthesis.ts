// components/reader/useTeachingSynthesis.ts
// Fires async teaching synthesis when a page is ready, aborts on page change.
// Returns null until synthesis completes; the caller re-renders when it resolves.

import { useEffect, useRef, useState } from "react";
import type { PageDomain } from "@/lib/insights/detectPageDomain";
import type { UltraConceptBlock } from "@/lib/insights/buildUltraPageView";
import type { TeachingSynthesis } from "@/lib/insights/synthesizeTeachingOutput";
import { synthesizeTeachingOutput, buildSynthesisInput } from "@/lib/insights/synthesizeTeachingOutput";

interface UseTeachingSynthesisArgs {
  pageTruthKey: string;
  /** teachingStatement from UltraPageView — top-down heading+canonical, NOT the heuristic coreIdea */
  pageObjective?: string;
  /** Professor's one-sentence governing idea — from UltraPageView.pageThesis */
  pageThesis?: string;
  /** AI-generated page summary if available — richest context for synthesis */
  pageSummary?: string;
  domain: PageDomain | null;
  blocks: UltraConceptBlock[];
  enabled: boolean;
}

export function useTeachingSynthesis({
  pageTruthKey,
  pageObjective,
  pageThesis,
  pageSummary,
  domain,
  blocks,
  enabled,
}: UseTeachingSynthesisArgs): TeachingSynthesis | null {
  const [synthesis, setSynthesis] = useState<TeachingSynthesis | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setSynthesis(null);

    // Require at least one block with a real pattern before calling the LLM.
    const usableBlocks = blocks.filter((b) => b.pattern && b.pattern.length >= 20);
    if (!enabled || !usableBlocks.length) return;

    const safeDomain = domain ?? "general";
    const input = buildSynthesisInput(usableBlocks, safeDomain, pageObjective, pageThesis, pageSummary);

    const controller = new AbortController();
    abortRef.current = controller;

    synthesizeTeachingOutput(input, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setSynthesis(result);
      })
      .catch((err) => {
        if (err?.name === "AbortError") return;
        console.warn("[useTeachingSynthesis] synthesis failed:", err?.message ?? err);
      });

    return () => {
      controller.abort();
      abortRef.current = null;
    };
  // Re-fire only when the page identity changes or blocks first become available
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageTruthKey, enabled, blocks.length > 0]);

  return synthesis;
}
