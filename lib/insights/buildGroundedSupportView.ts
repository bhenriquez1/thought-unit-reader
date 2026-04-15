// lib/insights/buildGroundedSupportView.ts
//
// Builds a thin grounded support view from a PageInsightModel.
// Useful as a fallback when the full narrative view is blocked or thin.

import type { PageInsightModel } from "@/lib/insights/types";
import { cleanSentence } from "@/lib/insights/sentenceCleanup";
import { isRenderableSentence } from "@/lib/insights/isRenderableSentence";
import type { GroundedSupportView } from "@/lib/reading-graph/types";

function clean(text?: string | null): string {
  if (!text) return "";
  return cleanSentence(String(text).replace(/\s+/g, " ").trim());
}

function valid(text?: string | null): boolean {
  const c = clean(text);
  return Boolean(c) && isRenderableSentence(c);
}

function dedupe(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const v = clean(raw);
    if (!valid(v)) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

export function buildGroundedSupportView(
  pageModel: PageInsightModel | null
): GroundedSupportView {
  if (!pageModel) {
    return { mainIdea: "", support: [], weakSupport: [], evidenceAnchorIds: [] };
  }

  // Main idea: first renderable top takeaway, falling back to first paragraph summary
  const mainIdea =
    pageModel.topTakeaways.map(clean).find(valid) ??
    pageModel.paragraphInsights.map((p) => clean(p.summary)).find(valid) ??
    "";

  // Support: remaining top takeaways (distinct from mainIdea)
  const supportCandidates = dedupe([
    ...pageModel.topTakeaways.slice(1),
    ...pageModel.paragraphInsights.slice(0, 3).flatMap((p) => [
      p.summary,
      ...(p.coreSignals ?? []),
    ]),
  ]).filter((t) => t.toLowerCase() !== mainIdea.toLowerCase());

  const support = supportCandidates.slice(0, 3);

  // Weak support: additional signals from later paragraphs
  const weakCandidates = dedupe(
    pageModel.paragraphInsights.slice(3).flatMap((p) => [
      p.summary,
      ...(p.takeaways ?? []),
    ])
  ).filter(
    (t) =>
      t.toLowerCase() !== mainIdea.toLowerCase() && !support.includes(t)
  );

  const weakSupport = weakCandidates.slice(0, 2);

  // Evidence anchor ids from extracted signals
  const evidenceAnchorIds: string[] = [];

  return { mainIdea, support, weakSupport, evidenceAnchorIds };
}
