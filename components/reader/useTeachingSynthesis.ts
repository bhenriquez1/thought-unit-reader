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
  pageText?: string;
  domain: PageDomain | null;
  blocks: UltraConceptBlock[];
  enabled: boolean;
  pageNumber?: number;
}

// Stage 1 must survive main-thread contention during large full-book extraction
// (a 1000+ page upload can keep the event loop busy for tens of seconds). 25s gives
// the small Stage 1 request headroom to resolve even while the book is still parsing.
const STAGE1_TIMEOUT_MS       = 25_000;
const STAGE2_TIMEOUT_MS       = 40_000;
const STAGE2_RETRY_TIMEOUT_MS = 25_000;

export function useTeachingSynthesis({
  pageTruthKey,
  pageObjective,
  pageThesis,
  pageSummary,
  pageText,
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

  // Keep a ref for values that MUST NOT re-trigger synthesis when they change.
  // Background book extraction updates pageText/enabled/domain on every extracted
  // page, which previously caused enabled to flicker and abort Stage 1 mid-flight.
  // Reading from refs inside the effect avoids that — only pageTruthKey and
  // blocks.length>0 control when synthesis starts.
  const enabledRef      = useRef(enabled);
  const domainRef       = useRef(domain);
  const blocksRef       = useRef(blocks);
  const pageObjectiveRef = useRef(pageObjective);
  const pageThesisRef   = useRef(pageThesis);
  const pageSummaryRef  = useRef(pageSummary);
  const pageTextRef     = useRef(pageText);
  const pageNumberRef   = useRef(pageNumber);
  useEffect(() => { enabledRef.current = enabled; },       [enabled]);
  useEffect(() => { domainRef.current = domain; },         [domain]);
  useEffect(() => { blocksRef.current = blocks; },         [blocks]);
  useEffect(() => { pageObjectiveRef.current = pageObjective; }, [pageObjective]);
  useEffect(() => { pageThesisRef.current = pageThesis; }, [pageThesis]);
  useEffect(() => { pageSummaryRef.current = pageSummary; }, [pageSummary]);
  useEffect(() => { pageTextRef.current = pageText; },     [pageText]);
  useEffect(() => { pageNumberRef.current = pageNumber; }, [pageNumber]);

  useEffect(() => {
    setSynthesis(null);
    setStatus("idle");
    setStage1Status("idle");
    setStage2Status("idle");
    setErrorMessage(null);

    // Read live values from refs — not from the effect closure.
    // This means a mid-extraction enabled/domain/pageText update never restarts synthesis.
    const _enabled   = enabledRef.current;
    const _domain    = domainRef.current;
    const _blocks    = blocksRef.current;

    // Math blocks often have short formula patterns (e.g. "lim f(x) = L").
    const usableBlocks = _blocks.filter((b) => {
      const patLen = b.pattern?.length ?? 0;
      if (patLen >= 20) return true;
      if (_domain === "math" && patLen >= 6 && (b.title?.length ?? 0) >= 4) return true;
      return false;
    });

    console.log("[SYNTH:lifecycle]", {
      enabled: _enabled,
      pageTruthKey,
      usableBlockCount: usableBlocks.length,
      totalBlocks: _blocks.length,
      domain: _domain,
      hasPageThesis:    !!pageThesisRef.current,
      hasPageSummary:   !!pageSummaryRef.current,
      hasPageObjective: !!pageObjectiveRef.current,
    });

    if (!_enabled || !usableBlocks.length) {
      console.log("[SYNTH:skip]", { reason: !_enabled ? "disabled" : "no usable blocks" });
      return;
    }

    const safeDomain = _domain ?? "general";
    const input = buildSynthesisInput(
      usableBlocks, safeDomain,
      pageObjectiveRef.current, pageThesisRef.current,
      pageSummaryRef.current, pageNumberRef.current, pageTextRef.current,
    );

    const inputCharCount =
      (pageTextRef.current?.length ?? 0) +
      input.rankedConcepts.reduce((s, c) => s + (c.text?.length ?? 0), 0);

    console.log("[SYNTH_INPUT]", {
      page: pageNumberRef.current ?? null,
      charCount: inputCharCount,
      conceptCount: input.rankedConcepts.length,
      pageTextChars: pageTextRef.current?.length ?? 0,
      pageTruthKey,
    });

    if (inputCharCount > 50_000) {
      console.error("[SYNTH_INPUT] PAYLOAD TOO LARGE — book text leaked into synthesis", { inputCharCount });
    }

    const mainCtrl = new AbortController();
    abortRef.current = mainCtrl;
    const mainSignal = mainCtrl.signal;

    async function runStages() {
      // ── STAGE 1: Fast ──────────────────────────────────────────────────────
      console.log("[SYNTH_STAGE1_START]", { pageTruthKey, page: pageNumberRef.current, conceptCount: input.rankedConcepts.length });
      setStage1Status("loading");
      setStatus("loading");

      const s1Ctrl = new AbortController();
      mainSignal.addEventListener("abort", () => {
        console.warn("[SYNTH_ABORT_REASON]", { stage: 1, reason: "pageTruthKey changed — new page navigation" });
        s1Ctrl.abort();
      }, { once: true });
      const s1Timer = setTimeout(() => {
        console.warn("[SYNTH:stage1:timeout]", { elapsed: STAGE1_TIMEOUT_MS });
        console.warn("[SYNTH_ABORT_REASON]", { stage: 1, reason: `Stage 1 timeout after ${STAGE1_TIMEOUT_MS}ms` });
        s1Ctrl.abort();
      }, STAGE1_TIMEOUT_MS);

      let stage1Succeeded = false;
      try {
        const s1 = await synthesizeStage1Output(input, s1Ctrl.signal);
        clearTimeout(s1Timer);
        if (mainSignal.aborted) return;
        console.log("[SYNTH_STAGE1_DONE]", {
          page: pageNumberRef.current,
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
        const label = isAbort ? "[SYNTH:stage1:timeout]" : "[SYNTH:stage1:error]";
        console.error(label, err?.message ?? String(err));
        setStage1Status("error");
        setStatus("error");
        setErrorMessage(isAbort
          ? "Synthesis timed out — try a different page or reload."
          : (err?.message ?? "Stage 1 synthesis failed"));
        return;
      }

      if (!stage1Succeeded || mainSignal.aborted) return;

      // ── STAGE 2: Background full synthesis ─────────────────────────────────
      console.log("[SYNTH_STAGE2_START]", { page: pageNumberRef.current, conceptCount: input.rankedConcepts.length });
      setStage2Status("loading");

      const s2Ctrl = new AbortController();
      mainSignal.addEventListener("abort", () => {
        console.warn("[SYNTH_ABORT_REASON]", { stage: 2, reason: "pageTruthKey changed — new page navigation" });
        s2Ctrl.abort();
      }, { once: true });
      const s2Timer = setTimeout(() => {
        console.warn("[SYNTH:stage2:timeout]");
        s2Ctrl.abort();
      }, STAGE2_TIMEOUT_MS);

      try {
        const s2 = await synthesizeTeachingOutput(input, s2Ctrl.signal);
        clearTimeout(s2Timer);
        if (mainSignal.aborted) return;
        console.log("[SYNTH_STAGE2_DONE]", {
          page: pageNumberRef.current,
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
          }
        } else {
          console.warn("[SYNTH:stage2:error]", err?.message ?? String(err));
          setStage2Status("error");
        }
      }
    }

    runStages();

    return () => {
      console.warn("[SYNTH_ABORT_REASON]", { reason: "effect cleanup — pageTruthKey changed or blocks cleared" });
      mainCtrl.abort();
      abortRef.current = null;
    };
  // Only pageTruthKey and blocks presence control synthesis restarts.
  // enabled/domain/pageText/pageSummary changes (e.g. from background extraction)
  // are read from refs inside the effect and do NOT abort an in-flight Stage 1.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageTruthKey, blocks.length > 0]);

  return { synthesis, status, stage1Status, stage2Status, errorMessage };
}
