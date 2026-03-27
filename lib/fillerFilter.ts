import type { ParagraphSignal } from "@/lib/readerContracts";

export function suppressFiller(signals: ParagraphSignal[]): ParagraphSignal[] {
  return signals.map((signal) => {
    const lowYield = signal.yieldScore < 0.35 && signal.examSignalScore < 1.2;
    const fillerKind = signal.kind === "filler" || signal.blockType === "metadata" || signal.blockType === "reference";
    return {
      ...signal,
      suppress: lowYield && fillerKind,
    };
  });
}

export function selectTopSignals(signals: ParagraphSignal[], min = 3, max = 7, minYield = 0): ParagraphSignal[] {
  const filtered = signals.filter((s) => !s.suppress && s.yieldScore >= minYield).sort((a, b) => b.yieldScore - a.yieldScore);
  const count = Math.min(max, Math.max(min, filtered.length >= min ? filtered.length : min));
  return filtered.slice(0, count).sort((a, b) => a.index - b.index);
}
