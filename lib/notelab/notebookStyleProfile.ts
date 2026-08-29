// lib/notelab/notebookStyleProfile.ts
// N6 — the last phase of the NoteLab redesign: "NoteLab can eventually
// personalize to a student's notebook style, but never sacrifice source
// grounding" (the correction's own closing line).
//
// A NotebookStyleProfile is computed purely from a student's OWN past
// VisualNotebookScenes — never a preference the student explicitly set,
// never a demographic/subject-level default. It's a soft bias only:
// describeNotebookStyleProfile's output is appended to
// buildNotebookPlannerSystemPrompt's prompt as one more paragraph the model
// weighs, never a rule that can override the material itself or the
// grounding contract above it in the same prompt.
//
// Split into a pure computation (computeNotebookStyleProfile/
// describeNotebookStyleProfile — real behavioral test coverage, no IDB
// dependency, same discipline as notebookLayout.ts) and a thin IDB-reading
// gatherer (getRecentNotebookScenes — source-inspection coverage only,
// same split whiteboardLessonSnapshotStore.test.ts's own header comment
// documents for its pure-builder-vs-IDB-plumbing tests).

import { getAllUltraNotesAsync } from "@/lib/notelab/ultraNoteStore";
import type { VisualNotebookScene, NotebookPrimitive } from "@/lib/notelab/notebookScene";

// The "drawn structure" cluster — genuinely spatial/visual primitives, the
// specific signal the correction calls out as "diagram usage."
const DIAGRAM_PRIMITIVES: ReadonlySet<NotebookPrimitive> = new Set([
  "diagram", "concept_map", "image", "table", "timeline", "flow", "comparison",
]);
const WORKED_EXAMPLE_PRIMITIVES: ReadonlySet<NotebookPrimitive> = new Set(["example", "equation_work"]);
const CONNECTOR_PRIMITIVES: ReadonlySet<NotebookPrimitive> = new Set(["arrow", "connector"]);

export interface NotebookStyleProfile {
  /** Number of scenes the profile was computed from — carried through so a
   *  caller can judge how much to trust a thin profile, never hidden. */
  sampleSize: number;
  totalBlocks: number;
  /** Each primitive's share of all sampled blocks, in [0, 1] — sums to ~1
   *  across every primitive that appeared at least once. */
  primitiveFrequency: Partial<Record<NotebookPrimitive, number>>;
  /** Up to 3 most-used CONTENT primitives (never arrow/connector — a
   *  structural detail, not a content preference), most frequent first. */
  topPrimitives: NotebookPrimitive[];
  /** Share of blocks that are genuinely spatial/structural (see
   *  DIAGRAM_PRIMITIVES) — the correction's own "diagram usage" signal. */
  diagramDensity: number;
  /** Share of blocks that are a worked example or worked derivation. */
  workedExampleFrequency: number;
  /** Share of blocks that are an arrow or connector — the correction's own
   *  "arrow density" signal: does this student's notebook read as richly
   *  interconnected, or as isolated blocks? */
  arrowDensity: number;
}

// Below this much real signal, a "preference" is just one page's incidental
// structure — returning null (no bias at all) rather than overfitting to a
// single scene is the same discipline notebookPlanner.ts's own grounding
// rule uses: no signal is better than a false one.
const MIN_SCENES_FOR_PROFILE = 2;
const MIN_BLOCKS_FOR_PROFILE = 6;

/**
 * Pure: the same set of scenes always produces the same profile. Returns
 * null when there isn't yet enough of the student's own notebook history to
 * responsibly bias anything.
 */
export function computeNotebookStyleProfile(scenes: VisualNotebookScene[]): NotebookStyleProfile | null {
  if (scenes.length < MIN_SCENES_FOR_PROFILE) return null;
  const allBlocks = scenes.flatMap((s) => s.blocks);
  if (allBlocks.length < MIN_BLOCKS_FOR_PROFILE) return null;

  const counts = new Map<NotebookPrimitive, number>();
  for (const block of allBlocks) counts.set(block.primitive, (counts.get(block.primitive) ?? 0) + 1);

  const total = allBlocks.length;
  const primitiveFrequency: Partial<Record<NotebookPrimitive, number>> = {};
  for (const [primitive, count] of counts) primitiveFrequency[primitive] = count / total;

  const topPrimitives = [...counts.entries()]
    .filter(([primitive]) => !CONNECTOR_PRIMITIVES.has(primitive))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([primitive]) => primitive);

  const diagramCount = allBlocks.filter((b) => DIAGRAM_PRIMITIVES.has(b.primitive)).length;
  const workedExampleCount = allBlocks.filter((b) => WORKED_EXAMPLE_PRIMITIVES.has(b.primitive)).length;
  const connectorCount = allBlocks.filter((b) => CONNECTOR_PRIMITIVES.has(b.primitive)).length;

  return {
    sampleSize: scenes.length,
    totalBlocks: total,
    primitiveFrequency,
    topPrimitives,
    diagramDensity: diagramCount / total,
    workedExampleFrequency: workedExampleCount / total,
    arrowDensity: connectorCount / total,
  };
}

const PRIMITIVE_STYLE_LABEL: Partial<Record<NotebookPrimitive, string>> = {
  diagram: "diagrams", concept_map: "concept maps", image: "figures", table: "tables",
  timeline: "timelines", flow: "flow charts", comparison: "side-by-side comparisons",
  example: "worked examples", equation_work: "worked derivations", formula: "formulas",
  callout: "callout boxes", text: "written explanations", heading: "section headings",
  label: "labels", freehand: "freehand sketches", source_anchor: "quoted source passages",
  highlight: "highlighted passages", underline: "underlined passages",
};

/**
 * Renders a profile into the exact paragraph buildNotebookPlannerSystemPrompt
 * appends to its prompt — explicitly labeled as a soft, overridable
 * preference every time it's used, never phrased as a requirement.
 */
export function describeNotebookStyleProfile(profile: NotebookStyleProfile): string {
  const styleWords = profile.topPrimitives.map((p) => PRIMITIVE_STYLE_LABEL[p] ?? p).filter(Boolean);
  const leaning =
    profile.diagramDensity >= 0.35 ? "a visual, diagram-heavy style"
    : profile.diagramDensity <= 0.1 ? "a mostly written, text-first style"
    : "a balanced mix of text and visuals";
  const workedExampleNote = profile.workedExampleFrequency >= 0.2
    ? " They also lean heavily on worked examples and worked derivations."
    : "";
  const styleList = styleWords.length ? ` — most often ${styleWords.join(", ")}` : "";

  return `PERSONALIZATION (soft preference only — NEVER overrides the grounding rule above or the material itself): This student's own past notebooks lean toward ${leaning}${styleList}.${workedExampleNote} When multiple primitives would equally fit THIS page's material, prefer the ones this student already reaches for — but never force a primitive that doesn't fit the content, never add filler blocks just to match a preference, and never let this override a genuinely different structure the material itself calls for.`;
}

/**
 * Gathers a student's own recent notebook scenes from storage, most
 * recently built first — the raw material computeNotebookStyleProfile
 * expects. Not itself unit-tested (IDB plumbing, no polyfill in this repo's
 * jest config — see whiteboardLessonSnapshotStore.test.ts's own header
 * comment for the established precedent); the pure computation above is.
 */
export async function getRecentNotebookScenes(limit = 20): Promise<VisualNotebookScene[]> {
  const notes = await getAllUltraNotesAsync();
  return notes
    .filter((n): n is typeof n & { notebookScene: VisualNotebookScene } => !!n.notebookScene)
    .sort((a, b) => b.notebookScene.builtAt - a.notebookScene.builtAt)
    .slice(0, limit)
    .map((n) => n.notebookScene);
}
