import type { InsightsPayload, PageClassification, PageSignals } from "@/lib/readerContracts";

function topBy(signals: PageSignals, kind: string, limit = 4): string[] {
  return (signals.paragraphSignals || [])
    .filter((p) => !p.suppress && (kind === "any" || p.kind === kind))
    .sort((a, b) => b.yieldScore - a.yieldScore)
    .slice(0, limit)
    .map((p) => p.text);
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

export function buildInsightsPayload(classification: PageClassification, signals: PageSignals): InsightsPayload {
  const any = topBy(signals, "any", 6);
  const clinical = topBy(signals, "clinical", 4);
  const formula = topBy(signals, "formula", 4);
  const comparison = topBy(signals, "comparison", 4);
  const examish = topBy(signals, "application", 4);

  const dat = {
    testedConcepts: extractTerms(any, 6),
    likelyQuestionAngles: examish.length ? examish.slice(0, 3) : any.slice(0, 3),
    commonTraps: [
      classification.pageType === "clinical" ? "Confusing similar clinical patterns" : "Choosing the wrong rule from look-alike options",
      "Ignoring discriminating wording in stems",
    ],
    mustKnowTerms: extractTerms(clinical.length ? clinical : any, 6),
    distinctionPairs: comparison.length ? comparison.slice(0, 3) : ["No grounded distinction pair found yet"],
    fastRecall: any.slice(0, 3).map((line) => line.length > 120 ? `${line.slice(0, 117)}...` : line),
    applicationCue: examish.slice(0, 3),
  };

  if (classification.pageType === "formula") {
    dat.commonTraps[0] = "Sign and substitution errors in algebraic manipulation";
  }

  return {
    highYield: any.slice(0, 4),
    traps: dat.commonTraps,
    hiddenConnections: classification.pageType === "clinical" ? clinical.slice(0, 3) : any.slice(1, 4),
    whatYouMayMiss: ["Discriminating terms in stem language", "Condition or exception clauses"],
    dat,
  };
}
