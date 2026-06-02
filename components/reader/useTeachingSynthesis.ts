// components/reader/useTeachingSynthesis.ts
// Two-stage teaching synthesis — progressive rendering without blocking the panel.
//
// STAGE 1 (fast, ~1–3s): coreIdea + highlightAnchors + miniTestItems
//   → Panel renders immediately with thesis, highlights, mini-test.
//
// STAGE 2 (background, ~5–15s): full study notes, concept blocks, videos, links
//   → Fills in progressively. On timeout: retries once with reduced context.
//   → Stage 2 failure is non-blocking — Stage 1 content stays visible.
//
// ABORT MODEL (critical):
//   - Synthesis is aborted ONLY when pageTruthKey changes (real page navigation).
//   - Background full-book extraction updates `enabled`/`pageText`/`blocks` many
//     times per second; those updates must NEVER abort an in-flight request.
//   - Effect A (deps: [pageTruthKey]) resets state + aborts the old page's request.
//   - Effect B (deps: [pageTruthKey, enabled, blocksReady]) STARTS synthesis once
//     per page when ready. It never aborts on cleanup, so enabled flicker is safe.

import { useCallback, useEffect, useRef, useState } from "react";
import type { PageDomain } from "@/lib/insights/detectPageDomain";
import type { UltraConceptBlock } from "@/lib/insights/buildUltraPageView";
import type { TeachingSynthesis } from "@/lib/insights/synthesizeTeachingOutput";
import {
  synthesizeTeachingOutput,
  synthesizeStage1Output,
  makeStubFromStage1,
  buildSynthesisInput,
} from "@/lib/insights/synthesizeTeachingOutput";
import { cleanActivePageText, cleanThesisLine } from "@/lib/insights/cleanActivePageText";
import { fetchClaudeEnrichment } from "@/lib/insights/claudeEnrichmentClient";
import type { ClaudeEnrichmentOutput } from "@/lib/insights/claudeEnrichmentClient";

export type SynthesisStatus = "idle" | "loading" | "success" | "error";

export interface UseTeachingSynthesisResult {
  synthesis: TeachingSynthesis | null;
  status: SynthesisStatus;        // panel-level: "success" as soon as stage1 done
  stage1Status: SynthesisStatus;
  stage2Status: SynthesisStatus;
  stage3Status: SynthesisStatus;
  errorMessage: string | null;
  /** Re-trigger synthesis for the current page (e.g. after a network failure). */
  retry: () => void;
  /** Claude enrichment fields — available after Stage 3 completes. */
  claudeEnrichment: ClaudeEnrichmentOutput | null;
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

// Stage 1 is page-text-first and now returns the full study card (thesis + study fields).
// 12s gives gpt-4o headroom; if it times out, the local fallback attaches.
const STAGE1_TIMEOUT_MS       = 12_000;
// Stage 2 enriches an already-visible Stage 1 result — non-blocking timeout.
// If it times out, Stage 1 notes remain on screen.
const STAGE2_TIMEOUT_MS       = 20_000;
const STAGE2_RETRY_TIMEOUT_MS = 12_000;

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
  const [synthesis,        setSynthesis]        = useState<TeachingSynthesis | null>(null);
  const [status,           setStatus]           = useState<SynthesisStatus>("idle");
  const [stage1Status,     setStage1Status]     = useState<SynthesisStatus>("idle");
  const [stage2Status,     setStage2Status]     = useState<SynthesisStatus>("idle");
  const [stage3Status,     setStage3Status]     = useState<SynthesisStatus>("idle");
  const [claudeEnrichment, setClaudeEnrichment] = useState<ClaudeEnrichmentOutput | null>(null);
  const [errorMessage,     setErrorMessage]     = useState<string | null>(null);
  // Incremented by retry() — Effect B re-runs, startedKeyRef guard cleared first.
  const [retryCount,   setRetryCount]   = useState(0);

  // Abort controller for the in-flight request; aborted ONLY on page change.
  const abortRef = useRef<AbortController | null>(null);
  // The pageTruthKey we've already started synthesis for — prevents duplicate runs
  // when enabled/blocks re-fire Effect B for the same page.
  const startedKeyRef = useRef<string | null>(null);
  // Wall-clock ms when Stage 1 started — used to log elapsed time at each stage.
  const synthStartMsRef = useRef<number>(0);

  // Live refs for the non-identity inputs. buildSynthesisInput reads these so that
  // a value arriving slightly after Stage 1 starts is still picked up, without
  // those values being effect dependencies (which would cause aborts/restarts).
  const domainRef        = useRef(domain);
  const blocksRef        = useRef(blocks);
  const pageObjectiveRef = useRef(pageObjective);
  const pageThesisRef    = useRef(pageThesis);
  const pageSummaryRef   = useRef(pageSummary);
  const pageTextRef      = useRef(pageText);
  const pageNumberRef    = useRef(pageNumber);
  domainRef.current        = domain;
  blocksRef.current        = blocks;
  pageObjectiveRef.current = pageObjective;
  pageThesisRef.current    = pageThesis;
  pageSummaryRef.current   = pageSummary;
  pageTextRef.current      = pageText;
  pageNumberRef.current    = pageNumber;

  // Re-trigger synthesis for the current page (e.g. after a network failure).
  // Clears startedKeyRef so Effect B's guard allows a fresh run.
  const retry = useCallback(() => {
    setSynthesis(null);
    setStatus("idle");
    setStage1Status("idle");
    setStage2Status("idle");
    setStage3Status("idle");
    setClaudeEnrichment(null);
    setErrorMessage(null);
    startedKeyRef.current = null;
    synthStartMsRef.current = 0;
    setRetryCount(c => c + 1);
  }, []);

  // ── Effect A: page identity changed → reset + abort old request ────────────
  useEffect(() => {
    setSynthesis(null);
    setStatus("idle");
    setStage1Status("idle");
    setStage2Status("idle");
    setStage3Status("idle");
    setClaudeEnrichment(null);
    setErrorMessage(null);
    startedKeyRef.current = null;
    synthStartMsRef.current = 0;
    return () => {
      if (abortRef.current) {
        console.warn("[SYNTH_ABORT_REASON]", { reason: "pageTruthKey changed — new page navigation", pageTruthKey });
        abortRef.current.abort();
        abortRef.current = null;
      }
    };
  }, [pageTruthKey]);

  // ── Effect B: start synthesis once per page when enabled + blocks ready ─────
  // No abort in this effect's cleanup — enabled/blocks flicker must not kill a run.
  useEffect(() => {
    if (!enabled) {
      console.log("[SYNTH:skip]", { reason: "disabled", pageTruthKey });
      return;
    }
    const hasBlocksOrText = blocks.length > 0 || (pageText?.length ?? 0) > 500;
    if (!hasBlocksOrText) {
      console.log("[SYNTH:skip]", { reason: "no blocks and insufficient page text", pageTruthKey });
      return;
    }
    if (startedKeyRef.current === pageTruthKey) {
      return; // already started for this page — do not restart on flicker
    }

    const _domain = domainRef.current;
    const _blocks = blocksRef.current;

    // Clean the active page text BEFORE anything reads it: strip page numbers,
    // UNIT/chapter running headers, and copyright/footer debris that would
    // otherwise pollute the Page Thesis. Body text, headings, math lines kept.
    const _pageText = cleanActivePageText(pageTextRef.current, "synth");
    // Thesis/objective carried as context can themselves be header debris
    // (e.g. "30 UNIT ONE The Chemistry of Life") — clean them too.
    const _pageThesis    = cleanThesisLine(pageThesisRef.current);
    const _pageObjective = cleanThesisLine(pageObjectiveRef.current);

    // Math blocks often have short formula patterns (e.g. "lim f(x) = L").
    const usableBlocks = _blocks.filter((b) => {
      const patLen = b.pattern?.length ?? 0;
      if (patLen >= 20) return true;
      if (_domain === "math" && patLen >= 6 && (b.title?.length ?? 0) >= 4) return true;
      return false;
    });

    // Text-first fallback threshold: page must have enough CLEAN body text to be
    // worth synthesizing from text alone.
    const hasEnoughText = _pageText.length > 500;

    console.log("[SYNTH_PREFLIGHT]", {
      page: pageNumberRef.current ?? null,
      charCount: _pageText.length,
      blockCount: _blocks.length,
      usableBlockCount: usableBlocks.length,
      textPreview: _pageText.slice(0, 100) || null,
      skipReason: !usableBlocks.length && !hasEnoughText ? "no usable blocks and insufficient clean text" : null,
    });

    if (!usableBlocks.length && !hasEnoughText) {
      // Don't mark as started — allow a later render (more/better blocks or text) to try.
      console.log("[SYNTH:skip]", { reason: "no usable blocks and insufficient page text", totalBlocks: _blocks.length, pageTextChars: _pageText.length, pageTruthKey });
      return;
    }

    const safeDomain = _domain ?? "general";

    // ── Stage 1 input: page-text-first, independent of heuristic block pipeline ──
    // Stage 1 never waits for usableBlocks. Page text IS the primary source.
    // An empty rankedConcepts array is accepted by the server when pageText is present.
    const stage1Input = {
      domain:         safeDomain,
      pageObjective:  _pageObjective,
      pageThesis:     _pageThesis,
      pageSummary:    pageSummaryRef.current,
      pageNumber:     pageNumberRef.current,
      pageText:       _pageText.slice(0, 1500) || undefined,
      rankedConcepts: [] as ReturnType<typeof buildSynthesisInput>["rankedConcepts"],
    };

    console.log("[SYNTH_FALLBACK_PAGE_TEXT]", {
      page: pageNumberRef.current ?? null,
      charCount: _pageText.length,
      textPreview: _pageText.slice(0, 100) || null,
      pageTruthKey,
    });

    // ── Stage 2 input: enrich with concept blocks if the heuristic pipeline found any ──
    // When blocks exist, they give Stage 2 richer concept context for deeper study fields.
    // When blocks are absent, Stage 2 uses synthetic text chunks as before.
    let stage2Input: ReturnType<typeof buildSynthesisInput>;

    if (usableBlocks.length > 0) {
      stage2Input = buildSynthesisInput(
        usableBlocks, safeDomain,
        _pageObjective, _pageThesis,
        pageSummaryRef.current, pageNumberRef.current, _pageText || undefined,
      );
    } else {
      // Text-fallback: derive synthetic concept chunks for Stage 2 context.
      const chunkSize = Math.ceil(_pageText.length / 3);
      const chunks = [
        _pageText.slice(0, chunkSize),
        _pageText.slice(chunkSize, chunkSize * 2),
        _pageText.slice(chunkSize * 2),
      ].filter((c) => c.trim().length >= 40).sort((a, b) => b.length - a.length).slice(0, 3);

      const syntheticConcepts = chunks.map((chunk, i) => ({
        title: i === 0 ? "Page Content" : `Section ${i + 1}`,
        role: "detail" as const,
        text: chunk.trim().slice(0, 600),
        importance: i === 0 ? "high" : "medium",
      }));

      stage2Input = {
        domain:         safeDomain,
        pageObjective:  _pageObjective,
        pageThesis:     _pageThesis,
        pageSummary:    pageSummaryRef.current,
        pageNumber:     pageNumberRef.current,
        pageText:       _pageText.slice(0, 1500) || undefined,
        rankedConcepts: syntheticConcepts,
      };
    }

    console.log("[SYNTH_INPUT]", {
      page:          pageNumberRef.current ?? null,
      textChars:     _pageText.length,
      textPreview:   _pageText.slice(0, 100) || null,
      stage1Concepts: 0,
      stage2Concepts: stage2Input.rankedConcepts.length,
      pageTruthKey,
    });

    // Mark started and create the request controller (aborted only by Effect A).
    startedKeyRef.current = pageTruthKey;
    const mainCtrl = new AbortController();
    abortRef.current = mainCtrl;
    const mainSignal = mainCtrl.signal;

    async function runStages() {
      // ── STAGE 1 ──────────────────────────────────────────────────────────
      synthStartMsRef.current = Date.now();
      console.log("[OPENAI_STAGE1_START]", { page: pageNumberRef.current, charCount: _pageText.length, mode: "page-text-first" });
      console.log("[SYNTH_STAGE1_START]", { page: pageNumberRef.current, pageTruthKey, mode: "page-text-first", charCount: _pageText.length });
      setStage1Status("loading");
      setStatus("loading");

      const s1Ctrl = new AbortController();
      mainSignal.addEventListener("abort", () => s1Ctrl.abort(), { once: true });
      const s1Timer = setTimeout(() => {
        console.warn("[SYNTH_ABORT_REASON]", { stage: 1, reason: `Stage 1 timeout after ${STAGE1_TIMEOUT_MS}ms` });
        s1Ctrl.abort();
      }, STAGE1_TIMEOUT_MS);

      let stage1Succeeded = false;
      try {
        const s1 = await synthesizeStage1Output(stage1Input, s1Ctrl.signal);
        clearTimeout(s1Timer);
        if (mainSignal.aborted) return;
        // Log raw OpenAI output AND which fields will be filled from pageText (vs came from OpenAI)
        console.log("[OPENAI_STAGE1_DONE]", {
          source:          "openai",
          page:            pageNumberRef.current,
          elapsedMs:       Date.now() - synthStartMsRef.current,
          coreIdea:        s1.coreIdea?.slice(0, 100),
          whyThisMatters:  s1.whyThisMatters?.slice(0, 100) ?? null,
          keyMechanism:    s1.keyMechanism?.slice(0, 100) ?? null,
          commonConfusion: s1.commonConfusion?.slice(0, 100) ?? null,
          quickMemory:     s1.quickMemory?.slice(0, 100) ?? null,
          // Which fields OpenAI left null — these will be filled from pageText sentences
          filledFromPageText: {
            whyThisMatters:  s1.whyThisMatters  === null,
            keyMechanism:    s1.keyMechanism    === null,
            commonConfusion: s1.commonConfusion === null,
          },
        });
        console.log("[RIGHT_PANEL_SOURCE]", { source: "openai_stage1", page: pageNumberRef.current, elapsedMs: Date.now() - synthStartMsRef.current });
        // Raw Stage 1 output — proves exactly what OpenAI returned before any mapping
        console.log("[SYNTH_STAGE1_RAW]", {
          page:            pageNumberRef.current,
          elapsedMs:       Date.now() - synthStartMsRef.current,
          coreIdea:        s1.coreIdea?.slice(0, 100),
          whyThisMatters:  s1.whyThisMatters?.slice(0, 100) ?? null,
          keyMechanism:    s1.keyMechanism?.slice(0, 100) ?? null,
          commonConfusion: s1.commonConfusion?.slice(0, 100) ?? null,
          quickMemory:     s1.quickMemory?.slice(0, 100) ?? null,
          anchors:         s1.highlightAnchors?.length ?? 0,
          miniTest:        s1.miniTestItems?.length ?? 0,
        });
        const stub = makeStubFromStage1(s1, _pageText);
        // Mapped stub — proves what fields makeStubFromStage1 wrote to TeachingSynthesis
        console.log("[SYNTH_STAGE1_FIELDS]", {
          page:               pageNumberRef.current,
          mechanism:          stub.mechanism?.slice(0, 100) ?? null,
          application:        stub.application?.slice(0, 100) ?? null,
          misconceptionAlert: stub.misconceptionAlert?.slice(0, 100) ?? null,
          memoryAnchor:       stub.memoryAnchor?.slice(0, 100) ?? null,
          trap:               stub.trap?.slice(0, 100) ?? null,
        });
        console.log("[SYNTH_STAGE1_DONE]", {
          page:           pageNumberRef.current,
          elapsedMs:      Date.now() - synthStartMsRef.current,
          coreIdea:       s1.coreIdea?.slice(0, 60),
          whyThisMatters: !!s1.whyThisMatters,
          keyMechanism:   !!s1.keyMechanism,
          commonConfusion: !!s1.commonConfusion,
          quickMemory:    !!s1.quickMemory,
          anchors:        s1.highlightAnchors?.length ?? 0,
          miniTest:       s1.miniTestItems?.length ?? 0,
        });
        setStage1Status("success");
        setSynthesis(stub);
        setStatus("success");
        stage1Succeeded = true;
      } catch (err: any) {
        clearTimeout(s1Timer);
        if (mainSignal.aborted) return;
        const isAbort = s1Ctrl.signal.aborted || err?.name === "AbortError";
        console.error("[SYNTH_STAGE1_ERROR]", { isAbort, message: err?.message ?? String(err), page: pageNumberRef.current });

        // Fallback disabled — OpenAI is the sole source of study notes.
        // Log what would have been shown so we can diagnose quality separately.
        console.log("[OPENAI_STAGE1_FALLBACK_USED]", {
          source:    "suppressed",
          page:      pageNumberRef.current,
          reason:    isAbort ? "stage1-timeout-or-abort" : "stage1-network-error",
          message:   (err as Error)?.message?.slice(0, 100) ?? "unknown",
          charCount: _pageText.length,
          note:      "fallback disabled — showing error UI instead",
        });
        console.log("[RIGHT_PANEL_SOURCE]", { source: "none", page: pageNumberRef.current, reason: "stage1-failed-no-fallback" });
        setStage1Status("error");
        setStatus("error");
        setErrorMessage(isAbort
          ? "OpenAI synthesis timed out — retry to try again."
          : "OpenAI synthesis failed — retry to try again.");
        return;
      }

      if (!stage1Succeeded || mainSignal.aborted) return;

      // ── STAGE 2 ──────────────────────────────────────────────────────────
      console.log("[OPENAI_STAGE2_START]", { page: pageNumberRef.current, conceptCount: stage2Input.rankedConcepts.length, elapsedMs: Date.now() - synthStartMsRef.current });
      console.log("[SYNTH_STAGE2_START]", { page: pageNumberRef.current, conceptCount: stage2Input.rankedConcepts.length, elapsedMs: Date.now() - synthStartMsRef.current });
      setStage2Status("loading");

      const s2Ctrl = new AbortController();
      mainSignal.addEventListener("abort", () => s2Ctrl.abort(), { once: true });
      const s2Timer = setTimeout(() => {
        console.warn("[SYNTH_ABORT_REASON]", { stage: 2, reason: `Stage 2 timeout after ${STAGE2_TIMEOUT_MS}ms` });
        s2Ctrl.abort();
      }, STAGE2_TIMEOUT_MS);

      try {
        const s2 = await synthesizeTeachingOutput(stage2Input, s2Ctrl.signal);
        clearTimeout(s2Timer);
        if (mainSignal.aborted) return;
        console.log("[OPENAI_STAGE2_DONE]", {
          source:       "openai",
          page:         pageNumberRef.current,
          elapsedMs:    Date.now() - synthStartMsRef.current,
          coreIdea:     s2.coreIdea?.slice(0, 80),
          mechanism:    s2.mechanism?.slice(0, 80) ?? null,
          application:  s2.application?.slice(0, 80) ?? null,
          conceptCount: s2.concepts?.length ?? 0,
          anchorCount:  s2.highlightAnchors?.length ?? 0,
        });
        console.log("[RIGHT_PANEL_SOURCE]", { source: "openai_stage2", page: pageNumberRef.current, elapsedMs: Date.now() - synthStartMsRef.current });
        console.log("[SYNTH_STAGE2_DONE]", {
          page: pageNumberRef.current,
          elapsedMs: Date.now() - synthStartMsRef.current,
          coreIdea:     s2.coreIdea?.slice(0, 60),
          mechanism:    s2.mechanism?.slice(0, 60),
          conceptCount: s2.concepts?.length ?? 0,
          anchorCount:  s2.highlightAnchors?.length ?? 0,
        });
        // Log BEFORE applying — proves what Stage 2 returned before merge.
        console.log("[STAGE2_APPLY]", {
          page:              pageNumberRef.current,
          conceptBlockCount: s2.concepts?.length ?? 0,
          studyFieldCount:   [s2.mechanism, s2.application, s2.misconceptionAlert, s2.memoryAnchor, s2.trap].filter(Boolean).length,
          coreIdea:          s2.coreIdea?.slice(0, 80) ?? null,
          mechanism:         s2.mechanism?.slice(0, 80) ?? null,
          application:       s2.application?.slice(0, 80) ?? null,
          misconceptionAlert:s2.misconceptionAlert?.slice(0, 80) ?? null,
          memoryAnchor:      s2.memoryAnchor?.slice(0, 80) ?? null,
          elapsedMs:         Date.now() - synthStartMsRef.current,
        });
        // Merge Stage 2 into Stage 1 — never discard a non-null Stage 1 study field
        // with a null/empty Stage 2 value. Stage 2 enriches; Stage 1 remains the floor.
        setSynthesis(prev => {
          if (!prev) return s2;
          return {
            ...s2,
            mechanism:          s2.mechanism          || prev.mechanism,
            application:        s2.application        || prev.application,
            misconceptionAlert: s2.misconceptionAlert ?? prev.misconceptionAlert,
            memoryAnchor:       s2.memoryAnchor       ?? prev.memoryAnchor,
            trap:               s2.trap               ?? prev.trap,
            // Keep Stage 1 highlights/test items if Stage 2 didn't return any
            highlightAnchors:   s2.highlightAnchors   ?? prev.highlightAnchors,
            miniTestItems:      s2.miniTestItems       ?? prev.miniTestItems,
            preReadRecallItems: s2.preReadRecallItems  ?? prev.preReadRecallItems,
          };
        });
        setStage2Status("success");
      } catch (err: any) {
        clearTimeout(s2Timer);
        if (mainSignal.aborted) return;

        const isS2Timeout = s2Ctrl.signal.aborted && !mainSignal.aborted;
        if (isS2Timeout) {
          console.log("[SYNTH:stage2:retry]", { reducedConcepts: 2 });
          const reducedInput = { ...stage2Input, rankedConcepts: stage2Input.rankedConcepts.slice(0, 2) };
          const retryCtrl  = new AbortController();
          mainSignal.addEventListener("abort", () => retryCtrl.abort(), { once: true });
          const retryTimer = setTimeout(() => retryCtrl.abort(), STAGE2_RETRY_TIMEOUT_MS);
          try {
            const retry = await synthesizeTeachingOutput(reducedInput, retryCtrl.signal);
            clearTimeout(retryTimer);
            if (mainSignal.aborted) return;
            setSynthesis(prev => {
              if (!prev) return retry;
              return {
                ...retry,
                mechanism:          retry.mechanism          || prev.mechanism,
                application:        retry.application        || prev.application,
                misconceptionAlert: retry.misconceptionAlert ?? prev.misconceptionAlert,
                memoryAnchor:       retry.memoryAnchor       ?? prev.memoryAnchor,
                trap:               retry.trap               ?? prev.trap,
                highlightAnchors:   retry.highlightAnchors   ?? prev.highlightAnchors,
                miniTestItems:      retry.miniTestItems       ?? prev.miniTestItems,
                preReadRecallItems: retry.preReadRecallItems  ?? prev.preReadRecallItems,
              };
            });
            setStage2Status("success");
          } catch (retryErr: any) {
            clearTimeout(retryTimer);
            console.error("[SYNTH_STAGE2_ERROR]", { page: pageNumberRef.current, phase: "retry", message: retryErr?.message ?? String(retryErr) });
            console.log("[OPENAI_STAGE2_FALLBACK_USED]", { source: "fallback", page: pageNumberRef.current, reason: "Stage 2 retry also failed — keeping Stage 1 content", message: (retryErr as Error)?.message?.slice(0, 100) ?? "unknown" });
            console.log("[RIGHT_PANEL_SOURCE]", { source: "openai_stage1", page: pageNumberRef.current, note: "stage2-retry-failed, stage1 retained" });
            setStage2Status("error");
          }
        } else {
          console.error("[SYNTH_STAGE2_ERROR]", { page: pageNumberRef.current, phase: "initial", message: err?.message ?? String(err) });
          console.log("[OPENAI_STAGE2_FALLBACK_USED]", { source: "fallback", page: pageNumberRef.current, reason: "Stage 2 failed — keeping Stage 1 content", message: (err as Error)?.message?.slice(0, 100) ?? "unknown" });
          console.log("[RIGHT_PANEL_SOURCE]", { source: "openai_stage1", page: pageNumberRef.current, note: "stage2-failed, stage1 retained" });
          setStage2Status("error");
        }
      }

      // ── STAGE 3 (Claude enrichment) ──────────────────────────────────────
      // Fires after Stage 2 resolves (success or failure). Uses the latest
      // synthesis snapshot to build the enrichment input. Non-blocking — Stage
      // 1/2 content is already visible. Aborted on page change via mainSignal.
      if (mainSignal.aborted) return;
      setStage3Status("loading");

      // Read the current synthesis state via a one-shot functional update so we
      // don't need synthesis in the effect dependency array.
      let enrichmentInput: Parameters<typeof fetchClaudeEnrichment>[0] | null = null;
      setSynthesis(prev => {
        if (prev?.coreIdea) {
          enrichmentInput = {
            pageType:        (prev as any).pageType ?? "mixed",
            pageThesis:      prev.coreIdea,
            whyThisMatters:  prev.application ?? null,
            keyMechanism:    prev.mechanism   ?? null,
            commonConfusion: prev.misconceptionAlert ?? prev.trap ?? null,
            conceptTitles:   (prev.concepts ?? []).map((c: any) => c.title).filter(Boolean).slice(0, 5),
            domain:          safeDomain,
            pageNumber:      pageNumberRef.current,
          };
        }
        return prev; // no state change — read-only snapshot
      });

      // Wait a tick so the functional update above has committed before we read enrichmentInput.
      await new Promise<void>(resolve => setTimeout(resolve, 0));

      if (!enrichmentInput || mainSignal.aborted) {
        setStage3Status("error");
        return;
      }

      const s3Ctrl = new AbortController();
      mainSignal.addEventListener("abort", () => s3Ctrl.abort(), { once: true });

      try {
        console.log("[CLAUDE_STAGE3_START]", { page: pageNumberRef.current, elapsedMs: Date.now() - synthStartMsRef.current });
        const enrichment = await fetchClaudeEnrichment(enrichmentInput, s3Ctrl.signal);
        if (mainSignal.aborted) return;
        const hasAnyField = !!(enrichment.deepInsight || enrichment.alternativeExplanation || enrichment.subjectConnection || enrichment.expertView);
        console.log("[CLAUDE_STAGE3_DONE]", {
          page:                   pageNumberRef.current,
          elapsedMs:              Date.now() - synthStartMsRef.current,
          hasAnyField,
          deepInsight:            enrichment.deepInsight?.slice(0, 80) ?? null,
          alternativeExplanation: enrichment.alternativeExplanation?.slice(0, 80) ?? null,
          subjectConnection:      enrichment.subjectConnection?.slice(0, 80) ?? null,
          expertView:             enrichment.expertView?.slice(0, 80) ?? null,
        });
        if (hasAnyField) setClaudeEnrichment(enrichment);
        setStage3Status("success");
      } catch (err: any) {
        if (mainSignal.aborted) return;
        console.error("[CLAUDE_STAGE3_ERROR]", { page: pageNumberRef.current, message: err?.message ?? String(err) });
        setStage3Status("error");
      }
    }

    runStages();

  // enabled + blocks/text readiness drive starts; startedKeyRef guards against repeats.
  // retryCount triggers re-runs after explicit user retry.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageTruthKey, enabled, blocks.length > 0, (pageText?.length ?? 0) > 500, retryCount]);

  return { synthesis, status, stage1Status, stage2Status, stage3Status, errorMessage, retry, claudeEnrichment };
}
