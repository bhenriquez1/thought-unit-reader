// components/reader/useSurgeonAnnotations.ts
const DEV = process.env.NODE_ENV === "development";
// SurgeonAnnotationPlan trigger hook — OpenAI reads the current page fresh and
// proposes meaning; this hook verifies it, converts it to HighlightTarget[] (the
// same shape SmartPDFViewer already resolves to PDF coordinates for the older
// highlightAnchors pipeline), and hands it off. SmartPDFViewer does the geometry
// resolution and drawing — this hook never touches coordinates.
//
// Modeled on useTeachingSynthesis.ts's Effect A/B split:
//   Effect A (deps: [pageTruthKey]) — reset state, try the IDB cache first so
//     cached annotations are visible before any network call, abort in-flight
//     requests only on real page navigation.
//   Effect B (deps: [pageTruthKey, domain, semanticPack.id, enabled, hasPageText])
//     — starts a fetch once per (page, domain, pack) combination. UNLIKE
//     useTeachingSynthesis, domain/semanticPack.id are REAL reactive deps here —
//     a pack/domain change on an already-open page must retrigger analysis.
//
// Trigger rules (only): first open (no fresh cache hit), domain/semantic-pack
// change, explicit reanalyze(), or a stale cache-key version (handled entirely by
// lib/insights/annotationPlanCache.ts's versioned key — a version bump is just a
// cache miss, no special-case code needed here).
// Never triggers on: zoom, scroll, panel toggles, thought-unit clicks — none of
// those states are read by either effect.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PageDomain } from "@/lib/insights/detectPageDomain";
import type { SemanticPack } from "@/lib/semantic/types";
import type { HighlightTarget } from "@/lib/readerContracts";
import type { SurgeonAnnotationPlan, CanonicalType, Importance } from "@/lib/insights/pageAnnotationPlan";
import { buildSurgeonAnnotationInput, type ExistingCanonicalUnitContext } from "@/lib/insights/buildSurgeonAnnotationInput";
import { groundSurgeonQuotes, buildSurgeonEvidenceId, type GroundedSurgeonAnnotation } from "@/lib/highlights/groundSurgeonQuotes";
import { limitAnnotationDensity } from "@/lib/highlights/limitAnnotationDensity";
import { buildDeterministicAnnotationPlan } from "@/lib/highlights/deterministicAnnotationPlan";
import { cleanActivePageText } from "@/lib/insights/cleanActivePageText";
import { buildAnnotationCacheKey } from "@/lib/insights/annotationPlanCache";
import {
  getSurgeonAnnotationPlan,
  saveSurgeonAnnotationPlan,
} from "@/lib/canonical/surgeonAnnotationPlanStore";
import type { AnnotationPlanResponse } from "@/pages/api/page-annotation-plan";

export type SurgeonAnnotationStatus = "idle" | "loading" | "success" | "error";
export type SurgeonPlanTier = "enriched" | "grounded" | "degraded" | "failed";

export interface UseSurgeonAnnotationsResult {
  plan: SurgeonAnnotationPlan | null;
  /** Ready to pass straight into SmartPDFViewer's highlightTargets prop —
   *  replaces (not supplements) the older highlightAnchors-derived targets once
   *  a plan is available for this page. */
  highlightTargets: HighlightTarget[];
  /**
   * Full-fidelity grounded annotations — all 3 importance values (not
   * collapsed the way HighlightTarget.level is), plus treatment,
   * groundingState, and spanScope. Same (density-limited) array
   * highlightTargets is derived from (both come from one groundSurgeonQuotes()
   * + limitAnnotationDensity() pass per fetch/cache-hit, so they can never
   * drift). Feeds lib/whiteboard/visualSceneGraph.ts's
   * surgeonAnnotationsToCanonicalEntries() for the deterministic Scene Builder
   * — the Whiteboard and the PDF overlay see the same "what deserves
   * attention" judgment, by design.
   */
  groundedAnnotations: GroundedSurgeonAnnotation[];
  /**
   * What highlightTargets/groundedAnnotations are actually populated from,
   * independent of `status` (which describes the AI fetch's own lifecycle):
   *   "enriched" — a real, AI-enriched SurgeonAnnotationPlan produced targets.
   *   "grounded" — AI hasn't produced targets (idle/loading/legitimately
   *                empty), but the deterministic, AI-free baseline tier (see
   *                lib/highlights/deterministicAnnotationPlan.ts) found
   *                something and is showing it.
   *   "degraded" — AI enrichment actively failed (status === "error") but the
   *                deterministic baseline is still showing something, so the
   *                overlay is not empty.
   *   "failed"   — neither AI enrichment nor the deterministic baseline
   *                produced anything for this page; the overlay is empty.
   * Never silently "empty" without a reason: the deterministic tier is part
   * of THIS pipeline, not the removed legacy fallback (PR #609) — "failed"
   * only happens when the deterministic pass itself found nothing to extract.
   */
  planTier: SurgeonPlanTier;
  status: SurgeonAnnotationStatus;
  /** Set when analysis is degraded (missing config, upstream failure, or no
   *  quotes survived verification) — whatever was already showing (cache or
   *  nothing) stays up; this is shown alongside it, never in place of it. */
  annotationErrorMessage: string | null;
  /** Explicit "reanalyze page" — bypasses the cache-hit check, always fetches fresh. */
  reanalyze: () => void;
}

interface UseSurgeonAnnotationsArgs {
  pageTruthKey: string;
  bookId: string;
  pageIndex: number;   // 0-based, for the cache key
  pageNumber: number;  // 1-based, for the API + HighlightTarget.page
  pageText: string;
  pageImageDataUrl: string | null;
  previousPageText?: string | null;
  nextPageText?: string | null;
  domain: PageDomain;
  semanticPack: SemanticPack;
  existingCanonicalUnits: ExistingCanonicalUnitContext[];
  enabled: boolean;
}

// Does NOT claim AI-quality "annotations are still shown" — the legacy
// fallback pipeline was removed (PureReaderView.tsx no longer falls back to
// allHighlightTargets in any state). It also does NOT claim nothing is
// visible: the deterministic baseline tier (deterministicBaseline below)
// fills in whenever it finds something, so this message must stay accurate
// whichever of those two is actually true for the current page.
const DEGRADED_MESSAGE = "Advanced page analysis is temporarily unavailable. Basic grounded highlights are shown when available.";

const IMPORTANCE_TO_LEVEL: Record<Importance, HighlightTarget["level"]> = {
  critical:   "important",
  high:       "important",
  supporting: "support",
};

// Legacy-compat fallback only — PdfEvidenceOverlay checks `treatment` first, this
// just keeps `kind` non-empty for any code path that still reads it directly.
const CANONICAL_TYPE_TO_KIND: Record<CanonicalType, HighlightTarget["kind"]> = {
  definition:         "definition",
  mechanism:          "mechanism",
  procedure:          "mechanism",
  decision:           "keyDetail",
  comparison:         "comparison",
  trap:               "trap",
  clinicalPearl:      "clinical",
  supportingEvidence: "reference",
};

function normalizeForTarget(s: string): string {
  return s.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

// Maps an already-grounded (and already density-limited) array to
// HighlightTarget[] — kept separate from the groundSurgeonQuotes()/
// limitAnnotationDensity() calls themselves so callers can feed the SAME
// array into both this (PDF-facing, lossy) and groundedAnnotations state
// (full-fidelity), guaranteeing the two can never drift apart.
function groundedAnnotationsToHighlightTargets(
  grounded: GroundedSurgeonAnnotation[],
  pageNumber: number,
): HighlightTarget[] {
  return grounded.map((g, i) => {
    const id = buildSurgeonEvidenceId(pageNumber, i);
    return {
      id,
      page:                  pageNumber,
      text:                  g.groundedText,
      normalizedText:        normalizeForTarget(g.groundedText),
      level:                 IMPORTANCE_TO_LEVEL[g.importance],
      score:                 g.confidence,
      sourceParagraphIndex:  i,
      kind:                  CANONICAL_TYPE_TO_KIND[g.canonicalType],
      evidenceRefId:         id,
      reason:                g.reason,
      treatment:             g.treatment,
      canonicalType:         g.canonicalType,
      groundingState:        g.groundingState,
    };
  });
}

// Pure — exported so its 4-way tiering (enriched/grounded/degraded/failed)
// can be exercised directly with constructed fixtures in tests, rather than
// only inferred by regex-matching this file's source (this repo's jest
// config runs testEnvironment: "node" with no jsdom/RTL, so a real
// render-hook test isn't available here). AI-enriched output wins whenever
// it has anything to show; the deterministic baseline fills every other
// state. Never a merge of the two — one exclusive set is returned.
export function resolveAnnotationTier(args: {
  aiHighlightTargets: HighlightTarget[];
  aiGroundedAnnotations: GroundedSurgeonAnnotation[];
  baselineTargets: HighlightTarget[];
  baselineGrounded: GroundedSurgeonAnnotation[];
  status: SurgeonAnnotationStatus;
}): {
  highlightTargets: HighlightTarget[];
  groundedAnnotations: GroundedSurgeonAnnotation[];
  planTier: SurgeonPlanTier;
} {
  const usingEnriched = args.aiHighlightTargets.length > 0;
  const hasBaseline = args.baselineTargets.length > 0;

  let planTier: SurgeonPlanTier;
  if (usingEnriched) {
    planTier = "enriched";
  } else if (args.status === "error") {
    planTier = hasBaseline ? "degraded" : "failed";
  } else {
    planTier = hasBaseline ? "grounded" : "failed";
  }

  return {
    highlightTargets:    usingEnriched ? args.aiHighlightTargets    : args.baselineTargets,
    groundedAnnotations: usingEnriched ? args.aiGroundedAnnotations : args.baselineGrounded,
    planTier,
  };
}

export function useSurgeonAnnotations({
  pageTruthKey,
  bookId,
  pageIndex,
  pageNumber,
  pageText,
  pageImageDataUrl,
  previousPageText,
  nextPageText,
  domain,
  semanticPack,
  existingCanonicalUnits,
  enabled,
}: UseSurgeonAnnotationsArgs): UseSurgeonAnnotationsResult {
  const [plan,             setPlan]             = useState<SurgeonAnnotationPlan | null>(null);
  const [highlightTargets, setHighlightTargets] = useState<HighlightTarget[]>([]);
  const [groundedAnnotations, setGroundedAnnotations] = useState<GroundedSurgeonAnnotation[]>([]);
  const [status,           setStatus]           = useState<SurgeonAnnotationStatus>("idle");
  const [annotationErrorMessage, setAnnotationErrorMessage] = useState<string | null>(null);
  const [reanalyzeCount,   setReanalyzeCount]   = useState(0);

  const abortRef          = useRef<AbortController | null>(null);
  // Composite "already started" key: pageTruthKey + domain + pack id. A change in
  // ANY of the three allows a re-fire — this is what makes domain/pack changes a
  // real trigger, unlike useTeachingSynthesis's ref-based domain/pack exclusion.
  const startedKeyRef      = useRef<string | null>(null);
  const forceRefetchRef    = useRef(false);

  // Live refs for values not meant to abort/restart the effects on their own.
  const pageTextRef              = useRef(pageText);
  const pageImageDataUrlRef      = useRef(pageImageDataUrl);
  const previousPageTextRef      = useRef(previousPageText);
  const nextPageTextRef          = useRef(nextPageText);
  const existingCanonicalUnitsRef = useRef(existingCanonicalUnits);
  const bookIdRef                = useRef(bookId);
  const pageIndexRef             = useRef(pageIndex);
  const pageNumberRef            = useRef(pageNumber);
  pageTextRef.current              = pageText;
  pageImageDataUrlRef.current      = pageImageDataUrl;
  previousPageTextRef.current      = previousPageText;
  nextPageTextRef.current          = nextPageText;
  existingCanonicalUnitsRef.current = existingCanonicalUnits;
  bookIdRef.current                = bookId;
  pageIndexRef.current             = pageIndex;
  pageNumberRef.current            = pageNumber;

  const reanalyze = useCallback(() => {
    forceRefetchRef.current = true;
    startedKeyRef.current = null;
    setReanalyzeCount(c => c + 1);
  }, []);

  // ── Deterministic grounded baseline — always available, no network call ───
  // exact current-page text → deterministic grounded base annotation plan →
  // optional OpenAI enrichment → one SurgeonAnnotationPlan → one
  // PdfEvidenceOverlay. Computed synchronously from raw pageText/pageTruthKey
  // so the overlay is never at the mercy of an AI call: it renders instantly
  // on page open and stays up through loading/degraded/empty AI states. Real
  // spans extracted directly from pageText, so grounding is guaranteed by
  // construction (still run through groundSurgeonQuotes/limitAnnotationDensity
  // for pipeline-uniform sentence-boundary expansion and density limiting).
  // Replaced — never merged — the instant a real AI-enriched plan produces
  // any targets; see the tiering in the return statement below.
  const deterministicBaseline = useMemo(() => {
    if (!pageText || pageText.length < 200) {
      return { targets: [] as HighlightTarget[], grounded: [] as GroundedSurgeonAnnotation[] };
    }
    const basePlan     = buildDeterministicAnnotationPlan(pageText, pageTruthKey);
    const baseGrounded = limitAnnotationDensity(groundSurgeonQuotes(basePlan.annotations, pageText));
    const baseTargets  = groundedAnnotationsToHighlightTargets(baseGrounded, pageNumber);
    return { targets: baseTargets, grounded: baseGrounded };
  }, [pageText, pageTruthKey, pageNumber]);

  // ── Effect A: page identity changed → reset + try the IDB cache first ──────
  useEffect(() => {
    setPlan(null);
    setHighlightTargets([]);
    setGroundedAnnotations([]);
    setStatus("idle");
    setAnnotationErrorMessage(null);
    startedKeyRef.current = null;

    let cancelled = false;
    (async () => {
      const cacheKey = buildAnnotationCacheKey({
        bookId:         bookIdRef.current,
        pageIndex:      pageIndexRef.current,
        semanticPackId: semanticPack.id,
      });
      try {
        const stored = await getSurgeonAnnotationPlan(cacheKey);
        if (cancelled) return;
        if (stored && stored.plan.pageTruthKey === pageTruthKey) {
          // Ground against cleanActivePageText(pageText), NOT the raw pageText — the
          // model was given the CLEANED text (buildSurgeonAnnotationInput.ts applies
          // the same transform before it's sent), so a quote spanning a merged
          // drop-cap or a stripped running header/caption is accurate against what
          // the model actually saw but would fail exact/normalized matching against
          // the raw, uncleaned text. Grounding against raw text was silently
          // dropping otherwise-correct annotations.
          const grounded = limitAnnotationDensity(groundSurgeonQuotes(stored.plan.annotations, cleanActivePageText(pageTextRef.current)));
          const targets = groundedAnnotationsToHighlightTargets(grounded, pageNumberRef.current);
          setPlan(stored.plan);
          setHighlightTargets(targets);
          setGroundedAnnotations(grounded);
          setStatus("success");
          // Mark this (page, domain, pack) combination as already satisfied so
          // Effect B doesn't immediately re-fetch what we just loaded from cache.
          startedKeyRef.current = `${pageTruthKey}|${domain}|${semanticPack.id}`;
          if (DEV) console.log("[SURGEON_PLAN_CACHE_HIT]", { pageTruthKey, cacheKey, annotationCount: targets.length });
          // Production-safe (no DEV gate, no annotation text) — the first two
          // stages of the pipeline trace SmartPDFViewer's [SURGEON_PIPELINE_DIAGNOSTIC]
          // continues (geometryResolvedCount/renderedAnnotationCount).
          console.log("[SURGEON_PIPELINE_DIAGNOSTIC]", {
            pageTruthKey,
            stage: "cache-hit",
            annotationPlanCount: stored.plan.annotations.length,
            groundedAnnotationCount: targets.length,
          });
        }
      } catch {
        // IDB unavailable or lookup failed — not fatal, Effect B will fetch fresh.
      }
    })();

    return () => {
      cancelled = true;
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageTruthKey]);

  // ── Effect B: fetch when first-open, or domain/pack changed for this page ──
  // No abort in this effect's cleanup — enabled/text flicker must not kill a run.
  useEffect(() => {
    if (!enabled) return;
    const hasPageText = (pageText?.length ?? 0) > 200;
    if (!hasPageText) return;

    const compositeKey = `${pageTruthKey}|${domain}|${semanticPack.id}`;
    if (startedKeyRef.current === compositeKey && !forceRefetchRef.current) {
      return; // already satisfied (cache hit or prior fetch) for this exact combination
    }
    startedKeyRef.current = compositeKey;
    const wasForced = forceRefetchRef.current;
    forceRefetchRef.current = false;

    setStatus("loading");
    if (!wasForced) setAnnotationErrorMessage(null);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    (async () => {
      try {
        const input = buildSurgeonAnnotationInput({
          pageTruthKey,
          pageNumber:       pageNumberRef.current,
          pageImageDataUrl: pageImageDataUrlRef.current,
          pageText:         pageTextRef.current,
          previousPageText: previousPageTextRef.current,
          nextPageText:     nextPageTextRef.current,
          domain,
          semanticPack,
          existingCanonicalUnits: existingCanonicalUnitsRef.current,
        });

        const res = await fetch("/api/page-annotation-plan", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(input),
          signal:  ctrl.signal,
        });
        const data = (await res.json()) as AnnotationPlanResponse;

        if (ctrl.signal.aborted) return;

        if (!data.ok) {
          console.warn("[SURGEON_PLAN_DEGRADED]", { pageTruthKey, code: data.code, message: data.error });
          setAnnotationErrorMessage(DEGRADED_MESSAGE);
          setStatus("error");
          return; // keep whatever plan/highlightTargets were already set (cache or none)
        }

        if (data.plan.pageTruthKey !== pageTruthKey) {
          // Stale response for a page we've since navigated away from — drop it.
          return;
        }

        const grounded = limitAnnotationDensity(groundSurgeonQuotes(data.plan.annotations, cleanActivePageText(pageTextRef.current)));
        const targets = groundedAnnotationsToHighlightTargets(grounded, pageNumberRef.current);
        if (targets.length === 0 && data.plan.annotations.length > 0) {
          // Every proposed quote failed verification — degraded, not a hard error.
          setAnnotationErrorMessage(DEGRADED_MESSAGE);
          setStatus("error");
          return;
        }

        setPlan(data.plan);
        setHighlightTargets(targets);
        setGroundedAnnotations(grounded);
        setAnnotationErrorMessage(null);
        setStatus("success");

        const cacheKey = buildAnnotationCacheKey({
          bookId:         bookIdRef.current,
          pageIndex:      pageIndexRef.current,
          semanticPackId: semanticPack.id,
        });
        saveSurgeonAnnotationPlan(bookIdRef.current, pageIndexRef.current, cacheKey, data.plan).catch(() => {});

        if (DEV) console.log("[SURGEON_PLAN_OK]", { pageTruthKey, annotationCount: targets.length });
        console.log("[SURGEON_PIPELINE_DIAGNOSTIC]", {
          pageTruthKey,
          stage: "fetch",
          annotationPlanCount: data.plan.annotations.length,
          groundedAnnotationCount: targets.length,
        });
      } catch (err: any) {
        if (ctrl.signal.aborted) return;
        console.error("[SURGEON_PLAN_ERROR]", { pageTruthKey, message: err?.message ?? String(err) });
        setAnnotationErrorMessage(DEGRADED_MESSAGE);
        setStatus("error");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageTruthKey, domain, semanticPack.id, enabled, pageText, reanalyzeCount]);

  const tiered = resolveAnnotationTier({
    aiHighlightTargets:    highlightTargets,
    aiGroundedAnnotations: groundedAnnotations,
    baselineTargets:       deterministicBaseline.targets,
    baselineGrounded:      deterministicBaseline.grounded,
    status,
  });

  return {
    plan,
    highlightTargets:    tiered.highlightTargets,
    groundedAnnotations: tiered.groundedAnnotations,
    planTier:            tiered.planTier,
    status,
    annotationErrorMessage,
    reanalyze,
  };
}
