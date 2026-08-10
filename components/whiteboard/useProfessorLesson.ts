// components/whiteboard/useProfessorLesson.ts
// Trigger hook for the Professor Lesson Planner — mirrors components/reader/
// useSurgeonAnnotations.ts's Effect A/B pattern (cache-first, abort stale
// requests on real identity change).
//
//   Effect A (deps: [identityKey]) — reset, try the IDB cache first.
//   Effect B (deps: [identityKey, enabled]) — fetch once per identity,
//     abort-on-change via AbortController.
//
// identityKey = documentId + pageTruthKey + activeCanonicalUnitId — a change
// in any of the three means a genuinely different lesson is needed. A late
// response for a page/unit the student has since left is dropped exactly
// like useSurgeonAnnotations drops a late SurgeonAnnotationPlan response.
//
// NO FALLBACK: on any failure (missing config, upstream error, ungroundable
// response, network error), lessonPlan stays null and status becomes
// "error" — the caller shows a retry state, never a silently-substituted
// generic lesson. This is deliberate: masking a broken Professor Planner
// behind an always-present fallback made it impossible to tell whether the
// new pipeline was actually working.

import { useCallback, useEffect, useRef, useState } from "react";
import type { VisualSceneGraph } from "@/lib/whiteboard/visualSceneGraph";
import { buildProfessorLessonInput } from "@/lib/whiteboard/buildProfessorLessonInput";
import { groundProfessorLesson } from "@/lib/whiteboard/groundProfessorLesson";
import { buildProfessorTeachingActions } from "@/lib/whiteboard/buildProfessorTeachingActions";
import {
  buildProfessorLessonCacheKey, PLANNER_VERSION,
  type ProfessorLessonPlan, type ProfessorLessonScript,
} from "@/lib/whiteboard/professorLessonPlan";
import { getProfessorLessonPlan, saveProfessorLessonPlan } from "@/lib/whiteboard/professorLessonPlanCache";
import type { ProfessorLessonPlanResponse } from "@/pages/api/professor-lesson-plan";
import { hashDocumentId, newRequestId } from "@/lib/insights/requestDiagnostics";

export type ProfessorLessonStatus = "idle" | "loading" | "success" | "error";

export interface UseProfessorLessonResult {
  lessonPlan: ProfessorLessonPlan | null;
  status: ProfessorLessonStatus;
  /** Set only when status is "error" — a short, specific reason the caller
   *  can show alongside the retry button. */
  errorMessage: string | null;
  /** Diagnostic metadata for the retry state — the API's own failure code
   *  (e.g. "UPSTREAM_UNAVAILABLE", "RATE_LIMITED") or a client-side code
   *  ("stale_response_dropped" doesn't apply here since that's not a
   *  failure; "network_error", "ungroundable", "missing_config"). Shown
   *  alongside errorMessage, never in place of it. */
  errorCode: string | null;
  errorDiagnostics: {
    requestId: string;
    endpoint: "/api/professor-lesson-plan";
    provider: "openai";
    model: string | null;
    failureStage: string;
    responseStatus: number | null;
    upstreamStatus: number | null;
    finishReason: string | null;
  } | null;
  reanalyze: () => void;
}

interface Args {
  vsg?: VisualSceneGraph;
  documentId: string;
  pageTruthKey: string;
  activeCanonicalUnitId: string | null;
  pageTeachingType?: string | null;
  enabled: boolean;
}

function identityKey(args: Pick<Args, "documentId" | "pageTruthKey" | "activeCanonicalUnitId"> & { vsgId: string }): string {
  return `${args.documentId}::${args.pageTruthKey}::${args.activeCanonicalUnitId ?? "none"}::${args.vsgId}`;
}

const GENERIC_ERROR_MESSAGE = "Unable to generate Whiteboard for this page.";

export function useProfessorLesson({
  vsg, documentId, pageTruthKey, activeCanonicalUnitId, pageTeachingType, enabled,
}: Args): UseProfessorLessonResult {
  const [lessonPlan, setLessonPlan]   = useState<ProfessorLessonPlan | null>(null);
  const [status, setStatus]           = useState<ProfessorLessonStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorCode, setErrorCode]       = useState<string | null>(null);
  const [errorDiagnostics, setErrorDiagnostics] = useState<UseProfessorLessonResult["errorDiagnostics"]>(null);
  const [reanalyzeCount, setReanalyzeCount] = useState(0);

  const abortRef       = useRef<AbortController | null>(null);
  const startedKeyRef  = useRef<string | null>(null);
  const forceRefetchRef = useRef(false);

  const vsgRef = useRef(vsg);
  vsgRef.current = vsg;
  const pageTeachingTypeRef = useRef(pageTeachingType);
  pageTeachingTypeRef.current = pageTeachingType;

  const reanalyze = useCallback(() => {
    forceRefetchRef.current = true;
    startedKeyRef.current = null;
    setReanalyzeCount(c => c + 1);
  }, []);

  const vsgId = vsg?.id ?? "no-vsg";
  const key = identityKey({ documentId, pageTruthKey, activeCanonicalUnitId, vsgId });

  // ── Effect A: identity changed → reset + try cache ─────────────────────
  useEffect(() => {
    setLessonPlan(null);
    setStatus("idle");
    setErrorMessage(null);
    setErrorCode(null);
    setErrorDiagnostics(null);
    startedKeyRef.current = null;

    let cancelled = false;
    const cacheKey = buildProfessorLessonCacheKey({ documentId, pageTruthKey, activeCanonicalUnitId, vsgId });
    (async () => {
      try {
        const stored = await getProfessorLessonPlan(cacheKey);
        if (cancelled) return;
        if (
          stored &&
          stored.plan.sourceSnapshot.documentId === documentId &&
          stored.plan.sourceSnapshot.pageTruthKey === pageTruthKey &&
          stored.plan.sourceSnapshot.vsgId === vsgId
        ) {
          setLessonPlan(stored.plan);
          setStatus("success");
          startedKeyRef.current = key;
        }
      } catch {
        // IDB unavailable — Effect B will fetch fresh.
      }
    })();

    return () => {
      cancelled = true;
      if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // ── Effect B: fetch once per identity (unless satisfied by cache) ──────
  useEffect(() => {
    if (!enabled) return;
    const v = vsgRef.current;
    if (!v || v.nodes.length === 0) return;

    if (startedKeyRef.current === key && !forceRefetchRef.current) return;
    startedKeyRef.current = key;
    forceRefetchRef.current = false;

    setStatus("loading");
    setErrorMessage(null);
    setErrorCode(null);
    setErrorDiagnostics(null);

    // Abort whatever this effect's OWN previous run may still have in
    // flight before starting a new one — Effect A's identityKey-keyed
    // cleanup doesn't cover a same-identity reanalyze() replay (via
    // reanalyzeCount), so without this a slow original response can land
    // AFTER the retry's response and silently overwrite it — both pass the
    // pageTruthKey check below since the page/unit never changed.
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const startedAt = Date.now();
    // Diagnostic identifiers only — documentId is hashed (one-way) so a
    // book's identity never appears in logs, and no node/edge/narration TEXT
    // is ever logged, only counts and timings.
    const diagnosticIds = { documentIdHash: hashDocumentId(documentId), pageTruthKey };

    (async () => {
      try {
        const input = buildProfessorLessonInput({
          vsg: v, documentId, pageTruthKey, activeCanonicalUnitId,
          pageTeachingType: pageTeachingTypeRef.current,
        });
        const res = await fetch("/api/professor-lesson-plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
          signal: ctrl.signal,
        });
        const data = (await res.json()) as ProfessorLessonPlanResponse;
        if (ctrl.signal.aborted) return;

        if (!data.ok) {
          const failureDiagnostics = {
            requestId: data.requestId,
            endpoint: "/api/professor-lesson-plan" as const,
            provider: data.provider,
            model: data.model,
            failureStage: data.failureStage,
            responseStatus: res.status,
            upstreamStatus: data.upstreamStatus,
            finishReason: data.finishReason,
          };
          console.warn("[PROFESSOR_LESSON_DEGRADED]", {
            ...diagnosticIds,
            ...failureDiagnostics,
            code: data.code,
            durationMs: Date.now() - startedAt,
          });
          setErrorMessage(GENERIC_ERROR_MESSAGE);
          setErrorCode(data.code);
          setErrorDiagnostics(failureDiagnostics);
          setStatus("error");
          return;
        }

        const script: ProfessorLessonScript = data.script;
        if (script.pageTruthKey !== pageTruthKey) {
          // Stale response for a page/unit we've since left — drop it.
          return;
        }

        const grounded = groundProfessorLesson(script, v);
        if (grounded.nodeScripts.length === 0) {
          // Everything the model referenced was ungroundable.
          console.warn("[PROFESSOR_LESSON_DEGRADED]", { ...diagnosticIds, code: "ungroundable_response", durationMs: Date.now() - startedAt });
          setErrorMessage(GENERIC_ERROR_MESSAGE);
          setErrorCode("ungroundable_response");
          setErrorDiagnostics({
            requestId: data.requestId,
            endpoint: "/api/professor-lesson-plan",
            provider: data.provider,
            model: data.model,
            failureStage: "target_grounding",
            responseStatus: res.status,
            upstreamStatus: 200,
            finishReason: null,
          });
          setStatus("error");
          return;
        }

        const plan = buildProfessorTeachingActions(v, grounded, {
          documentId, pageNumber: v.sourcePageNumber ?? 0, pageTruthKey,
          activeCanonicalUnitId, vsgId: v.id, plannerVersion: PLANNER_VERSION,
        });
        setLessonPlan(plan);
        setErrorMessage(null);
        setErrorCode(null);
        setErrorDiagnostics(null);
        setStatus("success");

        // Production-safe — counts and timing only, never label/narration text.
        console.log("[PROFESSOR_LESSON_PIPELINE_DIAGNOSTIC]", {
          ...diagnosticIds,
          nodeScriptCount: grounded.nodeScripts.length,
          sceneActionCount: plan.actions.length,
          requestId: data.requestId,
          provider: data.provider,
          model: data.model,
          responseStatus: res.status,
          durationMs: Date.now() - startedAt,
        });

        const cacheKey = buildProfessorLessonCacheKey({ documentId, pageTruthKey, activeCanonicalUnitId, vsgId });
        saveProfessorLessonPlan(cacheKey, plan).catch(() => {});
      } catch (err: any) {
        if (ctrl.signal.aborted) return;
        const clientRequestId = newRequestId();
        console.error("[PROFESSOR_LESSON_CLIENT_ERROR]", { ...diagnosticIds, requestId: clientRequestId, message: err?.message ?? String(err), durationMs: Date.now() - startedAt });
        setErrorMessage(GENERIC_ERROR_MESSAGE);
        setErrorCode("network_error");
        setErrorDiagnostics({
          requestId: clientRequestId,
          endpoint: "/api/professor-lesson-plan",
          provider: "openai",
          model: null,
          failureStage: "network_error",
          responseStatus: null,
          upstreamStatus: null,
          finishReason: null,
        });
        setStatus("error");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, reanalyzeCount]);

  return { lessonPlan, status, errorMessage, errorCode, errorDiagnostics, reanalyze };
}
