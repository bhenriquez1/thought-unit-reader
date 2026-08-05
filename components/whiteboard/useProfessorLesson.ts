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

export type ProfessorLessonStatus = "idle" | "loading" | "success" | "error";

export interface UseProfessorLessonResult {
  lessonPlan: ProfessorLessonPlan | null;
  status: ProfessorLessonStatus;
  /** Set only when status is "error" — a short, specific reason the caller
   *  can show alongside the retry button. */
  errorMessage: string | null;
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

function identityKey(args: Pick<Args, "documentId" | "pageTruthKey" | "activeCanonicalUnitId">): string {
  return `${args.documentId}::${args.pageTruthKey}::${args.activeCanonicalUnitId ?? "none"}`;
}

const GENERIC_ERROR_MESSAGE = "Unable to generate Whiteboard for this page.";

export function useProfessorLesson({
  vsg, documentId, pageTruthKey, activeCanonicalUnitId, pageTeachingType, enabled,
}: Args): UseProfessorLessonResult {
  const [lessonPlan, setLessonPlan]   = useState<ProfessorLessonPlan | null>(null);
  const [status, setStatus]           = useState<ProfessorLessonStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
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

  const key = identityKey({ documentId, pageTruthKey, activeCanonicalUnitId });

  // ── Effect A: identity changed → reset + try cache ─────────────────────
  useEffect(() => {
    setLessonPlan(null);
    setStatus("idle");
    setErrorMessage(null);
    startedKeyRef.current = null;

    let cancelled = false;
    const cacheKey = buildProfessorLessonCacheKey({ documentId, pageTruthKey, activeCanonicalUnitId });
    (async () => {
      try {
        const stored = await getProfessorLessonPlan(cacheKey);
        if (cancelled) return;
        if (stored && stored.plan.sourceSnapshot.pageTruthKey === pageTruthKey) {
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

    const ctrl = new AbortController();
    abortRef.current = ctrl;

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
          setErrorMessage(GENERIC_ERROR_MESSAGE);
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
          setErrorMessage(GENERIC_ERROR_MESSAGE);
          setStatus("error");
          return;
        }

        const plan = buildProfessorTeachingActions(v, grounded, {
          documentId, pageNumber: v.sourcePageNumber ?? 0, pageTruthKey,
          activeCanonicalUnitId, vsgId: v.id, plannerVersion: PLANNER_VERSION,
        });
        setLessonPlan(plan);
        setErrorMessage(null);
        setStatus("success");

        const cacheKey = buildProfessorLessonCacheKey({ documentId, pageTruthKey, activeCanonicalUnitId });
        saveProfessorLessonPlan(cacheKey, plan).catch(() => {});
      } catch (err: any) {
        if (ctrl.signal.aborted) return;
        console.error("[PROFESSOR_LESSON_CLIENT_ERROR]", { pageTruthKey, message: err?.message ?? String(err) });
        setErrorMessage(GENERIC_ERROR_MESSAGE);
        setStatus("error");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, reanalyzeCount]);

  return { lessonPlan, status, errorMessage, reanalyze };
}
