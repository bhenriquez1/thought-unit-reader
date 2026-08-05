// components/whiteboard/useProfessorLesson.ts
// Trigger hook for the Professor Lesson Planner — mirrors components/reader/
// useSurgeonAnnotations.ts's Effect A/B pattern (cache-first, abort stale
// requests on real identity change, never leave the canvas with nothing to
// perform).
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
// Never returns lessonPlan: null while a vsg is available: on fetch failure
// or missing config, buildDeterministicLessonScript() (AI-free, cannot fail)
// takes over so the canvas always has a real lesson to perform.

import { useCallback, useEffect, useRef, useState } from "react";
import type { VisualSceneGraph } from "@/lib/whiteboard/visualSceneGraph";
import { buildProfessorLessonInput } from "@/lib/whiteboard/buildProfessorLessonInput";
import { groundProfessorLesson } from "@/lib/whiteboard/groundProfessorLesson";
import { buildDeterministicLessonScript } from "@/lib/whiteboard/deterministicLessonScript";
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
  /** true when lessonPlan came from the AI-free deterministic generator
   *  rather than the Professor Lesson Planner — canvas is never empty, but
   *  the caller may want to show a small "basic lesson" notice. */
  usingFallback: boolean;
  reanalyze: () => void;
}

interface Args {
  vsg?: VisualSceneGraph;
  documentId: string;
  pageTruthKey: string;
  activeCanonicalUnitId: string | null;
  enabled: boolean;
}

function identityKey(args: Pick<Args, "documentId" | "pageTruthKey" | "activeCanonicalUnitId">): string {
  return `${args.documentId}::${args.pageTruthKey}::${args.activeCanonicalUnitId ?? "none"}`;
}

export function useProfessorLesson({
  vsg, documentId, pageTruthKey, activeCanonicalUnitId, enabled,
}: Args): UseProfessorLessonResult {
  const [lessonPlan, setLessonPlan]   = useState<ProfessorLessonPlan | null>(null);
  const [status, setStatus]           = useState<ProfessorLessonStatus>("idle");
  const [usingFallback, setUsingFallback] = useState(false);
  const [reanalyzeCount, setReanalyzeCount] = useState(0);

  const abortRef       = useRef<AbortController | null>(null);
  const startedKeyRef  = useRef<string | null>(null);
  const forceRefetchRef = useRef(false);

  const vsgRef = useRef(vsg);
  vsgRef.current = vsg;

  const reanalyze = useCallback(() => {
    forceRefetchRef.current = true;
    startedKeyRef.current = null;
    setReanalyzeCount(c => c + 1);
  }, []);

  const applyDeterministicFallback = useCallback((v: VisualSceneGraph, snapshotVsgId: string) => {
    const grounded = buildDeterministicLessonScript(v);
    const plan = buildProfessorTeachingActions(v, grounded, {
      documentId, pageNumber: v.sourcePageNumber ?? 0, pageTruthKey,
      activeCanonicalUnitId, vsgId: snapshotVsgId, plannerVersion: PLANNER_VERSION,
    });
    setLessonPlan(plan);
    setUsingFallback(true);
  }, [documentId, pageTruthKey, activeCanonicalUnitId]);

  const key = identityKey({ documentId, pageTruthKey, activeCanonicalUnitId });

  // ── Effect A: identity changed → reset + try cache ─────────────────────
  useEffect(() => {
    setLessonPlan(null);
    setStatus("idle");
    setUsingFallback(false);
    startedKeyRef.current = null;

    let cancelled = false;
    const cacheKey = buildProfessorLessonCacheKey({ documentId, pageTruthKey, activeCanonicalUnitId });
    (async () => {
      try {
        const stored = await getProfessorLessonPlan(cacheKey);
        if (cancelled) return;
        if (stored && stored.plan.sourceSnapshot.pageTruthKey === pageTruthKey) {
          setLessonPlan(stored.plan);
          setUsingFallback(false);
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

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    (async () => {
      try {
        const input = buildProfessorLessonInput({ vsg: v, documentId, pageTruthKey, activeCanonicalUnitId });
        const res = await fetch("/api/professor-lesson-plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
          signal: ctrl.signal,
        });
        const data = (await res.json()) as ProfessorLessonPlanResponse;
        if (ctrl.signal.aborted) return;

        if (!data.ok) {
          applyDeterministicFallback(v, v.id);
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
          // Everything the model referenced was ungroundable — degrade, not empty.
          applyDeterministicFallback(v, v.id);
          setStatus("error");
          return;
        }

        const plan = buildProfessorTeachingActions(v, grounded, {
          documentId, pageNumber: v.sourcePageNumber ?? 0, pageTruthKey,
          activeCanonicalUnitId, vsgId: v.id, plannerVersion: PLANNER_VERSION,
        });
        setLessonPlan(plan);
        setUsingFallback(false);
        setStatus("success");

        const cacheKey = buildProfessorLessonCacheKey({ documentId, pageTruthKey, activeCanonicalUnitId });
        saveProfessorLessonPlan(cacheKey, plan).catch(() => {});
      } catch (err: any) {
        if (ctrl.signal.aborted) return;
        console.error("[PROFESSOR_LESSON_CLIENT_ERROR]", { pageTruthKey, message: err?.message ?? String(err) });
        applyDeterministicFallback(v, v.id);
        setStatus("error");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, reanalyzeCount, applyDeterministicFallback]);

  return { lessonPlan, status, usingFallback, reanalyze };
}
