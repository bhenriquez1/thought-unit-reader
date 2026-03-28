import type { InsightsPayload, PageClassification, PageSignals } from "@/lib/readerContracts";
import type { ReasoningModeProfile } from "./modeProfile";

function topExamSignals(signals: PageSignals, limit = 5) {
  return (signals.paragraphSignals || [])
    .filter((p) => !p.suppress)
    .sort((a, b) => b.examSignalScore - a.examSignalScore)
    .slice(0, limit);
}

function extractTerms(lines: string[], cap = 6): string[] {
  const terms = new Set<string>();
  const termRe = /\b([A-Za-z][A-Za-z\-]{3,})\b/g;
  for (const line of lines) {
    let match: RegExpExecArray | null;
    while ((match = termRe.exec(line)) !== null) {
      const token = match[1];
      if (/^(this|that|with|from|have|been|were|their|there|which|using|into|between)$/i.test(token)) continue;
      terms.add(token);
      if (terms.size >= cap) return Array.from(terms);
    }
  }
  return Array.from(terms);
}

export function buildInsightsPayload(classification: PageClassification, signals: PageSignals, mode?: ReasoningModeProfile): InsightsPayload {
  const ranked = topExamSignals(signals, mode?.label === "expert" ? 7 : mode?.label === "student" ? 4 : 6);
  const any = ranked.map((entry) => entry.text);
  const examish = ranked.filter((entry) => entry.examSignalScore >= 1.8).map((entry) => entry.text);
  const maxExamSignal = ranked[0]?.examSignalScore ?? 0;

  if (any.length === 0 || maxExamSignal < 1.4) {
    return {
      applyTest: ["No strong application signal on this page."],
      examSignalScore: maxExamSignal,
      message: "Limited evidence on this page",
    };
  }

  const terms = extractTerms(any, 5);
  const prompts = examish.length ? examish.slice(0, 3) : any.slice(0, 2);
  const applyItems = [
    ...prompts,
    ...(terms.length ? [`Focus terms: ${terms.join(", ")}`] : []),
  ];

  return {
    applyTest: applyItems.length ? applyItems : [
      classification.pageType === "clinical"
        ? "Apply sign → interpretation → next decision."
        : "Apply the page's main rule to one concrete example.",
    ],
    examSignalScore: maxExamSignal,
  };
}
