// lib/examEngine/examScope.ts
// TestLab-Reader progress integration — turns a chosen exam scope + the
// student's actual Reader progress into the page ranges buildExam()
// already knows how to narrow by (ExamBuildOptions.chapterPageRanges).
// Pure: no IO here — callers (app/apex/generator/page.tsx) fetch the
// ReadingProgressRecord/KnowledgeNode data and pass it in, same discipline
// lib/knowledge/learningStateEvents.ts uses for applyLearningEvent.
//
// The core product rule this file exists to enforce: "Completed material
// only" must never be able to leak pages the student hasn't reached yet —
// see tests/examEngine/examScope.test.ts's page-100-can't-see-page-200 case.

import type { ReadingProgressRecord } from "@/lib/reader/readingProgressStore";
import { todaysFurthestPage } from "@/lib/reader/readingProgressStore";
import type { KnowledgeNode, KnowledgeNodeProgress } from "@/lib/knowledge/knowledgeGraphSchema";

export type ExamScope =
  | "completed"           // pages up to furthestPageReached — the default when a Reader book is linked
  | "today"                // pages read today only
  | "selected-chapters"    // manual chapter/page-range selection (existing generator UI)
  | "weak-areas"           // pages backing Knowledge Graph nodes below the profile's weak-accuracy threshold
  | "custom-concepts"      // pages backing a user-picked set of Knowledge Graph nodes
  | "entire-book";          // no narrowing — requires explicit user selection, never the default

export interface ExamScopeOption {
  id: ExamScope;
  label: string;
  description: string;
}

export const EXAM_SCOPE_OPTIONS: ExamScopeOption[] = [
  { id: "completed",          label: "What I've completed",   description: "Only material up through the furthest page you've reached in Reader" },
  { id: "today",               label: "Today's reading",       description: "Only what you read today" },
  { id: "selected-chapters",   label: "Selected chapters/pages", description: "Pick specific chapters or a page range yourself" },
  { id: "weak-areas",          label: "Weak areas",            description: "Concepts TestLab has seen you struggle with" },
  { id: "custom-concepts",     label: "Custom concepts",       description: "Pick specific concepts from the Knowledge Graph" },
  { id: "entire-book",         label: "Entire book",           description: "No limit — may include material you haven't reached yet" },
];

/** The only scope that is safe to default to without the student explicitly
 *  asking for it — "entire book" must always be an opt-in click, per the
 *  product rule that TestLab never silently tests unread material. */
export const DEFAULT_LINKED_SCOPE: ExamScope = "completed";
export const DEFAULT_UNLINKED_SCOPE: ExamScope = "entire-book";

/** Picks the right default scope for a book, given whether Reader has any
 *  progress checkpoint for it yet. A book with no Reader progress record
 *  has nothing to narrow by, so defaulting to "completed" would silently
 *  produce zero eligible pages — "entire book" is the honest default there,
 *  same as the underlying reason chapterPageRanges was always optional. */
export function defaultScopeFor(progress: ReadingProgressRecord | null): ExamScope {
  return progress ? DEFAULT_LINKED_SCOPE : DEFAULT_UNLINKED_SCOPE;
}

export interface PageRange { start: number; end: number }

/** Result of resolving a scope: the page ranges to pass as
 *  ExamBuildOptions.chapterPageRanges (undefined = no narrowing, i.e.
 *  "entire book"), plus a short human-readable summary for the UI.
 *  `blocked: true` means there is nothing eligible to generate from yet
 *  (e.g. no reading today, no weak concepts identified) — the caller must
 *  disable Generate and show `summary` as the reason, rather than call
 *  buildExam() with a range that would need to match zero real pages. */
export interface ResolvedScope {
  pageRanges: PageRange[] | undefined;
  summary: string;
  blocked: boolean;
}

function nodesToPageRanges(nodes: KnowledgeNode[]): PageRange[] {
  const pages = new Set<number>();
  for (const n of nodes) for (const p of n.sourcePages) pages.add(p);
  return Array.from(pages).sort((a, b) => a - b).map((p) => ({ start: p, end: p }));
}

export interface WeakAreaInputs {
  nodes: KnowledgeNode[];
  progressByNodeId: Map<string, KnowledgeNodeProgress>;
  weakAccuracyThreshold: number;
  minAttemptsForSignal: number;
}

/** A node counts as "weak" once it has enough graded evidence to be
 *  meaningful (matches ExamProfile.weaknessAnalytics.minAttemptsForSignal,
 *  the same gate DAT Apex's own weaknessAnalytics.ts uses) and its recall
 *  score is below the profile's weak-accuracy threshold. */
export function selectWeakNodes(inputs: WeakAreaInputs): KnowledgeNode[] {
  return inputs.nodes.filter((n) => {
    const p = inputs.progressByNodeId.get(n.id);
    if (!p) return false;
    const attempts = p.successfulRecallCount + p.failedRecallCount;
    if (attempts < inputs.minAttemptsForSignal) return false;
    return p.recallScore < inputs.weakAccuracyThreshold;
  });
}

export interface ResolveScopeOptions {
  scope: ExamScope;
  progress: ReadingProgressRecord | null;
  /** Manual selection for "selected-chapters" (already computed by the
   *  existing generator UI via tocToPageRanges()). */
  manualPageRanges?: PageRange[];
  /** Knowledge Graph data for "weak-areas" / "custom-concepts". */
  allNodes?: KnowledgeNode[];
  progressByNodeId?: Map<string, KnowledgeNodeProgress>;
  weakAccuracyThreshold?: number;
  minAttemptsForSignal?: number;
  /** User-picked node ids for "custom-concepts". */
  selectedNodeIds?: Set<string>;
  now?: string;
}

export function resolveExamScope(opts: ResolveScopeOptions): ResolvedScope {
  switch (opts.scope) {
    case "entire-book":
      return { pageRanges: undefined, summary: "Entire book — including material you haven't reached yet", blocked: false };

    case "completed": {
      const furthest = opts.progress?.furthestPageReached ?? null;
      if (furthest == null) {
        return { pageRanges: undefined, summary: "No Reader progress found yet for this book", blocked: true };
      }
      return { pageRanges: [{ start: 1, end: furthest }], summary: `Pages 1–${furthest} (your furthest point in Reader)`, blocked: false };
    }

    case "today": {
      const todays = todaysFurthestPage(opts.progress ?? null, opts.now);
      if (todays == null) {
        return { pageRanges: undefined, summary: "You haven't read anything today yet", blocked: true };
      }
      return { pageRanges: [{ start: 1, end: todays }], summary: `Today's reading — up to page ${todays}`, blocked: false };
    }

    case "selected-chapters": {
      const ranges = opts.manualPageRanges ?? [];
      if (ranges.length === 0) {
        return { pageRanges: undefined, summary: "No chapters selected — choose at least one below", blocked: true };
      }
      return { pageRanges: ranges, summary: `${ranges.length} selected chapter${ranges.length === 1 ? "" : "s"}`, blocked: false };
    }

    case "weak-areas": {
      const nodes = opts.allNodes ?? [];
      const weak = selectWeakNodes({
        nodes,
        progressByNodeId: opts.progressByNodeId ?? new Map(),
        weakAccuracyThreshold: opts.weakAccuracyThreshold ?? 60,
        minAttemptsForSignal: opts.minAttemptsForSignal ?? 3,
      });
      if (weak.length === 0) {
        return { pageRanges: undefined, summary: "No weak concepts identified yet — practice a bit first", blocked: true };
      }
      return { pageRanges: nodesToPageRanges(weak), summary: `${weak.length} weak concept${weak.length === 1 ? "" : "s"}`, blocked: false };
    }

    case "custom-concepts": {
      const selected = opts.selectedNodeIds ?? new Set<string>();
      const nodes = (opts.allNodes ?? []).filter((n) => selected.has(n.id));
      if (nodes.length === 0) {
        return { pageRanges: undefined, summary: "No concepts selected — choose at least one below", blocked: true };
      }
      return { pageRanges: nodesToPageRanges(nodes), summary: `${nodes.length} selected concept${nodes.length === 1 ? "" : "s"}`, blocked: false };
    }
  }
}
