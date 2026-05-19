// components/reader/useTeachingSynthesis.ts
// Fires async teaching synthesis when a page is ready, aborts on page change.
// Returns { synthesis, status, errorMessage } so callers can show error states.

import { useEffect, useRef, useState } from "react";
import type { PageDomain } from "@/lib/insights/detectPageDomain";
import type { UltraConceptBlock } from "@/lib/insights/buildUltraPageView";
import type { TeachingSynthesis } from "@/lib/insights/synthesizeTeachingOutput";
import { synthesizeTeachingOutput, buildSynthesisInput } from "@/lib/insights/synthesizeTeachingOutput";

export type SynthesisStatus = "idle" | "loading" | "success" | "error";

export interface UseTeachingSynthesisResult {
  synthesis: TeachingSynthesis | null;
  status: SynthesisStatus;
  errorMessage: string | null;
}

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
  pageNumber?: number;
}

const SYNTHESIS_TIMEOUT_MS = 10_000;

export function useTeachingSynthesis({
  pageTruthKey,
  pageObjective,
  pageThesis,
  pageSummary,
  domain,
  blocks,
  enabled,
  pageNumber,
}: UseTeachingSynthesisArgs): UseTeachingSynthesisResult {
  const [synthesis, setSynthesis] = useState<TeachingSynthesis | null>(null);
  const [status, setStatus] = useState<SynthesisStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSynthesis(null);
    setStatus("idle");
    setErrorMessage(null);

    const usableBlocks = blocks.filter((b) => b.pattern && b.pattern.length >= 20);

    console.log("[SYNTH:lifecycle]", {
      enabled,
      pageTruthKey,
      usableBlockCount: usableBlocks.length,
      totalBlocks: blocks.length,
      domain,
      hasPageThesis: !!pageThesis,
      hasPageSummary: !!pageSummary,
      hasPageObjective: !!pageObjective,
    });

    if (!enabled || !usableBlocks.length) {
      console.log("[SYNTH:skip]", { reason: !enabled ? "disabled" : "no usable blocks (all <20 chars)" });
      return;
    }

    const safeDomain = domain ?? "general";
    const input = buildSynthesisInput(usableBlocks, safeDomain, pageObjective, pageThesis, pageSummary, pageNumber);

    console.log("[SYNTH:request]", {
      domain: safeDomain,
      conceptCount: input.rankedConcepts.length,
      pageThesis: input.pageThesis?.slice(0, 80) ?? "(none)",
      pageSummary: input.pageSummary?.slice(0, 80) ?? "(none)",
      pageObjective: input.pageObjective?.slice(0, 80) ?? "(none)",
      concepts: input.rankedConcepts.map((c, i) => ({ i, role: c.role, title: c.title?.slice(0, 40) })),
    });

    const controller = new AbortController();
    abortRef.current = controller;
    setStatus("loading");

    timeoutRef.current = setTimeout(() => {
      if (!controller.signal.aborted) {
        console.warn("[SYNTH:timeout] synthesis took >10s — aborting");
        controller.abort();
        setStatus("error");
        setErrorMessage("Synthesis timed out (>10 s). Check server logs for intelligenceSynthesis errors.");
      }
    }, SYNTHESIS_TIMEOUT_MS);

    synthesizeTeachingOutput(input, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
        console.log("[SYNTH:success]", {
          coreIdea:           result.coreIdea?.slice(0, 80) ?? null,
          mechanism:          result.mechanism?.slice(0, 80) ?? null,
          application:        result.application?.slice(0, 80) ?? null,
          misconceptionAlert: result.misconceptionAlert?.slice(0, 80) ?? null,
          memoryAnchor:       (result as any).memoryAnchor?.slice(0, 80) ?? null,
          conceptCount:       result.concepts?.length ?? 0,
        });
        setSynthesis(result);
        setStatus("success");
      })
      .catch((err) => {
        if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
        if (err?.name === "AbortError") return;
        const msg = err?.message ?? String(err);
        console.error("[SYNTH:error]", msg, err);
        setStatus("error");
        setErrorMessage(msg);
      });

    return () => {
      controller.abort();
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
      abortRef.current = null;
    };
  // Re-fire only when the page identity changes or blocks first become available
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageTruthKey, enabled, blocks.length > 0]);

  return { synthesis, status, errorMessage };
}
