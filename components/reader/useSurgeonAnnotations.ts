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

import { useCallback, useEffect, useRef, useState } from "react";
import type { PageDomain } from "@/lib/insights/detectPageDomain";
import type { SemanticPack } from "@/lib/semantic/types";
import type { HighlightTarget } from "@/lib/readerContracts";
import type { SurgeonAnnotationPlan, CanonicalType, Importance } from "@/lib/insights/pageAnnotationPlan";
import { buildSurgeonAnnotationInput, type ExistingCanonicalUnitContext } from "@/lib/insights/buildSurgeonAnnotationInput";
import { groundSurgeonQuotes, buildSurgeonEvidenceId, type GroundedSurgeonAnnotation } from "@/lib/highlights/groundSurgeonQuotes";
import { limitAnnotationDensity } from "@/lib/highlights/limitAnnotationDensity";
import { cleanActivePageText } from "@/lib/insights/cleanActivePageText";
import { computePageContentHash } from "@/lib/insights/pageContentHash";
import { buildAnnotationCacheKey } from "@/lib/insights/annotationPlanCache";
import {
  getSurgeonAnnotationPlan,
  saveSurgeonAnnotationPlan,
} from "@/lib/canonical/surgeonAnnotationPlanStore";
import type { AnnotationPlanResponse } from "@/pages/api/page-annotation-plan";

export type SurgeonAnnotationStatus = "idle" | "loading" | "success" | "error";
export type SurgeonPlanTier = "ready" | "empty" | "failed";

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
   * independent of `status` (which describes the AI fetch's own lifecycle).
   * SurgeonAnnotationPlan is the SOLE source of automatic PDF annotations —
   * there is no deterministic/AI-free fallback tier. If AI enrichment fails
   * or produces nothing, the overlay is genuinely empty; it never silently
   * substitutes a different, lesser tier of content.
   *   "ready"  — a real, AI-enriched SurgeonAnnotationPlan produced targets.
   *   "empty"  — AI hasn't produced targets yet (idle/loading), or legitimately
   *              produced zero for this page (a valid outcome, not a failure).
   *   "failed" — the AI request itself failed (status === "error") and there
   *              are no targets to show.
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

// Truthful, not reassuring: SurgeonAnnotationPlan is the sole owner of
// automatic PDF annotations, and there is no fallback tier left to fall back
// to. This message must never imply that some lesser form of highlighting is
// still showing underneath it — when it's up, the overlay is empty.
const DEGRADED_MESSAGE = "Advanced annotations could not be generated.";

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

// Pure — exported so its tiering can be exercised directly with constructed
// fixtures in tests, rather than only inferred by regex-matching this file's
// source (this repo's jest config runs testEnvironment: "node" with no
// jsdom/RTL, so a real render-hook test isn't available here). No fallback
// tier: the AI-produced set is the only content this can ever return.
export function resolveAnnotationTier(args: {
  aiHighlightTargets: HighlightTarget[];
  aiGroundedAnnotations: GroundedSurgeonAnnotation[];
  status: SurgeonAnnotationStatus;
}): {
  highlightTargets: HighlightTarget[];
  groundedAnnotations: GroundedSurgeonAnnotation[];
  planTier: SurgeonPlanTier;
} {
  const hasTargets = args.aiHighlightTargets.length > 0;

  let planTier: SurgeonPlanTier;
  if (hasTargets) {
    planTier = "ready";
  } else if (args.status === "error") {
    planTier = "failed";
  } else {
    planTier = "empty";
  }

  return {
    highlightTargets:    args.aiHighlightTargets,
    groundedAnnotations: args.aiGroundedAnnotations,
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
          documentId:       bookIdRef.current,
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

        // Content-integrity check, additive to the pageTruthKey check above: even
        // when the page SLOT (documentId/pageNumber) is unchanged, re-derive the
        // expected hash from whatever text is ACTUALLY on screen right now and
        // reject a response computed against different underlying text (e.g. a
        // re-extraction produced a different result for the same page slot).
        const currentContentHash = computePageContentHash(
          bookIdRef.current,
          pageNumberRef.current,
          cleanActivePageText(pageTextRef.current),
        );
        if (data.pageContentHash !== currentContentHash) {
          console.warn("[SURGEON_PLAN_CONTENT_HASH_MISMATCH]", { pageTruthKey, expected: currentContentHash, received: data.pageContentHash });
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
