// lib/whiteboard/groundProfessorLesson.ts
// Grounding/validation layer for a ProfessorLessonScript — the same "AI
// proposes, deterministic code verifies-or-drops" discipline
// groundSurgeonQuotes.ts applies to PDF highlights, applied here to the
// whiteboard's teaching script:
//   - A targetId that doesn't name a real VisualSceneGraph node/edge id is
//     dropped, never rendered (OpenAI never invents nodes).
//   - Every surviving shortLabel is clamped to <=8 words / non-paragraph-
//     shaped, regardless of what the model returned.
//   - At most ONE node/edge is emphasized (the single "circle the high-yield
//     point" moment) — later duplicates are demoted, not multiplied.
//   - Total surviving targets are capped so the canvas stays under ~10
//     primary objects even if the underlying VSG has more nodes/edges.

import type { VisualSceneGraph } from "./visualSceneGraph";
import type { ProfessorLessonScript, ProfessorNodeScript } from "./professorLessonPlan";
import { clampToShortLabel, isParagraphShaped } from "./textMetrics";

/** Keeps the canvas readable — the VSG itself may carry up to 12 nodes plus
 *  edges; this is the whiteboard-specific "fewer than 10 main visual
 *  objects" ceiling applied on top of that. */
export const MAX_GROUNDED_TARGETS = 10;

export interface GroundedProfessorLessonScript {
  title: string;
  visualGrammar: ProfessorLessonScript["visualGrammar"];
  learningObjective: string;
  synthesisQuestion: string;
  nodeScripts: ProfessorNodeScript[];
}

function sanitizeLabel(raw: string): string {
  const clamped = clampToShortLabel(raw, 8);
  if (!isParagraphShaped(clamped)) return clamped;
  // Still reads as multiple sentences even after the word clamp (e.g. several
  // short clauses crammed together) — cut at the FIRST sentence boundary
  // instead of just trimming words, so no trailing sentence survives.
  const firstSentenceEnd = clamped.search(/[.!?](?:\s|$)/);
  const singleSentence = firstSentenceEnd >= 0 ? clamped.slice(0, firstSentenceEnd) : clamped;
  return clampToShortLabel(singleSentence.replace(/[.!?]+$/, ""), 6);
}

/**
 * Ground a ProfessorLessonScript against the VisualSceneGraph it was
 * generated for. Never throws — always returns a script the converter can
 * safely turn into an action timeline, even if every targetId was bogus
 * (nodeScripts then comes back empty; the caller — useProfessorLesson.ts —
 * treats that as a failure and surfaces a retry state, there is no
 * fallback generator to hand off to).
 */
export function groundProfessorLesson(
  script: ProfessorLessonScript,
  vsg: VisualSceneGraph,
): GroundedProfessorLessonScript {
  const validIds = new Set<string>([
    ...vsg.nodes.map(n => n.id),
    ...vsg.edges.map(e => e.id),
  ]);

  const seenTargets = new Set<string>();
  let emphasizeUsed = false;
  const grounded: ProfessorNodeScript[] = [];

  for (const entry of script.nodeScripts) {
    if (!validIds.has(entry.targetId)) continue;      // hallucinated id — drop
    if (seenTargets.has(entry.targetId)) continue;     // duplicate — keep first only
    if (grounded.length >= MAX_GROUNDED_TARGETS) break; // density cap

    seenTargets.add(entry.targetId);
    const emphasize = Boolean(entry.emphasize) && !emphasizeUsed;
    if (emphasize) emphasizeUsed = true;

    grounded.push({
      ...entry,
      shortLabel: sanitizeLabel(entry.shortLabel),
      emphasize,
    });
  }

  return {
    title:              sanitizeLabel(script.title.length > 0 ? clampToShortLabel(script.title, 6) : script.title),
    visualGrammar:      script.visualGrammar,
    learningObjective:  script.learningObjective.trim(),
    synthesisQuestion:  script.synthesisQuestion.trim(),
    nodeScripts:         grounded,
  };
}
