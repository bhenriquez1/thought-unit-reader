import type { InsightsPayload, PageClassification, PageSignals } from "@/lib/readerContracts";
import type { ReasoningModeProfile } from "./modeProfile";

function topBy(signals: PageSignals, kind: string, limit = 4): string[] {
  return (signals.paragraphSignals || [])
    .filter((p) => !p.suppress && (kind === "any" || p.kind === kind))
    .sort((a, b) => b.yieldScore - a.yieldScore)
    .slice(0, limit)
    .map((p) => p.text);
}

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
  const clinical = topBy(signals, "clinical", 4);
  const comparison = topBy(signals, "comparison", 4);
  const examish = ranked.filter((entry) => entry.examSignalScore >= 1.8).map((entry) => entry.text);
  const mechanismAnchors = ranked.filter((entry) => entry.mechanismScore > 0).slice(0, 2).map((entry) => entry.text);
  const groundedTrapLines = ranked.filter((entry) => entry.trapScore > 0 || entry.distinctionScore > 0).slice(0, 3).map((entry) => entry.text);
  const maxExamSignal = ranked[0]?.examSignalScore ?? 0;

  if (any.length === 0 || maxExamSignal < 1.4) {
    return {
      highYield: ["No strong DAT signal on this page yet."],
      traps: ["Evidence is limited; avoid overconfident trap claims."],
      hiddenConnections: [],
      whatYouMayMiss: ["Try a content-rich teaching page for stronger exam cues."],
      dat: {
        testedConcepts: [],
        likelyQuestionAngles: [],
        commonTraps: [],
        mustKnowTerms: [],
        distinctionPairs: [],
        fastRecall: [],
        mechanismAnchor: [],
      },
    };
  }

  const dat = {
    testedConcepts: extractTerms(any, 6),
    likelyQuestionAngles: examish.length ? examish.slice(0, 3) : any.slice(0, 3),
    commonTraps: groundedTrapLines.length ? groundedTrapLines : [
      classification.pageType === "clinical" ? "Confusing similar clinical patterns" : "Choosing the wrong rule from look-alike options",
    ],
    mustKnowTerms: extractTerms(clinical.length ? clinical : any, 6),
    distinctionPairs: comparison.length ? comparison.slice(0, 3) : ["No grounded distinction pair found yet"],
    fastRecall: any.slice(0, 3).map((line) => line.length > 120 ? `${line.slice(0, 117)}...` : line),
    applicationCue: examish.slice(0, 3),
    mechanismAnchor: mechanismAnchors,
  };

  if (classification.pageType === "formula") {
    dat.commonTraps[0] = "Sign and substitution errors in algebraic manipulation";
  }

  return {
    highYield: any.slice(0, mode?.label === "student" ? 3 : 5),
    traps: dat.commonTraps,
    hiddenConnections: classification.pageType === "clinical" ? clinical.slice(0, 3) : any.slice(1, 4),
    whatYouMayMiss: ["Discriminating terms in stem language", "Condition or exception clauses"],
    dat,
  };
}
