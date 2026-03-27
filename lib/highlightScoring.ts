import type { AudienceMode, HighlightLevel, HighlightTarget, PageSignals, ParagraphSignal } from "@/lib/readerContracts";

const PRIORITY: Record<string, number> = {
  mechanism: 1,
  comparison: 2,
  definition: 3,
  clinical: 4,
  application: 5,
  formula: 6,
};

function rankSignal(signal: ParagraphSignal): number {
  return (PRIORITY[signal.kind] || 99) * 100 - signal.examSignalScore * 20 - signal.yieldScore * 5;
}

export function selectRenderableEvidence(signals: PageSignals, audience: AudienceMode): ParagraphSignal[] {
  const pool = (signals.paragraphSignals || [])
    .filter((entry) => !entry.suppress && entry.blockType !== "metadata" && entry.blockType !== "reference")
    .sort((a, b) => rankSignal(a) - rankSignal(b));
  const cap = audience === "student" ? 2 : audience === "expert" ? 4 : 3;
  return pool.slice(0, cap);
}

export function levelForSignal(signal: ParagraphSignal, limitedEvidence: boolean): HighlightLevel {
  if (limitedEvidence) return "weak";
  if (signal.yieldScore >= 0.72) return "high_yield";
  if (signal.yieldScore >= 0.5) return "supporting";
  return "weak";
}

export function maxWeakHighlights(limitedEvidence: boolean): number {
  return limitedEvidence ? 1 : 2;
}

export function buildHighlightTargets(
  page: number,
  selected: ParagraphSignal[],
  limitedEvidence: boolean,
): HighlightTarget[] {
  let weakCount = 0;
  return selected.flatMap((signal) => {
    const level = levelForSignal(signal, limitedEvidence);
    if (level === "weak") {
      weakCount += 1;
      if (weakCount > maxWeakHighlights(limitedEvidence)) return [];
    }
    const id = `ev-${page}-${signal.index}`;
    return [{
      id,
      page,
      text: signal.text,
      normalizedText: signal.text.toLowerCase().replace(/\s+/g, " ").trim(),
      level,
      score: signal.yieldScore,
      sourceParagraphIndex: signal.index,
      kind: signal.kind,
      evidenceRefId: id,
    }];
  });
}
