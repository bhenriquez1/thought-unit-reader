// components/reader/useTeachingSynthesis.ts
// Two-stage teaching synthesis — progressive rendering without blocking the panel.
//
// STAGE 1 (fast, ~1–3s): coreIdea + highlightAnchors + miniTestItems
//   → Panel renders immediately with thesis, highlights, mini-test.
//
// STAGE 2 (background, ~5–15s): full study notes, concept blocks, videos, links
//   → Fills in progressively. On timeout: retries once with reduced context.
//   → Stage 2 failure is non-blocking — Stage 1 content stays visible.

import { useEffect, useRef, useState } from "react";
import type { PageDomain } from "@/lib/insights/detectPageDomain";
import type { UltraConceptBlock } from "@/lib/insights/buildUltraPageView";
import type { TeachingSynthesis } from "@/lib/insights/synthesizeTeachingOutput";
import {
  synthesizeTeachingOutput,
  synthesizeStage1Output,
  makeStubFromStage1,
  buildSynthesisInput,
} from "@/lib/insights/synthesizeTeachingOutput";

export type SynthesisStatus = "idle" | "loading" | "success" | "error";

export interface UseTeachingSynthesisResult {
  synthesis: TeachingSynthesis | null;
  status: SynthesisStatus;        // panel-level: "success" as soon as stage1 done
  stage1Status: SynthesisStatus;
  stage2Status: SynthesisStatus;
  errorMessage: string | null;
}

interface UseTeachingSynthesisArgs {
  pageTruthKey: string;
  pageObjective?: string;
  pageThesis?: string;
  pageSummary?: string;
  domain: PageDomain | null;
  blocks: UltraConceptBlock[];
  enabled: boolean;
  pageNumber?: number;
}

const STAGE1_TIMEOUT_MS       = 8_000;
const STAGE2_TIMEOUT_MS       = 22_000;
const STAGE2_RETRY_TIMEOUT_MS = 15_000;

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
  const [synthesis,    setSynthesis]    = useState<TeachingSynthesis | null>(null);
  const [status,       setStatus]       = useState<SynthesisStatus>("idle");
  const [stage1Status, setStage1Status] = useState<SynthesisStatus>("idle");
  const [stage2Status, setStage2Status] = useState<SynthesisStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setSynthesis(null);
    setStatus("idle");
    setStage1Status("idle");
    setStage2Status("idle");
    setErrorMessage(null);

    const usableBlocks = blocks.filter((b) => b.pattern && b.pattern.length >= 20);

    console.log("[SYNTH:lifecycle]", {
      enabled,
      pageTruthKey,
      usableBlockCount: usableBlocks.length,
      totalBlocks: blocks.length,
      domain,
      hasPageThesis:    !!pageThesis,
      hasPageSummary:   !!pageSummary,
      hasPageObjective: !!pageObjective,
    });

    if (!enabled || !usableBlocks.length) {
      console.log("[SYNTH:skip]", { reason: !enabled ? "disabled" : "no usable blocks" });
      return;
    }

    const safeDomain = domain ?? "general";
    const input = buildSynthesisInput(usableBlocks, safeDomain, pageObjective, pageThesis, pageSummary, pageNumber);

    console.log("[SYNTH:request]", {
      domain: safeDomain,
      conceptCount: input.rankedConcepts.length,
      pageThesis:    input.pageThesis?.slice(0, 80) ?? "(none)",
      pageSummary:   input.pageSummary?.slice(0, 80) ?? "(none)",
      pageObjective: input.pageObjective?.slice(0, 80) ?? "(none)",
      concepts: input.rankedConcepts.map((c, i) => ({ i, role: c.role, title: c.title?.slice(0, 40) })),
    });

    const mainCtrl = new AbortController();
    abortRef.current = mainCtrl;
    const mainSignal = mainCtrl.signal;

    async function runStages() {
      // ── STAGE 1: Fast ──────────────────────────────────────────────────────
      console.log("[SYNTH:stage1:start]", { pageTruthKey, conceptCount: input.rankedConcepts.length });
      setStage1Status("loading");
      setStatus("loading");

      const s1Ctrl = new AbortController();
      mainSignal.addEventListener("abort", () => s1Ctrl.abort(), { once: true });
      const s1Timer = setTimeout(() => {
        console.warn("[SYNTH:stage1:timeout]");
        s1Ctrl.abort();
      }, STAGE1_TIMEOUT_MS);

      let stage1Succeeded = false;
      try {
        const s1 = await synthesizeStage1Output(input, s1Ctrl.signal);
        clearTimeout(s1Timer);
        if (mainSignal.aborted) return;
        console.log("[SYNTH:stage1:done]", {
          coreIdea: s1.coreIdea?.slice(0, 60),
          anchors:  s1.highlightAnchors?.length ?? 0,
          miniTest: s1.miniTestItems?.length ?? 0,
        });
        setStage1Status("success");
        setSynthesis(makeStubFromStage1(s1));
        setStatus("success");
        stage1Succeeded = true;
      } catch (err: any) {
        clearTimeout(s1Timer);
        if (mainSignal.aborted) return;
        const isAbort = s1Ctrl.signal.aborted || err?.name === "AbortError";
        console.error(isAbort ? "[SYNTH:stage1:timeout]" : "[SYNTH:stage1:error]", err?.message ?? String(err));
        setStage1Status("error");
        setStatus("error");
        setErrorMessage(isAbort
          ? "Synthesis timed out — try a different page or reload."
          : (err?.message ?? "Stage 1 synthesis failed"));
        return;
      }

      if (!stage1Succeeded || mainSignal.aborted) return;

      // ── STAGE 2: Background full synthesis ─────────────────────────────────
      console.log("[SYNTH:stage2:start]", { conceptCount: input.rankedConcepts.length });
      setStage2Status("loading");

      const s2Ctrl = new AbortController();
      mainSignal.addEventListener("abort", () => s2Ctrl.abort(), { once: true });
      const s2Timer = setTimeout(() => {
        console.warn("[SYNTH:stage2:timeout]");
        s2Ctrl.abort();
      }, STAGE2_TIMEOUT_MS);

      try {
        const s2 = await synthesizeTeachingOutput(input, s2Ctrl.signal);
        clearTimeout(s2Timer);
        if (mainSignal.aborted) return;
        console.log("[SYNTH:stage2:done]", {
          coreIdea:     s2.coreIdea?.slice(0, 60),
          mechanism:    s2.mechanism?.slice(0, 60),
          conceptCount: s2.concepts?.length ?? 0,
          anchorCount:  s2.highlightAnchors?.length ?? 0,
        });
        setSynthesis(s2);
        setStage2Status("success");
      } catch (err: any) {
        clearTimeout(s2Timer);
        if (mainSignal.aborted) return;

        const isS2Timeout = s2Ctrl.signal.aborted && !mainSignal.aborted;
        if (isS2Timeout) {
          // One retry with top-2 concepts only
          console.log("[SYNTH:stage2:retry]", { reducedConcepts: 2 });
          const reducedInput = { ...input, rankedConcepts: input.rankedConcepts.slice(0, 2) };
          const retryCtrl  = new AbortController();
          mainSignal.addEventListener("abort", () => retryCtrl.abort(), { once: true });
          const retryTimer = setTimeout(() => retryCtrl.abort(), STAGE2_RETRY_TIMEOUT_MS);
          try {
            const retry = await synthesizeTeachingOutput(reducedInput, retryCtrl.signal);
            clearTimeout(retryTimer);
            if (mainSignal.aborted) return;
            setSynthesis(retry);
            setStage2Status("success");
          } catch {
            clearTimeout(retryTimer);
            console.warn("[SYNTH:stage2:retry-failed]");
            setStage2Status("error");
            // Stage 1 stub remains — no user-visible error for stage 2 failure
          }
        } else {
          console.warn("[SYNTH:stage2:error]", err?.message ?? String(err));
          setStage2Status("error");
          // Stage 1 stub remains
        }
      }
    }

    runStages();

    return () => {
      mainCtrl.abort();
      abortRef.current = null;
    };
  // Re-fire only when page identity changes or blocks become available
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageTruthKey, enabled, blocks.length > 0]);

  return { synthesis, status, stage1Status, stage2Status, errorMessage };
}
