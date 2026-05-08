// components/reader/useTeachingSynthesis.ts
// Fires async teaching synthesis when a page is ready, aborts on page change.
// Returns null until synthesis completes; the caller re-renders when it resolves.

import { useEffect, useRef, useState } from "react";
import type { PageInsightModel } from "@/lib/insights/types";
import type { PageDomain } from "@/lib/insights/detectPageDomain";
import type { UltraConceptBlock } from "@/lib/insights/buildUltraPageView";
import type { TeachingSynthesis } from "@/lib/insights/synthesizeTeachingOutput";
import { synthesizeTeachingOutput } from "@/lib/insights/synthesizeTeachingOutput";

interface UseTeachingSynthesisArgs {
  pageTruthKey: string;
  pageModel: PageInsightModel | null;
  domain: PageDomain | null;
  blocks: UltraConceptBlock[];
  enabled: boolean;
}

export function useTeachingSynthesis({
  pageTruthKey,
  pageModel,
  domain,
  blocks,
  enabled,
}: UseTeachingSynthesisArgs): TeachingSynthesis | null {
  const [synthesis, setSynthesis] = useState<TeachingSynthesis | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setSynthesis(null);

    if (!enabled || !pageModel || !blocks.length) return;

    // Reconstruct page text from paragraphInsights
    const pageText = (pageModel.paragraphInsights ?? [])
      .map((p) => p.cleanedText || p.rawText || "")
      .filter(Boolean)
      .join(" ");

    if (pageText.length < 60) return;

    const controller = new AbortController();
    abortRef.current = controller;

    synthesizeTeachingOutput(
      pageText,
      domain ?? "general",
      blocks,
      controller.signal,
    )
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
