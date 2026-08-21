// components/reader/useSurgeonAnnotations.ts
const DEV = process.env.NODE_ENV === "development";
// SurgeonAnnotationPlan trigger hook — OpenAI reads the current page fresh and
// proposes meaning; this hook verifies it, converts it to HighlightTarget[] (the
// same shape SmartPDFViewer already resolves to PDF coordinates for the older
// highlightAnchors pipeline), and hands it off. SmartPDFViewer does the geometry
// resolution and drawing — this hook never touches coordinates.
//
// Modeled on useTeachingSynthesis.ts's Effect A/B split:
//   Effect A (deps: [pageTruthKey, pageContentHash, documentId]) — reset state,
//     try the IDB cache first so
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
import type { PageRole } from "@/lib/readerContracts";
import { isNoninstructionalPage } from "@/lib/insights/pageRoleGate";
import type { SurgeonAnnotationPlan, CanonicalType, Importance } from "@/lib/insights/pageAnnotationPlan";
import { buildSurgeonAnnotationInput, type ExistingCanonicalUnitContext } from "@/lib/insights/buildSurgeonAnnotationInput";
import { resolveVisualContext } from "@/lib/insights/resolveVisualContext";
import { groundSurgeonQuotes, buildSurgeonEvidenceId, type GroundedSurgeonAnnotation } from "@/lib/highlights/groundSurgeonQuotes";
import { segmentPageSentences, sentencesById as buildSentencesById } from "@/lib/insights/segmentPageSentences";
import { limitAnnotationDensity } from "@/lib/highlights/limitAnnotationDensity";
import { computeHighlightCoverage } from "@/lib/highlights/highlightCoverage";
import { CanonicalPageMapRegistry } from "@/lib/pdf/canonicalPageMapRegistry";
import { cleanActivePageText } from "@/lib/insights/cleanActivePageText";
import { computePageContentHash } from "@/lib/insights/pageContentHash";
import { buildAnnotationCacheKey } from "@/lib/insights/annotationPlanCache";
import { hashDocumentId, newRequestId } from "@/lib/insights/requestDiagnostics";
import {
  getSurgeonAnnotationPlan,
  saveSurgeonAnnotationPlan,
} from "@/lib/canonical/surgeonAnnotationPlanStore";
import type { AnnotationPlanResponse, ServerFailureStage } from "@/pages/api/page-annotation-plan";

export type SurgeonAnnotationStatus = "idle" | "loading" | "success" | "error";
export type SurgeonPlanTier = "ready" | "empty" | "failed";

// The server's own failure-stage codes, plus 3 that can only be detected
// client-side:
//   page_extraction — the CURRENT page's own text never reached a usable
//     length (see hasPageText below) — this happens BEFORE any request is
//     even built, so the server can never see or report it.
//   page_identity — a response whose echoed pageTruthKey/pageContentHash no
//     longer matches the current page (the student navigated away before
//     the response arrived).
//   network_error — a network-level failure that never reached the server
//     at all (no HTTP response to carry a server code).
// "sentence_grounding" is deliberately the SAME code the server's own
// (non-authoritative) plausibility check uses — every proposed quote
// failing client-side sentence grounding despite a non-empty plan is
// conceptually the same pipeline stage, just caught by the authoritative
// check instead of the server's defense-in-depth one.
// Two more stages exist ONE layer further downstream — geometry_resolution
// (a grounded quote failing to locate in the live PDF text layer) and
// overlay_render (geometry resolved but the final dedup pass dropped it) —
// but this hook has no visibility into that layer at all; SmartPDFViewer.tsx
// is the only place that can observe it, and reports those two stages via
// lib/readingFocus/readingFocusStore.ts's annotationRenderStage instead.
export type ClientFailureStage = ServerFailureStage | "page_extraction" | "page_identity" | "network_error";

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
   * drift). This is the PDF-margin-note view — density-limited for readability
   * as marginalia, NOT the full page understanding. Use wholePageAnnotations
   * below for anything that wants the complete picture (e.g. the Whiteboard).
   */
  groundedAnnotations: GroundedSurgeonAnnotation[];
  /**
   * The SAME grounded annotations as groundedAnnotations, but WITHOUT
   * limitAnnotationDensity()'s PDF-margin-note cap (max 8, with mechanism and
   * procedure sharing a single slot). That cap exists so the PDF overlay reads
   * like expert marginalia, not a diagnostic overlay — it has nothing to do
   * with how much material the Whiteboard needs to teach the page well, and
   * reusing it there was silently starving the Whiteboard of content (a
   * 5-step procedure and a definition and a trap all fighting for one shared
   * slot). Still the same one page read, same groundSurgeonQuotes() pass —
   * no second AI call, just a second, less lossy VIEW of its output. Bounded
   * only by the model's own per-page ceiling (pages/api/page-annotation-plan.ts
   * rule 10, "at most 10 annotations").
   */
  wholePageAnnotations: GroundedSurgeonAnnotation[];
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
  /** Exact pipeline stage a failure occurred at — current page extraction ->
   *  /api/page-annotation-plan -> OpenAI -> schema validation -> sentence
   *  grounding -> density limiting -> PDF overlay. Null when there is no
   *  active failure. Paired with annotationRequestId for support/debugging
   *  without ever needing to log page or annotation text. */
  annotationFailureStage: ClientFailureStage | null;
  /** The requestId the server (or, for a network failure, this client)
   *  assigned to the most recent attempt — privacy-safe, carries no page
   *  content, safe to show in a UI or support ticket. */
  annotationRequestId: string | null;
  /** Non-secret OpenAI model id returned by the API for the most recent
   *  request, so a production failure can be correlated without server-log access. */
  annotationModel: string | null;
  /** Explicit "reanalyze page" — bypasses the cache-hit check, always fetches fresh. */
  reanalyze: () => void;
}

interface UseSurgeonAnnotationsArgs {
  pageTruthKey: string;
  /** Collision-resistant identity from resolveDocumentIdentity — never a
   * filename/bookId grouping label. */
  documentId: string;
  pageNumber: number;  // 1-based — for the API, HighlightTarget.page, AND the cache key (see annotationPlanCache.ts's RC7 note)
  pageText: string;
  pageImageDataUrl: string | null;
  previousPageText?: string | null;
  nextPageText?: string | null;
  domain: PageDomain;
  semanticPack: SemanticPack;
  existingCanonicalUnits: ExistingCanonicalUnitContext[];
  /** Local heuristic role classification (lib/right-panel/extractPageSignals.ts's
   *  detectPageRole, surfaced via useActivePageIntelligence). When
   *  isNoninstructionalPage(pageRole) is true (title/copyright/front-matter/
   *  structural pages), Effect B never spends an AI call — the earliest point
   *  in the pipeline this can be decided. Professor, Whiteboard, and Recall
   *  all derive their evidence from this hook's output (wholePageAnnotations/
   *  groundedAnnotations/highlightTargets), so they inherit the suppression
   *  automatically; nothing downstream needs its own gate. */
  pageRole: PageRole | string | null;
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
export function groundedAnnotationsToHighlightTargets(
  grounded: GroundedSurgeonAnnotation[],
  documentId: string,
  pageNumber: number,
): HighlightTarget[] {
  return grounded.map((g, i) => {
    const id = buildSurgeonEvidenceId(documentId, pageNumber, i);
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
      sourceSentenceId:      g.groundingState === "sentenceId" ? g.sentenceId : undefined,
      sourceCharStart:       g.sourceCharStart,
      sourceCharEnd:         g.sourceCharEnd,
      spanScope:             g.spanScope,
    };
  });
}

// Item 4C-5a: DEV-only diagnostic. Logs which of this page's canonical body
// sentences the final, density-limited highlight set actually accounts
// for. Never throws, never blocks — computeHighlightCoverage returns null
// (silently skipped) when the canonical map isn't available/consistent
// yet for this exact pageText, e.g. extraction still running.
//
// Takes pageNumber (1-based, this file's only page-identity convention)
// and adjusts to CanonicalPageMapRegistry's 0-based registry key
// internally, the same -1 done inline at this file's other two
// segmentPageSentences() call sites — never stored as a separate field.
function logHighlightCoverage(pageNumber: number, pageText: string, targets: HighlightTarget[]): void {
  if (!DEV) return;
  const report = computeHighlightCoverage(CanonicalPageMapRegistry.get(pageNumber - 1), pageText, targets);
  if (!report) return;
  console.log("[HIGHLIGHT_COVERAGE]", {
    pageNumber,
    auditedSentenceCount: report.auditedSentenceCount,
    highlightedCount: report.highlightedCount,
    unaccountedCount: report.unaccountedCount,
    unaccounted: report.sentences
      .filter(s => s.status === "unaccounted")
      .map(s => ({ id: s.sentenceId, text: s.text.slice(0, 80) })),
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
  documentId,
  pageNumber,
  pageText,
  pageImageDataUrl,
  previousPageText,
  nextPageText,
  domain,
  semanticPack,
  existingCanonicalUnits,
  pageRole,
  enabled,
}: UseSurgeonAnnotationsArgs): UseSurgeonAnnotationsResult {
  const [plan,             setPlan]             = useState<SurgeonAnnotationPlan | null>(null);
  const [highlightTargets, setHighlightTargets] = useState<HighlightTarget[]>([]);
  const [groundedAnnotations, setGroundedAnnotations] = useState<GroundedSurgeonAnnotation[]>([]);
  const [wholePageAnnotations, setWholePageAnnotations] = useState<GroundedSurgeonAnnotation[]>([]);
  const [status,           setStatus]           = useState<SurgeonAnnotationStatus>("idle");
  const [annotationErrorMessage, setAnnotationErrorMessage] = useState<string | null>(null);
  const [annotationFailureStage, setAnnotationFailureStage] = useState<ClientFailureStage | null>(null);
  const [annotationRequestId, setAnnotationRequestId]       = useState<string | null>(null);
  const [annotationModel, setAnnotationModel]               = useState<string | null>(null);
  const [reanalyzeCount,   setReanalyzeCount]   = useState(0);

  const abortRef          = useRef<AbortController | null>(null);
  // Composite "already started" key: pageTruthKey + domain + pack id. A change in
  // ANY of the three allows a re-fire — this is what makes domain/pack changes a
  // real trigger, unlike useTeachingSynthesis's ref-based domain/pack exclusion.
  const startedKeyRef      = useRef<string | null>(null);
  const forceRefetchRef    = useRef(false);
  // Composite key of whatever plan/highlightTargets are CURRENTLY on screen
  // (set alongside every successful setPlan/setHighlightTargets call, both
  // Effect A's cache hit and Effect B's fetch success). Distinct from
  // startedKeyRef (which just tracks "have we already tried this combo") —
  // this tracks "what combo does the content on screen actually belong to."
  // Effect B reads it to decide whether a NEW fetch (domain/pack changed)
  // must clear stale content from a DIFFERENT combination before it starts,
  // vs. a same-key reanalyze() retry, which intentionally leaves prior
  // content up while the retry runs.
  const displayedKeyRef    = useRef<string | null>(null);

  // Live refs for values not meant to abort/restart the effects on their own.
  const pageTextRef              = useRef(pageText);
  const pageImageDataUrlRef      = useRef(pageImageDataUrl);
  const previousPageTextRef      = useRef(previousPageText);
  const nextPageTextRef          = useRef(nextPageText);
  const existingCanonicalUnitsRef = useRef(existingCanonicalUnits);
  const documentIdRef            = useRef(documentId);
  const pageNumberRef            = useRef(pageNumber);
  pageTextRef.current              = pageText;
  pageImageDataUrlRef.current      = pageImageDataUrl;
  previousPageTextRef.current      = previousPageText;
  nextPageTextRef.current          = nextPageText;
  existingCanonicalUnitsRef.current = existingCanonicalUnits;
  documentIdRef.current            = documentId;
  pageNumberRef.current            = pageNumber;

  const pageContentHash = computePageContentHash(
    documentId,
    pageNumber,
    cleanActivePageText(pageText),
  );

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
    setWholePageAnnotations([]);
    setStatus("idle");
    setAnnotationErrorMessage(null);
    setAnnotationFailureStage(null);
    setAnnotationRequestId(null);
    setAnnotationModel(null);
    startedKeyRef.current = null;
    displayedKeyRef.current = null;

    let cancelled = false;
    (async () => {
      const cacheKey = buildAnnotationCacheKey({
        documentId:     documentIdRef.current,
        pageNumber:     pageNumberRef.current,
        pageContentHash,
        semanticPackId: semanticPack.id,
      });
      try {
        const stored = await getSurgeonAnnotationPlan(cacheKey);
        if (cancelled) return;
        if (stored && stored.plan.pageTruthKey === pageTruthKey) {
          // Ground against the RAW pageText, NOT cleanActivePageText(pageText).
          // This used to ground against the cleaned text (matching what the model
          // was shown), but that created a proven downstream failure: PDF-coordinate
          // resolution downstream (both the TextLayerRegistry-backed strategy and
          // SmartPDFViewer's own DOM-text-layer fallback match — this hook stays
          // coordinate-free and never touches either) search the RAW, live PDF
          // text — never the cleaned text. A quote whose sentence-
          // boundary expansion ran through a stripped running header/footer/caption,
          // or across a merged drop-cap, produced a groundedText that verified fine
          // against the cleaned text but could never be located in the actual PDF —
          // "grounded" in the right panel, permanently invisible on the page.
          // Grounding against raw text instead guarantees any successful match is,
          // by construction, present verbatim in the exact text geometry resolution
          // will search — the same "no highlight is better than a wrong highlight"
          // logic this file already applies now also rules out an ungeometrizable
          // one. See conversation/PR notes for the reproduction.
          // Re-segmented fresh against the SAME raw text every grounding pass
          // — segmentPageSentences is a pure function, so this always agrees
          // with whatever list buildSurgeonAnnotationInput.ts sent the model.
          const sentenceMap = buildSentencesById(segmentPageSentences(pageTextRef.current, undefined, pageNumberRef.current - 1));
          const wholePage = groundSurgeonQuotes(stored.plan.annotations, pageTextRef.current, sentenceMap);
          const grounded = limitAnnotationDensity(wholePage, stored.plan.pageRoles ?? [stored.plan.pageRole]);
          const targets = groundedAnnotationsToHighlightTargets(grounded, documentIdRef.current, pageNumberRef.current);
          setPlan(stored.plan);
          setHighlightTargets(targets);
          setGroundedAnnotations(grounded);
          setWholePageAnnotations(wholePage);
          setStatus("success");
          // Mark this (page, domain, pack) combination as already satisfied so
          // Effect B doesn't immediately re-fetch what we just loaded from cache.
          startedKeyRef.current = `${pageTruthKey}|${pageContentHash}|${domain}|${semanticPack.id}`;
          displayedKeyRef.current = startedKeyRef.current;
          if (DEV) console.log("[SURGEON_PLAN_CACHE_HIT]", { pageTruthKey, cacheKey, annotationCount: targets.length });
          // Production-safe (no DEV gate, no annotation text) — the first two
          // stages of the pipeline trace SmartPDFViewer's [SURGEON_PIPELINE_DIAGNOSTIC]
          // continues (geometryResolvedCount/renderedAnnotationCount).
          console.log("[SURGEON_PIPELINE_DIAGNOSTIC]", {
            documentIdHash: hashDocumentId(documentIdRef.current),
            pageTruthKey,
            stage: "cache-hit",
            returnedAnnotationCount: stored.plan.annotations.length,
            groundedCount: targets.length,
          });
          logHighlightCoverage(pageNumberRef.current, pageTextRef.current, targets);
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
  }, [pageTruthKey, pageContentHash, documentId]);

  // ── Effect B: fetch when first-open, or domain/pack changed for this page ──
  // No abort in this effect's cleanup — enabled/text flicker must not kill a run.
  useEffect(() => {
    if (!enabled) return;
    const rawPageTextLength = pageText?.length ?? 0;
    const hasPageText = rawPageTextLength > 200;
    if (!hasPageText) {
      // Distinguish "hasn't loaded yet" (pageText still empty right after a
      // page navigation — normal and transient, not a failure) from
      // "extraction genuinely produced too little for a real page" (pageText
      // is defined and non-trivial but still under the safety floor — e.g. a
      // scanned page with no text layer). Only the latter is worth surfacing
      // as page_extraction; flagging the former would false-positive on
      // every single page turn, since text extraction is always async.
      if (rawPageTextLength > 0) {
        setAnnotationFailureStage("page_extraction");
      }
      return;
    }

    const compositeKey = `${pageTruthKey}|${pageContentHash}|${domain}|${semanticPack.id}`;

    // Canonical noninstructional-page gate (lib/insights/pageRoleGate.ts).
    // Title/copyright/front-matter/structural pages never reach the AI call —
    // this is the earliest point the pipeline can decide that, and since
    // Professor/Whiteboard/Recall all read this hook's output rather than
    // re-classifying the page themselves, suppressing here suppresses all
    // four surfaces without a duplicate check anywhere downstream. Not a
    // failure state — resolves to planTier "empty", same as a page the model
    // itself judged to have nothing worth annotating.
    if (isNoninstructionalPage(pageRole)) {
      if (DEV) console.log("[SURGEON_NONINSTRUCTIONAL_SKIP]", { pageNumber: pageNumberRef.current, pageRole });
      startedKeyRef.current = compositeKey;
      setStatus("success");
      setPlan(null);
      setHighlightTargets([]);
      setGroundedAnnotations([]);
      setWholePageAnnotations([]);
      setAnnotationErrorMessage(null);
      setAnnotationFailureStage(null);
      setAnnotationRequestId(null);
      setAnnotationModel(null);
      displayedKeyRef.current = null;
      return;
    }

    if (startedKeyRef.current === compositeKey && !forceRefetchRef.current) {
      return; // already satisfied (cache hit or prior fetch) for this exact combination
    }
    startedKeyRef.current = compositeKey;
    const wasForced = forceRefetchRef.current;
    forceRefetchRef.current = false;

    // A genuine domain/pack change (not a same-key reanalyze() retry) while
    // content from a DIFFERENT combination is still displayed: clear it now,
    // before this fetch starts. Without this, a failed fetch for the NEW
    // combination could leave a failure banner showing on top of highlights
    // that belong to the OLD, unrelated combination — confusing at best,
    // actively misleading at worst (the banner reads as "nothing was
    // generated" while something clearly IS showing). A same-key retry
    // intentionally skips this — showing what you had while a retry runs is
    // reasonable; showing something from an unrelated combination is not.
    if (displayedKeyRef.current !== null && displayedKeyRef.current !== compositeKey) {
      setPlan(null);
      setHighlightTargets([]);
      setGroundedAnnotations([]);
      setWholePageAnnotations([]);
      displayedKeyRef.current = null;
    }

    setStatus("loading");
    if (!wasForced) setAnnotationErrorMessage(null);

    // Abort whatever this effect's OWN previous run may still have in
    // flight before starting a new one — this is the case Effect A's
    // pageTruthKey-keyed cleanup does NOT cover: a same-page reanalyze()
    // replays this effect (via reanalyzeCount) without pageTruthKey
    // changing, so nothing else ever cancels the original request. Without
    // this, a slow original response arriving AFTER the retry's response
    // can silently overwrite the retry's fresher result — both pass the
    // pageTruthKey/content-hash checks below since the page never changed.
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    (async () => {
      try {
        // Best-effort, additive: Gemini's figure/diagram/table description for
        // THIS page, resolved BEFORE the OpenAI request is built, so it can be
        // merged into the ONE SurgeonAnnotationPlan read as extra context —
        // never a second independent analysis Highlights/Whiteboard consume
        // separately. Never blocks: resolves to null on any failure/missing
        // key/no-image/no-visual-content, and text-only analysis proceeds
        // exactly as it did before Gemini existed. Same AbortController as
        // the OpenAI call below, so a real page navigation cancels both.
        const visualContext = await resolveVisualContext({
          pageImageDataUrl: pageImageDataUrlRef.current,
          documentId:       documentIdRef.current,
          pageNumber:       pageNumberRef.current,
          pageTruthKey,
          signal:           ctrl.signal,
        });
        if (ctrl.signal.aborted) return;

        const input = buildSurgeonAnnotationInput({
          pageTruthKey,
          documentId:       documentIdRef.current,
          pageNumber:       pageNumberRef.current,
          pageImageDataUrl: pageImageDataUrlRef.current,
          pageText:         pageTextRef.current,
          previousPageText: previousPageTextRef.current,
          nextPageText:     nextPageTextRef.current,
          domain,
          semanticPack,
          existingCanonicalUnits: existingCanonicalUnitsRef.current,
          visualContext,
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
          console.warn("[SURGEON_PLAN_DEGRADED]", {
            endpoint: "/api/page-annotation-plan",
            responseStatus: res.status,
            pageTruthKey,
            code: data.code,
            requestId: data.requestId,
            provider: data.provider,
            model: data.model,
            upstreamStatus: data.upstreamStatus,
            finishReason: data.finishReason,
            message: data.error,
          });
          setAnnotationErrorMessage(DEGRADED_MESSAGE);
          setAnnotationFailureStage(data.code);
          setAnnotationRequestId(data.requestId);
          setAnnotationModel(data.model);
          setStatus("error");
          return; // keep whatever plan/highlightTargets were already set (cache or none)
        }

        if (data.plan.pageTruthKey !== pageTruthKey) {
          // Stale response for a page we've since navigated away from — drop
          // it, but still surface a traceable identity-mismatch stage rather
          // than silently doing nothing (the student is left on whatever was
          // already showing; this is diagnostic, not a blocking error state).
          console.warn("[SURGEON_PLAN_PAGE_IDENTITY_MISMATCH]", { expected: pageTruthKey, received: data.plan.pageTruthKey, requestId: data.requestId });
          setAnnotationFailureStage("page_identity");
          setAnnotationRequestId(data.requestId);
          setAnnotationModel(data.model);
          return;
        }

        // Content-integrity check, additive to the pageTruthKey check above: even
        // when the page SLOT (documentId/pageNumber) is unchanged, re-derive the
        // expected hash from whatever text is ACTUALLY on screen right now and
        // reject a response computed against different underlying text (e.g. a
        // re-extraction produced a different result for the same page slot).
        const currentContentHash = computePageContentHash(
          documentIdRef.current,
          pageNumberRef.current,
          cleanActivePageText(pageTextRef.current),
        );
        if (data.pageContentHash !== currentContentHash) {
          console.warn("[SURGEON_PLAN_CONTENT_HASH_MISMATCH]", { pageTruthKey, expected: currentContentHash, received: data.pageContentHash, requestId: data.requestId });
          setAnnotationFailureStage("page_identity");
          setAnnotationRequestId(data.requestId);
          setAnnotationModel(data.model);
          return;
        }

        // Raw pageText, not cleanActivePageText(pageText) — see the cache-hit
        // branch above for why: grounding must search the same text basis
        // geometry resolution will search, or a "grounded" quote can end up
        // permanently unrenderable on the actual PDF.
        const sentenceMap = buildSentencesById(segmentPageSentences(pageTextRef.current, undefined, pageNumberRef.current - 1));
        const wholePage = groundSurgeonQuotes(data.plan.annotations, pageTextRef.current, sentenceMap);
        const grounded = limitAnnotationDensity(wholePage, data.plan.pageRoles ?? [data.plan.pageRole]);
        const targets = groundedAnnotationsToHighlightTargets(grounded, documentIdRef.current, pageNumberRef.current);
        if (targets.length === 0 && data.plan.annotations.length > 0) {
          // Every proposed quote failed client-side sentence grounding —
          // degraded, not a hard error, but a distinct stage from the
          // server's own (non-authoritative) quote_grounding_failed check.
          setAnnotationErrorMessage(DEGRADED_MESSAGE);
          setAnnotationFailureStage("sentence_grounding");
          setAnnotationRequestId(data.requestId);
          setAnnotationModel(data.model);
          setStatus("error");
          return;
        }

        setPlan(data.plan);
        setHighlightTargets(targets);
        setGroundedAnnotations(grounded);
        setWholePageAnnotations(wholePage);
        setAnnotationErrorMessage(null);
        setAnnotationFailureStage(null);
        setAnnotationRequestId(data.requestId);
        setAnnotationModel(data.model);
        setStatus("success");
        displayedKeyRef.current = compositeKey;

        const cacheKey = buildAnnotationCacheKey({
          documentId:     documentIdRef.current,
          pageNumber:     pageNumberRef.current,
          pageContentHash,
          semanticPackId: semanticPack.id,
        });
        saveSurgeonAnnotationPlan(documentIdRef.current, pageNumberRef.current, cacheKey, data.plan).catch(() => {});

        if (DEV) console.log("[SURGEON_PLAN_OK]", { pageTruthKey, annotationCount: targets.length });
        console.log("[SURGEON_PIPELINE_DIAGNOSTIC]", {
          documentIdHash: hashDocumentId(documentIdRef.current),
          pageTruthKey,
          stage: "fetch",
          returnedAnnotationCount: data.plan.annotations.length,
          groundedCount: targets.length,
          hasVisualContext: visualContext !== null,
        });
        logHighlightCoverage(pageNumberRef.current, pageTextRef.current, targets);
      } catch (err: any) {
        if (ctrl.signal.aborted) return;
        // No HTTP response ever arrived — the failure never reached the
        // server, so there's no server-issued requestId to carry. Mint one
        // client-side so this failure is still traceable the same way.
        const clientRequestId = newRequestId();
        console.error("[SURGEON_PLAN_ERROR]", { pageTruthKey, requestId: clientRequestId, message: err?.message ?? String(err) });
        setAnnotationErrorMessage(DEGRADED_MESSAGE);
        setAnnotationFailureStage("network_error");
        setAnnotationRequestId(clientRequestId);
        setAnnotationModel(null);
        setStatus("error");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageTruthKey, pageContentHash, domain, semanticPack.id, enabled, pageText, pageRole, reanalyzeCount]);

  const tiered = resolveAnnotationTier({
    aiHighlightTargets:    highlightTargets,
    aiGroundedAnnotations: groundedAnnotations,
    status,
  });

  return {
    plan,
    highlightTargets:     tiered.highlightTargets,
    groundedAnnotations:  tiered.groundedAnnotations,
    // Not run through resolveAnnotationTier — it has no fallback tier of its
    // own to resolve; it's simply empty whenever groundedAnnotations is
    // (reset alongside it in Effect A, populated alongside it on success).
    wholePageAnnotations,
    planTier:             tiered.planTier,
    status,
    annotationErrorMessage,
    annotationFailureStage,
    annotationRequestId,
    annotationModel,
    reanalyze,
  };
}
