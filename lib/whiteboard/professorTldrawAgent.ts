import { z } from "zod";
import {
  CameraIntentSchema,
  type CameraIntent,
  type ProfessorLessonPlan,
} from "./professorLessonPlan";

export const ProfessorTldrawStepPatchSchema = z.object({
  stepId: z.number().int().nonnegative(),
  cameraIntent: CameraIntentSchema,
  /** Existing tldraw shape ids only. Unknown/future ids are dropped by the
   * deterministic verifier below. */
  retainContextTargetIds: z.array(z.string()).max(8),
  correctionNeeded: z.boolean(),
});

export type ProfessorTldrawStepPatch = z.infer<typeof ProfessorTldrawStepPatchSchema>;

export const ProfessorTldrawAgentResponseSchema = z.object({
  model: z.string().nullable(),
  patches: z.array(ProfessorTldrawStepPatchSchema).max(24),
});

export interface ProfessorTldrawAgentStepInput {
  stepId: number;
  visualNeeded: boolean;
  teachingStructure: string;
  visualIntent: string;
  cameraIntent: CameraIntent;
  activeTargetIds: string[];
  retainContextTargetIds: string[];
  canvasState: Array<{ shapeId: string; semanticRole: string }>;
}

export function buildProfessorTldrawAgentInput(plan: ProfessorLessonPlan): ProfessorTldrawAgentStepInput[] {
  return (plan.directorSteps ?? []).map(step => {
    const camera = plan.actions.find(action => action.type === "move-camera" && action.stepId === step.stepId);
    const semanticRoleByShapeId = new Map<string, string>();
    for (const action of plan.actions) {
      if (action.stepId >= step.stepId) continue;
      if (action.type === "draw-shape") semanticRoleByShapeId.set(action.shapeId, action.teachingRole ?? "visual");
      if (action.type === "draw-arrow") semanticRoleByShapeId.set(action.shapeId, action.relationshipKind ?? "relationship");
      if (action.type === "write" && !semanticRoleByShapeId.has(action.shapeId)) semanticRoleByShapeId.set(action.shapeId, "label");
    }
    return {
      stepId: step.stepId,
      visualNeeded: step.visualNeeded,
      teachingStructure: step.teachingStructure,
      visualIntent: step.visualIntent,
      cameraIntent: step.cameraIntent,
      activeTargetIds: camera?.type === "move-camera" ? camera.targetIds : [],
      retainContextTargetIds: camera?.type === "move-camera" ? (camera.retainContextTargetIds ?? []) : [],
      canvasState: Array.from(semanticRoleByShapeId, ([shapeId, semanticRole]) => ({ shapeId, semanticRole })),
    };
  });
}

/** Claude may direct attention only inside the validated plan. It cannot add
 * content, actions, geometry, or a future shape id. */
export function applyProfessorTldrawAgentPatches(
  plan: ProfessorLessonPlan,
  patches: ProfessorTldrawStepPatch[],
  model: string | null,
): ProfessorLessonPlan {
  const patchByStep = new Map(patches.map(patch => [patch.stepId, patch]));
  const correctedStepIds: number[] = [];

  const actions = plan.actions.map(action => {
    if (action.type !== "move-camera") return action;
    const patch = patchByStep.get(action.stepId);
    if (!patch) return action;

    const revealedShapeIds = new Set(
      plan.actions
        .filter(candidate =>
          candidate.stepId <= action.stepId
          && (candidate.type === "draw-shape" || candidate.type === "draw-arrow" || candidate.type === "write"),
        )
        .map(candidate => candidate.type === "write" || candidate.type === "draw-shape" || candidate.type === "draw-arrow" ? candidate.shapeId : ""),
    );
    const retainContextTargetIds = patch.retainContextTargetIds.filter(id => revealedShapeIds.has(id));
    const cameraIntent = patch.cameraIntent === "stay-on-pdf" ? action.cameraIntent : patch.cameraIntent;
    if (patch.correctionNeeded) correctedStepIds.push(action.stepId);
    return {
      ...action,
      cameraIntent,
      retainContextTargetIds,
      // Active targets remain authoritative. Claude can keep additional
      // already-revealed context, never delete the active concept.
      targetIds: Array.from(new Set([...action.targetIds, ...retainContextTargetIds])),
    };
  });

  const directorSteps = plan.directorSteps?.map(step => {
    const patch = patchByStep.get(step.stepId);
    return patch && step.visualNeeded && patch.cameraIntent !== "stay-on-pdf"
      ? { ...step, cameraIntent: patch.cameraIntent }
      : step;
  });

  return {
    ...plan,
    actions,
    directorSteps,
    executionAgent: { provider: "claude", model, correctedStepIds: Array.from(new Set(correctedStepIds)) },
  };
}

export async function refineProfessorTldrawExecution(
  plan: ProfessorLessonPlan,
  signal?: AbortSignal,
): Promise<ProfessorLessonPlan> {
  const steps = buildProfessorTldrawAgentInput(plan);
  if (steps.length === 0) return { ...plan, executionAgent: { provider: "deterministic", model: null, correctedStepIds: [] } };
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  signal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch("/api/professor-tldraw-agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageTruthKey: plan.sourceSnapshot.pageTruthKey, steps }),
      signal: controller.signal,
    });
    const parsed = ProfessorTldrawAgentResponseSchema.safeParse(await response.json());
    if (!response.ok || !parsed.success) throw new Error("invalid_agent_response");
    return applyProfessorTldrawAgentPatches(plan, parsed.data.patches, parsed.data.model);
  } catch (error) {
    if (signal?.aborted) throw error;
    return { ...plan, executionAgent: { provider: "deterministic", model: null, correctedStepIds: [] } };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromCaller);
  }
}
