import type { HighlightTarget, PageSignals } from "@/lib/readerContracts";
import { buildHighlightTargets, selectRenderableEvidence } from "@/lib/highlightScoring";

export function normalizeEvidenceText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/-\s*\n\s*/g, "")
    .replace(/\s+/g, " ")
    .replace(/\[[0-9,\- ]+\]/g, "")
    .trim();
}

export function deriveHighlightTargets(
  signals: PageSignals,
  page: number,
  audience: "student" | "clinical" | "expert",
  limitedEvidence: boolean,
): HighlightTarget[] {
  const selected = selectRenderableEvidence(signals, audience);
  return buildHighlightTargets(page, selected, limitedEvidence).map((target) => ({
    ...target,
    normalizedText: normalizeEvidenceText(target.text),
  }));
}
